"""
Построение топологии графа CPM и проверка на циклические зависимости.
"""

from typing import Dict, List, Set
from uuid import UUID
import networkx as nx

from app.services.cpm.types import CPMNode, CPMEdge


class CPMGraphCycleError(Exception):
    """Исключение при обнаружении цикла в графе зависимостей."""
    def __init__(self, cycle_wbs_path: List[str]):
        self.cycle_path = " -> ".join(cycle_wbs_path)
        super().__init__(f"Обнаружена циклическая зависимость в графике: {self.cycle_path}")


class CPMGraphTopology:
    """
    Класс для управления топологией графа CPM на основе NetworkX.
    """

    def __init__(self, nodes: List[CPMNode], edges: List[CPMEdge]):
        self.nodes_map: Dict[UUID, CPMNode] = {n.id: n for n in nodes}
        self.edges = edges
        self.graph = nx.DiGraph()
        
        self._build_graph()

    def _build_graph(self) -> None:
        """Инициализирует граф NetworkX и связывает узлы с ребрами."""
        for node_id, node in self.nodes_map.items():
            self.graph.add_node(node_id, wbs=node.wbs_code)
            node.incoming_edges.clear()
            node.outgoing_edges.clear()

        for edge in self.edges:
            if edge.predecessor_id in self.nodes_map and edge.successor_id in self.nodes_map:
                self.graph.add_edge(
                    edge.predecessor_id,
                    edge.successor_id,
                    dep_type=edge.dependency_type,
                    lag=edge.lag_days,
                )
                # Привязываем ребра к объектам CPMNode
                self.nodes_map[edge.predecessor_id].outgoing_edges.append(edge)
                self.nodes_map[edge.successor_id].incoming_edges.append(edge)

    def validate_acyclic(self) -> None:
        """
        Проверяет граф на отсутствие петель и циклов.
        Выбрасывает CPMGraphCycleError с читаемым WBS-путем при обнаружении петли.
        """
        if not nx.is_directed_acyclic_graph(self.graph):
            cycles = list(nx.simple_cycles(self.graph))
            if cycles:
                first_cycle_ids = cycles[0]
                # Добавляем начальную точку в конец для наглядности (A -> B -> A)
                first_cycle_ids.append(first_cycle_ids[0])
                cycle_wbs = [
                    self.nodes_map[node_id].wbs_code 
                    for node_id in first_cycle_ids 
                    if node_id in self.nodes_map
                ]
                raise CPMGraphCycleError(cycle_wbs)

    def get_topological_order(self) -> List[CPMNode]:
        """
        Возвращает список узлов в порядке топологической сортировки (слева направо).
        Используется для Forward Pass (прямого прохода).
        """
        self.validate_acyclic()
        sorted_ids = list(nx.topological_sort(self.graph))
        return [self.nodes_map[nid] for nid in sorted_ids]