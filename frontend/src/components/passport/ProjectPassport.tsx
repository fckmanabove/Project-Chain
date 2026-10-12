import React, { useState, useEffect } from "react";
import {
  Calendar,
  DollarSign,
  MapPin,
  Users,
  RefreshCw,
  Clock,
  Layers,
  ShieldAlert,
  CheckCircle2,
  Building2,
  Pencil,
  Save,
  X,
  Trash2,
  KeyRound,
} from "lucide-react";
import {
  ProjectPassport as IProjectPassport,
  ProjectStatus,
} from "../../types";

interface ProjectPassportProps {
  project: IProjectPassport;
  onRecalculateCPM?: () => Promise<void>;
  isRecalculating?: boolean;
  onUpdateProject?: (updates: Partial<IProjectPassport>) => Promise<void>;
  onDeleteProject?: (passcode: string) => Promise<void>;
}

const statusColors: Record<ProjectStatus, string> = {
  INITIATION: "bg-blue-500/20 text-blue-400 border-blue-500/30",
  PLANNING: "bg-amber-500/20 text-amber-400 border-amber-500/30",
  EXECUTION: "bg-emerald-500/20 text-emerald-400 border-emerald-500/30",
  MONITORING: "bg-purple-500/20 text-purple-400 border-purple-500/30",
  CLOSING: "bg-cyan-500/20 text-cyan-400 border-cyan-500/30",
  ARCHIVED: "bg-slate-500/20 text-slate-400 border-slate-500/30",
  ON_HOLD: "bg-rose-500/20 text-rose-400 border-rose-500/30",
};

const statusLabels: Record<ProjectStatus, string> = {
  INITIATION: "Инициация",
  PLANNING: "Планирование",
  EXECUTION: "Реализация",
  MONITORING: "Контроль",
  CLOSING: "Завершение",
  ARCHIVED: "В архиве",
  ON_HOLD: "Приостановлен",
};

