"""
Pytest fixtures, database setup and event loop management.
"""

import pytest
from sqlalchemy import text
from app.core.database import engine, Base
from app.core.redis import close_redis_pool
import app.models  # Гарантирует регистрацию всех моделей в Base.metadata


@pytest.fixture(scope="session", autouse=True)
async def setup_test_database():
    """Автоматически активирует pgvector и создает все таблицы перед запуском тестов."""
    async with engine.begin() as conn:
        await conn.execute(text("CREATE EXTENSION IF NOT EXISTS vector"))
        await conn.run_sync(Base.metadata.create_all)
    yield


@pytest.fixture(autouse=True)
async def cleanup_db_connections():
    """Сбрасывает соединения пула после каждого теста."""
    yield
    await engine.dispose()
    await close_redis_pool()