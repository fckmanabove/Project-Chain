"""
Внутренние DTO и структуры данных для CPM Engine.
"""

from dataclasses import dataclass, field
from datetime import date
from typing import List, Optional
from uuid import UUID

from app.models.dependency import DependencyType
from app.models.task import TaskType


@dataclass
class CPMEdge:
    """Ориентированное ребро графа (связь между задачами)."""
    predecessor_id: UUID
    successor_id: UUID
    dependency_type: DependencyType = DependencyType.FINISH_TO_START
    lag_days: int = 0


@dataclass
class CPMNode:
    """Узел графа (задача с параметрами для расчета CPM)."""
    id: UUID
    wbs_code: str
    name: str
    duration_days: int
    task_type: TaskType = TaskType.TASK
    
    # Базовые директивные даты (Baseline)
    planned_start: Optional[date] = None
    planned_finish: Optional[date] = None
    
    # Фактические даты (Actuals)
    actual_start: Optional[date] = None
    actual_finish: Optional[date] = None
    progress_percent: float = 0.0
    is_plan_locked: bool = False
    
    # Расчетные значения CPM (Forward & Backward pass)
    early_start: Optional[date] = None
    early_finish: Optional[date] = None
    late_start: Optional[date] = None
    late_finish: Optional[date] = None
    total_float: int = 0
    free_float: int = 0
    is_critical: bool = False

    # Ссылки на входящие и исходящие связи
    incoming_edges: List[CPMEdge] = field(default_factory=list)
    outgoing_edges: List[CPMEdge] = field(default_factory=list)


@dataclass
class CPMGraphResult:
    """Результат расчета графа CPM для всего проекта."""
    project_start: date
    project_finish: date
    total_duration_days: int
    critical_path_wbs: List[str]
    tasks: List[CPMNode]