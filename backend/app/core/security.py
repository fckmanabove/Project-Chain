import secrets
import uuid
from datetime import datetime, timedelta, timezone
from typing import Any, Dict, Optional, Union

try:
    import jwt
except ImportError:
    from jose import jwt  # fallback

from app.core.config import settings

# --- Хеширование паролей (Прямой нативный bcrypt без устаревшего passlib) ---
try:
    import bcrypt

    def verify_password(plain_password: str, hashed_password: str) -> bool:
        try:
            return bcrypt.checkpw(
                plain_password.encode("utf-8")[:72],
                hashed_password.encode("utf-8"),
            )
        except Exception:
            return False

    def get_password_hash(password: str) -> str:
        salt = bcrypt.gensalt()
        return bcrypt.hashpw(password.encode("utf-8")[:72], salt).decode("utf-8")
except ImportError:
    import hashlib

    def verify_password(plain_password: str, hashed_password: str) -> bool:
        if "$" not in hashed_password:
            return False
        salt, h = hashed_password.split("$", 1)
        calc = hashlib.sha256((salt + plain_password).encode()).hexdigest()
        return secrets.compare_digest(h, calc)

    def get_password_hash(password: str) -> str:
        salt = secrets.token_hex(16)
        h = hashlib.sha256((salt + password).encode()).hexdigest()
        return f"{salt}${h}"


import base64
import hashlib
import hmac
import struct
import time

import re

def validate_password_strength(password: str) -> Optional[str]:
    """Проверяет пароль на минимальную стойкость к подбору."""
    if len(password) < 8:
        return "Пароль должен содержать не менее 8 символов"
    if not re.search(r"\d", password):
        return "Пароль должен содержать хотя бы одну цифру"
    if not re.search(r"[a-zA-Zа-яА-Я]", password):
        return "Пароль должен содержать хотя бы одну букву"
    return None

# --- 2FA OTP Генератор ---
def generate_otp_code() -> str:
    """Генерирует криптостойкий 6-значный числовой OTP код."""
    return f"{secrets.randbelow(900000) + 100000:06d}"


# --- Google Authenticator TOTP (RFC 6238) ---
def generate_totp_secret() -> str:
    return base64.b32encode(secrets.token_bytes(20)).decode("utf-8").replace("=", "")


def verify_totp_code(secret: str, code: str) -> bool:
    """Сверяет 6-значный код Google Authenticator с окном +-30 сек."""
    try:
        key = base64.b32decode(secret + "=" * ((8 - len(secret) % 8) % 8), casefold=True)
        now = int(time.time()) // 30
        for offset in (-1, 0, 1):
            t = struct.pack(">Q", now + offset)
            h = hmac.new(key, t, hashlib.sha1).digest()
            o = h[19] & 15
            token = (struct.unpack(">I", h[o:o+4])[0] & 0x7fffffff) % 1000000
            if f"{token:06d}" == str(code).strip():
                return True
        return False
    except Exception:
        return False


def get_totp_uri(secret: str, email: str, issuer_name: str = "ProChain") -> str:
    return f"otpauth://totp/{issuer_name}:{email}?secret={secret}&issuer={issuer_name}&algorithm=SHA1&digits=6&period=30"


# --- JWT Токены (Access + Refresh с jti) ---
def create_access_token(subject: Union[str, Any], role: str, expires_delta: Optional[timedelta] = None) -> str:
    expire = datetime.now(timezone.utc) + (expires_delta or timedelta(minutes=getattr(settings, "ACCESS_TOKEN_EXPIRE_MINUTES", 60)))
    to_encode = {
        "sub": str(subject),
        "role": role,
        "jti": str(uuid.uuid4()),
        "type": "access",
        "exp": int(expire.timestamp()),
    }
    return jwt.encode(to_encode, settings.SECRET_KEY, algorithm="HS256")


def create_refresh_token(subject: Union[str, Any], expires_delta: Optional[timedelta] = None) -> str:
    expire = datetime.now(timezone.utc) + (expires_delta or timedelta(days=14))
    to_encode = {
        "sub": str(subject),
        "jti": str(uuid.uuid4()),
        "type": "refresh",
        "exp": int(expire.timestamp()),
    }
    return jwt.encode(to_encode, settings.SECRET_KEY, algorithm="HS256")


def decode_token(token: str) -> Dict[str, Any]:
    return jwt.decode(token, settings.SECRET_KEY, algorithms=["HS256"])