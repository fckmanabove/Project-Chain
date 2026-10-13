import React, { useState, useEffect } from "react";
import {
  Sun,
  Moon,
  FolderKanban,
  Layers,
  RefreshCw,
  Activity,
  AlertCircle,
  BarChart3,
  ShieldAlert,
  CheckSquare,
  Network,
  FileSpreadsheet,
  Zap,
  CheckCircle2,
  ExternalLink,
  ChevronDown,
  ChevronRight,
  AlertTriangle,
  PlusCircle,
  Download,
  ShieldCheck,
  Plus,
  Users,
  RotateCcw,
  BookOpen,
  Pencil,
  Trash2,
  ClipboardList,
  Play,
} from "lucide-react";
import { ProjectPassport as IProjectPassport, GanttTask, User } from "./types";
import { projectApi, authApi, userApi } from "./services/api";
import { AdminConsole } from "./components/admin/AdminConsole";
import { AuthModal } from "./components/auth/AuthModal";
import { ProfileSettingsModal } from "./components/auth/ProfileSettingsModal";
import { TimeMachineView } from "./components/audit/TimeMachineView";
import { History } from "lucide-react";
import { ProjectPassport } from "./components/passport/ProjectPassport";
import { ProductionDiaryView } from "./components/diary/ProductionDiaryView";
import { PortfolioHealthBar } from "./components/portfolio/PortfolioHealthBar";
import { DelayInspectorModal } from "./components/portfolio/DelayInspectorModal";
import { OverlapInspectorModal } from "./components/portfolio/OverlapInspectorModal";
import { ExcelBridgeModal } from "./components/excel/ExcelBridgeModal";
import { GanttChart } from "./components/gantt/GanttChart";
import { TaskDrawer } from "./components/gantt/TaskDrawer";
import { PortfolioStateView } from "./components/portfolio/PortfolioStateView";
import { ControlMilestonesView } from "./components/control/ControlMilestonesView";
import { RelatedTasksView } from "./components/tasks/RelatedTasksView";
import { SourcesView } from "./components/excel/SourcesView";
import { ReferenceCatalogView } from "./components/reference/ReferenceCatalogView";
import { UpdateLogView } from "./components/logs/UpdateLogView";
import { CreateProjectModal } from "./components/modals/CreateProjectModal";
import { CreateTaskModal } from "./components/modals/CreateTaskModal";
import { Sparkles } from "lucide-react";
import { startTechLeadTour } from "./utils/tour";

