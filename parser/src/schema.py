"""
Схемы и DTO для валидации спарсенных данных из Excel (Умные таблицы).
"""

from datetime import date
from typing import Any, Dict, List, Optional
from pydantic import BaseModel, Field


class ParsedDependency(BaseModel):
    """Связь между задачами из Excel."""
    predecessor_wbs: str = Field(..., description="WBS-код предшественника (например, '1.1')")
    dependency_type: str = Field(default="FS", description="Тип связи (FS, SS, FF, SF)")
    lag_days: int = Field(default=0, description="Лаг в днях")


class ParsedTask(BaseModel):
    """Задача календарного плана из Tbl_Tasks_*."""
    wbs_code: str = Field(..., description="Иерархический WBS-код (например, '1.2.1')")
    name: str = Field(..., description="Наименование работы")
    duration_days: int = Field(default=1, description="Плановая длительность в рабочих днях")
    planned_start: date = Field(..., description="Плановый старт")
    planned_finish: date = Field(..., description="Плановый финиш")
    
    # Фактические отметки
    actual_start: Optional[date] = None
    actual_finish: Optional[date] = None
    progress_percent: float = Field(default=0.0, ge=0.0, le=100.0)

    # RACI
    raci_assignee: Optional[str] = None
    raci_approver: Optional[str] = None

    # Связи (исходные строковые записи из ячеек Excel)
    dependencies: List[ParsedDependency] = Field(default_factory=list)
    custom_attributes: Dict[str, Any] = Field(default_factory=dict)


class ParsedProjectPassport(BaseModel):
    """Паспорт проекта из Tbl_Project_* (12 разделов)."""
    code: str = Field(..., description="Шифр проекта (WBS Root)")
    name: str = Field(..., description="Наименование проекта")
    description: Optional[str] = None
    location: Optional[str] = None
    currency: str = "RUB"
    planned_budget: Optional[float] = None
    
    planned_start_date: date
    planned_finish_date: date
    
    # Структурированные метаданные RACI и разделов 6-12
    raci_matrix: Dict[str, Any] = Field(default_factory=dict)
    passport_data: Dict[str, Any] = Field(default_factory=dict)


class ParsedProjectPackage(BaseModel):
    """Полный пакет проекта, извлеченный из файла Excel."""
    passport: ParsedProjectPassport
    tasks: List[ParsedTask] = Field(default_factory=list)
    source_filename: str