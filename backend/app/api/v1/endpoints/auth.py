from datetime import datetime, timezone
from typing import Optional
from fastapi import APIRouter, Depends, HTTPException, Request
from pydantic import BaseModel, Field
from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from app.api.deps import get_db, get_current_user
from app.core.email import send_otp_email
from app.core.security import (
    verify_password,
    get_password_hash,
    validate_password_strength,
    generate_otp_code,
    create_access_token,
    create_refresh_token,
    decode_token,
    verify_totp_code,
)
from app.core.security_redis import (
    check_rate_limit,
    store_otp,
    verify_and_consume_otp,
    blacklist_token,
    is_token_blacklisted,
    store_pending_registration,
    get_pending_registration,
    delete_pending_registration,
)
from app.models.auth import User
from app.services.audit_service import AuditService

router = APIRouter()


class RegisterSchema(BaseModel):
    email: str = Field(..., description="Email пользователя")
    password: str
    full_name: str
    position: Optional[str] = "Специалист"


class VerifyOTPSchema(BaseModel):
    email: str
    code: str


class ResendOTPSchema(BaseModel):
    email: str


class ForgotPasswordSchema(BaseModel):
    email: str


class ResetPasswordSchema(BaseModel):
    email: str
    code: str
    new_password: str


class LoginSchema(BaseModel):
    email: str
    password: str


class RefreshSchema(BaseModel):
    refresh_token: str


class LoginInitSchema(BaseModel):
    email: str


class Login2FASchema(BaseModel):
    email: str
    code: str


@router.post("/register")
async def register(payload: RegisterSchema, db: AsyncSession = Depends(get_db)):
    pwd_err = validate_password_strength(payload.password)
    if pwd_err:
        raise HTTPException(status_code=400, detail=pwd_err)

    email_clean = payload.email.lower().strip()
    if not await check_rate_limit(f"reg:{email_clean}", max_requests=5, window_seconds=300):
        raise HTTPException(status_code=429, detail="Слишком много попыток. Подождите 5 минут.")

    stmt = select(User).where(User.email == email_clean)
    res = await db.execute(stmt)
    if res.scalar_one_or_none():
        raise HTTPException(status_code=400, detail="Пользователь с таким email уже существует")

    # Черновик регистрации в Redis с ролью GUEST (0 прав по умолчанию)
    pending_data = {
        "email": email_clean,
        "hashed_password": get_password_hash(payload.password),
        "full_name": payload.full_name.strip(),
        "position": payload.position or "Специалист",
        "role_id": "GUEST",
    }
    await store_pending_registration(email_clean, pending_data, ttl_seconds=600)

    otp_code = generate_otp_code()
    await store_otp(email_clean, otp_code, ttl_seconds=600)
    await send_otp_email(email_clean, otp_code)

    # print("\n" + "=" * 60)
    # print(f"🔥🔥🔥 [DEV 2FA OTP CODE ДЛЯ {email_clean}]: >>> {otp_code} <<< 🔥🔥🔥")
    # print("=" * 60 + "\n")

    # return {"status": "ok", "message": "Код подтверждения выслан на email", "email": email_clean, "dev_otp": otp_code}

    return {"status": "ok", "message": "Код подтверждения отправлен на вашу почту", "email": email_clean}


@router.post("/resend-otp")
async def resend_otp(payload: ResendOTPSchema, db: AsyncSession = Depends(get_db)):
    email_clean = payload.email.lower().strip()
    if not await check_rate_limit(f"resend_otp:{email_clean}", max_requests=1, window_seconds=60):
        raise HTTPException(status_code=429, detail="Повторный код можно запросить только через 60 секунд")

    stmt = select(User).where(User.email == email_clean)
    res = await db.execute(stmt)
    user = res.scalar_one_or_none()
    pending = await get_pending_registration(email_clean)

    if not user and not pending:
        raise HTTPException(status_code=404, detail="Email для подтверждения не найден")

    otp_code = generate_otp_code()
    await store_otp(email_clean, otp_code, ttl_seconds=600)
    await send_otp_email(email_clean, otp_code)

    # print("\n" + "=" * 60)
    # print(f"🔥🔥🔥 [DEV 2FA RESEND OTP ДЛЯ {email_clean}]: >>> {otp_code} <<< 🔥🔥🔥")
    # print("=" * 60 + "\n")

    # return {"status": "ok", "message": "Новый код подтверждения отправлен на email", "dev_otp": otp_code}

    return {"status": "ok", "message": "Новый код подтверждения отправлен на вашу почту"}


