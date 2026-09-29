"""
REST Endpoints for Project Passports, CPM Recalculation, and Universal Excel Bridge.
"""

import os
import re
import io
import secrets
import tempfile
import shutil
from typing import List, Optional, Any
from uuid import UUID
from datetime import date, datetime

import openpyxl
from fastapi import APIRouter, Depends, HTTPException, status, Query, Header, UploadFile, File
from fastapi.responses import StreamingResponse
from sqlalchemy import select, delete
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy.orm import selectinload

from app.api.deps import get_db, get_current_user, require_permission
from app.models.auth import User
from app.models.project import PortfolioProject, ProjectStatus
from app.models.task import PortfolioTask, TaskStatus, TaskType
from app.models.dependency import TaskDependency, DependencyType
from app.models.diary import DiaryEntry, DiaryEntryType
from app.models.snapshot import TaskSnapshot
from app.schemas.project import ProjectCreate, ProjectUpdate, ProjectResponse
from app.services.cpm.engine import CPMEngine
from app.services.cpm.types import CPMNode, CPMEdge
from app.services.cpm.calendar import WorkCalendar
from parser.src.migrator import ProjectMigrator

router = APIRouter(prefix="/projects", tags=["Projects"])


def coerce_date(val: Any, default_date: Optional[date] = None) -> date:
    if val is None or str(val).strip() in ("", "None", "nan"):
        return default_date or date.today()
    if isinstance(val, datetime):
        return val.date()
    if isinstance(val, date):
        return val
    if isinstance(val, str):
        for fmt in ("%Y-%m-%d", "%d.%m.%Y", "%Y/%m/%d", "%d/%m/%Y", "%Y-%m-%d %H:%M:%S"):
            try:
                return datetime.strptime(val.strip(), fmt).date()
            except ValueError:
                pass
    return default_date or date.today()


@router.get("", response_model=List[ProjectResponse])
async def list_projects(
    status_filter: Optional[ProjectStatus] = None,
    search: Optional[str] = None,
    db: AsyncSession = Depends(get_db),
    current_user: User = Depends(require_permission("projects:view")),
):
    """Список всех проектов с фильтрацией по статусу и поиском."""
    query = select(PortfolioProject).order_by(PortfolioProject.created_at.desc())
    if status_filter:
        query = query.where(PortfolioProject.status == status_filter)
    if search:
        query = query.where(
            (PortfolioProject.code.ilike(f"%{search}%")) |
            (PortfolioProject.name.ilike(f"%{search}%"))
        )
    result = await db.execute(query)
    return result.scalars().all()


@router.post("", response_model=ProjectResponse, status_code=status.HTTP_201_CREATED)
async def create_project(payload: ProjectCreate, db: AsyncSession = Depends(get_db)):
    """Создание нового паспорта проекта."""
    existing = await db.execute(select(PortfolioProject).where(PortfolioProject.code == payload.code))
    if existing.scalar_one_or_none():
        raise HTTPException(
            status_code=status.HTTP_409_CONFLICT,
            detail=f"Проект с шифром '{payload.code}' уже существует",
        )
    project = PortfolioProject(**payload.model_dump())
    db.add(project)
    await db.commit()
    await db.refresh(project)
    return project


# ========================================================================
# СТАТИЧЕСКИЕ МАРШРУТЫ EXCEL МОСТА (ОБЯЗАТЕЛЬНО ОБЪЯВЛЯЮТСЯ ДО /{project_id})
# ========================================================================

from fastapi import Form
import json
from parser.src.excel_parser import ExcelSmartTableParser


