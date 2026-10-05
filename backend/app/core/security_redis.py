import json
import secrets
from typing import Any, Dict, Optional
import redis.asyncio as aioredis
from app.core.config import settings


def get_redis_url() -> str:
    if hasattr(settings, "REDIS_URL") and settings.REDIS_URL:
        return str(settings.REDIS_URL)
    pwd = f":{settings.REDIS_PASSWORD}@" if getattr(settings, "REDIS_PASSWORD", None) else ""
    host = getattr(settings, "REDIS_HOST", "localhost")
    port = getattr(settings, "REDIS_PORT", 6379)
    return f"redis://{pwd}{host}:{port}/0"


_redis_client: Optional[aioredis.Redis] = None


def get_redis() -> aioredis.Redis:
    global _redis_client
    if _redis_client is None:
        _redis_client = aioredis.from_url(
            get_redis_url(),
            decode_responses=True,
            encoding="utf-8",
        )
    return _redis_client


async def check_rate_limit(key: str, max_requests: int = 5, window_seconds: int = 60) -> bool:
    """Проверяет лимит запросов. Возвращает True, если лимит не превышен."""
    r = get_redis()
    redis_key = f"ratelimit:{key}"
    current = await r.incr(redis_key)
    if current == 1:
        await r.expire(redis_key, window_seconds)
    return current <= max_requests


async def store_otp(email: str, code: str, prefix: str = "otp", ttl_seconds: int = 600) -> None:
    """Сохраняет 6-значный OTP код для email с изолированным префиксом назначения на 10 минут."""
    r = get_redis()
    email_clean = email.lower().strip()
    await r.set(f"{prefix}:{email_clean}", code, ex=ttl_seconds)


async def verify_and_consume_otp(email: str, code: str, prefix: str = "otp", max_attempts: int = 5) -> bool:
    """Сверяет OTP код со счетчиком попыток (макс. 5) и самоуничтожением при переборе."""
    r = get_redis()
    email_clean = email.lower().strip()
    redis_key = f"{prefix}:{email_clean}"
    attempts_key = f"otp_attempts:{prefix}:{email_clean}"

    attempts = await r.incr(attempts_key)
    if attempts == 1:
        await r.expire(attempts_key, 600)

    # При превышении лимита попыток код сжигается в Redis
    if attempts > max_attempts:
        await r.delete(redis_key)
        await r.delete(attempts_key)
        return False

    stored = await r.get(redis_key)
    if not stored:
        return False

    if secrets.compare_digest(str(stored).strip(), str(code).strip()):
        await r.delete(redis_key)
        await r.delete(attempts_key)
        return True

    return False


async def blacklist_token(jti: str, exp_seconds: int) -> None:
    """Добавляет ID токена в черный список до момента его естественного истечения."""
    if exp_seconds > 0:
        r = get_redis()
        await r.set(f"blacklist:{jti}", "1", ex=exp_seconds)


async def is_token_blacklisted(jti: str) -> bool:
    """Проверяет, отозван ли токен."""
    r = get_redis()
    return await r.exists(f"blacklist:{jti}") == 1


async def store_pending_registration(email: str, data: Dict[str, Any], ttl_seconds: int = 600) -> None:
    """Хранит черновик регистрации в Redis до подтверждения кодом OTP."""
    r = get_redis()
    await r.set(f"pending_reg:{email.lower().strip()}", json.dumps(data), ex=ttl_seconds)


async def get_pending_registration(email: str) -> Optional[Dict[str, Any]]:
    """Получает черновик регистрации из Redis."""
    r = get_redis()
    raw = await r.get(f"pending_reg:{email.lower().strip()}")
    return json.loads(raw) if raw else None


async def delete_pending_registration(email: str) -> None:
    """Удаляет черновик регистрации после успешного создания пользователя."""
    r = get_redis()
    await r.delete(f"pending_reg:{email.lower().strip()}")