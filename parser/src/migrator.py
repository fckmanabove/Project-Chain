"""
Сервис пакетной миграции данных из Excel в PostgreSQL с автоматическим расчетом CPM.
"""

import os
from datetime import datetime, date
from typing import Any, Dict, List, Optional
from uuid import UUID
from sqlalchemy import select, delete
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy.orm import selectinload

from app.models.auth import User
from app.services.audit_service import AuditService, extract_model_snapshot

from app.models.project import PortfolioProject, ProjectStatus
from app.models.task import PortfolioTask, TaskType, TaskStatus
from app.models.dependency import TaskDependency, DependencyType
from app.services.cpm.engine import CPMEngine
from app.services.cpm.types import CPMNode, CPMEdge
from app.services.cpm.calendar import WorkCalendar
from parser.src.excel_parser import ExcelSmartTableParser
from parser.src.schema import ParsedProjectPackage, ParsedTask


class ProjectMigrator:
    """
    Загружает распарсенные пакеты проектов в базу данных и связывает зависимости.
    """

    def __init__(self, session: AsyncSession):
        self.session = session
        self.parser = ExcelSmartTableParser()
        self.cpm_engine = CPMEngine(calendar=WorkCalendar())

    async def migrate_file(self, file_path: str, user: Optional[User] = None) -> PortfolioProject:
        """
        Парсит один Excel-файл и сохраняет проект в базу данных с фиксацией в Time Machine.
        """
        package = self.parser.parse_file(file_path)
        return await self.save_project_package(package, user=user)

    async def scan_and_migrate_directory(self, dir_path: str) -> List[PortfolioProject]:
        """
        Рекурсивно сканирует папку (Synology Drive / Local Archive) и мигрирует все файлы Excel.
        """
        if not os.path.exists(dir_path):
            raise FileNotFoundError(f"Директория архива не найдена: {dir_path}")

        migrated_projects: List[PortfolioProject] = []

        for root, _, files in os.walk(dir_path):
            for file in files:
                # Пропускаем временные файлы Excel (начинающиеся с ~$)
                if file.startswith("~$"):
                    continue
                if file.lower().endswith((".xlsx", ".xlsm")):
                    full_path = os.path.join(root, file)
                    try:
                        project = await self.migrate_file(full_path)
                        migrated_projects.append(project)
                    except Exception as e:
                        # Логируем ошибку отдельного файла и продолжаем обработку остальных
                        print(f"⚠️ Ошибка при импорте {file}: {str(e)}")

        return migrated_projects

    async def save_project_package(
        self, package: ParsedProjectPackage, user: Optional[User] = None
    ) -> PortfolioProject:
        """
        Промышленный Smart Upsert с единым атомарным снимком Time Machine:
        1. Сравнивает задачи по WBS и обновляет план без затирания факта (MVP DNA).
        2. Сохраняет существующие Pyrus-ссылки.
        3. Фиксирует единое системное событие EXCEL_IMPORT для 1-клик отката.
        """
        import uuid

        def clean_json_dict(d: Any) -> Any:
            if isinstance(d, (datetime, date)):
                return d.isoformat()
            if isinstance(d, dict):
                return {str(k): clean_json_dict(v) for k, v in d.items()}
            if isinstance(d, (list, tuple, set)):
                return [clean_json_dict(x) for x in d]
            return d

        # 1. Группируем задачи из Excel по кодам проектов
        tasks_by_proj: Dict[str, List[ParsedTask]] = {}
        for p_task in package.tasks:
            p_code = None
            attrs = p_task.custom_attributes or {}
            for key in ("проект", "project", "код проекта", "код"):
                if key in attrs and attrs[key]:
                    p_code = str(attrs[key]).strip().upper()
                    break
            if not p_code:
                p_code = package.passport.code.strip().upper()

            tasks_by_proj.setdefault(p_code, []).append(p_task)

        main_project = None
        all_created_ids: List[str] = []
        all_updated_before: Dict[str, Dict[str, Any]] = {}
        affected_project_ids: set[str] = set()
        affected_codes: set[str] = set()

        # 2. Обрабатываем каждый проект
        for proj_code, p_tasks in tasks_by_proj.items():
            affected_codes.add(proj_code)
            stmt = (
                select(PortfolioProject)
                .options(selectinload(PortfolioProject.tasks))
                .where(PortfolioProject.code == proj_code)
            )
            res = await self.session.execute(stmt)
            project = res.scalar_one_or_none()

            p_start = min((t.planned_start for t in p_tasks if t.planned_start), default=date.today())
            p_finish = max((t.planned_finish for t in p_tasks if t.planned_finish), default=date.today())

            if not project:
                p_name = package.passport.name if proj_code == package.passport.code else f"Проект {proj_code}"
                project = PortfolioProject(
                    code=proj_code,
                    name=p_name,
                    description=f"Проект {proj_code}",
                    currency="RUB",
                    planned_start_date=p_start,
                    planned_finish_date=p_finish,
                    status=ProjectStatus.EXECUTION,
                )
                self.session.add(project)
                await self.session.flush()
                existing_tasks_map = {}
            else:
                project.planned_start_date = min(project.planned_start_date, p_start)
                project.planned_finish_date = max(project.planned_finish_date, p_finish)
                existing_tasks_map = {t.wbs_code: t for t in project.tasks}

            affected_project_ids.add(str(project.id))
            if not main_project:
                main_project = project

            # 3. Smart Upsert задач
            wbs_to_task_map: Dict[str, PortfolioTask] = {}
            db_tasks: List[PortfolioTask] = []
            seen_wbs = set()

            for idx, p_task in enumerate(p_tasks, start=1):
                raw_wbs = p_task.wbs_code or f"1.{idx}"
                unique_wbs = raw_wbs
                if unique_wbs in seen_wbs:
                    unique_wbs = f"{raw_wbs}.{idx}"
                seen_wbs.add(unique_wbs)

                parent_wbs = unique_wbs.rsplit(".", 1)[0] if "." in unique_wbs else None
                level = len(unique_wbs.split("."))
                t_type = TaskType.MILESTONE if p_task.duration_days == 0 else TaskType.TASK

                existing_task = existing_tasks_map.get(unique_wbs) or existing_tasks_map.get(raw_wbs)

                if existing_task:
                    # Фиксируем состояние ДО обновления для отката
                    all_updated_before[str(existing_task.id)] = extract_model_snapshot(existing_task)

                    existing_task.name = p_task.name
                    existing_task.planned_duration = max(0, p_task.duration_days)
                    existing_task.planned_start = p_task.planned_start or existing_task.planned_start
                    existing_task.planned_finish = p_task.planned_finish or existing_task.planned_finish
                    existing_task.sort_order = idx
                    existing_task.level = level
                    existing_task.parent_wbs = parent_wbs

                    # Actuals Protection
                    if not existing_task.actual_start and p_task.actual_start:
                        existing_task.actual_start = p_task.actual_start
                    if not existing_task.actual_finish and p_task.actual_finish:
                        existing_task.actual_finish = p_task.actual_finish
                    if existing_task.progress_percent == 0 and p_task.progress_percent > 0:
                        existing_task.progress_percent = p_task.progress_percent

                    if existing_task.progress_percent >= 100 or existing_task.actual_finish:
                        existing_task.status = TaskStatus.COMPLETED
                    elif existing_task.progress_percent > 0 or existing_task.actual_start:
                        existing_task.status = TaskStatus.IN_PROGRESS

                    if p_task.raci_assignee:
                        existing_task.raci_assignee = p_task.raci_assignee

                    # Сохраняем Pyrus URL
                    merged_attrs = dict(existing_task.custom_attributes or {})
                    new_attrs = clean_json_dict(p_task.custom_attributes) or {}
                    if "pyrus_url" not in new_attrs and "pyrus_url" in merged_attrs:
                        new_attrs["pyrus_url"] = merged_attrs["pyrus_url"]
                    merged_attrs.update(new_attrs)
                    existing_task.custom_attributes = merged_attrs

                    wbs_to_task_map[unique_wbs] = existing_task
                    wbs_to_task_map[raw_wbs] = existing_task
                    db_tasks.append(existing_task)
                else:
                    t_status = TaskStatus.NOT_STARTED
                    if p_task.progress_percent >= 100.0 or p_task.actual_finish is not None:
                        t_status = TaskStatus.COMPLETED
                    elif p_task.progress_percent > 0 or p_task.actual_start is not None:
                        t_status = TaskStatus.IN_PROGRESS

                    new_task = PortfolioTask(
                        project_id=project.id,
                        wbs_code=unique_wbs,
                        parent_wbs=parent_wbs,
                        level=level,
                        sort_order=idx,
                        name=p_task.name,
                        task_type=t_type,
                        status=t_status,
                        planned_duration=max(0, p_task.duration_days),
                        planned_start=p_task.planned_start or p_start,
                        planned_finish=p_task.planned_finish or p_finish,
                        actual_start=p_task.actual_start,
                        actual_finish=p_task.actual_finish,
                        progress_percent=p_task.progress_percent,
                        is_plan_locked=p_task.actual_start is not None,
                        raci_assignee=p_task.raci_assignee,
                        raci_approver=p_task.raci_approver,
                        custom_attributes=clean_json_dict(p_task.custom_attributes),
                    )
                    self.session.add(new_task)
                    await self.session.flush()
                    all_created_ids.append(str(new_task.id))
                    wbs_to_task_map[unique_wbs] = new_task
                    wbs_to_task_map[raw_wbs] = new_task
                    db_tasks.append(new_task)

            await self.session.flush()

            # 4. Обновляем зависимости CPM
            task_ids = [t.id for t in db_tasks]
            if task_ids:
                await self.session.execute(
                    delete(TaskDependency).where(TaskDependency.successor_task_id.in_(task_ids))
                )

            cpm_edges: List[CPMEdge] = []
            for p_task in p_tasks:
                succ_task = wbs_to_task_map.get(p_task.wbs_code)
                if not succ_task:
                    continue

                for dep in p_task.dependencies:
                    pred_task = wbs_to_task_map.get(dep.predecessor_wbs)
                    if not pred_task or pred_task.id == succ_task.id:
                        continue

                    dep_type = (
                        DependencyType(dep.dependency_type.upper())
                        if dep.dependency_type.upper() in DependencyType.__members__
                        else DependencyType.FINISH_TO_START
                    )
                    dependency = TaskDependency(
                        predecessor_task_id=pred_task.id,
                        successor_task_id=succ_task.id,
                        dependency_type=dep_type,
                        lag_days=dep.lag_days,
                    )
                    self.session.add(dependency)
                    cpm_edges.append(
                        CPMEdge(
                            predecessor_id=pred_task.id,
                            successor_id=succ_task.id,
                            dependency_type=dep_type,
                            lag_days=dep.lag_days,
                        )
                    )

            await self.session.flush()

            # 5. Пересчёт CPM
            if db_tasks:
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
                    for t in db_tasks
                ]

                try:
                    cpm_result = self.cpm_engine.calculate(
                        project_start=project.planned_start_date,
                        nodes=cpm_nodes,
                        edges=cpm_edges,
                    )
                    calc_map = {n.id: n for n in cpm_result.tasks}
                    for t in db_tasks:
                        calc = calc_map.get(t.id)
                        if calc:
                            t.early_start = calc.early_start
                            t.early_finish = calc.early_finish
                            t.late_start = calc.late_start
                            t.late_finish = calc.late_finish
                            t.total_float = calc.total_float
                            t.free_float = calc.free_float
                            t.is_critical = calc.is_critical
                except Exception:
                    pass

        # 6. ЕДИНЫЙ СИСТЕМНЫЙ СНИМОК Time Machine
        if all_created_ids or all_updated_before:
            await AuditService.record_action(
                db=self.session,
                entity_type="EXCEL_IMPORT",
                entity_id=str(uuid.uuid4()),
                action="IMPORT",
                user=user,
                entity_name=package.source_filename,
                summary=(
                    f"Excel Мост: импорт книги '{package.source_filename}' (создано {len(all_created_ids)}, "
                    f"обновлено {len(all_updated_before)} задач по проектам {', '.join(sorted(affected_codes))})"
                ),
                before_state={
                    "created_task_ids": all_created_ids,
                    "updated_tasks": all_updated_before,
                    "affected_project_ids": list(affected_project_ids),
                },
                after_state={
                    "total_applied": len(all_created_ids) + len(all_updated_before),
                    "source_file": package.source_filename,
                },
            )

        await self.session.commit()
        return main_project or PortfolioProject(
            code="PORTFOLIO",
            name="Портфель",
            planned_start_date=date.today(),
            planned_finish_date=date.today(),
        )
        """
        Промышленный Smart Upsert:
        1. Сравнивает задачи по WBS и обновляет план.
        2. Защищает фактически закрытые этапы от затирания старым Excel.
        3. Сохраняет существующие Pyrus-ссылки.
        4. Фиксирует точку отката в Time Machine.
        """
        def clean_json_dict(d: Any) -> Any:
            if isinstance(d, (datetime, date)):
                return d.isoformat()
            if isinstance(d, dict):
                return {str(k): clean_json_dict(v) for k, v in d.items()}
            if isinstance(d, (list, tuple, set)):
                return [clean_json_dict(x) for x in d]
            return d

        # 1. Группируем задачи из Excel по кодам проектов
        tasks_by_proj: Dict[str, List[ParsedTask]] = {}
        for p_task in package.tasks:
            p_code = None
            attrs = p_task.custom_attributes or {}
            for key in ("проект", "project", "код проекта", "код"):
                if key in attrs and attrs[key]:
                    p_code = str(attrs[key]).strip().upper()
                    break
            if not p_code:
                p_code = package.passport.code.strip().upper()

            tasks_by_proj.setdefault(p_code, []).append(p_task)

        main_project = None

        # 2. Обрабатываем каждый проект отдельно
        for proj_code, p_tasks in tasks_by_proj.items():
            stmt = (
                select(PortfolioProject)
                .options(selectinload(PortfolioProject.tasks))
                .where(PortfolioProject.code == proj_code)
            )
            res = await self.session.execute(stmt)
            project = res.scalar_one_or_none()

            p_start = min((t.planned_start for t in p_tasks if t.planned_start), default=date.today())
            p_finish = max((t.planned_finish for t in p_tasks if t.planned_finish), default=date.today())

            if not project:
                p_name = package.passport.name if proj_code == package.passport.code else f"Проект {proj_code}"
                project = PortfolioProject(
                    code=proj_code,
                    name=p_name,
                    description=f"Проект {proj_code}",
                    currency="RUB",
                    planned_start_date=p_start,
                    planned_finish_date=p_finish,
                    status=ProjectStatus.EXECUTION,
                )
                self.session.add(project)
                await self.session.flush()
                existing_tasks_map = {}
                before_state = {}
            else:
                project.planned_start_date = min(project.planned_start_date, p_start)
                project.planned_finish_date = max(project.planned_finish_date, p_finish)
                # Точка отката: сохраняем состояние задач проекта ДО импорта
                existing_tasks_map = {t.wbs_code: t for t in project.tasks}
                before_state = {t.wbs_code: extract_model_snapshot(t) for t in project.tasks}

            if not main_project:
                main_project = project

            # 3. Smart Upsert задач
            wbs_to_task_map: Dict[str, PortfolioTask] = {}
            db_tasks: List[PortfolioTask] = []
            seen_wbs = set()
            updated_count = 0
            created_count = 0

            for idx, p_task in enumerate(p_tasks, start=1):
                raw_wbs = p_task.wbs_code or f"1.{idx}"
                unique_wbs = raw_wbs
                if unique_wbs in seen_wbs:
                    unique_wbs = f"{raw_wbs}.{idx}"
                seen_wbs.add(unique_wbs)

                parent_wbs = unique_wbs.rsplit(".", 1)[0] if "." in unique_wbs else None
                level = len(unique_wbs.split("."))
                t_type = TaskType.MILESTONE if p_task.duration_days == 0 else TaskType.TASK

                existing_task = existing_tasks_map.get(unique_wbs) or existing_tasks_map.get(raw_wbs)

                if existing_task:
                    # ОБНОВЛЕНИЕ ПЛАНА (с сохранением фактических отметок и Pyrus)
                    existing_task.name = p_task.name
                    existing_task.planned_duration = max(0, p_task.duration_days)
                    existing_task.planned_start = p_task.planned_start or existing_task.planned_start
                    existing_task.planned_finish = p_task.planned_finish or existing_task.planned_finish
                    existing_task.sort_order = idx
                    existing_task.level = level
                    existing_task.parent_wbs = parent_wbs

                    # Actuals Protection (MVP DNA): если этап не закрыт в БД, подтягиваем факт из Excel
                    if not existing_task.actual_start and p_task.actual_start:
                        existing_task.actual_start = p_task.actual_start
                    if not existing_task.actual_finish and p_task.actual_finish:
                        existing_task.actual_finish = p_task.actual_finish
                    if existing_task.progress_percent == 0 and p_task.progress_percent > 0:
                        existing_task.progress_percent = p_task.progress_percent

                    if existing_task.progress_percent >= 100 or existing_task.actual_finish:
                        existing_task.status = TaskStatus.COMPLETED
                    elif existing_task.progress_percent > 0 or existing_task.actual_start:
                        existing_task.status = TaskStatus.IN_PROGRESS

                    if p_task.raci_assignee:
                        existing_task.raci_assignee = p_task.raci_assignee

                    # Сохраняем существующий Pyrus URL, если в новом файле его не было
                    merged_attrs = dict(existing_task.custom_attributes or {})
                    new_attrs = clean_json_dict(p_task.custom_attributes) or {}
                    if "pyrus_url" not in new_attrs and "pyrus_url" in merged_attrs:
                        new_attrs["pyrus_url"] = merged_attrs["pyrus_url"]
                    merged_attrs.update(new_attrs)
                    existing_task.custom_attributes = merged_attrs

                    wbs_to_task_map[unique_wbs] = existing_task
                    wbs_to_task_map[raw_wbs] = existing_task
                    db_tasks.append(existing_task)
                    updated_count += 1
                else:
                    # ДОБАВЛЕНИЕ НОВОЙ ЗАДАЧИ
                    t_status = TaskStatus.NOT_STARTED
                    if p_task.progress_percent >= 100.0 or p_task.actual_finish is not None:
                        t_status = TaskStatus.COMPLETED
                    elif p_task.progress_percent > 0 or p_task.actual_start is not None:
                        t_status = TaskStatus.IN_PROGRESS

                    new_task = PortfolioTask(
                        project_id=project.id,
                        wbs_code=unique_wbs,
                        parent_wbs=parent_wbs,
                        level=level,
                        sort_order=idx,
                        name=p_task.name,
                        task_type=t_type,
                        status=t_status,
                        planned_duration=max(0, p_task.duration_days),
                        planned_start=p_task.planned_start or p_start,
                        planned_finish=p_task.planned_finish or p_finish,
                        actual_start=p_task.actual_start,
                        actual_finish=p_task.actual_finish,
                        progress_percent=p_task.progress_percent,
                        is_plan_locked=p_task.actual_start is not None,
                        raci_assignee=p_task.raci_assignee,
                        raci_approver=p_task.raci_approver,
                        custom_attributes=clean_json_dict(p_task.custom_attributes),
                    )
                    self.session.add(new_task)
                    wbs_to_task_map[unique_wbs] = new_task
                    wbs_to_task_map[raw_wbs] = new_task
                    db_tasks.append(new_task)
                    created_count += 1

            await self.session.flush()

            # 4. Обновляем зависимости CPM для проекта
            task_ids = [t.id for t in db_tasks]
            if task_ids:
                await self.session.execute(
                    delete(TaskDependency).where(TaskDependency.successor_task_id.in_(task_ids))
                )

            cpm_edges: List[CPMEdge] = []
            for p_task in p_tasks:
                succ_task = wbs_to_task_map.get(p_task.wbs_code)
                if not succ_task:
                    continue

                for dep in p_task.dependencies:
                    pred_task = wbs_to_task_map.get(dep.predecessor_wbs)
                    if not pred_task or pred_task.id == succ_task.id:
                        continue

                    dep_type = DependencyType(dep.dependency_type.upper()) if dep.dependency_type.upper() in DependencyType.__members__ else DependencyType.FINISH_TO_START
                    dependency = TaskDependency(
                        predecessor_task_id=pred_task.id,
                        successor_task_id=succ_task.id,
                        dependency_type=dep_type,
                        lag_days=dep.lag_days,
                    )
                    self.session.add(dependency)
                    cpm_edges.append(
                        CPMEdge(
                            predecessor_id=pred_task.id,
                            successor_id=succ_task.id,
                            dependency_type=dep_type,
                            lag_days=dep.lag_days,
                        )
                    )

            await self.session.flush()

            # 5. Пересчёт графа CPM
            if db_tasks:
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
                    for t in db_tasks
                ]

                try:
                    cpm_result = self.cpm_engine.calculate(
                        project_start=project.planned_start_date,
                        nodes=cpm_nodes,
                        edges=cpm_edges,
                    )
                    calc_map = {n.id: n for n in cpm_result.tasks}
                    for t in db_tasks:
                        calc = calc_map.get(t.id)
                        if calc:
                            t.early_start = calc.early_start
                            t.early_finish = calc.early_finish
                            t.late_start = calc.late_start
                            t.late_finish = calc.late_finish
                            t.total_float = calc.total_float
                            t.free_float = calc.free_float
                            t.is_critical = calc.is_critical
                except Exception:
                    pass

            # 6. Запись события в журнал аудита Time Machine
            after_state = {t.wbs_code: extract_model_snapshot(t) for t in db_tasks}
            await AuditService.record_action(
                db=self.session,
                entity_type="PROJECT",
                entity_id=str(project.id),
                action="UPDATE",
                user=user,
                entity_name=f"[{project.code}] {project.name}",
                summary=f"Excel Мост: импорт '{package.source_filename}' (обновлено {updated_count}, добавлено {created_count} задач)",
                before_state=before_state,
                after_state=after_state,
            )

        await self.session.commit()
        return main_project or PortfolioProject(code="PORTFOLIO", name="Портфель", planned_start_date=date.today(), planned_finish_date=date.today())
        def clean_json_dict(d: Any) -> Any:
            if isinstance(d, (datetime, date)):
                return d.isoformat()
            if isinstance(d, dict):
                return {str(k): clean_json_dict(v) for k, v in d.items()}
            if isinstance(d, (list, tuple, set)):
                return [clean_json_dict(x) for x in d]
            return d

        # 1. Группируем задачи по реальным шифрам проектов (P-000, P-001, P-002...)
        tasks_by_proj: Dict[str, List[ParsedTask]] = {}
        for p_task in package.tasks:
            p_code = None
            attrs = p_task.custom_attributes or {}
            for key in ("проект", "project", "код проекта", "код"):
                if key in attrs and attrs[key]:
                    p_code = str(attrs[key]).strip().upper()
                    break
            if not p_code:
                p_code = package.passport.code.strip().upper()

            tasks_by_proj.setdefault(p_code, []).append(p_task)

        main_project = None

        # 2. Обрабатываем каждый проект и его собственный пул задач
        for proj_code, p_tasks in tasks_by_proj.items():
            stmt = select(PortfolioProject).where(PortfolioProject.code == proj_code)
            res = await self.session.execute(stmt)
            project = res.scalar_one_or_none()

            p_start = min((t.planned_start for t in p_tasks if t.planned_start), default=date.today())
            p_finish = max((t.planned_finish for t in p_tasks if t.planned_finish), default=date.today())

            if not project:
                p_name = package.passport.name if proj_code == package.passport.code else f"Проект {proj_code}"
                project = PortfolioProject(
                    code=proj_code,
                    name=p_name,
                    description=f"Проект {proj_code}",
                    currency="RUB",
                    planned_start_date=p_start,
                    planned_finish_date=p_finish,
                    status=ProjectStatus.EXECUTION,
                )
                self.session.add(project)
                await self.session.flush()
            else:
                project.planned_start_date = p_start
                project.planned_finish_date = p_finish
                # Очищаем старые задачи этого проекта перед перезаливкой
                await self.session.execute(
                    delete(PortfolioTask).where(PortfolioTask.project_id == project.id)
                )
                await self.session.flush()

            if not main_project:
                main_project = project

            # 3. Сохраняем задачи с гарантией уникальности WBS внутри проекта
            wbs_to_task_map: Dict[str, PortfolioTask] = {}
            db_tasks: List[PortfolioTask] = []
            seen_wbs = set()

            for idx, p_task in enumerate(p_tasks, start=1):
                raw_wbs = p_task.wbs_code or f"1.{idx}"
                # Устраняем дубликаты WBS, если в Excel были строки с одинаковым ID
                unique_wbs = raw_wbs
                if unique_wbs in seen_wbs:
                    unique_wbs = f"{raw_wbs}.{idx}"
                seen_wbs.add(unique_wbs)

                parent_wbs = unique_wbs.rsplit(".", 1)[0] if "." in unique_wbs else None
                level = len(unique_wbs.split("."))
                t_type = TaskType.MILESTONE if p_task.duration_days == 0 else TaskType.TASK
                
                t_status = TaskStatus.NOT_STARTED
                if p_task.progress_percent >= 100.0 or p_task.actual_finish is not None:
                    t_status = TaskStatus.COMPLETED
                elif p_task.progress_percent > 0 or p_task.actual_start is not None:
                    t_status = TaskStatus.IN_PROGRESS

                task = PortfolioTask(
                    project_id=project.id,
                    wbs_code=unique_wbs,
                    parent_wbs=parent_wbs,
                    level=level,
                    sort_order=idx,
                    name=p_task.name,
                    task_type=t_type,
                    status=t_status,
                    planned_duration=max(0, p_task.duration_days),
                    planned_start=p_task.planned_start or p_start,
                    planned_finish=p_task.planned_finish or p_finish,
                    actual_start=p_task.actual_start,
                    actual_finish=p_task.actual_finish,
                    progress_percent=p_task.progress_percent,
                    is_plan_locked=p_task.actual_start is not None,
                    raci_assignee=p_task.raci_assignee,
                    raci_approver=p_task.raci_approver,
                    custom_attributes=clean_json_dict(p_task.custom_attributes),
                )
                self.session.add(task)
                wbs_to_task_map[unique_wbs] = task
                wbs_to_task_map[raw_wbs] = task
                db_tasks.append(task)

            await self.session.flush()

            # 4. Создаем связи графа внутри этого проекта
            cpm_edges: List[CPMEdge] = []
            for p_task in p_tasks:
                succ_task = wbs_to_task_map.get(p_task.wbs_code)
                if not succ_task:
                    continue

                for dep in p_task.dependencies:
                    pred_task = wbs_to_task_map.get(dep.predecessor_wbs)
                    if not pred_task or pred_task.id == succ_task.id:
                        continue

                    dep_type = DependencyType(dep.dependency_type.upper()) if dep.dependency_type.upper() in DependencyType.__members__ else DependencyType.FINISH_TO_START
                    dependency = TaskDependency(
                        predecessor_task_id=pred_task.id,
                        successor_task_id=succ_task.id,
                        dependency_type=dep_type,
                        lag_days=dep.lag_days,
                    )
                    self.session.add(dependency)
                    cpm_edges.append(
                        CPMEdge(
                            predecessor_id=pred_task.id,
                            successor_id=succ_task.id,
                            dependency_type=dep_type,
                            lag_days=dep.lag_days,
                        )
                    )

            await self.session.flush()

            # 5. Расчёт CPM для графа проекта
            if db_tasks:
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
                    for t in db_tasks
                ]

                try:
                    cpm_result = self.cpm_engine.calculate(
                        project_start=project.planned_start_date,
                        nodes=cpm_nodes,
                        edges=cpm_edges,
                    )
                    calc_map = {n.id: n for n in cpm_result.tasks}
                    for t in db_tasks:
                        calc = calc_map.get(t.id)
                        if calc:
                            t.early_start = calc.early_start
                            t.early_finish = calc.early_finish
                            t.late_start = calc.late_start
                            t.late_finish = calc.late_finish
                            t.total_float = calc.total_float
                            t.free_float = calc.free_float
                            t.is_critical = calc.is_critical
                except Exception:
                    pass