export const App: React.FC = () => {
  const [projects, setProjects] = useState<IProjectPassport[]>([]);
  const [selectedProject, setSelectedProject] =
    useState<IProjectPassport | null>(null);
  const [isPortfolioMode, setIsPortfolioMode] = useState<boolean>(() => {
    if (typeof window === "undefined") return false;
    return localStorage.getItem("prochain_is_portfolio_mode") === "true";
  });
  const [tasks, setTasks] = useState<GanttTask[]>([]);
  const [selectedTask, setSelectedTask] = useState<GanttTask | null>(null);
  const [isDrawerOpen, setIsDrawerOpen] = useState(false);
  const [isInspectorOpen, setIsInspectorOpen] = useState(false);
  const [isOverlapModalOpen, setIsOverlapModalOpen] = useState(false);
  const [isExcelModalOpen, setIsExcelModalOpen] = useState(false);
  const [currentUser, setCurrentUser] = useState<User | null>(() => authApi.getSavedUser());
  const [theme, setTheme] = useState<"dark" | "light">(() => {
    if (typeof window === "undefined") return "dark";
    const saved = localStorage.getItem("prochain_theme") as "dark" | "light";
    if (saved === "dark" || saved === "light") return saved;
    try {
      const u = JSON.parse(localStorage.getItem("prochain_user") || "{}");
      if (u.theme === "dark" || u.theme === "light") return u.theme;
    } catch {}
    return "dark";
  });
  const [isAuthModalOpen, setIsAuthModalOpen] = useState(false);

  useEffect(() => {
    document.documentElement.classList.remove("dark", "light");
    document.documentElement.classList.add(theme);
    try {
      localStorage.setItem("prochain_theme", theme);
    } catch {}
  }, [theme]);

  const toggleTheme = () => {
    const nextTheme = theme === "dark" ? "light" : "dark";
    setTheme(nextTheme);
    try {
      localStorage.setItem("prochain_theme", nextTheme);
    } catch {}
    userApi.updateMe({ theme: nextTheme }).catch(() => {});
  };
  const [isProfileModalOpen, setIsProfileModalOpen] = useState(false);
  const [activeTab, setActiveTab] = useState<
    "UI_PORTFOLIO" | "DIARY" | "PORTFOLIO_STATE" | "CONTROL" | "RELATED_TASKS" | "SOURCES" | "REFERENCE" | "UPDATE_LOG" | "ADMIN" | "TIME_MACHINE"
  >(() => {
    if (typeof window === "undefined") return "UI_PORTFOLIO";
    const saved = localStorage.getItem("prochain_active_tab");
    return (saved as any) || "UI_PORTFOLIO";
  });

  // Ролевые права на отображение системных иконок в шапке (с поддержкой role и role_id)
  const userRole = currentUser?.role_id || (currentUser as any)?.role;
  const canAccessAdmin = userRole === "SUPERADMIN" || currentUser?.custom_permissions?.allow?.includes("users:manage");
  const canAccessTimeMachine = userRole === "SUPERADMIN" || userRole === "AUDITOR" || currentUser?.custom_permissions?.allow?.includes("audit:view");
  const canAccessExcelBridge =
    userRole === "SUPERADMIN" ||
    userRole === "PM" ||
    currentUser?.custom_permissions?.allow?.includes("excel:bridge");

  const [isLoading, setIsLoading] = useState(true);
  const [isRecalculating, setIsRecalculating] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const loadProjects = async () => {
    try {
      setIsLoading(true);
      setError(null);
      const data = await projectApi.listProjects();
      setProjects(data);
      if (data.length > 0) {
        const savedId = localStorage.getItem("prochain_active_project_id");
        const found = data.find((p) => p.id === savedId);
        setSelectedProject(found || data[0]);
      }
      // Фоновая предзагрузка всех задач для мгновенного отображения PCC 1.5 и всех вкладок
      await loadAllPortfolioTasks(data);
    } catch (err: any) {
      setError(err.message || "Не удалось подключиться к серверу API");
    } finally {
      setIsLoading(false);
    }
  };

  // Автосохранение открытого проекта и вкладки
  useEffect(() => {
    try {
      localStorage.setItem("prochain_active_tab", activeTab);
    } catch {}
  }, [activeTab]);

  useEffect(() => {
    try {
      if (selectedProject) {
        localStorage.setItem("prochain_active_project_id", selectedProject.id);
      }
      localStorage.setItem("prochain_is_portfolio_mode", String(isPortfolioMode));
    } catch {}
  }, [selectedProject?.id, isPortfolioMode]);

  const loadTasks = async (projectId: string) => {
    try {
      const data = await projectApi.getProjectTasks(projectId);
      setTasks(data);
    } catch (err: any) {
      console.error("Ошибка загрузки задач:", err);
    }
  };

  const loadAllPortfolioTasks = async (allProjects: IProjectPassport[]) => {
    try {
      if (tasks.length === 0) setIsLoading(true);
      // 1 быстрый пакетный запрос вместо 5 параллельных
      const allTasks = await projectApi.getAllTasks();
      
      const results = allProjects.map((p) => {
        const pTasks = allTasks.filter((t) => t.project_id === p.id);
        const rootTask: GanttTask = {
          id: `root-${p.id}`,
          project_id: p.id,
          wbs_code: p.code,
          level: 1,
          sort_order: 0,
          name: `[${p.code}] ${p.name}`,
          task_type: "SUMMARY",
          status: "IN_PROGRESS",
          planned_duration: pTasks.reduce((acc, t) => acc + t.planned_duration, 0) || 30,
          planned_start: p.planned_start_date,
          planned_finish: p.planned_finish_date,
          actual_start: p.actual_start_date,
          actual_finish: p.actual_finish_date,
          progress_percent: pTasks.length
            ? Math.round(pTasks.reduce((acc, t) => acc + t.progress_percent, 0) / pTasks.length)
            : 0,
          is_plan_locked: false,
          total_float: pTasks.length ? Math.min(...pTasks.map((t) => t.total_float), 0) : 0,
          free_float: 0,
          is_critical: pTasks.some((t) => t.is_critical),
          raci_assignee: p.raci_matrix?.pm || "РП",
          raci_consulted: [],
          raci_informed: [],
          predecessor_links: [],
        };

        const mappedChildren = pTasks.map((t) => ({
          ...t,
          wbs_code: `${p.code}.${t.wbs_code}`,
          parent_wbs: t.parent_wbs ? `${p.code}.${t.parent_wbs}` : p.code,
          level: t.level + 1,
        }));

        return [rootTask, ...mappedChildren];
      });

      setTasks(results.flat());
    } catch (err: any) {
      console.error("Ошибка агрегации портфеля:", err);
    } finally {
      setIsLoading(false);
    }
  };

  useEffect(() => {
    if (currentUser?.id) {
      loadProjects();
    }
    // Автоматическая подгрузка актуальных 2FA-настроек и темы из базы данных
    const syncFreshProfile = async () => {
      const token = localStorage.getItem("prochain_access_token");
      if (token) {
        try {
          const fresh = await userApi.getMe();
          setCurrentUser(fresh);
          localStorage.setItem("prochain_user", JSON.stringify(fresh));
          const localTheme = localStorage.getItem("prochain_theme");
          if (!localTheme && (fresh.theme === "dark" || fresh.theme === "light")) {
            setTheme(fresh.theme);
          }
        } catch {}
      }
    };
    syncFreshProfile();
  }, [currentUser?.id]);

  const [isCreateTaskOpen, setIsCreateTaskOpen] = useState(false);
  const [isCreateProjOpen, setIsCreateProjOpen] = useState(false);

  // Фильтры по образу tblUIFilters из Excel MVP (без дублирования проекта)
  const [showCompleted, setShowCompleted] = useState(true);
  const [selectedResponsibles, setSelectedResponsibles] = useState<string[]>([]);
  const [isRespDropdownOpen, setIsRespDropdownOpen] = useState(false);
  const [customResponsibles, setCustomResponsibles] = useState<string[]>([]);
  const [isAddingNewResp, setIsAddingNewResp] = useState(false);
  const [newRespInput, setNewRespInput] = useState("");
  const [filterTaskStatus, setFilterTaskStatus] = useState("ALL");
  const [filterCheckStatus, setFilterCheckStatus] = useState("ALL");

  const normalizeResponsibleName = (raw: string): string => {
    return raw.trim().replace(/\s+/g, " ");
  };

  // Хелпер разбивки и нормализации ответственных ("Климов / Маклюк" -> ["Климов А.Н.", "Маклюк С.В."])
  const parseAssignees = (raw?: string): string[] => {
    if (!raw || raw === "—" || raw === "Не назначен") return [];
    return raw
      .split(/[\/,+;]\s*|\s+и\s+/)
      .map((s) => normalizeResponsibleName(s))
      .filter((s) => s && s !== "—" && s !== "Не назначен");
  };

  // Список всех уникальных ответственных (с нормализацией псевдонимов и без дубликатов)
  const allResponsiblesList = React.useMemo(() => {
    const set = new Set<string>();
    tasks.forEach((t) => {
      if (t.id.startsWith("root-") || t.task_type === "SUMMARY") return;
      const list = parseAssignees(t.raci_assignee);
      list.forEach((name) => set.add(name));
    });
    return Array.from(set).sort();
  }, [tasks]);

  // Стейт инлайн-редактирования имени ответственного
  const [editingRespName, setEditingRespName] = useState<string | null>(null);
  const [editRespInput, setEditRespInput] = useState("");

  // 1. Каскадное переименование ответственного во всех его задачах (с поддержкой мульти-имён)
  const handleRenameResponsible = async (oldName: string, newName: string) => {
    if (!newName.trim() || oldName === newName.trim()) {
      setEditingRespName(null);
      return;
    }
    const cleanNew = newName.trim();

    // Находим все задачи, где этот человек указан (даже в паре с кем-то)
    const affected = tasks.filter((t) => {
      if (!t.raci_assignee || t.id.startsWith("root-")) return false;
      const list = parseAssignees(t.raci_assignee);
      return list.includes(oldName);
    });

    // Оптимистично обновляем в стейте задач
    setTasks((prev) =>
      prev.map((t) => {
        if (!t.raci_assignee || t.id.startsWith("root-")) return t;
        const list = parseAssignees(t.raci_assignee);
        if (list.includes(oldName)) {
          const updated = list.map((item) => (item === oldName ? cleanNew : item));
          return { ...t, raci_assignee: updated.join(", ") };
        }
        return t;
      })
    );

    setSelectedResponsibles((prev) => prev.map((r) => (r === oldName ? cleanNew : r)));
    setCustomResponsibles((prev) => prev.map((r) => (r === oldName ? cleanNew : r)));
    setEditingRespName(null);

    /// 1. Гарантированно отправляем запросы в базу данных по задачам
    for (const t of affected) {
      try {
        const list = parseAssignees(t.raci_assignee);
        const updated = list.map((item) => (item === oldName ? cleanNew : item));
        await projectApi.updateTask(t.id, { raci_assignee: updated.join(", ") });
      } catch (e) {
        console.error("Ошибка обновления задачи:", t.id, e);
      }
    }

    // 2. Обновляем имя РП в паспортах проектов (если это был руководитель)
    for (const p of projects) {
      if (p.raci_matrix?.pm === oldName) {
        try {
          await projectApi.updateProject(p.id, {
            raci_matrix: { ...p.raci_matrix, pm: cleanNew },
          });
        } catch {}
      }
    }
    // Синхронизируем состояние проектов
    loadProjects().catch(() => {});
  };

  // 2. Удаление ответственного с каскадным сбросом на "Не назначен"
  const handleDeleteResponsible = async (nameToDelete: string) => {
    const affected = tasks.filter((t) => t.raci_assignee === nameToDelete && !t.id.startsWith("root-"));
    if (!window.confirm(`Удалить ответственного "${nameToDelete}"? У ${affected.length} задач исполнитель будет сброшен на "Не назначен".`)) {
      return;
    }
    setTasks((prev) =>
      prev.map((t) => (t.raci_assignee === nameToDelete ? { ...t, raci_assignee: "Не назначен" } : t))
    );
    setSelectedResponsibles((prev) => prev.filter((r) => r !== nameToDelete));
    setCustomResponsibles((prev) => prev.filter((r) => r !== nameToDelete));

    for (const t of affected) {
      try {
        await projectApi.updateTask(t.id, { raci_assignee: "Не назначен" });
      } catch {}
    }
  };

  // Подсчет активных фильтров (как плашка mvp_ActiveFilterCount)
  const activeFiltersCount = React.useMemo(() => {
    let count = 0;
    if (!showCompleted) count++;
    if (selectedResponsibles.length > 0) count++;
    if (filterTaskStatus !== "ALL") count++;
    if (filterCheckStatus !== "ALL") count++;
    return count;
  }, [showCompleted, selectedResponsibles, filterTaskStatus, filterCheckStatus]);

  // Сброс всех фильтров в 1 клик
  const handleResetFilters = () => {
    setShowCompleted(true);
    setSelectedResponsibles([]);
    setFilterTaskStatus("ALL");
    setFilterCheckStatus("ALL");
  };

  // Итоговый отфильтрованный массив задач для Гантта
  const filteredGanttTasks = React.useMemo(() => {
    const todayStr = new Date().toISOString().split("T")[0];
    return tasks.filter((t) => {
      if (!showCompleted && (t.status === "COMPLETED" || t.progress_percent === 100)) {
        return false;
      }
      if (selectedResponsibles.length > 0 && !t.id.startsWith("root-")) {
        const taskAssignees = parseAssignees(t.raci_assignee);
        const matches = selectedResponsibles.some((r) => taskAssignees.includes(r));
        if (!matches) return false;
      }
      if (filterTaskStatus !== "ALL" && !t.id.startsWith("root-")) {
        if (t.status !== filterTaskStatus) return false;
      }
      if (filterCheckStatus !== "ALL" && !t.id.startsWith("root-")) {
        const isDelayed =
          (t.actual_finish && t.actual_finish > t.planned_finish) ||
          (t.progress_percent < 100 && todayStr > t.planned_finish);
        if (filterCheckStatus === "DEVIATION" && !isDelayed) return false;
        if (filterCheckStatus === "CLOSE_STAGE" && (t.status === "COMPLETED" || isDelayed)) return false;
        if (filterCheckStatus === "COMPLETED" && t.status !== "COMPLETED") return false;
        if (filterCheckStatus === "PAUSED" && t.status !== "SUSPENDED") return false;
      }
      return true;
    });
  }, [tasks, showCompleted, selectedResponsibles, filterTaskStatus, filterCheckStatus]);

  // Обновление данных паспорта проекта (Блок 1, Шаг 1.2)
  const handleUpdateProject = async (updates: Partial<IProjectPassport>) => {
    if (!selectedProject) return;
    try {
      const updated = await projectApi.updateProject(
        selectedProject.id,
        updates,
      );
      setSelectedProject(updated);
      const all = await projectApi.listProjects();
      setProjects(all);
    } catch (err: any) {
      alert(
        err.response?.data?.detail || "Ошибка при обновлении паспорта проекта",
      );
    }
  };

  // Удаление проекта с мастер-паролем (Блок 1, Шаг 1.3)
  const handleDeleteProject = async (passcode: string) => {
    if (!selectedProject) return;
    await projectApi.deleteProject(selectedProject.id, passcode);
    const all = await projectApi.listProjects();
    setProjects(all);
    if (all.length > 0) {
      setSelectedProject(all[0]);
    } else {
      setSelectedProject(null);
    }
  };

  // Закрытие этапа в 1 клик с мгновенным откликом (0.01 сек)
  const handleQuickCloseStage = async (t: GanttTask) => {
    const todayStr = new Date().toISOString().split("T")[0];

    // Мгновенно обновляем интерфейс без ожидания сети
    setTasks((prev) =>
      prev.map((item) =>
        item.id === t.id
          ? {
              ...item,
              status: "COMPLETED",
              progress_percent: 100,
              actual_finish: todayStr,
              actual_start: item.actual_start || item.planned_start || todayStr,
            }
          : item
      )
    );

    // Фоновая синхронизация с сервером
    try {
      await projectApi.updateTask(t.id, {
        status: "COMPLETED",
        progress_percent: 100,
        actual_finish: todayStr,
        actual_start: t.actual_start || t.planned_start || todayStr,
      });
    } catch (err: any) {
      alert(err.response?.data?.detail || "Ошибка при закрытии этапа на сервере");
    }
  };


  // Интерфейс и стейт Справочника типов объектов (по скриншоту 4)
  interface ObjectTypeItem {
    id: string;
    code: string;
    purpose: string;
    checkMethod: string;
    exampleArea: string;
  }

  const defaultObjectTypesList: ObjectTypeItem[] = [
    { id: "FORMULA_COLUMN", code: "FORMULA_COLUMN", purpose: "Формула во всех строках столбца умной таблицы", checkMethod: "Сравнение формулы столбца таблицы (R1C1 непрерывность)", exampleArea: "Столбец N, Столбец P" },
    { id: "CONDITIONAL_FORMAT", code: "CONDITIONAL_FORMAT", purpose: "Правило условного форматирования ячеек", checkMethod: "Проверка правил FormatConditions (цвета, заливки, формулы)", exampleArea: "Столбец P" },
    { id: "DATA_VALIDATION", code: "DATA_VALIDATION", purpose: "Проверка данных / выпадающий список ячейки", checkMethod: "Проверка списка допустимых значений (xlValidateList)", exampleArea: "Столбец Q" },
    { id: "TABLE_STRUCTURE", code: "TABLE_STRUCTURE", purpose: "Наличие умной таблицы или обязательных столбцов", checkMethod: "Проверка наличия ListObject и названий заголовков", exampleArea: "Таблица Гант" },
    { id: "NAMED_RANGE", code: "NAMED_RANGE", purpose: "Наличие и адрес именованного диапазона книги", checkMethod: "Проверка именованного диапазона Names(xxx)", exampleArea: "ProjectVersion, RootProjectsPath" },
    { id: "CELL_VALUE", code: "CELL_VALUE", purpose: "Фиксированное значение в ячейке шаблона", checkMethod: "Проверка точного скалярного значения ячейки", exampleArea: "B5, Настройки!E14" },
    { id: "VBA_MODULE", code: "VBA_MODULE", purpose: "Наличие и версия программного VBA модуля", checkMethod: "Анализ компонентов VBProject.VBComponents", exampleArea: "Module1, M_PortfolioRefreshMVP" },
  ];

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

  useEffect(() => {
    let isSubscribed = true;

    const syncData = async () => {
      if (projects.length === 0) return;

      if (
        isPortfolioMode ||
        activeTab === "PORTFOLIO_STATE" ||
        activeTab === "CONTROL" ||
        activeTab === "RELATED_TASKS"
      ) {
        await loadAllPortfolioTasks(projects);
      } else if (selectedProject) {
        const data = await projectApi.getProjectTasks(selectedProject.id);
        if (isSubscribed) {
          setTasks(data);
        }
      }
    };

    syncData();

    return () => {
      isSubscribed = false;
    };
  }, [selectedProject?.id, isPortfolioMode, activeTab]);

  const handleRecalculateCPM = async () => {
    if (!selectedProject) return;
    try {
      setIsRecalculating(true);
      await projectApi.recalculateCPM(selectedProject.id);
      await loadTasks(selectedProject.id);
    } catch (err: any) {
      alert(err.response?.data?.detail || "Ошибка при пересчете CPM");
    } finally {
      setIsRecalculating(false);
    }
  };

  const handleSaveTask = async (
    taskId: string,
    updates: Partial<GanttTask>,
  ) => {
    // 1. Оптимистичное мгновенное обновление на экране
    setTasks((prev) =>
      prev.map((t) => (t.id === taskId ? { ...t, ...updates } : t))
    );

    const targetProjId = selectedProject?.id || selectedTask?.project_id;
    try {
      await projectApi.updateTask(taskId, updates);
      if (targetProjId) {
        try {
          await projectApi.recalculateCPM(targetProjId);
        } catch {
          // тихо
        }
      }
    } catch (err: any) {
      alert(err.response?.data?.detail || "Ошибка при сохранении задачи на сервере");
    }
  };

  // Удаление задачи / этапа (Блок 2, Шаг 2.3)
  const handleDeleteTask = async (taskId: string) => {
    try {
      await projectApi.deleteTask(taskId);
      if (selectedProject) {
        try {
          await projectApi.recalculateCPM(selectedProject.id);
        } catch {
          // автопересчет на сервере
        }
        await loadTasks(selectedProject.id);
      } else if (
        isPortfolioMode ||
        activeTab === "PORTFOLIO_STATE" ||
        activeTab === "CONTROL"
      ) {
        await loadAllPortfolioTasks(projects);
      }
    } catch (err: any) {
      alert(err.response?.data?.detail || "Ошибка при удалении задачи");
    }
  };

  const handleSelectTask = (task: GanttTask) => {
    setSelectedTask(task);
    setIsDrawerOpen(true);
  };
  
  const handleStartTour = () => {
    startTechLeadTour({
      setActiveTab: (t) => setActiveTab(t),
      openFirstTaskDrawer: () => {
        if (tasks.length > 0) {
          const firstTask = tasks.find((t) => !t.id.startsWith("root-")) || tasks[0];
          setSelectedTask(firstTask);
          setIsDrawerOpen(true);
        }
      },
    });
  };

  // Если не авторизован — рендерим только полноэкранный портал входа
  if (!currentUser) {
    return (
      <div className="min-h-screen bg-slate-950 text-slate-100 flex flex-col items-center justify-center p-4 antialiased">
        <AuthModal
          isOpen={true}
          isMandatory={true}
          onClose={() => {}}
          onSuccess={(u) => {
            setCurrentUser(u);
            loadProjects();
          }}
        />
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-slate-950 text-slate-100 flex flex-col antialiased">
      {/* Навигационная панель: плавно скрывается при скролле */}
      <header className="bg-slate-900 border-b border-slate-800 relative z-20">
        <div className="max-w-7xl mx-auto px-6 h-16 flex items-center justify-between">
          <div className="flex items-center gap-3">
            <div className="w-10 h-10 rounded-xl bg-gradient-to-tr from-cyan-600 to-teal-400 flex items-center justify-center shadow-lg shadow-cyan-900/40">
              <Layers className="w-5 h-5 text-white" />
            </div>
            <span className="font-extrabold text-lg tracking-tight text-cyan-400">
              Project-Chain
            </span>
          </div>

          {/* Кнопка запуска интерактивного квеста для техлида */}
          <button
            onClick={handleStartTour}
            className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg bg-gradient-to-r from-cyan-600/30 via-blue-600/30 to-purple-600/30 hover:from-cyan-600/50 hover:to-purple-600/50 border border-cyan-500/50 text-cyan-200 text-xs font-bold transition-all shadow-md shadow-cyan-950/60 cursor-pointer animate-pulse"
            title="Запустить интерактивный тур по архитектуре проекта"
          >
            <Sparkles className="w-3.5 h-3.5 text-cyan-400" />
            <span>🎯 Квест для техлида</span>
          </button>

          {/* Селектор проектов (отображается ТОЛЬКО на листе UI_Портфель) */}
          <div className="flex items-center gap-4">
            {activeTab === "UI_PORTFOLIO" && projects.length > 0 && (
              <div className="flex items-center gap-2">
                <FolderKanban className="w-4 h-4 text-slate-400" />
                <select
                  value={isPortfolioMode ? "ALL" : selectedProject?.id || ""}
                  onChange={(e) => {
                    if (e.target.value === "ALL") {
                      setIsPortfolioMode(true);
                      setSelectedProject(null);
                    } else {
                      setIsPortfolioMode(false);
                      const proj = projects.find(
                        (p) => p.id === e.target.value,
                      );
                      if (proj) setSelectedProject(proj);
                    }
                  }}
                  className="bg-slate-800 border border-slate-700 text-slate-200 text-xs sm:text-sm rounded-lg px-3 py-1.5 focus:outline-none focus:border-cyan-500 font-medium max-w-[280px] sm:max-w-md truncate"
                >
                  <option value="ALL">🌐 Весь портфель (5 проектов)</option>
                  {projects.map((p) => (
                    <option key={p.id} value={p.id}>
                      [{p.code}] {p.name}
                    </option>
                  ))}
                </select>

                <button
                  onClick={() => setIsCreateProjOpen(true)}
                  className="flex items-center gap-1 px-2.5 py-1.5 rounded-lg bg-cyan-600/20 hover:bg-cyan-600/30 border border-cyan-500/40 text-cyan-300 text-xs font-semibold transition-colors"
                  title="Завести новый проект в систему"
                >
                  <Plus className="w-3.5 h-3.5" />
                  <span className="hidden md:inline">Новый</span>
                </button>
              </div>
            )}

            {canAccessExcelBridge && (
              <button
                onClick={() => setIsExcelModalOpen(true)}
                className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg bg-emerald-950/60 hover:bg-emerald-900/60 border border-emerald-800/80 text-emerald-400 text-xs font-semibold transition-colors"
                title="Импорт/Экспорт книг Excel"
              >
                <FileSpreadsheet className="w-4 h-4" />
                <span className="hidden sm:inline">Excel Мост</span>
              </button>
            )}

            {currentUser ? (
              <div className="flex items-center gap-2 pl-2 border-l border-slate-800">
                <button
                  onClick={() => setIsProfileModalOpen(true)}
                  className="text-right hidden md:block hover:opacity-80 transition-opacity"
                  title="Открыть настройки личного кабинета"
                >
                  <div className="text-xs font-semibold text-slate-200 underline decoration-slate-600 underline-offset-2">{currentUser.full_name}</div>
                  <div className="text-[10px] font-mono text-cyan-400">{currentUser.role_name || currentUser.role_id}</div>
                </button>
                <button
                  onClick={async () => {
                    await authApi.logout();
                    setCurrentUser(null);
                  }}
                  className="px-2 py-1.5 rounded-lg bg-slate-800 hover:bg-rose-950 hover:text-rose-400 text-slate-400 text-xs font-semibold transition-colors"
                  title="Выйти из аккаунта"
                >
                  Выйти
                </button>
              </div>
            ) : (
              <button
                onClick={() => setIsAuthModalOpen(true)}
                className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg bg-cyan-600 hover:bg-cyan-500 text-white text-xs font-semibold shadow-sm transition-colors"
              >
                <ShieldCheck className="w-3.5 h-3.5" />
                <span>Войти</span>
              </button>
            )}

            <div id="tour-security-controls" className="flex items-center gap-1">
              {/* Кнопка Админ-панели (отображается только при наличии прав) */}
              {canAccessAdmin && (
                <button
                  onClick={() => setActiveTab(activeTab === "ADMIN" ? "UI_PORTFOLIO" : "ADMIN")}
                  className={`p-2 rounded-lg border transition-colors ${
                    activeTab === "ADMIN"
                      ? "bg-cyan-600/30 border-cyan-500 text-cyan-300 shadow-md shadow-cyan-950/50"
                      : "bg-slate-800 hover:bg-slate-700 border-slate-700/60 text-slate-400 hover:text-slate-200"
                  }`}
                  title="Админ-панель (Сотрудники и права RBAC)"
                >
                  <ShieldCheck className="w-4 h-4" />
                </button>
              )}

              {/* Кнопка Time Machine (отображается только при наличии прав) */}
              {canAccessTimeMachine && (
                <button
                  onClick={() => setActiveTab(activeTab === "TIME_MACHINE" ? "UI_PORTFOLIO" : "TIME_MACHINE")}
                  className={`p-2 rounded-lg border transition-colors ${
                    activeTab === "TIME_MACHINE"
                      ? "bg-cyan-600/30 border-cyan-500 text-cyan-300 shadow-md shadow-cyan-950/50"
                      : "bg-slate-800 hover:bg-slate-700 border-slate-700/60 text-slate-400 hover:text-slate-200"
                  }`}
                  title="Time Machine (История действий, откат и корзина)"
                >
                  <History className="w-4 h-4" />
                </button>
              )}
            </div>

            <button
              onClick={loadProjects}
              className="p-2 rounded-lg bg-slate-800 hover:bg-slate-700 text-slate-400 hover:text-slate-200 transition-colors border border-slate-700/60"
              title="Обновить данные"
            >
              <RefreshCw className="w-4 h-4" />
            </button>
          </div>
        </div>

       {/* Панель листов книги: центрированная, однострочная без переносов */}
        <div className="w-full border-t border-slate-700/60 px-6 bg-slate-900/60">
          <div className="max-w-7xl mx-auto flex items-center gap-1.5 flex-nowrap overflow-x-auto py-1">
            <button
              onClick={() => setActiveTab("UI_PORTFOLIO")}
              className={`whitespace-nowrap flex-shrink-0 flex items-center gap-1.5 px-3 py-1.5 rounded-t-lg text-xs font-semibold transition-all border-b-2 ${
                activeTab === "UI_PORTFOLIO"
                  ? "bg-slate-850 text-cyan-400 border-cyan-500 shadow-sm font-bold"
                  : "text-slate-400 hover:text-slate-200 border-transparent hover:bg-slate-800"
              }`}
            >
              <BarChart3 className="w-3.5 h-3.5" />
              <span>UI Портфель</span>
            </button>

            <button
              id="tour-tab-diary"
              onClick={() => setActiveTab("DIARY")}
              className={`whitespace-nowrap flex-shrink-0 flex items-center gap-1.5 px-3 py-1.5 rounded-t-lg text-xs font-semibold transition-all border-b-2 ${
                activeTab === "DIARY"
                  ? "bg-slate-850 text-cyan-400 border-cyan-500 shadow-sm font-bold"
                  : "text-slate-400 hover:text-slate-200 border-transparent hover:bg-slate-800"
              }`}
            >
              <BookOpen className="w-3.5 h-3.5" />
              <span>Дневник</span>
            </button>

            <button
              onClick={() => setActiveTab("PORTFOLIO_STATE")}
              className={`whitespace-nowrap flex-shrink-0 flex items-center gap-1.5 px-3 py-1.5 rounded-t-lg text-xs font-semibold transition-all border-b-2 ${
                activeTab === "PORTFOLIO_STATE"
                  ? "bg-slate-850 text-rose-400 border-rose-500 shadow-sm font-bold"
                  : "text-slate-400 hover:text-slate-200 border-transparent hover:bg-slate-800"
              }`}
            >
              <ShieldAlert className="w-3.5 h-3.5" />
              <span>Состояние (PCC 1.5)</span>
            </button>

            <button
              onClick={() => setActiveTab("CONTROL")}
              className={`whitespace-nowrap flex-shrink-0 flex items-center gap-1.5 px-3 py-1.5 rounded-t-lg text-xs font-semibold transition-all border-b-2 ${
                activeTab === "CONTROL"
                  ? "bg-slate-850 text-amber-400 border-amber-500 shadow-sm font-bold"
                  : "text-slate-400 hover:text-slate-200 border-transparent hover:bg-slate-800"
              }`}
            >
              <CheckSquare className="w-3.5 h-3.5" />
              <span>Контроль (Вехи)</span>
            </button>

            <button
              onClick={() => setActiveTab("RELATED_TASKS")}
              className={`whitespace-nowrap flex-shrink-0 flex items-center gap-1.5 px-3 py-1.5 rounded-t-lg text-xs font-semibold transition-all border-b-2 ${
                activeTab === "RELATED_TASKS"
                  ? "bg-slate-850 text-purple-400 border-purple-500 shadow-sm font-bold"
                  : "text-slate-400 hover:text-slate-200 border-transparent hover:bg-slate-800"
              }`}
            >
              <Network className="w-3.5 h-3.5" />
              <span>Связанные задачи (RTS)</span>
            </button>

            <button
              onClick={() => setActiveTab("SOURCES")}
              className={`whitespace-nowrap flex-shrink-0 flex items-center gap-1.5 px-3 py-1.5 rounded-t-lg text-xs font-semibold transition-all border-b-2 ${
                activeTab === "SOURCES"
                  ? "bg-slate-850 text-emerald-400 border-emerald-500 shadow-sm font-bold"
                  : "text-slate-400 hover:text-slate-200 border-transparent hover:bg-slate-800"
              }`}
            >
              <FileSpreadsheet className="w-3.5 h-3.5" />
              <span>Источники & Excel</span>
            </button>

            <button
              onClick={() => setActiveTab("REFERENCE")}
              className={`whitespace-nowrap flex-shrink-0 flex items-center gap-1.5 px-3 py-1.5 rounded-t-lg text-xs font-semibold transition-all border-b-2 ${
                activeTab === "REFERENCE"
                  ? "bg-slate-850 text-cyan-400 border-cyan-500 shadow-sm font-bold"
                  : "text-slate-400 hover:text-slate-200 border-transparent hover:bg-slate-800"
              }`}
            >
              <BookOpen className="w-3.5 h-3.5" />
              <span>Справочники & Патчи</span>
            </button>

            <button
              onClick={() => setActiveTab("UPDATE_LOG")}
              className={`whitespace-nowrap flex-shrink-0 flex items-center gap-1.5 px-3 py-1.5 rounded-t-lg text-xs font-semibold transition-all border-b-2 ${
                activeTab === "UPDATE_LOG"
                  ? "bg-slate-850 text-cyan-400 border-cyan-500 shadow-sm font-bold"
                  : "text-slate-400 hover:text-slate-200 border-transparent hover:bg-slate-800"
              }`}
            >
              <ClipboardList className="w-3.5 h-3.5" />
              <span>Журнал обновлений</span>
            </button>
          </div>
        </div>
      </header>

      {/* Основной экран: Гант центрируется, контент комфортен на 21:9 */}
      <main className="flex-1 w-full px-4 sm:px-6 py-6 space-y-6">
        {error && (
          <div className="p-4 rounded-xl bg-rose-500/10 border border-rose-500/30 flex items-center gap-3 text-rose-400 text-sm">
            <AlertCircle className="w-5 h-5 flex-shrink-0" />
            <div>
              <span className="font-bold">Ошибка соединения:</span> {error}.
            </div>
          </div>
        )}

        {/* Отображение содержимого в зависимости от активного листа Excel */}
        {activeTab === "UI_PORTFOLIO" && (
          <>
            <div id="tour-health-bar" className="max-w-7xl mx-auto space-y-6">
              <PortfolioHealthBar
                totalProjects={projects.length}
                totalStages={114}
                normCount={63}
                riskCount={23}
                problemCount={28}
                onOpenInspector={() => setIsInspectorOpen(true)}
                onOpenOverlaps={() => setIsOverlapModalOpen(true)}
              />

              {isLoading ? (
                <div className="h-20 flex items-center justify-center gap-2.5 text-slate-400 text-xs bg-slate-900 border border-slate-800 rounded-xl shadow-sm">
                  <RefreshCw className="w-4 h-4 animate-spin text-cyan-500" />
                  <span className="font-medium">Загрузка данных портфеля...</span>
                </div>
              ) : (
                !isPortfolioMode && selectedProject && (
                  <ProjectPassport
                    project={selectedProject}
                    onRecalculateCPM={handleRecalculateCPM}
                    isRecalculating={isRecalculating}
                    onUpdateProject={handleUpdateProject}
                    onDeleteProject={handleDeleteProject}
                  />
                )
              )}
            </div>

            <section id="tour-gantt-chart" className="space-y-3">
                  {/* Заголовок и панель 4 фильтров: фиксированные 1280px по центру */}
                  <div className="max-w-7xl mx-auto bg-slate-900 border border-slate-800 rounded-xl p-3 space-y-3 shadow-md">
                    <div className="flex flex-wrap items-center justify-between gap-3">
                      <div className="flex items-center gap-2.5">
                        <Activity className="w-4 h-4 text-cyan-400" />
                        <h2 className="text-xs font-bold text-slate-200 uppercase tracking-wider">
                          {isPortfolioMode
                            ? `Сводный график (${projects.length} проектов)`
                            : `График [${selectedProject?.code}]`}
                        </h2>
                        {activeFiltersCount > 0 && (
                          <span className="px-2 py-0.5 rounded-full text-[10px] font-extrabold bg-amber-500/20 text-amber-300 border border-amber-500/40">
                            Активные фильтры: {activeFiltersCount}
                          </span>
                        )}
                      </div>

                      <div className="flex items-center gap-2">
                        {/* Кнопка сброса всех фильтров */}
                        {activeFiltersCount > 0 && (
                          <button
                            onClick={handleResetFilters}
                            className="flex items-center gap-1 px-2.5 py-1 rounded-lg bg-slate-800 hover:bg-slate-700 text-slate-400 hover:text-white text-xs transition-colors"
                            title="Сбросить все фильтры"
                          >
                            <RotateCcw className="w-3 h-3" />
                            <span>Сбросить</span>
                          </button>
                        )}

                        <button
                          onClick={() => setIsCreateTaskOpen(true)}
                          className="flex items-center gap-1.5 px-3 py-1 rounded-lg bg-cyan-600 hover:bg-cyan-500 text-white font-semibold text-xs transition-colors shadow-sm"
                          title="Добавить новый этап в график"
                        >
                          <Plus className="w-3.5 h-3.5" />
                          <span>Добавить этап</span>
                        </button>
                      </div>
                    </div>

                    {/* Полоса оперативных фильтров (Ответственные, Статус задачи, Статус проверки) */}
                    <div className="grid grid-cols-1 sm:grid-cols-3 gap-2 pt-2 border-t border-slate-800 text-xs">
                      {/* 1. Мульти-селект Ответственные с галочками и кнопкой + Добавить */}
                      <div className="relative">
                        <button
                          onClick={() => setIsRespDropdownOpen(!isRespDropdownOpen)}
                          className={`w-full px-2.5 py-1.5 rounded-lg border text-xs font-medium flex items-center justify-between transition-colors ${
                            selectedResponsibles.length > 0
                              ? "bg-amber-950/60 border-amber-500/60 text-amber-200"
                              : "bg-slate-800 border-slate-700 text-slate-300"
                          }`}
                        >
                          <span className="truncate">
                            {selectedResponsibles.length === 0
                              ? "Ответственный: Все"
                              : `Ответственные: ${selectedResponsibles.length}`}
                          </span>
                          <ChevronDown className="w-3.5 h-3.5 flex-shrink-0 ml-1" />
                        </button>

                        {isRespDropdownOpen && (
                          <div className="absolute left-0 top-full mt-1 w-64 bg-slate-900 border border-slate-700 rounded-xl shadow-2xl z-50 p-2 space-y-2">
                            <div className="flex items-center justify-between pb-1 border-b border-slate-800 text-[11px] text-slate-400 font-semibold px-1">
                              <span>Выберите исполнителей:</span>
                              {selectedResponsibles.length > 0 && (
                                <button
                                  onClick={() => setSelectedResponsibles([])}
                                  className="text-cyan-400 hover:underline text-[10px]"
                                >
                                  Сбросить
                                </button>
                              )}
                            </div>

                            <div className="max-h-48 overflow-y-auto space-y-1">
                              {allResponsiblesList.map((resp) => {
                                const isChecked = selectedResponsibles.includes(resp);
                                const isEditing = editingRespName === resp;
                                const taskCount = tasks.filter((t) => t.raci_assignee === resp && !t.id.startsWith("root-")).length;

                                if (isEditing) {
                                  return (
                                    <div key={resp} className="flex items-center gap-1 p-1 bg-slate-800 rounded">
                                      <input
                                        type="text"
                                        value={editRespInput}
                                        autoFocus
                                        onChange={(e) => setEditRespInput(e.target.value)}
                                        className="w-full px-2 py-0.5 bg-slate-950 border border-slate-700 rounded text-xs text-cyan-300"
                                      />
                                      <button
                                        onClick={() => handleRenameResponsible(resp, editRespInput)}
                                        className="px-1.5 py-0.5 bg-cyan-600 text-white rounded text-[10px] font-bold"
                                      >
                                        OK
                                      </button>
                                      <button
                                        onClick={() => setEditingRespName(null)}
                                        className="px-1 text-slate-400 hover:text-white text-xs"
                                      >
                                        ✕
                                      </button>
                                    </div>
                                  );
                                }

                                return (
                                  <div
                                    key={resp}
                                    className="flex items-center justify-between p-1.5 rounded hover:bg-slate-800 group/resp transition-colors"
                                  >
                                    <label className="flex items-center gap-2 cursor-pointer text-xs text-slate-200 select-none flex-1 min-w-0">
                                      <input
                                        type="checkbox"
                                        checked={isChecked}
                                        onChange={() => {
                                          if (isChecked) {
                                            setSelectedResponsibles((prev) => prev.filter((r) => r !== resp));
                                          } else {
                                            setSelectedResponsibles((prev) => [...prev, resp]);
                                          }
                                        }}
                                        className="rounded bg-slate-950 border-slate-700 text-purple-500 focus:ring-0 w-3.5 h-3.5"
                                      />
                                      <span className="truncate">{resp}</span>
                                      <span className="text-[10px] text-slate-500 font-mono">({taskCount})</span>
                                    </label>

                                    <div className="flex items-center gap-1 opacity-0 group-hover/resp:opacity-100 transition-opacity ml-1">
                                      <button
                                        onClick={(e) => {
                                          e.stopPropagation();
                                          setEditingRespName(resp);
                                          setEditRespInput(resp);
                                        }}
                                        className="p-0.5 text-slate-400 hover:text-cyan-300 rounded"
                                        title="Переименовать ответственного во всех задачах"
                                      >
                                        <Pencil className="w-3 h-3" />
                                      </button>
                                      <button
                                        onClick={(e) => {
                                          e.stopPropagation();
                                          handleDeleteResponsible(resp);
                                        }}
                                        className="p-0.5 text-slate-400 hover:text-rose-400 rounded"
                                        title="Удалить ответственного"
                                      >
                                        <Trash2 className="w-3 h-3" />
                                      </button>
                                    </div>
                                  </div>
                                );
                              })}
                            </div>

                            {/* Управление сотрудниками регламентировано через Админ-панель */}
                            <div className="pt-2 border-t border-slate-800">
                              {canAccessAdmin ? (
                                <button
                                  onClick={() => {
                                    setIsRespDropdownOpen(false);
                                    setActiveTab("ADMIN");
                                  }}
                                  className="w-full py-1.5 text-center rounded bg-slate-800 hover:bg-slate-700 text-cyan-400 hover:text-cyan-300 text-[11px] font-semibold flex items-center justify-center gap-1.5 transition-colors"
                                  title="Перейти в Админ-панель для управления учетными записями и должностями"
                                >
                                  <Users className="w-3.5 h-3.5" />
                                  <span>Сотрудники в Админ-панели ↗</span>
                                </button>
                              ) : (
                                <p className="text-[10px] text-slate-500 text-center italic py-1">
                                  Добавление сотрудников — через Администратора
                                </p>
                              )}
                            </div>
                          </div>
                        )}
                      </div>

                      {/* 3. Селектор Статус задачи */}
                      <div>
                        <select
                          value={filterTaskStatus}
                          onChange={(e) => setFilterTaskStatus(e.target.value)}
                          className={`w-full px-2.5 py-1.5 rounded-lg border text-xs font-medium transition-colors ${
                            filterTaskStatus !== "ALL"
                              ? "bg-amber-950/60 border-amber-500/60 text-amber-200"
                              : "bg-slate-800 border-slate-700 text-slate-300"
                          }`}
                        >
                          <option value="ALL">Статус задачи: Все</option>
                          <option value="IN_PROGRESS">В работе</option>
                          <option value="NOT_STARTED">Не начата</option>
                          <option value="COMPLETED">Завершена</option>
                          <option value="SUSPENDED">На паузе</option>
                        </select>
                      </div>

                      {/* 4. Селектор Статус проверки */}
                      <div>
                        <select
                          value={filterCheckStatus}
                          onChange={(e) => setFilterCheckStatus(e.target.value)}
                          className={`w-full px-2.5 py-1.5 rounded-lg border text-xs font-medium transition-colors ${
                            filterCheckStatus !== "ALL"
                              ? "bg-amber-950/60 border-amber-500/60 text-amber-200"
                              : "bg-slate-800 border-slate-700 text-slate-300"
                          }`}
                        >
                          <option value="ALL">Проверка: Все</option>
                          <option value="CLOSE_STAGE">Закрой этап</option>
                          <option value="DEVIATION">Отклонение</option>
                          <option value="COMPLETED">Завершено</option>
                          <option value="PAUSED">На паузе</option>
                        </select>
                      </div>
                    </div>
                  </div>

                  <GanttChart
                    tasks={filteredGanttTasks}
                    selectedTaskId={selectedTask?.id}
                    onSelectTask={handleSelectTask}
                    isPortfolioMode={isPortfolioMode}
                    showCompleted={showCompleted}
                    onToggleShowCompleted={() => setShowCompleted(!showCompleted)}
                    activeLocks={
                      isDrawerOpen && selectedTask
                        ? { [selectedTask.id]: currentUser?.full_name || currentUser?.email || "Редактируется" }
                        : {}
                    }
                  />
                </section>
              </>
            )}

        {/* Витрина листа «Дневник производства работ» (11 колонок по Фото 1) */}
        {activeTab === "DIARY" && (
          <ProductionDiaryView currentProject={selectedProject} projects={projects} />
        )}

        {activeTab === "PORTFOLIO_STATE" && (
          <PortfolioStateView
            projects={projects}
            tasks={tasks}
            selectedProject={selectedProject}
          />
        )}

          {activeTab === "CONTROL" && (
          <ControlMilestonesView
            tasks={tasks}
            projects={projects}
            selectedProject={selectedProject}
            onOpenCreateTask={() => setIsCreateTaskOpen(true)}
          />
        )}

        {activeTab === "RELATED_TASKS" && (
          <RelatedTasksView
            projects={projects}
            tasks={tasks}
            selectedProject={selectedProject}
            onSelectTask={handleSelectTask}
          />
        )}

        {activeTab === "SOURCES" && (
          <SourcesView
            projects={projects}
            tasks={tasks}
            selectedProject={selectedProject}
            onOpenExcelModal={() => setIsExcelModalOpen(true)}
          />
        )}
        
        {/* Витрина листа «Справочники & Патчноут» */}
        {activeTab === "REFERENCE" && <ReferenceCatalogView />}
        
        {/* Витрина листа «Админ-панель» */}
        {activeTab === "ADMIN" && <AdminConsole />}

        {/* Витрина листа «Time Machine (Аудит и откат)» */}
        {activeTab === "TIME_MACHINE" && <TimeMachineView />}

        {/* Витрина листа «Журнал обновления» */}
        {activeTab === "UPDATE_LOG" && (
          <UpdateLogView projects={projects} tasks={tasks} />
        )}
      </main>

      {isDrawerOpen && selectedTask && (
        <TaskDrawer
          task={selectedTask}
          isOpen={isDrawerOpen}
          currentUserId={currentUser?.email || currentUser?.full_name || "user"}
          onClose={() => setIsDrawerOpen(false)}
          onSave={handleSaveTask}
          onDelete={handleDeleteTask}
          onRenameResponsible={handleRenameResponsible}
          onDeleteResponsible={handleDeleteResponsible}
          allResponsiblesList={allResponsiblesList}
          availableTasks={tasks.filter(
            (t) => t.project_id === selectedTask.project_id && t.id !== selectedTask.id && !t.id.startsWith("root-")
          )}
        />
      )}

      <DelayInspectorModal
        isOpen={isInspectorOpen}
        onClose={() => setIsInspectorOpen(false)}
        tasks={tasks}
        projectName={
          selectedProject
            ? `[${selectedProject.code}] ${selectedProject.name}`
            : "Весь портфель автоматизации"
        }
      />

      <OverlapInspectorModal
        isOpen={isOverlapModalOpen}
        onClose={() => setIsOverlapModalOpen(false)}
      />

      <ExcelBridgeModal
        isOpen={isExcelModalOpen}
        onClose={() => setIsExcelModalOpen(false)}
        currentProject={selectedProject}
        tasks={tasks}
        onImportSuccess={async () => {
          await loadProjects();
          if (selectedProject?.id) {
            await loadTasks(selectedProject.id);
          }
        }}
      />

      <AuthModal
        isOpen={isAuthModalOpen}
        onClose={() => setIsAuthModalOpen(false)}
        onSuccess={(user) => {
          setCurrentUser(user);
          loadProjects();
        }}
      />

      <ProfileSettingsModal
        isOpen={isProfileModalOpen}
        onClose={() => setIsProfileModalOpen(false)}
        currentUser={currentUser}
        onUserUpdated={(u) => setCurrentUser(u)}
        onUserDeleted={() => {
          setCurrentUser(null);
          authApi.logout();
        }}
      />
  <CreateTaskModal
        isOpen={isCreateTaskOpen}
        onClose={() => setIsCreateTaskOpen(false)}
        projects={projects}
        tasks={tasks}
        selectedProject={selectedProject}
        onTaskCreated={() => {
          if (
            isPortfolioMode ||
            activeTab === "PORTFOLIO_STATE" ||
            activeTab === "CONTROL"
          ) {
            loadAllPortfolioTasks(projects);
          } else if (selectedProject) {
            loadTasks(selectedProject.id);
          }
        }}
      />

      <CreateProjectModal
        isOpen={isCreateProjOpen}
        onClose={() => setIsCreateProjOpen(false)}
        onProjectCreated={async (created) => {
          const updated = await projectApi.listProjects();
          setProjects(updated);
          const matched = updated.find((p) => p.code === created.code) || created;
          setSelectedProject(matched);
          setIsPortfolioMode(false);
        }}
      />
    </div>
  );
};

export default App;
