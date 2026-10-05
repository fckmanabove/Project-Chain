import uuid
from typing import Dict, List, Optional
from fastapi import APIRouter, Depends, HTTPException
from pydantic import BaseModel
from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy.orm import selectinload

from app.api.deps import get_db, require_permission
from app.core.security import get_password_hash
from app.models.auth import Role, User
from app.services.audit_service import AuditService, extract_model_snapshot, generate_diff_summary

router = APIRouter()

SYSTEM_PERMISSIONS = [
    {"key": "projects:view", "name": "Просмотр проектов и портфеля", "category": "Проекты"},
    {"key": "projects:edit", "name": "Редактирование паспорта проекта", "category": "Проекты"},
    {"key": "tasks:view", "name": "Просмотр графика Ганта и WBS", "category": "Задачи и CPM"},
    {"key": "tasks:create", "name": "Создание новых этапов и вех", "category": "Задачи и CPM"},
    {"key": "tasks:edit", "name": "Редактирование параметров и сроков задач", "category": "Задачи и CPM"},
    {"key": "tasks:delete", "name": "Удаление этапов из структуры WBS", "category": "Задачи и CPM"},
    {"key": "stages:quick_close", "name": "Быстрое закрытие этапов в 1 клик (Закрой этап)", "category": "Оперативка"},
    {"key": "baseline:freeze", "name": "Заморозка/разморозка базового плана (Freeze)", "category": "Оперативка"},
    {"key": "cpm:recalculate", "name": "Принудительный пересчет сетевого графа CPM", "category": "Оперативка"},
    {"key": "diary:create", "name": "Внесение записей в журнал работ", "category": "Журнал работ"},
    {"key": "diary:edit", "name": "Правка и удаление записей журнала", "category": "Журнал работ"},
    {"key": "audit:view", "name": "Просмотр журнала событий Time Machine", "category": "Аудит и безопасность"},
    {"key": "audit:rollback", "name": "Откат действий (Undo) и воскрешение (Undelete)", "category": "Аудит и безопасность"},
    {"key": "excel:bridge", "name": "Импорт и экспорт через Excel Мост", "category": "Интеграция"},
    {"key": "users:manage", "name": "Управление пользователями, ролями и блокировками", "category": "Администрирование"},
]


class UserCreateAdminSchema(BaseModel):
    email: str
    password: str
    full_name: str
    position: Optional[str] = "Специалист"
    role_id: str = "PM"
    is_verified: bool = True


class UserUpdateAdminSchema(BaseModel):
    role_id: Optional[str] = None
    is_active: Optional[bool] = None
    position: Optional[str] = None
    custom_permissions: Optional[Dict[str, List[str]]] = None


class AdminResetPasswordSchema(BaseModel):
    new_password: str


class RoleCreateSchema(BaseModel):
    id: str
    name: str
    description: Optional[str] = None
    permissions: List[str] = []


class RoleUpdateSchema(BaseModel):
    name: Optional[str] = None
    description: Optional[str] = None
    permissions: Optional[List[str]] = None


@router.get("/permissions-catalog")
async def get_permissions_catalog(current_user: User = Depends(require_permission("users:manage"))):
    return SYSTEM_PERMISSIONS


@router.get("/users")
async def list_users(
    db: AsyncSession = Depends(get_db),
    current_user: User = Depends(require_permission("users:manage")),
):
    stmt = select(User).options(selectinload(User.role)).order_by(User.created_at.desc())
    res = await db.execute(stmt)
    users = res.scalars().all()
    return [
        {
            "id": str(u.id),
            "email": u.email,
            "full_name": u.full_name,
            "position": u.position,
            "role_id": u.role_id,
            "role_name": u.role.name if u.role else u.role_id,
            "is_active": u.is_active,
            "is_verified": u.is_verified,
            "custom_permissions": u.custom_permissions or {},
            "created_at": u.created_at.isoformat() if u.created_at else None,
        }
        for u in users
    ]


