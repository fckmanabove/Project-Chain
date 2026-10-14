import sys
import asyncio
from pathlib import Path

ROOT_DIR = Path(__file__).resolve().parent.parent
BACKEND_DIR = ROOT_DIR / "backend"
if str(ROOT_DIR) not in sys.path:
    sys.path.insert(0, str(ROOT_DIR))
if str(BACKEND_DIR) not in sys.path:
    sys.path.insert(0, str(BACKEND_DIR))

from app.core.database import engine, Base
from app.core.init_auth_db import init_auth_db
from scripts.import_portfolio_xlsm import import_portfolio


async def full_reset_and_seed():
    print("\n" + "=" * 70)
    print("🧹 [1/3] Полное обнуление и пересоздание всех таблиц PostgreSQL...")
    async with engine.begin() as conn:
        await conn.run_sync(Base.metadata.drop_all)
        await conn.run_sync(Base.metadata.create_all)
    print("✅ Таблицы успешно пересозданы с нуля.")

    print("\n🛡️ [2/3] Накатываем роли RBAC, 2FA-контур и Главного Администратора...")
    await init_auth_db()

    print("\n📊 [3/3] Импортируем 5 проектов и 114 этапов из Excel с расчетом CPM...")
    await import_portfolio()

    print("\n" + "=" * 70)
    print("🎉 БАЗА ДАННЫХ ПОЛНОСТЬЮ ОБНУЛЕНА И ПЕРЕЗАГРУЖЕНА В ИСХОДНОЕ ЧИСТОЕ СОСТОЯНИЕ!")
    print("=" * 70 + "\n")


if __name__ == "__main__":
    asyncio.run(full_reset_and_seed())