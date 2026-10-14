import sys
import asyncio
from pathlib import Path

ROOT_DIR = Path(__file__).resolve().parent.parent
sys.path.extend([str(ROOT_DIR), str(ROOT_DIR / "backend")])

from sqlalchemy import select
from app.core.database import AsyncSessionLocal
from app.models.task import PortfolioTask
from app.models.diary import DiaryEntry
from app.models.project import PortfolioProject

# Каноническая карта привязок Pyrus из extracted JSON
PYRUS_MAPPING = {
    "1.6": "https://pyrus.com/t#id360080288",
    "1.11": "https://pyrus.com/t#id364744833",
    "2.3": "https://pyrus.com/t#id365186351",
    "2.4.1": "https://pyrus.com/t#id365186351",
    "2.4": "https://pyrus.com/t#id371609994",
    "3.2": "https://pyrus.com/t#id365186351",
    "3.3": "https://pyrus.com/t#id365019672",
    "3.5": "https://pyrus.com/t#id354373592",
    "4.3": "https://pyrus.com/t#id373181005",
    "5.1": "https://pyrus.com/t#id344724267",
    "1.2": "https://pyrus.com/t#id364282394",
    "1.3": "https://pyrus.com/t#id364368480",
    "1.4": "https://pyrus.com/t#id367544787",
    "1.5": "https://pyrus.com/t#id367834893",
}

async def seed_pyrus():
    async with AsyncSessionLocal() as session:
        # 1. Привязываем ссылки к задачам календарного графика
        tasks = (await session.execute(select(PortfolioTask))).scalars().all()
        updated_tasks = 0
        for t in tasks:
            clean_wbs = t.wbs_code.replace("P-001.", "").replace("P-002.", "").replace("P-003.", "").replace("P-004.", "").replace("P-005.", "")
            url = PYRUS_MAPPING.get(clean_wbs) or PYRUS_MAPPING.get(t.wbs_code)
            if url:
                attrs = dict(t.custom_attributes or {})
                attrs["pyrus_url"] = url
                t.custom_attributes = attrs
                updated_tasks += 1

        # 2. Привязываем ссылки к записям Дневника
        entries = (await session.execute(select(DiaryEntry))).scalars().all()
        updated_diary = 0
        for e in entries:
            url = PYRUS_MAPPING.get(e.wbs_affected)
            if url:
                e.source = url
                updated_diary += 1

        await session.commit()
        print(f"✅ Успешно привязано ссылок на Pyrus: задач={updated_tasks}, записей дневника={updated_diary}")

if __name__ == "__main__":
    asyncio.run(seed_pyrus())