@router.post("/users")
async def create_user_admin(
    payload: UserCreateAdminSchema,
    db: AsyncSession = Depends(get_db),
    current_user: User = Depends(require_permission("users:manage")),
):
    email_clean = payload.email.lower().strip()
    stmt = select(User).where(User.email == email_clean)
    res = await db.execute(stmt)
    if res.scalar_one_or_none():
        raise HTTPException(status_code=400, detail="Пользователь с таким email уже зарегистрирован")

    user = User(
        email=email_clean,
        hashed_password=get_password_hash(payload.password),
        full_name=payload.full_name.strip(),
        position=payload.position,
        role_id=payload.role_id,
        is_active=True,
        is_verified=payload.is_verified,
    )
    db.add(user)
    await db.flush()

    after = extract_model_snapshot(user)
    await AuditService.record_action(
        db=db,
        entity_type="USER",
        entity_id=str(user.id),
        action="CREATE",
        user=current_user,
        entity_name=user.email,
        summary=f"Создание сотрудника {user.full_name} ({user.email}) с ролью {user.role_id}",
        after_state=after,
    )
    await db.commit()
    return {"status": "ok", "message": f"Сотрудник {user.email} успешно создан", "user_id": str(user.id)}


@router.patch("/users/{user_id}")
async def update_user(
    user_id: uuid.UUID,
    payload: UserUpdateAdminSchema,
    db: AsyncSession = Depends(get_db),
    current_user: User = Depends(require_permission("users:manage")),
):
    stmt = select(User).where(User.id == user_id)
    res = await db.execute(stmt)
    user = res.scalar_one_or_none()
    if not user:
        raise HTTPException(status_code=404, detail="Пользователь не найден")

    before = extract_model_snapshot(user)
    up_data = payload.model_dump(exclude_unset=True)
    for k, v in up_data.items():
        setattr(user, k, v)
    after = extract_model_snapshot(user)
    diff_b, diff_a, summary = generate_diff_summary(before, after)

    if diff_b:
        await AuditService.record_action(
            db=db,
            entity_type="USER",
            entity_id=str(user.id),
            action="UPDATE",
            user=current_user,
            entity_name=user.email,
            summary=f"Изменение профиля: {summary}",
            before_state=diff_b,
            after_state=diff_a,
        )

    await db.commit()
    return {"status": "ok", "message": f"Пользователь {user.email} обновлен"}


@router.delete("/users/{user_id}")
async def delete_user_admin(
    user_id: uuid.UUID,
    db: AsyncSession = Depends(get_db),
    current_user: User = Depends(require_permission("users:manage")),
):
    if current_user.id == user_id:
        raise HTTPException(status_code=400, detail="Нельзя удалить свой собственный аккаунт из панели")

    stmt = select(User).where(User.id == user_id)
    res = await db.execute(stmt)
    user = res.scalar_one_or_none()
    if not user:
        raise HTTPException(status_code=404, detail="Пользователь не найден")
    if user.role_id == "SUPERADMIN":
        raise HTTPException(status_code=400, detail="Запрещено удалять Главного администратора")

    before = extract_model_snapshot(user)
    await AuditService.record_action(
        db=db,
        entity_type="USER",
        entity_id=str(user.id),
        action="DELETE",
        user=current_user,
        entity_name=user.email,
        summary=f"Удаление сотрудника {user.full_name} ({user.email})",
        before_state=before,
    )

    await db.delete(user)
    await db.commit()
    return {"status": "ok", "message": f"Сотрудник {user.email} удален"}

@router.post("/users/{user_id}/reset-password")
async def admin_reset_user_password(
    user_id: uuid.UUID,
    payload: AdminResetPasswordSchema,
    db: AsyncSession = Depends(get_db),
    current_user: User = Depends(require_permission("users:manage")),
):
    if len(payload.new_password) < 6:
        raise HTTPException(status_code=400, detail="Пароль должен содержать минимум 6 символов")

    stmt = select(User).where(User.id == user_id)
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
        user=current_user,
        entity_name=user.email,
        summary=f"Административный сброс пароля для {user.full_name} ({user.email})",
    )
    await db.commit()
    return {"status": "ok", "message": f"Пароль для {user.email} успешно обновлен"}


@router.post("/users/{user_id}/reset-totp")
async def admin_reset_user_totp(
    user_id: uuid.UUID,
    db: AsyncSession = Depends(get_db),
    current_user: User = Depends(require_permission("users:manage")),
):
    stmt = select(User).where(User.id == user_id)
    res = await db.execute(stmt)
    user = res.scalar_one_or_none()
    if not user:
        raise HTTPException(status_code=404, detail="Пользователь не найден")

    user.totp_secret = None
    user.two_factor_method = "EMAIL_OTP"
    await AuditService.record_action(
        db=db,
        entity_type="USER",
        entity_id=str(user.id),
        action="UPDATE",
        user=current_user,
        entity_name=user.email,
        summary=f"Административный сброс Google Authenticator 2FA для {user.email}",
    )
    await db.commit()
    return {"status": "ok", "message": f"2FA TOTP для {user.email} успешно сброшен"}

