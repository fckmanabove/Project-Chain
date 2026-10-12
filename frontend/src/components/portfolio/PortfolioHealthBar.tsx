import React from "react";
import {
  Activity,
  AlertOctagon,
  CheckCircle2,
  AlertTriangle,
  Layers,
  TrendingUp,
  Flame,
} from "lucide-react";

interface PortfolioHealthProps {
  totalProjects: number;
  totalStages: number;
  normCount?: number;
  riskCount?: number;
  problemCount?: number;
  onOpenInspector?: () => void;
  onOpenOverlaps?: () => void;
}

export const PortfolioHealthBar: React.FC<PortfolioHealthProps> = ({
  totalProjects = 5,
  totalStages = 114,
  normCount = 63,
  riskCount = 23,
  problemCount = 28,
  onOpenInspector,
  onOpenOverlaps,
}) => {
  const normPercent = Math.round((normCount / totalStages) * 100) || 55;
  const riskPercent = Math.round((riskCount / totalStages) * 100) || 20;
  const problemPercent = 100 - normPercent - riskPercent;

  return (
    <div className="bg-slate-900 border border-slate-800 rounded-xl p-5 shadow-xl">
      {/* Верхний заголовок и общий статус */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 border-b border-slate-800 pb-4 mb-4">
        <div className="flex items-center gap-3">
          <div className="w-9 h-9 rounded-lg bg-cyan-950 border border-cyan-800 flex items-center justify-center text-cyan-400 shadow-md">
            <Activity className="w-5 h-5" />
          </div>
          <div>
            <h2 className="text-sm font-bold text-slate-200 tracking-wide uppercase">
              Мониторинг портфеля автоматизации
            </h2>
            <p className="text-xs text-slate-400">
              Сводная диагностика по 5 производственным проектам цеха ДСП
            </p>
          </div>
        </div>

        {/* Общий светофор портфеля и кнопки диагностики */}
        <div className="flex items-center gap-2.5">
          {onOpenOverlaps && (
            <button
              onClick={onOpenOverlaps}
              className="px-3 py-1.5 rounded-lg text-xs font-bold bg-amber-500/20 hover:bg-amber-500/30 text-amber-300 border border-amber-500/40 flex items-center gap-1.5 transition-colors cursor-pointer shadow-lg shadow-amber-950/40"
              title="Открыть анализ наложения площадок и перегрузки специалистов"
            >
              <AlertTriangle className="w-4 h-4 text-amber-400" />
              <span>Коллизии площадок / ресурсов</span>
            </button>
          )}

          <button
            onClick={onOpenInspector}
            className="px-3 py-1.5 rounded-lg text-xs font-bold bg-rose-500/20 hover:bg-rose-500/30 text-rose-400 border border-rose-500/40 flex items-center gap-1.5 transition-colors cursor-pointer shadow-lg shadow-rose-950/50"
            title="Открыть анализ первопричин срыва сроков"
          >
            <AlertOctagon className="w-4 h-4 animate-pulse" />
            <span>ТРЕБУЕТ ВНИМАНИЯ</span>
            <span className="ml-1 text-[10px] underline font-normal text-rose-300">
              (Диагностика)
            </span>
          </button>
        </div>
      </div>

      {/* Метрики и прогресс-бар здоровья */}
      <div className="grid grid-cols-2 sm:grid-cols-4 gap-3 mb-4">
        <div className="bg-slate-950/60 border border-slate-800/80 p-3 rounded-lg">
          <div className="text-[11px] text-slate-400 font-semibold uppercase flex items-center gap-1.5 mb-1">
            <Layers className="w-3.5 h-3.5 text-cyan-400" /> Проектов в портфеле
          </div>
          <div className="text-xl font-mono font-extrabold text-slate-100">
            {totalProjects}
          </div>
        </div>

        <div className="bg-slate-950/60 border border-slate-800/80 p-3 rounded-lg">
          <div className="text-[11px] text-emerald-400 font-semibold uppercase flex items-center gap-1.5 mb-1">
            <CheckCircle2 className="w-3.5 h-3.5" /> Норма (в графике)
          </div>
          <div className="text-xl font-mono font-extrabold text-emerald-400">
            {normCount}{" "}
            <span className="text-xs font-normal text-slate-400">
              ({normPercent}%)
            </span>
          </div>
        </div>

        <div className="bg-slate-950/60 border border-slate-800/80 p-3 rounded-lg">
          <div className="text-[11px] text-amber-400 font-semibold uppercase flex items-center gap-1.5 mb-1">
            <AlertTriangle className="w-3.5 h-3.5" /> В зоне риска
          </div>
          <div className="text-xl font-mono font-extrabold text-amber-400">
            {riskCount}{" "}
            <span className="text-xs font-normal text-slate-400">
              ({riskPercent}%)
            </span>
          </div>
        </div>

        <div className="bg-slate-950/60 border border-slate-800/80 p-3 rounded-lg">
          <div className="text-[11px] text-rose-400 font-semibold uppercase flex items-center gap-1.5 mb-1">
            <Flame className="w-3.5 h-3.5" /> Срыв сроков
          </div>
          <div className="text-xl font-mono font-extrabold text-rose-400">
            {problemCount}{" "}
            <span className="text-xs font-normal text-slate-400">
              ({problemPercent}%)
            </span>
          </div>
        </div>
      </div>

      {/* Мульти-полоса прогресса здоровья */}
      <div className="space-y-1.5">
        <div className="h-2 w-full bg-slate-800 rounded-full overflow-hidden flex shadow-inner">
          <div
            style={{ width: `${normPercent}%` }}
            className="bg-emerald-500 transition-all duration-500"
            title={`Норма: ${normPercent}%`}
          />
          <div
            style={{ width: `${riskPercent}%` }}
            className="bg-amber-500 transition-all duration-500"
            title={`Риск: ${riskPercent}%`}
          />
          <div
            style={{ width: `${problemPercent}%` }}
            className="bg-rose-500 transition-all duration-500"
            title={`Проблема: ${problemPercent}%`}
          />
        </div>
      </div>
    </div>
  );
};
