import uuid
from typing import AsyncGenerator, Callable, Optional
from fastapi import Depends, HTTPException, status
from fastapi.security import OAuth2PasswordBearer
from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy.orm import selectinload

from app.core.database import AsyncSessionLocal
from app.core.security import decode_token
from app.core.security_redis import is_token_blacklisted
from app.models.auth import User

oauth2_scheme = OAuth2PasswordBearer(
    tokenUrl="/api/v1/auth/login",
    auto_error=False,
)


async def get_db() -> AsyncGenerator[AsyncSession, None]:
    async with AsyncSessionLocal() as session:
        try:
            yield session
        finally:
            await session.close()


async def get_current_user(
    token: Optional[str] = Depends(oauth2_scheme),
    db: AsyncSession = Depends(get_db),
) -> User:
    if not token:
        raise HTTPException(
            status_code=status.HTTP_401_UNAUTHORIZED,
            detail="Требуется авторизация (Bearer токен отсутствует)",
            headers={"WWW-Authenticate": "Bearer"},
        )

    try:
        payload = decode_token(token)
        if payload.get("type") != "access":
            raise ValueError("Неверный тип токена")
        user_id = payload.get("sub")
        jti = payload.get("jti")
    except Exception:
        raise HTTPException(
            status_code=status.HTTP_401_UNAUTHORIZED,
            detail="Срок действия токена истек или подпись недействительна",
            headers={"WWW-Authenticate": "Bearer"},
        )

    if jti and await is_token_blacklisted(jti):
        raise HTTPException(
            status_code=status.HTTP_401_UNAUTHORIZED,
            detail="Сессия завершена (токен в черном списке)",
        )

    stmt = select(User).options(selectinload(User.role)).where(User.id == uuid.UUID(user_id))
    res = await db.execute(stmt)
    user = res.scalar_one_or_none()

    if not user:
        raise HTTPException(status_code=status.HTTP_401_UNAUTHORIZED, detail="Пользователь не найден")
    if not user.is_active:
        raise HTTPException(status_code=status.HTTP_403_FORBIDDEN, detail="Учетная запись заблокирована")

    return user


def require_permission(permission_key: str) -> Callable:
    """Гвард проверки гранулярного права в RBAC матрице."""
    async def permission_checker(current_user: User = Depends(get_current_user)) -> User:
        if current_user.role_id == "SUPERADMIN":
            return current_user

        deny_list = current_user.custom_permissions.get("deny", [])
        if permission_key in deny_list or "*" in deny_list:
            raise HTTPException(status_code=status.HTTP_403_FORBIDDEN, detail=f"Действие запрещено: {permission_key}")

        allow_list = current_user.custom_permissions.get("allow", [])
        if permission_key in allow_list or "*" in allow_list:
            return current_user

        role_perms = current_user.role.permissions if current_user.role else []
        if permission_key in role_perms or "*" in role_perms:
            return current_user

        raise HTTPException(
            status_code=status.HTTP_403_FORBIDDEN,
            detail=f"Недостаточно прав. Требуется разрешение: {permission_key}",
        )

    return permission_checker