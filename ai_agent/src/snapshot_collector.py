"""
Snapshot Collector: Агрегатор числовых метрик и нарративного контекста задач для ИИ-аналитики.
"""

from datetime import date
from typing import List, Optional
from uuid import UUID
from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy.orm import selectinload

from app.models.task import PortfolioTask
from app.models.diary import DiaryEntry
from app.models.snapshot import TaskSnapshot


class SnapshotCollector:
    """
    Формирует контекстные срезы состояния задач (Числа + Текст) и сохраняет их в БД.
    """

    def __init__(self, session: AsyncSession):
        self.session = session

    async def create_task_snapshot(
        self,
        task_id: UUID,
        embedding: Optional[List[float]] = None,
    ) -> TaskSnapshot:
        stmt = (
            select(PortfolioTask)
            .where(PortfolioTask.id == task_id)
            .options(
                selectinload(PortfolioTask.diary_entries),
                selectinload(PortfolioTask.project),
            )
        )
        res = await self.session.execute(stmt)
        task = res.scalar_one_or_none()

        if not task:
            raise ValueError(f"Задача с ID {task_id} не найдена")

        # 1. Расчет отклонения (Delay Days)
        delay_days = 0
        reference_finish = task.actual_finish or date.today()
        if task.actual_start is not None and reference_finish > task.planned_finish:
            delay_days = (reference_finish - task.planned_finish).days

        # 2. Формирование нарративного контекста
        narrative = self._generate_narrative_context(task, delay_days)

        metrics_data = {
            "wbs_code": task.wbs_code,
            "planned_duration": task.planned_duration,
            "progress_percent": task.progress_percent,
            "total_float": task.total_float,
            "free_float": task.free_float,
            "is_critical": task.is_critical,
            "delay_days": delay_days,
            "raci_assignee": task.raci_assignee,
            "raci_approver": task.raci_approver,
        }

        snapshot = TaskSnapshot(
            task_id=task.id,
            progress_percent=task.progress_percent,
            total_float=task.total_float,
            is_critical=task.is_critical,
            delay_days=delay_days,
            narrative_context=narrative,
            embedding=embedding,
            metrics_data=metrics_data,
        )

        self.session.add(snapshot)
        await self.session.commit()
        await self.session.refresh(snapshot)
        return snapshot

    def _generate_narrative_context(self, task: PortfolioTask, delay_days: int) -> str:
        # Безопасное извлечение строкового статуса (Enum или str)
        status_name = task.status.value if hasattr(task.status, 'value') else str(task.status)

        lines = [
            f"Задача: [{task.wbs_code}] {task.name}",
            f"Статус: {status_name}, Физический прогресс: {task.progress_percent}%",
            f"Плановый период: с {task.planned_start} по {task.planned_finish} ({task.planned_duration} раб. дней)",
        ]

        if task.actual_start:
            lines.append(f"Фактический старт: {task.actual_start}")
        if task.actual_finish:
            lines.append(f"Фактический финиш: {task.actual_finish}")

        lines.append(f"Положение на критическом пути: {'ДА (Критическая)' if task.is_critical else 'НЕТ'}")
        lines.append(f"Полный резерв времени (Total Float): {task.total_float} дней")

        if delay_days > 0:
            lines.append(f"ВНИМАНИЕ: Зафиксировано отставание от базового плана на {delay_days} дней!")

        if task.raci_assignee:
            lines.append(f"Ответственный исполнитель (R): {task.raci_assignee}")
        if task.raci_approver:
            lines.append(f"Приемщик / Технадзор (A): {task.raci_approver}")

        # Добавляем записи из дневника
        if task.diary_entries:
            lines.append("\nФакты и записи из журнала производства работ:")
            for entry in task.diary_entries:
                entry_type_str = entry.entry_type.value if hasattr(entry.entry_type, 'value') else str(entry.entry_type)
                entry_line = f"- [{entry.entry_date}] ({entry_type_str}) {entry.author_name}: {entry.content}"
                if entry.issues_and_risks:
                    entry_line += f" | Проблемы/Риски: {entry.issues_and_risks}"
                if entry.weather_conditions:
                    entry_line += f" | Погода: {entry.weather_conditions}"
                lines.append(entry_line)

        return "\n".join(lines)