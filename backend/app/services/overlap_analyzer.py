from datetime import date
from typing import Dict, List, Optional
from dataclasses import dataclass, asdict
from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy.orm import selectinload

from app.models.project import PortfolioProject
from app.models.task import PortfolioTask

def clean_name(raw: Optional[str]) -> List[str]:
    if not raw or raw in ("—", "-", "Не назначен"):
        return []
    names = []
    for part in raw.replace("/", ",").replace("+", ",").replace(";", ",").split(","):
        p = " ".join(part.strip().split())
        if p:
            names.append(p)
    return names

class OverlapAnalyzer:
    def __init__(self, session: AsyncSession):
        self.session = session

    async def analyze(self) -> dict:
        projects = (await self.session.execute(select(PortfolioProject).options(selectinload(PortfolioProject.tasks)))).scalars().all()
        proj_map = {p.id: p for p in projects}
        all_tasks = [t for p in projects for t in p.tasks if t.task_type != "SUMMARY"]

        site_conflicts = []
        resource_conflicts = []

        # 1. Анализ коллизий площадок между РАЗНЫМИ проектами
        for i in range(len(all_tasks)):
            for j in range(i + 1, len(all_tasks)):
                t1, t2 = all_tasks[i], all_tasks[j]
                if t1.project_id == t2.project_id:
                    continue
                p1, p2 = proj_map[t1.project_id], proj_map[t2.project_id]
                loc1 = (p1.location or "Цех ДСП").strip().lower()
                loc2 = (p2.location or "Цех ДСП").strip().lower()

                if loc1 == loc2:
                    overlap_start = max(t1.planned_start, t2.planned_start)
                    overlap_finish = min(t1.planned_finish, t2.planned_finish)
                    if overlap_start <= overlap_finish:
                        days = (overlap_finish - overlap_start).days + 1
                        site_conflicts.append({
                            "location": p1.location or "Цех ДСП",
                            "overlap_start": overlap_start.isoformat(),
                            "overlap_finish": overlap_finish.isoformat(),
                            "overlap_days": days,
                            "project_a": p1.code,
                            "task_a_wbs": t1.wbs_code,
                            "task_a_name": t1.name,
                            "project_b": p2.code,
                            "task_b_wbs": t2.wbs_code,
                            "task_b_name": t2.name,
                        })

        # 2. Анализ перегрузки исполнителей (Resource Overlap)
        for i in range(len(all_tasks)):
            for j in range(i + 1, len(all_tasks)):
                t1, t2 = all_tasks[i], all_tasks[j]
                names1 = set(clean_name(t1.raci_assignee))
                names2 = set(clean_name(t2.raci_assignee))
                shared_people = names1.intersection(names2)

                if shared_people:
                    overlap_start = max(t1.planned_start, t2.planned_start)
                    overlap_finish = min(t1.planned_finish, t2.planned_finish)
                    if overlap_start <= overlap_finish:
                        days = (overlap_finish - overlap_start).days + 1
                        p1, p2 = proj_map[t1.project_id], proj_map[t2.project_id]
                        for person in shared_people:
                            resource_conflicts.append({
                                "person": person,
                                "overlap_start": overlap_start.isoformat(),
                                "overlap_finish": overlap_finish.isoformat(),
                                "overlap_days": days,
                                "is_multi_project": t1.project_id != t2.project_id,
                                "project_a": p1.code,
                                "task_a_wbs": t1.wbs_code,
                                "task_a_name": t1.name,
                                "project_b": p2.code,
                                "task_b_wbs": t2.wbs_code,
                                "task_b_name": t2.name,
                            })

        return {
            "total_site_conflicts": len(site_conflicts),
            "total_resource_conflicts": len(resource_conflicts),
            "site_conflicts": site_conflicts[:20],
            "resource_conflicts": resource_conflicts[:20],
        }