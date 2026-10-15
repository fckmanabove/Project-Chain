import React, { useState, useEffect } from "react";
import { BookOpen, Plus, Pencil, Trash2, X } from "lucide-react";

interface PatchItem {
  id: string;
  version: string;
  objectType: string;
  priority: "Критический" | "Значимый" | "Интерфейс";
  autoFix: boolean;
  description: string;
}

interface ObjectTypeItem {
  id: string;
  code: string;
  purpose: string;
  checkMethod: string;
  exampleArea: string;
}

const defaultPatchesList: PatchItem[] = [
  { id: "GANT-001", version: "1.0.1", objectType: "FORMULA_COLUMN", priority: "Критический", autoFix: false, description: "Формула статуса в столбце P (R1C1 непрерывность по всем строкам таблицы Гант)" },
  { id: "GANT-002", version: "1.0.1", objectType: "CONDITIONAL_FORMAT", priority: "Значимый", autoFix: true, description: "Оранжевая заливка RGB(255, 192, 0) для статусов «ЗАКРОЙЭТАП» и «УКАЖИДАТУ»" },
  { id: "GANT-003", version: "1.0.1", objectType: "CONDITIONAL_FORMAT", priority: "Критический", autoFix: true, description: "Ярко-красная заливка RGB(255, 0, 0) для аварийного статуса «ОТКЛОНЕНИЕ»" },
  { id: "GANT-004", version: "1.0.1", objectType: "FORMULA_COLUMN", priority: "Значимый", autoFix: true, description: "Формула фактической длительности в столбце N таблицы Гант" },
  { id: "GANT-UI-001", version: "1.0.1", objectType: "VBA_MODULE", priority: "Интерфейс", autoFix: true, description: "Контролы календаря: 3 OptionButton (C1) + 1 Spinner (D1, шаг 7) со свойством xlFreeFloating" },
];

const defaultObjectTypesList: ObjectTypeItem[] = [
  { id: "FORMULA_COLUMN", code: "FORMULA_COLUMN", purpose: "Формула во всех строках столбца умной таблицы", checkMethod: "Сравнение формулы столбца таблицы (R1C1 непрерывность)", exampleArea: "Столбец N, Столбец P" },
  { id: "CONDITIONAL_FORMAT", code: "CONDITIONAL_FORMAT", purpose: "Правило условного форматирования ячеек", checkMethod: "Проверка правил FormatConditions (цвета, заливки, формулы)", exampleArea: "Столбец P" },
  { id: "DATA_VALIDATION", code: "DATA_VALIDATION", purpose: "Проверка данных / выпадающий список ячейки", checkMethod: "Проверка списка допустимых значений (xlValidateList)", exampleArea: "Столбец Q" },
  { id: "TABLE_STRUCTURE", code: "TABLE_STRUCTURE", purpose: "Наличие умной таблицы или обязательных столбцов", checkMethod: "Проверка наличия ListObject и названий заголовков", exampleArea: "Таблица Гант" },
  { id: "NAMED_RANGE", code: "NAMED_RANGE", purpose: "Наличие и адрес именованного диапазона книги", checkMethod: "Проверка именованного диапазона Names(xxx)", exampleArea: "ProjectVersion, RootProjectsPath" },
  { id: "CELL_VALUE", code: "CELL_VALUE", purpose: "Фиксированное значение в ячейке шаблона", checkMethod: "Проверка точного скалярного значения ячейки", exampleArea: "B5, Настройки!E14" },
  { id: "VBA_MODULE", code: "VBA_MODULE", purpose: "Наличие и версия программного VBA модуля", checkMethod: "Анализ компонентов VBProject.VBComponents", exampleArea: "Module1, M_PortfolioRefreshMVP" },
];

