import React, { useState, useEffect, useMemo } from "react";
import {
  BookOpen,
  Plus,
  Search,
  Filter,
  Download,
  Trash2,
  Pencil,
  CheckCircle2,
  AlertTriangle,
  AlertOctagon,
  ExternalLink,
  X,
  RefreshCw,
  Layers,
} from "lucide-react";
import { DiaryEntry, ProjectPassport } from "../../types";
import { diaryApi } from "../../services/api";

interface ProductionDiaryViewProps {
  currentProject: ProjectPassport | null;
  projects: ProjectPassport[];
}

export const ProductionDiaryView: React.FC<ProductionDiaryViewProps> = ({
  currentProject,
  projects,
}) => {
  const [entries, setEntries] = useState<DiaryEntry[]>([]);
  const [loading, setLoading] = useState(true);

  // Фильтры
  const [selectedProjId, setSelectedProjId] = useState<string>(
    currentProject?.id || "ALL",
  );
  const [filterCategory, setFilterCategory] = useState<string>("ALL");
  const [filterSection, setFilterSection] = useState<string>("ALL");
  const [filterStatus, setFilterStatus] = useState<string>("ALL");
  const [searchQuery, setSearchQuery] = useState<string>("");

  // Модалка создания записи
  const [isCreateOpen, setIsCreateOpen] = useState(false);
  const [formProjectId, setFormProjectId] = useState<string>(
    () => currentProject?.id || (projects[0]?.id || "")
  );
  const [formCategory, setFormCategory] = useState<"A" | "B" | "C">("B");
  const [formWbs, setFormWbs] = useState("1.2");
  const [formDate, setFormDate] = useState(new Date().toISOString().split("T")[0]);
  const [formSection, setFormSection] = useState("Станок Haotian");
  const [formTask, setFormTask] = useState("");
  const [formSolution, setFormSolution] = useState("");
  const [formPhysical, setFormPhysical] = useState("");
  const [formPurpose, setFormPurpose] = useState("");
  const [formAssignee, setFormAssignee] = useState(currentProject?.raci_matrix?.pm || "Климов А.Н.");
  const [formDeadline, setFormDeadline] = useState("до 15.09.2026");
  const [formStatus, setFormStatus] = useState("В работе");
  const [formSource, setFormSource] = useState("Оперативка");
  const [isSubmitting, setIsSubmitting] = useState(false);

  // Загрузка записей
  const loadEntries = async () => {
    try {
      setLoading(true);
      const params: any = {};
      if (selectedProjId !== "ALL") params.project_id = selectedProjId;
      if (filterCategory !== "ALL") params.category = filterCategory;
      if (filterSection !== "ALL") params.line_section = filterSection;
      if (filterStatus !== "ALL") params.status = filterStatus;
      if (searchQuery.trim()) params.search = searchQuery.trim();

      const data = await diaryApi.listEntries(params);
      setEntries(data);
    } catch (err) {
      console.error("Ошибка загрузки записей дневника:", err);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    loadEntries();
  }, [selectedProjId, filterCategory, filterSection, filterStatus, searchQuery]);

  // Список доступных участков линии
  const availableSections = useMemo(() => {
    const set = new Set<string>();
    entries.forEach((e) => {
      if (e.line_section) set.add(e.line_section);
    });
    ["Буферный склад", "Кромкооблицовка IMA", "Станок Haotian", "Перекладчик 1", "Система аспирации"].forEach((s) => set.add(s));
    return Array.from(set).sort();
  }, [entries]);

  // Удаление записи
  const handleDeleteEntry = async (id?: string) => {
    if (!id || !window.confirm("Удалить эту запись из журнала производства работ?")) return;
    try {
      await diaryApi.deleteEntry(id);
      setEntries((prev) => prev.filter((e) => e.id !== id));
    } catch (err: any) {
      alert(err.response?.data?.detail || "Ошибка при удалении записи");
    }
  };

  // Создание новой записи с явной привязкой к выбранному проекту
  const handleCreateSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!formTask.trim()) return;

    try {
      setIsSubmitting(true);
      const targetProjId = formProjectId || (selectedProjId !== "ALL" ? selectedProjId : (currentProject?.id || projects[0]?.id));
      if (!targetProjId) return;

      const created = await diaryApi.createEntry(targetProjId, {
        category: formCategory,
        wbs_affected: formWbs.trim(),
        entry_date: formDate,
        line_section: formSection.trim(),
        content: formTask.trim(),
        solution: formSolution.trim(),
        physical_action: formPhysical.trim(),
        purpose: formPurpose.trim(),
        author_name: formAssignee.trim(),
        deadline_str: formDeadline.trim(),
        status: formStatus,
        source: formSource.trim(),
      });

      setEntries((prev) => [created, ...prev]);
      setIsCreateOpen(false);
      setFormTask("");
      setFormSolution("");
      setFormPhysical("");
      setFormPurpose("");
    } catch (err: any) {
      alert(err.response?.data?.detail || "Ошибка создания записи");
    } finally {
      setIsSubmitting(false);
    }
  };

  // Экспорт в CSV с защитой от инъекций формул (CWE-1236)
  const sanitize = (val: any) => {
    if (val === null || val === undefined) return '""';
    const s = String(val).trim();
    const clean = /^[=+\-@\t\r]/.test(s) ? `'${s}` : s;
    return `"${clean.replace(/"/g, '""')}"`;
  };

  const handleExportCSV = () => {
    const headers = [
      "Проект",
      "Категория",
      "WBS влияние",
      "Дата",
      "Участок линии",
      "Задача",
      "Решение",
      "Физически что сделать",
      "Зачем все это?",
      "Ответственный",
      "Сроки выполнения",
      "Статус",
      "Источник",
    ];
    const rows = entries.map((e) => [
      sanitize(e.category),
      sanitize(e.wbs_affected),
      sanitize(e.entry_date),
      sanitize(e.line_section),
      sanitize(e.content),
      sanitize(e.solution),
      sanitize(e.physical_action),
      sanitize(e.purpose),
      sanitize(e.author_name),
      sanitize(e.deadline_str),
      sanitize(e.status),
      sanitize(e.source),
    ]);

    const csvContent = "\uFEFF" + [headers.join(";"), ...rows.map((r) => r.join(";"))].join("\r\n");
    const blob = new Blob([csvContent], { type: "text/csv;charset=utf-8;" });
    const url = URL.createObjectURL(blob);
    const link = document.createElement("a");
    link.href = url;
    link.download = `Production_Diary_${new Date().toISOString().split("T")[0]}.csv`;
    link.click();
    URL.revokeObjectURL(url);
  };

  return (
    <div className="w-full space-y-4 select-none">
      {/* Панель фильтров и статистики журнала */}
      <div className="bg-slate-900 border border-slate-800 rounded-xl p-3.5 shadow-xl space-y-3">
        <div className="flex flex-wrap items-center justify-between gap-3">
          <div className="flex items-center gap-3">
            <div className="w-9 h-9 rounded-xl bg-cyan-600/20 border border-cyan-500/30 flex items-center justify-center text-cyan-400">
              <BookOpen className="w-5 h-5" />
            </div>
            <div>
              <h2 className="text-sm font-bold text-slate-100 uppercase tracking-wider flex items-center gap-2">
                <span>Дневник производства работ</span>
                <span className="text-xs font-mono text-cyan-400">({entries.length} записей)</span>
              </h2>
              <p className="text-[11px] text-slate-400">
                Журнал инцидентов, дефектовки, участков линии и контроля решений (11 колонок)
              </p>
            </div>
          </div>

          <div className="flex items-center gap-2">
            <button
              onClick={handleExportCSV}
              className="flex items-center gap-1 px-3 py-1.5 rounded-lg bg-slate-800 hover:bg-slate-700 text-slate-300 text-xs font-semibold border border-slate-700 transition-colors"
              title="Экспорт таблицы журнала в CSV/Excel"
            >
              <Download className="w-3.5 h-3.5 text-cyan-400" />
              <span>Экспорт CSV</span>
            </button>

            <button
              onClick={() => setIsCreateOpen(true)}
              className="flex items-center gap-1.5 px-3.5 py-1.5 rounded-lg bg-cyan-600 hover:bg-cyan-500 text-white text-xs font-bold shadow-md shadow-cyan-950 transition-colors"
            >
              <Plus className="w-4 h-4" />
              <span>Добавить запись</span>
            </button>
          </div>
        </div>

        {/* Сетка быстрых фильтров */}
        <div className="grid grid-cols-2 sm:grid-cols-5 gap-2 pt-2 border-t border-slate-800 text-xs">
          {/* 1. Проект */}
          <div>
            <select
              value={selectedProjId}
              onChange={(e) => setSelectedProjId(e.target.value)}
              className="w-full px-2.5 py-1.5 bg-slate-800 border border-slate-700 rounded-lg text-slate-200 text-xs font-semibold"
            >
              <option value="ALL">🌐 Проект: Все</option>
              {projects.map((p) => (
                <option key={p.id} value={p.id}>
                  [{p.code}] {p.name.slice(0, 24)}...
                </option>
              ))}
            </select>
          </div>

          {/* 2. Категория A / B / C */}
          <div>
            <select
              value={filterCategory}
              onChange={(e) => setFilterCategory(e.target.value)}
              className={`w-full px-2.5 py-1.5 bg-slate-800 border rounded-lg text-xs font-bold ${
                filterCategory === "C"
                  ? "text-rose-400 border-rose-800 bg-rose-950/40"
                  : filterCategory === "B"
                  ? "text-amber-400 border-amber-800 bg-amber-950/40"
                  : filterCategory === "A"
                  ? "text-emerald-400 border-emerald-800 bg-emerald-950/40"
                  : "text-slate-300 border-slate-700"
              }`}
            >
              <option value="ALL">Категория: Все (A/B/C)</option>
              <option value="A">🟢 Категория A (План)</option>
              <option value="B">🟡 Категория B (Внимание / Риск)</option>
              <option value="C">🔴 Категория C (Авария / Срыв)</option>
            </select>
          </div>

          {/* 3. Участок линии */}
          <div>
            <select
              value={filterSection}
              onChange={(e) => setFilterSection(e.target.value)}
              className="w-full px-2.5 py-1.5 bg-slate-800 border border-slate-700 rounded-lg text-slate-200 text-xs truncate font-medium"
            >
              <option value="ALL">Участок: Все участки</option>
              {availableSections.map((sec) => (
                <option key={sec} value={sec}>
                  {sec}
                </option>
              ))}
            </select>
          </div>

          {/* 4. Статус */}
          <div>
            <select
              value={filterStatus}
              onChange={(e) => setFilterStatus(e.target.value)}
              className="w-full px-2.5 py-1.5 bg-slate-800 border border-slate-700 rounded-lg text-slate-200 text-xs font-medium"
            >
              <option value="ALL">Статус: Все</option>
              <option value="В работе">В работе</option>
              <option value="Завершено">Завершено</option>
              <option value="Отклонение">Отклонение</option>
              <option value="На проверке">На проверке</option>
            </select>
          </div>

          {/* 5. Поиск */}
          <div className="relative col-span-2 sm:col-span-1">
            <input
              type="text"
              placeholder="Поиск по задаче и решению..."
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
              className="w-full px-2.5 py-1.5 pl-7 bg-slate-800 border border-slate-700 rounded-lg text-slate-200 text-xs placeholder-slate-500 focus:outline-none focus:border-cyan-500"
            />
            <Search className="w-3.5 h-3.5 text-slate-500 absolute left-2 top-2" />
          </div>
        </div>
      </div>

      {/* Таблица цехового дневника (адаптивная ширина на весь экран) */}
      <div className="bg-slate-900 border border-slate-800 rounded-xl overflow-hidden shadow-2xl">
        <div className="w-full overflow-x-auto">
          <table className="w-full text-left text-xs border-collapse font-sans table-auto">
            <thead className="bg-slate-850 text-slate-400 uppercase text-[10px] font-semibold border-b border-slate-700 select-none">
              <tr>
                <th className="px-2 py-2.5 text-center w-12">Проект</th>
                <th className="px-1.5 py-2.5 text-center w-10">Кат.</th>
                <th className="px-2 py-2.5 text-center w-12">WBS</th>
                <th className="px-2 py-2.5 w-20 whitespace-nowrap">Дата</th>
                <th className="px-2 py-2.5 w-28 whitespace-nowrap">Участок линии</th>
                <th className="px-2.5 py-2.5 min-w-[130px]">Задача</th>
                <th className="px-2.5 py-2.5 min-w-[130px]">Решение</th>
                <th className="px-2.5 py-2.5 min-w-[130px]">Физически что сделать</th>
                <th className="px-2.5 py-2.5 min-w-[120px]">Зачем все это?</th>
                <th className="px-2 py-2.5 w-24 whitespace-nowrap">Ответственный</th>
                <th className="px-2 py-2.5 w-20 whitespace-nowrap">Срок</th>
                <th className="px-2 py-2.5 text-center w-20 whitespace-nowrap">Статус</th>
                <th className="px-2 py-2.5 text-center w-24 whitespace-nowrap">Pyrus</th>
                <th className="px-1 py-2.5 text-center w-8">✕</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-800/80 text-[11px]">
              {loading ? (
                <tr>
                  <td colSpan={12} className="p-8 text-center text-slate-400">
                    <RefreshCw className="w-6 h-6 animate-spin mx-auto mb-2 text-cyan-500" />
                    <span>Загрузка данных журнала...</span>
                  </td>
                </tr>
              ) : entries.length === 0 ? (
                <tr>
                  <td colSpan={12} className="p-8 text-center text-slate-500 italic">
                    Записей не найдено по заданным фильтрам
                  </td>
                </tr>
              ) : (
                entries.map((entry) => {
                  const catClass =
                    entry.category === "C"
                      ? "bg-rose-950 text-rose-300 border border-rose-800 font-extrabold"
                      : entry.category === "A"
                      ? "bg-emerald-950 text-emerald-300 border border-emerald-800 font-bold"
                      : "bg-amber-950 text-amber-300 border border-amber-800 font-bold";

                  const statusClass =
                    entry.status === "Завершено"
                      ? "text-emerald-400 font-bold"
                      : entry.status === "Отклонение"
                      ? "text-rose-400 font-bold"
                      : "text-cyan-400 font-medium";

                  const projCode = projects.find((p) => p.id === entry.project_id)?.code || "—";

                  return (
                    <tr key={entry.id} className="hover:bg-slate-800/40 transition-colors">
                      {/* 0. Проект */}
                      <td className="px-2 py-2 text-center whitespace-nowrap">
                        <span className="px-1.5 py-0.5 rounded font-mono font-bold text-[9px] bg-slate-800 text-cyan-300 border border-slate-700">
                          {projCode}
                        </span>
                      </td>

                      {/* 1. Категория A/B/C */}
                      <td className="px-1.5 py-2 text-center whitespace-nowrap">
                        <span className={`px-1.5 py-0.5 rounded text-[9px] ${catClass}`}>
                          {entry.category || "B"}
                        </span>
                      </td>

                      {/* 2. WBS влияние */}
                      <td className="px-2 py-2 text-center font-mono text-cyan-400 font-bold whitespace-nowrap">
                        {entry.wbs_affected || "—"}
                      </td>

                      {/* 3. Дата */}
                      <td className="px-2 py-2 font-mono text-slate-300 whitespace-nowrap text-[10px]">
                        {entry.entry_date}
                      </td>

                      {/* 4. Участок линии */}
                      <td className="px-2 py-2 font-semibold text-slate-200 whitespace-nowrap text-[11px]">
                        {entry.line_section || "—"}
                      </td>

                      {/* 5. Задача */}
                      <td className="px-2.5 py-2 text-slate-100 font-medium leading-snug">
                        {entry.content}
                      </td>

                      {/* 6. Решение */}
                      <td className="px-2.5 py-2 text-slate-300 leading-snug">
                        {entry.solution || "—"}
                      </td>

                      {/* 7. Физически что сделать */}
                      <td className="px-2.5 py-2 text-slate-400 leading-snug">
                        {entry.physical_action || "—"}
                      </td>

                      {/* 8. Зачем все это? */}
                      <td className="px-2.5 py-2 text-purple-300/90 italic leading-snug">
                        {entry.purpose || "—"}
                      </td>

                      {/* 9. Ответственный */}
                      <td className="px-2 py-2 text-slate-200 font-medium whitespace-nowrap">
                        {entry.author_name}
                      </td>

                      {/* 10. Срок */}
                      <td className="px-2 py-2 font-mono text-slate-300 whitespace-nowrap text-[10px]">
                        {entry.deadline_str || "—"}
                      </td>

                      {/* 11. Статус */}
                      <td className="px-2 py-2 text-center whitespace-nowrap select-none">
                        <span className={statusClass}>{entry.status || "В работе"}</span>
                      </td>

                      {/* 12. Pyrus / Источник */}
                      <td className="px-2 py-2 text-center whitespace-nowrap">
                        {entry.source && entry.source.includes("pyrus.com") ? (
                          <a
                            href={entry.source}
                            target="_blank"
                            rel="noopener noreferrer"
                            className="inline-flex items-center gap-1 px-2 py-0.5 rounded bg-purple-950/80 hover:bg-purple-900 border border-purple-700/80 text-purple-200 font-bold text-[10px] transition-colors"
                            title={entry.source}
                          >
                            <span>#{entry.source.split('#id').pop() || entry.source.split('#').pop() || 'Pyrus'}</span>
                            <ExternalLink className="w-2.5 h-2.5" />
                          </a>
                        ) : (
                          <span className="text-slate-500 font-mono text-[10px]">{entry.source || "—"}</span>
                        )}
                      </td>

                      {/* Удаление */}
                      <td className="px-1 py-2 text-center">
                        <button
                          onClick={() => handleDeleteEntry(entry.id)}
                          className="p-1 text-slate-500 hover:text-rose-400 rounded transition-colors"
                          title="Удалить запись"
                        >
                          <Trash2 className="w-3.5 h-3.5" />
                        </button>
                      </td>
                    </tr>
                  );
                })
              )}
            </tbody>
          </table>
        </div>
      </div>

      {/* Модальное окно создания новой записи (11 колонок) */}
      {isCreateOpen && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-slate-950/80 backdrop-blur-sm animate-fadeIn">
          <div className="bg-slate-900 border border-slate-700 rounded-2xl w-full max-w-2xl shadow-2xl overflow-hidden flex flex-col max-h-[90vh]">
            <div className="p-4 border-b border-slate-800 flex items-center justify-between bg-slate-850">
              <div className="flex items-center gap-2.5">
                <div className="w-8 h-8 rounded-xl bg-cyan-600/20 border border-cyan-500/30 flex items-center justify-center text-cyan-400">
                  <BookOpen className="w-4 h-4" />
                </div>
                <div>
                  <h3 className="text-sm font-bold text-slate-100">Новая запись в Дневник производства работ</h3>
                  <p className="text-[11px] text-slate-400">Внесение по регламенту 11 колонок (Фото 1)</p>
                </div>
              </div>
              <button
                onClick={() => setIsCreateOpen(false)}
                className="p-1 text-slate-400 hover:text-white rounded-lg hover:bg-slate-800"
              >
                <X className="w-4 h-4" />
              </button>
            </div>

            <form onSubmit={handleCreateSubmit} className="p-5 space-y-3.5 text-xs overflow-y-auto">
              <div className="grid grid-cols-5 gap-2.5">
                <div>
                  <label className="block text-slate-400 mb-1 font-semibold">Проект</label>
                  <select
                    value={formProjectId}
                    onChange={(e) => {
                      setFormProjectId(e.target.value);
                      const p = projects.find((proj) => proj.id === e.target.value);
                      if (p?.raci_matrix?.pm) setFormAssignee(p.raci_matrix.pm);
                    }}
                    className="w-full px-2.5 py-1.5 bg-slate-800 border border-slate-700 rounded-lg text-cyan-300 font-bold"
                  >
                    {projects.map((p) => (
                      <option key={p.id} value={p.id}>
                        [{p.code}] {p.name.slice(0, 18)}...
                      </option>
                    ))}
                  </select>
                </div>

                <div>
                  <label className="block text-slate-400 mb-1 font-semibold">Категория</label>
                  <select
                    value={formCategory}
                    onChange={(e) => setFormCategory(e.target.value as any)}
                    className="w-full px-2.5 py-1.5 bg-slate-800 border border-slate-700 rounded-lg text-slate-200 font-bold"
                  >
                    <option value="A">A — План (Зелёная)</option>
                    <option value="B">B — Внимание / Риск (Жёлтая)</option>
                    <option value="C">C — Авария / Сбой (Красная)</option>
                  </select>
                </div>

                <div>
                  <label className="block text-slate-400 mb-1 font-semibold">Влияние (WBS)</label>
                  <input
                    type="text"
                    value={formWbs}
                    onChange={(e) => setFormWbs(e.target.value)}
                    placeholder="1.2"
                    className="w-full px-2.5 py-1.5 bg-slate-800 border border-slate-700 rounded-lg text-cyan-300 font-mono font-bold"
                  />
                </div>

                <div>
                  <label className="block text-slate-400 mb-1 font-semibold">Дата</label>
                  <input
                    type="date"
                    value={formDate}
                    onChange={(e) => setFormDate(e.target.value)}
                    className="w-full px-2.5 py-1.5 bg-slate-800 border border-slate-700 rounded-lg text-slate-200 font-mono"
                  />
                </div>

                <div>
                  <label className="block text-slate-400 mb-1 font-semibold">Участок линии</label>
                  <input
                    type="text"
                    required
                    value={formSection}
                    onChange={(e) => setFormSection(e.target.value)}
                    placeholder="Буферный склад"
                    className="w-full px-2.5 py-1.5 bg-slate-800 border border-slate-700 rounded-lg text-slate-200 font-medium"
                  />
                </div>
              </div>

              <div>
                <label className="block text-slate-400 mb-1 font-semibold">Задача (суть инцидента или работы)</label>
                <textarea
                  rows={2}
                  required
                  value={formTask}
                  onChange={(e) => setFormTask(e.target.value)}
                  placeholder="Брак геометрии станины и биение шпинделя..."
                  className="w-full px-3 py-1.5 bg-slate-800 border border-slate-700 rounded-lg text-slate-100 font-medium"
                />
              </div>

              <div className="grid grid-cols-2 gap-2.5">
                <div>
                  <label className="block text-slate-400 mb-1 font-semibold">Решение (инженерный план)</label>
                  <textarea
                    rows={2}
                    value={formSolution}
                    onChange={(e) => setFormSolution(e.target.value)}
                    placeholder="Вызвать сервис-инженера представительства, юстировка..."
                    className="w-full px-3 py-1.5 bg-slate-800 border border-slate-700 rounded-lg text-slate-200"
                  />
                </div>
                <div>
                  <label className="block text-slate-400 mb-1 font-semibold">Физически что сделать на объекте</label>
                  <textarea
                    rows={2}
                    value={formPhysical}
                    onChange={(e) => setFormPhysical(e.target.value)}
                    placeholder="Демонтировать защитный кожух, установить индикатор ИЧ-10..."
                    className="w-full px-3 py-1.5 bg-slate-800 border border-slate-700 rounded-lg text-slate-200"
                  />
                </div>
              </div>

              <div>
                <label className="block text-slate-400 mb-1 font-semibold">Зачем все это? (Целеполагание и обоснование)</label>
                <input
                  type="text"
                  value={formPurpose}
                  onChange={(e) => setFormPurpose(e.target.value)}
                  placeholder="Исключить сколы кромки 2мм на фасадных деталях..."
                  className="w-full px-3 py-1.5 bg-slate-800 border border-slate-700 rounded-lg text-purple-300 font-medium"
                />
              </div>

              <div className="grid grid-cols-4 gap-2.5">
                <div>
                  <label className="block text-slate-400 mb-1 font-semibold">Ответственный</label>
                  <input
                    type="text"
                    required
                    value={formAssignee}
                    onChange={(e) => setFormAssignee(e.target.value)}
                    className="w-full px-2.5 py-1.5 bg-slate-800 border border-slate-700 rounded-lg text-slate-200"
                  />
                </div>
                <div>
                  <label className="block text-slate-400 mb-1 font-semibold">Сроки выполнения</label>
                  <input
                    type="text"
                    value={formDeadline}
                    onChange={(e) => setFormDeadline(e.target.value)}
                    className="w-full px-2.5 py-1.5 bg-slate-800 border border-slate-700 rounded-lg text-slate-200 font-mono"
                  />
                </div>
                <div>
                  <label className="block text-slate-400 mb-1 font-semibold">Статус</label>
                  <select
                    value={formStatus}
                    onChange={(e) => setFormStatus(e.target.value)}
                    className="w-full px-2.5 py-1.5 bg-slate-800 border border-slate-700 rounded-lg text-slate-200 font-medium"
                  >
                    <option value="В работе">В работе</option>
                    <option value="Завершено">Завершено</option>
                    <option value="Отклонение">Отклонение</option>
                    <option value="На проверке">На проверке</option>
                  </select>
                </div>
                <div>
                  <label className="block text-slate-400 mb-1 font-semibold">Источник</label>
                  <input
                    type="text"
                    value={formSource}
                    onChange={(e) => setFormSource(e.target.value)}
                    placeholder="Pyrus / Оперативка"
                    className="w-full px-2.5 py-1.5 bg-slate-800 border border-slate-700 rounded-lg text-slate-200"
                  />
                </div>
              </div>

              <div className="pt-3 border-t border-slate-800 flex justify-end gap-2">
                <button
                  type="button"
                  onClick={() => setIsCreateOpen(false)}
                  className="px-4 py-1.5 bg-slate-800 hover:bg-slate-700 text-slate-300 rounded-lg font-semibold"
                >
                  Отмена
                </button>
                <button
                  type="submit"
                  disabled={isSubmitting}
                  className="px-5 py-1.5 bg-cyan-600 hover:bg-cyan-500 text-white rounded-lg font-bold shadow-md shadow-cyan-950 transition-colors disabled:opacity-50"
                >
                  {isSubmitting ? "Сохранение..." : "Сохранить запись"}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}
    </div>
  );
};
