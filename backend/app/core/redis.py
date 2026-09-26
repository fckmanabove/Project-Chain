"""
Async Redis Client Pool Connection.
"""

from typing import Optional
from redis.asyncio import Redis, ConnectionPool
from app.core.config import settings

redis_pool: Optional[ConnectionPool] = None


async def get_redis_client() -> Redis:
    """
    Возвращает асинхронный экземпляр клиента Redis из пула соединений.
    """
    global redis_pool
    if redis_pool is None:
        redis_pool = ConnectionPool.from_url(
            settings.REDIS_URL,
            decode_responses=True,
            max_connections=20,
        )
    return Redis(connection_pool=redis_pool)


async def close_redis_pool() -> None:
    """
    Закрывает пул соединений Redis при остановке приложения.
    """
    global redis_pool
    if redis_pool is not None:
        await redis_pool.disconnect()
        redis_pool = None