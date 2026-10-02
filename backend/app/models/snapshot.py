"""
Task Snapshot Model with pgvector Embeddings for AI-driven Delay Analysis.
"""

from typing import TYPE_CHECKING, Any, Dict, Optional, List
from datetime import datetime
import uuid
from sqlalchemy import (
    DateTime, ForeignKey, Text, Float, Integer, Boolean, Index, func
)
from sqlalchemy.dialects.postgresql import UUID, JSONB
from sqlalchemy.orm import Mapped, mapped_column, relationship
from pgvector.sqlalchemy import Vector

from app.core.database import Base
from app.models.base import TimeStampedUUIDModel

if TYPE_CHECKING:
    from app.models.task import PortfolioTask


class TaskSnapshot(Base, TimeStampedUUIDModel):
    """
    Исторический срез состояния задачи:
    Хранит метрики выполнения, нарративный контекст и векторный эмбеддинг.
    """

    __tablename__ = "task_snapshots"

    task_id: Mapped[uuid.UUID] = mapped_column(
        UUID(as_uuid=True),
        ForeignKey("portfolio_tasks.id", ondelete="CASCADE"),
        nullable=False,
        index=True,
    )
    snapshot_timestamp: Mapped[datetime] = mapped_column(
        DateTime(timezone=True),
        server_default=func.now(),
        nullable=False,
        index=True,
    )

    # Метрический срез
    progress_percent: Mapped[float] = mapped_column(Float, nullable=False)
    total_float: Mapped[int] = mapped_column(Integer, nullable=False)
    is_critical: Mapped[bool] = mapped_column(Boolean, nullable=False)
    delay_days: Mapped[int] = mapped_column(
        Integer, default=0, nullable=False, doc="Отклонение от директивного финиша в днях"
    )

    # Нарративный текст
    narrative_context: Mapped[str] = mapped_column(
        Text, nullable=False, doc="Сгенерированный текстовый контекст состояния задачи"
    )

    # Векторный эмбеддинг для OpenAI text-embedding-3-small (1536 dim)
    embedding: Mapped[Optional[List[float]]] = mapped_column(
        Vector(1536), nullable=True, doc="Векторный эмбеддинг нарративного контекста"
    )

    # Дополнительные агрегированные параметры
    metrics_data: Mapped[Dict[str, Any]] = mapped_column(
        JSONB, default=dict, nullable=False
    )

    # Связи
    task: Mapped["PortfolioTask"] = relationship(
        "PortfolioTask", back_populates="snapshots"
    )

    __table_args__ = (
        Index("ix_snapshot_task_time", "task_id", "snapshot_timestamp"),
    )