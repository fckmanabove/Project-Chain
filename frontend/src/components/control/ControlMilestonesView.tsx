import React, { useState } from "react";
import { Plus } from "lucide-react";
import { GanttTask, ProjectPassport } from "../../types";

interface ControlMilestonesViewProps {
  tasks: GanttTask[];
  projects: ProjectPassport[];
  selectedProject: ProjectPassport | null;
  onOpenCreateTask: () => void;
}

export const ControlMilestonesView: React.FC<ControlMilestonesViewProps> = ({
  tasks,
  projects,
  selectedProject,
  onOpenCreateTask,
}) => {
  const [controlFilter, setControlFilter] = useState<"ACTIVE" | "MILESTONES" | "ALL">("ACTIVE");

  const isMilestoneTask = (t: GanttTask) => {
    if (t.task_type === "MILESTONE" || t.planned_duration === 0 || t.planned_duration === 1) {
      return true;
    }
    const lower = t.name.toLowerCase();
    const markers = [
      "вех",
      "сдач",
      "акт",
      "приемк",
      "запуск",
      "финиш",
      "итог",
      "подписан",
      "ввод",
      "контроль",
    ];
    return markers.some((m) => lower.includes(m));
  };

  const activeCount = tasks.filter(
    (t) => !t.id.startsWith("root-") && t.task_type !== "SUMMARY" && t.status !== "COMPLETED" && t.progress_percent < 100
  ).length;

  const milestonesCount = tasks.filter(
    (t) => !t.id.startsWith("root-") && t.task_type !== "SUMMARY" && isMilestoneTask(t)
  ).length;

  const allCount = tasks.filter(
    (t) => !t.id.startsWith("root-") && t.task_type !== "SUMMARY"
  ).length;

  return (
    <div className="max-w-7xl mx-auto space-y-6">
      {/* Панель фильтров и статистики листа Контроль */}
      <div className="bg-slate-900 border border-slate-800 rounded-xl p-4 flex flex-wrap items-center justify-between gap-4">
        <div className="flex items-center gap-2">
          <button
            onClick={() => setControlFilter("ACTIVE")}
            className={`px-3 py-1.5 rounded-lg text-xs font-semibold transition-colors flex items-center gap-1.5 ${
              controlFilter === "ACTIVE"
                ? "bg-amber-500/20 text-amber-300 border border-amber-500/40"
                : "text-slate-400 hover:text-slate-200 bg-slate-800/60"
            }`}
          >
            <span>Требуют закрытия</span>
            <span className="px-1.5 py-0.2 rounded-full text-[10px] bg-amber-950 text-amber-300 border border-amber-800">
              {activeCount}
            </span>
          </button>
          <button
            onClick={() => setControlFilter("MILESTONES")}
            className={`px-3 py-1.5 rounded-lg text-xs font-semibold transition-colors flex items-center gap-1.5 ${
              controlFilter === "MILESTONES"
                ? "bg-amber-500/20 text-amber-300 border border-amber-500/40"
                : "text-slate-400 hover:text-slate-200 bg-slate-800/60"
            }`}
          >
            <span>Контрольные точки / Вехи</span>
            <span className="px-1.5 py-0.2 rounded-full text-[10px] bg-amber-950 text-amber-300 border border-amber-800">
              {milestonesCount}
            </span>
          </button>
          <button
            onClick={() => setControlFilter("ALL")}
            className={`px-3 py-1.5 rounded-lg text-xs font-semibold transition-colors flex items-center gap-1.5 ${
              controlFilter === "ALL"
                ? "bg-amber-500/20 text-amber-300 border border-amber-500/40"
                : "text-slate-400 hover:text-slate-200 bg-slate-800/60"
            }`}
          >
            <span>Все этапы</span>
            <span className="px-1.5 py-0.2 rounded-full text-[10px] bg-slate-800 text-slate-300">
              {allCount}
            </span>
          </button>
        </div>

        <div className="flex items-center gap-3">
          <div className="text-xs text-slate-400 font-mono hidden sm:block">
            Всего этапов:{" "}
            <span className="text-amber-400 font-bold">
              {allCount}
            </span>
          </div>

          <button
            onClick={onOpenCreateTask}
            className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg bg-amber-500 hover:bg-amber-400 text-slate-950 font-bold text-xs transition-colors shadow-md shadow-amber-950/40"
            title="Создать контрольную точку или этап"
          >
            <Plus className="w-3.5 h-3.5" />
            <span>Добавить этап / веху</span>
          </button>
        </div>
      </div>

      {/* Таблица оперативного закрытия контрольных точек */}
      <div className="bg-slate-900 border border-slate-800 rounded-xl overflow-hidden shadow-xl">
        <div className="overflow-x-auto">
          <table className="w-full text-left text-xs border-collapse">
            <thead className="bg-slate-800">
              <tr className="border-b border-slate-700 text-slate-400 uppercase text-[10px] font-semibold">
                <th className="p-3">Проект</th>
                <th className="p-3">WBS</th>
                <th className="p-3">Наименование этапа / вехи</th>
                <th className="p-3">Ответственный (R)</th>
                <th className="p-3">План финиш</th>
                <th className="p-3 text-center">Факт %</th>
                <th className="p-3 text-center">Статус исполнения</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-800/80 font-sans">
              {tasks
                .filter((t) => {
                  if (t.task_type === "SUMMARY" || t.id.startsWith("root-")) return false;
                  if (controlFilter === "ACTIVE") {
                    return t.status !== "COMPLETED" && t.progress_percent < 100;
                  }
                  if (controlFilter === "MILESTONES") return isMilestoneTask(t);
                  return true;
                })
                .map((t) => {
                  const proj = projects.find((p) => p.id === t.project_id) || selectedProject;
                  const pCode =
                    proj?.code ||
                    (t.wbs_code.startsWith("P-") ? t.wbs_code.split(".")[0] : "P-000");
                  const cleanWbs = t.wbs_code.startsWith(pCode + ".")
                    ? t.wbs_code.slice(pCode.length + 1)
                    : t.wbs_code;
                  const isDone = t.status === "COMPLETED" || t.progress_percent === 100;
                  const isMilestone = isMilestoneTask(t);

                  return (
                    <tr key={t.id} className="hover:bg-slate-800/40 transition-colors">
                      <td className="p-3 font-mono font-bold text-cyan-400">
                        {pCode}
                      </td>
                      <td className="p-3 font-mono text-slate-300">
                        {cleanWbs}
                      </td>
                      <td className="p-3 font-medium text-slate-100 max-w-sm truncate">
                        {t.name}
                        {isMilestone && (
                          <span className="ml-2 px-1.5 py-0.5 rounded text-[9px] font-bold bg-amber-500/20 text-amber-300 border border-amber-500/30">
                            ВЕХА / КТ
                          </span>
                        )}
                      </td>
                      <td className="p-3 text-slate-400">
                        {t.raci_assignee || "—"}
                      </td>
                      <td className="p-3 font-mono text-slate-300">
                        {t.planned_finish}
                      </td>
                      <td className="p-3 text-center font-mono">
                        <span
                          className={
                            isDone
                              ? "text-emerald-400 font-bold"
                              : t.progress_percent > 0
                                ? "text-cyan-400 font-semibold"
                                : "text-slate-500"
                          }
                        >
                          {Math.round(t.progress_percent)}%
                        </span>
                      </td>
                      <td className="p-3 text-center text-xs">
                        {(() => {
                          const todayStr = new Date().toISOString().split("T")[0];
                          if (isDone) {
                            return (
                              <span className="font-semibold text-emerald-400">
                                ✓ Завершено {t.actual_finish ? `(${t.actual_finish})` : ""}
                              </span>
                            );
                          }
                          if (t.status === "SUSPENDED") {
                            return <span className="text-slate-400 font-medium">⏸ На паузе</span>;
                          }
                          if (todayStr > t.planned_finish) {
                            return <span className="text-rose-400 font-bold">Срыв срока ({t.planned_finish})</span>;
                          }
                          if (t.status === "IN_PROGRESS" || t.progress_percent > 0) {
                            return (
                              <span className="text-cyan-400 font-medium">
                                В работе {t.actual_start ? `(с ${t.actual_start})` : ""}
                              </span>
                            );
                          }
                          return <span className="text-slate-400 font-normal">План ({t.planned_finish})</span>;
                        })()}
                      </td>
                    </tr>
                  );
                })}
            </tbody>
          </table>
        </div>
      </div>
    </div>
  );
};