@router.post("/verify-otp")
async def verify_otp(payload: VerifyOTPSchema, db: AsyncSession = Depends(get_db)):
    email_clean = payload.email.lower().strip()
    if not await verify_and_consume_otp(email_clean, payload.code):
        raise HTTPException(
            status_code=400,
            detail="Неверный или просроченный код (максимум 5 попыток ввода)",
        )

    stmt = select(User).where(User.email == email_clean)
    res = await db.execute(stmt)
    user = res.scalar_one_or_none()

    if not user:
        pending = await get_pending_registration(email_clean)
        if not pending:
            raise HTTPException(status_code=404, detail="Срок действия регистрации истек. Пройдите регистрацию заново.")

        user = User(
            email=pending["email"],
            hashed_password=pending["hashed_password"],
            full_name=pending["full_name"],
            position=pending.get("position"),
            role_id=pending.get("role_id", "GUEST"),
            is_active=True,
            is_verified=True,
        )
        db.add(user)
        await db.commit()
        await delete_pending_registration(email_clean)
    else:
        user.is_verified = True
        await db.commit()

    return {
        "access_token": create_access_token(user.id, user.role_id),
        "refresh_token": create_refresh_token(user.id),
        "token_type": "bearer",
        "user": {
            "id": str(user.id),
            "email": user.email,
            "full_name": user.full_name,
            "role": user.role_id,
            "role_id": user.role_id,
        },
    }


@router.post("/forgot-password")
async def forgot_password(payload: ForgotPasswordSchema, db: AsyncSession = Depends(get_db)):
    email_clean = payload.email.lower().strip()
    if not await check_rate_limit(f"forgot_pass:{email_clean}", max_requests=2, window_seconds=60):
        raise HTTPException(status_code=429, detail="Запросить сброс пароля можно не чаще одного раза в минуту")

    stmt = select(User).where(User.email == email_clean)
    res = await db.execute(stmt)
    user = res.scalar_one_or_none()
    if not user:
        raise HTTPException(status_code=404, detail="Пользователь с таким email не найден")
    if not user.is_active:
        raise HTTPException(status_code=403, detail="Учетная запись заблокирована")

    otp_code = generate_otp_code()
    await store_otp(email_clean, otp_code, prefix="forgot_otp", ttl_seconds=600)
    await send_otp_email(email_clean, otp_code)

    print("\n" + "=" * 60)
    print(f"🔥🔥🔥 [DEV RESET PASSWORD OTP ДЛЯ {email_clean}]: >>> {otp_code} <<< 🔥🔥🔥")
    print("=" * 60 + "\n")

    return {"status": "ok", "message": "Код для сброса пароля отправлен на email", "dev_otp": otp_code}


@router.post("/reset-password")
async def reset_password(payload: ResetPasswordSchema, db: AsyncSession = Depends(get_db)):
    email_clean = payload.email.lower().strip()
    pwd_err = validate_password_strength(payload.new_password)
    if pwd_err:
        raise HTTPException(status_code=400, detail=pwd_err)

    if not await verify_and_consume_otp(email_clean, payload.code, prefix="forgot_otp"):
        raise HTTPException(status_code=400, detail="Неверный или просроченный код сброса")

    stmt = select(User).where(User.email == email_clean)
    res = await db.execute(stmt)
    user = res.scalar_one_or_none()
    if not user:
        raise HTTPException(status_code=404, detail="Пользователь не найден")

    user.hashed_password = get_password_hash(payload.new_password)
    await AuditService.record_action(
        db=db,
        entity_type="USER",
        entity_id=str(user.id),
        action="UPDATE",
        user=user,
        entity_name=user.email,
        summary=f"Сброс пароля через 2FA OTP для {user.email}",
    )
    await db.commit()

    return {
        "status": "ok",
        "message": "Пароль успешно изменен",
        "access_token": create_access_token(user.id, user.role_id),
        "refresh_token": create_refresh_token(user.id),
        "token_type": "bearer",
        "user": {
            "id": str(user.id),
            "email": user.email,
            "full_name": user.full_name,
            "role": user.role_id,
            "role_id": user.role_id,
        },
    }


@router.post("/login-init")
async def login_init(payload: LoginInitSchema, db: AsyncSession = Depends(get_db)):
    """Определяет метод аутентификации: TOTP (без пароля), Email OTP (без пароля) или Password."""
    email_clean = payload.email.lower().strip()
    if not await check_rate_limit(f"login_init:{email_clean}", max_requests=10, window_seconds=60):
        raise HTTPException(status_code=429, detail="Слишком много попыток. Подождите 1 минуту.")

    stmt = select(User).where(User.email == email_clean)
    res = await db.execute(stmt)
    user = res.scalar_one_or_none()
    if not user:
        raise HTTPException(status_code=404, detail="Пользователь с таким email не найден")
    if not user.is_active:
        raise HTTPException(status_code=403, detail="Учетная запись заблокирована")

    method = getattr(user, "two_factor_method", "EMAIL_OTP")
    has_totp = bool(getattr(user, "totp_secret", None))

    # Если подключен Google Authenticator — вход строго по 6-значному коду из приложения (без пароля)
    if method == "TOTP" and has_totp:
        return {"auth_method": "TOTP", "email": user.email}

    # Если включен Email OTP — отправляем код на почту (без пароля)
    if method in ("EMAIL_OTP", "EMAIL_AND_TOTP"):
        otp_code = generate_otp_code()
        await store_otp(f"login_otp:{user.email}", otp_code, ttl_seconds=600)
        await send_otp_email(user.email, otp_code)
        return {"auth_method": "EMAIL_OTP", "email": user.email}

    # Только если 2FA отключена — запрашиваем пароль
    return {"auth_method": "PASSWORD", "email": user.email}


