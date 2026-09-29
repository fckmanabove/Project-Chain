"""
REST Endpoints for Tasks, WBS Hierarchy, and Live Locks.
"""

from typing import List, Optional
from uuid import UUID
from fastapi import APIRouter, Depends, HTTPException, status
from pydantic import BaseModel
from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy.orm import selectinload
from redis.asyncio import Redis

from app.api.deps import get_db, get_current_user, require_permission
from app.models.auth import User
from app.core.redis import get_redis_client
from app.models.task import PortfolioTask, TaskStatus, TaskType
from app.services.audit_service import AuditService, extract_model_snapshot, generate_diff_summary
from app.models.dependency import TaskDependency
from app.schemas.task import TaskCreate, TaskUpdate, TaskResponse
from app.services.lock_manager import DistributedLockManager

router = APIRouter(tags=["Tasks"])


class LockRequest(BaseModel):
    owner_id: str
    ttl_seconds: int = 30


@router.get("/tasks", response_model=List[TaskResponse])
@router.get("/projects/{project_id}/tasks", response_model=List[TaskResponse])
async def list_project_tasks(
    project_id: Optional[UUID] = None,
    db: AsyncSession = Depends(get_db),
    current_user: User = Depends(require_permission("tasks:view")),
):
    """Пакетное получение задач со связями CPM за 1 оптимизированный SQL-запрос."""
    stmt = (
        select(PortfolioTask)
        .options(selectinload(PortfolioTask.predecessor_links))
        .order_by(PortfolioTask.project_id, PortfolioTask.wbs_code)
    )
    if project_id:
        stmt = stmt.where(PortfolioTask.project_id == project_id)
    res = await db.execute(stmt)
    return res.scalars().all()


@router.post("/projects/{project_id}/tasks", response_model=TaskResponse, status_code=status.HTTP_201_CREATED)
async def create_task(
    project_id: UUID, payload: TaskCreate, db: AsyncSession = Depends(get_db)
):
    """Создать новую задачу в проекте."""
    parent_wbs = payload.wbs_code.rsplit(".", 1)[0] if "." in payload.wbs_code else None
    level = len(payload.wbs_code.split("."))

    task = PortfolioTask(
        project_id=project_id,
        wbs_code=payload.wbs_code,
        parent_wbs=parent_wbs,
        level=level,
        name=payload.name,
        task_type=payload.task_type,
        status=payload.status,
        planned_duration=payload.planned_duration,
        planned_start=payload.planned_start,
        planned_finish=payload.planned_finish,
        actual_start=payload.actual_start,
        actual_finish=payload.actual_finish,
        progress_percent=payload.progress_percent,
        raci_assignee=payload.raci_assignee,
        raci_approver=payload.raci_approver,
        raci_consulted=payload.raci_consulted,
        raci_informed=payload.raci_informed,
        custom_attributes=payload.custom_attributes,
    )
    db.add(task)
    await db.flush()

    # Добавляем связи
    for dep in payload.dependencies:
        link = TaskDependency(
            predecessor_task_id=dep.predecessor_task_id,
            successor_task_id=task.id,
            dependency_type=dep.dependency_type,
            lag_days=dep.lag_days,
        )
        db.add(link)

    await db.commit()

    # Загружаем со связями
    stmt = select(PortfolioTask).where(PortfolioTask.id == task.id).options(selectinload(PortfolioTask.predecessor_links))
    res = await db.execute(stmt)
    return res.scalar_one()


@router.patch("/tasks/{task_id}", response_model=TaskResponse)
async def update_task(
    task_id: UUID,
    payload: TaskUpdate,
    db: AsyncSession = Depends(get_db),
    current_user: User = Depends(require_permission("tasks:edit")),
):
    """Обновление задачи с соблюдением бизнес-правила автоблокировки плана при наличии факта."""
    stmt = select(PortfolioTask).where(PortfolioTask.id == task_id).options(selectinload(PortfolioTask.predecessor_links))
    res = await db.execute(stmt)
    task = res.scalar_one_or_none()
    if not task:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Задача не найдена")

    update_data = payload.model_dump(exclude_unset=True)

    # Бизнес-правило MVP DNA: если факт зафиксирован, плановые даты блокируются
    if task.actual_start is not None or "actual_start" in update_data:
        task.is_plan_locked = True
        if "planned_start" in update_data and update_data.get("planned_start") != task.planned_start:
            raise HTTPException(
                status_code=status.HTTP_400_BAD_REQUEST,
                detail="Плановые даты заблокированы, так как задача уже начата/завершена фактически (MVP DNA)",
            )

    # Time Machine: Снимок состояния ДО изменения
    before_state = extract_model_snapshot(task)

    for field, val in update_data.items():
        setattr(task, field, val)

    # Time Machine: Снимок состояния ПОСЛЕ изменения и фиксация дельты
    after_state = extract_model_snapshot(task)
    diff_before, diff_after, summary = generate_diff_summary(before_state, after_state)

    if diff_before:
        await AuditService.record_action(
            db=db,
            entity_type="TASK",
            entity_id=str(task.id),
            action="UPDATE",
            user=current_user,
            entity_name=f"[{task.wbs_code}] {task.name}",
            summary=summary,
            before_state=diff_before,
            after_state=diff_after,
        )

    await db.commit()
    await db.refresh(task)
    return task


@router.delete("/tasks/{task_id}", status_code=status.HTTP_204_NO_CONTENT)
async def delete_task(
    task_id: UUID,
    db: AsyncSession = Depends(get_db),
    current_user: User = Depends(require_permission("tasks:delete")),
):
    """Удаление задачи с сохранением слепка для 1-клик Undelete."""
    task = await db.get(PortfolioTask, task_id)
    if not task:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Задача не найдена")

    # Time Machine: Сохраняем полный слепок для восстановления из корзины
    before_state = extract_model_snapshot(task)
    await AuditService.record_action(
        db=db,
        entity_type="TASK",
        entity_id=str(task.id),
        action="DELETE",
        user=current_user,
        entity_name=f"[{task.wbs_code}] {task.name}",
        summary=f"Удаление задачи [{task.wbs_code}] '{task.name}'",
        before_state=before_state,
    )

    await db.delete(task)
    await db.commit()


# --- Live Locks (Redis) ---

@router.post("/tasks/{task_id}/lock")
async def lock_task(
    task_id: UUID,
    payload: LockRequest,
    redis: Redis = Depends(get_redis_client),
):
    """Захват 'живой блокировки' задачи для редактирования."""
    lock_mgr = DistributedLockManager(redis)
    acquired = await lock_mgr.acquire_lock(
        resource_type="task",
        resource_id=task_id,
        owner_id=payload.owner_id,
        ttl_seconds=payload.ttl_seconds,
    )
    if not acquired:
        info = await lock_mgr.get_lock_info("task", task_id)
        raise HTTPException(
            status_code=status.HTTP_423_LOCKED,
            detail=f"Задача уже редактируется пользователем '{info.owner_id}' (осталось {info.ttl_seconds}s)",
        )
    return {"status": "locked", "task_id": str(task_id), "owner_id": payload.owner_id}


@router.post("/tasks/{task_id}/unlock")
async def unlock_task(
    task_id: UUID,
    payload: LockRequest,
    redis: Redis = Depends(get_redis_client),
):
    """Освобождение блокировки задачи."""
    lock_mgr = DistributedLockManager(redis)
    released = await lock_mgr.release_lock("task", task_id, payload.owner_id)
    return {"status": "unlocked" if released else "lock_mismatch", "task_id": str(task_id)}