export const ProjectPassport: React.FC<ProjectPassportProps> = ({
  project,
  onRecalculateCPM,
  isRecalculating = false,
  onUpdateProject,
  onDeleteProject,
}) => {
  // Стейт модалки редактирования паспорта
  const [isEditOpen, setIsEditOpen] = useState(false);
  const [name, setName] = useState(project.name);
  const [status, setStatus] = useState<ProjectStatus>(project.status);
  const [startDate, setStartDate] = useState(project.planned_start_date);
  const [finishDate, setFinishDate] = useState(project.planned_finish_date);
  const [budget, setBudget] = useState(project.planned_budget || 0);
  const [location, setLocation] = useState(project.location || "");
  const [description, setDescription] = useState(project.description || "");
  const [pm, setPm] = useState(project.raci_matrix?.pm || "");
  const [gip, setGip] = useState(project.raci_matrix?.chief_engineer || "");
  const [sponsor, setSponsor] = useState(project.raci_matrix?.sponsor || "");
  const [isSaving, setIsSaving] = useState(false);

  // Стейт защищенного удаления проекта
  const [isDeleteOpen, setIsDeleteOpen] = useState(false);
  const [deletePasscode, setDeletePasscode] = useState("");
  const [deleteError, setDeleteError] = useState<string | null>(null);
  const [isDeleting, setIsDeleting] = useState(false);

  const handleDeleteSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!onDeleteProject || !deletePasscode) return;
    try {
      setIsDeleting(true);
      setDeleteError(null);
      await onDeleteProject(deletePasscode);
      setIsDeleteOpen(false);
      setDeletePasscode("");
    } catch (err: any) {
      setDeleteError(err.response?.data?.detail || err.message || "Неверный мастер-пароль");
    } finally {
      setIsDeleting(false);
    }
  };

  useEffect(() => {
    setName(project.name);
    setStatus(project.status);
    setStartDate(project.planned_start_date);
    setFinishDate(project.planned_finish_date);
    setBudget(project.planned_budget || 0);
    setLocation(project.location || "");
    setDescription(project.description || "");
    setPm(project.raci_matrix?.pm || "");
    setGip(project.raci_matrix?.chief_engineer || "");
    setSponsor(project.raci_matrix?.sponsor || "");
  }, [project]);

  const handleEditSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!onUpdateProject) return;
    try {
      setIsSaving(true);
      await onUpdateProject({
        name,
        status,
        planned_start_date: startDate,
        planned_finish_date: finishDate,
        planned_budget: Number(budget),
        location,
        description,
        raci_matrix: {
          ...project.raci_matrix,
          pm,
          chief_engineer: gip,
          sponsor,
        },
      });
      setIsEditOpen(false);
    } finally {
      setIsSaving(false);
    }
  };

  const formatMoney = (val?: number, currency = "RUB") => {
    if (val === undefined || val === null) return "—";
    return new Intl.NumberFormat("ru-RU", {
      style: "currency",
      currency,
      maximumFractionDigits: 0,
    }).format(val);
  };

  const formatDate = (dateStr?: string) => {
    if (!dateStr) return "—";
    return new Date(dateStr).toLocaleDateString("ru-RU", {
      day: "2-digit",
      month: "short",
      year: "numeric",
    });
  };

  const raci = project.raci_matrix || {};
  const passportExtra = project.passport_data || {};

  return (
    <div className="bg-slate-900 border border-slate-800 rounded-xl p-3.5 shadow-md">
      {/* 1 Компактная строка: Шифр, Название и Кнопки действий */}
      <div className="flex flex-wrap items-center justify-between gap-3 pb-2.5 border-b border-slate-800">
        <div className="flex items-center gap-2.5 min-w-0">
          <span className="px-2 py-0.5 rounded font-mono text-xs font-extrabold bg-slate-800 text-cyan-400 border border-cyan-500/30">
            {project.code}
          </span>
          <span className={`px-2 py-0.5 rounded-full text-[11px] font-bold border ${statusColors[project.status]}`}>
            {statusLabels[project.status] || project.status}
          </span>
          <h2 className="text-sm font-bold text-slate-100 truncate max-w-xl">
            {project.name}
          </h2>
        </div>

        {/* Кнопки действий */}
        <div className="flex items-center gap-2">
          {onUpdateProject && (
            <button
              onClick={() => setIsEditOpen(true)}
              className="flex items-center gap-1 px-2.5 py-1 rounded-lg bg-slate-800 hover:bg-slate-700 text-slate-200 font-semibold text-xs border border-slate-700 transition-colors"
              title="Редактировать паспорт"
            >
              <Pencil className="w-3.5 h-3.5 text-cyan-400" />
              <span>Редактировать</span>
            </button>
          )}

          {onRecalculateCPM && (
            <button
              onClick={onRecalculateCPM}
              disabled={isRecalculating}
              className="flex items-center gap-1 px-3 py-1 rounded-lg bg-cyan-600 hover:bg-cyan-500 text-white font-bold text-xs transition-colors shadow-sm disabled:opacity-50"
            >
              <RefreshCw className={`w-3.5 h-3.5 ${isRecalculating ? "animate-spin" : ""}`} />
              <span>{isRecalculating ? "Расчёт..." : "Пересчитать CPM"}</span>
            </button>
          )}

          {onDeleteProject && (
            <button
              onClick={() => {
                setDeleteError(null);
                setDeletePasscode("");
                setIsDeleteOpen(true);
              }}
              className="p-1.5 rounded-lg bg-rose-950/40 hover:bg-rose-900/60 text-rose-400 border border-rose-900/50 transition-colors"
              title="Удалить проект"
            >
              <Trash2 className="w-3.5 h-3.5" />
            </button>
          )}
        </div>
      </div>

      {/* 2 Компактная строка: Все параметры в одну плотную строку */}
      <div className="grid grid-cols-2 sm:grid-cols-4 gap-2 pt-2.5 text-xs text-slate-300">
        <div className="flex items-center gap-1.5 truncate">
          <Calendar className="w-3.5 h-3.5 text-cyan-400 flex-shrink-0" />
          <span>Сроки:</span>
          <span className="font-mono text-slate-200 font-semibold truncate">
            {formatDate(project.planned_start_date)} — {formatDate(project.planned_finish_date)}
          </span>
        </div>

        <div className="flex items-center gap-1.5 truncate">
          <DollarSign className="w-3.5 h-3.5 text-emerald-400 flex-shrink-0" />
          <span>CAPEX:</span>
          <span className="font-mono font-bold text-slate-100">
            {formatMoney(project.planned_budget, project.currency)}
          </span>
        </div>

        <div className="flex items-center gap-1.5 truncate">
          <Users className="w-3.5 h-3.5 text-purple-400 flex-shrink-0" />
          <span>РП:</span>
          <span className="font-medium text-slate-200 truncate">
            {raci.pm || "Климов А.Н."}
          </span>
        </div>

        <div className="flex items-center gap-1.5 truncate">
          <MapPin className="w-3.5 h-3.5 text-amber-400 flex-shrink-0" />
          <span className="truncate">{project.location || "Цех ДСП"}</span>
        </div>
      </div>

      {/* Модальное окно редактирования паспорта проекта */}
      {isEditOpen && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-slate-950/80 backdrop-blur-sm animate-fadeIn">
          <div className="bg-slate-900 border border-slate-700 rounded-2xl w-full max-w-xl shadow-2xl overflow-hidden flex flex-col max-h-[90vh]">
            <div className="p-5 border-b border-slate-800 flex items-center justify-between bg-slate-850">
              <div className="flex items-center gap-3">
                <div className="w-9 h-9 rounded-xl bg-cyan-600/20 border border-cyan-500/30 flex items-center justify-center text-cyan-400">
                  <Pencil className="w-4 h-4" />
                </div>
                <div>
                  <h3 className="text-base font-bold text-slate-100">Редактирование паспорта [{project.code}]</h3>
                  <p className="text-xs text-slate-400">Директивные параметры, бюджет и проектный RACI</p>
                </div>
              </div>
              <button onClick={() => setIsEditOpen(false)} className="p-1.5 text-slate-400 hover:text-white rounded-lg hover:bg-slate-800">
                <X className="w-4 h-4" />
              </button>
            </div>

            <form onSubmit={handleEditSubmit} className="p-5 space-y-4 text-xs overflow-y-auto">
              <div className="grid grid-cols-3 gap-3">
                <div className="col-span-2">
                  <label className="block text-slate-400 mb-1 font-semibold">Наименование проекта</label>
                  <input
                    type="text"
                    required
                    value={name}
                    onChange={(e) => setName(e.target.value)}
                    className="w-full px-3 py-2 bg-slate-800 border border-slate-700 rounded-lg text-slate-100 font-medium"
                  />
                </div>
                <div>
                  <label className="block text-slate-400 mb-1 font-semibold">Статус жизненного цикла</label>
                  <select
                    value={status}
                    onChange={(e) => setStatus(e.target.value as ProjectStatus)}
                    className="w-full px-3 py-2 bg-slate-800 border border-slate-700 rounded-lg text-slate-200 font-medium"
                  >
                    <option value="INITIATION">Инициация</option>
                    <option value="PLANNING">Планирование</option>
                    <option value="EXECUTION">Реализация</option>
                    <option value="MONITORING">Контроль</option>
                    <option value="CLOSING">Завершение</option>
                    <option value="ON_HOLD">Приостановлен</option>
                    <option value="ARCHIVED">В архиве</option>
                  </select>
                </div>
              </div>

              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="block text-slate-400 mb-1 font-semibold">Плановый старт</label>
                  <input
                    type="date"
                    required
                    value={startDate}
                    onChange={(e) => setStartDate(e.target.value)}
                    className="w-full px-3 py-2 bg-slate-800 border border-slate-700 rounded-lg text-slate-200 font-mono"
                  />
                </div>
                <div>
                  <label className="block text-slate-400 mb-1 font-semibold">Плановый финиш</label>
                  <input
                    type="date"
                    required
                    value={finishDate}
                    onChange={(e) => setFinishDate(e.target.value)}
                    className="w-full px-3 py-2 bg-slate-800 border border-slate-700 rounded-lg text-slate-200 font-mono"
                  />
                </div>
              </div>

              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="block text-slate-400 mb-1 font-semibold">Бюджет CAPEX (руб)</label>
                  <input
                    type="number"
                    value={budget}
                    onChange={(e) => setBudget(Number(e.target.value))}
                    className="w-full px-3 py-2 bg-slate-800 border border-slate-700 rounded-lg text-emerald-400 font-mono font-bold"
                  />
                </div>
                <div>
                  <label className="block text-slate-400 mb-1 font-semibold">Локация / Площадка</label>
                  <input
                    type="text"
                    value={location}
                    onChange={(e) => setLocation(e.target.value)}
                    className="w-full px-3 py-2 bg-slate-800 border border-slate-700 rounded-lg text-slate-200"
                    placeholder="Цех ДСП, Линия 1"
                  />
                </div>
              </div>

              <div className="p-3 bg-slate-950/60 rounded-xl border border-slate-800 space-y-3">
                <span className="text-[11px] font-bold text-purple-400 uppercase tracking-wider block">Проектный RACI</span>
                <div className="grid grid-cols-3 gap-2">
                  <div>
                    <label className="block text-[10px] text-slate-400 mb-1">РП (A) - Руководитель</label>
                    <input
                      type="text"
                      value={pm}
                      onChange={(e) => setPm(e.target.value)}
                      className="w-full px-2.5 py-1.5 bg-slate-800 border border-slate-700 rounded text-slate-200 text-xs"
                    />
                  </div>
                  <div>
                    <label className="block text-[10px] text-slate-400 mb-1">ГИП (R) - Главный инженер</label>
                    <input
                      type="text"
                      value={gip}
                      onChange={(e) => setGip(e.target.value)}
                      className="w-full px-2.5 py-1.5 bg-slate-800 border border-slate-700 rounded text-slate-200 text-xs"
                    />
                  </div>
                  <div>
                    <label className="block text-[10px] text-slate-400 mb-1">Спонсор / Куратор (I)</label>
                    <input
                      type="text"
                      value={sponsor}
                      onChange={(e) => setSponsor(e.target.value)}
                      className="w-full px-2.5 py-1.5 bg-slate-800 border border-slate-700 rounded text-slate-200 text-xs"
                    />
                  </div>
                </div>
              </div>

              <div>
                <label className="block text-slate-400 mb-1 font-semibold">Резюме проекта (Описание)</label>
                <textarea
                  rows={2}
                  value={description}
                  onChange={(e) => setDescription(e.target.value)}
                  className="w-full px-3 py-2 bg-slate-800 border border-slate-700 rounded-lg text-slate-200 text-xs"
                />
              </div>

              <div className="pt-3 border-t border-slate-800 flex justify-end gap-2">
                <button
                  type="button"
                  onClick={() => setIsEditOpen(false)}
                  className="px-4 py-2 bg-slate-800 hover:bg-slate-700 text-slate-300 rounded-lg font-semibold"
                >
                  Отмена
                </button>
                <button
                  type="submit"
                  disabled={isSaving}
                  className="flex items-center gap-1.5 px-5 py-2 bg-cyan-600 hover:bg-cyan-500 text-white rounded-lg font-bold shadow-lg shadow-cyan-950 transition-colors"
                >
                  <Save className="w-3.5 h-3.5" />
                  <span>{isSaving ? "Сохранение..." : "Сохранить изменения"}</span>
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* Модальное окно защищенного удаления проекта */}
      {isDeleteOpen && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-slate-950/80 backdrop-blur-sm animate-fadeIn">
          <div className="bg-slate-900 border border-rose-900/60 rounded-2xl w-full max-w-md shadow-2xl shadow-rose-950/40 overflow-hidden flex flex-col">
            <div className="p-5 border-b border-rose-950/80 bg-rose-950/20 flex items-center justify-between">
              <div className="flex items-center gap-3">
                <div className="w-9 h-9 rounded-xl bg-rose-500/20 border border-rose-500/30 flex items-center justify-center text-rose-400">
                  <KeyRound className="w-5 h-5" />
                </div>
                <div>
                  <h3 className="text-base font-bold text-rose-300">Удаление проекта [{project.code}]</h3>
                  <p className="text-xs text-rose-400/70">Защищенная административная операция</p>
                </div>
              </div>
              <button onClick={() => setIsDeleteOpen(false)} className="p-1.5 text-slate-400 hover:text-white rounded-lg hover:bg-slate-800">
                <X className="w-4 h-4" />
              </button>
            </div>

            <form onSubmit={handleDeleteSubmit} className="p-5 space-y-4 text-xs">
              <div className="p-3 rounded-lg bg-rose-950/30 border border-rose-900/50 text-rose-300 space-y-1">
                <p className="font-bold flex items-center gap-1.5 text-[11px]">
                  <ShieldAlert className="w-4 h-4 text-rose-400" />
                  Внимание: операция необратима!
                </p>
                <p className="text-[11px] text-slate-400 leading-relaxed">
                  Проект «{project.name}» будет безвозвратно удален из базы вместе со всеми своими этапами, сетевым графом CPM и журналом работ.
                </p>
              </div>

              <div>
                <label className="block text-slate-300 font-semibold mb-1">
                  Введите мастер-пароль сервера
                </label>
                <input
                  type="password"
                  required
                  autoFocus
                  value={deletePasscode}
                  onChange={(e) => setDeletePasscode(e.target.value)}
                  placeholder="••••••••••••••••••••"
                  className="w-full px-3 py-2 bg-slate-950 border border-rose-900/60 rounded-lg text-rose-200 font-mono text-sm focus:outline-none focus:border-rose-500 tracking-wider"
                />
              </div>

              {deleteError && (
                <div className="p-2.5 rounded-lg bg-rose-500/10 border border-rose-500/30 text-rose-400 text-xs font-medium">
                  {deleteError}
                </div>
              )}

              <div className="pt-2 border-t border-slate-800 flex justify-end gap-2">
                <button
                  type="button"
                  onClick={() => setIsDeleteOpen(false)}
                  className="px-4 py-2 bg-slate-800 hover:bg-slate-700 text-slate-300 rounded-lg font-semibold"
                >
                  Отмена
                </button>
                <button
                  type="submit"
                  disabled={isDeleting || !deletePasscode}
                  className="px-4 py-2 bg-rose-600 hover:bg-rose-500 text-white rounded-lg font-bold shadow-lg shadow-rose-950 transition-colors disabled:opacity-40"
                >
                  {isDeleting ? "Проверка..." : "Подтвердить удаление"}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}
    </div>
  );
};
