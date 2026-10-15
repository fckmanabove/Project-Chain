import React, { useState } from "react";
import { Plus, X } from "lucide-react";
import { ProjectPassport } from "../../types";
import { projectApi } from "../../services/api";

interface CreateProjectModalProps {
  isOpen: boolean;
  onClose: () => void;
  onProjectCreated: (created: ProjectPassport) => void;
}

export const CreateProjectModal: React.FC<CreateProjectModalProps> = ({
  isOpen,
  onClose,
  onProjectCreated,
}) => {
  const [newProjCode, setNewProjCode] = useState("P-005");
  const [newProjName, setNewProjName] = useState("");
  const [newProjStart, setNewProjStart] = useState(
    new Date().toISOString().split("T")[0]
  );
  const [newProjFinish, setNewProjFinish] = useState(
    new Date(Date.now() + 90 * 86400000).toISOString().split("T")[0]
  );
  const [newProjBudget, setNewProjBudget] = useState(5000000);
  const [newProjPM, setNewProjPM] = useState("");
  const [newProjGIP, setNewProjGIP] = useState("");
  const [isCreatingProj, setIsCreatingProj] = useState(false);

  if (!isOpen) return null;

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!newProjCode.trim() || !newProjName.trim()) return;

    try {
      setIsCreatingProj(true);
      const created = await projectApi.createProject({
        code: newProjCode.trim(),
        name: newProjName.trim(),
        planned_start_date: newProjStart,
        planned_finish_date: newProjFinish,
        planned_budget: Number(newProjBudget) || 0,
        currency: "RUB",
        status: "PLANNING",
        raci_matrix: {
          pm: newProjPM.trim() || "РП не назначен",
          chief_engineer: newProjGIP.trim() || "ГИП не назначен",
          sponsor: "Дирекция по автоматизации",
        },
        passport_data: {
          object_class: "Автоматизация производства",
        },
      });
      onProjectCreated(created);
      onClose();
      setNewProjName("");
    } catch (err: any) {
      alert(err.response?.data?.detail || "Ошибка при создании проекта");
    } finally {
      setIsCreatingProj(false);
    }
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-slate-950/80 backdrop-blur-sm animate-fadeIn">
      <div className="bg-slate-900 border border-slate-700 rounded-2xl w-full max-w-lg shadow-2xl overflow-hidden flex flex-col">
        <div className="p-5 border-b border-slate-800 flex items-center justify-between bg-slate-850">
          <div className="flex items-center gap-3">
            <div className="w-9 h-9 rounded-xl bg-cyan-600/20 border border-cyan-500/30 flex items-center justify-center text-cyan-400">
              <Plus className="w-5 h-5" />
            </div>
            <div>
              <h3 className="text-base font-bold text-slate-100">
                Создание нового проекта
              </h3>
              <p className="text-xs text-slate-400">
                Паспорт инициативы и корневой узел WBS
              </p>
            </div>
          </div>
          <button
            onClick={onClose}
            className="p-1.5 text-slate-400 hover:text-white rounded-lg hover:bg-slate-800 cursor-pointer"
          >
            <X className="w-4 h-4" />
          </button>
        </div>

        <form onSubmit={handleSubmit} className="p-5 space-y-4 text-xs">
          <div className="grid grid-cols-3 gap-3">
            <div>
              <label className="block text-slate-400 mb-1 font-semibold">
                Шифр проекта
              </label>
              <input
                type="text"
                required
                value={newProjCode}
                onChange={(e) => setNewProjCode(e.target.value)}
                className="w-full px-3 py-2 bg-slate-800 border border-slate-700 rounded-lg text-cyan-300 font-mono font-bold"
                placeholder="P-005"
              />
            </div>
            <div className="col-span-2">
              <label className="block text-slate-400 mb-1 font-semibold">
                Наименование проекта
              </label>
              <input
                type="text"
                required
                value={newProjName}
                onChange={(e) => setNewProjName(e.target.value)}
                className="w-full px-3 py-2 bg-slate-800 border border-slate-700 rounded-lg text-slate-100 font-medium"
                placeholder="Модернизация упаковочной линии"
              />
            </div>
          </div>

          <div className="grid grid-cols-2 gap-3">
            <div>
              <label className="block text-slate-400 mb-1 font-semibold">
                Плановый старт
              </label>
              <input
                type="date"
                required
                value={newProjStart}
                onChange={(e) => setNewProjStart(e.target.value)}
                className="w-full px-3 py-2 bg-slate-800 border border-slate-700 rounded-lg text-slate-200 font-mono"
              />
            </div>
            <div>
              <label className="block text-slate-400 mb-1 font-semibold">
                Плановый финиш
              </label>
              <input
                type="date"
                required
                value={newProjFinish}
                onChange={(e) => setNewProjFinish(e.target.value)}
                className="w-full px-3 py-2 bg-slate-800 border border-slate-700 rounded-lg text-slate-200 font-mono"
              />
            </div>
          </div>

          <div className="grid grid-cols-3 gap-3">
            <div>
              <label className="block text-slate-400 mb-1 font-semibold">
                Бюджет CAPEX (руб)
              </label>
              <input
                type="number"
                value={newProjBudget}
                onChange={(e) => setNewProjBudget(Number(e.target.value))}
                className="w-full px-3 py-2 bg-slate-800 border border-slate-700 rounded-lg text-emerald-400 font-mono font-bold"
              />
            </div>
            <div>
              <label className="block text-slate-400 mb-1 font-semibold">
                Руководитель (РП)
              </label>
              <input
                type="text"
                value={newProjPM}
                onChange={(e) => setNewProjPM(e.target.value)}
                className="w-full px-3 py-2 bg-slate-800 border border-slate-700 rounded-lg text-slate-200"
                placeholder="Климов А."
              />
            </div>
            <div>
              <label className="block text-slate-400 mb-1 font-semibold">
                ГИП / Инженер
              </label>
              <input
                type="text"
                value={newProjGIP}
                onChange={(e) => setNewProjGIP(e.target.value)}
                className="w-full px-3 py-2 bg-slate-800 border border-slate-700 rounded-lg text-slate-200"
                placeholder="Иванов И."
              />
            </div>
          </div>

          <div className="pt-3 border-t border-slate-800 flex justify-end gap-2">
            <button
              type="button"
              onClick={onClose}
              className="px-4 py-2 bg-slate-800 hover:bg-slate-700 text-slate-300 rounded-lg font-semibold cursor-pointer"
            >
              Отмена
            </button>
            <button
              type="submit"
              disabled={isCreatingProj}
              className="px-5 py-2 bg-cyan-600 hover:bg-cyan-500 text-white rounded-lg font-bold shadow-lg shadow-cyan-950 transition-colors cursor-pointer disabled:opacity-50"
            >
              {isCreatingProj ? "Создание..." : "Создать проект"}
            </button>
          </div>
        </form>
      </div>
    </div>
  );
};