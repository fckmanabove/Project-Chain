"""
CPM Engine - Реализация алгоритмов прямого и обратного прохода (Forward & Backward Pass).
"""

from datetime import date, timedelta
from typing import Dict, List, Optional
from uuid import UUID

from app.models.dependency import DependencyType
from app.models.task import TaskType
from app.services.cpm.calendar import WorkCalendar
from app.services.cpm.graph import CPMGraphTopology
from app.services.cpm.types import CPMNode, CPMEdge, CPMGraphResult


class CPMEngine:
    """
    Математический калькулятор критического пути (CPM).
    """

    def __init__(self, calendar: Optional[WorkCalendar] = None):
        self.calendar = calendar or WorkCalendar()

    def calculate(
        self,
        project_start: date,
        nodes: List[CPMNode],
        edges: List[CPMEdge],
    ) -> CPMGraphResult:
        """
        Главная точка входа для пересчета всего графа проекта.
        """
        if not nodes:
            return CPMGraphResult(
                project_start=project_start,
                project_finish=project_start,
                total_duration_days=0,
                critical_path_wbs=[],
                tasks=[],
            )

        # 1. Построение топологии и проверка на циклы
        topology = CPMGraphTopology(nodes=nodes, edges=edges)
        ordered_nodes = topology.get_topological_order()
        nodes_map: Dict[UUID, CPMNode] = topology.nodes_map

        # 2. Forward Pass (Прямой проход: расчет Early Start и Early Finish)
        self._forward_pass(project_start, ordered_nodes, nodes_map)

        # 3. Определение даты завершения проекта
        project_finish = max(
            (node.early_finish for node in ordered_nodes if node.early_finish is not None),
            default=project_start,
        )

        # 4. Backward Pass (Обратный проход: расчет Late Start и Late Finish)
        self._backward_pass(project_finish, ordered_nodes, nodes_map)

        # 5. Расчет Total Float, Free Float и Critical Path
        critical_wbs_list = self._calculate_floats_and_criticality(ordered_nodes, nodes_map)

        # 6. Расчет общей длительности проекта в рабочих днях
        total_duration = self.calendar.working_days_between(project_start, project_finish)

        return CPMGraphResult(
            project_start=project_start,
            project_finish=project_finish,
            total_duration_days=total_duration,
            critical_path_wbs=critical_wbs_list,
            tasks=list(nodes_map.values()),
        )

    def _forward_pass(
        self,
        project_start: date,
        ordered_nodes: List[CPMNode],
        nodes_map: Dict[UUID, CPMNode],
    ) -> None:
        """
        Прямой проход по графу в порядке топологической сортировки.
        """
        for node in ordered_nodes:
            # Бизнес-правило MVP DNA: если есть факт, фиксируем блокировку
            if node.actual_start is not None or node.actual_finish is not None:
                node.is_plan_locked = True

            earliest_possible_start = project_start

            if not node.incoming_edges:
                # Начальный узел без предшественников
                node.early_start = project_start
            else:
                candidate_starts: List[date] = []

                for edge in node.incoming_edges:
                    pred = nodes_map[edge.predecessor_id]
                    if pred.early_start is None or pred.early_finish is None:
                        continue

                    cand_start = self._calc_successor_early_start(
                        pred=pred,
                        succ=node,
                        dep_type=edge.dependency_type,
                        lag=edge.lag_days,
                    )
                    candidate_starts.append(cand_start)

                if candidate_starts:
                    earliest_possible_start = max(candidate_starts)
                node.early_start = earliest_possible_start

            # Вычисляем Early Finish на основе календаря и длительности
            if node.task_type == TaskType.MILESTONE or node.duration_days == 0:
                node.early_finish = node.early_start
            else:
                node.early_finish = self.calendar.calculate_finish_date(
                    node.early_start, node.duration_days
                )

    def _calc_successor_early_start(
        self,
        pred: CPMNode,
        succ: CPMNode,
        dep_type: DependencyType,
        lag: int,
    ) -> date:
        """
        Вычисляет ранний старт последователя в зависимости от типа связи (FS, SS, FF, SF) и лага.
        """
        assert pred.early_start is not None
        assert pred.early_finish is not None

        if dep_type == DependencyType.FINISH_TO_START:  # FS
            # Старт на следующий рабочий день после финиша предшественника + лаг
            base_date = self.calendar.add_working_days(pred.early_finish, 1)
            return self.calendar.add_working_days(base_date, lag)

        elif dep_type == DependencyType.START_TO_START:  # SS
            # Старт одновременно со стартом предшественника + лаг
            return self.calendar.add_working_days(pred.early_start, lag)

        elif dep_type == DependencyType.FINISH_TO_FINISH:  # FF
            # Финиш последователя должен быть не раньше (pred.EF + lag)
            target_finish = self.calendar.add_working_days(pred.early_finish, lag)
            if succ.duration_days <= 1:
                return target_finish
            # ES = Finish - (Duration - 1)
            return self.calendar.add_working_days(target_finish, -(succ.duration_days - 1))

        elif dep_type == DependencyType.START_TO_FINISH:  # SF
            # Финиш последователя должен быть не раньше (pred.ES + lag)
            target_finish = self.calendar.add_working_days(pred.early_start, lag)
            if succ.duration_days <= 1:
                return target_finish
            return self.calendar.add_working_days(target_finish, -(succ.duration_days - 1))

        return pred.early_finish

    def _backward_pass(
        self,
        project_finish: date,
        ordered_nodes: List[CPMNode],
        nodes_map: Dict[UUID, CPMNode],
    ) -> None:
        """
        Обратный проход по графу (в обратном топологическом порядке).
        """
        for node in reversed(ordered_nodes):
            if not node.outgoing_edges:
                # Конечный узел: Late Finish равен финишу проекта
                node.late_finish = project_finish
            else:
                candidate_finishes: List[date] = []

                for edge in node.outgoing_edges:
                    succ = nodes_map[edge.successor_id]
                    if succ.late_start is None or succ.late_finish is None:
                        continue

                    cand_finish = self._calc_predecessor_late_finish(
                        pred=node,
                        succ=succ,
                        dep_type=edge.dependency_type,
                        lag=edge.lag_days,
                    )
                    candidate_finishes.append(cand_finish)

                if candidate_finishes:
                    node.late_finish = min(candidate_finishes)
                else:
                    node.late_finish = project_finish

            # Вычисляем Late Start (LS = LF - (Duration - 1))
            if node.task_type == TaskType.MILESTONE or node.duration_days == 0:
                node.late_start = node.late_finish
            else:
                if node.duration_days == 1:
                    node.late_start = node.late_finish
                else:
                    node.late_start = self.calendar.add_working_days(
                        node.late_finish, -(node.duration_days - 1)
                    )

    def _calc_predecessor_late_finish(
        self,
        pred: CPMNode,
        succ: CPMNode,
        dep_type: DependencyType,
        lag: int,
    ) -> date:
        """
        Вычисляет поздний финиш предшественника при обратном проходе.
        """
        assert succ.late_start is not None
        assert succ.late_finish is not None

        if dep_type == DependencyType.FINISH_TO_START:  # FS
            # LF предшественника = LS последователя - 1 рабочий день - lag
            base_date = self.calendar.add_working_days(succ.late_start, -1)
            return self.calendar.add_working_days(base_date, -lag)

        elif dep_type == DependencyType.START_TO_START:  # SS
            # LS предшественника <= LS последователя - lag => LF = LS + (Duration - 1)
            pred_ls = self.calendar.add_working_days(succ.late_start, -lag)
            return self.calendar.calculate_finish_date(pred_ls, pred.duration_days)

        elif dep_type == DependencyType.FINISH_TO_FINISH:  # FF
            # LF предшественника <= LF последователя - lag
            return self.calendar.add_working_days(succ.late_finish, -lag)

        elif dep_type == DependencyType.START_TO_FINISH:  # SF
            pred_ls = self.calendar.add_working_days(succ.late_finish, -lag)
            return self.calendar.calculate_finish_date(pred_ls, pred.duration_days)

        return succ.late_start

    def _calculate_floats_and_criticality(
        self,
        ordered_nodes: List[CPMNode],
        nodes_map: Dict[UUID, CPMNode],
    ) -> List[str]:
        """
        Вычисляет Total Float, Free Float и формирует список критических задач.
        """
        critical_wbs: List[str] = []

        for node in ordered_nodes:
            assert node.early_start is not None
            assert node.late_start is not None
            assert node.early_finish is not None

            # Total Float = разница между ранним и поздним стартом (в рабочих днях)
            node.total_float = self.calendar.working_days_between(
                node.early_start, node.late_start
            )
            # В случаях совпадения дат working_days_between вернет 1, если start == finish
            if node.early_start == node.late_start:
                node.total_float = 0
            else:
                # Знак и точное количество дней смещения
                if node.late_start > node.early_start:
                    node.total_float = self.calendar.working_days_between(node.early_start, node.late_start) - 1
                else:
                    node.total_float = -(self.calendar.working_days_between(node.late_start, node.early_start) - 1)

            # Free Float = min(ES последователя - EF узла - 1)
            if not node.outgoing_edges:
                node.free_float = node.total_float
            else:
                free_floats = []
                for edge in node.outgoing_edges:
                    succ = nodes_map[edge.successor_id]
                    if succ.early_start is not None and edge.dependency_type == DependencyType.FINISH_TO_START:
                        gap = self.calendar.working_days_between(node.early_finish, succ.early_start) - 2 - edge.lag_days
                        free_floats.append(max(0, gap))
                node.free_float = min(free_floats) if free_floats else node.total_float

            # Критический путь: Total Float <= 0
            if node.total_float <= 0:
                node.is_critical = True
                critical_wbs.append(node.wbs_code)
            else:
                node.is_critical = False

        return critical_wbs