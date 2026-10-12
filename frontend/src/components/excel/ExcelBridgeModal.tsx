import React, { useState, useRef } from "react";
import {
  X,
  UploadCloud,
  Download,
  FileSpreadsheet,
  CheckCircle2,
  AlertCircle,
  RefreshCw,
  SlidersHorizontal,
  CheckSquare,
  Square,
  ArrowRight,
  Plus,
} from "lucide-react";
import { GanttTask, ProjectPassport } from "../../types";
import { projectApi } from "../../services/api";

interface ExcelBridgeModalProps {
  isOpen: boolean;
  onClose: () => void;
  currentProject: ProjectPassport | null;
  tasks: GanttTask[];
  onImportSuccess: () => void;
}

const IOSToggle: React.FC<{ active: boolean; onToggle: () => void; disabled?: boolean }> = ({
  active,
  onToggle,
  disabled,
}) => (
  <div
    onClick={(e) => {
      e.stopPropagation();
      if (!disabled) onToggle();
    }}
    className={`w-9 h-5 rounded-full p-0.5 transition-colors duration-200 ease-in-out cursor-pointer select-none flex-shrink-0 ${
      disabled ? "opacity-40 cursor-not-allowed" : ""
    } ${active ? "bg-cyan-500 shadow-sm shadow-cyan-950" : "bg-slate-700"}`}
  >
    <div
      className={`w-4 h-4 rounded-full bg-white shadow-md transform transition-transform duration-200 ease-in-out ${
        active ? "translate-x-4" : "translate-x-0"
      }`}
    />
  </div>
);