@router.post("/login")
async def login(payload: LoginSchema, db: AsyncSession = Depends(get_db)):
    email_clean = payload.email.lower().strip()
    if not await check_rate_limit(f"login:{email_clean}", max_requests=5, window_seconds=300):
        raise HTTPException(status_code=429, detail="Превышен лимит попыток. Подождите 5 минут.")

    stmt = select(User).where(User.email == email_clean)
    res = await db.execute(stmt)
    user = res.scalar_one_or_none()

    if not user or not verify_password(payload.password, user.hashed_password):
        raise HTTPException(status_code=401, detail="Неверный email или пароль")

    if not user.is_active:
        raise HTTPException(status_code=403, detail="Учетная запись заблокирована")

    method = getattr(user, "two_factor_method", "EMAIL_OTP")
    has_totp = bool(getattr(user, "totp_secret", None))

    # Если включен Google Authenticator (TOTP)
    if method == "TOTP" and has_totp:
        return {
            "status": "require_2fa",
            "two_factor_method": "TOTP",
            "email": user.email,
        }

    # Если включен Email OTP
    if method in ("EMAIL_OTP", "EMAIL_AND_TOTP"):
        otp_code = generate_otp_code()
        await store_otp(f"login_otp:{user.email}", otp_code, ttl_seconds=600)
        await send_otp_email(user.email, otp_code)
        return {
            "status": "require_2fa",
            "two_factor_method": "EMAIL_OTP",
            "email": user.email,
        }

    # Если 2FA отключена
    return {
        "access_token": create_access_token(user.id, user.role_id),
        "refresh_token": create_refresh_token(user.id),
        "token_type": "bearer",
        "user": {
            "id": str(user.id),
            "email": user.email,
            "full_name": user.full_name,
            "role": user.role_id,
            "role_id": user.role_id,
            "is_verified": user.is_verified,
            "theme": getattr(user, "theme", "dark"),
            "two_factor_method": method,
            "has_totp": has_totp,
        },
    }


@router.post("/verify-login-2fa")
async def verify_login_2fa(payload: Login2FASchema, db: AsyncSession = Depends(get_db)):
    email_clean = payload.email.lower().strip()
    stmt = select(User).where(User.email == email_clean)
    res = await db.execute(stmt)
    user = res.scalar_one_or_none()
    if not user:
        raise HTTPException(status_code=404, detail="Пользователь не найден")

    method = getattr(user, "two_factor_method", "EMAIL_OTP")
    has_totp = bool(getattr(user, "totp_secret", None))

    if method == "TOTP" and has_totp:
        if not verify_totp_code(user.totp_secret, payload.code):
            raise HTTPException(status_code=400, detail="Неверный код из приложения Google Authenticator")
    else:
        if not await verify_and_consume_otp(f"login_otp:{user.email}", payload.code):
            raise HTTPException(status_code=400, detail="Неверный или просроченный Email код")

    return {
        "access_token": create_access_token(user.id, user.role_id),
        "refresh_token": create_refresh_token(user.id),
        "token_type": "bearer",
        "user": {
            "id": str(user.id),
            "email": user.email,
            "full_name": user.full_name,
            "role": user.role_id,
            "role_id": user.role_id,
            "is_verified": user.is_verified,
            "theme": getattr(user, "theme", "dark"),
            "two_factor_method": method,
            "has_totp": has_totp,
        },
    }


@router.post("/refresh")
async def refresh_tokens(payload: RefreshSchema, db: AsyncSession = Depends(get_db)):
    try:
        data = decode_token(payload.refresh_token)
        if data.get("type") != "refresh":
            raise ValueError()
        jti = data.get("jti")
        if jti and await is_token_blacklisted(jti):
            raise ValueError()
        user_id = data.get("sub")
    except Exception:
        raise HTTPException(status_code=401, detail="Недействительный refresh токен")

    stmt = select(User).where(User.id == user_id)
    res = await db.execute(stmt)
    user = res.scalar_one_or_none()
    if not user or not user.is_active:
        raise HTTPException(status_code=401, detail="Пользователь недоступен")

    return {"access_token": create_access_token(user.id, user.role_id), "token_type": "bearer"}


@router.post("/logout")
async def logout(request: Request, current_user: User = Depends(get_current_user)):
    auth_header = request.headers.get("Authorization")
    if auth_header and auth_header.startswith("Bearer "):
        token = auth_header.split(" ")[1]
        try:
            payload = decode_token(token)
            jti = payload.get("jti")
            exp = payload.get("exp", 0)
            now = int(datetime.now(timezone.utc).timestamp())
            if jti and exp > now:
                await blacklist_token(jti, exp - now)
        except Exception:
            pass
    return {"status": "ok", "message": "Сессия завершена"}