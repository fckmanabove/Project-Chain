"""
Pydantic v2 Schemas for Portfolio Projects (Passport).
"""

from datetime import date, datetime
from typing import Any, Dict, List, Optional
from uuid import UUID
from pydantic import BaseModel, ConfigDict, Field

from app.models.project import ProjectStatus


class ProjectBase(BaseModel):
    code: str = Field(..., max_length=64, description="Уникальный шифр проекта (WBS Root)")
    name: str = Field(..., max_length=255, description="Наименование проекта")
    description: Optional[str] = None
    location: Optional[str] = None
    status: ProjectStatus = ProjectStatus.PLANNING
    planned_start_date: date
    planned_finish_date: date
    currency: str = Field(default="RUB", max_length=3)
    planned_budget: Optional[float] = None
    raci_matrix: Dict[str, Any] = Field(default_factory=dict)
    passport_data: Dict[str, Any] = Field(default_factory=dict)


class ProjectCreate(ProjectBase):
    pass


class ProjectUpdate(BaseModel):
    name: Optional[str] = None
    description: Optional[str] = None
    location: Optional[str] = None
    status: Optional[ProjectStatus] = None
    planned_start_date: Optional[date] = None
    planned_finish_date: Optional[date] = None
    actual_start_date: Optional[date] = None
    actual_finish_date: Optional[date] = None
    planned_budget: Optional[float] = None
    actual_cost: Optional[float] = None
    raci_matrix: Optional[Dict[str, Any]] = None
    passport_data: Optional[Dict[str, Any]] = None


class ProjectResponse(ProjectBase):
    id: UUID
    actual_start_date: Optional[date] = None
    actual_finish_date: Optional[date] = None
    actual_cost: Optional[float] = None
    created_at: datetime
    updated_at: datetime

    model_config = ConfigDict(from_attributes=True)