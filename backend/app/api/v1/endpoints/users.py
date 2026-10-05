from typing import Optional
from fastapi import APIRouter, Depends, HTTPException
from pydantic import BaseModel
from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from app.api.deps import get_db, get_current_user
from app.core.email import send_otp_email
from app.core.security import (
    verify_password,
    get_password_hash,
    generate_otp_code,
    generate_totp_secret,
    verify_totp_code,
    get_totp_uri,
)
from app.core.security_redis import store_otp, verify_and_consume_otp, check_rate_limit
from app.models.auth import User
from app.services.audit_service import AuditService, extract_model_snapshot, generate_diff_summary

router = APIRouter()


class UserProfileUpdateSchema(BaseModel):
    full_name: Optional[str] = None
    current_password: Optional[str] = None
    new_password: Optional[str] = None
    theme: Optional[str] = None  # 'dark' | 'light'


class UserDeleteAccountSchema(BaseModel):
    otp_code: str


class TOTPEnableSchema(BaseModel):
    secret: str
    code: str


class TOTPDisableSchema(BaseModel):
    password: str


class TwoFactorPolicySchema(BaseModel):
    method: str  # 'DISABLED', 'EMAIL_OTP', 'TOTP', 'EMAIL_AND_TOTP'


class ChangeEmailOTPSchema(BaseModel):
    new_email: str


class ChangeEmailSchema(BaseModel):
    new_email: str
    otp_code: str


@router.get("/me")
async def get_my_profile(current_user: User = Depends(get_current_user)):
    return {
        "id": str(current_user.id),
        "email": current_user.email,
        "full_name": current_user.full_name,
        "position": current_user.position,
        "role_id": current_user.role_id,
        "role_name": current_user.role.name if current_user.role else current_user.role_id,
        "is_active": current_user.is_active,
        "is_verified": current_user.is_verified,
        "two_factor_method": getattr(current_user, "two_factor_method", "EMAIL_OTP"),
        "theme": getattr(current_user, "theme", "dark"),
        "has_totp": bool(getattr(current_user, "totp_secret", None)),
        "created_at": current_user.created_at.isoformat() if current_user.created_at else None,
    }


@router.patch("/me")
async def update_my_profile(
    payload: UserProfileUpdateSchema,
    current_user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
):
    before = extract_model_snapshot(current_user)

    if payload.full_name:
        current_user.full_name = payload.full_name.strip()

    if payload.theme in ("dark", "light"):
        current_user.theme = payload.theme

    if payload.new_password:
        if not payload.current_password or not verify_password(payload.current_password, current_user.hashed_password):
            raise HTTPException(status_code=400, detail="Текущий пароль указан неверно")
        if len(payload.new_password) < 6:
            raise HTTPException(status_code=400, detail="Новый пароль должен содержать минимум 6 символов")
        current_user.hashed_password = get_password_hash(payload.new_password)

    after = extract_model_snapshot(current_user)
    diff_b, diff_a, summary = generate_diff_summary(before, after)

    if diff_b:
        await AuditService.record_action(
            db=db,
            entity_type="USER",
            entity_id=str(current_user.id),
            action="UPDATE",
            user=current_user,
            entity_name=current_user.email,
            summary=f"Обновление личного профиля: {summary}",
            before_state=diff_b,
            after_state=diff_a,
        )

    await db.commit()
    return {"status": "ok", "message": "Профиль успешно обновлен"}


# --- Управление Google Authenticator (TOTP) ---
@router.post("/me/totp/setup")
async def setup_totp(current_user: User = Depends(get_current_user)):
    secret = generate_totp_secret()
    uri = get_totp_uri(secret, current_user.email)
    return {"secret": secret, "otpauth_uri": uri}


@router.post("/me/totp/enable")
async def enable_totp(
    payload: TOTPEnableSchema,
    current_user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
):
    if not verify_totp_code(payload.secret, payload.code):
        raise HTTPException(status_code=400, detail="Неверный код из приложения аутентификатора")

    current_user.totp_secret = payload.secret
    current_user.two_factor_method = "TOTP"
    await db.commit()
    return {"status": "ok", "message": "Google Authenticator успешно подключен"}


@router.post("/me/totp/disable")
async def disable_totp(
    payload: TOTPDisableSchema,
    current_user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
):
    if not verify_password(payload.password, current_user.hashed_password):
        raise HTTPException(status_code=400, detail="Неверный пароль")

    current_user.totp_secret = None
    current_user.two_factor_method = "EMAIL_OTP"
    await db.commit()
    return {"status": "ok", "message": "Google Authenticator отключен"}


