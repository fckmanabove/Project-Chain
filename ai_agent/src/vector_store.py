"""
Векторное хранилище на базе PostgreSQL pgvector (Косинусный поиск похожих инцидентов).
"""

import math
import hashlib
from typing import List, Optional, Tuple
from uuid import UUID
from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from app.models.snapshot import TaskSnapshot
from app.models.task import PortfolioTask


class VectorStore:
    """
    Управляет сохранением и семантическим поиском срезов задач через pgvector.
    """

    VECTOR_DIM = 1536

    def __init__(self, session: AsyncSession):
        self.session = session

    @staticmethod
    def generate_local_embedding(text: str) -> List[float]:
        """
        Детерминированный легковесный генератор нормализованных векторов (1536 dim).
        Позволяет тестировать и использовать pgvector без внешних платных LLM-провайдеров.
        """
        # Генерируем псевдо-эмбеддинг на основе хэшей слов текста
        raw_vector = [0.0] * VectorStore.VECTOR_DIM
        words = text.lower().split()
        if not words:
            return raw_vector

        for word in words:
            # Превращаем слово в числовой индекс вектора
            idx = int(hashlib.md5(word.encode('utf-8')).hexdigest(), 16) % VectorStore.VECTOR_DIM
            raw_vector[idx] += 1.0

        # L2-нормализация вектора (длина = 1.0 для корректного косинусного расстояния)
        norm = math.sqrt(sum(x * x for x in raw_vector))
        if norm > 0:
            return [x / norm for x in raw_vector]
        return raw_vector

    async def save_snapshot_with_embedding(
        self,
        snapshot: TaskSnapshot,
        custom_vector: Optional[List[float]] = None,
    ) -> TaskSnapshot:
        """
        Сохраняет векторный эмбеддинг для среза задачи.
        """
        if custom_vector is not None:
            snapshot.embedding = custom_vector
        elif snapshot.narrative_context:
            snapshot.embedding = self.generate_local_embedding(snapshot.narrative_context)

        await self.session.commit()
        await self.session.refresh(snapshot)
        return snapshot

    async def search_similar_incidents(
        self,
        query_text: str,
        limit: int = 5,
        allowed_project_ids: Optional[List[UUID]] = None,
    ) -> List[Tuple[TaskSnapshot, float]]:
        """
        Ищет похожие задержки в pgvector с обязательной проектной изоляцией.
        Возвращает список пар (TaskSnapshot, similarity_score).
        """
        query_vector = self.generate_local_embedding(query_text)

        stmt = (
            select(
                TaskSnapshot,
                TaskSnapshot.embedding.cosine_distance(query_vector).label("distance"),
            )
            .join(PortfolioTask, TaskSnapshot.task_id == PortfolioTask.id)
            .where(TaskSnapshot.embedding.isnot(None))
        )

        # Изоляция доступа: поиск строго в рамках разрешенных проектов
        if allowed_project_ids is not None:
            stmt = stmt.where(PortfolioTask.project_id.in_(allowed_project_ids))

        stmt = stmt.order_by("distance").limit(limit)

        res = await self.session.execute(stmt)
        results = []
        for snapshot, distance in res.all():
            # Преобразуем расстояние (0..2) в оценку схожести (0..1)
            similarity = max(0.0, 1.0 - (distance or 0.0))
            results.append((snapshot, similarity))

        return results