export const ExcelBridgeModal: React.FC<ExcelBridgeModalProps> = ({
  isOpen,
  onClose,
  currentProject,
  tasks,
  onImportSuccess,
}) => {
  if (!isOpen) return null;

  const [isDragging, setIsDragging] = useState(false);
  const [isUploading, setIsUploading] = useState(false);
  const [isApplying, setIsApplying] = useState(false);
  const [currentFile, setCurrentFile] = useState<File | null>(null);
  const [typeFilter, setTypeFilter] = useState<"ALL" | "CREATE" | "UPDATE">("ALL");
  const [projectFilter, setProjectFilter] = useState<string>("ALL");
  const [searchFilter, setSearchFilter] = useState<string>("");

  // Стейт предпросмотра дельты
  const [previewData, setPreviewData] = useState<{
    source_filename: string;
    total_in_file: number;
    unchanged_count: number;
    changed_count: number;
    changes: Array<{
      key: string;
      project_code: string;
      wbs_code: string;
      task_name: string;
      change_type: "CREATE" | "UPDATE";
      diff_summary: string;
      old_values?: Record<string, any>;
      new_values: Record<string, any>;
    }>;
  } | null>(null);

  const [selectedKeys, setSelectedKeys] = useState<Set<string>>(new Set());

  const [uploadStatus, setUploadStatus] = useState<{
    success: boolean;
    message: string;
  } | null>(null);

  const fileInputRef = useRef<HTMLInputElement>(null);

  const resetAll = () => {
    setPreviewData(null);
    setSelectedKeys(new Set());
    setCurrentFile(null);
    setUploadStatus(null);
  };

  const handleClose = () => {
    resetAll();
    onClose();
  };

  // Шаг 1: Анализ файла и расчёт расхождений
  const handleFileProcess = async (file: File) => {
    if (!file.name.match(/\.(xlsx|xlsm)$/i)) {
      setUploadStatus({
        success: false,
        message: "Поддерживаются только форматы .xlsx и .xlsm (с макросами)",
      });
      return;
    }

    setIsUploading(true);
    setUploadStatus(null);
    setCurrentFile(file);

    try {
      const preview = await projectApi.previewExcel(file);
      setPreviewData(preview);
      // По умолчанию выбираем все изменённые задачи
      setSelectedKeys(new Set(preview.changes.map((c) => c.key)));
    } catch (err: any) {
      setUploadStatus({
        success: false,
        message: err.response?.data?.detail || `Ошибка обработки книги "${file.name}"`,
      });
    } finally {
      setIsUploading(false);
    }
  };

  // Шаг 2: Выборочное применение утверждённых строк
  const handleApplyChanges = async () => {
    if (!currentFile || !previewData) return;

    const approvedList = Array.from(selectedKeys);
    if (approvedList.length === 0) {
      alert("Выберите хотя бы одно изменение для применения!");
      return;
    }

    setIsApplying(true);
    setUploadStatus(null);

    try {
      const res = await projectApi.applyExcel(currentFile, approvedList);
      setUploadStatus({
        success: true,
        message: res.message || `Успешно применено ${res.applied_count} изменений!`,
      });
      setPreviewData(null);
      await onImportSuccess();
    } catch (err: any) {
      setUploadStatus({
        success: false,
        message: err.response?.data?.detail || "Ошибка применения изменений",
      });
    } finally {
      setIsApplying(false);
    }
  };

  const availableProjects = React.useMemo(() => {
    if (!previewData) return [];
    return Array.from(new Set(previewData.changes.map((c) => c.project_code))).sort();
  }, [previewData]);

  const filteredChanges = React.useMemo(() => {
    if (!previewData) return [];
    return previewData.changes.filter((c) => {
      if (typeFilter !== "ALL" && c.change_type !== typeFilter) return false;
      if (projectFilter !== "ALL" && c.project_code !== projectFilter) return false;
      if (searchFilter.trim()) {
        const q = searchFilter.toLowerCase();
        return (
          c.wbs_code.toLowerCase().includes(q) ||
          c.task_name.toLowerCase().includes(q) ||
          c.project_code.toLowerCase().includes(q) ||
          (c.diff_summary && c.diff_summary.toLowerCase().includes(q))
        );
      }
      return true;
    });
  }, [previewData, typeFilter, projectFilter, searchFilter]);

  const isAllFilteredSelected = React.useMemo(() => {
    if (!filteredChanges.length) return false;
    return filteredChanges.every((c) => selectedKeys.has(c.key));
  }, [filteredChanges, selectedKeys]);

  const toggleSelectAllFiltered = () => {
    if (!filteredChanges.length) return;
    setSelectedKeys((prev) => {
      const next = new Set(prev);
      if (isAllFilteredSelected) {
        filteredChanges.forEach((c) => next.delete(c.key));
      } else {
        filteredChanges.forEach((c) => next.add(c.key));
      }
      return next;
    });
  };

  const toggleKey = (key: string) => {
    setSelectedKeys((prev) => {
      const next = new Set(prev);
      if (next.has(key)) next.delete(key);
      else next.add(key);
      return next;
    });
  };

  const sanitizeCsvCell = (val: any): string => {
    if (val === null || val === undefined) return '""';
    const str = String(val).trim();
    const clean = /^[=+\-@\t\r]/.test(str) ? `'${str}` : str;
    return `"${clean.replace(/"/g, '""')}"`;
  };

  const formatDateForExcel = (d?: string) => {
    if (!d) return "";
    const p = d.split("-");
    return p.length === 3 ? `${p[2]}.${p[1]}.${p[0]}` : d;
  };

  const handleExportCSV = () => {
    if (!tasks.length) return;
    const headers = [
      "WBS", "Наименование", "План старт", "План финиш", "Дней",
      "Факт старт", "Факт финиш", "Факт %", "Total Float", "Ответственный (R)"
    ];
    const rows = tasks.map((t) => [
      sanitizeCsvCell(t.wbs_code),
      sanitizeCsvCell(t.name),
      formatDateForExcel(t.planned_start),
      formatDateForExcel(t.planned_finish),
      t.planned_duration,
      formatDateForExcel(t.actual_start),
      formatDateForExcel(t.actual_finish),
      Math.round(t.progress_percent),
      t.total_float,
      sanitizeCsvCell(t.raci_assignee),
    ]);

    const csvContent = "\uFEFF" + [headers.join(";"), ...rows.map((r) => r.join(";"))].join("\r\n");
    const blob = new Blob([csvContent], { type: "text/csv;charset=utf-8;" });
    const url = URL.createObjectURL(blob);
    const link = document.createElement("a");
    link.href = url;
    link.download = `${currentProject?.code || "Portfolio"}_Schedule_${new Date().toISOString().split("T")[0]}.csv`;
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-slate-950/80 backdrop-blur-sm animate-fadeIn">
      <div
        className={`bg-slate-900 border border-slate-700 rounded-2xl w-full ${
          previewData ? "max-w-6xl md:w-[94vw]" : "max-w-xl"
        } shadow-2xl overflow-hidden flex flex-col max-h-[92vh] transition-all duration-200`}
      >
        {/* Шапка */}
        <div className="p-5 border-b border-slate-800 flex items-center justify-between bg-slate-850">
          <div className="flex items-center gap-3">
            <div className="w-10 h-10 rounded-xl bg-emerald-500/20 border border-emerald-500/40 flex items-center justify-center text-emerald-400">
              <FileSpreadsheet className="w-6 h-6" />
            </div>
            <div>
              <h2 className="text-base font-bold text-slate-100 flex items-center gap-2">
                <span>Гибридный мост с Excel</span>
                {previewData && (
                  <span className="px-2 py-0.5 rounded text-[10px] bg-cyan-950 text-cyan-300 border border-cyan-800 font-mono">
                    Предпросмотр дельты
                  </span>
                )}
              </h2>
              <p className="text-xs text-slate-400">
                {previewData
                  ? `Файл: ${previewData.source_filename} — выберите, какие задачи применить`
                  : "Синхронизация структуры tblM06Data с базой данных"}
              </p>
            </div>
          </div>
          <button onClick={handleClose} className="p-1.5 rounded-lg text-slate-400 hover:text-white hover:bg-slate-800">
            <X className="w-5 h-5" />
          </button>
        </div>

        {/* Тело модалки */}
        <div className="p-5 flex-1 flex flex-col min-h-0 overflow-hidden space-y-3">
          {/* Статус выполнения */}
          {uploadStatus && (
            <div
              className={`p-3 rounded-xl flex items-center gap-2 text-xs font-semibold ${
                uploadStatus.success
                  ? "bg-emerald-500/10 border border-emerald-500/30 text-emerald-400"
                  : "bg-rose-500/10 border border-rose-500/30 text-rose-400"
              }`}
            >
              {uploadStatus.success ? <CheckCircle2 className="w-4 h-4 flex-shrink-0" /> : <AlertCircle className="w-4 h-4 flex-shrink-0" />}
              <span>{uploadStatus.message}</span>
            </div>
          )}

          {/* ЭКРАН 1: Дропзона загрузки файла (если предпросмотр ещё не запущен) */}
          {!previewData ? (
            <>
              <div
                onDragOver={(e) => { e.preventDefault(); setIsDragging(true); }}
                onDragLeave={() => setIsDragging(false)}
                onDrop={(e) => {
                  e.preventDefault();
                  setIsDragging(false);
                  if (e.dataTransfer.files?.[0]) handleFileProcess(e.dataTransfer.files[0]);
                }}
                onClick={() => fileInputRef.current?.click()}
                className={`border-2 border-dashed rounded-xl p-8 flex flex-col items-center justify-center gap-3 cursor-pointer transition-colors ${
                  isDragging ? "border-emerald-500 bg-emerald-950/20" : "border-slate-700 hover:border-slate-500 bg-slate-950/40"
                }`}
              >
                <input
                  ref={fileInputRef}
                  type="file"
                  accept=".xlsx,.xlsm"
                  className="hidden"
                  onChange={(e) => e.target.files?.[0] && handleFileProcess(e.target.files[0])}
                />
                {isUploading ? (
                  <RefreshCw className="w-10 h-10 text-cyan-400 animate-spin" />
                ) : (
                  <UploadCloud className="w-10 h-10 text-slate-400" />
                )}
                <div className="text-center">
                  <p className="text-sm font-semibold text-slate-200">
                    {isUploading ? "Сравнение файла с базой данных (Diff)..." : "Перетащите .xlsm / .xlsx файл сюда"}
                  </p>
                  <p className="text-xs text-slate-400 mt-1">
                    Система автоматически найдёт отличия и покажет предпросмотр
                  </p>
                </div>
              </div>

              {/* Экспорт базы */}
              <div className="pt-4 border-t border-slate-800 flex flex-wrap items-center justify-between gap-3">
                <div>
                  <span className="text-xs font-bold text-slate-200 block">
                    Экспорт для базы Excel (Лист 03_M06_Данные)
                  </span>
                  <span className="text-[11px] text-slate-400">
                    Создаёт файл .xlsx со структурой умной таблицы tblM06Data
                  </span>
                </div>
                <div className="flex items-center gap-2">
                  <button
                    type="button"
                    onClick={handleExportCSV}
                    className="px-3 py-1.5 rounded-lg bg-slate-800 hover:bg-slate-700 text-slate-300 text-xs font-semibold border border-slate-700 transition-colors"
                  >
                    CSV
                  </button>
                  <button
                    type="button"
                    onClick={async () => {
                      try {
                        await projectApi.downloadM06Excel();
                      } catch {
                        alert("Ошибка скачивания Excel-файла M06");
                      }
                    }}
                    className="flex items-center gap-1.5 px-4 py-1.5 rounded-lg bg-emerald-600 hover:bg-emerald-500 text-white text-xs font-bold shadow-md shadow-emerald-950 transition-colors cursor-pointer"
                  >
                    <Download className="w-4 h-4" />
                    <span>Скачать .xlsx (M06)</span>
                  </button>
                </div>
              </div>
            </>
          ) : (
            /* ЭКРАН 2: Интерактивный предпросмотр расхождений (Staged Diff Preview) */
            <div className="flex-1 flex flex-col min-h-0 space-y-3">
              {/* Информационная панель дельты */}
              <div className="grid grid-cols-3 gap-2.5 text-xs">
                <div className="p-3 bg-slate-950/60 border border-slate-800 rounded-xl">
                  <span className="text-[10px] text-slate-400 uppercase font-semibold block mb-0.5">Всего в файле</span>
                  <span className="font-mono font-bold text-base text-slate-100">{previewData.total_in_file}</span>
                </div>
                <div className="p-3 bg-slate-950/60 border border-emerald-900/40 rounded-xl">
                  <span className="text-[10px] text-emerald-400 uppercase font-semibold block mb-0.5">Без изменений (скрыты)</span>
                  <span className="font-mono font-bold text-base text-emerald-400">{previewData.unchanged_count}</span>
                </div>
                <div className="p-3 bg-slate-950/60 border border-amber-900/40 rounded-xl">
                  <span className="text-[10px] text-amber-400 uppercase font-semibold block mb-0.5">Требуют решения</span>
                  <span className="font-mono font-bold text-base text-amber-300">{previewData.changed_count}</span>
                </div>
              </div>

              {previewData.changed_count === 0 ? (
                <div className="p-8 text-center bg-slate-950/40 rounded-xl border border-slate-800 space-y-2">
                  <CheckCircle2 className="w-8 h-8 text-emerald-400 mx-auto" />
                  <p className="text-sm font-bold text-slate-100">В файле нет новых изменений!</p>
                  <p className="text-xs text-slate-400">
                    Все задачи, даты и ответственные полностью совпадают с текущей базой данных.
                  </p>
                  <button
                    type="button"
                    onClick={resetAll}
                    className="px-4 py-1.5 mt-2 bg-slate-800 hover:bg-slate-700 text-slate-200 rounded-lg text-xs font-semibold"
                  >
                    Загрузить другой файл
                  </button>
                </div>
              ) : (
                <>
                  {/* Панель фильтрации и быстрого поиска */}
                  <div className="flex flex-wrap items-center justify-between gap-2.5 bg-slate-850/90 p-2.5 rounded-xl border border-slate-800 text-xs">
                    <div className="flex items-center gap-1.5 bg-slate-950/70 p-1 rounded-lg border border-slate-800/80">
                      <button
                        type="button"
                        onClick={() => setTypeFilter("ALL")}
                        className={`px-2.5 py-1 rounded-md font-semibold transition-all ${
                          typeFilter === "ALL" ? "bg-slate-800 text-cyan-400 shadow-sm font-bold" : "text-slate-400 hover:text-white"
                        }`}
                      >
                        Все ({previewData.changes.length})
                      </button>
                      <button
                        type="button"
                        onClick={() => setTypeFilter("CREATE")}
                        className={`px-2.5 py-1 rounded-md font-semibold transition-all ${
                          typeFilter === "CREATE" ? "bg-emerald-950 text-emerald-300 border border-emerald-800 font-bold" : "text-slate-400 hover:text-emerald-400"
                        }`}
                      >
                        + Новые ({previewData.changes.filter((c) => c.change_type === "CREATE").length})
                      </button>
                      <button
                        type="button"
                        onClick={() => setTypeFilter("UPDATE")}
                        className={`px-2.5 py-1 rounded-md font-semibold transition-all ${
                          typeFilter === "UPDATE" ? "bg-amber-950 text-amber-300 border border-amber-800 font-bold" : "text-slate-400 hover:text-amber-400"
                        }`}
                      >
                        ✎ Изменения ({previewData.changes.filter((c) => c.change_type === "UPDATE").length})
                      </button>
                    </div>

                    <div className="flex items-center gap-2">
                      {availableProjects.length > 1 && (
                        <select
                          value={projectFilter}
                          onChange={(e) => setProjectFilter(e.target.value)}
                          className="px-2.5 py-1 bg-slate-800 border border-slate-700 rounded-lg text-slate-200 text-xs font-semibold focus:outline-none focus:border-cyan-500"
                        >
                          <option value="ALL">Все проекты</option>
                          {availableProjects.map((p) => (
                            <option key={p} value={p}>
                              [{p}]
                            </option>
                          ))}
                        </select>
                      )}

                      <input
                        type="text"
                        placeholder="Поиск по WBS или названию..."
                        value={searchFilter}
                        onChange={(e) => setSearchFilter(e.target.value)}
                        className="px-2.5 py-1 bg-slate-800 border border-slate-700 rounded-lg text-slate-200 text-xs placeholder-slate-500 focus:outline-none focus:border-cyan-500 w-48"
                      />
                    </div>
                  </div>

                  {/* Мастер-тумблер пакетного выбора */}
                  <div className="flex items-center justify-between bg-slate-800/80 px-4 py-2.5 rounded-xl border border-slate-700/80 text-xs select-none">
                    <div className="flex items-center gap-3">
                      <IOSToggle
                        active={isAllFilteredSelected}
                        onToggle={toggleSelectAllFiltered}
                      />
                      <span className="font-semibold text-slate-200">
                        {isAllFilteredSelected ? "Отключить все в списке" : "Включить все в списке"}
                      </span>
                    </div>
                    <span className="text-[11px] font-mono text-cyan-400 font-bold bg-slate-900/90 px-3 py-1 rounded-lg border border-slate-700">
                      Выбрано: {selectedKeys.size} из {previewData.changes.length}
                    </span>
                  </div>

                  {/* Расширенная таблица расхождений с тумблерами и чипсами */}
                  <div className="flex-1 min-h-0 border border-slate-800 rounded-xl overflow-y-auto shadow-inner bg-slate-900/60">
                    <table className="w-full text-left text-xs border-collapse">
                      <thead className="bg-slate-800 text-slate-400 text-[10px] uppercase font-semibold sticky top-0 z-10 border-b border-slate-700">
                        <tr>
                          <th className="p-3 w-16 text-center">Применить</th>
                          <th className="p-3 w-20 text-center">Проект</th>
                          <th className="p-3 w-16 text-center">WBS</th>
                          <th className="p-3 w-24 text-center">Тип</th>
                          <th className="p-3">Объект управления и состав изменений (Дельта)</th>
                        </tr>
                      </thead>
                      <tbody className="divide-y divide-slate-800/80 font-sans">
                        {filteredChanges.map((item) => {
                          const isChecked = selectedKeys.has(item.key);
                          const isNew = item.change_type === "CREATE";

                          return (
                            <tr
                              key={item.key}
                              onClick={() => toggleKey(item.key)}
                              className={`cursor-pointer transition-colors ${
                                isChecked ? "bg-slate-850/80 hover:bg-slate-850" : "opacity-50 hover:opacity-90 bg-slate-950/30"
                              }`}
                            >
                              <td className="p-3 text-center">
                                <div className="flex items-center justify-center">
                                  <IOSToggle
                                    active={isChecked}
                                    onToggle={() => toggleKey(item.key)}
                                  />
                                </div>
                              </td>
                              <td className="p-3 text-center font-mono font-bold text-cyan-400">
                                [{item.project_code}]
                              </td>
                              <td className="p-3 text-center font-mono text-slate-300">
                                {item.wbs_code}
                              </td>
                              <td className="p-3 text-center">
                                <span
                                  className={`px-2 py-0.5 rounded text-[10px] font-bold border ${
                                    isNew
                                      ? "bg-emerald-950 text-emerald-300 border-emerald-800"
                                      : "bg-amber-950 text-amber-300 border-amber-800"
                                  }`}
                                >
                                  {isNew ? "+ НОВАЯ" : "ИЗМЕНЕНО"}
                                </span>
                              </td>
                              <td className="p-3">
                                <div className="font-semibold text-slate-100 text-sm mb-1">
                                  {item.task_name}
                                </div>

                                {isNew ? (
                                  <div className="flex flex-wrap items-center gap-1.5 text-[11px] font-mono">
                                    <span className="px-2 py-0.5 rounded bg-slate-800 text-slate-300 border border-slate-700">
                                      📅 План: {item.new_values?.planned_start} — {item.new_values?.planned_finish}
                                    </span>
                                    <span className="px-2 py-0.5 rounded bg-slate-800 text-cyan-300 border border-slate-700">
                                      ⏱ {item.new_values?.duration} дн.
                                    </span>
                                    <span className="px-2 py-0.5 rounded bg-slate-800 text-purple-300 border border-slate-700">
                                      👤 {item.new_values?.assignee || "—"}
                                    </span>
                                  </div>
                                ) : (
                                  <div className="flex flex-wrap items-center gap-1.5 text-[11px] font-mono">
                                    {item.diff_summary.split("; ").map((diffPart, dIdx) => (
                                      <span
                                        key={dIdx}
                                        className="px-2 py-0.5 rounded bg-amber-950/50 text-amber-300 border border-amber-800/80"
                                      >
                                        {diffPart.includes("➔") ? (
                                          <>
                                            <span className="opacity-75">{diffPart.split("➔")[0]}</span>
                                            <span className="text-cyan-400 font-bold mx-1">➔</span>
                                            <span className="font-bold text-slate-100">{diffPart.split("➔")[1]}</span>
                                          </>
                                        ) : (
                                          diffPart
                                        )}
                                      </span>
                                    ))}
                                  </div>
                                )}
                              </td>
                            </tr>
                          );
                        })}
                      </tbody>
                    </table>
                  </div>

                  {/* Кнопки подтверждения / отмены */}
                  <div className="pt-3 border-t border-slate-800 flex items-center justify-between flex-shrink-0">
                    <button
                      type="button"
                      onClick={resetAll}
                      className="px-4 py-2 bg-slate-800 hover:bg-slate-700 text-slate-300 rounded-lg text-xs font-semibold"
                    >
                      Отмена / Другой файл
                    </button>
                    <button
                      type="button"
                      disabled={isApplying || selectedKeys.size === 0}
                      onClick={handleApplyChanges}
                      className="flex items-center gap-2 px-5 py-2 bg-cyan-600 hover:bg-cyan-500 text-white rounded-lg text-xs font-bold shadow-lg shadow-cyan-950 transition-colors disabled:opacity-40"
                    >
                      <CheckCircle2 className="w-4 h-4" />
                      <span>
                        {isApplying
                          ? "Применение..."
                          : `Применить выбранные (${selectedKeys.size})`}
                      </span>
                    </button>
                  </div>
                </>
              )}
            </div>
          )}
        </div>
      </div>
    </div>
  );
};