import React from "react";
import {
  X,
  Flame,
  AlertTriangle,
  Users,
  CheckCircle2,
  ShieldAlert,
} from "lucide-react";
import { GanttTask, DelayReport, TaskDelayDetail } from "../../types";

interface DelayInspectorModalProps {
  isOpen: boolean;
  onClose: () => void;
  tasks: GanttTask[];
  projectName?: string;
}

export const DelayInspectorModal: React.FC<DelayInspectorModalProps> = ({
  isOpen,
  onClose,
  tasks,
  projectName = "Портфель проектов",
}) => {
  if (!isOpen) return null;

  // Детерминированный расчёт задержек и первопричин (Root Cause)
  const today = new Date();
  const criticalDelayed: TaskDelayDetail[] = [];
  const raciMap: Record<string, number> = {};
  let maxDelay = 0;

  tasks.forEach((t) => {
    const pFinish = new Date(t.planned_finish);
    const aFinish = t.actual_finish ? new Date(t.actual_finish) : null;
    let delayDays = 0;

    if (t.progress_percent < 100 && today > pFinish) {
      delayDays = Math.ceil(
        (today.getTime() - pFinish.getTime()) / (1000 * 60 * 60 * 24),
      );
    } else if (aFinish && aFinish > pFinish) {
      delayDays = Math.ceil(
        (aFinish.getTime() - pFinish.getTime()) / (1000 * 60 * 60 * 24),
      );
    }

    if (delayDays > 0) {
      const detail: TaskDelayDetail = {
        task_id: t.id,
        wbs_code: t.wbs_code,
        name: t.name,
        is_critical: t.is_critical,
        total_float: t.total_float,
        progress_percent: t.progress_percent,
        planned_finish: t.planned_finish,
        delay_days: delayDays,
        raci_assignee: t.raci_assignee || "Не назначен",
      };

      if (t.is_critical || t.total_float <= 0) {
        criticalDelayed.push(detail);
        if (delayDays > maxDelay) maxDelay = delayDays;
      }

      const assignee = t.raci_assignee || "Не назначен";
      raciMap[assignee] = (raciMap[assignee] || 0) + delayDays;
    }
  });

  criticalDelayed.sort((a, b) => b.delay_days - a.delay_days);

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-slate-950/80 backdrop-blur-sm animate-fadeIn">
      <div className="bg-slate-900 border border-slate-700 rounded-2xl w-full max-w-3xl shadow-2xl overflow-hidden flex flex-col max-h-[90vh]">
        {/* Шапка */}
        <div className="p-6 border-b border-slate-800 flex items-center justify-between bg-slate-850">
          <div className="flex items-center gap-3">
            <div className="w-10 h-10 rounded-xl bg-rose-500/20 border border-rose-500/40 flex items-center justify-center text-rose-400">
              <ShieldAlert className="w-6 h-6" />
            </div>
            <div>
              <h2 className="text-lg font-bold text-slate-100 flex items-center gap-2">
                Инспектор первопричин задержек (Root Cause)
              </h2>
              <p className="text-xs text-slate-400">Объект: {projectName}</p>
            </div>
          </div>
          <button
            onClick={onClose}
            className="p-2 rounded-lg text-slate-400 hover:text-white hover:bg-slate-800"
          >
            <X className="w-5 h-5" />
          </button>
        </div>

        {/* Тело модалки */}
        <div className="p-6 space-y-6 overflow-y-auto">
          {/* Сводные показатели */}
          <div className="grid grid-cols-3 gap-4">
            <div className="bg-slate-950/60 border border-slate-800 p-4 rounded-xl">
              <div className="text-[11px] uppercase text-rose-400 font-semibold mb-1 flex items-center gap-1">
                <Flame className="w-3.5 h-3.5" /> Сдвиг крит. пути
              </div>
              <div className="text-2xl font-mono font-extrabold text-rose-400">
                +{maxDelay} дн.
              </div>
            </div>
            <div className="bg-slate-950/60 border border-slate-800 p-4 rounded-xl">
              <div className="text-[11px] uppercase text-amber-400 font-semibold mb-1 flex items-center gap-1">
                <AlertTriangle className="w-3.5 h-3.5" /> Сорванных этапов
              </div>
              <div className="text-2xl font-mono font-extrabold text-amber-400">
                {criticalDelayed.length}
              </div>
            </div>
            <div className="bg-slate-950/60 border border-slate-800 p-4 rounded-xl">
              <div className="text-[11px] uppercase text-slate-400 font-semibold mb-1 flex items-center gap-1">
                <Users className="w-3.5 h-3.5 text-cyan-400" /> Ответственных
              </div>
              <div className="text-2xl font-mono font-extrabold text-cyan-400">
                {Object.keys(raciMap).length}
              </div>
            </div>
          </div>

          {/* Список ключевых узких мест */}
          <div className="space-y-3">
            <h3 className="text-xs font-bold uppercase tracking-wider text-slate-300 flex items-center gap-2">
              <Flame className="w-4 h-4 text-rose-400" /> Критические срывы
              сроков (Топ Bottlenecks)
            </h3>
            <div className="space-y-2">
              {criticalDelayed.length === 0 ? (
                <div className="p-4 rounded-xl bg-emerald-500/10 border border-emerald-500/30 text-emerald-400 text-sm flex items-center gap-2">
                  <CheckCircle2 className="w-5 h-5" />
                  Все задачи выполняются строго в рамках базового директивного
                  плана!
                </div>
              ) : (
                criticalDelayed.slice(0, 5).map((item) => (
                  <div
                    key={item.task_id}
                    className="p-3.5 bg-slate-950/70 border border-rose-900/40 rounded-xl flex items-center justify-between gap-4 hover:border-rose-700/60 transition-colors"
                  >
                    <div className="space-y-1 min-w-0">
                      <div className="flex items-center gap-2">
                        <span className="px-2 py-0.5 rounded font-mono text-[10px] font-bold bg-rose-950 text-rose-300 border border-rose-800">
                          {item.wbs_code}
                        </span>
                        <span className="text-sm font-semibold text-slate-200 truncate">
                          {item.name}
                        </span>
                      </div>
                      <div className="text-xs text-slate-400 flex items-center gap-3">
                        <span>
                          Ответственный (R):{" "}
                          <b className="text-slate-300">{item.raci_assignee}</b>
                        </span>
                        <span>
                          План финиш:{" "}
                          <b className="font-mono text-slate-300">
                            {item.planned_finish}
                          </b>
                        </span>
                        <span>
                          Готовность:{" "}
                          <b className="text-cyan-400 font-mono">
                            {Math.round(item.progress_percent)}%
                          </b>
                        </span>
                      </div>
                    </div>
                    <div className="text-right flex-shrink-0">
                      <span className="px-3 py-1 rounded-lg bg-rose-500/20 text-rose-400 font-mono font-bold text-xs border border-rose-500/30">
                        +{item.delay_days} дн.
                      </span>
                    </div>
                  </div>
                ))
              )}
            </div>
          </div>

          {/* Распределение по RACI */}
          {Object.keys(raciMap).length > 0 && (
            <div className="space-y-3">
              <h3 className="text-xs font-bold uppercase tracking-wider text-slate-300 flex items-center gap-2">
                <Users className="w-4 h-4 text-purple-400" /> Накопленная
                задержка по исполнителям (RACI)
              </h3>
              <div className="grid grid-cols-2 gap-2">
                {Object.entries(raciMap).map(([name, days]) => (
                  <div
                    key={name}
                    className="p-3 bg-slate-950/60 border border-slate-800 rounded-lg flex items-center justify-between"
                  >
                    <span className="text-xs text-slate-300 font-medium truncate">
                      {name}
                    </span>
                    <span className="text-xs font-mono font-bold text-amber-400">
                      +{days} дн. задержки
                    </span>
                  </div>
                ))}
              </div>
            </div>
          )}
        </div>
      </div>
    </div>
  );
};
