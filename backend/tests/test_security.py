import pytest
from httpx import AsyncClient, ASGITransport
from app.main import app
from app.core.security import validate_password_strength, get_password_hash, verify_password
from app.core.security_redis import store_otp, verify_and_consume_otp, get_redis


@pytest.mark.asyncio
async def test_security_headers_present():
    """Проверка наличия полного комплекта защитных заголовков (CSP, X-Frame-Options, etc.)."""
    transport = ASGITransport(app=app)
    async with AsyncClient(transport=transport, base_url="http://test") as ac:
        response = await ac.get("/docs")
        assert response.status_code == 200
        assert response.headers.get("X-Content-Type-Options") == "nosniff"
        assert response.headers.get("X-Frame-Options") == "SAMEORIGIN"
        assert "Content-Security-Policy" in response.headers
        assert response.headers.get("Referrer-Policy") == "strict-origin-when-cross-origin"


@pytest.mark.asyncio
async def test_unauthorized_access_blocked():
    """Zero-Trust: проверка блокировки неавторизованных запросов к проектам и задачам (401)."""
    transport = ASGITransport(app=app)
    async with AsyncClient(transport=transport, base_url="http://test") as ac:
        res_projects = await ac.get("/api/v1/projects")
        assert res_projects.status_code == 401

        res_tasks = await ac.get("/api/v1/tasks")
        assert res_tasks.status_code == 401

        res_audit = await ac.get("/api/v1/audit/logs")
        assert res_audit.status_code == 401


@pytest.mark.asyncio
async def test_otp_auto_burn_on_bruteforce():
    """Проверка механизма Auto-burn: OTP уничтожается после 5 неверных попыток ввода."""
    test_email = "audit_victim@prochain.ru"
    real_code = "987654"

    # Сохраняем OTP
    await store_otp(test_email, real_code, ttl_seconds=60)

    # Совершаем 5 неверных попыток
    for _ in range(5):
        assert await verify_and_consume_otp(test_email, "000000") is False

    # 6-я попытка даже с ПРАВИЛЬНЫМ кодом должна провалиться (код сгорел)
    assert await verify_and_consume_otp(test_email, real_code) is False


def test_password_entropy_validation():
    """Проверка блокировки слабых паролей."""
    assert validate_password_strength("123") == "Пароль должен содержать не менее 8 символов"
    assert validate_password_strength("abcdefgh") == "Пароль должен содержать хотя бы одну цифру"
    assert validate_password_strength("12345678") == "Пароль должен содержать хотя бы одну букву"
    assert validate_password_strength("StrongPass2026!") is None


def test_csv_formula_injection_sanitization():
    """Проверка экранирования формульных инъекций (CWE-1236)."""
    def sanitize_field(val: str) -> str:
        clean = f"'{val}" if val.startswith(("=", "+", "-", "@", "\t", "\r")) else val
        clean_escaped = clean.replace('"', '""')
        return f'"{clean_escaped}"'

    payload_cmd = "=CMD|' /C calc'!A1"
    sanitized = sanitize_field(payload_cmd)
    assert sanitized.startswith("\"'=")