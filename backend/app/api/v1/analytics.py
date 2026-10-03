"""
REST Endpoints for Project Delay Analytics, Task Snapshots, and Vector Search.
"""

from typing import List, Optional
from uuid import UUID
from dataclasses import asdict
from fastapi import APIRouter, Depends, HTTPException, Query, status
from sqlalchemy.ext.asyncio import AsyncSession

from app.core.database import get_db
from app.api.deps import require_permission
from app.models.auth import User
from ai_agent.src.delay_analyzer import DelayAnalyzer
from ai_agent.src.snapshot_collector import SnapshotCollector
from ai_agent.src.vector_store import VectorStore
from app.services.overlap_analyzer import OverlapAnalyzer

router = APIRouter(tags=["Analytics & AI"])


@router.get("/projects/{project_id}/analytics/delays")
async def get_project_delay_analysis(
    project_id: UUID,
    db: AsyncSession = Depends(get_db),
):
    """
    Анализ задержек критического пути проекта (Root Cause Analysis).
    Определяет суммарный сдвиг сроков, задачи-бутылочные горлышки и RACI-факторы.
    """
    analyzer = DelayAnalyzer(db)
    try:
        report = await analyzer.analyze_project(project_id)
        return asdict(report)
    except ValueError as e:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail=str(e))


@router.post("/tasks/{task_id}/snapshots", status_code=status.HTTP_201_CREATED)
async def create_task_snapshot(
    task_id: UUID,
    db: AsyncSession = Depends(get_db),
):
    """
    Создание исторического контекстного среза задачи с генерацией pgvector-эмбеддинга.
    """
    collector = SnapshotCollector(db)
    vector_store = VectorStore(db)

    try:
        # 1. Собираем числа и нарративный текст
        snapshot = await collector.create_task_snapshot(task_id)
        
        # 2. Генерируем и сохраняем векторный эмбеддинг в pgvector
        await vector_store.save_snapshot_with_embedding(snapshot)

        return {
            "status": "created",
            "snapshot_id": str(snapshot.id),
            "task_id": str(snapshot.task_id),
            "delay_days": snapshot.delay_days,
            "is_critical": snapshot.is_critical,
            "narrative_context": snapshot.narrative_context,
            "has_embedding": snapshot.embedding is not None,
        }
    except ValueError as e:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail=str(e))


@router.get("/analytics/similar-incidents")
async def search_similar_incidents(
    query: str = Query(..., min_length=3, description="Поисковый запрос (например, 'задержка поставки бетона')"),
    limit: int = Query(default=5, ge=1, le=20),
    project_id: Optional[UUID] = Query(default=None, description="Изоляция поиска в рамках конкретного проекта"),
    current_user: User = Depends(require_permission("projects:view")),
    db: AsyncSession = Depends(get_db),
):
    """
    Семантический косинусный поиск похожих исторических задержек и инцидентов через pgvector.
    """
    vector_store = VectorStore(db)
    allowed_ids = [project_id] if project_id else None
    results = await vector_store.search_similar_incidents(
        query_text=query,
        limit=limit,
        allowed_project_ids=allowed_ids,
    )

    return [
        {
            "snapshot_id": str(snapshot.id),
            "task_id": str(snapshot.task_id),
            "similarity_score": round(similarity, 4),
            "delay_days": snapshot.delay_days,
            "is_critical": snapshot.is_critical,
            "narrative_context": snapshot.narrative_context,
            "timestamp": snapshot.snapshot_timestamp.isoformat(),
        }
        for snapshot, similarity in results
    ]


@router.get("/analytics/overlaps")
async def get_portfolio_overlaps(db: AsyncSession = Depends(get_db)):
    """
    Анализ коллизий портфеля: наложение работ на одной физической площадке
    и одновременная перегрузка одного специалиста в разных задачах.
    """
    analyzer = OverlapAnalyzer(db)
    return await analyzer.analyze()