@router.get("/roles")
async def list_roles(
    db: AsyncSession = Depends(get_db),
    current_user: User = Depends(require_permission("users:manage")),
):
    stmt = select(Role).order_by(Role.id)
    res = await db.execute(stmt)
    roles = res.scalars().all()
    return [
        {"id": r.id, "name": r.name, "description": r.description, "permissions": r.permissions, "is_system": r.is_system}
        for r in roles
    ]


@router.post("/roles")
async def create_role(
    payload: RoleCreateSchema,
    db: AsyncSession = Depends(get_db),
    current_user: User = Depends(require_permission("users:manage")),
):
    role_key = payload.id.upper().strip()
    stmt = select(Role).where(Role.id == role_key)
    res = await db.execute(stmt)
    if res.scalar_one_or_none():
        raise HTTPException(status_code=400, detail=f"Роль с кодом {role_key} уже существует")

    role = Role(
        id=role_key,
        name=payload.name.strip(),
        description=payload.description,
        permissions=payload.permissions,
        is_system=False,
    )
    db.add(role)
    await db.flush()

    after = extract_model_snapshot(role)
    await AuditService.record_action(
        db=db,
        entity_type="ROLE",
        entity_id=role.id,
        action="CREATE",
        user=current_user,
        entity_name=role.name,
        summary=f"Создание кастомной роли [{role.id}] {role.name}",
        after_state=after,
    )
    await db.commit()
    return {"status": "ok", "message": f"Роль {role.name} успешно создана"}


@router.patch("/roles/{role_id}")
async def update_role(
    role_id: str,
    payload: RoleUpdateSchema,
    db: AsyncSession = Depends(get_db),
    current_user: User = Depends(require_permission("users:manage")),
):
    stmt = select(Role).where(Role.id == role_id)
    res = await db.execute(stmt)
    role = res.scalar_one_or_none()
    if not role:
        raise HTTPException(status_code=404, detail="Роль не найдена")

    before = extract_model_snapshot(role)
    up_data = payload.model_dump(exclude_unset=True)
    for k, v in up_data.items():
        setattr(role, k, v)
    after = extract_model_snapshot(role)
    diff_b, diff_a, summary = generate_diff_summary(before, after)

    if diff_b:
        await AuditService.record_action(
            db=db,
            entity_type="ROLE",
            entity_id=role.id,
            action="UPDATE",
            user=current_user,
            entity_name=role.name,
            summary=f"Обновление прав роли: {summary}",
            before_state=diff_b,
            after_state=diff_a,
        )

    await db.commit()
    return {"status": "ok", "message": f"Роль {role.name} обновлена"}


@router.delete("/roles/{role_id}")
async def delete_role(
    role_id: str,
    db: AsyncSession = Depends(get_db),
    current_user: User = Depends(require_permission("users:manage")),
):
    stmt = select(Role).where(Role.id == role_id)
    res = await db.execute(stmt)
    role = res.scalar_one_or_none()
    if not role:
        raise HTTPException(status_code=404, detail="Роль не найдена")
    if role.is_system:
        raise HTTPException(status_code=400, detail="Системные роли защищены от удаления")

    # Перепривязываем пользователей на роль GUEST (принцип наименьших привилегий)
    u_stmt = select(User).where(User.role_id == role_id)
    u_res = await db.execute(u_stmt)
    for u in u_res.scalars().all():
        u.role_id = "GUEST"

    before = extract_model_snapshot(role)
    await AuditService.record_action(
        db=db,
        entity_type="ROLE",
        entity_id=role.id,
        action="DELETE",
        user=current_user,
        entity_name=role.name,
        summary=f"Удаление роли [{role.id}] {role.name}",
        before_state=before,
    )

    await db.delete(role)
    await db.commit()
    return {"status": "ok", "message": f"Роль {role_id} удалена, пользователи переназначены на роль GUEST"}