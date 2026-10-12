import React, { useState, useEffect } from "react";
import { X, Users, MapPin, AlertTriangle, Building2, RefreshCw } from "lucide-react";
import { OverlapReport } from "../../types";
import { analyticsApi } from "../../services/api";

interface OverlapInspectorModalProps {
  isOpen: boolean;
  onClose: () => void;
}

export const OverlapInspectorModal: React.FC<OverlapInspectorModalProps> = ({ isOpen, onClose }) => {
  if (!isOpen) return null;

  const [activeTab, setActiveTab] = useState<"RESOURCES" | "SITES">("RESOURCES");
  const [data, setData] = useState<OverlapReport | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    let isMounted = true;
    analyticsApi.getOverlaps().then((res) => {
      if (isMounted) {
        setData(res);
        setLoading(false);
      }
    });
    return () => { isMounted = false; };
  }, []);

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-slate-950/80 backdrop-blur-sm animate-fadeIn select-none">
      <div className="bg-slate-900 border border-slate-700 rounded-2xl w-full max-w-3xl shadow-2xl overflow-hidden flex flex-col max-h-[90vh]">
        {/* Header */}
        <div className="p-5 border-b border-slate-800 flex items-center justify-between bg-slate-850">
          <div className="flex items-center gap-3">
            <div className="w-10 h-10 rounded-xl bg-amber-500/20 border border-amber-500/30 flex items-center justify-center text-amber-400">
              <AlertTriangle className="w-5 h-5" />
            </div>
            <div>
              <h2 className="text-base font-bold text-slate-100">
                Инспектор коллизий площадок и перегрузки ресурсов
              </h2>
              <p className="text-xs text-slate-400">
                Мониторинг одновременных работ на одной площадке и двойного назначения специалистов
              </p>
            </div>
          </div>
          <button onClick={onClose} className="p-1.5 rounded-lg text-slate-400 hover:text-white hover:bg-slate-800">
            <X className="w-5 h-5" />
          </button>
        </div>

        {/* Tab switch */}
        <div className="flex border-b border-slate-800 bg-slate-950/60 p-1 text-xs">
          <button
            onClick={() => setActiveTab("RESOURCES")}
            className={`flex-1 py-2 rounded-lg font-bold transition-all flex items-center justify-center gap-2 ${
              activeTab === "RESOURCES" ? "bg-slate-800 text-amber-300 shadow" : "text-slate-400 hover:text-slate-200"
            }`}
          >
            <Users className="w-4 h-4" />
            <span>Перегрузка исполнителей ({data?.total_resource_conflicts || 0})</span>
          </button>
          <button
            onClick={() => setActiveTab("SITES")}
            className={`flex-1 py-2 rounded-lg font-bold transition-all flex items-center justify-center gap-2 ${
              activeTab === "SITES" ? "bg-slate-800 text-cyan-300 shadow" : "text-slate-400 hover:text-slate-200"
            }`}
          >
            <Building2 className="w-4 h-4" />
            <span>Коллизии площадок / цехов ({data?.total_site_conflicts || 0})</span>
          </button>
        </div>

        {/* Body content */}
        <div className="p-5 overflow-y-auto space-y-3 text-xs">
          {loading ? (
            <div className="p-8 text-center text-slate-400 flex flex-col items-center gap-2">
              <RefreshCw className="w-6 h-6 animate-spin text-cyan-500" />
              <span>Анализ пересечений календарно-сетевого графика...</span>
            </div>
          ) : activeTab === "RESOURCES" ? (
            data?.resource_conflicts.length === 0 ? (
              <div className="p-6 text-center text-emerald-400 bg-emerald-950/20 border border-emerald-900/50 rounded-xl">
                ✓ Перегрузок исполнителей не обнаружено.
              </div>
            ) : (
              data?.resource_conflicts.map((c, i) => (
                <div key={i} className="p-3.5 bg-slate-950/60 border border-amber-900/40 rounded-xl space-y-2">
                  <div className="flex items-center justify-between">
                    <div className="flex items-center gap-2">
                      <span className="font-bold text-slate-100 text-sm">{c.person}</span>
                      {c.is_multi_project && (
                        <span className="px-2 py-0.5 rounded text-[10px] font-extrabold bg-purple-950 text-purple-300 border border-purple-800">
                          Межпроектный конфликт
                        </span>
                      )}
                    </div>
                    <span className="px-2 py-0.5 rounded font-mono text-[10px] font-bold text-amber-400 bg-amber-950/80 border border-amber-800">
                      +{c.overlap_days} дн. наложения ({c.overlap_start} — {c.overlap_finish})
                    </span>
                  </div>

                  <div className="grid grid-cols-2 gap-2 pt-1 border-t border-slate-800/60 text-[11px]">
                    <div className="p-2 bg-slate-900/80 rounded border border-slate-800">
                      <span className="font-mono text-cyan-400 font-bold">[{c.project_a}] {c.task_a_wbs}</span>
                      <p className="text-slate-300 truncate mt-0.5">{c.task_a_name}</p>
                    </div>
                    <div className="p-2 bg-slate-900/80 rounded border border-slate-800">
                      <span className="font-mono text-cyan-400 font-bold">[{c.project_b}] {c.task_b_wbs}</span>
                      <p className="text-slate-300 truncate mt-0.5">{c.task_b_name}</p>
                    </div>
                  </div>
                </div>
              ))
            )
          ) : (
            data?.site_conflicts.length === 0 ? (
              <div className="p-6 text-center text-emerald-400 bg-emerald-950/20 border border-emerald-900/50 rounded-xl">
                ✓ Коллизий по площадкам не обнаружено.
              </div>
            ) : (
              data?.site_conflicts.map((c, i) => (
                <div key={i} className="p-3.5 bg-slate-950/60 border border-cyan-900/40 rounded-xl space-y-2">
                  <div className="flex items-center justify-between">
                    <div className="flex items-center gap-2">
                      <MapPin className="w-4 h-4 text-cyan-400" />
                      <span className="font-bold text-slate-100 text-sm">{c.location}</span>
                    </div>
                    <span className="px-2 py-0.5 rounded font-mono text-[10px] font-bold text-cyan-400 bg-cyan-950/80 border border-cyan-800">
                      +{c.overlap_days} дн. ({c.overlap_start} — {c.overlap_finish})
                    </span>
                  </div>

                  <div className="grid grid-cols-2 gap-2 pt-1 border-t border-slate-800/60 text-[11px]">
                    <div className="p-2 bg-slate-900/80 rounded border border-slate-800">
                      <span className="font-mono text-cyan-400 font-bold">[{c.project_a}] {c.task_a_wbs}</span>
                      <p className="text-slate-300 truncate mt-0.5">{c.task_a_name}</p>
                    </div>
                    <div className="p-2 bg-slate-900/80 rounded border border-slate-800">
                      <span className="font-mono text-cyan-400 font-bold">[{c.project_b}] {c.task_b_wbs}</span>
                      <p className="text-slate-300 truncate mt-0.5">{c.task_b_name}</p>
                    </div>
                  </div>
                </div>
              ))
            )
          )}
        </div>
      </div>
    </div>
  );
};