import React, { useState } from "react";
import { ClipboardList, Play } from "lucide-react";
import { ProjectPassport, GanttTask } from "../../types";

interface UpdateLogItem {
  id: string;
  runId: string;
  startedAt: string;
  recordedAt?: string;
  stage: string;
  result: "Успешно" | "Начато" | "Несовпадение" | "Ошибка";
  details: string;
}

const defaultUpdateLog: UpdateLogItem[] = [
  { id: "1", runId: "20260827_161317_58397172", startedAt: "27.08.2026 16:13:17", recordedAt: "27.08.2026 16:14:35", stage: "Итог", result: "Успешно", details: "Reliable Refresh 1.0.10R завершён. Строк модели: 120; проектов: 5; задач: 114. Поствалидация: расхождений: 0." },
  { id: "2", runId: "20260827_161317_58397172", startedAt: "27.08.2026 16:13:17", recordedAt: "27.08.2026 16:14:31", stage: "M11 — модель Ганта", result: "Успешно", details: "Обновлена таблица _08_M11_GanttModel." },
  { id: "3", runId: "20260827_161317_58397172", startedAt: "27.08.2026 16:13:17", recordedAt: "27.08.2026 16:14:28", stage: "M10 — календарь", result: "Успешно", details: "Обновлена таблица _07_M10_Calendar." },
  { id: "4", runId: "20260827_161317_58397172", startedAt: "27.08.2026 16:13:17", recordedAt: "27.08.2026 16:14:26", stage: "M09 — интерфейсная ViewModel", result: "Успешно", details: "Обновлена таблица _06_M09_ViewModel_." },
  { id: "5", runId: "20260827_161317_58397172", startedAt: "27.08.2026 16:13:17", recordedAt: "27.08.2026 16:14:25", stage: "05 — навигация", result: "Успешно", details: "Обновлена таблица _05_M08_Навигация." },
  { id: "6", runId: "20260827_161317_58397172", startedAt: "27.08.2026 16:14:22", stage: "04 — представление", result: "Успешно", details: "Обновлена таблица _04_M07_Представление." },
  { id: "7", runId: "20260827_161317_58397172", startedAt: "27.08.2026 16:13:31", stage: "03 — данные", result: "Успешно", details: "Обновлена таблица _03_M06_Данные." },
  { id: "8", runId: "20260827_161317_58397172", startedAt: "27.08.2026 16:13:29", stage: "02 — портфель этапов", result: "Успешно", details: "Обновлена таблица _02_ПортфельЭтапов_." },
  { id: "9", runId: "20260827_161317_58397172", startedAt: "27.08.2026 16:13:27", stage: "01 — чтение источников", result: "Успешно", details: "Обновлена таблица _01_РеестрЭтапов_Сырой_." },
  { id: "10", runId: "20260827_161317_58397172", startedAt: "27.08.2026 16:13:17", recordedAt: "27.08.2026 16:13:17", stage: "Запуск", result: "Начато", details: "Reliable Refresh 1.0.10R: синхронный staged-конвейер." },
];

interface UpdateLogViewProps {
  projects: ProjectPassport[];
  tasks: GanttTask[];
}

