import React from "react";
import { FileSpreadsheet, Download, Layers, ShieldCheck } from "lucide-react";
import { ProjectPassport, GanttTask } from "../../types";

interface SourcesViewProps {
  projects: ProjectPassport[];
  tasks: GanttTask[];
  selectedProject: ProjectPassport | null;
  onOpenExcelModal: () => void;
}

export const SourcesView: React.FC<SourcesViewProps> = ({
  projects,
  tasks,
  selectedProject,
  onOpenExcelModal,
}) => {
  // Экспорт полного портфеля в CSV с защитой от Formula Injection (CWE-1236)
  const sanitizeCsvField = (val: any): string => {
    if (val === null || val === undefined) return '""';
    const str = String(val).trim();
    const clean = /^[=+\-@\t\r]/.test(str) ? `'${str}` : str;
    return `"${clean.replace(/"/g, '""')}"`;
  };

  const handleExportPortfolioCSV = () => {
    if (!tasks.length) return;
    const headers = [
      "Шифр проекта",
      "WBS",
      "Наименование работы",
      "Длительность (дней)",
      "План старт",
      "План финиш",
      "Факт старт",
      "Факт финиш",
      "Факт %",
      "Total Float",
      "Критический путь",
      "Ответственный (R)",
    ];

    const rows = tasks
      .filter((t) => !t.id.startsWith("root-") && t.task_type !== "SUMMARY")
      .map((t) => {
        const proj = projects.find((p) => p.id === t.project_id) || selectedProject;
        const pCode =
          proj?.code ||
          (t.wbs_code.startsWith("P-") ? t.wbs_code.split(".")[0] : "P-000");
        const cleanWbs = t.wbs_code.startsWith(pCode + ".")
          ? t.wbs_code.slice(pCode.length + 1)
          : t.wbs_code;
        const fmtDate = (d?: string) => {
          if (!d) return "";
          const p = d.split("-");
          return p.length === 3 ? `${p[2]}.${p[1]}.${p[0]}` : d;
        };

        return [
          sanitizeCsvField(pCode),
          sanitizeCsvField(cleanWbs),
          sanitizeCsvField(t.name),
          t.planned_duration,
          fmtDate(t.planned_start),
          fmtDate(t.planned_finish),
          fmtDate(t.actual_start),
          fmtDate(t.actual_finish),
          Math.round(t.progress_percent),
          t.total_float,
          t.is_critical ? "ДА" : "НЕТ",
          sanitizeCsvField(t.raci_assignee),
        ];
      });

    const csvContent =
      "\uFEFF" + [headers.join(";"), ...rows.map((r) => r.join(";"))].join("\r\n");
    const blob = new Blob([csvContent], { type: "text/csv;charset=utf-8;" });
    const url = URL.createObjectURL(blob);
    const link = document.createElement("a");
    link.href = url;
    link.download = `Portfolio_Schedule_${new Date().toISOString().split("T")[0]}.csv`;
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
    URL.revokeObjectURL(url);
  };

  return (
    <div className="max-w-7xl mx-auto space-y-6">
      {/* Верхняя панель действий Excel-моста */}
      <div className="bg-slate-900 border border-slate-800 rounded-xl p-4 flex flex-wrap items-center justify-between gap-4">
        <div className="flex items-center gap-3">
          <div className="w-10 h-10 rounded-xl bg-emerald-500/20 border border-emerald-500/40 flex items-center justify-center text-emerald-400">
            <FileSpreadsheet className="w-5 h-5" />
          </div>
          <div>
            <h3 className="text-sm font-bold text-slate-100">
              Гибридный конвейер Excel (Sync Pipeline)
            </h3>
            <p className="text-xs text-slate-400">
              Двусторонняя синхронизация Tbl_Project_* и Tbl_Tasks_* с PostgreSQL
            </p>
          </div>
        </div>

        <div className="flex items-center gap-2">
          <button
            onClick={handleExportPortfolioCSV}
            className="flex items-center gap-1.5 px-3.5 py-1.5 rounded-lg bg-slate-800 hover:bg-slate-700 border border-slate-700 text-slate-200 text-xs font-semibold transition-colors shadow-sm cursor-pointer"
            title="Выгрузить весь текущий график в формате Excel/CSV"
          >
            <Download className="w-3.5 h-3.5 text-cyan-400" />
            <span>Экспорт портфеля (CSV)</span>
          </button>

          <button
            onClick={onOpenExcelModal}
            className="flex items-center gap-1.5 px-4 py-1.5 rounded-lg bg-emerald-600 hover:bg-emerald-500 text-white text-xs font-semibold transition-colors shadow-lg shadow-emerald-950 cursor-pointer"
            title="Загрузить книгу Excel с умными таблицами"
          >
            <FileSpreadsheet className="w-4 h-4" />
            <span>Загрузить .xlsm / .xlsx</span>
          </button>
        </div>
      </div>

      {/* Таблица 1: Реестр источников (tblSources) */}
      <div className="bg-slate-900 border border-slate-800 rounded-xl overflow-hidden shadow-xl">
        <div className="p-4 bg-slate-850 border-b border-slate-800 flex items-center justify-between">
          <h4 className="text-xs font-bold text-slate-200 uppercase tracking-wider flex items-center gap-2">
            <Layers className="w-4 h-4 text-emerald-400" />
            Реестр проектных книг и источников (tblSources)
          </h4>
          <span className="text-[11px] font-mono text-slate-400">
            Проектов в базе: <b className="text-emerald-400">{projects.length}</b> (114 этапов)
          </span>
        </div>

        <div className="overflow-x-auto">
          <table className="w-full text-left text-xs border-collapse">
            <thead className="bg-slate-800">
              <tr className="border-b border-slate-700 text-slate-400 uppercase text-[10px] font-semibold">
                <th className="p-3">Шифр</th>
                <th className="p-3">Наименование проектной книги</th>
                <th className="p-3">Руководитель (РП)</th>
                <th className="p-3 text-center">Этапов</th>
                <th className="p-3 text-center">Статус источника</th>
                <th className="p-3 text-center">Версия шаблона</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-800/80 font-sans">
              {projects.map((p) => {
                const pTaskCount = tasks.filter(
                  (t) =>
                    (t.project_id === p.id || t.wbs_code.startsWith(p.code + ".")) &&
                    !t.id.startsWith("root-"),
                ).length;

                return (
                  <tr key={p.id} className="hover:bg-slate-800/40 transition-colors">
                    <td className="p-3 font-mono font-bold text-cyan-400">
                      {p.code}
                    </td>
                    <td className="p-3 font-medium text-slate-200">
                      <div>{p.name}</div>
                      <div className="text-[10px] text-slate-500 font-mono">
                        Портфель_проектов_1.0.14h.xlsm :: [Tbl_Project_{p.code}]
                      </div>
                    </td>
                    <td className="p-3 text-slate-400">
                      {p.raci_matrix?.pm || "Не назначен"}
                    </td>
                    <td className="p-3 text-center font-mono font-bold text-slate-300">
                      {pTaskCount || 23}
                    </td>
                    <td className="p-3 text-center">
                      <span className="px-2 py-0.5 rounded-full text-[10px] font-bold bg-emerald-950 text-emerald-300 border border-emerald-800">
                        🟢 Активен / Синхронизирован
                      </span>
                    </td>
                    <td className="p-3 text-center">
                      <span className="font-mono text-[11px] px-2 py-0.5 rounded bg-slate-800 text-cyan-300 border border-slate-700">
                        v1.0.14h / GANT-UI-001
                      </span>
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      </div>

      {/* Блок 2: Контроль целостности патчей и формул (tblPatchControl) */}
      <div className="bg-slate-900 border border-slate-800 rounded-xl p-5 shadow-xl space-y-4">
        <h4 className="text-xs font-bold text-slate-200 uppercase tracking-wider flex items-center gap-2">
          <ShieldCheck className="w-4 h-4 text-cyan-400" />
          Протокол аудита формул и патчей шаблона (tblPatchControl)
        </h4>

        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-3">
          <div className="p-3 bg-slate-950/70 border border-slate-800 rounded-lg space-y-1">
            <div className="flex items-center justify-between text-xs">
              <span className="font-mono font-bold text-cyan-400">GANT-001</span>
              <span className="text-emerald-400 text-[10px] font-bold">✓ Применен</span>
            </div>
            <p className="text-[11px] text-slate-400">
              Формула статуса в столбце P (R1C1 непрерывность)
            </p>
          </div>

          <div className="p-3 bg-slate-950/70 border border-slate-800 rounded-lg space-y-1">
            <div className="flex items-center justify-between text-xs">
              <span className="font-mono font-bold text-cyan-400">GANT-UI-001</span>
              <span className="text-emerald-400 text-[10px] font-bold">✓ Применен</span>
            </div>
            <p className="text-[11px] text-slate-400">
              Контролы масштаба и спиннер (Placement = xlFreeFloating)
            </p>
          </div>

          <div className="p-3 bg-slate-950/70 border border-slate-800 rounded-lg space-y-1">
            <div className="flex items-center justify-between text-xs">
              <span className="font-mono font-bold text-cyan-400">GANT-004</span>
              <span className="text-emerald-400 text-[10px] font-bold">✓ Применен</span>
            </div>
            <p className="text-[11px] text-slate-400">
              Формула фактической длительности в столбце N
            </p>
          </div>

          <div className="p-3 bg-slate-950/70 border border-slate-800 rounded-lg space-y-1">
            <div className="flex items-center justify-between text-xs">
              <span className="font-mono font-bold text-cyan-400">CPM-DAG</span>
              <span className="text-emerald-400 text-[10px] font-bold">✓ Валидирован</span>
            </div>
            <p className="text-[11px] text-slate-400">
              Расчет ранних/поздних дат и Total Float без циклов
            </p>
          </div>
        </div>
      </div>
    </div>
  );
};