"""
Скрипт генерации связей CPM (TaskDependency) и расчёта критического пути для 5 проектов.
"""
import sys
import asyncio
from pathlib import Path

ROOT_DIR = Path(__file__).resolve().parent.parent
sys.path.extend([str(ROOT_DIR), str(ROOT_DIR / "backend")])

from sqlalchemy import select, delete
from app.core.database import AsyncSessionLocal
from app.models.project import PortfolioProject
from app.models.task import PortfolioTask
from app.models.dependency import TaskDependency, DependencyType
from app.services.cpm.engine import CPMEngine
from app.services.cpm.types import CPMNode, CPMEdge
from app.services.cpm.calendar import WorkCalendar


async def seed_dependencies():
    engine = CPMEngine(calendar=WorkCalendar())
    async with AsyncSessionLocal() as session:
        projects = (await session.execute(select(PortfolioProject))).scalars().all()
        total_links = 0

        for p in projects:
            tasks_stmt = (
                select(PortfolioTask)
                .where(PortfolioTask.project_id == p.id)
                .order_by(PortfolioTask.wbs_code)
            )
            tasks = list((await session.execute(tasks_stmt)).scalars().all())
            if len(tasks) < 2:
                continue

            # Естественная числовая сортировка: 1.1 -> 1.2 -> ... -> 1.10
            tasks.sort(key=lambda t: [int(x) for x in t.wbs_code.split(".") if x.isdigit()])

            task_ids = [t.id for t in tasks]
            await session.execute(
                delete(TaskDependency).where(TaskDependency.predecessor_task_id.in_(task_ids))
            )

            cpm_edges: list[CPMEdge] = []
            for i in range(len(tasks) - 1):
                pred, succ = tasks[i], tasks[i + 1]
                dep = TaskDependency(
                    predecessor_task_id=pred.id,
                    successor_task_id=succ.id,
                    dependency_type=DependencyType.FINISH_TO_START,
                    lag_days=0,
                )
                session.add(dep)
                cpm_edges.append(
                    CPMEdge(
                        predecessor_id=pred.id,
                        successor_id=succ.id,
                        dependency_type=DependencyType.FINISH_TO_START,
                        lag_days=0,
                    )
                )
                total_links += 1

            cpm_nodes = [
                CPMNode(
                    id=t.id,
                    wbs_code=t.wbs_code,
                    name=t.name,
                    duration_days=t.planned_duration,
                    task_type=t.task_type,
                    planned_start=t.planned_start,
                    planned_finish=t.planned_finish,
                    actual_start=t.actual_start,
                    actual_finish=t.actual_finish,
                    progress_percent=t.progress_percent,
                )
                for t in tasks
            ]

            res = engine.calculate(project_start=p.planned_start_date, nodes=cpm_nodes, edges=cpm_edges)
            calc_map = {n.id: n for n in res.tasks}
            for t in tasks:
                c = calc_map.get(t.id)
                if c:
                    t.early_start, t.early_finish = c.early_start, c.early_finish
                    t.late_start, t.late_finish = c.late_start, c.late_finish
                    t.total_float, t.free_float, t.is_critical = c.total_float, c.free_float, c.is_critical

            print(f"✅ Проект [{p.code}]: создано {len(tasks)-1} связей CPM, критических: {len(res.critical_path_wbs)}")

        await session.commit()
        print(f"\n🎉 Всего создано {total_links} связей CPM в PostgreSQL!")


if __name__ == "__main__":
    asyncio.run(seed_dependencies())