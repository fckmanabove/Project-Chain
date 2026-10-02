"""
Движок детерминированного анализа задержек и первопричин срывов сроков (Root Cause Analysis).
"""

from dataclasses import dataclass, field
from datetime import date
from typing import Dict, List, Optional
from uuid import UUID
from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy.orm import selectinload

from app.models.project import PortfolioProject
from app.models.task import PortfolioTask, TaskStatus
from app.models.diary import DiaryEntry


@dataclass
class TaskDelayDetail:
    task_id: str
    wbs_code: str
    name: str
    is_critical: bool
    total_float: int
    progress_percent: float
    planned_finish: str
    actual_finish: Optional[str]
    delay_days: int
    raci_assignee: Optional[str]
    raci_approver: Optional[str]
    issues_and_risks: List[str] = field(default_factory=list)


@dataclass
class ProjectDelayReport:
    project_id: str
    project_code: str
    project_name: str
    total_critical_delay_days: int
    delayed_tasks_count: int
    critical_delayed_tasks: List[TaskDelayDetail]
    non_critical_delayed_tasks: List[TaskDelayDetail]
    raci_delay_distribution: Dict[str, int]
    root_cause_summary: List[str]


class DelayAnalyzer:
    """
    Анализирует календарно-сетевой график и формирует структурированный отчет по задержкам.
    """

    def __init__(self, session: AsyncSession):
        self.session = session

    async def analyze_project(self, project_id: UUID) -> ProjectDelayReport:
        """
        Проводит полный анализ графика проекта и выявляет первопричины отставаний.
        """
        # 1. Загружаем проект и все задачи со связями и дневниками
        proj_stmt = select(PortfolioProject).where(PortfolioProject.id == project_id)
        proj_res = await self.session.execute(proj_stmt)
        project = proj_res.scalar_one_or_none()

        if not project:
            raise ValueError(f"Проект с ID {project_id} не найден")

        tasks_stmt = (
            select(PortfolioTask)
            .where(PortfolioTask.project_id == project_id)
            .options(selectinload(PortfolioTask.diary_entries))
            .order_by(PortfolioTask.wbs_code)
        )
        tasks_res = await self.session.execute(tasks_stmt)
        tasks = tasks_res.scalars().all()

        today = date.today()
        critical_delayed: List[TaskDelayDetail] = []
        non_critical_delayed: List[TaskDelayDetail] = []
        raci_distribution: Dict[str, int] = {}
        root_causes: List[str] = []
        max_critical_delay = 0

        for task in tasks:
            # Вычисляем задержку задачи
            delay_days = 0
            check_date = task.actual_finish or today

            if task.status != TaskStatus.COMPLETED and today > task.planned_finish:
                delay_days = (today - task.planned_finish).days
            elif task.actual_finish and task.actual_finish > task.planned_finish:
                delay_days = (task.actual_finish - task.planned_finish).days

            # Собираем риски из дневника этой задачи
            task_issues = [
                f"[{e.entry_date}] {e.issues_and_risks or e.content}"
                for e in task.diary_entries
                if e.issues_and_risks or "задержк" in e.content.lower() or "простой" in e.content.lower()
            ]

            if delay_days > 0:
                detail = TaskDelayDetail(
                    task_id=str(task.id),
                    wbs_code=task.wbs_code,
                    name=task.name,
                    is_critical=task.is_critical,
                    total_float=task.total_float,
                    progress_percent=task.progress_percent,
                    planned_finish=task.planned_finish.isoformat(),
                    actual_finish=task.actual_finish.isoformat() if task.actual_finish else None,
                    delay_days=delay_days,
                    raci_assignee=task.raci_assignee,
                    raci_approver=task.raci_approver,
                    issues_and_risks=task_issues,
                )

                if task.is_critical:
                    critical_delayed.append(detail)
                    if delay_days > max_critical_delay:
                        max_critical_delay = delay_days
                else:
                    non_critical_delayed.append(detail)

                # RACI распределение
                assignee = task.raci_assignee or "Не назначен"
                raci_distribution[assignee] = raci_distribution.get(assignee, 0) + delay_days

        # Формируем выводы по первопричинам (Root Cause)
        if critical_delayed:
            root_causes.append(
                f"Критический путь сдвинут на {max_critical_delay} дней из-за отставания {len(critical_delayed)} ключевых задач."
            )
            top_bottlenecks = sorted(critical_delayed, key=lambda x: x.delay_days, reverse=True)[:3]
            for b in top_bottlenecks:
                cause_str = f"Работа [{b.wbs_code}] '{b.name}' (отставание: +{b.delay_days} дн.)"
                if b.raci_assignee:
                    cause_str += f", отв.: {b.raci_assignee}"
                if b.issues_and_risks:
                    cause_str += f" -> Факторы: {'; '.join(b.issues_and_risks[:2])}"
                root_causes.append(cause_str)
        else:
            root_causes.append("Критический путь соблюдается без отставаний от базового плана.")

        return ProjectDelayReport(
            project_id=str(project.id),
            project_code=project.code,
            project_name=project.name,
            total_critical_delay_days=max_critical_delay,
            delayed_tasks_count=len(critical_delayed) + len(non_critical_delayed),
            critical_delayed_tasks=critical_delayed,
            non_critical_delayed_tasks=non_critical_delayed,
            raci_delay_distribution=raci_distribution,
            root_cause_summary=root_causes,
        )