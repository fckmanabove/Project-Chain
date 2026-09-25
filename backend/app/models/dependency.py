"""
Task Dependency Model (Graph Edges for CPM Engine).
"""

from typing import TYPE_CHECKING
from enum import Enum
import uuid
from sqlalchemy import String, Integer, ForeignKey, UniqueConstraint, Index
from sqlalchemy.dialects.postgresql import UUID
from sqlalchemy.orm import Mapped, mapped_column, relationship

from app.core.database import Base
from app.models.base import TimeStampedUUIDModel

if TYPE_CHECKING:
    from app.models.task import PortfolioTask


class DependencyType(str, Enum):
    FINISH_TO_START = "FS"  # Окончание - Начало (классическая)
    START_TO_START = "SS"    # Начало - Начало (параллельный старт)
    FINISH_TO_FINISH = "FF"  # Окончание - Окончание (одновременное завершение)
    START_TO_FINISH = "SF"  # Начало - Окончание (редкая связь)


class TaskDependency(Base, TimeStampedUUIDModel):
    """
    Модель ориентированного ребра графа CPM:
    Predecessor -> Successor с типом связи и временным лагом.
    """

    __tablename__ = "task_dependencies"

    predecessor_task_id: Mapped[uuid.UUID] = mapped_column(
        UUID(as_uuid=True),
        ForeignKey("portfolio_tasks.id", ondelete="CASCADE"),
        nullable=False,
        index=True,
        doc="Задача-предшественник (Откуда)",
    )
    successor_task_id: Mapped[uuid.UUID] = mapped_column(
        UUID(as_uuid=True),
        ForeignKey("portfolio_tasks.id", ondelete="CASCADE"),
        nullable=False,
        index=True,
        doc="Задача-последователь (Куда)",
    )

    dependency_type: Mapped[DependencyType] = mapped_column(
        String(4), default=DependencyType.FINISH_TO_START, nullable=False
    )
    lag_days: Mapped[int] = mapped_column(
        Integer, default=0, nullable=False,
        doc="Временной лаг / смещение в рабочих днях (может быть отрицательным - lead)"
    )

    # Связи
    predecessor_task: Mapped["PortfolioTask"] = relationship(
        "PortfolioTask",
        foreign_keys=[predecessor_task_id],
        back_populates="successor_links",
    )
    successor_task: Mapped["PortfolioTask"] = relationship(
        "PortfolioTask",
        foreign_keys=[successor_task_id],
        back_populates="predecessor_links",
    )

    __table_args__ = (
        UniqueConstraint(
            "predecessor_task_id", "successor_task_id",
            name="uq_task_dependency_edge"
        ),
        Index("ix_task_dep_pred_succ", "predecessor_task_id", "successor_task_id"),
    )