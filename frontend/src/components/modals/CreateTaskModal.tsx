import React, { useState, useEffect } from "react";
import { Plus, X } from "lucide-react";
import { GanttTask, ProjectPassport } from "../../types";
import { projectApi } from "../../services/api";

interface CreateTaskModalProps {
  isOpen: boolean;
  onClose: () => void;
  projects: ProjectPassport[];
  tasks: GanttTask[];
  selectedProject: ProjectPassport | null;
  onTaskCreated: () => void;
}

export const CreateTaskModal: React.FC<CreateTaskModalProps> = ({
  isOpen,
  onClose,
  projects,
  tasks,
  selectedProject,
  onTaskCreated,
}) => {
  const [taskTargetProjId, setTaskTargetProjId] = useState("");
  const [newTaskWbs, setNewTaskWbs] = useState("1.1");
  const [newTaskName, setNewTaskName] = useState("");
  const [newTaskType, setNewTaskType] = useState<"TASK" | "MILESTONE">("TASK");
  const [newTaskDuration, setNewTaskDuration] = useState(5);
  const [newTaskStart, setNewTaskStart] = useState(
    new Date().toISOString().split("T")[0]
  );
  const [newTaskFinish, setNewTaskFinish] = useState(
    new Date(Date.now() + 5 * 86400000).toISOString().split("T")[0]
  );
  const [newTaskAssignee, setNewTaskAssignee] = useState("");
  const [newTaskPredecessorId, setNewTaskPredecessorId] = useState<string>("");
  const [newTaskDepType, setNewTaskDepType] = useState<"FS" | "SS" | "FF" | "SF">("FS");
  const [isCreatingTask, setIsCreatingTask] = useState(false);

  // Инициализация WBS и дат при открытии
  useEffect(() => {
    if (!isOpen) return;
    const pId = selectedProject?.id || (projects.length > 0 ? projects[0].id : "");
    const proj = projects.find((p) => p.id === pId) || selectedProject;
    const pTasks = tasks.filter(
      (t) =>
        (t.project_id === pId || (proj && t.wbs_code.startsWith(proj.code + "."))) &&
        !t.id.startsWith("root-")
    );
    const nextNum = pTasks.length + 1;
    const lastTask = pTasks.length > 0 ? pTasks[pTasks.length - 1] : null;

    setTaskTargetProjId(pId);
    setNewTaskWbs(`1.${nextNum}`);
    setNewTaskName("");
    setNewTaskType("TASK");
    setNewTaskDuration(5);
    setNewTaskPredecessorId(lastTask ? lastTask.id : "");
    setNewTaskDepType("FS");

    const todayStr = new Date().toISOString().split("T")[0];
    const baseStart = lastTask?.planned_finish || todayStr;
    setNewTaskStart(baseStart);
    setNewTaskFinish(
      new Date(new Date(baseStart).getTime() + 5 * 86400000).toISOString().split("T")[0]
    );
    setNewTaskAssignee(proj?.raci_matrix?.pm || "");
  }, [isOpen, selectedProject, projects, tasks]);

  if (!isOpen) return null;

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!taskTargetProjId || !newTaskName.trim() || !newTaskWbs.trim()) return;

    try {
      setIsCreatingTask(true);
      const proj = projects.find((p) => p.id === taskTargetProjId);
      await projectApi.createTask(taskTargetProjId, {
        project_id: taskTargetProjId,
        wbs_code: newTaskWbs.trim(),
        name: newTaskName.trim(),
        task_type: newTaskType,
        status: "NOT_STARTED",
        planned_duration:
          newTaskType === "MILESTONE" ? 0 : Number(newTaskDuration) || 1,
        planned_start: newTaskStart,
        planned_finish:
          newTaskType === "MILESTONE" ? newTaskStart : newTaskFinish,
        progress_percent: 0,
        raci_assignee:
          newTaskAssignee.trim() || proj?.raci_matrix?.pm || "Не назначен",
        dependencies: newTaskPredecessorId
          ? [
              {
                predecessor_task_id: newTaskPredecessorId,
                dependency_type: newTaskDepType,
                lag_days: 0,
              },
            ]
          : [],
      } as any);

      try {
        await projectApi.recalculateCPM(taskTargetProjId);
      } catch {
        // пересчет выполнится на бэкенде автоматически
      }

      onTaskCreated();
      onClose();
    } catch (err: any) {
      alert(err.response?.data?.detail || "Ошибка при создании задачи");
    } finally {
      setIsCreatingTask(false);
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
                Новый этап календарного графика
              </h3>
              <p className="text-xs text-slate-400">
                Добавление узла в WBS и сетевой граф CPM
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
          <div className="grid grid-cols-2 gap-3">
            <div>
              <label className="block text-slate-400 mb-1 font-semibold">
                Проект
              </label>
              <select
                value={taskTargetProjId}
                onChange={(e) => setTaskTargetProjId(e.target.value)}
                className="w-full px-3 py-2 bg-slate-800 border border-slate-700 rounded-lg text-slate-200 font-medium"
              >
                {projects.map((p) => (
                  <option key={p.id} value={p.id}>
                    [{p.code}] {p.name}
                  </option>
                ))}
              </select>
            </div>

            <div>
              <label className="block text-slate-400 mb-1 font-semibold">
                WBS код этапа
              </label>
              <input
                type="text"
                required
                value={newTaskWbs}
                onChange={(e) => setNewTaskWbs(e.target.value)}
                className="w-full px-3 py-2 bg-slate-800 border border-slate-700 rounded-lg text-cyan-300 font-mono font-bold"
                placeholder="1.7"
              />
            </div>
          </div>

          <div>
            <label className="block text-slate-400 mb-1 font-semibold">
              Наименование работы
            </label>
            <input
              type="text"
              required
              value={newTaskName}
              onChange={(e) => setNewTaskName(e.target.value)}
              className="w-full px-3 py-2 bg-slate-800 border border-slate-700 rounded-lg text-slate-100 font-medium"
              placeholder="Монтаж и пусконаладка датчиков позиционирования"
            />
          </div>

          {/* Авто-связь предшественника в графе CPM */}
          <div className="p-3 bg-slate-950/60 rounded-xl border border-slate-800 space-y-2.5">
            <div className="flex items-center justify-between">
              <label className="block text-[11px] text-cyan-400 font-bold uppercase tracking-wider">
                Связь в графе CPM (Предшественник)
              </label>
              <span className="text-[10px] text-slate-500">Авто-подстановка</span>
            </div>
            <div className="grid grid-cols-3 gap-2">
              <div className="col-span-2">
                <select
                  value={newTaskPredecessorId}
                  onChange={(e) => setNewTaskPredecessorId(e.target.value)}
                  className="w-full px-2.5 py-1.5 bg-slate-800 border border-slate-700 rounded-lg text-slate-200 text-xs truncate"
                >
                  <option value="">-- Без предшественника (Старт) --</option>
                  {tasks
                    .filter(
                      (t) =>
                        t.project_id === taskTargetProjId &&
                        !t.id.startsWith("root-") &&
                        t.task_type !== "SUMMARY"
                    )
                    .map((t) => (
                      <option key={t.id} value={t.id}>
                        [{t.wbs_code}] {t.name.slice(0, 40)}
                      </option>
                    ))}
                </select>
              </div>
              <div>
                <select
                  value={newTaskDepType}
                  onChange={(e) => setNewTaskDepType(e.target.value as any)}
                  className="w-full px-2 py-1.5 bg-slate-800 border border-slate-700 rounded-lg text-cyan-300 font-mono text-xs font-bold"
                >
                  <option value="FS">FS (План)</option>
                  <option value="SS">SS (Параллельно)</option>
                  <option value="FF">FF (Вместе)</option>
                  <option value="SF">SF (Редкая)</option>
                </select>
              </div>
            </div>
          </div>

          <div className="grid grid-cols-3 gap-3 items-end">
            <div>
              <label className="block text-slate-400 mb-1 font-semibold">
                Тип этапа
              </label>
              <select
                value={newTaskType}
                onChange={(e) => {
                  const t = e.target.value as "TASK" | "MILESTONE";
                  setNewTaskType(t);
                  if (t === "MILESTONE") setNewTaskDuration(0);
                  else if (newTaskDuration === 0) setNewTaskDuration(5);
                }}
                className="w-full px-3 py-2 bg-slate-800 border border-slate-700 rounded-lg text-slate-200 font-medium"
              >
                <option value="TASK">Работа</option>
                <option value="MILESTONE">Веха (0 дн.)</option>
              </select>
            </div>

            <div>
              <label className="block text-slate-400 mb-1 font-semibold">
                Длительность (дней)
              </label>
              <input
                type="number"
                min={0}
                disabled={newTaskType === "MILESTONE"}
                value={newTaskDuration}
                onChange={(e) => {
                  const d = Number(e.target.value);
                  setNewTaskDuration(d);
                  const start = new Date(newTaskStart);
                  const finish = new Date(start.getTime() + d * 86400000);
                  setNewTaskFinish(finish.toISOString().split("T")[0]);
                }}
                className="w-full px-3 py-2 bg-slate-800 border border-slate-700 rounded-lg text-slate-200 font-mono disabled:opacity-50"
              />
            </div>

            <div>
              <label className="block text-slate-400 mb-1 font-semibold">
                Ответственный (R)
              </label>
              <input
                type="text"
                value={newTaskAssignee}
                onChange={(e) => setNewTaskAssignee(e.target.value)}
                className="w-full px-3 py-2 bg-slate-800 border border-slate-700 rounded-lg text-slate-200"
                placeholder="ФИО / Бригада"
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
                value={newTaskStart}
                onChange={(e) => {
                  setNewTaskStart(e.target.value);
                  const start = new Date(e.target.value);
                  const finish = new Date(
                    start.getTime() + newTaskDuration * 86400000
                  );
                  setNewTaskFinish(finish.toISOString().split("T")[0]);
                }}
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
                disabled={newTaskType === "MILESTONE"}
                value={newTaskType === "MILESTONE" ? newTaskStart : newTaskFinish}
                onChange={(e) => setNewTaskFinish(e.target.value)}
                className="w-full px-3 py-2 bg-slate-800 border border-slate-700 rounded-lg text-slate-200 font-mono disabled:opacity-50"
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
              disabled={isCreatingTask}
              className="px-5 py-2 bg-cyan-600 hover:bg-cyan-500 text-white rounded-lg font-bold shadow-lg shadow-cyan-950 transition-colors cursor-pointer disabled:opacity-50"
            >
              {isCreatingTask ? "Сохранение..." : "Создать этап"}
            </button>
          </div>
        </form>
      </div>
    </div>
  );
};