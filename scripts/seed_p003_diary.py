import sys
import asyncio
from datetime import date
from pathlib import Path

ROOT_DIR = Path(__file__).resolve().parent.parent
sys.path.extend([str(ROOT_DIR), str(ROOT_DIR / "backend")])

from sqlalchemy import select, delete
from app.core.database import AsyncSessionLocal
from app.models.project import PortfolioProject
from app.models.task import PortfolioTask
from app.models.diary import DiaryEntry, DiaryEntryType

SAMPLE_DIARY_P003 = [
    {
        "category": "C",
        "wbs": "1.2",
        "date": date(2026, 8, 20),
        "section": "Станок Haotian",
        "task": "Брак геометрии станины и биение шпинделя узла фрезерования",
        "solution": "Вызвать сервис-инженера представительства, составить рекламационный акт, юстировка",
        "physical": "Демонтировать защитный кожух, установить индикатор часового типа ИЧ-10, замерить биение",
        "purpose": "Исключить сколы кромки 2мм на фасадных деталях при чистовом фрезеровании",
        "assignee": "Климов А.Н.",
        "deadline": "25.08.2026",
        "status": "Завершено",
        "source": "Акт дефектовки №14",
    },
    {
        "category": "B",
        "wbs": "1.3",
        "date": date(2026, 8, 25),
        "section": "Кромкооблицовка IMA",
        "task": "Несоответствие давления воздуха на узле прижима кромки клеевой ванны",
        "solution": "Установка дополнительного ресивера 100л и замена пневмодросселей Festo",
        "physical": "Врезать тройник в пневмомагистраль 8 бар, протянуть шланг РВД к узлу подачи",
        "purpose": "Стабилизировать прижим толстой кромки при скорости подачи 24 м/мин",
        "assignee": "Данилов В.",
        "deadline": "02.09.2026",
        "status": "Завершено",
        "source": "Оперативка цеха",
    },
    {
        "category": "C",
        "wbs": "1.4",
        "date": date(2026, 9, 2),
        "section": "Буферный склад",
        "task": "Сбой энкодера позиционирования рольганга буфера-накопителя",
        "solution": "Замена абсолютного энкодера Sick на сервоприводе, калибровка нуля",
        "physical": "Снять муфту привода, перепаять сигнальный кабель экранированной витой пары",
        "purpose": "Устранить замятие углов деталей при выходе из буферной зоны",
        "assignee": "Маклюк С.В.",
        "deadline": "05.09.2026",
        "status": "Отклонение",
        "source": "Pyrus #1084",
    },
    {
        "category": "A",
        "wbs": "1.1",
        "date": date(2026, 9, 5),
        "section": "Система аспирации",
        "task": "Плановое подключение воздуховодов циклона стружкоотсоса к станку IMA",
        "solution": "Монтаж оцинкованных спирально-навивных труб диам. 250 мм с заслонками",
        "physical": "Подвесить трубы на перфоленту к фермам цеха, загерметизировать стыки мастикой",
        "purpose": "Обеспечить удаление стружки и пыли из зоны узла торцовки",
        "assignee": "Данилов В.",
        "deadline": "08.09.2026",
        "status": "Завершено",
        "source": "План ПНР",
    },
    {
        "category": "B",
        "wbs": "1.5",
        "date": date(2026, 9, 8),
        "section": "Перекладчик 1",
        "task": "Задержка поставки вакуумных присосок Schmalz для перекладчика заготовок",
        "solution": "Временное использование аналогов SMC из резервного фонда цеха ДО",
        "physical": "Выточить переходные втулки с резьбы G1/4 на G3/8 под присоски SMC",
        "purpose": "Не останавливать пусконаладку автоматической загрузки деталей в линию",
        "assignee": "Климов А.Н.",
        "deadline": "12.09.2026",
        "status": "В работе",
        "source": "Служебная записка",
    },
    {
        "category": "C",
        "wbs": "1.6",
        "date": date(2026, 9, 10),
        "section": "Станок Haotian",
        "task": "Ошибка связи по Profinet между ПЛК Siemens S7-1500 и термоконтроллером клея",
        "solution": "Обновление GSDML-файла конфигурации в TIA Portal v18, замена разъема RJ45",
        "physical": "Переобжать сетевой кабель Industrial Ethernet cat 6A, залить новый проект в ПЛК",
        "purpose": "Предотвратить перегрев PUR-клея и блокировку автоподачи",
        "assignee": "Иванов И.И.",
        "deadline": "14.09.2026",
        "status": "В работе",
        "source": "Pyrus #1105",
    }
]

async def seed_diary():
    async with AsyncSessionLocal() as session:
        res = await session.execute(select(PortfolioProject).where(PortfolioProject.code == "P-003"))
        proj = res.scalar_one_or_none()
        if not proj:
            proj = (await session.execute(select(PortfolioProject))).scalars().first()
            if not proj:
                print("❌ Проекты не найдены!")
                return

        tasks = (await session.execute(select(PortfolioTask).where(PortfolioTask.project_id == proj.id))).scalars().all()
        wbs_to_id = {t.wbs_code: t.id for t in tasks}

        await session.execute(delete(DiaryEntry).where(DiaryEntry.project_id == proj.id))

        count = 0
        for item in SAMPLE_DIARY_P003:
            matched_id = wbs_to_id.get(item["wbs"]) or (tasks[0].id if tasks else None)
            entry = DiaryEntry(
                project_id=proj.id,
                task_id=matched_id,
                category=item["category"],
                wbs_affected=item["wbs"],
                entry_date=item["date"],
                line_section=item["section"],
                content=item["task"],
                solution=item["solution"],
                physical_action=item["physical"],
                purpose=item["purpose"],
                author_name=item["assignee"],
                deadline_str=item["deadline"],
                status=item["status"],
                source=item["source"],
                entry_type=DiaryEntryType.DAILY_LOG,
            )
            session.add(entry)
            count += 1

        await session.commit()
        print(f"🎉 Успешно засидировано {count} записей Дневника (11 колонок) для проекта [{proj.code}] {proj.name}!")

if __name__ == "__main__":
    asyncio.run(seed_diary())
