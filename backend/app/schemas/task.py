"""
Pydantic v2 Schemas for Tasks and Dependencies.
"""

from datetime import date, datetime
from typing import Any, Dict, List, Optional
from uuid import UUID
from pydantic import BaseModel, ConfigDict, Field

from app.models.dependency import DependencyType
from app.models.task import TaskStatus, TaskType


class DependencyCreate(BaseModel):
    predecessor_task_id: UUID
    dependency_type: DependencyType = DependencyType.FINISH_TO_START
    lag_days: int = 0


class DependencyResponse(BaseModel):
    id: UUID
    predecessor_task_id: UUID
    successor_task_id: UUID
    dependency_type: DependencyType
    lag_days: int

    model_config = ConfigDict(from_attributes=True)


class TaskBase(BaseModel):
    wbs_code: str = Field(..., max_length=64, description="Иерархический код (например, '1.2')")
    name: str = Field(..., max_length=500, description="Наименование работы")
    task_type: TaskType = TaskType.TASK
    status: TaskStatus = TaskStatus.NOT_STARTED
    planned_duration: int = Field(default=1, ge=0)
    planned_start: date
    planned_finish: date
    actual_start: Optional[date] = None
    actual_finish: Optional[date] = None
    progress_percent: float = Field(default=0.0, ge=0.0, le=100.0)
    raci_assignee: Optional[str] = None
    raci_approver: Optional[str] = None
    raci_consulted: List[str] = Field(default_factory=list)
    raci_informed: List[str] = Field(default_factory=list)
    custom_attributes: Dict[str, Any] = Field(default_factory=dict)


class TaskCreate(TaskBase):
    project_id: UUID
    dependencies: List[DependencyCreate] = Field(default_factory=list)


class TaskUpdate(BaseModel):
    name: Optional[str] = None
    task_type: Optional[TaskType] = None
    status: Optional[TaskStatus] = None
    planned_duration: Optional[int] = None
    planned_start: Optional[date] = None
    planned_finish: Optional[date] = None
    actual_start: Optional[date] = None
    actual_finish: Optional[date] = None
    progress_percent: Optional[float] = None
    is_plan_locked: Optional[bool] = None
    raci_assignee: Optional[str] = None
    raci_approver: Optional[str] = None
    raci_assignee: Optional[str] = None
    raci_approver: Optional[str] = None
    raci_assignee: Optional[str] = None
    raci_approver: Optional[str] = None
    raci_consulted: Optional[List[str]] = None
    raci_informed: Optional[List[str]] = None
    custom_attributes: Optional[Dict[str, Any]] = None


class TaskResponse(TaskBase):
    id: UUID
    project_id: UUID
    parent_wbs: Optional[str] = None
    level: int
    sort_order: int
    is_plan_locked: bool
    
    # CPM Fields
    early_start: Optional[date] = None
    early_finish: Optional[date] = None
    late_start: Optional[date] = None
    late_finish: Optional[date] = None
    total_float: int
    free_float: int
    is_critical: bool
    
    predecessor_links: List[DependencyResponse] = Field(default_factory=list)
    created_at: datetime
    updated_at: datetime

    model_config = ConfigDict(from_attributes=True)