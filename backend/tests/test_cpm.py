"""
Unit-тесты для проверки математического ядра CPM Engine.
"""

from datetime import date
import uuid
import pytest

from app.models.dependency import DependencyType
from app.models.task import TaskType
from app.services.cpm.calendar import WorkCalendar, WorkWeekType
from app.services.cpm.engine import CPMEngine
from app.services.cpm.graph import CPMGraphCycleError
from app.services.cpm.types import CPMNode, CPMEdge


# -----------------------------------------------------------------------------
# 1. Тесты производственного календаря
# -----------------------------------------------------------------------------

def test_calendar_standard_week():
    """Проверка расчета дат в стандартной 5-дневной неделе."""
    calendar = WorkCalendar(week_type=WorkWeekType.FIVE_DAYS)

    # Понедельник 7 сентября 2026 г., длительность 5 дней -> финиш в пятницу 11 сентября
    start = date(2026, 9, 7)
    finish = calendar.calculate_finish_date(start, duration_days=5)
    assert finish == date(2026, 9, 11)

    # Пятница 11 сентября 2026 г., длительность 2 дня -> финиш в понедельник 14 сентября (пропуск Сб, Вс)
    start_fri = date(2026, 9, 11)
    finish_mon = calendar.calculate_finish_date(start_fri, duration_days=2)
    assert finish_mon == date(2026, 9, 14)


def test_calendar_working_days_count():
    """Проверка подсчета рабочих дней между датами."""
    calendar = WorkCalendar(week_type=WorkWeekType.FIVE_DAYS)
    
    # Пн (7 сен) -> Пт (11 сен) = 5 рабочих дней
    count = calendar.working_days_between(date(2026, 9, 7), date(2026, 9, 11))
    assert count == 5

    # Пт (11 сен) -> Пн (14 сен) = 2 рабочих дня (Пт и Пн)
    count_weekend = calendar.working_days_between(date(2026, 9, 11), date(2026, 9, 14))
    assert count_weekend == 2


# -----------------------------------------------------------------------------
# 2. Тест обнаружения циклических зависимостей (Deadlock/Loop)
# -----------------------------------------------------------------------------

def test_cpm_cycle_detection():
    """Проверка, что цикл A -> B -> A вызывает контролируемое исключение."""
    engine = CPMEngine()

    id_a, id_b = uuid.uuid4(), uuid.uuid4()
    nodes = [
        CPMNode(id=id_a, wbs_code="1.1", name="Task A", duration_days=3),
        CPMNode(id=id_b, wbs_code="1.2", name="Task B", duration_days=4),
    ]
    edges = [
        CPMEdge(predecessor_id=id_a, successor_id=id_b),
        CPMEdge(predecessor_id=id_b, successor_id=id_a),  # Замыкание петли
    ]

    with pytest.raises(CPMGraphCycleError) as exc_info:
        engine.calculate(project_start=date(2026, 9, 7), nodes=nodes, edges=edges)

    assert "1.1" in str(exc_info.value)
    assert "1.2" in str(exc_info.value)


# -----------------------------------------------------------------------------
# 3. Тест классического графа (Diamond Network): критический путь и Total Float
# -----------------------------------------------------------------------------