@router.post("/import-excel/preview")
async def preview_excel_import(
    file: UploadFile = File(...),
    db: AsyncSession = Depends(get_db),
    current_user: User = Depends(require_permission("excel:bridge")),
):
    """
    Интерактивный расчёт дельты (Diff Preview):
    Сравнивает задачи из Excel с PostgreSQL, скрывает идентичные строки
    и возвращает список только реальных изменений для утверждения пользователем.
    """
    if not file.filename.lower().endswith((".xlsx", ".xlsm")):
        raise HTTPException(status_code=400, detail="Поддерживаются только форматы .xlsx и .xlsm")

    suffix = ".xlsm" if file.filename.lower().endswith(".xlsm") else ".xlsx"
    with tempfile.NamedTemporaryFile(delete=False, suffix=suffix) as tmp:
        shutil.copyfileobj(file.file, tmp)
        tmp_path = tmp.name

    try:
        parser = ExcelSmartTableParser()
        package = parser.parse_file(tmp_path)

        # 1. Группируем задачи файла по проектам
        tasks_by_proj: Dict[str, List[Any]] = {}
        for p_task in package.tasks:
            attrs = p_task.custom_attributes or {}
            p_code = None
            for key in ("проект", "project", "код проекта", "код"):
                if key in attrs and attrs[key]:
                    p_code = str(attrs[key]).strip().upper()
                    break
            if not p_code:
                p_code = package.passport.code.strip().upper()
            tasks_by_proj.setdefault(p_code, []).append(p_task)

        # 2. Подгружаем существующие проекты и их задачи из БД
        proj_codes = list(tasks_by_proj.keys())
        db_projs = (
            await db.execute(
                select(PortfolioProject)
                .options(selectinload(PortfolioProject.tasks))
                .where(PortfolioProject.code.in_(proj_codes))
            )
        ).scalars().all()
        db_proj_map = {p.code: p for p in db_projs}

        changes = []
        unchanged_count = 0

        # Форматирование даты в читаемый вид ДД.ММ.ГГГГ
        def fmt_d(d):
            return d.strftime("%d.%m.%Y") if d else "—"

        # 3. Построчное сравнение каждого этапа
        for p_code, p_tasks in tasks_by_proj.items():
            db_proj = db_proj_map.get(p_code)
            db_task_map = {t.wbs_code: t for t in db_proj.tasks} if db_proj else {}

            for t in p_tasks:
                key = f"{p_code}|{t.wbs_code}"
                db_task = db_task_map.get(t.wbs_code)

                if not db_task:
                    # Новая задача в плане
                    changes.append({
                        "key": key,
                        "project_code": p_code,
                        "wbs_code": t.wbs_code,
                        "task_name": t.name,
                        "change_type": "CREATE",
                        "diff_summary": f"Новый этап: [{t.wbs_code}] {t.name} (План: {fmt_d(t.planned_start)} — {fmt_d(t.planned_finish)}, {t.duration_days} дн.)",
                        "old_values": None,
                        "new_values": {
                            "name": t.name,
                            "duration": t.duration_days,
                            "planned_start": fmt_d(t.planned_start),
                            "planned_finish": fmt_d(t.planned_finish),
                            "assignee": t.raci_assignee or "—",
                        }
                    })
                else:
                    # Задача уже существует: сверяем атрибуты
                    diffs = []
                    old_vals = {}
                    new_vals = {}

                    if db_task.name.strip() != t.name.strip():
                        diffs.append(f"Название: '{db_task.name}' ➔ '{t.name}'")
                        old_vals["name"] = db_task.name
                        new_vals["name"] = t.name

                    if db_task.planned_duration != t.duration_days:
                        diffs.append(f"Длительность: {db_task.planned_duration} ➔ {t.duration_days} дн.")
                        old_vals["duration"] = db_task.planned_duration
                        new_vals["duration"] = t.duration_days

                    if db_task.planned_start != t.planned_start:
                        diffs.append(f"Старт: {fmt_d(db_task.planned_start)} ➔ {fmt_d(t.planned_start)}")
                        old_vals["planned_start"] = fmt_d(db_task.planned_start)
                        new_vals["planned_start"] = fmt_d(t.planned_start)

                    if db_task.planned_finish != t.planned_finish:
                        diffs.append(f"Финиш: {fmt_d(db_task.planned_finish)} ➔ {fmt_d(t.planned_finish)}")
                        old_vals["planned_finish"] = fmt_d(db_task.planned_finish)
                        new_vals["planned_finish"] = fmt_d(t.planned_finish)

                    db_asg = (db_task.raci_assignee or "").strip()
                    file_asg = (t.raci_assignee or "").strip()
                    if file_asg and db_asg != file_asg:
                        diffs.append(f"Ответственный: {db_asg or '—'} ➔ {file_asg}")
                        old_vals["assignee"] = db_asg or "—"
                        new_vals["assignee"] = file_asg

                    if not diffs:
                        # Идентичная задача — пропускаем и не выводим
                        unchanged_count += 1
                    else:
                        changes.append({
                            "key": key,
                            "project_code": p_code,
                            "wbs_code": t.wbs_code,
                            "task_name": t.name,
                            "change_type": "UPDATE",
                            "diff_summary": "; ".join(diffs),
                            "old_values": old_vals,
                            "new_values": new_vals,
                        })

        return {
            "status": "success",
            "source_filename": file.filename,
            "total_in_file": len(package.tasks),
            "unchanged_count": unchanged_count,
            "changed_count": len(changes),
            "changes": changes,
        }
    finally:
        if os.path.exists(tmp_path):
            os.remove(tmp_path)


