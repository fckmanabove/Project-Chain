import uuid
from datetime import datetime
from typing import Any, Dict
from fastapi import HTTPException
from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from app.models.audit import AuditLog
from sqlalchemy import delete
from app.models.auth import User
from app.models.project import PortfolioProject
from app.models.task import PortfolioTask, TaskStatus, TaskType
from app.models.dependency import TaskDependency
from app.models.diary import DiaryEntry
from app.models.snapshot import TaskSnapshot
from app.services.audit_service import AuditService


def coerce_val(val: Any) -> Any:
    """Приводит ISO-дату к объекту date при откате полей."""
    if isinstance(val, str) and len(val) == 10 and val[4] == "-" and val[7] == "-":
        try:
            return datetime.strptime(val, "%Y-%m-%d").date()
        except ValueError:
            pass
    return val


class RollbackService:
    """Движок отката изменений (Undo) и восстановления сущностей (Undelete)."""

    @staticmethod
    async def rollback_log(db: AsyncSession, log_id: uuid.UUID, user: User) -> Dict[str, Any]:
        stmt = select(AuditLog).where(AuditLog.id == log_id)
        res = await db.execute(stmt)
        log_entry = res.scalar_one_or_none()

        if not log_entry:
            raise HTTPException(status_code=404, detail="Запись аудита не найдена")
        if log_entry.is_reverted:
            raise HTTPException(status_code=400, detail="Данное действие уже было отменено ранее")

        entity_type = log_entry.entity_type
        action = log_entry.action

        # 0. Откат массового импорта книги Excel (EXCEL_IMPORT): удаление созданных и восстановление измененных
        if entity_type == "EXCEL_IMPORT" or action == "IMPORT":
            b = log_entry.before_state or {}
            created_ids_raw = b.get("created_task_ids", [])
            created_ids = [uuid.UUID(tid) for tid in created_ids_raw if tid]
            updated_map = b.get("updated_tasks", {})

            # 1. Каскадно удаляем созданные задачи
            if created_ids:
                await db.execute(delete(TaskDependency).where(
                    (TaskDependency.predecessor_task_id.in_(created_ids)) |
                    (TaskDependency.successor_task_id.in_(created_ids))
                ))
                await db.execute(delete(DiaryEntry).where(DiaryEntry.task_id.in_(created_ids)))
                await db.execute(delete(TaskSnapshot).where(TaskSnapshot.task_id.in_(created_ids)))
                await db.execute(delete(PortfolioTask).where(PortfolioTask.id.in_(created_ids)))

            # 2. Возвращаем исходные параметры обновленных задач
            for t_id_str, old_snap in updated_map.items():
                try:
                    t_uuid = uuid.UUID(t_id_str)
                except Exception:
                    continue
                t_obj = await db.get(PortfolioTask, t_uuid)
                if t_obj and isinstance(old_snap, dict):
                    for col, val in old_snap.items():
                        if hasattr(t_obj, col):
                            setattr(t_obj, col, coerce_val(val))

            log_entry.is_reverted = True
            await AuditService.record_action(
                db=db,
                entity_type="EXCEL_IMPORT",
                entity_id=log_entry.entity_id,
                action="ROLLBACK",
                user=user,
                entity_name=log_entry.entity_name,
                summary=(
                    f"Откат импорта книги '{log_entry.entity_name}': удалено {len(created_ids)} "
                    f"созданных задач, восстановлено {len(updated_map)} задач"
                ),
                before_state=log_entry.after_state,
                after_state=log_entry.before_state,
            )
            await db.commit()
            return {
                "status": "ok",
                "message": (
                    f"Откат импорта Excel '{log_entry.entity_name}' успешно выполнен: удалено {len(created_ids)} "
                    f"созданных задач, восстановлено {len(updated_map)} задач."
                ),
                "reverted_log_id": str(log_id),
            }

        # 1. Откат UPDATE: возвращаем исходные значения полей
        if action == "UPDATE" and log_entry.before_state:
            if entity_type == "TASK":
                t_stmt = select(PortfolioTask).where(PortfolioTask.id == uuid.UUID(log_entry.entity_id))
                t_res = await db.execute(t_stmt)
                task = t_res.scalar_one_or_none()
                if not task:
                    raise HTTPException(status_code=404, detail="Целевая задача для отката не найдена в БД")
                for k, v in log_entry.before_state.items():
                    if hasattr(task, k):
                        setattr(task, k, coerce_val(v))

            elif entity_type == "PROJECT":
                p_stmt = select(PortfolioProject).where(PortfolioProject.id == uuid.UUID(log_entry.entity_id))
                p_res = await db.execute(p_stmt)
                proj = p_res.scalar_one_or_none()
                if not proj:
                    raise HTTPException(status_code=404, detail="Целевой проект для отката не найден в БД")

                # Поддержка легаси-слепков задач проекта
                first_val = next(iter(log_entry.before_state.values()), None)
                if isinstance(first_val, dict) and "wbs_code" in first_val:
                    p_tasks = (await db.execute(select(PortfolioTask).where(PortfolioTask.project_id == proj.id))).scalars().all()
                    task_wbs_map = {t.wbs_code: t for t in p_tasks}
                    for wbs, old_t_snap in log_entry.before_state.items():
                        target_t = task_wbs_map.get(wbs)
                        if target_t and isinstance(old_t_snap, dict):
                            for col, val in old_t_snap.items():
                                if hasattr(target_t, col):
                                    setattr(target_t, col, coerce_val(val))
                else:
                    for k, v in log_entry.before_state.items():
                        if hasattr(proj, k):
                            setattr(proj, k, coerce_val(v))

            elif entity_type == "USER":
                u_stmt = select(User).where(User.id == uuid.UUID(log_entry.entity_id))
                u_res = await db.execute(u_stmt)
                target_user = u_res.scalar_one_or_none()
                if not target_user:
                    raise HTTPException(status_code=404, detail="Целевой пользователь для отката не найден в БД")
                for k, v in log_entry.before_state.items():
                    if hasattr(target_user, k):
                        setattr(target_user, k, coerce_val(v))

        # 2. Откат DELETE (Undelete): воскрешаем сущность со всеми свойствами
        elif action == "DELETE" and log_entry.before_state:
            b = log_entry.before_state
            if entity_type == "TASK":
                restored_task = PortfolioTask(
                    id=uuid.UUID(log_entry.entity_id),
                    project_id=uuid.UUID(b["project_id"]),
                    wbs_code=b["wbs_code"],
                    name=b["name"],
                    planned_duration=b.get("planned_duration", 1),
                    planned_start=coerce_val(b.get("planned_start")),
                    planned_finish=coerce_val(b.get("planned_finish")),
                    actual_start=coerce_val(b.get("actual_start")),
                    actual_finish=coerce_val(b.get("actual_finish")),
                    progress_percent=b.get("progress_percent", 0.0),
                    raci_assignee=b.get("raci_assignee"),
                    raci_approver=b.get("raci_approver"),
                    custom_attributes=b.get("custom_attributes", {}),
                )
                db.add(restored_task)

            elif entity_type == "USER":
                u_stmt = select(User).where(User.id == uuid.UUID(log_entry.entity_id))
                u_res = await db.execute(u_stmt)
                if not u_res.scalar_one_or_none():
                    restored_user = User(
                        id=uuid.UUID(log_entry.entity_id),
                        email=b["email"],
                        hashed_password=b["hashed_password"],
                        full_name=b["full_name"],
                        position=b.get("position"),
                        role_id=b.get("role_id", "PM"),
                        custom_permissions=b.get("custom_permissions", {}),
                        is_active=b.get("is_active", True),
                        is_verified=b.get("is_verified", True),
                    )
                    db.add(restored_user)

        # 3. Откат CREATE: удаляем ошибочно созданный объект
        elif action == "CREATE":
            if entity_type == "TASK":
                t_stmt = select(PortfolioTask).where(PortfolioTask.id == uuid.UUID(log_entry.entity_id))
                t_res = await db.execute(t_stmt)
                task = t_res.scalar_one_or_none()
                if task:
                    await db.delete(task)
            elif entity_type == "USER":
                u_stmt = select(User).where(User.id == uuid.UUID(log_entry.entity_id))
                u_res = await db.execute(u_stmt)
                user_to_del = u_res.scalar_one_or_none()
                if user_to_del:
                    await db.delete(user_to_del)

        # Фиксируем откат в Time Machine
        log_entry.is_reverted = True
        await AuditService.record_action(
            db=db,
            entity_type=entity_type,
            entity_id=log_entry.entity_id,
            action="ROLLBACK",
            user=user,
            entity_name=log_entry.entity_name,
            summary=f"Откат [{log_entry.action}] от {log_entry.created_at.strftime('%d.%m.%Y %H:%M')}: {log_entry.summary}",
            before_state=log_entry.after_state,
            after_state=log_entry.before_state,
        )

        await db.commit()
        return {
            "status": "ok",
            "message": f"Откат действия {action} над {entity_type} успешно выполнен",
            "reverted_log_id": str(log_id),
        }