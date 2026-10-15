import React, { useState, useMemo } from "react";
import { ShieldAlert, BarChart3 } from "lucide-react";
import { ProjectPassport, GanttTask } from "../../types";

interface PortfolioStateViewProps {
  projects: ProjectPassport[];
  tasks: GanttTask[];
  selectedProject: ProjectPassport | null;
}

export const PortfolioStateView: React.FC<PortfolioStateViewProps> = ({
  projects,
  tasks,
  selectedProject,
}) => {
  const [onlyCriticalPCC, setOnlyCriticalPCC] = useState(false);

  const pccAnalysis = useMemo(() => {
    const todayStr = new Date().toISOString().split("T")[0];
    const violations: Array<{
      code: "Y01" | "Y02" | "Y03" | "Y04" | "R01" | "R02";
      level: "CRITICAL" | "WARNING";
      projectId: string;
      projectCode: string;
      wbs: string;
      taskName: string;
      assignee: string;
      message: string;
    }> = [];

    tasks.forEach((t) => {
      if (t.task_type === "SUMMARY" || t.id.startsWith("root-")) return;

      const proj = projects.find((p) => p.id === t.project_id) || selectedProject;
      const pCode =
        proj?.code ||
        (t.wbs_code.startsWith("P-") ? t.wbs_code.split(".")[0] : "P-000");
      const cleanWbs = t.wbs_code.startsWith(pCode + ".")
        ? t.wbs_code.slice(pCode.length + 1)
        : t.wbs_code;

      if (
        todayStr > t.planned_finish &&
        t.status !== "COMPLETED" &&
        t.progress_percent < 100
      ) {
        violations.push({
          code: "R01",
          level: "CRITICAL",
          projectId: t.project_id,
          projectCode: pCode,
          wbs: cleanWbs,
          taskName: t.name,
          assignee: t.raci_assignee || "—",
          message: `Срыв планового окончания (${t.planned_finish})`,
        });
      }
      if (t.actual_finish && t.actual_finish > t.planned_finish) {
        violations.push({
          code: "R02",
          level: "CRITICAL",
          projectId: t.project_id,
          projectCode: pCode,
          wbs: cleanWbs,
          taskName: t.name,
          assignee: t.raci_assignee || "—",
          message: `Факт завершения ${t.actual_finish} позже плана`,
        });
      }
      if (!t.planned_start || !t.planned_finish) {
        violations.push({
          code: "Y01",
          level: "WARNING",
          projectId: t.project_id,
          projectCode: pCode,
          wbs: cleanWbs,
          taskName: t.name,
          assignee: t.raci_assignee || "—",
          message: "Не заполнены плановые даты",
        });
      }
      if (
        !t.raci_assignee ||
        t.raci_assignee === "-" ||
        t.raci_assignee === "—"
      ) {
        violations.push({
          code: "Y02",
          level: "WARNING",
          projectId: t.project_id,
          projectCode: pCode,
          wbs: cleanWbs,
          taskName: t.name,
          assignee: "—",
          message: "Не назначен ответственный исполнитель",
        });
      }
      if (
        (t.status === "IN_PROGRESS" || t.progress_percent > 0) &&
        !t.actual_start
      ) {
        violations.push({
          code: "Y03",
          level: "WARNING",
          projectId: t.project_id,
          projectCode: pCode,
          wbs: cleanWbs,
          taskName: t.name,
          assignee: t.raci_assignee || "—",
          message: "Активный статус, но факт старт не указан",
        });
      }
      if (
        todayStr > t.planned_start &&
        !t.actual_start &&
        t.progress_percent === 0
      ) {
        violations.push({
          code: "Y04",
          level: "WARNING",
          projectId: t.project_id,
          projectCode: pCode,
          wbs: cleanWbs,
          taskName: t.name,
          assignee: t.raci_assignee || "—",
          message: `Просрочен плановый старт (${t.planned_start})`,
        });
      }
    });

    const healthByProject: Record<
      string,
      { status: "НОРМА" | "РИСК" | "ПРОБЛЕМА"; red: number; yellow: number }
    > = {};
    projects.forEach((p) => {
      const pViols = violations.filter(
        (v) => v.projectId === p.id || v.projectCode === p.code,
      );
      const red = pViols.filter((v) => v.level === "CRITICAL").length;
      const yellow = pViols.filter((v) => v.level === "WARNING").length;
      healthByProject[p.code] = {
        status: red > 0 ? "ПРОБЛЕМА" : yellow > 0 ? "РИСК" : "НОРМА",
        red,
        yellow,
      };
    });

    return { violations, healthByProject };
  }, [tasks, projects, selectedProject]);

  return (
    <div className="max-w-7xl mx-auto space-y-6">
      {/* KPI Сводка дашборда PCC 1.5 */}
      <div className="grid grid-cols-2 sm:grid-cols-5 gap-3">
        <div className="bg-slate-900/90 border border-slate-800 p-4 rounded-xl">
          <div className="text-[11px] text-slate-400 font-semibold uppercase">
            Проектов
          </div>
          <div className="text-2xl font-mono font-extrabold text-slate-100 mt-1">
            {projects.length}
          </div>
        </div>
        <div className="bg-slate-900/90 border border-emerald-900/40 p-4 rounded-xl">
          <div className="text-[11px] text-emerald-400 font-semibold uppercase">
            Норма
          </div>
          <div className="text-2xl font-mono font-extrabold text-emerald-400 mt-1">
            {
              Object.values(pccAnalysis.healthByProject).filter(
                (h) => h.status === "НОРМА",
              ).length
            }
          </div>
        </div>
        <div className="bg-slate-900/90 border border-amber-900/40 p-4 rounded-xl">
          <div className="text-[11px] text-amber-400 font-semibold uppercase">
            В зоне риска
          </div>
          <div className="text-2xl font-mono font-extrabold text-amber-400 mt-1">
            {
              Object.values(pccAnalysis.healthByProject).filter(
                (h) => h.status === "РИСК",
              ).length
            }
          </div>
        </div>
        <div className="bg-slate-900/90 border border-rose-900/40 p-4 rounded-xl">
          <div className="text-[11px] text-rose-400 font-semibold uppercase">
            Срыв сроков
          </div>
          <div className="text-2xl font-mono font-extrabold text-rose-400 mt-1">
            {
              Object.values(pccAnalysis.healthByProject).filter(
                (h) => h.status === "ПРОБЛЕМА",
              ).length
            }
          </div>
        </div>
        <div className="bg-slate-900/90 border border-cyan-900/40 p-4 rounded-xl col-span-2 sm:col-span-1">
          <div className="text-[11px] text-cyan-400 font-semibold uppercase">
            Всего инцидентов
          </div>
          <div className="text-2xl font-mono font-extrabold text-cyan-400 mt-1">
            {pccAnalysis.violations.length}
          </div>
        </div>
      </div>

      {/* Таблица 1: Здоровье проектов (tblPCCPortfolioHealth) */}
      <div className="bg-slate-900 border border-slate-800 rounded-xl overflow-hidden shadow-xl">
        <div className="p-4 bg-slate-850 border-b border-slate-800 flex items-center justify-between">
          <h3 className="text-xs font-bold text-slate-200 uppercase tracking-wider flex items-center gap-2">
            <ShieldAlert className="w-4 h-4 text-rose-400" />
            Здоровье проектов (tblPCCPortfolioHealth)
          </h3>
        </div>
        <div className="overflow-x-auto">
          <table className="w-full text-left text-xs border-collapse">
            <thead>
              <tr className="bg-slate-800/80 border-b border-slate-700 text-slate-400 uppercase text-[10px] font-semibold">
                <th className="p-3">Шифр</th>
                <th className="p-3">Наименование проекта</th>
                <th className="p-3">Руководитель (РП)</th>
                <th className="p-3 text-center">Статус здоровья</th>
                <th className="p-3 text-center">Красных (R)</th>
                <th className="p-3 text-center">Желтых (Y)</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-800/80 font-sans">
              {projects.map((p) => {
                const h = pccAnalysis.healthByProject[p.code] || {
                  status: "НОРМА",
                  red: 0,
                  yellow: 0,
                };
                const badgeClass =
                  h.status === "ПРОБЛЕМА"
                    ? "bg-rose-950/80 text-rose-300 border-rose-800"
                    : h.status === "РИСК"
                      ? "bg-amber-950/80 text-amber-300 border-amber-800"
                      : "bg-emerald-950/80 text-emerald-300 border-emerald-800";

                return (
                  <tr
                    key={p.id}
                    className="hover:bg-slate-800/40 transition-colors"
                  >
                    <td className="p-3 font-mono font-bold text-cyan-400">
                      {p.code}
                    </td>
                    <td className="p-3 font-medium text-slate-200 max-w-xs truncate">
                      {p.name}
                    </td>
                    <td className="p-3 text-slate-400">
                      {p.raci_matrix?.pm || "Не назначен"}
                    </td>
                    <td className="p-3 text-center">
                      <span
                        className={`px-2.5 py-1 rounded-full text-[10px] font-extrabold border ${badgeClass}`}
                      >
                        {h.status}
                      </span>
                    </td>
                    <td className="p-3 text-center font-mono font-bold text-rose-400">
                      {h.red}
                    </td>
                    <td className="p-3 text-center font-mono font-bold text-amber-400">
                      {h.yellow}
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      </div>

      {/* Таблица 2: Реестр нарушений (tblPCCPortfolioProblems) */}
      <div className="bg-slate-900 border border-slate-800 rounded-xl overflow-hidden shadow-xl">
        <div className="p-4 bg-slate-850 border-b border-slate-800 flex flex-wrap items-center justify-between gap-4">
          <h3 className="text-xs font-bold text-slate-200 uppercase tracking-wider flex items-center gap-2">
            <BarChart3 className="w-4 h-4 text-cyan-400" />
            Реестр нарушений и отклонений (tblPCCPortfolioProblems)
          </h3>
          <label className="flex items-center gap-2 text-xs text-slate-300 cursor-pointer select-none">
            <input
              type="checkbox"
              checked={onlyCriticalPCC}
              onChange={(e) => setOnlyCriticalPCC(e.target.checked)}
              className="rounded border-slate-700 bg-slate-800 text-rose-500 focus:ring-0 w-4 h-4"
            />
            <span>Только критические срывы [R01–R02]</span>
          </label>
        </div>

        <div className="overflow-x-auto">
          <table className="w-full text-left text-xs border-collapse">
            <thead className="bg-slate-800">
              <tr className="border-b border-slate-700 text-slate-400 uppercase text-[10px] font-semibold">
                <th className="p-3">Код</th>
                <th className="p-3">Проект</th>
                <th className="p-3">WBS</th>
                <th className="p-3">Наименование работы</th>
                <th className="p-3">Ответственный (R)</th>
                <th className="p-3">Диагностика нарушения</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-800/80 font-sans">
              {pccAnalysis.violations
                .filter((v) =>
                  onlyCriticalPCC ? v.level === "CRITICAL" : true,
                )
                .map((v, idx) => (
                  <tr
                    key={idx}
                    className="hover:bg-slate-800/40 transition-colors"
                  >
                    <td className="p-3">
                      <span
                        className={`px-1.5 py-0.5 rounded font-mono text-[10px] font-extrabold ${
                          v.level === "CRITICAL"
                            ? "bg-rose-950 text-rose-400 border border-rose-800"
                            : "bg-amber-950 text-amber-400 border border-amber-800"
                        }`}
                      >
                        {v.code}
                      </span>
                    </td>
                    <td className="p-3 font-mono font-bold text-slate-300">
                      {v.projectCode}
                    </td>
                    <td className="p-3 font-mono text-cyan-400">
                      {v.wbs}
                    </td>
                    <td className="p-3 text-slate-200 font-medium max-w-xs truncate">
                      {v.taskName}
                    </td>
                    <td className="p-3 text-slate-400">{v.assignee}</td>
                    <td className="p-3 text-rose-300 font-medium">
                      {v.message}
                    </td>
                  </tr>
                ))}
            </tbody>
          </table>
        </div>
      </div>
    </div>
  );
};