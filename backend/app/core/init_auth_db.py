import asyncio
from sqlalchemy import select, text
from app.core.database import AsyncSessionLocal, engine, Base
from app.core.security import get_password_hash
from app.models.auth import Role, User
from app.models.audit import AuditLog

DEFAULT_ROLES = [
    {
        "id": "SUPERADMIN",
        "name": "Главный администратор",
        "description": "Полный неограниченный доступ ко всей системе и аудиту",
        "permissions": ["*"],
        "is_system": True,
    },
    {
        "id": "PM",
        "name": "Руководитель проекта (РП)",
        "description": "Управление графиком, связями CPM, исполнителями и бюджетом",
        "permissions": [
            "projects:view", "projects:edit", "tasks:view", "tasks:create",
            "tasks:edit", "tasks:delete", "cpm:recalculate", "stages:quick_close",
            "baseline:freeze", "audit:view", "excel:bridge",
        ],
        "is_system": True,
    },
    {
        "id": "GIP",
        "name": "Главный инженер (ГИП)",
        "description": "Технический контроль сетевого графа и согласование этапов",
        "permissions": [
            "projects:view", "tasks:view", "tasks:create", "tasks:edit",
            "cpm:recalculate", "stages:quick_close", "audit:view",
        ],
        "is_system": True,
    },
    {
        "id": "FOREMAN",
        "name": "Прораб / Начальник участка",
        "description": "Ведение электронного журнала работ и оперативное закрытие",
        "permissions": [
            "projects:view", "tasks:view", "stages:quick_close",
            "diary:view", "diary:create", "diary:edit",
        ],
        "is_system": True,
    },
    {
        "id": "AUDITOR",
        "name": "Аудитор / Служба безопасности",
        "description": "Просмотр истории изменений Time Machine и откат действий",
        "permissions": ["projects:view", "tasks:view", "audit:view", "audit:rollback"],
        "is_system": True,
    },
    {
        "id": "CLIENT",
        "name": "Заказчик / Наблюдатель",
        "description": "Просмотр состояния портфеля и диаграммы Ганта (read-only)",
        "permissions": ["projects:view", "tasks:view"],
        "is_system": True,
    },
    {
        "id": "GUEST",
        "name": "Новый пользователь (Без прав)",
        "description": "Базовый доступ для новорегов без права просмотра и редактирования",
        "permissions": [],
        "is_system": True,
    },
]


async def init_auth_db():
    print("📦 Проверяем и создаем таблицы auth и audit в PostgreSQL...")
    async with engine.begin() as conn:
        await conn.run_sync(Base.metadata.create_all)
        # Накатываем новые колонки 2FA в существующую таблицу users
        await conn.execute(text("ALTER TABLE users ADD COLUMN IF NOT EXISTS totp_secret VARCHAR(64);"))
        await conn.execute(text("ALTER TABLE users ADD COLUMN IF NOT EXISTS two_factor_method VARCHAR(30) DEFAULT 'EMAIL_OTP';"))

    async with AsyncSessionLocal() as session:
        print("🛡️ Сидируем системные роли...")
        for r_data in DEFAULT_ROLES:
            stmt = select(Role).where(Role.id == r_data["id"])
            res = await session.execute(stmt)
            role = res.scalar_one_or_none()
            if not role:
                session.add(Role(**r_data))
            else:
                role.name = r_data["name"]
                role.description = r_data["description"]
                role.permissions = r_data["permissions"]

        print("👤 Проверяем наличие суперадминистратора...")
        admin_email = "admin@prochain.ru"
        stmt = select(User).where(User.email == admin_email)
        res = await session.execute(stmt)
        admin = res.scalar_one_or_none()
        if not admin:
            admin = User(
                email=admin_email,
                hashed_password=get_password_hash("AdminSecret2026!"),
                full_name="Главный Администратор",
                position="Руководитель CISO",
                role_id="SUPERADMIN",
                is_active=True,
                is_verified=True,
                two_factor_method="DISABLED",
            )
            session.add(admin)
            print(f"✅ Создан суперадмин: {admin_email} / AdminSecret2026!")
        else:
            admin.role_id = "SUPERADMIN"
            admin.is_active = True
            admin.is_verified = True
            admin.two_factor_method = "DISABLED"

        await session.commit()
    print("🚀 Инициализация БД безопасности завершена успешно!")


if __name__ == "__main__":
    asyncio.run(init_auth_db())