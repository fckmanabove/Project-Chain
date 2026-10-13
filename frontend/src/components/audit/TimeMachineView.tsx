import React, { useState, useEffect } from "react";
import { History, RotateCcw, Trash2, Folder, FolderOpen, ChevronRight, ChevronDown, CheckCircle2, Clock, Calendar, User, RefreshCw } from "lucide-react";
import { auditApi } from "../../services/api";
import { AuditLogItem, TrashItem } from "../../types";

export const TimeMachineView: React.FC = () => {
  const [subTab, setSubTab] = useState<"HISTORY" | "TRASH">("HISTORY");
  const [groupBy, setGroupBy] = useState<"date" | "user" | "flat">("date");
  const [groups, setGroups] = useState<Record<string, AuditLogItem[]>>({});
  const [flatLogs, setFlatLogs] = useState<AuditLogItem[]>([]);
  const [trashItems, setTrashItems] = useState<TrashItem[]>([]);
  const [openFolders, setOpenFolders] = useState<Set<string>>(new Set());
  const [loading, setLoading] = useState(true);
  const [rollingBackId, setRollingBackId] = useState<string | null>(null);

  const loadData = async () => {
    try {
      setLoading(true);
      if (subTab === "HISTORY") {
        const res = await auditApi.getLogs({ group_by: groupBy === "flat" ? undefined : groupBy });
        if (res.groups) {
          setGroups(res.groups);
          setOpenFolders(new Set(Object.keys(res.groups).slice(0, 2))); // открываем первые две папки
        } else if (res.items) {
          setFlatLogs(res.items);
        }
      } else {
        const trash = await auditApi.getTrashBin();
        setTrashItems(trash);
      }
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    loadData();
  }, [subTab, groupBy]);

  const toggleFolder = (key: string) => {
    setOpenFolders((prev) => {
      const next = new Set(prev);
      if (next.has(key)) next.delete(key);
      else next.add(key);
      return next;
    });
  };

  const handleRollback = async (logId: string) => {
    if (!window.confirm("Откатить это действие к предыдущему состоянию?")) return;
    try {
      setRollingBackId(logId);
      await auditApi.rollback(logId);
      // In-place мгновенное обновление интерфейса без сброса скролла и перезагрузок
      setGroups((prev) => {
        const next = { ...prev };
        for (const k in next) {
          next[k] = next[k].map((l) => (l.id === logId ? { ...l, is_reverted: true } : l));
        }
        return next;
      });
      setFlatLogs((prev) => prev.map((l) => (l.id === logId ? { ...l, is_reverted: true } : l)));
      setTrashItems((prev) => prev.filter((t) => t.log_id !== logId));
    } catch (err: any) {
      alert(err.response?.data?.detail || "Ошибка при выполнении отката");
    } finally {
      setRollingBackId(null);
    }
  };
  if (loading) {
    return (
      <div className="h-64 flex flex-col items-center justify-center gap-3 text-slate-400">
        <RefreshCw className="w-8 h-8 animate-spin text-cyan-500" />
        <span className="text-xs font-mono">Синхронизация Time Machine...</span>
      </div>
    );
  }

  return (
    <div className="max-w-7xl mx-auto space-y-6">
      {/* Верхняя панель управления */}
      <div className="bg-slate-900 border border-slate-800 rounded-xl p-3 flex flex-wrap items-center justify-between gap-3 shadow-xl">
        <div className="flex items-center gap-2">
          <button
            onClick={() => setSubTab("HISTORY")}
            className={`flex items-center gap-2 px-3.5 py-1.5 rounded-lg text-xs font-semibold transition-all ${
              subTab === "HISTORY" ? "bg-cyan-600/20 text-cyan-300 border border-cyan-500/40" : "text-slate-400 hover:text-white"
            }`}
          >
            <History className="w-4 h-4" />
            <span>Журнал действий (Time Machine)</span>
          </button>
          <button
            onClick={() => setSubTab("TRASH")}
            className={`flex items-center gap-2 px-3.5 py-1.5 rounded-lg text-xs font-semibold transition-all ${
              subTab === "TRASH" ? "bg-rose-600/20 text-rose-300 border border-rose-500/40" : "text-slate-400 hover:text-white"
            }`}
          >
            <Trash2 className="w-4 h-4" />
            <span>Корзина удалений ({trashItems.length})</span>
          </button>
        </div>

        {subTab === "HISTORY" && (
          <div className="flex items-center gap-2 bg-slate-950/80 p-1 rounded-lg border border-slate-800 text-xs">
            <span className="text-slate-500 px-1 text-[11px]">Группировка:</span>
            <button
              onClick={() => setGroupBy("date")}
              className={`px-2 py-1 rounded font-medium ${groupBy === "date" ? "bg-slate-800 text-cyan-400 font-bold" : "text-slate-400 hover:text-white"}`}
            >
              📅 По датам
            </button>
            <button
              onClick={() => setGroupBy("user")}
              className={`px-2 py-1 rounded font-medium ${groupBy === "user" ? "bg-slate-800 text-cyan-400 font-bold" : "text-slate-400 hover:text-white"}`}
            >
              👤 По сотрудникам
            </button>
            <button
              onClick={() => setGroupBy("flat")}
              className={`px-2 py-1 rounded font-medium ${groupBy === "flat" ? "bg-slate-800 text-cyan-400 font-bold" : "text-slate-400 hover:text-white"}`}
            >
              📋 Общий список
            </button>
          </div>
        )}
      </div>

      {/* Вкладка 1: Древовидный журнал Time Machine */}
      {subTab === "HISTORY" && (
        <div className="space-y-4">
          {groupBy !== "flat" ? (
            Object.entries(groups).map(([folderKey, items]) => {
              const isOpen = openFolders.has(folderKey);
              return (
                <div key={folderKey} className="bg-slate-900 border border-slate-800 rounded-xl overflow-hidden shadow-md">
                  {/* Заголовок виртуальной папки */}
                  <div
                    onClick={() => toggleFolder(folderKey)}
                    className="p-3.5 bg-slate-850 hover:bg-slate-800/80 cursor-pointer flex items-center justify-between transition-colors select-none"
                  >
                    <div className="flex items-center gap-3">
                      <span className="text-cyan-400">{isOpen ? <FolderOpen className="w-5 h-5" /> : <Folder className="w-5 h-5" />}</span>
                      <span className="font-bold text-xs text-slate-100 font-mono">{folderKey}</span>
                      <span className="px-2 py-0.5 rounded-full bg-slate-800 text-slate-400 text-[10px] font-bold border border-slate-700">
                        {items.length} событий
                      </span>
                    </div>
                    {isOpen ? <ChevronDown className="w-4 h-4 text-slate-400" /> : <ChevronRight className="w-4 h-4 text-slate-400" />}
                  </div>

                  {/* Список записей в папке */}
                  {isOpen && (
                    <div className="divide-y divide-slate-800/60 p-2">
                      {items.map((log) => (
                        <div key={log.id} className="p-3 hover:bg-slate-850/60 rounded-lg flex flex-wrap items-center justify-between gap-3 text-xs">
                          <div className="space-y-1 min-w-0 max-w-2xl">
                            <div className="flex items-center gap-2">
                              <span
                                className={`px-1.5 py-0.5 rounded font-mono text-[10px] font-bold ${
                                  log.action === "UPDATE"
                                    ? "bg-amber-950 text-amber-300 border border-amber-800"
                                    : log.action === "DELETE"
                                    ? "bg-rose-950 text-rose-300 border border-rose-800"
                                    : log.action === "ROLLBACK"
                                    ? "bg-purple-950 text-purple-300 border border-purple-800"
                                    : "bg-emerald-950 text-emerald-300 border border-emerald-800"
                                }`}
                              >
                                {log.action}
                              </span>
                              <span className="font-semibold text-slate-200">{log.entity_name || log.entity_id}</span>
                              <span className="text-slate-500 font-mono text-[11px]">
                                {new Date(log.created_at).toLocaleTimeString("ru-RU")} • {log.user_name || log.user_email}
                              </span>
                            </div>
                            <div className="text-slate-400 text-[11px] font-mono leading-relaxed">{log.summary}</div>
                          </div>

                          {/* Кнопка отката в 1 клик */}
                          <div>
                            {log.is_reverted ? (
                              <span className="inline-flex items-center gap-1 text-[11px] font-bold text-slate-500 bg-slate-800/80 px-2.5 py-1 rounded">
                                <CheckCircle2 className="w-3.5 h-3.5 text-emerald-500" /> Откачено
                              </span>
                            ) : (
                              <button
                                onClick={() => handleRollback(log.id)}
                                disabled={rollingBackId === log.id}
                                className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg bg-cyan-600/20 hover:bg-cyan-600/40 text-cyan-300 border border-cyan-500/40 font-bold text-xs transition-all active:scale-95 disabled:opacity-50 shadow-sm"
                                title="Откатить это изменение"
                              >
                                <RotateCcw className={`w-3.5 h-3.5 ${rollingBackId === log.id ? "animate-spin" : ""}`} />
                                <span>Откатить</span>
                              </button>
                            )}
                          </div>
                        </div>
                      ))}
                    </div>
                  )}
                </div>
              );
            })
          ) : (
            /* Плоский список */
            <div className="bg-slate-900 border border-slate-800 rounded-xl divide-y divide-slate-800 p-2 shadow-md">
              {flatLogs.map((log) => (
                <div key={log.id} className="p-3 flex items-center justify-between gap-4 text-xs">
                  <div>
                    <div className="font-semibold text-slate-200">{log.entity_name || log.entity_id}</div>
                    <div className="text-slate-400 font-mono text-[11px]">{log.summary}</div>
                  </div>
                  <button
                    onClick={() => handleRollback(log.id)}
                    disabled={log.is_reverted || rollingBackId === log.id}
                    className="px-3 py-1.5 rounded-lg bg-cyan-600/20 text-cyan-300 border border-cyan-500/40 text-xs font-bold disabled:opacity-40"
                  >
                    {log.is_reverted ? "Откачено" : "Откатить"}
                  </button>
                </div>
              ))}
            </div>
          )}
        </div>
      )}

      {/* Вкладка 2: Корзина удалений (Воскрешение сущностей в 1 клик) */}
      {subTab === "TRASH" && (
        <div className="bg-slate-900 border border-slate-800 rounded-xl overflow-hidden shadow-xl">
          <div className="p-4 bg-slate-850 border-b border-slate-800 flex items-center justify-between">
            <h3 className="text-xs font-bold text-slate-200 uppercase tracking-wider flex items-center gap-2">
              <Trash2 className="w-4 h-4 text-rose-400" />
              Корзина удалений (Готовы к восстановлению)
            </h3>
            <span className="text-[11px] font-mono text-slate-400">Объектов: {trashItems.length}</span>
          </div>

          {trashItems.length === 0 ? (
            <div className="p-8 text-center text-slate-500 text-xs font-mono">Корзина пуста. Все удаленные этапы сохранены или восстановлены.</div>
          ) : (
            <table className="w-full text-left text-xs border-collapse">
              <thead className="bg-slate-800 text-slate-400 uppercase text-[10px] font-semibold">
                <tr className="border-b border-slate-700">
                  <th className="p-3">Объект / WBS</th>
                  <th className="p-3">Кем удален</th>
                  <th className="p-3">Время удаления</th>
                  <th className="p-3 text-center">Действие</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-800 font-sans">
                {trashItems.map((item) => (
                  <tr key={item.log_id} className="hover:bg-slate-800/40 transition-colors">
                    <td className="p-3 font-semibold text-slate-100">{item.entity_name || item.entity_id}</td>
                    <td className="p-3 text-slate-400">{item.deleted_by || "—"}</td>
                    <td className="p-3 font-mono text-slate-400">{new Date(item.deleted_at).toLocaleString("ru-RU")}</td>
                    <td className="p-3 text-center">
                      <button
                        onClick={() => handleRollback(item.log_id)}
                        className="inline-flex items-center gap-1.5 px-3 py-1.5 bg-emerald-600/20 hover:bg-emerald-600/40 text-emerald-300 border border-emerald-500/40 rounded-lg text-xs font-bold shadow-sm transition-all"
                      >
                        <RotateCcw className="w-3.5 h-3.5" />
                        <span>Восстановить (Undelete)</span>
                      </button>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          )}
        </div>
      )}
    </div>
  );
};