@router.post("/me/2fa-policy")
async def set_2fa_policy(
    payload: TwoFactorPolicySchema,
    current_user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
):
    if payload.method in ("TOTP", "EMAIL_AND_TOTP") and not current_user.totp_secret:
        raise HTTPException(status_code=400, detail="Сначала подключите приложение Google Authenticator")

    current_user.two_factor_method = payload.method
    await db.commit()
    return {"status": "ok", "message": "Политика 2FA обновлена", "two_factor_method": current_user.two_factor_method}


# --- Смена Email с подтверждением на новый адрес ---
@router.post("/me/change-email-otp")
async def request_change_email_otp(
    payload: ChangeEmailOTPSchema,
    current_user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
):
    new_email = payload.new_email.lower().strip()
    stmt = select(User).where(User.email == new_email)
    res = await db.execute(stmt)
    if res.scalar_one_or_none():
        raise HTTPException(status_code=400, detail="Этот email уже занят другим пользователем")

    if not await check_rate_limit(f"change_email:{new_email}", max_requests=1, window_seconds=60):
        raise HTTPException(status_code=429, detail="Повторный код можно запросить через 60 секунд")

    otp_code = generate_otp_code()
    await store_otp(f"new_email:{new_email}", otp_code, ttl_seconds=600)
    await send_otp_email(new_email, otp_code)

    print("\n" + "=" * 60)
    print(f"🔥🔥🔥 [DEV 2FA CHANGE EMAIL OTP ДЛЯ {new_email}]: >>> {otp_code} <<< 🔥🔥🔥")
    print("=" * 60 + "\n")

    return {"status": "ok", "message": "Код подтверждения отправлен на новый email", "dev_otp": otp_code}


@router.post("/me/change-email")
async def confirm_change_email(
    payload: ChangeEmailSchema,
    current_user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
):
    new_email = payload.new_email.lower().strip()
    if not await verify_and_consume_otp(f"new_email:{new_email}", payload.otp_code):
        raise HTTPException(status_code=400, detail="Неверный или просроченный код подтверждения")

    old_email = current_user.email
    current_user.email = new_email
    await AuditService.record_action(
        db=db,
        entity_type="USER",
        entity_id=str(current_user.id),
        action="UPDATE",
        user=current_user,
        entity_name=current_user.full_name,
        summary=f"Смена email: {old_email} ➔ {new_email}",
    )
    await db.commit()
    return {"status": "ok", "message": "Email успешно изменен", "email": new_email}


# --- Удаление аккаунта по OTP ---
@router.post("/me/delete-otp")
async def request_delete_account_otp(current_user: User = Depends(get_current_user)):
    if current_user.role_id == "SUPERADMIN":
        raise HTTPException(status_code=400, detail="Главный администратор не может удалить свой аккаунт")

    if not await check_rate_limit(f"del_otp:{current_user.email}", max_requests=1, window_seconds=60):
        raise HTTPException(status_code=429, detail="Повторный код можно запросить через 60 секунд")

    otp_code = generate_otp_code()
    await store_otp(current_user.email, otp_code, ttl_seconds=600)
    await send_otp_email(current_user.email, otp_code)

    print("\n" + "=" * 60)
    print(f"🔥🔥🔥 [DEV 2FA DELETE ACCOUNT OTP ДЛЯ {current_user.email}]: >>> {otp_code} <<< 🔥🔥🔥")
    print("=" * 60 + "\n")

    return {"status": "ok", "message": "Код подтверждения удаления отправлен на email", "dev_otp": otp_code}


@router.delete("/me")
async def delete_my_account(
    payload: UserDeleteAccountSchema,
    current_user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
):
    if current_user.role_id == "SUPERADMIN":
        raise HTTPException(status_code=400, detail="Главный администратор не может удалить свой аккаунт")

    if not await verify_and_consume_otp(current_user.email, payload.otp_code):
        raise HTTPException(status_code=400, detail="Неверный или просроченный код подтверждения удаления")

    before = extract_model_snapshot(current_user)
    await AuditService.record_action(
        db=db,
        entity_type="USER",
        entity_id=str(current_user.id),
        action="DELETE",
        user=current_user,
        entity_name=current_user.email,
        summary=f"Самоудаление аккаунта {current_user.email} (2FA OTP подтверждено)",
        before_state=before,
    )

    await db.delete(current_user)
    await db.commit()
    return {"status": "ok", "message": "Аккаунт успешно удален"}