import React, { useMemo, useState, useRef, useEffect } from "react";
import {
  Lock,
  Flame,
  Users,
  ChevronRight,
  ChevronDown,
  Hand,
  ChevronsLeft,
  ChevronLeft,
  ChevronsRight,
  Minimize2,
  Maximize2,
  ZoomIn,
  ZoomOut,
  GripVertical,
  SlidersHorizontal,
  Minus,
  Calendar,
} from "lucide-react";
import { GanttTask } from "../../types";

interface GanttChartProps {
  tasks: GanttTask[];
  selectedTaskId?: string;
  onSelectTask?: (task: GanttTask) => void;
  onCloseStage?: (task: GanttTask) => void;
  isPortfolioMode?: boolean;
  activeLocks?: Record<string, string>;
  showCompleted?: boolean;
  onToggleShowCompleted?: () => void;
}

export const GanttChart: React.FC<GanttChartProps> = ({
  tasks,
  selectedTaskId,
  onSelectTask,
  onCloseStage,
  isPortfolioMode = false,
  activeLocks = {},
  showCompleted = true,
  onToggleShowCompleted,
}) => {
  // Чтение сохраненных настроек пользователя из браузера
  const savedPrefs = useMemo(() => {
    if (typeof window === "undefined") return null;
    try {
      const item = localStorage.getItem("prochain_ui_prefs_v1");
      return item ? JSON.parse(item) : null;
    } catch {
      return null;
    }
  }, []);

  const [collapsedWbs, setCollapsedWbs] = useState<Set<string>>(new Set());
  const [showCpmArrows, setShowCpmArrows] = useState<boolean>(false);
  const [scaleMode, setScaleMode] = useState<"DAYS" | "WEEKS" | "MONTHS">(
    () => savedPrefs?.scaleMode || "DAYS",
  );
  const [dayWidth, setDayWidth] = useState<number>(() => savedPrefs?.dayWidth || 36);
  const [timelineHorizon, setTimelineHorizon] = useState<string>(
    () => savedPrefs?.timelineHorizon || "AUTO",
  );

  // Динамическое растяжение шкалы: ровно 7 дней или ровно 30 дней во всю ширину видимого окна
  const handleSelectScaleMode = (mode: "DAYS" | "WEEKS" | "MONTHS") => {
    setScaleMode(mode);
    const container = timelineScrollRef.current;
    const viewportWidth = container ? container.clientWidth : 700;

    if (mode === "WEEKS") {
      // Ровно 7 дней (1 неделя) растягиваются на всю ширину окна
      const newWidth = Math.max(40, Math.floor(viewportWidth / 7));
      setDayWidth(newWidth);
      setTimeout(() => {
        if (!timelineScrollRef.current) return;
        const todayIdx = todayPos.index;
        const currentDay = timelineDays[todayIdx] || new Date();
        const dayOfWeek = (currentDay.getDay() + 6) % 7; // 0 = Пн, 6 = Вс
        const mondayIdx = Math.max(0, todayIdx - dayOfWeek);
        timelineScrollRef.current.scrollTo({ left: mondayIdx * newWidth, behavior: "smooth" });
      }, 40);
    } else if (mode === "MONTHS") {
      // Ровно 30 дней (1 месяц) растягиваются на всю ширину окна
      const newWidth = Math.max(14, Math.floor(viewportWidth / 30));
      setDayWidth(newWidth);
      setTimeout(() => {
        if (!timelineScrollRef.current) return;
        const todayIdx = todayPos.index;
        const currentDay = timelineDays[todayIdx] || new Date();
        const firstOfMonthIdx = Math.max(0, todayIdx - (currentDay.getDate() - 1));
        timelineScrollRef.current.scrollTo({ left: firstOfMonthIdx * newWidth, behavior: "smooth" });
      }, 40);
    } else {
      // Детальный масштаб по дням
      setDayWidth(36);
      setTimeout(() => scrollToToday(), 40);
    }
  };  const initialCenteredRef = useRef<boolean>(false);

  const normalizeResponsibleName = (raw: string): string => {
    return raw.trim().replace(/\s+/g, " ");
  };

  // Хелпер парсинга и нормализации мульти-ответственных
  const parseAssignees = (raw?: string): string[] => {
    if (!raw || raw === "—" || raw === "Не назначен") return [];
    return raw
      .split(/[\/,+;]\s*|\s+и\s+/)
      .map((s) => normalizeResponsibleName(s))
      .filter((s) => s && s !== "—" && s !== "Не назначен");
  };

  // Компактные ширины колонок таблицы (WBS, Название, Отв, План старт, План финиш, Факт финиш, Статус, ±дн)
  const [colWidths, setColWidths] = useState(() => ({
    wbs: Number(savedPrefs?.colWidths?.wbs) || 46,
    name: Number(savedPrefs?.colWidths?.name) || 200,
    assignee: Number(savedPrefs?.colWidths?.assignee) || 90,
    plannedStart: Number(savedPrefs?.colWidths?.plannedStart) || 58,
    plannedFinish: Number(savedPrefs?.colWidths?.plannedFinish) || 58,
    actualFinish: Number(savedPrefs?.colWidths?.actualFinish) || 58,
    status: Number(savedPrefs?.colWidths?.status) || 70,
    float: Number(savedPrefs?.colWidths?.float) || 30,
  }));

  // Жесткий расчет ширины таблицы с минимальными зазорами
  const tableWidth = useMemo(() => {
    return (
      (colWidths.wbs || 46) +
      (colWidths.name || 200) +
      (colWidths.assignee || 90) +
      (colWidths.plannedStart || 58) +
      (colWidths.plannedFinish || 58) +
      (colWidths.actualFinish || 58) +
      (colWidths.status || 70) +
      (colWidths.float || 30)
    );
  }, [
    colWidths.wbs,
    colWidths.name,
    colWidths.assignee,
    colWidths.plannedStart,
    colWidths.plannedFinish,
    colWidths.actualFinish,
    colWidths.status,
    colWidths.float,
  ]);

  const getCompactLockOwner = (raw: string) => {
    if (!raw) return "";
    if (raw.includes("Главный Администратор") || raw.toLowerCase().includes("admin")) return "Админ";
    if (raw.includes("@")) return raw.split("@")[0].slice(0, 8);
    const parts = raw.trim().split(/\s+/);
    if (parts.length >= 2) return `${parts[0]} ${parts[1][0]}.`;
    return raw.slice(0, 10);
  };

  // Определение оперативного статуса ячейки (по скриншоту 5 из Excel)
  const getTaskCheckStatusInfo = (t: GanttTask) => {
    const todayStr = new Date().toISOString().split("T")[0];
    const isOverrun =
      (t.actual_finish && t.actual_finish > t.planned_finish) ||
      (t.progress_percent < 100 && todayStr > t.planned_finish);

    if (isOverrun) {
      return { label: "Отклонение", cls: "text-rose-400 font-bold" };
    }
    if (t.status === "SUSPENDED") {
      return { label: "⏸ На паузе", cls: "text-slate-400 font-medium" };
    }
    if (t.status === "COMPLETED" || t.progress_percent >= 100) {
      return { label: "✓ Завершено", cls: "text-emerald-400 font-semibold" };
    }
    if (
      (t.status === "IN_PROGRESS" || t.progress_percent > 0) &&
      !t.actual_start
    ) {
      return { label: "Укажи дату", cls: "text-amber-400 font-semibold" };
    }
    if (t.status === "IN_PROGRESS" && t.progress_percent >= 75) {
      return { label: "Закрой этап", cls: "text-amber-300 font-bold" };
    }
    if (
      todayStr >= t.planned_start &&
      t.progress_percent === 0 &&
      !t.actual_start
    ) {
      return { label: "Проверь", cls: "text-amber-400 font-medium" };
    }
    if (t.status === "IN_PROGRESS" || t.progress_percent > 0) {
      return { label: "В работе", cls: "text-cyan-400 font-medium" };
    }
    return { label: "Не начата", cls: "text-slate-500 font-normal" };
  };

  // Стейт растягивания всего Гантта за правый край
  const containerRef = useRef<HTMLDivElement>(null);
  const [ganttContainerWidth, setGanttContainerWidth] = useState<number | null>(
    () => {
      if (typeof window === "undefined") return null;
      const saved = localStorage.getItem("prochain_gantt_box_width_v1");
      return saved ? Number(saved) : null;
    },
  );
  const isResizingBoxRef = useRef(false);
  const boxStartXRef = useRef(0);
  const boxStartWidthRef = useRef(0);

  const startBoxResize = (e: React.MouseEvent) => {
    e.preventDefault();
    e.stopPropagation();
    if (!containerRef.current) return;
    isResizingBoxRef.current = true;
    boxStartXRef.current = e.clientX;
    boxStartWidthRef.current = containerRef.current.clientWidth;
    document.body.style.cursor = "ew-resize";
    document.body.style.userSelect = "none";
  };

  const toggleMaximizeGantt = () => {
    if (ganttContainerWidth && ganttContainerWidth > 1280) {
      setGanttContainerWidth(1280);
      localStorage.setItem("prochain_gantt_box_width_v1", "1280");
    } else if (typeof window !== "undefined") {
      const fullWidth = Math.max(1280, window.innerWidth - 48);
      setGanttContainerWidth(fullWidth);
      localStorage.setItem("prochain_gantt_box_width_v1", String(fullWidth));
    }
  };

  // Стейт ресайза колонок с белым списком
  const resizingColRef = useRef<string | null>(null);
  const startXRef = useRef<number>(0);
  const startWidthRef = useRef<number>(0);

  // Синхронная подсветка всей строки через левую таблицу и правый Гант
  const [hoveredTaskId, setHoveredTaskId] = useState<string | null>(null);

  // Расчет реального Float: задержка и срыв дедлайна уводят Float в отрицательную зону
  const getEffectiveFloat = (t: GanttTask) => {
    const today = new Date();
    const pFinish = new Date(t.planned_finish);
    const aFinish = t.actual_finish ? new Date(t.actual_finish) : null;
    let delayDays = 0;

    if (t.progress_percent < 100 && today > pFinish) {
      delayDays = Math.ceil(
        (today.getTime() - pFinish.getTime()) / (1000 * 60 * 60 * 24),
      );
    } else if (aFinish && aFinish > pFinish) {
      delayDays = Math.ceil(
        (aFinish.getTime() - pFinish.getTime()) / (1000 * 60 * 60 * 24),
      );
    }

    if (delayDays > 0) {
      return t.total_float - delayDays; // уходит в минус, например -14 или -75
    }
    return t.total_float;
  };

  // Стейт перемещения и сворачивания Floating HUD (восстанавливается из памяти)
  const [isHudCollapsed, setIsHudCollapsed] = useState<boolean>(
    () => savedPrefs?.isHudCollapsed || false,
  );
  const [hudPos, setHudPos] = useState<{ x: number; y: number }>(() => {
    if (savedPrefs?.hudPos) return savedPrefs.hudPos;
    return {
      x:
        typeof window !== "undefined"
          ? Math.max(20, Math.round(window.innerWidth / 2 - 250))
          : 100,
      y:
        typeof window !== "undefined"
          ? Math.max(20, window.innerHeight - 90)
          : 500,
    };
  });

  // Автосохранение настроек в память браузера при любых изменениях
  useEffect(() => {
    try {
      localStorage.setItem(
        "prochain_ui_prefs_v1",
        JSON.stringify({
          colWidths,
          dayWidth,
          scaleMode,
          hudPos,
          isHudCollapsed,
          timelineHorizon,
        }),
      );
    } catch {
      // тихо
    }
  }, [colWidths, dayWidth, scaleMode, hudPos, isHudCollapsed, timelineHorizon]);

  const isDraggingHudRef = useRef(false);
  const hudDragOffsetRef = useRef<{ x: number; y: number }>({ x: 0, y: 0 });

  const startHudDrag = (e: React.MouseEvent) => {
    if (e.button !== 0) return;
    isDraggingHudRef.current = true;
    hudDragOffsetRef.current = {
      x: e.clientX - hudPos.x,
      y: e.clientY - hudPos.y,
    };
    e.preventDefault();
    e.stopPropagation();
  };

  useEffect(() => {
    const onMouseMove = (e: MouseEvent) => {
      if (!isDraggingHudRef.current) return;
      const newX = Math.max(
        10,
        Math.min(
          window.innerWidth - 80,
          e.clientX - hudDragOffsetRef.current.x,
        ),
      );
      const newY = Math.max(
        10,
        Math.min(
          window.innerHeight - 50,
          e.clientY - hudDragOffsetRef.current.y,
        ),
      );
      setHudPos({ x: newX, y: newY });
    };

    const onMouseUp = () => {
      isDraggingHudRef.current = false;
    };

    window.addEventListener("mousemove", onMouseMove);
    window.addEventListener("mouseup", onMouseUp);
    return () => {
      window.removeEventListener("mousemove", onMouseMove);
      window.removeEventListener("mouseup", onMouseUp);
    };
  }, []);

  // Стейт панорамирования таймлайна (Zero-Latency Drag-to-scroll)
  const timelineScrollRef = useRef<HTMLDivElement>(null);
  const headerScrollRef = useRef<HTMLDivElement>(null);
  const isPanningRef = useRef(false);
  const panStartXRef = useRef(0);
  const panScrollLeftRef = useRef(0);
  const hasMovedRef = useRef(false);
  const rafIdRef = useRef<number | null>(null);

  const startResizing = (
    colKey: keyof typeof colWidths,
    e: React.MouseEvent,
  ) => {
    e.preventDefault();
    e.stopPropagation();
    resizingColRef.current = colKey;
    startXRef.current = e.clientX;
    startWidthRef.current = colWidths[colKey];
    document.body.style.cursor = "col-resize";
    document.body.style.userSelect = "none";
  };

  useEffect(() => {
    const validKeys = [
      "wbs",
      "name",
      "assignee",
      "plannedStart",
      "plannedFinish",
      "actualFinish",
      "status",
      "float",
    ];

    const handleMouseMove = (e: MouseEvent) => {
      // 1. Симметричное растягивание Гантта в обе стороны (минимум 1280px)
      if (isResizingBoxRef.current) {
        // Умножаем на 2, чтобы при центрировании мышь оставалась ровно на границе
        const diff = (e.clientX - boxStartXRef.current) * 2;
        const maxAvailable = window.innerWidth - 48;
        const newBoxWidth = Math.max(
          1280,
          Math.min(maxAvailable, boxStartWidthRef.current + diff),
        );
        setGanttContainerWidth(newBoxWidth);
        localStorage.setItem(
          "prochain_gantt_box_width_v1",
          String(newBoxWidth),
        );
        return;
      }

      // 2. Ресайз колонок таблицы
      const col = resizingColRef.current;
      if (!col || !validKeys.includes(col)) return;

      const diff = e.clientX - startXRef.current;
      const newWidth = Math.max(40, startWidthRef.current + diff);

      setColWidths(
        (prev) =>
          ({
            ...prev,
            [col]: newWidth,
          }) as typeof prev,
      );
    };

    const handleMouseUp = () => {
      if (isResizingBoxRef.current) {
        isResizingBoxRef.current = false;
        document.body.style.cursor = "default";
        document.body.style.userSelect = "auto";
      }
      if (resizingColRef.current) {
        resizingColRef.current = null;
        document.body.style.cursor = "default";
        document.body.style.userSelect = "auto";
      }
    };

    window.addEventListener("mousemove", handleMouseMove);
    window.addEventListener("mouseup", handleMouseUp);
    return () => {
      window.removeEventListener("mousemove", handleMouseMove);
      window.removeEventListener("mouseup", handleMouseUp);
    };
  }, []);

  // Нативный аппаратный Drag-to-Scroll (PointerCapture + Direct Synchronous Dispatch)
  useEffect(() => {
    const el = timelineScrollRef.current;
    if (!el) return;

    const onPointerDown = (e: PointerEvent) => {
      if (e.button !== 0) return;
      isPanningRef.current = true;
      hasMovedRef.current = false;
      panStartXRef.current = e.clientX;
      panScrollLeftRef.current = el.scrollLeft;
      el.style.scrollBehavior = "auto";
    };

    const onPointerMove = (e: PointerEvent) => {
      if (!isPanningRef.current) return;
      const diff = e.clientX - panStartXRef.current;
      if (Math.abs(diff) > 8) {
        hasMovedRef.current = true;
        el.style.cursor = "grabbing";
        document.body.style.userSelect = "none";
      }
      el.scrollLeft = panScrollLeftRef.current - diff;
      if (headerScrollRef.current) {
        headerScrollRef.current.scrollLeft = el.scrollLeft;
      }
    };

    const onNativeScroll = () => {
      if (headerScrollRef.current && el) {
        headerScrollRef.current.scrollLeft = el.scrollLeft;
      }
    };
    el.addEventListener("scroll", onNativeScroll, { passive: true });

    const onPointerUp = (e: PointerEvent) => {
      if (!isPanningRef.current) return;
      isPanningRef.current = false;
      el.style.cursor = "grab";
      document.body.style.userSelect = "";
      try {
        if (el.hasPointerCapture(e.pointerId)) {
          el.releasePointerCapture(e.pointerId);
        }
      } catch {}
    };

    el.addEventListener("pointerdown", onPointerDown, { passive: true });
    el.addEventListener("pointermove", onPointerMove, { passive: true });
    el.addEventListener("pointerup", onPointerUp, { passive: true });
    el.addEventListener("pointercancel", onPointerUp, { passive: true });

    return () => {
      el.removeEventListener("pointerdown", onPointerDown);
      el.removeEventListener("pointermove", onPointerMove);
      el.removeEventListener("pointerup", onPointerUp);
      el.removeEventListener("pointercancel", onPointerUp);
      el.removeEventListener("scroll", onNativeScroll);
    };
  }, []);

  // Определение родительских узлов WBS (задачи, имеющие подэтапы или сводные строки проектов)
  const parentWbsSet = useMemo(() => {
    const parents = new Set<string>();
    tasks.forEach((t) => {
      const hasSubtasks = tasks.some(
        (other) =>
          other.id !== t.id && other.wbs_code.startsWith(t.wbs_code + "."),
      );
      if (
        hasSubtasks ||
        t.task_type === "SUMMARY" ||
        t.id.startsWith("root-")
      ) {
        parents.add(t.wbs_code);
      }
    });
    return parents;
  }, [tasks]);

  const toggleCollapse = (wbs: string, e: React.MouseEvent) => {
    e.stopPropagation();
    setCollapsedWbs((prev) => {
      const next = new Set(prev);
      if (next.has(wbs)) next.delete(wbs);
      else next.add(wbs);
      return next;
    });
  };

  const visibleTasks = useMemo(() => {
    return tasks.filter((task) => {
      const parts = task.wbs_code.split(".");
      for (let i = 1; i < parts.length; i++) {
        const ancestorWbs = parts.slice(0, i).join(".");
        if (collapsedWbs.has(ancestorWbs)) return false;
      }
      return true;
    });
  }, [tasks, collapsedWbs]);

  // Сетка дат
  const { minDate, maxDate, totalDays, timelineDays } = useMemo(() => {
    if (!visibleTasks.length) {
      const today = new Date();
      return {
        minDate: today,
        maxDate: today,
        totalDays: 1,
        timelineDays: [today],
      };
    }

    let min = new Date(visibleTasks[0].planned_start);
    let max = new Date(visibleTasks[0].planned_finish);

    visibleTasks.forEach((t) => {
      const pStart = new Date(t.planned_start);
      const pFinish = new Date(t.planned_finish);
      if (pStart < min) min = pStart;
      if (pFinish > max) max = pFinish;

      if (t.actual_start) {
        const aStart = new Date(t.actual_start);
        if (aStart < min) min = aStart;
      }
      if (t.actual_finish) {
        const aFinish = new Date(t.actual_finish);
        if (aFinish > max) max = aFinish;
      }
    });

    // Умный горизонт планирования с гарантией от срезания задач
    const fixedStart = new Date(min);
    fixedStart.setDate(fixedStart.getDate() - 45);
    let fixedEnd = new Date(max);
    fixedEnd.setDate(fixedEnd.getDate() + 90);

    const today = new Date();
    if (timelineHorizon === "+1Y") {
      const hEnd = new Date(today);
      hEnd.setFullYear(hEnd.getFullYear() + 1);
      if (hEnd > fixedEnd) fixedEnd = hEnd;
    } else if (timelineHorizon === "+2Y") {
      const hEnd = new Date(today);
      hEnd.setFullYear(hEnd.getFullYear() + 2);
      if (hEnd > fixedEnd) fixedEnd = hEnd;
    } else if (timelineHorizon === "+3Y") {
      const hEnd = new Date(today);
      hEnd.setFullYear(hEnd.getFullYear() + 3);
      if (hEnd > fixedEnd) fixedEnd = hEnd;
    } else if (timelineHorizon === "+5Y") {
      const hEnd = new Date(today);
      hEnd.setFullYear(hEnd.getFullYear() + 5);
      if (hEnd > fixedEnd) fixedEnd = hEnd;
    }

    const diffTime = Math.abs(fixedEnd.getTime() - fixedStart.getTime());
    const total = Math.ceil(diffTime / (1000 * 60 * 60 * 24)) + 1;

    const days: Date[] = [];
    for (let i = 0; i < total; i++) {
      const d = new Date(fixedStart);
      d.setDate(d.getDate() + i);
      days.push(d);
    }

    return {
      minDate: fixedStart,
      maxDate: fixedEnd,
      totalDays: total,
      timelineDays: days,
    };
  }, [visibleTasks]);

  // Двухъярусные блоки месяцев (СЕН 2026, ОКТ 2026) на всю ширину месяца
  const monthHeaderBlocks = useMemo(() => {
    const blocks: Array<{ label: string; daysCount: number }> = [];
    if (!timelineDays.length) return blocks;

    const MONTHS_SHORT = ["ЯНВ", "ФЕВ", "МАР", "АПР", "МАЙ", "ИЮН", "ИЮЛ", "АВГ", "СЕН", "ОКТ", "НОЯ", "ДЕК"];

    let currentMonth = timelineDays[0].getMonth();
    let currentYear = timelineDays[0].getFullYear();
    let count = 0;

    for (let i = 0; i < timelineDays.length; i++) {
      const d = timelineDays[i];
      if (d.getMonth() === currentMonth && d.getFullYear() === currentYear) {
        count++;
      } else {
        blocks.push({
          label: `${MONTHS_SHORT[currentMonth]} ${currentYear}`,
          daysCount: count,
        });
        currentMonth = d.getMonth();
        currentYear = d.getFullYear();
        count = 1;
      }
    }
    blocks.push({
      label: `${MONTHS_SHORT[currentMonth]} ${currentYear}`,
      daysCount: count,
    });

    return blocks;
  }, [timelineDays]);

  // Координаты красной линии «Сегодня»
  const todayPos = useMemo(() => {
    const today = new Date();
    today.setHours(0, 0, 0, 0);
    const start = new Date(minDate);
    start.setHours(0, 0, 0, 0);
    const diff = Math.floor(
      (today.getTime() - start.getTime()) / (1000 * 60 * 60 * 24),
    );
    return {
      index: diff,
      left: diff * dayWidth + Math.floor(dayWidth / 2),
    };
  }, [minDate, dayWidth]);

  // Расчет границ между 31 декабря и 1 января (пролистанный год)
  const yearTransitions = useMemo(() => {
    const list: { left: number; passedYear: number; nextYear: number }[] = [];
    for (let i = 1; i < timelineDays.length; i++) {
      const prev = timelineDays[i - 1];
      const curr = timelineDays[i];
      if (curr.getFullYear() !== prev.getFullYear()) {
        list.push({
          left: i * dayWidth,
          passedYear: prev.getFullYear(),
          nextYear: curr.getFullYear(),
        });
      }
    }
    return list;
  }, [timelineDays, dayWidth]);

  // Центрирование на «Сегодня»
  const scrollToToday = () => {
    if (!timelineScrollRef.current) return;
    const target = todayPos.left - timelineScrollRef.current.clientWidth / 2;
    timelineScrollRef.current.scrollTo({
      left: Math.max(0, target),
      behavior: "smooth",
    });
  };

  // Шаговый скролл окна календаря (MoveLeft / MoveRight / PageLeft / PageRight)
  const scrollByDays = (days: number) => {
    if (!timelineScrollRef.current) return;
    timelineScrollRef.current.scrollBy({
      left: days * dayWidth,
      behavior: "smooth",
    });
  };

  // Якорный зум: удерживает видимый центр таймлайна на месте при изменении масштаба
  const zoomCenterDaysRef = useRef<number | null>(null);

  const handleZoom = (delta: number) => {
    if (!timelineScrollRef.current) return;
    const container = timelineScrollRef.current;
    // Запоминаем индекс дня ровно посередине видимого экрана
    zoomCenterDaysRef.current =
      (container.scrollLeft + container.clientWidth / 2) / dayWidth;
    setDayWidth((prev) => Math.max(14, Math.min(72, prev + delta)));
  };

  useEffect(() => {
    if (zoomCenterDaysRef.current !== null && timelineScrollRef.current) {
      const container = timelineScrollRef.current;
      const targetLeft =
        zoomCenterDaysRef.current * dayWidth - container.clientWidth / 2;
      container.scrollLeft = Math.max(0, targetLeft);
      zoomCenterDaysRef.current = null;
    }
  }, [dayWidth]);

  // Полное раскрытие и сворачивание иерархии WBS (ExpandAll / CollapseAll)
  const expandAll = () => {
    setCollapsedWbs(new Set());
  };

  const collapseAll = () => {
    // Сворачиваем все родительские узлы (проекты и фазы)
    setCollapsedWbs(new Set(parentWbsSet));
  };

  // Авто-фокус на «Сегодня» при открытии страницы
  useEffect(() => {
    if (
      !initialCenteredRef.current &&
      timelineScrollRef.current &&
      todayPos.index > 0
    ) {
      const timer = setTimeout(() => {
        if (timelineScrollRef.current) {
          const target =
            todayPos.left - timelineScrollRef.current.clientWidth / 2;
          timelineScrollRef.current.scrollLeft = Math.max(0, target);
          initialCenteredRef.current = true;
        }
      }, 60);
      return () => clearTimeout(timer);
    }
  }, [todayPos.left, todayPos.index]);

  const getCoordinates = (startStr: string, finishStr: string) => {
    const start = new Date(startStr);
    const finish = new Date(finishStr);
    const offsetDays = Math.max(
      0,
      Math.floor((start.getTime() - minDate.getTime()) / (1000 * 60 * 60 * 24)),
    );
    const durationDays = Math.max(
      1,
      Math.ceil((finish.getTime() - start.getTime()) / (1000 * 60 * 60 * 24)) +
        1,
    );

    return {
      left: offsetDays * dayWidth,
      width: durationDays * dayWidth,
    };
  };

  const isWeekend = (d: Date) => {
    const day = d.getDay();
    return day === 0 || day === 6;
  };

  // Расчёт векторных координат связей CPM (только при включенном показе)
  const svgEdges = useMemo(() => {
    if (!showCpmArrows) return [];
    const taskIndexMap = new Map<string, { task: GanttTask; index: number }>();
    visibleTasks.forEach((t, i) =>
      taskIndexMap.set(t.id, { task: t, index: i }),
    );

    const edges: Array<{ id: string; d: string; isCritical: boolean }> = [];

    visibleTasks.forEach((t) => {
      const succInfo = taskIndexMap.get(t.id);
      if (!succInfo || !t.predecessor_links) return;
      const succCoords = getCoordinates(t.planned_start, t.planned_finish);
      const succY = succInfo.index * 28 + 14;
      const succX = succCoords.left;

      t.predecessor_links.forEach((link) => {
        const predInfo = taskIndexMap.get(link.predecessor_task_id);
        if (!predInfo) return;
        const predCoords = getCoordinates(
          predInfo.task.planned_start,
          predInfo.task.planned_finish,
        );
        const predY = predInfo.index * 28 + 14;
        const predX = predCoords.left + predCoords.width;

        const isCritical = t.is_critical && predInfo.task.is_critical;
        const midX =
          predX < succX ? Math.round((predX + succX) / 2) : predX + 8;
        const pathD = `M ${predX} ${predY} H ${midX} V ${succY} H ${succX}`;

        edges.push({
          id: `${link.predecessor_task_id}->${t.id}`,
          d: pathD,
          isCritical,
        });
      });
    });
    return edges;
  }, [visibleTasks, minDate, dayWidth, showCpmArrows]);

  return (
    <div
      ref={containerRef}
      style={{
        width: ganttContainerWidth ? `${ganttContainerWidth}px` : "1280px",
        maxWidth: "100%",
      }}
      className="relative mx-auto bg-slate-900 border border-slate-800 rounded-xl shadow-2xl flex flex-col group/ganttbox transition-[width] duration-75"
    >
      {/* Интерактивная ручка растягивания всего Гантта за правый край */}
      <div
        onMouseDown={startBoxResize}
        onDoubleClick={toggleMaximizeGantt}
        className="absolute right-0 top-0 bottom-0 w-3 cursor-ew-resize hover:bg-cyan-500/30 active:bg-cyan-500/60 z-40 transition-colors flex items-center justify-center group/edge"
        title="Зажмите и тяните, чтобы изменить ширину Гантта. Двойной клик — развернуть на весь экран."
      >
        <div className="w-[3px] h-14 rounded-full bg-slate-700/80 group-hover/edge:bg-cyan-400 group-hover/edge:scale-y-125 transition-all shadow-sm" />
      </div>

      {/* МОНОЛИТНЫЙ STICKY-БЛОК (прилипает к верху экрана целиком: Легенда + Заголовки таблицы + Календарь) */}
      <div className="sticky top-0 z-30 bg-slate-900 border-b border-slate-700 shadow-xl">
        {/* Верхняя панель: чистая легенда матрицы Ганта и счетчик */}
        <div className="bg-slate-800/95 px-6 py-2 border-b border-slate-700/80 flex flex-wrap items-center justify-between gap-4 text-xs">
          <div className="flex items-center gap-5">
            <div
              className="flex items-center gap-1.5"
              title="Код 1: Светло-зеленый с темно-зеленым низом"
            >
              <span className="w-3.5 h-3.5 rounded-sm bg-[#C6E0B4] border-b-2 border-[#548235]"></span>
              <span className="text-slate-300 font-medium">Код 1: План</span>
            </div>
            <div
              className="flex items-center gap-1.5"
              title="Код 3: Темно-зеленый с верхним разделителем"
            >
              <span className="w-3.5 h-3.5 rounded-sm bg-[#548235] border-t border-[#C6E0B4]"></span>
              <span className="text-slate-300 font-medium">
                Код 3: Факт в плане
              </span>
            </div>
            <div
              className="flex items-center gap-1.5"
              title="Код 2: Желтый с красной чертой срыва"
            >
              <span className="w-3.5 h-3.5 rounded-sm bg-[#FFD966] border-b-2 border-[#DC2626]"></span>
              <span className="text-amber-300 font-medium">
                Код 2: Отклонение
              </span>
            </div>
            <div
              className="flex items-center gap-1.5"
              title="Критический путь сетевого графа CPM"
            >
              <span className="w-3.5 h-3.5 rounded-sm bg-[#548235] ring-2 ring-blue-500 shadow-[0_0_6px_rgba(37,99,235,0.8)]"></span>
              <span className="text-blue-400 font-semibold flex items-center gap-0.5">
                <Flame className="w-3 h-3" /> Критический путь (CPM)
              </span>
            </div>

            {/* iOS тумблер отображения векторных связей CPM */}
            <div
              onClick={() => setShowCpmArrows(!showCpmArrows)}
              className="flex items-center gap-2 bg-slate-950/80 px-2.5 py-1 rounded-lg border border-slate-700/60 cursor-pointer select-none group"
              title="Включить / отключить векторные стрелки связей CPM"
            >
              <span className="text-[11px] font-medium text-slate-400 group-hover:text-slate-200 transition-colors">
                Стрелки CPM
              </span>
              <div
                className={`w-7 h-4 rounded-full p-0.5 transition-colors duration-200 ease-in-out flex-shrink-0 ${
                  showCpmArrows ? "bg-blue-500" : "bg-slate-700"
                }`}
              >
                <div
                  className={`w-3 h-3 rounded-full bg-white shadow-md transform transition-transform duration-200 ease-in-out ${
                    showCpmArrows ? "translate-x-3" : "translate-x-0"
                  }`}
                />
              </div>
            </div>

            {/* Нескрываемый тумблер Завершённые: видны / скрыты */}
            {onToggleShowCompleted && (
              <button
                type="button"
                onClick={onToggleShowCompleted}
                className={`flex items-center gap-1.5 px-2.5 py-1 rounded-lg border text-[11px] font-semibold transition-colors cursor-pointer select-none shadow-sm ${
                  showCompleted
                    ? "bg-emerald-950/70 text-emerald-300 border-emerald-700/80 hover:bg-emerald-900/80"
                    : "bg-amber-950/70 text-amber-300 border-amber-600/80 hover:bg-amber-900/80"
                }`}
                title={showCompleted ? "Кликните, чтобы скрыть завершённые задачи" : "Кликните, чтобы показать завершённые задачи"}
              >
                <span className={`w-2 h-2 rounded-full ${showCompleted ? "bg-emerald-400" : "bg-amber-400"}`} />
                <span>Завершённые: {showCompleted ? "видны" : "скрыты"}</span>
              </button>
            )}

            <div className="hidden xl:flex items-center gap-1 text-[11px] text-slate-400 bg-slate-950/40 px-2 py-0.5 rounded border border-slate-700/40">
              <Hand className="w-3 h-3 text-cyan-400" /> Драг-скролл мышкой
            </div>
          </div>

          <div className="flex items-center gap-2.5">
            {/* Сегментированный переключатель масштаба: Дни / Неделя (7 дн) / Месяц (30 дн) */}
            <div className="flex items-center bg-slate-950/80 p-0.5 rounded-lg border border-slate-700/60 text-[11px] font-semibold">
              <button
                type="button"
                onClick={() => handleSelectScaleMode("DAYS")}
                className={`px-2 py-0.5 rounded transition-all cursor-pointer ${
                  scaleMode === "DAYS"
                    ? "bg-cyan-600 text-white shadow-sm font-bold"
                    : "text-slate-400 hover:text-slate-200"
                }`}
                title="Детальный масштаб (свободный скролл)"
              >
                Дни
              </button>
              <button
                type="button"
                onClick={() => handleSelectScaleMode("WEEKS")}
                className={`px-2 py-0.5 rounded transition-all cursor-pointer ${
                  scaleMode === "WEEKS"
                    ? "bg-cyan-600 text-white shadow-sm font-bold"
                    : "text-slate-400 hover:text-slate-200"
                }`}
                title="Растянуть ровно 1 неделю (7 дней) на всю ширину окна"
              >
                Неделя
              </button>
              <button
                type="button"
                onClick={() => handleSelectScaleMode("MONTHS")}
                className={`px-2 py-0.5 rounded transition-all cursor-pointer ${
                  scaleMode === "MONTHS"
                    ? "bg-cyan-600 text-white shadow-sm font-bold"
                    : "text-slate-400 hover:text-slate-200"
                }`}
                title="Растянуть ровно 1 месяц (30 дней) на всю ширину окна"
              >
                Месяц
              </button>
            </div>

            <div className="flex items-center gap-1.5 bg-slate-950/80 px-2 py-1 rounded-lg border border-slate-700/60">
              <Calendar className="w-3.5 h-3.5 text-cyan-400" />
              <span className="text-[11px] text-slate-400 font-medium hidden sm:inline">
                Горизонт:
              </span>
              <select
                value={timelineHorizon}
                onChange={(e) => setTimelineHorizon(e.target.value)}
                className="bg-slate-800 border border-slate-700 text-cyan-300 font-semibold text-[11px] rounded px-1.5 py-0.5 focus:outline-none focus:border-cyan-500"
              >
                <option value="AUTO">Авто (по задачам)</option>
                <option value="+1Y">+1 год вперед</option>
                <option value="+2Y">+2 года вперед</option>
                <option value="+3Y">+3 года вперед</option>
                <option value="+5Y">+5 лет вперед</option>
              </select>
            </div>

            <div className="text-slate-400 font-mono text-[11px] hidden md:block">
              Видимо этапов:{" "}
              <span className="text-cyan-400 font-bold">
                {visibleTasks.length}
              </span>
              <span className="text-slate-500">/{tasks.length}</span>
            </div>
          </div>
        </div>

        {/* Заголовки таблицы и шкала дат календаря (прилипают вместе) */}
        <div className="flex select-none">
          <div
            style={{ width: `${tableWidth}px` }}
            className="flex-shrink-0 h-12 bg-slate-800/95 border-r-2 border-slate-700/80 flex text-xs font-semibold text-slate-400 uppercase tracking-wider"
          >
            <div
              style={{ width: `${colWidths.wbs}px` }}
              className="relative flex items-center justify-center px-1 border-r border-slate-700/60 group/wbs"
              title="WBS Код"
            >
              <span className="text-[10px]">WBS</span>
              <div
                onMouseDown={(e) => startResizing("wbs", e)}
                className="absolute -right-1.5 top-0 bottom-0 w-3 cursor-col-resize z-30 flex items-center justify-center"
              >
                <div className="w-[2px] h-full group-hover/wbs:bg-cyan-400 transition-colors" />
              </div>
            </div>

            <div
              style={{ width: `${colWidths.name}px` }}
              className="relative flex items-center px-2 border-r border-slate-700/60 group/name"
              title="Наименование работы"
            >
              <span className="truncate text-[11px]">Наименование</span>
              <div
                onMouseDown={(e) => startResizing("name", e)}
                className="absolute -right-1.5 top-0 bottom-0 w-3 cursor-col-resize z-30 flex items-center justify-center"
              >
                <div className="w-[2px] h-full group-hover/name:bg-cyan-400 transition-colors" />
              </div>
            </div>

            <div
              style={{ width: `${colWidths.assignee}px` }}
              className="relative flex items-center px-1 border-r border-slate-700/60 group/asg"
              title="Ответственные исполнители (R)"
            >
              <span className="truncate text-[10px]">Отв.</span>
              <div
                onMouseDown={(e) => startResizing("assignee", e)}
                className="absolute -right-1.5 top-0 bottom-0 w-3 cursor-col-resize z-30 flex items-center justify-center"
              >
                <div className="w-[2px] h-full group-hover/asg:bg-cyan-400 transition-colors" />
              </div>
            </div>

            <div
              style={{ width: `${colWidths.plannedStart}px` }}
              className="relative flex items-center justify-center px-0.5 border-r border-slate-700/60 group/pstart"
              title="Плановый старт (директива)"
            >
              <span className="text-[9px] truncate">Пл. старт</span>
              <div
                onMouseDown={(e) => startResizing("plannedStart", e)}
                className="absolute -right-1.5 top-0 bottom-0 w-3 cursor-col-resize z-30 flex items-center justify-center"
              >
                <div className="w-[2px] h-full group-hover/pstart:bg-cyan-400 transition-colors" />
              </div>
            </div>

            <div
              style={{ width: `${colWidths.plannedFinish}px` }}
              className="relative flex items-center justify-center px-0.5 border-r border-slate-700/60 group/pfin"
              title="Плановый финиш (директива)"
            >
              <span className="text-[9px] truncate">Пл. фин</span>
              <div
                onMouseDown={(e) => startResizing("plannedFinish", e)}
                className="absolute -right-1.5 top-0 bottom-0 w-3 cursor-col-resize z-30 flex items-center justify-center"
              >
                <div className="w-[2px] h-full group-hover/pfin:bg-cyan-400 transition-colors" />
              </div>
            </div>

            <div
              style={{ width: `${colWidths.actualFinish}px` }}
              className="relative flex items-center justify-center px-0.5 border-r border-slate-700/60 group/afin"
              title="Фактический финиш (исполнение)"
            >
              <span className="text-[9px] truncate">Факт. фин</span>
              <div
                onMouseDown={(e) => startResizing("actualFinish", e)}
                className="absolute -right-1.5 top-0 bottom-0 w-3 cursor-col-resize z-30 flex items-center justify-center"
              >
                <div className="w-[2px] h-full group-hover/afin:bg-cyan-400 transition-colors" />
              </div>
            </div>

            <div
              style={{ width: `${colWidths.status}px` }}
              className="relative flex items-center justify-center px-0.5 border-r border-slate-700/60 group/stat"
              title="Оперативный статус проверки"
            >
              <span className="text-[10px]">Статус</span>
              <div
                onMouseDown={(e) => startResizing("status", e)}
                className="absolute -right-1.5 top-0 bottom-0 w-3 cursor-col-resize z-30 flex items-center justify-center"
              >
                <div className="w-[2px] h-full group-hover/stat:bg-cyan-400 transition-colors" />
              </div>
            </div>

            <div
              style={{ width: `${colWidths.float}px` }}
              className="relative flex items-center justify-center px-0.5 group/flt"
              title="Резерв времени (Total Float / Slack в днях)"
            >
              <span className="font-mono text-[9px]">±дн</span>
              <div
                onMouseDown={(e) => startResizing("float", e)}
                className="absolute -right-1.5 top-0 bottom-0 w-3 cursor-col-resize z-30 flex items-center justify-center"
              >
                <div className="w-[2px] h-full group-hover/flt:bg-cyan-400 transition-colors" />
              </div>
            </div>
          </div>

          {/* Правая шкала дат (двухъярусная: Месяцы + Числа/Дни недели) */}
          <div
            ref={headerScrollRef}
            className="flex-1 overflow-hidden pointer-events-none"
          >
            <div
              style={{ width: `${totalDays * dayWidth}px` }}
              className="relative h-12 bg-slate-800/95 flex flex-col select-none"
            >
              {/* Линии перехода года и маркер Сегодня */}
              {yearTransitions.map((yt) => (
                <div
                  key={`badge-${yt.passedYear}`}
                  style={{ left: `${yt.left}px` }}
                  className="absolute top-0.5 -translate-x-1/2 z-40 pointer-events-none"
                >
                  <div className="px-2 py-0.5 rounded-full bg-emerald-600 text-white font-mono text-[9px] font-extrabold shadow-lg border border-emerald-300 flex items-center gap-1 whitespace-nowrap leading-none">
                    <span>{yt.passedYear}</span>
                    <span className="text-emerald-200 text-[8px]">➔</span>
                    <span className="text-emerald-100">{yt.nextYear}</span>
                  </div>
                </div>
              ))}

              {todayPos.index >= 0 && todayPos.index < totalDays && (
                <div
                  style={{ left: `${todayPos.left}px` }}
                  className="absolute top-0.5 -translate-x-1/2 z-40 pointer-events-none"
                >
                  <div className="px-2 py-0.5 rounded-full bg-rose-600 text-white font-mono text-[8px] font-extrabold shadow-md border border-rose-300 uppercase tracking-wider whitespace-nowrap leading-none">
                    Сегодня
                  </div>
                </div>
              )}

              {/* Верхний ярус: Объединённые блоки месяцев (СЕН 2026, ОКТ 2026...) на всю ширину месяца */}
              <div className="h-5 flex border-b border-slate-300/80 dark:border-slate-700/80 relative overflow-hidden bg-slate-100/80 dark:bg-slate-900/60">
                {monthHeaderBlocks.map((mb, idx) => (
                  <div
                    key={idx}
                    style={{ width: `${mb.daysCount * dayWidth}px` }}
                    className="flex-shrink-0 flex items-center justify-center border-r border-slate-300/80 dark:border-slate-700/80 px-2"
                  >
                    <span className="font-mono text-[10px] font-extrabold text-cyan-600 dark:text-cyan-400 tracking-wider whitespace-nowrap">
                      {mb.label}
                    </span>
                  </div>
                ))}
              </div>

              {/* Нижний ярус: Числа месяца и дни недели (всегда видны) */}
              <div className="h-7 flex relative">
                {timelineDays.map((day, idx) => {
                  const weekend = isWeekend(day);
                  const isCurrentToday = idx === todayPos.index;
                  const weekdayShort = dayWidth < 18
                    ? ["В", "П", "В", "С", "Ч", "П", "С"][day.getDay()]
                    : ["Вс", "Пн", "Вт", "Ср", "Чт", "Пт", "Сб"][day.getDay()];

                  return (
                    <div
                      key={idx}
                      style={{ width: `${dayWidth}px` }}
                      className={`flex-shrink-0 flex flex-col justify-center items-center border-r border-slate-300/80 dark:border-slate-800/80 leading-none ${
                        isCurrentToday ? "bg-rose-950/40" : weekend ? "bg-slate-100/70 dark:bg-slate-950/60" : ""
                      }`}
                    >
                      <span
                        className={`font-mono leading-none ${
                          isCurrentToday
                            ? "font-extrabold text-white bg-rose-600 px-1 py-0.2 rounded-full shadow-sm text-[9px]"
                            : weekend
                              ? "text-slate-500 font-semibold text-[9px]"
                              : "text-slate-700 dark:text-slate-200 font-bold text-[9px]"
                        }`}
                      >
                        {day.getDate()}
                      </span>
                      <span
                        className={`leading-none mt-0.5 text-[8px] uppercase ${
                          isCurrentToday
                            ? "text-rose-400 font-extrabold"
                            : weekend
                              ? "text-rose-500 font-bold"
                              : "text-slate-400 font-normal"
                        }`}
                      >
                        {weekdayShort}
                      </span>
                    </div>
                  );
                })}
              </div>
            </div>
          </div>
        </div>
      </div>

      {/* Floating HUD: Свободно перемещаемая панель с фиксацией стрелочкой у правого края */}
      <aside
        aria-label="Панель навигации Ганта"
        style={
          isHudCollapsed
            ? {
                top: `${Math.max(80, Math.min(typeof window !== "undefined" ? window.innerHeight - 80 : 500, hudPos.y))}px`,
              }
            : { left: `${hudPos.x}px`, top: `${hudPos.y}px` }
        }
        className={`fixed z-50 flex items-center rounded-2xl bg-slate-900/95 backdrop-blur-md border border-slate-700/90 shadow-2xl shadow-black/90 pointer-events-auto select-none transition-all duration-200 ${
          isHudCollapsed ? "right-0 rounded-r-none border-r-0" : ""
        }`}
      >
        {isHudCollapsed ? (
          /* Свернутое состояние: элегантная стрелочка-ярлычок у правого края экрана */
          <button
            onClick={() => setIsHudCollapsed(false)}
            className="flex items-center gap-1 pl-2.5 pr-1.5 py-3 rounded-l-xl bg-slate-900 hover:bg-slate-800 border-y border-l border-cyan-500/60 text-cyan-400 hover:text-white shadow-2xl shadow-black transition-all group"
            title="Развернуть панель управления Ганттом"
          >
            <ChevronLeft className="w-4 h-4 group-hover:-translate-x-1 transition-transform" />
            <span className="text-[10px] font-mono font-extrabold uppercase tracking-wider">
              HUD
            </span>
          </button>
        ) : (
          /* Развернутое состояние: полнофункциональный пульт управления */
          <div className="flex items-center gap-2 p-1.5">
            {/* Ручка свободного перетаскивания мышкой */}
            <div
              onMouseDown={startHudDrag}
              className="p-1 cursor-grab active:cursor-grabbing hover:bg-slate-800 rounded-lg text-slate-500 hover:text-slate-200 transition-colors"
              title="Зажмите и тяните, чтобы переместить панель в любое удобное место"
            >
              <GripVertical className="w-4 h-4" />
            </div>

            {/* Блок 1: Навигация днями и страницами */}
            <div className="flex items-center bg-slate-950/90 p-0.5 rounded-xl border border-slate-800">
              <button
                onClick={() => scrollByDays(-7)}
                className="p-1.5 rounded-lg hover:bg-slate-800 text-slate-300 hover:text-white transition-colors"
                title="Страница назад (7 дней) [PageLeft]"
              >
                <ChevronsLeft className="w-4 h-4" />
              </button>
              <button
                onClick={() => scrollByDays(-1)}
                className="p-1.5 rounded-lg hover:bg-slate-800 text-slate-300 hover:text-white transition-colors"
                title="День назад [Left]"
              >
                <ChevronLeft className="w-4 h-4" />
              </button>
              <button
                onClick={scrollToToday}
                className="px-2.5 py-1 rounded-lg bg-rose-950/90 hover:bg-rose-900 text-rose-300 font-mono text-xs font-bold border border-rose-800/80 transition-colors flex items-center gap-1.5 mx-0.5 shadow-sm"
                title="Перейти к сегодняшней дате [Today]"
              >
                <span className="w-2 h-2 rounded-full bg-rose-500 animate-pulse" />
                <span>Сегодня</span>
              </button>
              <button
                onClick={() => scrollByDays(1)}
                className="p-1.5 rounded-lg hover:bg-slate-800 text-slate-300 hover:text-white transition-colors"
                title="День вперед [Right]"
              >
                <ChevronRight className="w-4 h-4" />
              </button>
              <button
                onClick={() => scrollByDays(7)}
                className="p-1.5 rounded-lg hover:bg-slate-800 text-slate-300 hover:text-white transition-colors"
                title="Страница вперед (7 дней) [PageRight]"
              >
                <ChevronsRight className="w-4 h-4" />
              </button>
            </div>

            {/* Блок 2: Иерархия (отображается ТОЛЬКО на общем портфеле или при наличии родителей WBS) */}
            {(isPortfolioMode || parentWbsSet.size > 0) && (
              <>
                <div className="w-[1px] h-5 bg-slate-700/60" />
                <div className="flex items-center bg-slate-950/90 p-0.5 rounded-xl border border-slate-800">
                  <button
                    onClick={expandAll}
                    className="p-1.5 rounded-lg hover:bg-slate-800 text-slate-400 hover:text-cyan-400 transition-colors"
                    title="Развернуть все узлы WBS [ExpandAll]"
                  >
                    <Maximize2 className="w-4 h-4" />
                  </button>
                  <button
                    onClick={collapseAll}
                    className="p-1.5 rounded-lg hover:bg-slate-800 text-slate-400 hover:text-cyan-400 transition-colors"
                    title="Свернуть все проекты [CollapseAll]"
                  >
                    <Minimize2 className="w-4 h-4" />
                  </button>
                </div>
              </>
            )}

            <div className="w-[1px] h-5 bg-slate-700/60" />

            {/* Блок 3: Якорный зум */}
            <div className="flex items-center bg-slate-950/90 p-0.5 rounded-xl border border-slate-800">
              <button
                onClick={() => handleZoom(-6)}
                className="p-1.5 rounded-lg hover:bg-slate-800 text-slate-400 hover:text-white transition-colors"
                title="Уменьшить масштаб (ZoomOut)"
              >
                <ZoomOut className="w-4 h-4" />
              </button>
              <span className="font-mono text-xs text-cyan-400 px-1.5 font-bold min-w-[34px] text-center">
                {dayWidth}px
              </span>
              <button
                onClick={() => handleZoom(6)}
                className="p-1.5 rounded-lg hover:bg-slate-800 text-slate-400 hover:text-white transition-colors"
                title="Увеличить масштаб (ZoomIn)"
              >
                <ZoomIn className="w-4 h-4" />
              </button>
            </div>

            {/* Кнопка сворачивания к правому краю экрана */}
            <button
              onClick={() => setIsHudCollapsed(true)}
              className="p-1.5 rounded-lg hover:bg-slate-800 text-slate-400 hover:text-cyan-300 transition-colors ml-0.5"
              title="Свернуть пульт к правому краю экрана"
            >
              <ChevronRight className="w-4 h-4" />
            </button>
          </div>
        )}
      </aside>

      {/* Основная рабочая область (Строки таблицы) */}
      <div className="flex select-none">
        {/* Левая панель: Таблица WBS */}
        <div
          style={{ width: `${tableWidth}px` }}
          className="flex-shrink-0 bg-slate-900 border-r-2 border-slate-700/80 z-10"
        >
          {/* Строки таблицы */}
          <div className="divide-y divide-slate-800/80 font-sans">
            {visibleTasks.map((task) => {
              const isSelected = selectedTaskId === task.id;
              const hasChildren = parentWbsSet.has(task.wbs_code);
              const isCollapsed = collapsedWbs.has(task.wbs_code);
              const lockOwner = activeLocks[task.id];

              const tooltipText =
                `[WBS ${task.wbs_code}] ${task.name}\n` +
                `──────────────────────────\n` +
                `Директивный план: ${task.planned_start} — ${task.planned_finish} (${task.planned_duration} раб. дн.)\n` +
                (task.actual_start
                  ? `Фактический старт: ${task.actual_start}\n`
                  : "") +
                (task.actual_finish
                  ? `Фактический финиш: ${task.actual_finish}\n`
                  : "") +
                `Физический прогресс: ${Math.round(task.progress_percent)}%\n` +
                `Запас времени (Total Float): ${task.total_float} дн.\n` +
                `Ответственный (R): ${task.raci_assignee || "Не назначен"}\n` +
                (task.is_critical
                  ? "🔥 КРИТИЧЕСКИЙ ПУТЬ (Срыв срока недопустим)"
                  : "✅ В плановом графике");

              const isHovered = hoveredTaskId === task.id;
              const effFloat = getEffectiveFloat(task);

              return (
                <div
                  key={task.id}
                  onMouseEnter={() => setHoveredTaskId(task.id)}
                  onMouseLeave={() => setHoveredTaskId(null)}
                  onClick={(e) => {
                    e.stopPropagation();
                    if (onSelectTask) onSelectTask(task);
                  }}
                  className={`h-7 flex text-xs cursor-pointer transition-colors leading-none items-center ${
                    isSelected
                      ? "bg-cyan-500/20 border-l-2 border-cyan-500"
                      : isHovered
                        ? "bg-slate-500/15"
                        : "hover:bg-slate-500/10"
                  }`}
                >
                  {/* WBS: компактная кнопка сворачивания проекта ▼ P1 или чистый центрированный номер 1.1 */}
                  <div
                    style={{ width: `${colWidths.wbs}px` }}
                    className="flex-shrink-0 flex items-center justify-center px-0.5 font-mono font-bold border-r border-slate-800/60 overflow-hidden"
                  >
                    {hasChildren ? (
                      <button
                        onClick={(e) => toggleCollapse(task.wbs_code, e)}
                        className="inline-flex items-center gap-0.5 px-1 py-0.5 rounded bg-cyan-950/80 hover:bg-cyan-900 border border-cyan-700/60 text-cyan-300 font-mono text-[9px] font-extrabold transition-all cursor-pointer shadow-sm select-none"
                        title={isCollapsed ? `Развернуть проект [${task.wbs_code}]` : `Свернуть проект [${task.wbs_code}]`}
                      >
                        {isCollapsed ? (
                          <ChevronRight className="w-2.5 h-2.5 flex-shrink-0 text-cyan-400" />
                        ) : (
                          <ChevronDown className="w-2.5 h-2.5 flex-shrink-0 text-cyan-400" />
                        )}
                        <span className="leading-none whitespace-nowrap">
                          {task.wbs_code.replace("P-00", "P").replace("P-0", "P")}
                        </span>
                      </button>
                    ) : (
                      <span className="w-full text-center font-mono text-[10px] font-bold text-slate-300 truncate">
                        {task.wbs_code.replace(/^[A-Za-z0-9_-]+\./, "")}
                      </span>
                    )}
                  </div>

                  {/* Название работы (с минимальным отступом, без вытеснения текста) */}
                  <div
                    style={{
                      width: `${colWidths.name}px`,
                      paddingLeft: `${hasChildren ? 4 : Math.max(2, (task.level > 1 ? task.level - 2 : 0) * 6 + 4)}px`,
                    }}
                    className="flex-shrink-0 flex items-center pr-1 border-r border-slate-800/60 group relative"
                    title={tooltipText}
                  >
                    {task.is_plan_locked && (
                      <span
                        className="flex items-center mr-1"
                        title="План заблокирован фактом"
                      >
                        <Lock className="w-3 h-3 text-amber-400 flex-shrink-0" />
                      </span>
                    )}
                    {task.is_critical && (
                      <span
                        className="flex items-center mr-1"
                        title="Критический путь сетевого графа CPM"
                      >
                        <Flame className="w-3 h-3 text-blue-400 flex-shrink-0" />
                      </span>
                    )}

                    <span
                      className={`truncate ${hasChildren ? "font-bold text-slate-100" : "text-slate-200"}`}
                    >
                      {task.name}
                    </span>
                  </div>

                  {/* Ответственный / компактная плашка блокировки при редактировании */}
                  <div
                    style={{ width: `${colWidths.assignee}px` }}
                    className="flex-shrink-0 flex items-center border-r border-slate-800/60 px-1.5 overflow-hidden"
                    title={lockOwner ? `Редактирует: ${lockOwner}` : (task.raci_assignee || undefined)}
                  >
                    {lockOwner ? (
                      <span
                        className="w-full px-1.5 py-0.5 rounded text-[9px] font-bold bg-amber-500/20 text-amber-300 border border-amber-500/40 flex items-center justify-center gap-1 truncate select-none animate-pulse"
                        title={`Редактирует: ${lockOwner}`}
                      >
                        <Lock className="w-2.5 h-2.5 text-amber-400 flex-shrink-0" />
                        <span className="truncate">{getCompactLockOwner(lockOwner)}</span>
                      </span>
                    ) : (
                      (() => {
                        const assignees = parseAssignees(task.raci_assignee);
                        if (assignees.length === 0) {
                          return (
                            <span className="text-slate-500 text-[10px]">—</span>
                          );
                        }
                        return (
                          <div className="flex items-center gap-1 overflow-hidden flex-nowrap w-full text-[10px]">
                            <span className="text-slate-200 truncate flex-shrink min-w-0 font-medium">
                              {assignees[0]}
                            </span>
                            {assignees.length > 1 && (
                              <span
                                className="text-purple-400 font-mono text-[9px] font-bold flex-shrink-0"
                                title={`Дополнительно: ${assignees.slice(1).join(", ")}`}
                              >
                                +{assignees.length - 1}
                              </span>
                            )}
                          </div>
                        );
                      })()
                    )}
                  </div>

                  {/* План старт */}
                  <div
                    style={{ width: `${colWidths.plannedStart}px` }}
                    className="flex-shrink-0 flex items-center justify-center font-mono text-[9px] text-slate-300 border-r border-slate-800/60 px-0.5"
                  >
                    {task.planned_start
                      ? `${task.planned_start.slice(8, 10)}.${task.planned_start.slice(5, 7)}.${task.planned_start.slice(2, 4)}`
                      : "—"}
                  </div>

                  {/* План финиш */}
                  <div
                    style={{ width: `${colWidths.plannedFinish}px` }}
                    className="flex-shrink-0 flex items-center justify-center font-mono text-[9px] text-slate-300 border-r border-slate-800/60 px-0.5"
                  >
                    {task.planned_finish
                      ? `${task.planned_finish.slice(8, 10)}.${task.planned_finish.slice(5, 7)}.${task.planned_finish.slice(2, 4)}`
                      : "—"}
                  </div>

                  {/* Факт финиш */}
                  <div
                    style={{ width: `${colWidths.actualFinish}px` }}
                    className={`flex-shrink-0 flex items-center justify-center font-mono text-[9px] border-r border-slate-800/60 px-0.5 ${
                      task.actual_finish ? "text-emerald-400 font-semibold" : "text-slate-500"
                    }`}
                  >
                    {task.actual_finish
                      ? `${task.actual_finish.slice(8, 10)}.${task.actual_finish.slice(5, 7)}.${task.actual_finish.slice(2, 4)}`
                      : "—"}
                  </div>

                  {/* Оперативный статус */}
                  <div
                    style={{ width: `${colWidths.status}px` }}
                    className="flex-shrink-0 flex items-center justify-center border-r border-slate-800/60 px-0.5"
                  >
                    {(() => {
                      const stat = getTaskCheckStatusInfo(task);
                      return (
                        <span
                          className={`text-[9px] truncate max-w-full text-center select-none ${stat.cls}`}
                          title={stat.label}
                        >
                          {stat.label}
                        </span>
                      );
                    })()}
                  </div>

                  {/* Float (с поддержкой отрицательного запаса при срывах) */}
                  <div
                    style={{ width: `${colWidths.float}px` }}
                    className={`flex-shrink-0 flex items-center justify-center font-mono font-bold border-r border-slate-800/60 px-0.5 text-[9px] ${
                      effFloat < 0
                        ? "text-rose-400 font-extrabold"
                        : effFloat === 0
                          ? "text-rose-400 font-bold"
                          : "text-slate-400"
                    }`}
                    title={
                      effFloat < 0
                        ? `Дедлайн сорван на ${Math.abs(effFloat)} дн.!`
                        : `Запас: ${effFloat} дн.`
                    }
                  >
                    {effFloat > 0 ? `+${effFloat}` : effFloat}
                  </div>
                </div>
              );
            })}
          </div>
        </div>

        {/* Правая панель: Таймлайн с поддержкой Drag-to-scroll */}
        <div
          ref={timelineScrollRef}
          className="flex-1 overflow-x-auto select-none relative cursor-grab"
          style={{ willChange: "scroll-position", overscrollBehaviorX: "none" }}
        >
          <div
            style={{ width: `${totalDays * dayWidth}px` }}
            className="relative"
          >
            {/* 1. Зелёные вертикальные линии смены года */}
            {yearTransitions.map((yt) => (
              <div
                key={`line-${yt.passedYear}`}
                style={{ left: `${yt.left}px` }}
                className="absolute top-0 bottom-0 w-[2px] bg-emerald-400 z-20 pointer-events-none shadow-[0_0_8px_rgba(52,211,153,0.8)]"
              />
            ))}

            {/* 2. Красная вертикальная лазерная черта «Сегодня» */}
            {todayPos.index >= 0 && todayPos.index < totalDays && (
              <div
                style={{ left: `${todayPos.left}px` }}
                className="absolute top-0 bottom-0 w-[2px] bg-rose-500 z-30 pointer-events-none shadow-[0_0_8px_rgba(244,63,94,0.9)]"
              />
            )}

            {/* Отрисовка полос задач */}
            <div className="relative divide-y divide-slate-800/80">
              {/* Аппаратная вертикальная сетка каждого дня для всех масштабов */}
              <div className="absolute inset-0 pointer-events-none z-0 flex">
                {timelineDays.map((day, idx) => {
                  const weekend = isWeekend(day);
                  const isCurrentToday = idx === todayPos.index;

                  return (
                    <div
                      key={idx}
                      style={{ width: `${dayWidth}px` }}
                      className={`flex-shrink-0 h-full border-r border-slate-300/80 dark:border-slate-800/80 ${
                        isCurrentToday
                          ? "bg-rose-500/5 dark:bg-rose-950/20"
                          : weekend
                            ? "bg-slate-100/70 dark:bg-slate-950/50"
                            : ""
                      }`}
                    />
                  );
                })}
              </div>

              {/* Векторный слой стрелок связей CPM (монтируется строго при включении) */}
              {showCpmArrows && svgEdges.length > 0 && (
                <svg
                  className="absolute inset-0 pointer-events-none z-10 w-full h-full"
                  style={{ shapeRendering: "optimizeSpeed", contain: "strict" }}
                >
                  <defs>
                    <marker
                      id="cpm-arrow"
                      viewBox="0 0 6 6"
                      refX="5"
                      refY="3"
                      markerWidth="4"
                      markerHeight="4"
                      orient="auto"
                    >
                      <polygon points="0,0 6,3 0,6" fill="#64748b" />
                    </marker>
                    <marker
                      id="cpm-arrow-crit"
                      viewBox="0 0 6 6"
                      refX="5"
                      refY="3"
                      markerWidth="4"
                      markerHeight="4"
                      orient="auto"
                    >
                      <polygon points="0,0 6,3 0,6" fill="#3b82f6" />
                    </marker>
                  </defs>
                  {svgEdges.map((edge) => (
                    <path
                      key={edge.id}
                      d={edge.d}
                      fill="none"
                      stroke={edge.isCritical ? "#3b82f6" : "#64748b"}
                      strokeWidth={edge.isCritical ? 1.5 : 1}
                      strokeDasharray={edge.isCritical ? undefined : "3 2"}
                      markerEnd={
                        edge.isCritical
                          ? "url(#cpm-arrow-crit)"
                          : "url(#cpm-arrow)"
                      }
                    />
                  ))}
                </svg>
              )}

              {visibleTasks.map((task) => {
                const isSelected = selectedTaskId === task.id;
                const isMilestone =
                  task.task_type === "MILESTONE" || task.planned_duration === 0;

                const todayStr = new Date().toISOString().split("T")[0];
                const planCoords = getCoordinates(
                  task.planned_start,
                  task.planned_finish,
                );

                // 1. Отклонение по старту (если фактический старт сорван и произошел позже плана)
                const hasStartDelay = Boolean(
                  task.actual_start && task.actual_start > task.planned_start,
                );
                const startDelayCoords = hasStartDelay
                  ? getCoordinates(task.planned_start, task.actual_start!)
                  : null;

                // 2. Отклонение по финишу / срыв дедлайна (после планового окончания)
                const isOverrun =
                  (task.actual_finish &&
                    task.actual_finish > task.planned_finish) ||
                  (task.progress_percent < 100 &&
                    todayStr > task.planned_finish);
                const overrunFinishStr = task.actual_finish || todayStr;
                const overrunCoords = isOverrun
                  ? getCoordinates(task.planned_finish, overrunFinishStr)
                  : null;

                const barTooltip =
                  `[${task.wbs_code}] ${task.name}\n` +
                  `Директивный план: ${task.planned_start} — ${task.planned_finish} (${task.planned_duration} раб. дн.)\n` +
                  `Факт: ${Math.round(task.progress_percent)}%\n` +
                  `Запас (Float): ${task.total_float} дн.\n` +
                  (hasStartDelay
                    ? `⚠️ Старт сорван: с ${task.planned_start} по ${task.actual_start}\n`
                    : "") +
                  (isOverrun
                    ? `🚨 Просрочен дедлайн: срыв после ${task.planned_finish}!\n`
                    : "") +
                  (task.is_critical
                    ? "🔹 КРИТИЧЕСКИЙ ПУТЬ (CPM)"
                    : "✅ В графике");

                const isHovered = hoveredTaskId === task.id;

                return (
                  <div
                    key={task.id}
                    onMouseEnter={() => setHoveredTaskId(task.id)}
                    onMouseLeave={() => setHoveredTaskId(null)}
                    onPointerUp={(e) => {
                      if (!hasMovedRef.current && onSelectTask) {
                        onSelectTask(task);
                      }
                    }}
                    onClick={(e) => {
                      e.stopPropagation();
                      if (!hasMovedRef.current && onSelectTask) {
                        onSelectTask(task);
                      }
                    }}
                    className={`h-7 relative flex items-center transition-colors cursor-pointer bg-transparent ${
                      isSelected
                        ? "bg-cyan-500/20"
                        : isHovered
                          ? "bg-slate-500/15"
                          : "hover:bg-slate-500/10"
                    }`}
                    title={barTooltip}
                  >
                    {isMilestone ? (
                      <div
                        style={{
                          left: `${planCoords.left + dayWidth / 2 - 6}px`,
                        }}
                        className={`absolute w-3 h-3 bg-amber-400 rotate-45 border border-slate-950 shadow-sm z-20 hover:scale-125 transition-transform ${
                          task.is_critical
                            ? "ring-2 ring-blue-400 shadow-[0_0_6px_rgba(59,130,246,0.9)]"
                            : ""
                        }`}
                      />
                    ) : (
                      <>
                        {/* Зона отклонения по старту */}
                        {hasStartDelay && startDelayCoords && (
                          <div
                            style={{
                              left: `${startDelayCoords.left}px`,
                              width: `${startDelayCoords.width}px`,
                            }}
                            className="absolute h-3.5 top-[5px] rounded-l-sm bg-[#FFD966]/80 border-b-2 border-amber-500 border-l border-t border-amber-400/50 z-5"
                            title={`Срыв старта на ${Math.round(startDelayCoords.width / dayWidth)} дн.`}
                          />
                        )}

                        {/* Базовый плановый бар */}
                        <div
                          style={{
                            left: `${planCoords.left}px`,
                            width: `${planCoords.width}px`,
                          }}
                          className={`absolute h-4 top-[6px] rounded-sm overflow-hidden flex shadow-sm z-10 ${
                            task.is_critical
                              ? "ring-1.5 ring-blue-500 shadow-[0_0_8px_rgba(37,99,235,0.6)]"
                              : "border border-slate-700/60"
                          }`}
                        >
                          {/* Код 3: Факт внутри плана */}
                          {task.progress_percent > 0 && (
                            <div
                              style={{
                                width: `${Math.min(100, task.progress_percent)}%`,
                              }}
                              className="h-full bg-[#548235] border-t border-[#C6E0B4]/60 transition-all duration-300"
                            />
                          )}

                          {/* Код 1: План */}
                          {task.progress_percent < 100 && (
                            <div
                              style={{
                                width: `${Math.max(0, 100 - task.progress_percent)}%`,
                              }}
                              className="h-full bg-[#C6E0B4] border-b-2 border-[#548235] transition-all duration-300"
                            />
                          )}
                        </div>

                        {/* Аварийное отклонение после дедлайна */}
                        {isOverrun &&
                          overrunCoords &&
                          overrunCoords.width > 0 && (
                            <div
                              style={{
                                left: `${overrunCoords.left}px`,
                                width: `${Math.max(dayWidth, overrunCoords.width)}px`,
                              }}
                              className="absolute h-4 top-[6px] rounded-r-sm bg-[#DC2626] border border-rose-400 shadow-md shadow-rose-950/60 z-15 flex items-center justify-end pr-0.5"
                              title="Срыв директивного дедлайна (Overrun)"
                            >
                              <span className="w-1 h-1 rounded-full bg-white animate-ping" />
                            </div>
                          )}
                      </>
                    )}
                  </div>
                );
              })}
            </div>
          </div>
        </div>
      </div>
    </div>
  );
};