@router.post("/import-excel/apply")
async def apply_excel_import(
    file: UploadFile = File(...),
    approved_keys_json: str = Form("[]"),
    db: AsyncSession = Depends(get_db),
    current_user: User = Depends(require_permission("excel:bridge")),
):
    """
    Выборочное применение: обновляет в базе данных ТОЛЬКО те задачи,
    которые пользователь утвердил галочками в предпросмотре.
    """
    try:
        approved_keys = set(json.loads(approved_keys_json))
    except Exception:
        approved_keys = set()

    suffix = ".xlsm" if file.filename.lower().endswith(".xlsm") else ".xlsx"
    with tempfile.NamedTemporaryFile(delete=False, suffix=suffix) as tmp:
        shutil.copyfileobj(file.file, tmp)
        tmp_path = tmp.name

    try:
        parser = ExcelSmartTableParser()
        package = parser.parse_file(tmp_path)

        # Если передан список утверждённых ключей — фильтруем задачи
        if approved_keys:
            filtered_tasks = []
            for t in package.tasks:
                attrs = t.custom_attributes or {}
                p_code = None
                for key in ("проект", "project", "код проекта", "код"):
                    if key in attrs and attrs[key]:
                        p_code = str(attrs[key]).strip().upper()
                        break
                if not p_code:
                    p_code = package.passport.code.strip().upper()

                if f"{p_code}|{t.wbs_code}" in approved_keys:
                    filtered_tasks.append(t)
            package.tasks = filtered_tasks

        if not package.tasks:
            return {"status": "success", "message": "Нет выбранных задач для обновления", "applied_count": 0}

        migrator = ProjectMigrator(db)
        project = await migrator.save_project_package(package, user=current_user)

        return {
            "status": "success",
            "applied_count": len(package.tasks),
            "message": f"Успешно применено изменений: {len(package.tasks)} задач. Создан слепок в Time Machine.",
            "project_id": str(project.id),
        }
    finally:
        if os.path.exists(tmp_path):
            os.remove(tmp_path)


@router.post("/import-excel")
async def import_excel_universal(
    file: UploadFile = File(...),
    db: AsyncSession = Depends(get_db),
    current_user: User = Depends(require_permission("excel:bridge")),
):
    """
    Универсальный импорт книг Excel (.xlsx / .xlsm):
    - Если в файле есть лист дневника ('ошибки', 'дневник') -> импортирует цеховой дневник.
    - Если это книга проекта или сводного портфеля -> обновляет паспорт, задачи и CPM.
    """
    if not file.filename.lower().endswith((".xlsx", ".xlsm")):
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail="Поддерживаются только форматы .xlsx и .xlsm",
        )

    suffix = ".xlsm" if file.filename.lower().endswith(".xlsm") else ".xlsx"
    with tempfile.NamedTemporaryFile(delete=False, suffix=suffix) as tmp:
        shutil.copyfileobj(file.file, tmp)
        tmp_path = tmp.name

    try:
        wb = openpyxl.load_workbook(tmp_path, data_only=True)
        sheet_names_lower = [s.lower() for s in wb.sheetnames]

        # 1. Проверяем, является ли файл Дневником (листы 'ошибки' или 'дневник')
        is_diary_file = any(k in sheet_names_lower for k in ("ошибки", "дневник", "интеграция ima", "фрезеровки и бд"))
        has_project_sheets = any(k in sheet_names_lower for k in ("03_m06_данные", "02_портфельэтапов", "план-график", "проекты"))

        if is_diary_file and not has_project_sheets:
            # Выполняем точный импорт дневника
            from app.api.v1.endpoints.diary import import_diary_excel
            # Передаём файл в обработчик дневника
            file.file.seek(0)
            res = await import_diary_excel(file=file, project_id=None, db=db, current_user=current_user)
            wb.close()
            return res

        wb.close()

        # 2. Если файл содержит графики и проекты — импортируем через мигратор с созданием точки отката
        migrator = ProjectMigrator(db)
        project = await migrator.migrate_file(tmp_path, user=current_user)
        return {
            "status": "success",
            "message": f"Проект [{project.code}] '{project.name}' успешно импортирован из Excel",
            "project_id": str(project.id),
        }
    except HTTPException:
        raise
    except Exception as e:
        raise HTTPException(
            status_code=status.HTTP_422_UNPROCESSABLE_ENTITY,
            detail=f"Ошибка обработки книги Excel: {str(e)}",
        )
    finally:
        if os.path.exists(tmp_path):
            os.remove(tmp_path)