export const UpdateLogView: React.FC<UpdateLogViewProps> = ({ projects, tasks }) => {
  const [updateLogs, setUpdateLogs] = useState<UpdateLogItem[]>(() => {
    if (typeof window === "undefined") return defaultUpdateLog;
    try {
      const saved = localStorage.getItem("prochain_update_log_v1");
      return saved ? JSON.parse(saved) : defaultUpdateLog;
    } catch {
      return defaultUpdateLog;
    }
  });

  const [isRunningSync, setIsRunningSync] = useState(false);

  const handleTriggerSyncSession = () => {
    setIsRunningSync(true);
    const now = new Date();
    const timeStr = now.toLocaleTimeString("ru-RU");
    const dateStr = now.toLocaleDateString("ru-RU");
    const fullDateStr = `${dateStr} ${timeStr}`;
    const runId = `${now.getFullYear()}${String(now.getMonth() + 1).padStart(2, "0")}${String(now.getDate()).padStart(2, "0")}_${timeStr.replace(/:/g, "")}_${Math.floor(Math.random() * 10000000)}`;

    const newEntries: UpdateLogItem[] = [
      {
        id: String(Date.now() + 2),
        runId,
        startedAt: fullDateStr,
        recordedAt: fullDateStr,
        stage: "Итог",
        result: "Успешно",
        details: `Синхронный конвейер завершён. Проектов: ${projects.length}; задач: ${tasks.filter((t) => !t.id.startsWith("root-")).length}. Поствалидация: расхождений: 0.`,
      },
      {
        id: String(Date.now() + 1),
        runId,
        startedAt: fullDateStr,
        recordedAt: fullDateStr,
        stage: "M11 — модель Ганта",
        result: "Успешно",
        details: "Обновлена сетка календаря и сетевой граф CPM.",
      },
      {
        id: String(Date.now()),
        runId,
        startedAt: fullDateStr,
        recordedAt: fullDateStr,
        stage: "Запуск",
        result: "Начато",
        details: "Запуск ручной сессии актуализации портфеля.",
      },
    ];

    setTimeout(() => {
      setUpdateLogs((prev) => [...newEntries, ...prev]);
      setIsRunningSync(false);
    }, 800);
  };

  return (
    <div className="max-w-7xl mx-auto space-y-6">
      {/* Панель управления синхронизацией */}
      <div className="bg-slate-900 border border-slate-800 rounded-xl p-4 flex flex-wrap items-center justify-between gap-4 shadow-xl">
        <div className="flex items-center gap-3">
          <div className="w-10 h-10 rounded-xl bg-cyan-600/20 border border-cyan-500/30 flex items-center justify-center text-cyan-400">
            <ClipboardList className="w-5 h-5" />
          </div>
          <div>
            <h3 className="text-sm font-bold text-slate-100">Журнал сессий обновления (tblUpdateLog)</h3>
            <p className="text-xs text-slate-400">Протокол выполнения конвейера, поствалидация токенов и баланс строк</p>
          </div>
        </div>

        <div className="flex items-center gap-2">
          <button
            onClick={() => setUpdateLogs([])}
            className="px-3 py-1.5 bg-slate-800 hover:bg-slate-700 text-slate-400 hover:text-white rounded-lg text-xs font-semibold transition-colors cursor-pointer"
          >
            Очистить журнал
          </button>
          <button
            onClick={handleTriggerSyncSession}
            disabled={isRunningSync}
            className="flex items-center gap-1.5 px-4 py-1.5 bg-cyan-600 hover:bg-cyan-500 text-white rounded-lg text-xs font-bold shadow-lg shadow-cyan-950 transition-colors disabled:opacity-50 cursor-pointer"
          >
            <Play className="w-3.5 h-3.5 fill-current" />
            <span>{isRunningSync ? "Синхронизация..." : "Запустить синхронизацию"}</span>
          </button>
        </div>
      </div>

      {/* Таблица логов tblUpdateLog */}
      <div className="bg-slate-900 border border-slate-800 rounded-xl overflow-hidden shadow-xl">
        <div className="overflow-x-auto">
          <table className="w-full text-left text-xs border-collapse">
            <thead className="bg-slate-800 text-slate-400 uppercase text-[10px] font-semibold">
              <tr className="border-b border-slate-700">
                <th className="p-3">ID запуска</th>
                <th className="p-3">Начало запуска</th>
                <th className="p-3">Время записи</th>
                <th className="p-3">Этап конвейера</th>
                <th className="p-3 text-center">Результат</th>
                <th className="p-3">Детали и поствалидация</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-800/80 font-sans">
              {updateLogs.map((log) => {
                const resCls =
                  log.result === "Успешно"
                    ? "bg-emerald-950/80 text-emerald-300 border-emerald-800 font-bold"
                    : log.result === "Начато"
                      ? "bg-cyan-950 text-cyan-300 border-cyan-800 font-semibold"
                      : "bg-rose-950 text-rose-300 border-rose-800 font-bold";

                return (
                  <tr key={log.id} className="hover:bg-slate-800/40 transition-colors">
                    <td className="p-3 font-mono text-[11px] text-slate-400">{log.runId}</td>
                    <td className="p-3 font-mono text-slate-300 whitespace-nowrap">{log.startedAt}</td>
                    <td className="p-3 font-mono text-slate-300 whitespace-nowrap">{log.recordedAt}</td>
                    <td className="p-3 font-semibold text-slate-200 whitespace-nowrap">{log.stage}</td>
                    <td className="p-3 text-center">
                      <span className={`px-2 py-0.5 rounded text-[10px] border ${resCls}`}>
                        {log.result}
                      </span>
                    </td>
                    <td className="p-3 text-slate-300 max-w-lg leading-relaxed">{log.details}</td>
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