def test_diamond_cpm_calculation():
    """
    Граф:
             -> Task B (5 дней, критическая) --
    Task A --                                   --> Task D (2 дня)
    (3 дня)  -> Task C (2 дня, резерв 3 дня) --
    
    Длительность проекта = 3 + 5 + 2 = 10 раб. дней.
    Критический путь: A -> B -> D.
    """
    calendar = WorkCalendar(week_type=WorkWeekType.FIVE_DAYS)
    engine = CPMEngine(calendar=calendar)

    id_a = uuid.uuid4()
    id_b = uuid.uuid4()
    id_c = uuid.uuid4()
    id_d = uuid.uuid4()

    nodes = [
        CPMNode(id=id_a, wbs_code="1.0", name="Task A (Init)", duration_days=3),
        CPMNode(id=id_b, wbs_code="2.1", name="Task B (Long Path)", duration_days=5),
        CPMNode(id=id_c, wbs_code="2.2", name="Task C (Short Path)", duration_days=2),
        CPMNode(id=id_d, wbs_code="3.0", name="Task D (Final)", duration_days=2),
    ]

    edges = [
        CPMEdge(predecessor_id=id_a, successor_id=id_b, dependency_type=DependencyType.FINISH_TO_START),
        CPMEdge(predecessor_id=id_a, successor_id=id_c, dependency_type=DependencyType.FINISH_TO_START),
        CPMEdge(predecessor_id=id_b, successor_id=id_d, dependency_type=DependencyType.FINISH_TO_START),
        CPMEdge(predecessor_id=id_c, successor_id=id_d, dependency_type=DependencyType.FINISH_TO_START),
    ]

    project_start = date(2026, 9, 7)  # Понедельник
    result = engine.calculate(project_start=project_start, nodes=nodes, edges=edges)

    # 1. Проверка общей длительности
    assert result.total_duration_days == 10

    # 2. Проверка критического пути
    assert result.critical_path_wbs == ["1.0", "2.1", "3.0"]

    # 3. Проверка узлов
    nodes_by_wbs = {n.wbs_code: n for n in result.tasks}

    # Task A: Пн (7 сен) -> Ср (9 сен)
    task_a = nodes_by_wbs["1.0"]
    assert task_a.early_start == date(2026, 9, 7)
    assert task_a.early_finish == date(2026, 9, 9)
    assert task_a.total_float == 0
    assert task_a.is_critical is True

    # Task B: Чт (10 сен) -> Ср (16 сен) (переход через выходные)
    task_b = nodes_by_wbs["2.1"]
    assert task_b.early_start == date(2026, 9, 10)
    assert task_b.early_finish == date(2026, 9, 16)
    assert task_b.total_float == 0
    assert task_b.is_critical is True

    # Task C: Чт (10 сен) -> Пт (11 сен), Total Float = 3 дня (16 сен - 11 сен)
    task_c = nodes_by_wbs["2.2"]
    assert task_c.early_start == date(2026, 9, 10)
    assert task_c.early_finish == date(2026, 9, 11)
    assert task_c.total_float == 3
    assert task_c.is_critical is False

    # Task D: Чт (17 сен) -> Пт (18 сен)
    task_d = nodes_by_wbs["3.0"]
    assert task_d.early_start == date(2026, 9, 17)
    assert task_d.early_finish == date(2026, 9, 18)
    assert task_d.total_float == 0
    assert task_d.is_critical is True


# -----------------------------------------------------------------------------
# 4. Тест вех (Milestones) и положительного лага (+Lag)
# -----------------------------------------------------------------------------

def test_milestone_and_lag():
    """Проверка связи FS с лагом +1 день и завершающей вехи (0 дней)."""
    calendar = WorkCalendar(week_type=WorkWeekType.FIVE_DAYS)
    engine = CPMEngine(calendar=calendar)

    id_task = uuid.uuid4()
    id_milestone = uuid.uuid4()

    nodes = [
        CPMNode(id=id_task, wbs_code="1.1", name="Base Task", duration_days=2),
        CPMNode(id=id_milestone, wbs_code="1.2", name="Release Milestone", duration_days=0, task_type=TaskType.MILESTONE),
    ]

    # Связь FS с лагом в 1 рабочий день
    edges = [
        CPMEdge(predecessor_id=id_task, successor_id=id_milestone, dependency_type=DependencyType.FINISH_TO_START, lag_days=1)
    ]

    start = date(2026, 9, 7)  # Пн
    result = engine.calculate(project_start=start, nodes=nodes, edges=edges)

    task = [n for n in result.tasks if n.wbs_code == "1.1"][0]
    milestone = [n for n in result.tasks if n.wbs_code == "1.2"][0]

    # Task: Пн-Вт (7-8 сен)
    assert task.early_start == date(2026, 9, 7)
    assert task.early_finish == date(2026, 9, 8)

    # Milestone: Старт = Вт + 1 раб. день (Ср) + lag 1 раб. день = Чт (10 сен)
    assert milestone.early_start == date(2026, 9, 10)
    assert milestone.early_finish == date(2026, 9, 10)