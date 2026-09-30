"""
Интеграционные тесты для FastAPI REST Endpoints, CPM Recalculate и Redis Live Locks.
"""

import uuid
from datetime import date
import pytest
from httpx import ASGITransport, AsyncClient

from app.main import app


@pytest.mark.asyncio
async def test_health_endpoint():
    """Проверка доступности health check."""
    transport = ASGITransport(app=app)
    async with AsyncClient(transport=transport, base_url="http://test") as ac:
        response = await ac.get("/health")
    assert response.status_code == 200
    assert response.json()["status"] == "online"


@pytest.mark.asyncio
async def test_project_crud_and_cpm_recalculate():
    """Сквозной тест создания проекта, задач и ручного запуска расчета CPM."""
    transport = ASGITransport(app=app)
    async with AsyncClient(transport=transport, base_url="http://test") as ac:
        proj_code = f"PRJ-API-{uuid.uuid4().hex[:6].upper()}"

        # 1. Создание паспорта проекта
        proj_payload = {
            "code": proj_code,
            "name": "Тестовый промышленный объект",
            "planned_start_date": "2026-09-01",
            "planned_finish_date": "2026-12-31",
            "currency": "RUB",
            "planned_budget": 50000000.0,
        }
        res = await ac.post("/api/v1/projects", json=proj_payload)
        assert res.status_code == 201
        project_id = res.json()["id"]

        # 2. Создание двух связанных задач (A -> B)
        task_a_payload = {
            "project_id": project_id,
            "wbs_code": "1.0",
            "name": "Фундамент",
            "planned_duration": 5,
            "planned_start": "2026-09-01",
            "planned_finish": "2026-09-05",
            "dependencies": [],
        }
        res_a = await ac.post(f"/api/v1/projects/{project_id}/tasks", json=task_a_payload)
        assert res_a.status_code == 201
        task_a_id = res_a.json()["id"]

        task_b_payload = {
            "project_id": project_id,
            "wbs_code": "2.0",
            "name": "Монтаж каркаса",
            "planned_duration": 10,
            "planned_start": "2026-09-08",
            "planned_finish": "2026-09-18",
            "dependencies": [
                {
                    "predecessor_task_id": task_a_id,
                    "dependency_type": "FS",
                    "lag_days": 0,
                }
            ],
        }
        res_b = await ac.post(f"/api/v1/projects/{project_id}/tasks", json=task_b_payload)
        assert res_b.status_code == 201

        # 3. Запуск пересчета CPM графа через API
        recalc_res = await ac.post(f"/api/v1/projects/{project_id}/recalculate")
        assert recalc_res.status_code == 200
        calc_data = recalc_res.json()

        assert calc_data["status"] == "success"
        assert calc_data["tasks_count"] == 2
        assert "1.0" in calc_data["critical_path_wbs"]
        assert "2.0" in calc_data["critical_path_wbs"]


@pytest.mark.asyncio
async def test_business_rule_plan_lock_on_actuals():
    """Тест автоблокировки базового плана при наличии факта (MVP DNA)."""
    transport = ASGITransport(app=app)
    async with AsyncClient(transport=transport, base_url="http://test") as ac:
        proj_code = f"PRJ-LOCK-{uuid.uuid4().hex[:6].upper()}"
        proj_res = await ac.post(
            "/api/v1/projects",
            json={
                "code": proj_code,
                "name": "Проект для теста блокировок",
                "planned_start_date": "2026-09-01",
                "planned_finish_date": "2026-10-01",
            },
        )
        project_id = proj_res.json()["id"]

        # Создаем задачу
        task_res = await ac.post(
            f"/api/v1/projects/{project_id}/tasks",
            json={
                "project_id": project_id,
                "wbs_code": "1.1",
                "name": "Земляные работы",
                "planned_duration": 4,
                "planned_start": "2026-09-01",
                "planned_finish": "2026-09-04",
                "dependencies": [],
            },
        )
        task_id = task_res.json()["id"]

        # 1. Вносим факт (Actual Start)
        update_fact = await ac.patch(
            f"/api/v1/tasks/{task_id}",
            json={"actual_start": "2026-09-01", "progress_percent": 25.0},
        )
        assert update_fact.status_code == 200
        assert update_fact.json()["is_plan_locked"] is True

        # 2. Пытаемся изменить плановую дату заблокированной задачи -> ожидаем 400 Bad Request
        illegal_update = await ac.patch(
            f"/api/v1/tasks/{task_id}",
            json={"planned_start": "2026-09-10"},
        )
        assert illegal_update.status_code == 400
        assert "заблокированы" in illegal_update.json()["detail"]


@pytest.mark.asyncio
async def test_redis_live_locks():
    """Тест механизма Live Locks через Redis."""
    transport = ASGITransport(app=app)
    task_dummy_id = uuid.uuid4()

    async with AsyncClient(transport=transport, base_url="http://test") as ac:
        # 1. Пользователь 1 успешно захватывает блокировку
        lock_res1 = await ac.post(
            f"/api/v1/tasks/{task_dummy_id}/lock",
            json={"owner_id": "engineer_ivanov", "ttl_seconds": 15},
        )
        assert lock_res1.status_code == 200
        assert lock_res1.json()["status"] == "locked"

        # 2. Пользователь 2 пытается заблокировать ту же задачу -> получает 423 Locked
        lock_res2 = await ac.post(
            f"/api/v1/tasks/{task_dummy_id}/lock",
            json={"owner_id": "manager_petrov", "ttl_seconds": 15},
        )
        assert lock_res2.status_code == 423
        assert "engineer_ivanov" in lock_res2.json()["detail"]

        # 3. Пользователь 1 освобождает блокировку
        unlock_res = await ac.post(
            f"/api/v1/tasks/{task_dummy_id}/unlock",
            json={"owner_id": "engineer_ivanov"},
        )
        assert unlock_res.status_code == 200
        assert unlock_res.json()["status"] == "unlocked"