"""
Project Diary Entry Model.
"""

from typing import TYPE_CHECKING, Optional
from datetime import date
from enum import Enum
import uuid
from sqlalchemy import String, Date, Text, ForeignKey, Index
from sqlalchemy.dialects.postgresql import UUID
from sqlalchemy.orm import Mapped, mapped_column, relationship

from app.core.database import Base
from app.models.base import TimeStampedUUIDModel

if TYPE_CHECKING:
    from app.models.project import PortfolioProject
    from app.models.task import PortfolioTask


class DiaryEntryType(str, Enum):
    DAILY_LOG = "DAILY_LOG"         # Ежедневная сводка
    ISSUE_RISK = "ISSUE_RISK"       # Проблема / Инцидент / Риск
    INSPECTION = "INSPECTION"       # Проверка / Авторский надзор
    WEATHER_STOP = "WEATHER_STOP"   # Простой по погодным условиям
    MILESTONE_FACT = "MILESTONE"    # Фиксация контрольной точки


class DiaryEntry(Base, TimeStampedUUIDModel):
    """
    Модель записи в дневник проекта:
    Связывает текстовые факты с конкретной задачей и RACI-ролью автора.
    """

    __tablename__ = "diary_entries"

    project_id: Mapped[uuid.UUID] = mapped_column(
        UUID(as_uuid=True),
        ForeignKey("portfolio_projects.id", ondelete="CASCADE"),
        nullable=False,
        index=True,
    )
    task_id: Mapped[Optional[uuid.UUID]] = mapped_column(
        UUID(as_uuid=True),
        ForeignKey("portfolio_tasks.id", ondelete="SET NULL"),
        nullable=True,
        index=True,
        doc="Опциональная привязка к конкретной задаче графика",
    )

    entry_date: Mapped[date] = mapped_column(
        Date, default=date.today, nullable=False, index=True
    )
    entry_type: Mapped[DiaryEntryType] = mapped_column(
        String(32), default=DiaryEntryType.DAILY_LOG, nullable=False
    )
    author_name: Mapped[str] = mapped_column(
        String(255), nullable=False, doc="ФИО / Имя автора записи"
    )
    author_raci_role: Mapped[Optional[str]] = mapped_column(
        String(32), nullable=True, doc="RACI-роль автора (PM, R, A, C, I)"
    )

    # Основная задача / суть записи
    content: Mapped[str] = mapped_column(
        Text, nullable=False, doc="Задача (суть инцидента или работы)"
    )
    # 11 колонок Дневника производства работ (по Фото 1)
    category: Mapped[str] = mapped_column(
        String(10), default="B", nullable=False, doc="Категория важности (A - плановое, B - внимание, C - критический риск)"
    )
    wbs_affected: Mapped[Optional[str]] = mapped_column(
        String(64), nullable=True, doc="На что влияет из план-графика (WBS код)"
    )
    line_section: Mapped[Optional[str]] = mapped_column(
        String(255), nullable=True, doc="Участок производственной линии (Буфер, IMA, Haotian, Аспирация)"
    )
    solution: Mapped[Optional[str]] = mapped_column(
        Text, nullable=True, doc="Предлагаемое инженерное решение"
    )
    physical_action: Mapped[Optional[str]] = mapped_column(
        Text, nullable=True, doc="Физически что сделать на площадке"
    )
    purpose: Mapped[Optional[str]] = mapped_column(
        Text, nullable=True, doc="Зачем всё это? (Обоснование и цель)"
    )
    deadline_str: Mapped[Optional[str]] = mapped_column(
        String(100), nullable=True, doc="Сроки выполнения"
    )
    status: Mapped[str] = mapped_column(
        String(50), default="В работе", nullable=False, doc="Статус исполнения задачи дневника"
    )
    source: Mapped[Optional[str]] = mapped_column(
        String(255), default="Оперативка", nullable=True, doc="Источник (Pyrus, Оперативка, Акт)"
    )
    issues_and_risks: Mapped[Optional[str]] = mapped_column(
        Text, nullable=True, doc="Описание препятствий или рисков срыва сроков"
    )
    weather_conditions: Mapped[Optional[str]] = mapped_column(
        String(255), nullable=True, doc="Метеоусловия (для строительных объектов)"
    )

    # Связи
    project: Mapped["PortfolioProject"] = relationship(
        "PortfolioProject", back_populates="diary_entries"
    )
    task: Mapped[Optional["PortfolioTask"]] = relationship(
        "PortfolioTask", back_populates="diary_entries"
    )

    __table_args__ = (
        Index("ix_diary_project_date", "project_id", "entry_date"),
    )