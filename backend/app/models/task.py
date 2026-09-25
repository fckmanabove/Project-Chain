"""
Portfolio Task Model (CPM, WBS, Baseline vs Actuals, RACI).
"""

from typing import TYPE_CHECKING, Any, Dict, List, Optional
from datetime import date
from enum import Enum
import uuid
from sqlalchemy import (
    String, Integer, Date, Float, Boolean, ForeignKey, UniqueConstraint, Index
)
from sqlalchemy.dialects.postgresql import UUID, JSONB
from sqlalchemy.orm import Mapped, mapped_column, relationship

from app.core.database import Base
from app.models.base import TimeStampedUUIDModel

if TYPE_CHECKING:
    from app.models.project import PortfolioProject
    from app.models.dependency import TaskDependency
    from app.models.diary import DiaryEntry
    from app.models.snapshot import TaskSnapshot


class TaskType(str, Enum):
    TASK = "TASK"                   # Обычная работа
    MILESTONE = "MILESTONE"         # Веха (длительность = 0)
    SUMMARY = "SUMMARY"             # Суммарная задача / WBS-группа


class TaskStatus(str, Enum):
    NOT_STARTED = "NOT_STARTED"
    IN_PROGRESS = "IN_PROGRESS"
    COMPLETED = "COMPLETED"
    SUSPENDED = "SUSPENDED"


class PortfolioTask(Base, TimeStampedUUIDModel):
    """
    Модель календарно-сетевой задачи:
    - WBS-идентификация (1.1, 1.2.3)
    - Базовый директивный план (Baseline)
    - Фактическое исполнение (Actuals) с автоблокировкой
    - Расчетные поля CPM (Early/Late, Total/Free Float, Critical Path)
    - Задачный RACI
    """

    __tablename__ = "portfolio_tasks"

    project_id: Mapped[uuid.UUID] = mapped_column(
        UUID(as_uuid=True),
        ForeignKey("portfolio_projects.id", ondelete="CASCADE"),
        nullable=False,
        index=True,
    )

    # --- WBS и Иерархия ---
    wbs_code: Mapped[str] = mapped_column(
        String(64), nullable=False, index=True,
        doc="Иерархический WBS-код (например, '1.2.1')"
    )
    parent_wbs: Mapped[Optional[str]] = mapped_column(
        String(64), nullable=True, index=True,
        doc="WBS-код родительской суммарной задачи (например, '1.2')"
    )
    level: Mapped[int] = mapped_column(
        Integer, default=1, nullable=False, doc="Уровень вложенности WBS"
    )
    sort_order: Mapped[int] = mapped_column(
        Integer, default=0, nullable=False, doc="Порядковый номер в дереве Гантта"
    )

    name: Mapped[str] = mapped_column(
        String(500), nullable=False, doc="Наименование работы / пакета"
    )
    task_type: Mapped[TaskType] = mapped_column(
        String(32), default=TaskType.TASK, nullable=False
    )
    status: Mapped[TaskStatus] = mapped_column(
        String(32), default=TaskStatus.NOT_STARTED, nullable=False, index=True
    )

    # --- СЛОЙ 1: Базовый директивный план (Baseline / Plan) ---
    planned_duration: Mapped[int] = mapped_column(
        Integer, default=1, nullable=False, doc="Плановая длительность в рабочих днях"
    )
    planned_start: Mapped[date] = mapped_column(
        Date, nullable=False, doc="Директивный старт"
    )
    planned_finish: Mapped[date] = mapped_column(
        Date, nullable=False, doc="Директивный финиш"
    )

    # --- СЛОЙ 2: Фактическое исполнение (Actuals) ---
    actual_start: Mapped[Optional[date]] = mapped_column(
        Date, nullable=True, doc="Фактический старт"
    )
    actual_finish: Mapped[Optional[date]] = mapped_column(
        Date, nullable=True, doc="Фактический финиш"
    )
    progress_percent: Mapped[float] = mapped_column(
        Float, default=0.0, nullable=False, doc="Физический прогресс в процентах (0..100)"
    )

    # Бизнес-правило: Блокировка плановых дат при наличии факта
    is_plan_locked: Mapped[bool] = mapped_column(
        Boolean, default=False, nullable=False,
        doc="Автоматическая блокировка изменений базового плана при фиксации факта"
    )

    # --- СЛОЙ 3: Расчетные поля CPM Engine (Forward & Backward Pass) ---
    early_start: Mapped[Optional[date]] = mapped_column(
        Date, nullable=True, doc="Ранний старт (ES)"
    )
    early_finish: Mapped[Optional[date]] = mapped_column(
        Date, nullable=True, doc="Ранний финиш (EF)"
    )
    late_start: Mapped[Optional[date]] = mapped_column(
        Date, nullable=True, doc="Поздний старт (LS)"
    )
    late_finish: Mapped[Optional[date]] = mapped_column(
        Date, nullable=True, doc="Поздний финиш (LF)"
    )
    total_float: Mapped[int] = mapped_column(
        Integer, default=0, nullable=False, doc="Полный резерв времени (Total Float / Slack) в днях"
    )
    free_float: Mapped[int] = mapped_column(
        Integer, default=0, nullable=False, doc="Свободный резерв времени (Free Float) в днях"
    )
    is_critical: Mapped[bool] = mapped_column(
        Boolean, default=False, nullable=False, index=True,
        doc="Флаг критического пути (Total Float <= 0)"
    )

    # --- RACI задачного уровня ---
    raci_assignee: Mapped[Optional[str]] = mapped_column(
        String(255), nullable=True, doc="R - Ответственный исполнитель (Responsible)"
    )
    raci_approver: Mapped[Optional[str]] = mapped_column(
        String(255), nullable=True, doc="A - Утверждающий / Приемщик (Accountable)"
    )
    raci_consulted: Mapped[List[str]] = mapped_column(
        JSONB, default=list, nullable=False, doc="C - Консультирующие (Consulted)"
    )
    raci_informed: Mapped[List[str]] = mapped_column(
        JSONB, default=list, nullable=False, doc="I - Информируемые (Informed)"
    )

    # Дополнительные свойства задачи (Legacy метаданные Excel)
    custom_attributes: Mapped[Dict[str, Any]] = mapped_column(
        JSONB, default=dict, nullable=False
    )

    # Связи
    project: Mapped["PortfolioProject"] = relationship(
        "PortfolioProject", back_populates="tasks"
    )
    
    # Предшественники (Predecessors) и Последователи (Successors)
    predecessor_links: Mapped[List["TaskDependency"]] = relationship(
        "TaskDependency",
        foreign_keys="TaskDependency.successor_task_id",
        back_populates="successor_task",
        cascade="all, delete-orphan",
    )
    successor_links: Mapped[List["TaskDependency"]] = relationship(
        "TaskDependency",
        foreign_keys="TaskDependency.predecessor_task_id",
        back_populates="predecessor_task",
        cascade="all, delete-orphan",
    )

    diary_entries: Mapped[List["DiaryEntry"]] = relationship(
        "DiaryEntry", back_populates="task", cascade="all, delete-orphan"
    )
    snapshots: Mapped[List["TaskSnapshot"]] = relationship(
        "TaskSnapshot", back_populates="task", cascade="all, delete-orphan"
    )

    __table_args__ = (
        # Уникальность WBS внутри одного проекта
        UniqueConstraint("project_id", "wbs_code", name="uq_project_task_wbs"),
        Index("ix_portfolio_tasks_project_wbs", "project_id", "wbs_code"),
        Index("ix_portfolio_tasks_critical", "project_id", "is_critical"),
    )