export const ReferenceCatalogView: React.FC = () => {
  // Стейт патчей
  const [patches, setPatches] = useState<PatchItem[]>(() => {
    if (typeof window === "undefined") return defaultPatchesList;
    try {
      const saved = localStorage.getItem("prochain_patches_v1");
      return saved ? JSON.parse(saved) : defaultPatchesList;
    } catch {
      return defaultPatchesList;
    }
  });

  useEffect(() => {
    try {
      localStorage.setItem("prochain_patches_v1", JSON.stringify(patches));
    } catch {}
  }, [patches]);

  const [isPatchModalOpen, setIsPatchModalOpen] = useState(false);
  const [editingPatchId, setEditingPatchId] = useState<string | null>(null);
  const [formPatchId, setFormPatchId] = useState("");
  const [formPatchVersion, setFormPatchVersion] = useState("1.0.1");
  const [formPatchObjectType, setFormPatchObjectType] = useState("FORMULA_COLUMN");
  const [formPatchPriority, setFormPatchPriority] = useState<"Критический" | "Значимый" | "Интерфейс">("Критический");
  const [formPatchAutoFix, setFormPatchAutoFix] = useState(false);
  const [formPatchDesc, setFormPatchDesc] = useState("");

  const openCreatePatchModal = () => {
    setEditingPatchId(null);
    setFormPatchId(`GANT-00${patches.length + 1}`);
    setFormPatchVersion("1.0.1");
    setFormPatchObjectType("FORMULA_COLUMN");
    setFormPatchPriority("Значимый");
    setFormPatchAutoFix(true);
    setFormPatchDesc("");
    setIsPatchModalOpen(true);
  };

  const openEditPatchModal = (p: PatchItem) => {
    setEditingPatchId(p.id);
    setFormPatchId(p.id);
    setFormPatchVersion(p.version);
    setFormPatchObjectType(p.objectType);
    setFormPatchPriority(p.priority);
    setFormPatchAutoFix(p.autoFix);
    setFormPatchDesc(p.description);
    setIsPatchModalOpen(true);
  };

  const handleSavePatchSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    if (!formPatchId.trim()) return;
    const item: PatchItem = {
      id: formPatchId.trim(),
      version: formPatchVersion.trim() || "1.0.1",
      objectType: formPatchObjectType,
      priority: formPatchPriority,
      autoFix: formPatchAutoFix,
      description: formPatchDesc.trim(),
    };
    if (editingPatchId) {
      setPatches((prev) => prev.map((p) => (p.id === editingPatchId ? item : p)));
    } else {
      setPatches((prev) => [...prev, item]);
    }
    setIsPatchModalOpen(false);
  };

  const handleDeletePatch = (id: string) => {
    if (window.confirm(`Удалить патч [${id}] из каталога стандартов?`)) {
      setPatches((prev) => prev.filter((p) => p.id !== id));
    }
  };

  // Стейт типов объектов
  const [objectTypes, setObjectTypes] = useState<ObjectTypeItem[]>(() => {
    if (typeof window === "undefined") return defaultObjectTypesList;
    try {
      const saved = localStorage.getItem("prochain_object_types_v1");
      return saved ? JSON.parse(saved) : defaultObjectTypesList;
    } catch {
      return defaultObjectTypesList;
    }
  });

  useEffect(() => {
    try {
      localStorage.setItem("prochain_object_types_v1", JSON.stringify(objectTypes));
    } catch {}
  }, [objectTypes]);

  const [isObjTypeModalOpen, setIsObjTypeModalOpen] = useState(false);
  const [editingObjTypeId, setEditingObjTypeId] = useState<string | null>(null);
  const [formObjCode, setFormObjCode] = useState("");
  const [formObjPurpose, setFormObjPurpose] = useState("");
  const [formObjMethod, setFormObjMethod] = useState("");
  const [formObjArea, setFormObjArea] = useState("");

  const openCreateObjTypeModal = () => {
    setEditingObjTypeId(null);
    setFormObjCode("");
    setFormObjPurpose("");
    setFormObjMethod("");
    setFormObjArea("");
    setIsObjTypeModalOpen(true);
  };

  const openEditObjTypeModal = (item: ObjectTypeItem) => {
    setEditingObjTypeId(item.id);
    setFormObjCode(item.code);
    setFormObjPurpose(item.purpose);
    setFormObjMethod(item.checkMethod);
    setFormObjArea(item.exampleArea);
    setIsObjTypeModalOpen(true);
  };

  const handleSaveObjTypeSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    if (!formObjCode.trim()) return;
    const item: ObjectTypeItem = {
      id: editingObjTypeId || formObjCode.trim().toUpperCase(),
      code: formObjCode.trim().toUpperCase(),
      purpose: formObjPurpose.trim(),
      checkMethod: formObjMethod.trim(),
      exampleArea: formObjArea.trim(),
    };
    if (editingObjTypeId) {
      setObjectTypes((prev) => prev.map((o) => (o.id === editingObjTypeId ? item : o)));
    } else {
      setObjectTypes((prev) => [...prev, item]);
    }
    setIsObjTypeModalOpen(false);
  };

  const handleDeleteObjType = (id: string) => {
    if (window.confirm(`Удалить тип объекта [${id}] из справочника?`)) {
      setObjectTypes((prev) => prev.filter((o) => o.id !== id));
    }
  };

  return (
    <div className="max-w-7xl mx-auto space-y-6">
      {/* Блок 1: Каталог патчей (Патчноут) */}
      <div className="bg-slate-900 border border-slate-800 rounded-xl overflow-hidden shadow-xl">
        <div className="p-4 bg-slate-850 border-b border-slate-800 flex flex-wrap items-center justify-between gap-3">
          <div className="flex items-center gap-2.5">
            <BookOpen className="w-4 h-4 text-cyan-400" />
            <h3 className="text-xs font-bold text-slate-100 uppercase tracking-wider">
              Каталог стандартов и патчей шаблона (Патчноут)
            </h3>
            <span className="text-[10px] font-mono px-2 py-0.5 rounded bg-slate-800 text-slate-400">
              Стандартов: {patches.length}
            </span>
          </div>
          <button
            onClick={openCreatePatchModal}
            className="flex items-center gap-1.5 px-3 py-1.5 bg-cyan-600 hover:bg-cyan-500 text-white rounded-lg text-xs font-semibold shadow-sm transition-colors cursor-pointer"
          >
            <Plus className="w-3.5 h-3.5" />
            <span>Добавить патч</span>
          </button>
        </div>

        <div className="overflow-x-auto">
          <table className="w-full text-left text-xs border-collapse">
            <thead className="bg-slate-800 text-slate-400 uppercase text-[10px] font-semibold">
              <tr className="border-b border-slate-700">
                <th className="p-3">ID Патча</th>
                <th className="p-3">Версия</th>
                <th className="p-3">Тип объекта</th>
                <th className="p-3">Приоритет</th>
                <th className="p-3 text-center">Автоисправление</th>
                <th className="p-3">Назначение и эталонная область</th>
                <th className="p-3 text-center w-24">Действия</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-800/80 font-sans">
              {patches.map((p) => {
                const priorityCls =
                  p.priority === "Критический"
                    ? "bg-rose-950 text-rose-300 border-rose-800"
                    : p.priority === "Значимый"
                      ? "bg-amber-950 text-amber-300 border-amber-800"
                      : "bg-cyan-950 text-cyan-300 border-cyan-800";

                return (
                  <tr key={p.id} className="hover:bg-slate-800/40 transition-colors">
                    <td className="p-3 font-mono font-bold text-cyan-400">{p.id}</td>
                    <td className="p-3 font-mono text-slate-300">{p.version}</td>
                    <td className="p-3 font-mono text-purple-300 text-[11px]">{p.objectType}</td>
                    <td className="p-3">
                      <span className={`px-2 py-0.5 rounded text-[10px] font-bold border ${priorityCls}`}>
                        {p.priority}
                      </span>
                    </td>
                    <td className="p-3 text-center font-semibold">
                      <span className={p.autoFix ? "text-emerald-400" : "text-rose-400"}>
                        {p.autoFix ? "Да" : "Нет"}
                      </span>
                    </td>
                    <td className="p-3 text-slate-300 max-w-md">{p.description}</td>
                    <td className="p-3 text-center">
                      <div className="flex items-center justify-center gap-1.5">
                        <button
                          onClick={() => openEditPatchModal(p)}
                          className="p-1 text-slate-400 hover:text-cyan-300 rounded transition-colors cursor-pointer"
                          title="Редактировать патч"
                        >
                          <Pencil className="w-3.5 h-3.5" />
                        </button>
                        <button
                          onClick={() => handleDeletePatch(p.id)}
                          className="p-1 text-slate-400 hover:text-rose-400 rounded transition-colors cursor-pointer"
                          title="Удалить патч"
                        >
                          <Trash2 className="w-3.5 h-3.5" />
                        </button>
                      </div>
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      </div>

      {/* Блок 2: Справочник типов объектов */}
      <div className="bg-slate-900 border border-slate-800 rounded-xl overflow-hidden shadow-xl">
        <div className="p-4 bg-slate-850 border-b border-slate-800 flex flex-wrap items-center justify-between gap-3">
          <div className="flex items-center gap-2.5">
            <h3 className="text-xs font-bold text-slate-100 uppercase tracking-wider">
              Справочник: Расшифровка типов объектов и методы проверки
            </h3>
            <span className="text-[10px] font-mono px-2 py-0.5 rounded bg-slate-800 text-slate-400">
              Типов: {objectTypes.length}
            </span>
          </div>
          <button
            onClick={openCreateObjTypeModal}
            className="flex items-center gap-1.5 px-3 py-1.5 bg-slate-800 hover:bg-slate-700 text-cyan-400 hover:text-white rounded-lg text-xs font-semibold border border-slate-700 transition-colors cursor-pointer"
          >
            <Plus className="w-3.5 h-3.5" />
            <span>Добавить тип объекта</span>
          </button>
        </div>

        <div className="overflow-x-auto">
          <table className="w-full text-left text-xs border-collapse">
            <thead className="bg-slate-800 text-slate-400 uppercase text-[10px] font-semibold">
              <tr className="border-b border-slate-700">
                <th className="p-3">Код типа</th>
                <th className="p-3">Назначение объекта</th>
                <th className="p-3">Метод проверки валидатором</th>
                <th className="p-3">Пример целевой области</th>
                <th className="p-3 text-center w-24">Действия</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-800/80 font-sans">
              {objectTypes.map((o) => (
                <tr key={o.id} className="hover:bg-slate-800/40 transition-colors">
                  <td className="p-3 font-mono font-bold text-cyan-300">{o.code}</td>
                  <td className="p-3 text-slate-200">{o.purpose}</td>
                  <td className="p-3 text-slate-400">{o.checkMethod}</td>
                  <td className="p-3 font-mono text-amber-300">{o.exampleArea}</td>
                  <td className="p-3 text-center">
                    <div className="flex items-center justify-center gap-1.5">
                      <button
                        onClick={() => openEditObjTypeModal(o)}
                        className="p-1 text-slate-400 hover:text-cyan-300 rounded transition-colors cursor-pointer"
                        title="Редактировать тип объекта"
                      >
                        <Pencil className="w-3.5 h-3.5" />
                      </button>
                      <button
                        onClick={() => handleDeleteObjType(o.id)}
                        className="p-1 text-slate-400 hover:text-rose-400 rounded transition-colors cursor-pointer"
                        title="Удалить тип объекта"
                      >
                        <Trash2 className="w-3.5 h-3.5" />
                      </button>
                    </div>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>

      {/* Модалка создания/редактирования типа объекта */}
      {isObjTypeModalOpen && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-slate-950/80 backdrop-blur-sm animate-fadeIn">
          <div className="bg-slate-900 border border-slate-700 rounded-2xl w-full max-w-md shadow-2xl overflow-hidden flex flex-col">
            <div className="p-5 border-b border-slate-800 flex items-center justify-between bg-slate-850">
              <div>
                <h3 className="text-sm font-bold text-slate-100">
                  {editingObjTypeId ? `Редактирование типа [${editingObjTypeId}]` : "Новый тип объекта валидатора"}
                </h3>
                <p className="text-[11px] text-slate-400">Спецификация для системы контроля шаблонов</p>
              </div>
              <button onClick={() => setIsObjTypeModalOpen(false)} className="p-1 text-slate-400 hover:text-white rounded-lg hover:bg-slate-800">
                ✕
              </button>
            </div>

            <form onSubmit={handleSaveObjTypeSubmit} className="p-5 space-y-3.5 text-xs">
              <div>
                <label className="block text-slate-400 mb-1 font-semibold">Код типа (Uppercase)</label>
                <input
                  type="text"
                  required
                  value={formObjCode}
                  onChange={(e) => setFormObjCode(e.target.value)}
                  placeholder="API_1C_SYNC"
                  className="w-full px-2.5 py-1.5 bg-slate-800 border border-slate-700 rounded-lg text-cyan-300 font-mono font-bold"
                />
              </div>

              <div>
                <label className="block text-slate-400 mb-1 font-semibold">Назначение объекта</label>
                <input
                  type="text"
                  required
                  value={formObjPurpose}
                  onChange={(e) => setFormObjPurpose(e.target.value)}
                  placeholder="Шина синхронизации номенклатуры и остатков"
                  className="w-full px-2.5 py-1.5 bg-slate-800 border border-slate-700 rounded-lg text-slate-200"
                />
              </div>

              <div>
                <label className="block text-slate-400 mb-1 font-semibold">Метод проверки валидатором</label>
                <input
                  type="text"
                  required
                  value={formObjMethod}
                  onChange={(e) => setFormObjMethod(e.target.value)}
                  placeholder="Пинг эндпоинта и валидация схемы JSON"
                  className="w-full px-2.5 py-1.5 bg-slate-800 border border-slate-700 rounded-lg text-slate-200"
                />
              </div>

              <div>
                <label className="block text-slate-400 mb-1 font-semibold">Пример целевой области</label>
                <input
                  type="text"
                  required
                  value={formObjArea}
                  onChange={(e) => setFormObjArea(e.target.value)}
                  placeholder="Столбец R, Лист Интеграция"
                  className="w-full px-2.5 py-1.5 bg-slate-800 border border-slate-700 rounded-lg text-amber-300 font-mono"
                />
              </div>

              <div className="pt-2 border-t border-slate-800 flex justify-end gap-2">
                <button
                  type="button"
                  onClick={() => setIsObjTypeModalOpen(false)}
                  className="px-3 py-1.5 bg-slate-800 hover:bg-slate-700 text-slate-300 rounded-lg font-semibold cursor-pointer"
                >
                  Отмена
                </button>
                <button
                  type="submit"
                  className="px-4 py-1.5 bg-cyan-600 hover:bg-cyan-500 text-white rounded-lg font-bold transition-colors cursor-pointer"
                >
                  {editingObjTypeId ? "Сохранить" : "Добавить тип"}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* Модалка создания/редактирования патча */}
      {isPatchModalOpen && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-slate-950/80 backdrop-blur-sm animate-fadeIn">
          <div className="bg-slate-900 border border-slate-700 rounded-2xl w-full max-w-md shadow-2xl overflow-hidden flex flex-col">
            <div className="p-5 border-b border-slate-800 flex items-center justify-between bg-slate-850">
              <div className="flex items-center gap-2.5">
                <div className="w-8 h-8 rounded-xl bg-cyan-600/20 border border-cyan-500/30 flex items-center justify-center text-cyan-400">
                  <BookOpen className="w-4 h-4" />
                </div>
                <div>
                  <h3 className="text-sm font-bold text-slate-100">
                    {editingPatchId ? `Редактирование патча [${editingPatchId}]` : "Новый патч стандарта"}
                  </h3>
                  <p className="text-[11px] text-slate-400">Правило валидации проектных шаблонов</p>
                </div>
              </div>
              <button onClick={() => setIsPatchModalOpen(false)} className="p-1 text-slate-400 hover:text-white rounded-lg hover:bg-slate-800">
                ✕
              </button>
            </div>

            <form onSubmit={handleSavePatchSubmit} className="p-5 space-y-3.5 text-xs">
              <div className="grid grid-cols-2 gap-2.5">
                <div>
                  <label className="block text-slate-400 mb-1 font-semibold">ID Патча</label>
                  <input
                    type="text"
                    required
                    value={formPatchId}
                    onChange={(e) => setFormPatchId(e.target.value)}
                    placeholder="GANT-005"
                    className="w-full px-2.5 py-1.5 bg-slate-800 border border-slate-700 rounded-lg text-cyan-300 font-mono font-bold"
                  />
                </div>
                <div>
                  <label className="block text-slate-400 mb-1 font-semibold">Версия</label>
                  <input
                    type="text"
                    required
                    value={formPatchVersion}
                    onChange={(e) => setFormPatchVersion(e.target.value)}
                    placeholder="1.0.2"
                    className="w-full px-2.5 py-1.5 bg-slate-800 border border-slate-700 rounded-lg text-slate-200 font-mono"
                  />
                </div>
              </div>

              <div className="grid grid-cols-2 gap-2.5">
                <div>
                  <label className="block text-slate-400 mb-1 font-semibold">Тип объекта</label>
                  <select
                    value={formPatchObjectType}
                    onChange={(e) => setFormPatchObjectType(e.target.value)}
                    className="w-full px-2.5 py-1.5 bg-slate-800 border border-slate-700 rounded-lg text-slate-200 text-xs font-mono"
                  >
                    <option value="FORMULA_COLUMN">FORMULA_COLUMN</option>
                    <option value="CONDITIONAL_FORMAT">CONDITIONAL_FORMAT</option>
                    <option value="DATA_VALIDATION">DATA_VALIDATION</option>
                    <option value="TABLE_STRUCTURE">TABLE_STRUCTURE</option>
                    <option value="SHEET">SHEET</option>
                    <option value="NAMED_RANGE">NAMED_RANGE</option>
                    <option value="CELL_VALUE">CELL_VALUE</option>
                    <option value="VBA_MODULE">VBA_MODULE</option>
                  </select>
                </div>
                <div>
                  <label className="block text-slate-400 mb-1 font-semibold">Приоритет</label>
                  <select
                    value={formPatchPriority}
                    onChange={(e) => setFormPatchPriority(e.target.value as any)}
                    className="w-full px-2.5 py-1.5 bg-slate-800 border border-slate-700 rounded-lg text-slate-200 text-xs"
                  >
                    <option value="Критический">Критический</option>
                    <option value="Значимый">Значимый</option>
                    <option value="Интерфейс">Интерфейс</option>
                  </select>
                </div>
              </div>

              <label className="flex items-center gap-2 text-slate-300 cursor-pointer select-none pt-1">
                <input
                  type="checkbox"
                  checked={formPatchAutoFix}
                  onChange={(e) => setFormPatchAutoFix(e.target.checked)}
                  className="rounded bg-slate-800 border-slate-700 text-cyan-500 w-3.5 h-3.5"
                />
                <span className="font-semibold text-xs">Разрешено автоисправление шаблона (AutoFix)</span>
              </label>

              <div>
                <label className="block text-slate-400 mb-1 font-semibold">Назначение и эталонная область</label>
                <textarea
                  rows={2}
                  required
                  value={formPatchDesc}
                  onChange={(e) => setFormPatchDesc(e.target.value)}
                  placeholder="Формула проверки дат и непрерывности R1C1..."
                  className="w-full px-2.5 py-1.5 bg-slate-800 border border-slate-700 rounded-lg text-slate-200 text-xs"
                />
              </div>

              <div className="pt-2 border-t border-slate-800 flex justify-end gap-2">
                <button
                  type="button"
                  onClick={() => setIsPatchModalOpen(false)}
                  className="px-3 py-1.5 bg-slate-800 hover:bg-slate-700 text-slate-300 rounded-lg font-semibold cursor-pointer"
                >
                  Отмена
                </button>
                <button
                  type="submit"
                  className="px-4 py-1.5 bg-cyan-600 hover:bg-cyan-500 text-white rounded-lg font-bold transition-colors cursor-pointer"
                >
                  {editingPatchId ? "Сохранить" : "Добавить"}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}
    </div>
  );
};