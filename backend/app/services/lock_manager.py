"""
Distributed Live Lock Manager based on Redis and Lua scripts.
"""

from dataclasses import dataclass
from typing import Dict, Optional
from uuid import UUID
from redis.asyncio import Redis

# Lua-скрипт для атомарного освобождения блокировки (только владельцем)
UNLOCK_LUA_SCRIPT = """
if redis.call("get", KEYS[1]) == ARGV[1] then
    return redis.call("del", KEYS[1])
else
    return 0
end
"""

# Lua-скрипт для атомарного продления TTL блокировки
REFRESH_LUA_SCRIPT = """
if redis.call("get", KEYS[1]) == ARGV[1] then
    return redis.call("expire", KEYS[1], ARGV[2])
else
    return 0
end
"""


@dataclass
class LockInfo:
    resource_id: str
    owner_id: str
    ttl_seconds: int
    is_locked: bool


class DistributedLockManager:
    """
    Управляет распределенными блокировками задач и проектов в Redis.
    """

    def __init__(self, redis: Redis, key_prefix: str = "lock:prochain:"):
        self.redis = redis
        self.key_prefix = key_prefix

    def _make_key(self, resource_type: str, resource_id: UUID) -> str:
        return f"{self.key_prefix}{resource_type}:{str(resource_id)}"

    async def acquire_lock(
        self,
        resource_type: str,
        resource_id: UUID,
        owner_id: str,
        ttl_seconds: int = 30,
    ) -> bool:
        """
        Пытается захватить блокировку. Идемпотентно продлевает действие, если ключ уже принадлежит этому пользователю.
        """
        key = self._make_key(resource_type, resource_id)
        current_owner = await self.redis.get(key)
        # Если блокировка уже твоя — продлеваем её TTL без ошибок и конфликтов
        if current_owner == owner_id:
            await self.redis.expire(key, ttl_seconds)
            return True

        acquired = await self.redis.set(key, owner_id, ex=ttl_seconds, nx=True)
        return bool(acquired)

    async def release_lock(
        self,
        resource_type: str,
        resource_id: UUID,
        owner_id: str,
    ) -> bool:
        """
        Освобождает блокировку. Гарантирует, что чужая блокировка не будет удалена.
        """
        key = self._make_key(resource_type, resource_id)
        res = await self.redis.eval(UNLOCK_LUA_SCRIPT, 1, key, owner_id)
        return bool(res == 1)

    async def refresh_lock(
        self,
        resource_type: str,
        resource_id: UUID,
        owner_id: str,
        ttl_seconds: int = 30,
    ) -> bool:
        """
        Продлевает действие блокировки (Heartbeat).
        """
        key = self._make_key(resource_type, resource_id)
        res = await self.redis.eval(REFRESH_LUA_SCRIPT, 1, key, owner_id, ttl_seconds)
        return bool(res == 1)

    async def get_lock_info(
        self,
        resource_type: str,
        resource_id: UUID,
    ) -> LockInfo:
        """
        Возвращает текущую информацию о блокировке ресурса.
        """
        key = self._make_key(resource_type, resource_id)
        owner = await self.redis.get(key)
        ttl = await self.redis.ttl(key)

        if owner is not None and ttl > 0:
            return LockInfo(
                resource_id=str(resource_id),
                owner_id=owner,
                ttl_seconds=ttl,
                is_locked=True,
            )
        return LockInfo(
            resource_id=str(resource_id),
            owner_id="",
            ttl_seconds=0,
            is_locked=False,
        )