@router.get("/export-excel")
async def export_portfolio_m06_excel(
    db: AsyncSession = Depends(get_db),
    current_user: User = Depends(require_permission("projects:view")),
):
    """
    Экспорт базы в настоящий .xlsx файл по эталонному формату таблицы tblM06Data (лист 03_M06_Данные).
    Строки можно напрямую копировать и вставлять в файл Портфель_проектов.xlsm.
    """
    wb = openpyxl.Workbook()
    ws = wb.active
    ws.title = "03_M06_Данные"

    # Заголовки точь-в-точь по структуре tblM06Data из отчёта инспекции
    headers = [
        "Проект", "ID", "Порядок источника", "Ответственный", "Этап/задача",
        "Плановая дата начала", "Плановая длительность", "Плановая дата окончания",
        "Фактическая дата начала", "Фактическая длительность", "Фактическая дата окончания",
        "Статус", "Total Float", "Критическая", "Pyrus URL"
    ]
    ws.append(headers)

    # Стилизация строки заголовка
    header_fill = openpyxl.styles.PatternFill(start_color="1F4E79", end_color="1F4E79", fill_type="solid")
    header_font = openpyxl.styles.Font(name="Calibri", size=11, bold=True, color="FFFFFF")
    for col_idx in range(1, len(headers) + 1):
        cell = ws.cell(row=1, column=col_idx)
        cell.fill = header_fill
        cell.font = header_font
        cell.alignment = openpyxl.styles.Alignment(horizontal="center", vertical="center")

    # Выгрузка всех проектов и задач
    proj_stmt = select(PortfolioProject).options(selectinload(PortfolioProject.tasks)).order_by(PortfolioProject.code)
    projects = (await db.execute(proj_stmt)).scalars().all()

    for proj in projects:
        for t in proj.tasks:
            clean_wbs = t.wbs_code.replace(f"{proj.code}.", "")
            status_symbol = "✓" if (t.status == TaskStatus.COMPLETED or t.progress_percent >= 100) else ("В работе" if t.status == TaskStatus.IN_PROGRESS else "Не начато")
            pyrus_url = t.custom_attributes.get("pyrus_url", "") if t.custom_attributes else ""
            
            # Фактическая длительность
            act_dur = ""
            if t.actual_start and t.actual_finish:
                act_dur = (t.actual_finish - t.actual_start).days + 1
            elif t.status == TaskStatus.COMPLETED:
                act_dur = t.planned_duration

            row_data = [
                proj.code,
                clean_wbs,
                t.sort_order,
                t.raci_assignee or "",
                t.name,
                t.planned_start.strftime("%Y-%m-%d") if t.planned_start else "",
                t.planned_duration,
                t.planned_finish.strftime("%Y-%m-%d") if t.planned_finish else "",
                t.actual_start.strftime("%Y-%m-%d") if t.actual_start else "",
                act_dur,
                t.actual_finish.strftime("%Y-%m-%d") if t.actual_finish else "",
                status_symbol,
                t.total_float,
                "ДА" if t.is_critical else "НЕТ",
                pyrus_url
            ]
            ws.append(row_data)

    # Автоматическая ширина колонок
    for col in ws.columns:
        max_len = max(len(str(cell.value or "")) for cell in col)
        col_letter = openpyxl.utils.get_column_letter(col[0].column)
        ws.column_dimensions[col_letter].width = max(max_len + 3, 12)

    output = io.BytesIO()
    wb.save(output)
    output.seek(0)

    filename = f"Portfolio_03_M06_Data_{date.today().strftime('%Y%m%d')}.xlsx"
    return StreamingResponse(
        output,
        media_type="application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
        headers={"Content-Disposition": f"attachment; filename={filename}"}
    )


# =============================================================================
# ДИНАМИЧЕСКИЕ МАРШРУТЫ ПО ИДЕНТИФИКАТОРУ ПРОЕКТА /{project_id}
# =============================================================================

@router.get("/{project_id}", response_model=ProjectResponse)
async def get_project(
    project_id: UUID,
    db: AsyncSession = Depends(get_db),
    current_user: User = Depends(require_permission("projects:view")),
):
    """Получение паспорта проекта по UUID."""
    project = await db.get(PortfolioProject, project_id)
    if not project:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Проект не найден")
    return project


@router.patch("/{project_id}", response_model=ProjectResponse)
async def update_project(
    project_id: UUID, payload: ProjectUpdate, db: AsyncSession = Depends(get_db)
):
    """Обновление полей паспорта проекта."""
    project = await db.get(PortfolioProject, project_id)
    if not project:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Проект не найден")

    update_data = payload.model_dump(exclude_unset=True)
    for field, val in update_data.items():
        setattr(project, field, val)

    await db.commit()
    await db.refresh(project)
    return project


