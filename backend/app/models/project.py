"""
Portfolio Project Model (12 Passport Sections).
"""

from typing import TYPE_CHECKING, Any, Dict, List, Optional
from datetime import date
from enum import Enum
from sqlalchemy import String, Date, Numeric, Text, Index
from sqlalchemy.dialects.postgresql import JSONB
from sqlalchemy.orm import Mapped, mapped_column, relationship

from app.core.database import Base
from app.models.base import TimeStampedUUIDModel

if TYPE_CHECKING:
    from app.models.task import PortfolioTask
    from app.models.diary import DiaryEntry


class ProjectStatus(str, Enum):
    INITIATION = "INITIATION"       # Инициация
    PLANNING = "PLANNING"           # Планирование
    EXECUTION = "EXECUTION"         # Реализация / Строительство
    MONITORING = "MONITORING"       # Контроль / Мониторинг
    CLOSING = "CLOSING"             # Завершение / ПНР
    ARCHIVED = "ARCHIVED"           # В архиве
    ON_HOLD = "ON_HOLD"             # Приостановлен


class PortfolioProject(Base, TimeStampedUUIDModel):
    """
    Модель паспорта проекта, содержащая 12 канонических разделов:
    1. Идентификация и общие сведения
    2. Цели, обоснование и KPI
    3. Директивные сроки (Milestones)
    4. Бюджет и финансирование (CAPEX/OPEX)
    5. Проектный RACI
    6. Границы и состав работ
    7. Риски и допущения
    8. Технические параметры объекта
    9. Контрагенты и стейкхолдеры
    10. Качество, безопасность и нормы (СРО, ГОСТ)
    11. Поставки и логистика
    12. Статус, версии и контрольные отметки
    """

    __tablename__ = "portfolio_projects"

    # --- 1. Идентификация ---
    code: Mapped[str] = mapped_column(
        String(64), unique=True, index=True, nullable=False,
        doc="Уникальный шифр/код проекта (WBS Root)"
    )
    name: Mapped[str] = mapped_column(
        String(255), nullable=False, index=True,
        doc="Официальное наименование проекта"
    )
    description: Mapped[Optional[str]] = mapped_column(
        Text, nullable=True, doc="Краткое резюме проекта"
    )
    location: Mapped[Optional[str]] = mapped_column(
        String(255), nullable=True, doc="Географическая локация объекта"
    )

    # --- 2. Статус и фаза ---
    status: Mapped[ProjectStatus] = mapped_column(
        String(32), default=ProjectStatus.PLANNING, nullable=False, index=True
    )

    # --- 3. Директивные сроки ---
    planned_start_date: Mapped[date] = mapped_column(
        Date, nullable=False, doc="Директивная дата старта проекта"
    )
    planned_finish_date: Mapped[date] = mapped_column(
        Date, nullable=False, doc="Директивная дата завершения проекта"
    )
    actual_start_date: Mapped[Optional[date]] = mapped_column(
        Date, nullable=True, doc="Фактическая дата старта"
    )
    actual_finish_date: Mapped[Optional[date]] = mapped_column(
        Date, nullable=True, doc="Фактическая дата завершения"
    )

    # --- 4. Финансы и бюджет ---
    currency: Mapped[str] = mapped_column(
        String(3), default="RUB", nullable=False, doc="Валюта бюджета (RUB, USD, CNY)"
    )
    planned_budget: Mapped[Optional[float]] = mapped_column(
        Numeric(18, 2), nullable=True, doc="Утвержденный бюджет проекта (CAPEX)"
    )
    actual_cost: Mapped[Optional[float]] = mapped_column(
        Numeric(18, 2), nullable=True, default=0.0, doc="Фактические затраты на дату"
    )

    # --- 5. Проектный RACI (JSONB) ---
    raci_matrix: Mapped[Dict[str, Any]] = mapped_column(
        JSONB, default=dict, nullable=False,
        doc="Матрица ответственности проектного уровня (RACI)"
    )

    # --- 6-12. Расширенные разделы паспорта (JSONB) ---
    passport_data: Mapped[Dict[str, Any]] = mapped_column(
        JSONB, default=dict, nullable=False,
        doc="Детальные разделы 6-12 паспорта проекта"
    )

    # Связи (Relationships)
    tasks: Mapped[List["PortfolioTask"]] = relationship(
        "PortfolioTask",
        back_populates="project",
        cascade="all, delete-orphan",
        order_by="PortfolioTask.wbs_code",
    )
    diary_entries: Mapped[List["DiaryEntry"]] = relationship(
        "DiaryEntry",
        back_populates="project",
        cascade="all, delete-orphan",
        order_by="DiaryEntry.entry_date.desc()",
    )

    __table_args__ = (
        Index("ix_portfolio_projects_code_status", "code", "status"),
    )