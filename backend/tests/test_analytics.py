"""
Тесты для модуля аналитики задержек, сбора срезов и векторного поиска pgvector.
"""

from datetime import date
import uuid
import pytest
from httpx import ASGITransport, AsyncClient

from app.main import app
from app.core.database import AsyncSessionLocal
from app.models.project import PortfolioProject, ProjectStatus
from app.models.task import PortfolioTask, TaskStatus
from app.models.diary import DiaryEntry, DiaryEntryType
from ai_agent.src.snapshot_collector import SnapshotCollector
from ai_agent.src.vector_store import VectorStore
from ai_agent.src.delay_analyzer import DelayAnalyzer


@pytest.mark.asyncio
async def test_snapshot_collector_and_pgvector_search():
    """Тест создания контекстного среза, записи вектора в pgvector и косинусного поиска."""
    async with AsyncSessionLocal() as session:
        # 1. Создаем тестовый проект и задачу с записью в дневнике
        proj_code = f"PRJ-VEC-{uuid.uuid4().hex[:6].upper()}"
        project = PortfolioProject(
            code=proj_code,
            name="Проект с задержкой бетонирования",
            planned_start_date=date(2026, 9, 1),
            planned_finish_date=date(2026, 10, 1),
            status=ProjectStatus.EXECUTION,
        )
        session.add(project)
        await session.flush()

        task = PortfolioTask(
            project_id=project.id,
            wbs_code="1.1",
            name="Заливка фундаментной плиты",
            planned_duration=5,
            planned_start=date(2026, 9, 1),
            planned_finish=date(2026, 9, 5),
            actual_start=date(2026, 9, 1),
            actual_finish=date(2026, 9, 10),  # Отставание на 5 дней
            progress_percent=100.0,
            status=TaskStatus.COMPLETED,
            is_critical=True,
            total_float=0,
            raci_assignee="ООО 'МонолитСтрой'",
        )
        session.add(task)
        await session.flush()

        diary = DiaryEntry(
            project_id=project.id,
            task_id=task.id,
            entry_date=date(2026, 9, 4),
            entry_type=DiaryEntryType.ISSUE_RISK,
            author_name="Иванов И.И.",
            author_raci_role="PM",
            content="Срыв графика бетонирования.",
            issues_and_risks="Поломка бетононасоса и простой автобетоносмесителей 8 часов.",
        )
        session.add(diary)
        await session.commit()

        # 2. Создаем срез задачи (Snapshot)
        collector = SnapshotCollector(session)
        snapshot = await collector.create_task_snapshot(task.id)

        assert snapshot.delay_days == 5
        assert snapshot.is_critical is True
        assert "Поломка бетононасоса" in snapshot.narrative_context
        assert "ООО 'МонолитСтрой'" in snapshot.narrative_context

        # 3. Сохраняем вектор в pgvector
        vector_store = VectorStore(session)
        await vector_store.save_snapshot_with_embedding(snapshot)
        assert snapshot.embedding is not None
        assert len(snapshot.embedding) == 1536

        # 4. Проверяем косинусный поиск через pgvector (ищем по ключевым словам)
        search_results = await vector_store.search_similar_incidents(
            "Поломка бетононасоса и простой автобетоносмесителей", limit=10
        )
        assert len(search_results) > 0
        found_ids = [s.id for s, _ in search_results]
        assert snapshot.id in found_ids


@pytest.mark.asyncio
async def test_delay_analyzer_engine():
    """Тест движка анализа первопричин срыва сроков (DelayAnalyzer)."""
    async with AsyncSessionLocal() as session:
        proj_code = f"PRJ-DELAY-{uuid.uuid4().hex[:6].upper()}"
        project = PortfolioProject(
            code=proj_code,
            name="Промышленный комплекс №4",
            planned_start_date=date(2026, 9, 1),
            planned_finish_date=date(2026, 12, 31),
            status=ProjectStatus.EXECUTION,
        )
        session.add(project)
        await session.flush()

        # Задача 1: Критическая с задержкой на 7 дней
        task1 = PortfolioTask(
            project_id=project.id,
            wbs_code="1.0",
            name="Монтаж опорных колонн",
            planned_duration=10,
            planned_start=date(2026, 9, 1),
            planned_finish=date(2026, 9, 10),
            actual_start=date(2026, 9, 1),
            actual_finish=date(2026, 9, 17),  # Задержка 7 дней
            status=TaskStatus.COMPLETED,
            is_critical=True,
            total_float=0,
            raci_assignee="Бригада Монтажников №1",
        )
        session.add(task1)
        await session.commit()

        analyzer = DelayAnalyzer(session)
        report = await analyzer.analyze_project(project.id)

        assert report.total_critical_delay_days == 7
        assert report.delayed_tasks_count >= 1
        assert len(report.critical_delayed_tasks) == 1
        assert report.critical_delayed_tasks[0].wbs_code == "1.0"
        assert "Бригада Монтажников №1" in report.raci_delay_distribution
        assert any("Монтаж опорных колонн" in cause for cause in report.root_cause_summary)


@pytest.mark.asyncio
async def test_analytics_api_endpoints():
    """Тест REST API эндпоинтов аналитики."""
    transport = ASGITransport(app=app)
    async with AsyncClient(transport=transport, base_url="http://test") as ac:
        # 1. Создаем проект
        proj_res = await ac.post(
            "/api/v1/projects",
            json={
                "code": f"PRJ-ANL-{uuid.uuid4().hex[:6].upper()}",
                "name": "Аналитический тестовый проект",
                "planned_start_date": "2026-09-01",
                "planned_finish_date": "2026-10-01",
            },
        )
        project_id = proj_res.json()["id"]

        # 2. Создаем задачу
        task_res = await ac.post(
            f"/api/v1/projects/{project_id}/tasks",
            json={
                "project_id": project_id,
                "wbs_code": "1.0",
                "name": "Устройство кровли",
                "planned_duration": 5,
                "planned_start": "2026-09-01",
                "planned_finish": "2026-09-05",
                "dependencies": [],
            },
        )
        task_id = task_res.json()["id"]

        # 3. Вызов API создания среза
        snapshot_res = await ac.post(f"/api/v1/tasks/{task_id}/snapshots")
        assert snapshot_res.status_code == 201
        assert snapshot_res.json()["has_embedding"] is True

        # 4. Вызов API отчета по задержкам
        delays_res = await ac.get(f"/api/v1/projects/{project_id}/analytics/delays")
        assert delays_res.status_code == 200
        assert "total_critical_delay_days" in delays_res.json()

        # 5. Вызов API семантического поиска
        search_res = await ac.get("/api/v1/analytics/similar-incidents?query=кровля")
        assert search_res.status_code == 200
        assert isinstance(search_res.json(), list)