@router.delete("/{project_id}", status_code=status.HTTP_200_OK)
async def delete_project_secured(
    project_id: UUID,
    db: AsyncSession = Depends(get_db),
    x_delete_passcode: str = Header(..., alias="X-Delete-Passcode"),
):
    """
    Удаление проекта с каскадной очисткой, защищенное мастер-паролем сервера.
    """
    server_master_key = os.getenv("PROJECT_DELETE_SECRET", "prochain_root_kill_switch_2026")
    if not secrets.compare_digest(x_delete_passcode, server_master_key):
        raise HTTPException(
            status_code=status.HTTP_403_FORBIDDEN,
            detail="Доступ заблокирован: неверный мастер-пароль подтверждения удаления!"
        )

    stmt = select(PortfolioProject).where(PortfolioProject.id == project_id)
    res = await db.execute(stmt)
    project = res.scalar_one_or_none()
    if not project:
        raise HTTPException(status_code=404, detail="Проект не найден")

    task_ids_stmt = select(PortfolioTask.id).where(PortfolioTask.project_id == project_id)
    task_res = await db.execute(task_ids_stmt)
    task_ids = task_res.scalars().all()

    if task_ids:
        await db.execute(delete(TaskDependency).where(
            (TaskDependency.predecessor_task_id.in_(task_ids)) | 
            (TaskDependency.successor_task_id.in_(task_ids))
        ))
        await db.execute(delete(DiaryEntry).where(DiaryEntry.task_id.in_(task_ids)))
        await db.execute(delete(TaskSnapshot).where(TaskSnapshot.task_id.in_(task_ids)))
        await db.execute(delete(PortfolioTask).where(PortfolioTask.project_id == project_id))

    await db.execute(delete(PortfolioProject).where(PortfolioProject.id == project_id))
    await db.commit()

    return {"status": "success", "message": f"Проект [{project.code}] и все связанные данные успешно удалены."}


@router.post("/{project_id}/recalculate", tags=["CPM Engine"])
async def recalculate_project_cpm(
    project_id: UUID,
    db: AsyncSession = Depends(get_db),
    current_user: User = Depends(require_permission("cpm:recalculate")),
):
    """
    Ручной запуск пересчета графа проекта методом критического пути (CPM Engine).
    """
    project = await db.get(PortfolioProject, project_id)
    if not project:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Проект не найден")

    stmt = (
        select(PortfolioTask)
        .where(PortfolioTask.project_id == project_id)
        .options(selectinload(PortfolioTask.predecessor_links))
        .order_by(PortfolioTask.wbs_code)
    )
    tasks_res = await db.execute(stmt)
    tasks = tasks_res.scalars().all()

    if not tasks:
        return {"message": "У проекта нет задач для расчета", "critical_path": []}

    cpm_nodes = [
        CPMNode(
            id=t.id,
            wbs_code=t.wbs_code,
            name=t.name,
            duration_days=t.planned_duration,
            task_type=t.task_type,
            planned_start=t.planned_start,
            planned_finish=t.planned_finish,
            actual_start=t.actual_start,
            actual_finish=t.actual_finish,
            progress_percent=t.progress_percent,
        )
        for t in tasks
    ]

    cpm_edges: List[CPMEdge] = []
    for t in tasks:
        for link in t.predecessor_links:
            cpm_edges.append(
                CPMEdge(
                    predecessor_id=link.predecessor_task_id,
                    successor_id=link.successor_task_id,
                    dependency_type=link.dependency_type,
                    lag_days=link.lag_days,
                )
            )

    engine = CPMEngine(calendar=WorkCalendar())
    cpm_result = engine.calculate(
        project_start=project.planned_start_date,
        nodes=cpm_nodes,
        edges=cpm_edges,
    )

    nodes_map = {n.id: n for n in cpm_result.tasks}
    for t in tasks:
        calc = nodes_map.get(t.id)
        if calc:
            t.early_start = calc.early_start
            t.early_finish = calc.early_finish
            t.late_start = calc.late_start
            t.late_finish = calc.late_finish
            t.total_float = calc.total_float
            t.free_float = calc.free_float
            t.is_critical = calc.is_critical

    await db.commit()

    return {
        "status": "success",
        "project_id": str(project.id),
        "calculated_start": cpm_result.project_start,
        "calculated_finish": cpm_result.project_finish,
        "total_duration_days": cpm_result.total_duration_days,
        "critical_path_wbs": cpm_result.critical_path_wbs,
        "tasks_count": len(tasks),
    }