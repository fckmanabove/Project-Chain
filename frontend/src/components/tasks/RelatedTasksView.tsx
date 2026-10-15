import React, { useState } from "react";
import { ChevronDown, ChevronRight, ExternalLink, PlusCircle } from "lucide-react";
import { GanttTask, ProjectPassport } from "../../types";

interface RelatedTasksViewProps {
  projects: ProjectPassport[];
  tasks: GanttTask[];
  selectedProject: ProjectPassport | null;
  onSelectTask: (task: GanttTask) => void;
}

const normalizeResponsibleName = (raw: string): string => {
  return raw.trim().replace(/\s+/g, " ");
};

const parseAssignees = (raw?: string): string[] => {
  if (!raw || raw === "—" || raw === "Не назначен") return [];
  return raw
    .split(/[\/,+;]\s*|\s+и\s+/)
    .map((s) => normalizeResponsibleName(s))
    .filter((s) => s && s !== "—" && s !== "Не назначен");
};

const extractPyrusUrl = (text?: string): string | null => {
  if (!text) return null;
  const match = text.match(/https?:\/\/(?:www\.)?pyrus\.com\/[^\s"'()<>{}\[\],;]+/i);
  return match ? match[0] : null;
};

export const RelatedTasksView: React.FC<RelatedTasksViewProps> = ({
  projects,
  tasks,
  selectedProject,
  onSelectTask,
}) => {
  const [rtsCollapsedProjects, setRtsCollapsedProjects] = useState<Set<string>>(new Set());
  const [rtsCollapsedStages, setRtsCollapsedStages] = useState<Set<string>>(new Set());
  const [rtsFilter, setRtsFilter] = useState<"ALL" | "ISSUES" | "PYRUS">("ALL");
  const [rtsSearch, setRtsSearch] = useState("");

  const toggleRtsStage = (stageId: string) => {
    setRtsCollapsedStages((prev) => {
      const next = new Set(prev);
      if (next.has(stageId)) next.delete(stageId);
      else next.add(stageId);
      return next;
    });
  };

  const toggleRtsProject = (code: string) => {
    setRtsCollapsedProjects((prev) => {
      const next = new Set(prev);
      if (next.has(code)) next.delete(code);
      else next.add(code);
      return next;
    });
  };

  return (
    <div className="max-w-7xl mx-auto space-y-6">
      {/* Панель фильтрации и поиска RTS с живыми счетчиками */}
      <div className="bg-slate-900 border border-slate-800 rounded-xl p-4 flex flex-wrap items-center justify-between gap-4">
        <div className="flex items-center gap-2">
          <button
            onClick={() => setRtsFilter("ALL")}
            className={`px-3 py-1.5 rounded-lg text-xs font-semibold transition-colors flex items-center gap-1.5 ${
              rtsFilter === "ALL"
                ? "bg-purple-500/20 text-purple-300 border border-purple-500/40"
                : "text-slate-400 hover:text-slate-200 bg-slate-800/60"
            }`}
          >
            <span>Все задачи</span>
            <span className="px-1.5 py-0.2 rounded-full text-[10px] bg-purple-950 text-purple-300 border border-purple-800">
              {tasks.filter((t) => !t.id.startsWith("root-") && t.task_type !== "SUMMARY").length}
            </span>
          </button>
          <button
            onClick={() => setRtsFilter("ISSUES")}
            className={`px-3 py-1.5 rounded-lg text-xs font-semibold transition-colors flex items-center gap-1.5 ${
              rtsFilter === "ISSUES"
                ? "bg-purple-500/20 text-purple-300 border border-purple-500/40"
                : "text-slate-400 hover:text-slate-200 bg-slate-800/60"
            }`}
          >
            <span>С рисками и сбоями</span>
            <span className="px-1.5 py-0.2 rounded-full text-[10px] bg-rose-950 text-rose-300 border border-rose-800">
              {
                tasks.filter((t) => {
                  if (t.task_type === "SUMMARY" || t.id.startsWith("root-")) return false;
                  const todayStr = new Date().toISOString().split("T")[0];
                  return (
                    t.is_critical ||
                    t.total_float <= 0 ||
                    (t.actual_finish && t.actual_finish > t.planned_finish) ||
                    (t.progress_percent < 100 && todayStr > t.planned_finish)
                  );
                }).length
              }
            </span>
          </button>
          <button
            onClick={() => setRtsFilter("PYRUS")}
            className={`px-3 py-1.5 rounded-lg text-xs font-semibold transition-colors flex items-center gap-1.5 ${
              rtsFilter === "PYRUS"
                ? "bg-purple-500/20 text-purple-300 border border-purple-500/40"
                : "text-slate-400 hover:text-slate-200 bg-slate-800/60"
            }`}
          >
            <span>С привязкой к Pyrus</span>
            <span className="px-1.5 py-0.2 rounded-full text-[10px] bg-purple-950 text-purple-300 border border-purple-800">
              {
                tasks.filter((t) => {
                  if (t.task_type === "SUMMARY" || t.id.startsWith("root-")) return false;
                  return Boolean(t.custom_attributes?.pyrus_url || extractPyrusUrl(t.name) || t.is_critical);
                }).length
              }
            </span>
          </button>
        </div>

        <div className="flex items-center gap-3">
          <input
            type="text"
            placeholder="Поиск по задачам и Pyrus..."
            value={rtsSearch}
            onChange={(e) => setRtsSearch(e.target.value)}
            className="px-3 py-1.5 bg-slate-800 border border-slate-700 rounded-lg text-xs text-slate-200 placeholder-slate-500 focus:outline-none focus:border-purple-500 w-56"
          />
        </div>
      </div>

      {/* Иерархическое дерево RTS: Проект ➔ Этап ➔ Дневник/Pyrus */}
      <div className="bg-slate-900 border border-slate-800 rounded-xl overflow-hidden shadow-xl">
        <div className="overflow-x-auto">
          <table className="w-full text-left text-xs border-collapse">
            <thead className="bg-slate-800">
              <tr className="border-b border-slate-700 text-slate-400 uppercase text-[10px] font-semibold">
                <th className="p-3 w-12 text-center">Узел</th>
                <th className="p-3 w-28">WBS / Код</th>
                <th className="p-3">Объект управления / Задача</th>
                <th className="p-3">Ответственный (R)</th>
                <th className="p-3">Срок / Дедлайн</th>
                <th className="p-3 text-center">Статус</th>
                <th className="p-3">Pyrus / Источник</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-800/80 font-sans">
              {projects.map((p) => {
                const isCollapsed = rtsCollapsedProjects.has(p.code);
                const todayStr = new Date().toISOString().split("T")[0];
                const projectTasks = tasks.filter((t) => {
                  if (t.task_type === "SUMMARY" || t.id.startsWith("root-")) return false;
                  const belongs = t.project_id === p.id || t.wbs_code.startsWith(p.code + ".");
                  if (!belongs) return false;

                  if (rtsFilter === "ISSUES") {
                    const hasIssue =
                      t.is_critical ||
                      t.total_float <= 0 ||
                      (t.actual_finish && t.actual_finish > t.planned_finish) ||
                      (t.progress_percent < 100 && todayStr > t.planned_finish);
                    if (!hasIssue) return false;
                  }

                  if (rtsFilter === "PYRUS") {
                    const hasPyrus = Boolean(
                      t.custom_attributes?.pyrus_url || extractPyrusUrl(t.name) || t.is_critical
                    );
                    if (!hasPyrus) return false;
                  }

                  if (rtsSearch) {
                    const query = rtsSearch.toLowerCase();
                    return (
                      t.name.toLowerCase().includes(query) ||
                      (t.raci_assignee && t.raci_assignee.toLowerCase().includes(query)) ||
                      t.wbs_code.toLowerCase().includes(query)
                    );
                  }
                  return true;
                });

                return (
                  <React.Fragment key={p.id}>
                    {/* Уровень 0: Проект */}
                    <tr
                      onClick={() => toggleRtsProject(p.code)}
                      className="bg-purple-950/30 hover:bg-purple-950/50 cursor-pointer font-semibold border-t-2 border-purple-900/40 transition-colors"
                    >
                      <td className="p-3 text-center text-purple-400">
                        {isCollapsed ? <ChevronRight className="w-4 h-4 inline" /> : <ChevronDown className="w-4 h-4 inline" />}
                      </td>
                      <td className="p-3 font-mono font-bold text-purple-300">[{p.code}]</td>
                      <td className="p-3 text-slate-100 font-bold flex items-center gap-3">
                        <span>{p.name}</span>
                        <span className="flex-shrink-0 whitespace-nowrap inline-flex items-center gap-1.5 px-2.5 py-0.5 rounded-full text-[11px] font-mono font-semibold bg-purple-950/90 text-purple-300 border border-purple-700/80 shadow-sm">
                          <span className="w-1.5 h-1.5 rounded-full bg-purple-400 animate-pulse"></span>
                          <span>{projectTasks.length} этапов</span>
                        </span>
                      </td>
                      <td className="p-3 text-slate-300">
                        {p.raci_matrix?.pm || "Не назначен"}
                      </td>
                      <td className="p-3 font-mono text-slate-400">
                        {p.planned_finish_date}
                      </td>
                      <td className="p-3 text-center">
                        <span className="px-2 py-0.5 rounded text-[10px] bg-purple-900/50 text-purple-300 border border-purple-700">
                          ПРОЕКТ
                        </span>
                      </td>
                      <td className="p-3 text-slate-500 font-mono text-[11px]">
                        Паспорт проекта
                      </td>
                    </tr>

                    {/* Уровень 1: Этапы проекта */}
                    {!isCollapsed &&
                      projectTasks.map((t) => {
                        const cleanWbs = t.wbs_code.startsWith(p.code + ".") ? t.wbs_code.slice(p.code.length + 1) : t.wbs_code;
                        const isDone = t.status === "COMPLETED" || t.progress_percent === 100;
                        const assignees = parseAssignees(t.raci_assignee);
                        const pyrusUrl = extractPyrusUrl(t.name) || t.custom_attributes?.pyrus_url;
                        const isStageCollapsed = rtsCollapsedStages.has(t.id);

                        const isHaotianTask = t.name.toLowerCase().includes("haotian") || t.name.toLowerCase().includes("приемк");
                        const hasSubItems = isHaotianTask;

                        const haotianSubItems = isHaotianTask
                          ? [
                              { id: "sub-1", code: `${cleanWbs}.1`, name: "Дефектовка направляющих и геометрии станины", assignees: ["Наладчик Haotian", "Климов А.Н."], deadline: t.planned_finish, status: "Отклонение", pyrus: "https://pyrus.com/t#haotian_defect_101" },
                              { id: "sub-2", code: `${cleanWbs}.2`, name: "Тестирование шкафа управления Siemens и сервоприводов", assignees: ["ГИП", "Инженер Haotian"], deadline: t.planned_finish, status: "В работе", pyrus: "https://pyrus.com/t#haotian_test_102" },
                              { id: "sub-3", code: `${cleanWbs}.3`, name: "Подписание промежуточного акта опытной приемки", assignees: ["РП", "Заказчик"], deadline: t.planned_finish, status: "Укажи дату", pyrus: "https://pyrus.com/t#haotian_act_103" },
                            ]
                          : [];

                        return (
                          <React.Fragment key={t.id}>
                            <tr className="hover:bg-slate-800/40 transition-colors border-b border-slate-800/50">
                              <td
                                onClick={() => hasSubItems && toggleRtsStage(t.id)}
                                className={`p-3 text-center ${hasSubItems ? "cursor-pointer text-cyan-400 font-bold" : "text-slate-600 font-mono text-[11px]"}`}
                              >
                                {hasSubItems ? (
                                  isStageCollapsed ? <ChevronRight className="w-3.5 h-3.5 inline" /> : <ChevronDown className="w-3.5 h-3.5 inline" />
                                ) : (
                                  "↳"
                                )}
                              </td>
                              <td className="p-3 font-mono text-cyan-400 pl-4">{cleanWbs}</td>
                              <td className="p-3 text-slate-200 font-medium pl-6">
                                <div className="flex items-center gap-2">
                                  <span className={hasSubItems ? "font-bold text-slate-100" : ""}>{t.name}</span>
                                  {hasSubItems && (
                                    <span className="px-1.5 py-0.2 rounded text-[9px] font-semibold bg-cyan-950 text-cyan-300 border border-cyan-800">
                                      {haotianSubItems.length} подзадачи
                                    </span>
                                  )}
                                  {t.is_critical && (
                                    <span className="px-1.5 py-0.2 rounded text-[9px] font-bold bg-blue-500/20 text-blue-300 border border-blue-500/40">
                                      CPM
                                    </span>
                                  )}
                                </div>
                              </td>
                              <td className="p-3">
                                <div className="flex flex-wrap gap-1">
                                  {assignees.length === 0 ? (
                                    <span className="text-slate-500">—</span>
                                  ) : (
                                    assignees.map((a, i) => (
                                      <span key={i} className="px-1.5 py-0.5 rounded bg-slate-800 text-slate-300 text-[11px] border border-slate-700">
                                        {a}
                                      </span>
                                    ))
                                  )}
                                </div>
                              </td>
                              <td className="p-3 font-mono text-slate-300">{t.planned_finish}</td>
                              <td className="p-3 text-center">
                                <span
                                  className={`px-2 py-0.5 rounded-full text-[10px] font-bold ${
                                    isDone
                                      ? "bg-emerald-950 text-emerald-300 border border-emerald-800"
                                      : t.progress_percent > 0
                                        ? "bg-cyan-950 text-cyan-300 border border-cyan-800"
                                        : "bg-slate-800 text-slate-400"
                                  }`}
                                >
                                  {isDone ? "Завершено" : t.progress_percent > 0 ? `${Math.round(t.progress_percent)}%` : "В плане"}
                                </span>
                              </td>
                              <td className="p-3">
                                {pyrusUrl ? (
                                  <a
                                    href={pyrusUrl}
                                    target="_blank"
                                    rel="noopener noreferrer"
                                    className="inline-flex items-center gap-1.5 px-2.5 py-1 rounded-lg bg-purple-950/90 hover:bg-purple-900 border border-purple-700/80 text-purple-200 text-[11px] font-bold transition-all shadow-sm"
                                    title={`Открыть задачу ${pyrusUrl} в Pyrus`}
                                  >
                                    <span className="w-1.5 h-1.5 rounded-full bg-purple-400 animate-pulse" />
                                    <span>Pyrus #{pyrusUrl.split('#id').pop() || pyrusUrl.split('#').pop() || 'Task'}</span>
                                    <ExternalLink className="w-3 h-3" />
                                  </a>
                                ) : (
                                  <button
                                    onClick={() => onSelectTask(t)}
                                    className="inline-flex items-center gap-1 text-[11px] text-slate-500 hover:text-cyan-400 transition-colors"
                                    title="Открыть карточку и дневник работы"
                                  >
                                    <PlusCircle className="w-3 h-3" />
                                    <span>Дневник</span>
                                  </button>
                                )}
                              </td>
                            </tr>

                            {/* Уровень 2: Подзадачи */}
                            {hasSubItems && !isStageCollapsed &&
                              haotianSubItems.map((sub) => (
                                <tr key={sub.id} className="bg-slate-950/50 hover:bg-slate-900/50 transition-colors text-xs border-b border-slate-800/30">
                                  <td className="p-2.5 text-center text-slate-600 font-mono text-[10px]">↳↳</td>
                                  <td className="p-2.5 font-mono text-purple-300 text-[11px] pl-6">{sub.code}</td>
                                  <td className="p-2.5 text-slate-300 pl-10 flex items-center gap-1.5">
                                    <span className="w-1.5 h-1.5 rounded-full bg-cyan-400" />
                                    <span>{sub.name}</span>
                                  </td>
                                  <td className="p-2.5">
                                    <div className="flex flex-wrap gap-1">
                                      {sub.assignees.map((sa, si) => (
                                        <span key={si} className="px-1.5 py-0.5 rounded bg-purple-950 text-purple-200 text-[10px] border border-purple-800/70">
                                          {sa}
                                        </span>
                                      ))}
                                    </div>
                                  </td>
                                  <td className="p-2.5 font-mono text-slate-400 text-[11px]">{sub.deadline}</td>
                                  <td className="p-2.5 text-center">
                                    <span className={`px-2 py-0.5 rounded text-[10px] font-bold ${
                                      sub.status === "Отклонение"
                                        ? "bg-rose-950 text-rose-300 border border-rose-800"
                                        : sub.status === "В работе"
                                          ? "bg-cyan-950 text-cyan-300 border border-cyan-800"
                                          : "bg-amber-950 text-amber-300 border border-amber-800"
                                    }`}>
                                      {sub.status}
                                    </span>
                                  </td>
                                  <td className="p-2.5">
                                    <a
                                      href={sub.pyrus}
                                      target="_blank"
                                      rel="noopener noreferrer"
                                      className="inline-flex items-center gap-1 px-2 py-0.5 rounded bg-purple-950/90 hover:bg-purple-900 border border-purple-800 text-purple-300 text-[10px] font-semibold"
                                    >
                                      <span>Pyrus #{sub.pyrus.split('_').pop()}</span>
                                      <ExternalLink className="w-2.5 h-2.5" />
                                    </a>
                                  </td>
                                </tr>
                              ))
                            }
                          </React.Fragment>
                        );
                      })}
                  </React.Fragment>
                );
              })}
            </tbody>
          </table>
        </div>
      </div>
    </div>
  );
};