#!/bin/bash
set -e

echo "⏳ [1/4] Ожидание готовности PostgreSQL (${POSTGRES_SERVER}:${POSTGRES_PORT:-5432})..."
while ! nc -z "${POSTGRES_SERVER}" "${POSTGRES_PORT:-5432}"; do
  sleep 1
done
echo "✅ PostgreSQL доступен!"

echo "⏳ [2/4] Ожидание готовности Redis (${REDIS_HOST}:${REDIS_PORT:-6379})..."
while ! nc -z "${REDIS_HOST}" "${REDIS_PORT:-6379}"; do
  sleep 1
done
echo "✅ Redis доступен!"

echo "📦 [3/4] Автоматическая инициализация структуры БД, pgvector и проектов..."
python -c "
import asyncio
import sys
sys.path.extend(['/app', '/app/backend'])
from sqlalchemy import text
from app.core.database import engine
from app.core.init_auth_db import init_auth_db
from scripts.import_portfolio_xlsm import import_portfolio
from scripts.seed_cpm_dependencies import seed_dependencies
from scripts.seed_p003_diary import seed_diary

async def bootstrap():
    async with engine.begin() as conn:
        await conn.execute(text('CREATE EXTENSION IF NOT EXISTS vector;'))
        await conn.execute(text('''
            ALTER TABLE users ADD COLUMN IF NOT EXISTS totp_secret VARCHAR(64);
            ALTER TABLE users ADD COLUMN IF NOT EXISTS two_factor_method VARCHAR(30) DEFAULT 'EMAIL_OTP';
            ALTER TABLE users ADD COLUMN IF NOT EXISTS theme VARCHAR(20) DEFAULT 'dark';
            ALTER TABLE diary_entries 
                ADD COLUMN IF NOT EXISTS category VARCHAR(10) DEFAULT 'B',
                ADD COLUMN IF NOT EXISTS wbs_affected VARCHAR(64),
                ADD COLUMN IF NOT EXISTS line_section VARCHAR(255),
                ADD COLUMN IF NOT EXISTS solution TEXT,
                ADD COLUMN IF NOT EXISTS physical_action TEXT,
                ADD COLUMN IF NOT EXISTS purpose TEXT,
                ADD COLUMN IF NOT EXISTS deadline_str VARCHAR(100),
                ADD COLUMN IF NOT EXISTS status VARCHAR(50) DEFAULT 'В работе',
                ADD COLUMN IF NOT EXISTS source VARCHAR(255) DEFAULT 'Оперативка';
        '''))
    print('🛡️ Сидируем пользователей и роли...')
    await init_auth_db()
    print('📊 Импортируем портфель проектов...')
    await import_portfolio()
    print('🔗 Выстраиваем сетевой граф CPM...')
    await seed_dependencies()
    print('📖 Загружаем Дневник производства работ...')
    await seed_diary()
    print('🚀 База данных полностью готова к работе!')

asyncio.run(bootstrap())
" || echo "⚠️ База уже была инициализирована ранее, продолжаем запуск."

echo "🚀 [4/4] Запуск производственного сервера Uvicorn..."
exec "$@"
