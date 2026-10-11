import React, { useState, useEffect } from "react";
import {
  X,
  Lock,
  Save,
  Users,
  Calendar,
  Flame,
  Percent,
  AlertTriangle,
  Link as LinkIcon,
  BookOpen,
  CloudSun,
  PlusCircle,
  Trash2,
  ExternalLink,
  Pencil,
  Plus,
  SlidersHorizontal,
  ChevronDown,
  ChevronRight,
} from "lucide-react";
import { GanttTask, TaskStatus, TaskType, DiaryEntry, DependencyType, TaskDependency } from "../../types";
import { projectApi } from "../../services/api";

interface TaskDrawerProps {
  task: GanttTask | null;
  isOpen: boolean;
  onClose: () => void;
  onSave: (taskId: string, updates: Partial<GanttTask>) => Promise<void>;
  onDelete?: (taskId: string) => Promise<void>;
  onRenameResponsible?: (oldName: string, newName: string) => Promise<void>;
  onDeleteResponsible?: (name: string) => Promise<void>;
  availableTasks?: GanttTask[];
  allResponsiblesList?: string[];
  currentUserId?: string;
}

export const TaskDrawer: React.FC<TaskDrawerProps> = ({
  task,
  isOpen,
  onClose,
  onSave,
  onDelete,
  onRenameResponsible,
  onDeleteResponsible,
  availableTasks = [],
  allResponsiblesList = [],
  currentUserId = "current_user",
}) => {
  // Хелпер парсинга строки ответственных в массив
  const parseAssigneesList = (raw?: string): string[] => {
    if (!raw || raw === "—" || raw === "Не назначен") return [];
    return raw
      .split(/[\/,+;]\s*|\s+и\s+/)
      .map((s) => s.trim())
      .filter((s) => s && s !== "—" && s !== "Не назначен");
  };
  // Все хуки объявляются строго на верхнем уровне (защита от ошибки React #310)
  const [name, setName] = useState(task?.name || "");
  const [wbsCode, setWbsCode] = useState(task?.wbs_code || "");
  const [taskType, setTaskType] = useState<TaskType>(task?.task_type || "TASK");
  const [duration, setDuration] = useState(task?.planned_duration || 1);
  const [status, setStatus] = useState<TaskStatus>(task?.status || "NOT_STARTED");
  const [progress, setProgress] = useState(task?.progress_percent || 0);
  const [plannedStart, setPlannedStart] = useState(task?.planned_start || "");
  const [plannedFinish, setPlannedFinish] = useState(task?.planned_finish || "");
  const [actualStart, setActualStart] = useState(task?.actual_start || "");
  const [actualFinish, setActualFinish] = useState(task?.actual_finish || "");
  
  // Мульти-выбор для Исполнителей (R) и Приемщиков (A)
  const [selectedR, setSelectedR] = useState<string[]>(() => parseAssigneesList(task?.raci_assignee));
  const [selectedA, setSelectedA] = useState<string[]>(() => parseAssigneesList(task?.raci_approver));
  const [isRDropdownOpen, setIsRDropdownOpen] = useState(false);
  const [isADropdownOpen, setIsADropdownOpen] = useState(false);
  const [customPeople, setCustomPeople] = useState<string[]>([]);
  const [newPersonInput, setNewPersonInput] = useState("");
  const [isAddingNewPerson, setIsAddingNewPerson] = useState<"R" | "A" | null>(null);

  // Стейт редактирования имени человека прямо в шторке
  const [editingPersonName, setEditingPersonName] = useState<string | null>(null);
  const [editPersonInputText, setEditPersonInputText] = useState("");

  const handleRenamePersonInDrawer = async (oldName: string, newName: string) => {
    if (!newName.trim() || oldName === newName.trim()) {
      setEditingPersonName(null);
      return;
    }
    const clean = newName.trim();
    setSelectedR((prev) => prev.map((item) => (item === oldName ? clean : item)));
    setSelectedA((prev) => prev.map((item) => (item === oldName ? clean : item)));
    setCustomPeople((prev) => prev.map((item) => (item === oldName ? clean : item)));
    setEditingPersonName(null);

    // Каскадное обновление в базе данных и глобальном справочнике
    if (onRenameResponsible) {
      await onRenameResponsible(oldName, clean);
    }
  };

  const handleDeletePersonInDrawer = async (nameToDelete: string) => {
    setSelectedR((prev) => prev.filter((item) => item !== nameToDelete));
    setSelectedA((prev) => prev.filter((item) => item !== nameToDelete));
    setCustomPeople((prev) => prev.filter((item) => item !== nameToDelete));

    // Каскадное удаление из базы данных
    if (onDeleteResponsible) {
      await onDeleteResponsible(nameToDelete);
    }
  };

  // Сводный список сотрудников для выбора в RACI
  const combinedPeopleList = React.useMemo(() => {
    const set = new Set<string>(allResponsiblesList);
    customPeople.forEach((p) => set.add(p));
    selectedR.forEach((p) => set.add(p));
    selectedA.forEach((p) => set.add(p));
    return Array.from(set).filter((p) => p && p !== "—" && p !== "Не назначен").sort();
  }, [allResponsiblesList, customPeople, selectedR, selectedA]);

  const [pyrusUrl, setPyrusUrl] = useState(task?.custom_attributes?.pyrus_url || "");
  const [isPlanLocked, setIsPlanLocked] = useState(task?.is_plan_locked || false);

  // Стейт связей CPM (Блок 3, Шаг 3.1)
  const [links, setLinks] = useState<TaskDependency[]>(task?.predecessor_links || []);
  const [isAddingLink, setIsAddingLink] = useState(false);
  const [newPredId, setNewPredId] = useState("");
  const [newDepType, setNewDepType] = useState<DependencyType>("FS");
  const [newLag, setNewLag] = useState(0);

  // Журнал работ (Дневник)
  const [diaryEntries, setDiaryEntries] = useState<DiaryEntry[]>([]);
  const [newContent, setNewContent] = useState("");
  const [newWeather, setNewWeather] = useState("");
  const [newIssues, setNewIssues] = useState("");
  const [isAddingEntry, setIsAddingEntry] = useState(false);

  // Стейт редактирования записи журнала
  const [editingEntryId, setEditingEntryId] = useState<string | null>(null);
  const [editContent, setEditContent] = useState("");
  const [editWeather, setEditWeather] = useState("");
  const [editIssues, setEditIssues] = useState("");

  const [isSaving, setIsSaving] = useState(false);
  const [isDeleting, setIsDeleting] = useState(false);
  const [isParamsExpanded, setIsParamsExpanded] = useState(false);
  const [lockStatus, setLockStatus] = useState<"acquiring" | "locked" | "error">("acquiring");

  // Синхронизация формы при смене выбранной задачи
  useEffect(() => {
    if (!task) return;
    setName(task.name);
    setWbsCode(task.wbs_code);
    setTaskType(task.task_type || (task.planned_duration === 0 ? "MILESTONE" : "TASK"));
    setDuration(task.planned_duration);
    setStatus(task.status);
    setProgress(task.progress_percent);
    setPlannedStart(task.planned_start);
    setPlannedFinish(task.planned_finish);
    setActualStart(task.actual_start || "");
    setActualFinish(task.actual_finish || "");
    setSelectedR(parseAssigneesList(task.raci_assignee));
    setSelectedA(parseAssigneesList(task.raci_approver));
    setIsRDropdownOpen(false);
    setIsADropdownOpen(false);
    setPyrusUrl(task.custom_attributes?.pyrus_url || "");
    setIsPlanLocked(task.is_plan_locked || false);
    setLinks(task.predecessor_links || []);
    setIsAddingLink(false);
  }, [task]);

  // Управление Live Lock при открытии/закрытии
  useEffect(() => {
    if (!task || !isOpen) return;
    let isMounted = true;

    const acquire = async () => {
      try {
        await projectApi.lockTask(task.id, currentUserId);
        if (isMounted) setLockStatus("locked");
      } catch {
        if (isMounted) setLockStatus("error");
      }
    };

    acquire();
    projectApi.getTaskDiary(task.id).then((entries) => {
      if (isMounted) setDiaryEntries(entries);
    });

    return () => {
      isMounted = false;
      projectApi.unlockTask(task.id, currentUserId).catch(() => {});
    };
  }, [task?.id, isOpen, currentUserId]);

  if (!isOpen || !task) return null;

  const handleAddDiaryEntry = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!newContent.trim()) return;

    setIsAddingEntry(true);
    const entryPayload: Omit<DiaryEntry, "id" | "created_at"> = {
      task_id: task.id,
      entry_date: new Date().toISOString().split("T")[0],
      entry_type: newIssues ? "ISSUE" : "FACT",
      author_name: selectedR.length > 0 ? selectedR.join(", ") : "Прораб / Инженер",
      content: newContent,
      weather_conditions: newWeather || undefined,
      issues_and_risks: newIssues || undefined,
    };

    try {
      const saved = await projectApi.createDiaryEntry(task.id, entryPayload);
      setDiaryEntries((prev) => [saved, ...prev]);
    } catch {
      // Локальный fallback при отсутствии сетевого ответа
      setDiaryEntries((prev) => [
        { ...entryPayload, id: String(Date.now()) },
        ...prev,
      ]);
    } finally {
      setNewContent("");
      setNewWeather("");
      setNewIssues("");
      setIsAddingEntry(false);
    }
  };

  // Удаление записи журнала
  const handleDeleteDiaryEntry = async (entryId: string) => {
    if (!task) return;
    await projectApi.deleteDiaryEntry(task.id, entryId);
    setDiaryEntries((prev) => prev.filter((e) => e.id !== entryId));
  };

  // Сохранение изменений в отредактированной записи
  const handleSaveEditDiaryEntry = async (entryId: string) => {
    if (!task || !editContent.trim()) return;
    const updated = await projectApi.updateDiaryEntry(task.id, entryId, {
      content: editContent,
      weather_conditions: editWeather || undefined,
      issues_and_risks: editIssues || undefined,
    });
    setDiaryEntries((prev) =>
      prev.map((e) => (e.id === entryId ? { ...e, ...updated } : e))
    );
    setEditingEntryId(null);
  };

  const handleFormSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setIsSaving(true);
    try {
      await onSave(task.id, {
        name,
        wbs_code: wbsCode.trim() || task.wbs_code,
        task_type: taskType,
        planned_duration: taskType === "MILESTONE" ? 0 : Number(duration) || 1,
        status,
        progress_percent: progress,
        planned_start: plannedStart,
        planned_finish: taskType === "MILESTONE" ? plannedStart : plannedFinish,
        is_plan_locked: isPlanLocked,
        actual_start: actualStart || undefined,
        actual_finish: actualFinish || undefined,
        raci_assignee: selectedR.length > 0 ? selectedR.join(", ") : "",
        raci_approver: selectedA.length > 0 ? selectedA.join(", ") : "",
        predecessor_links: links,
        custom_attributes: {
          ...(task.custom_attributes || {}),
          pyrus_url: pyrusUrl.trim() || undefined,
        },
      });
      onClose();
    } catch (err: any) {
      alert(err.response?.data?.detail || "Ошибка при сохранении задачи");
    } finally {
      setIsSaving(false);
    }
  };

  return (
    <div className="fixed inset-y-0 right-0 w-full max-w-lg bg-slate-900 border-l border-slate-700 shadow-2xl z-50 flex flex-col backdrop-blur-md">
      {/* Шапка боковой панели */}
      <div className="p-6 border-b border-slate-700 flex items-center justify-between bg-slate-800/60">
        <div>
          <div className="flex items-center gap-2 mb-1">
            <span className="px-2 py-0.5 rounded text-xs font-mono font-bold bg-slate-950 text-cyan-400 border border-cyan-500/30">
              WBS {task.wbs_code}
            </span>
            {task.is_critical && (
              <span className="px-2 py-0.5 rounded-full text-xs font-semibold bg-rose-500/20 text-rose-400 border border-rose-500/30 flex items-center gap-1">
                <Flame className="w-3 h-3" /> Критическая
              </span>
            )}
            {lockStatus === "locked" && (
              <span className="px-2 py-0.5 rounded text-[10px] bg-purple-900/60 text-purple-300 font-mono">
                🔒 Live Lock: Вы
              </span>
            )}
            {lockStatus === "error" && (
              <div className="flex items-center gap-1.5">
                <span className="px-2 py-0.5 rounded text-[10px] bg-rose-950 text-rose-300 border border-rose-800 font-mono">
                  🔒 Заблокировано другим
                </span>
                <button
                  type="button"
                  onClick={async () => {
                    await projectApi.unlockTask(task.id, currentUserId).catch(() => {});
                    await projectApi.lockTask(task.id, currentUserId).catch(() => {});
                    setLockStatus("locked");
                  }}
                  className="px-2 py-0.5 rounded text-[10px] bg-amber-500/20 text-amber-300 border border-amber-500/30 hover:bg-amber-500/40 font-bold transition-colors"
                  title="Принудительно сбросить зависшую блокировку"
                >
                  Снять блок
                </button>
              </div>
            )}
          </div>
          <h2 className="text-lg font-bold text-slate-100 truncate max-w-sm">
            {task.name}
          </h2>
        </div>
        <button
          onClick={onClose}
          className="p-2 rounded-lg text-slate-400 hover:text-white hover:bg-slate-800 transition-colors"
        >
          <X className="w-5 h-5" />
        </button>
      </div>

      {/* Форма редактирования */}
      <form
        onSubmit={handleFormSubmit}
        className="flex-1 overflow-y-auto p-5 space-y-4 text-xs"
      >
        {/* 1. БЛОК: Привязка задачи к Pyrus (всегда вверху) */}
        <div className="bg-slate-800/40 p-3.5 rounded-xl border border-slate-700/60 space-y-2">
          <div className="text-xs font-bold text-purple-400 uppercase tracking-wider flex items-center justify-between">
            <span className="flex items-center gap-1.5">
              <ExternalLink className="w-3.5 h-3.5" />
              Привязка к Pyrus
            </span>
            {pyrusUrl && (
              <a
                href={pyrusUrl}
                target="_blank"
                rel="noopener noreferrer"
                className="text-[11px] text-purple-300 hover:text-white underline font-semibold flex items-center gap-0.5"
              >
                Открыть задачу в Pyrus ↗
              </a>
            )}
          </div>
          <input
            type="url"
            placeholder="https://pyrus.com/t#id12345"
            value={pyrusUrl}
            onChange={(e) => setPyrusUrl(e.target.value)}
            className="w-full px-3 py-1.5 bg-slate-800 border border-slate-700 rounded-lg text-purple-200 text-xs font-mono placeholder-slate-500 focus:border-purple-500 focus:outline-none"
          />
        </div>

        {/* 2. БЛОК: Журнал производства работ */}
        <div className="bg-slate-800/40 p-4 rounded-xl border border-slate-700/60 space-y-3">
          <div className="text-xs font-bold text-amber-400 uppercase tracking-wider flex items-center gap-1.5">
            <BookOpen className="w-4 h-4" />
            Журнал производства работ
          </div>

          {/* Быстрый ввод записи */}
          <div className="space-y-2 bg-slate-900/60 p-3 rounded-lg border border-slate-700/50">
            <textarea
              placeholder="Фактически выполненные работы за смену..."
              value={newContent}
              onChange={(e) => setNewContent(e.target.value)}
              rows={2}
              className="w-full px-2.5 py-1.5 bg-slate-800 border border-slate-700 rounded text-xs text-slate-100 placeholder-slate-500 focus:outline-none focus:border-cyan-500"
            />
            <div className="grid grid-cols-2 gap-2">
              <input
                type="text"
                placeholder="Погода (+18°C, без осадков)"
                value={newWeather}
                onChange={(e) => setNewWeather(e.target.value)}
                className="px-2 py-1 bg-slate-800 border border-slate-700 rounded text-[11px] text-slate-300"
              />
              <input
                type="text"
                placeholder="Проблемы / Риски / Простои"
                value={newIssues}
                onChange={(e) => setNewIssues(e.target.value)}
                className="px-2 py-1 bg-slate-800 border border-slate-700 rounded text-[11px] text-rose-300 placeholder-rose-400/50"
              />
            </div>
            <button
              type="button"
              onClick={handleAddDiaryEntry}
              disabled={!newContent.trim() || isAddingEntry}
              className="w-full py-1.5 bg-slate-800 hover:bg-slate-700 border border-slate-600 rounded text-xs text-cyan-300 font-medium flex items-center justify-center gap-1.5 transition-colors disabled:opacity-40"
            >
              <PlusCircle className="w-3.5 h-3.5" /> Внести запись в журнал
            </button>
          </div>

          {/* Список записей с поддержкой редактирования и удаления */}
          {diaryEntries.length > 0 && (
            <div className="space-y-2 max-h-56 overflow-y-auto pr-1">
              {diaryEntries.map((entry, idx) => {
                const entryId = entry.id || String(idx);
                const isEditing = editingEntryId === entryId;

                return (
                  <div
                    key={entryId}
                    className="p-2.5 bg-slate-900/80 rounded-lg border border-slate-800 text-xs space-y-1.5"
                  >
                    <div className="flex items-center justify-between text-[10px] text-slate-400 border-b border-slate-800/80 pb-1">
                      <span className="font-mono text-cyan-400 font-semibold">
                        {entry.entry_date} • {entry.author_name}
                      </span>
                      <div className="flex items-center gap-2">
                        {entry.weather_conditions && !isEditing && (
                          <span className="flex items-center gap-1 text-slate-400">
                            <CloudSun className="w-3 h-3 text-amber-400" /> {entry.weather_conditions}
                          </span>
                        )}
                        <button
                          type="button"
                          onClick={() => {
                            setEditingEntryId(entryId);
                            setEditContent(entry.content);
                            setEditWeather(entry.weather_conditions || "");
                            setEditIssues(entry.issues_and_risks || "");
                          }}
                          className="p-0.5 text-slate-500 hover:text-cyan-300 transition-colors"
                          title="Редактировать запись"
                        >
                          <Pencil className="w-3 h-3" />
                        </button>
                        <button
                          type="button"
                          onClick={() => handleDeleteDiaryEntry(entryId)}
                          className="p-0.5 text-slate-500 hover:text-rose-400 transition-colors"
                          title="Удалить запись"
                        >
                          <Trash2 className="w-3 h-3" />
                        </button>
                      </div>
                    </div>

                    {isEditing ? (
                      /* Инлайн-форма редактирования */
                      <div className="space-y-2 pt-1">
                        <textarea
                          rows={2}
                          value={editContent}
                          onChange={(e) => setEditContent(e.target.value)}
                          className="w-full px-2 py-1 bg-slate-800 border border-slate-700 rounded text-xs text-slate-100"
                        />
                        <div className="grid grid-cols-2 gap-2">
                          <input
                            type="text"
                            placeholder="Погода"
                            value={editWeather}
                            onChange={(e) => setEditWeather(e.target.value)}
                            className="px-2 py-1 bg-slate-800 border border-slate-700 rounded text-[11px] text-slate-300"
                          />
                          <input
                            type="text"
                            placeholder="Проблемы / Простои"
                            value={editIssues}
                            onChange={(e) => setEditIssues(e.target.value)}
                            className="px-2 py-1 bg-slate-800 border border-slate-700 rounded text-[11px] text-rose-300"
                          />
                        </div>
                        <div className="flex justify-end gap-1.5 pt-1">
                          <button
                            type="button"
                            onClick={() => setEditingEntryId(null)}
                            className="px-2 py-0.5 rounded bg-slate-800 text-slate-400 text-[11px]"
                          >
                            Отмена
                          </button>
                          <button
                            type="button"
                            onClick={() => handleSaveEditDiaryEntry(entryId)}
                            className="px-2.5 py-0.5 rounded bg-cyan-600 hover:bg-cyan-500 text-white font-bold text-[11px]"
                          >
                            Сохранить
                          </button>
                        </div>
                      </div>
                    ) : (
                      <>
                        <p className="text-slate-200 text-xs leading-relaxed">{entry.content}</p>
                        {entry.issues_and_risks && (
                          <div className="text-[11px] text-rose-400 bg-rose-950/40 px-2 py-0.5 rounded border border-rose-900/50">
                            ⚠️ {entry.issues_and_risks}
                          </div>
                        )}
                      </>
                    )}
                  </div>
                );
              })}
            </div>
          )}
        </div>

        {/* 3. БЛОК: Развёртываемое меню со стрелочкой (Параметры WBS, Сроки, RACI и CPM) */}
        <div className="border border-slate-700/70 rounded-xl overflow-hidden bg-slate-800/30">
          <button
            type="button"
            onClick={() => setIsParamsExpanded(!isParamsExpanded)}
            className="w-full p-3 bg-slate-800/60 hover:bg-slate-800 flex items-center justify-between text-xs font-bold text-slate-200 transition-colors cursor-pointer select-none"
          >
            <div className="flex items-center gap-2">
              <SlidersHorizontal className="w-3.5 h-3.5 text-cyan-400" />
              <span>Параметры WBS, Сроки, RACI и CPM</span>
            </div>
            {isParamsExpanded ? (
              <ChevronDown className="w-4 h-4 text-cyan-400" />
            ) : (
              <ChevronRight className="w-4 h-4 text-slate-400" />
            )}
          </button>

          {isParamsExpanded && (
            <div className="p-4 space-y-4 border-t border-slate-700/60 bg-slate-900/40">
              {/* Предупреждение об автоблокировке плана */}
              {task.is_plan_locked && (
                <div className="p-2.5 rounded-lg bg-amber-500/10 border border-amber-500/30 flex items-start gap-2 text-xs text-amber-300">
                  <Lock className="w-3.5 h-3.5 flex-shrink-0 text-amber-400 mt-0.5" />
                  <div>
                    <span className="font-bold">Базовый план заблокирован:</span> Задача уже имеет фактические отметки исполнения.
                  </div>
                </div>
              )}

              {/* WBS код, Тип этапа и Длительность */}
              <div className="grid grid-cols-3 gap-2.5">
                <div>
                  <label className="block text-[10px] font-semibold text-slate-400 mb-1 uppercase">WBS код</label>
                  <input
                    type="text"
                    required
                    value={wbsCode}
                    onChange={(e) => setWbsCode(e.target.value)}
                    className="w-full px-2.5 py-1 bg-slate-800 border border-slate-700 rounded text-cyan-300 font-mono font-bold text-xs"
                  />
                </div>
                <div>
                  <label className="block text-[10px] font-semibold text-slate-400 mb-1 uppercase">Тип этапа</label>
                  <select
                    value={taskType}
                    onChange={(e) => {
                      const t = e.target.value as TaskType;
                      setTaskType(t);
                      if (t === "MILESTONE") {
                        setDuration(0);
                        setPlannedFinish(plannedStart);
                      } else if (duration === 0) setDuration(5);
                    }}
                    className="w-full px-2 py-1 bg-slate-800 border border-slate-700 rounded text-slate-200 text-xs"
                  >
                    <option value="TASK">Работа</option>
                    <option value="MILESTONE">Веха (0 дн.)</option>
                  </select>
                </div>
                <div>
                  <label className="block text-[10px] font-semibold text-slate-400 mb-1 uppercase">Дней (Срок)</label>
                  <input
                    type="number"
                    min={0}
                    disabled={taskType === "MILESTONE" || task.is_plan_locked}
                    value={duration}
                    onChange={(e) => {
                      const d = Number(e.target.value);
                      setDuration(d);
                      if (plannedStart) {
                        const s = new Date(plannedStart);
                        const f = new Date(s.getTime() + d * 86400000);
                        setPlannedFinish(f.toISOString().split("T")[0]);
                      }
                    }}
                    className="w-full px-2 py-1 bg-slate-800 border border-slate-700 rounded text-slate-200 font-mono text-xs disabled:opacity-40"
                  />
                </div>
              </div>

              {/* Наименование работы */}
              <div>
                <label className="block text-[10px] font-semibold text-slate-400 mb-1 uppercase">Наименование работы</label>
                <input
                  type="text"
                  required
                  value={name}
                  onChange={(e) => setName(e.target.value)}
                  className="w-full px-2.5 py-1.5 bg-slate-800 border border-slate-700 rounded-lg text-slate-100 text-xs"
                />
              </div>

              {/* Базовый директивный план */}
              <div className="p-3 bg-slate-800/50 rounded-xl border border-slate-700/60 space-y-2.5">
                <div className="flex items-center justify-between">
                  <span className="text-[11px] font-bold text-slate-300 uppercase tracking-wider flex items-center gap-1.5">
                    <Calendar className="w-3.5 h-3.5 text-cyan-400" /> Базовый директивный план
                  </span>
                  <div
                    onClick={() => setIsPlanLocked(!isPlanLocked)}
                    className="flex items-center gap-1.5 cursor-pointer select-none"
                  >
                    <div className={`w-7 h-4 rounded-full p-0.5 transition-colors ${isPlanLocked ? "bg-amber-500" : "bg-slate-700"}`}>
                      <div className={`w-3 h-3 rounded-full bg-white transform transition-transform ${isPlanLocked ? "translate-x-3" : "translate-x-0"}`} />
                    </div>
                    <span className={`text-[10px] font-semibold ${isPlanLocked ? "text-amber-400" : "text-slate-400"}`}>
                      {isPlanLocked ? "Заморожен" : "Свободен"}
                    </span>
                  </div>
                </div>

                <div className="grid grid-cols-2 gap-2">
                  <div>
                    <label className="block text-[10px] text-slate-400 mb-0.5">План старт</label>
                    <input
                      type="date"
                      value={plannedStart}
                      disabled={isPlanLocked}
                      onChange={(e) => setPlannedStart(e.target.value)}
                      className="w-full px-2 py-1 bg-slate-800 border border-slate-700 rounded text-slate-200 text-xs font-mono disabled:opacity-50"
                    />
                  </div>
                  <div>
                    <label className="block text-[10px] text-slate-400 mb-0.5">План финиш</label>
                    <input
                      type="date"
                      value={plannedFinish}
                      disabled={isPlanLocked}
                      onChange={(e) => setPlannedFinish(e.target.value)}
                      className="w-full px-2 py-1 bg-slate-800 border border-slate-700 rounded text-slate-200 text-xs font-mono disabled:opacity-50"
                    />
                  </div>
                </div>
              </div>

              {/* Фактическое исполнение */}
              <div className="p-3 bg-slate-800/50 rounded-xl border border-slate-700/60 space-y-2.5">
                <div className="flex items-center justify-between text-[11px] font-bold text-emerald-400 uppercase">
                  <span className="flex items-center gap-1.5"><Percent className="w-3.5 h-3.5" /> Фактический прогресс</span>
                  <span className="font-mono text-xs">{Math.round(progress)}%</span>
                </div>
                <input
                  type="range"
                  min="0"
                  max="100"
                  step="5"
                  value={progress}
                  onChange={(e) => setProgress(Number(e.target.value))}
                  className="w-full h-1.5 bg-slate-700 rounded-lg appearance-none cursor-pointer accent-emerald-500"
                />
                <div className="grid grid-cols-2 gap-2 pt-1">
                  <div>
                    <label className="block text-[10px] text-slate-400 mb-0.5">Факт старт</label>
                    <input
                      type="date"
                      value={actualStart}
                      onChange={(e) => setActualStart(e.target.value)}
                      className="w-full px-2 py-1 bg-slate-800 border border-slate-700 rounded text-emerald-400 text-xs font-mono"
                    />
                  </div>
                  <div>
                    <label className="block text-[10px] text-slate-400 mb-0.5">Факт финиш</label>
                    <input
                      type="date"
                      value={actualFinish}
                      onChange={(e) => setActualFinish(e.target.value)}
                      className="w-full px-2 py-1 bg-slate-800 border border-slate-700 rounded text-emerald-400 text-xs font-mono"
                    />
                  </div>
                </div>
              </div>

              {/* Задачный RACI */}
              <div className="p-3 bg-slate-800/50 rounded-xl border border-slate-700/60 space-y-2.5">
                <span className="text-[11px] font-bold text-purple-400 uppercase tracking-wider flex items-center gap-1.5">
                  <Users className="w-3.5 h-3.5" /> Задачный RACI
                </span>
                <div className="grid grid-cols-2 gap-2">
                  <div>
                    <label className="block text-[10px] text-slate-400 mb-0.5">Исполнитель (R)</label>
                    <input
                      type="text"
                      value={selectedR.join(", ")}
                      onChange={(e) => setSelectedR(e.target.value ? e.target.value.split(",").map((s) => s.trim()) : [])}
                      placeholder="Климов А.Н."
                      className="w-full px-2 py-1 bg-slate-800 border border-slate-700 rounded text-slate-200 text-xs"
                    />
                  </div>
                  <div>
                    <label className="block text-[10px] text-slate-400 mb-0.5">Приемщик (A)</label>
                    <input
                      type="text"
                      value={selectedA.join(", ")}
                      onChange={(e) => setSelectedA(e.target.value ? e.target.value.split(",").map((s) => s.trim()) : [])}
                      placeholder="ГИП"
                      className="w-full px-2 py-1 bg-slate-800 border border-slate-700 rounded text-slate-200 text-xs"
                    />
                  </div>
                </div>
              </div>

              {/* Связи CPM */}
              <div className="p-3 bg-slate-800/50 rounded-xl border border-slate-700/60 space-y-2">
                <div className="flex items-center justify-between text-[11px] font-bold text-cyan-400 uppercase">
                  <span className="flex items-center gap-1.5"><LinkIcon className="w-3.5 h-3.5" /> Сетевой граф CPM</span>
                  <button
                    type="button"
                    onClick={() => setIsAddingLink(!isAddingLink)}
                    className="text-[10px] text-cyan-300 hover:text-white font-semibold flex items-center gap-1"
                  >
                    <PlusCircle className="w-3 h-3" /> <span>{isAddingLink ? "Скрыть" : "Добавить"}</span>
                  </button>
                </div>

                {isAddingLink && (
                  <div className="p-2.5 bg-slate-900 rounded border border-slate-700 space-y-2">
                    <select
                      value={newPredId}
                      onChange={(e) => setNewPredId(e.target.value)}
                      className="w-full px-2 py-1 bg-slate-800 border border-slate-700 rounded text-slate-200 text-xs"
                    >
                      <option value="">-- Выберите этап --</option>
                      {availableTasks.map((at) => (
                        <option key={at.id} value={at.id}>
                          [{at.wbs_code}] {at.name.slice(0, 35)}
                        </option>
                      ))}
                    </select>
                    <div className="grid grid-cols-2 gap-2">
                      <select
                        value={newDepType}
                        onChange={(e) => setNewDepType(e.target.value as DependencyType)}
                        className="w-full px-2 py-1 bg-slate-800 border border-slate-700 rounded text-cyan-300 font-mono text-xs font-bold"
                      >
                        <option value="FS">FS (План)</option>
                        <option value="SS">SS (Параллельно)</option>
                        <option value="FF">FF (Вместе)</option>
                        <option value="SF">SF (Редкая)</option>
                      </select>
                      <input
                        type="number"
                        value={newLag}
                        onChange={(e) => setNewLag(Number(e.target.value))}
                        className="w-full px-2 py-1 bg-slate-800 border border-slate-700 rounded text-slate-200 text-xs"
                        placeholder="Лаг (дн)"
                      />
                    </div>
                    <button
                      type="button"
                      disabled={!newPredId}
                      onClick={() => {
                        if (!newPredId) return;
                        setLinks((prev) => [
                          ...prev,
                          {
                            id: `temp-${Date.now()}`,
                            predecessor_task_id: newPredId,
                            successor_task_id: task.id,
                            dependency_type: newDepType,
                            lag_days: newLag,
                          },
                        ]);
                        setNewPredId("");
                        setNewLag(0);
                        setIsAddingLink(false);
                      }}
                      className="w-full py-1 bg-cyan-600 text-white rounded text-xs font-bold disabled:opacity-40"
                    >
                      Привязать
                    </button>
                  </div>
                )}

                <div className="space-y-1">
                  {links.length === 0 ? (
                    <p className="text-[10px] text-slate-500 italic">Связей с предшественниками нет</p>
                  ) : (
                    links.map((l) => {
                      const predTask = availableTasks.find((at) => at.id === l.predecessor_task_id);
                      return (
                        <div key={l.id || l.predecessor_task_id} className="flex items-center justify-between p-1.5 bg-slate-900 rounded text-[11px]">
                          <span className="font-mono text-cyan-300 font-bold">{l.dependency_type} [{predTask?.wbs_code || "WBS"}] {predTask?.name.slice(0, 24)}</span>
                          <button type="button" onClick={() => setLinks((prev) => prev.filter((item) => item !== l))} className="p-0.5 text-slate-500 hover:text-rose-400">
                            <Trash2 className="w-3 h-3" />
                          </button>
                        </div>
                      );
                    })
                  )}
                </div>
              </div>
            </div>
          )}
        </div>

        {/* Кнопки сохранения и удаления */}
        <div className="pt-4 border-t border-slate-700 flex items-center justify-between gap-3">
          {onDelete && (
            <button
              type="button"
              disabled={isDeleting || isSaving}
              onClick={async () => {
                if (window.confirm(`Вы уверены, что хотите удалить этап [${task.wbs_code}] "${task.name}"? Связанные зависимости CPM будут удалены.`)) {
                  try {
                    setIsDeleting(true);
                    await onDelete(task.id);
                    onClose();
                  } finally {
                    setIsDeleting(false);
                  }
                }
              }}
              className="flex items-center gap-1.5 px-3 py-2 rounded-lg bg-rose-950/40 hover:bg-rose-900/60 text-rose-400 border border-rose-900/60 text-xs font-semibold transition-colors"
              title="Безвозвратно удалить этап"
            >
              <Trash2 className="w-3.5 h-3.5" />
              <span>{isDeleting ? "Удаление..." : "Удалить этап"}</span>
            </button>
          )}

          <div className="flex items-center gap-2 ml-auto">
            <button
              type="button"
              onClick={onClose}
              className="px-4 py-2 rounded-lg bg-slate-800 hover:bg-slate-700 text-slate-300 text-xs font-medium transition-colors"
            >
              Отмена
            </button>
            <button
              type="submit"
              disabled={isSaving || isDeleting}
              className="flex items-center gap-2 px-5 py-2 rounded-lg bg-cyan-600 hover:bg-cyan-500 text-white text-xs font-semibold transition-colors shadow-lg shadow-cyan-900/30 disabled:opacity-50"
            >
              <Save className="w-4 h-4" />
              {isSaving ? "Сохранение..." : "Сохранить"}
            </button>
          </div>
        </div>
      </form>
    </div>
  );
};
