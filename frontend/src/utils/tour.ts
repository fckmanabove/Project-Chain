import { driver } from "driver.js";
import "driver.js/dist/driver.css";

interface TourActions {
  setActiveTab: (tab: any) => void;
  openFirstTaskDrawer: () => void;
}

export const startTechLeadTour = (actions: TourActions) => {
  const driverObj = driver({
    showProgress: true,
    animate: true,
    allowClose: true,
    nextBtnText: "Дальше →",
    prevBtnText: "← Назад",
    doneBtnText: "Завершить квест ✓",
    progressText: "Шаг {{current}} из {{total}}",
    steps: [
      {
        element: "#tour-health-bar",
        popover: {
          title: "1. Мониторинг портфеля (PCC 1.5)",
          description:
            "<b>Бизнес-правила PCC:</b> Движок непрерывно анализирует 114 этапов по 5 проектам. Выявляет критические срывы сроков (R01–R02) и предупреждения (Y01–Y04: незаполненные даты, отсутствие исполнителя). Красные статусы мгновенно подсвечивают риски для дирекции.",
          side: "bottom",
          align: "start",
        },
      },
      {
        element: "#tour-gantt-chart",
        popover: {
          title: "2. Календарно-сетевой график Ганта",
          description:
            "<b>Высокая производительность:</b> Двухъярусная календарная шкала (месяцы + дни) с аппаратным <i>Drag-to-Scroll</i> без задержек. Реализовано правило <b>MVP DNA</b>: при фиксации фактического старта плановые директивные даты блокируются для защиты базового плана от искажений.",
          side: "top",
          align: "center",
        },
      },
      {
        element: "#tour-task-row",
        popover: {
          title: "3. Карточка задачи и Redis Live Lock",
          description:
            "<b>Распределенные блокировки:</b> При клике на задачу вызывается эндпоинт захвата <code>/tasks/{id}/lock</code>. Redis через атомарный <b>Lua-скрипт</b> с TTL на 30 секунд и фоновым heartbeat защищает строку от состояния гонки (Race Condition), если график одновременно правят несколько инженеров.",
          side: "top",
          align: "start",
        },
        onHighlightStarted: () => {
          actions.openFirstTaskDrawer();
        },
      },
      {
        element: "#tour-tab-diary",
        popover: {
          title: "4. Цеховой Дневник (11 колонок)",
          description:
            "<b>Связь плана и факта:</b> Полевой электронный журнал работ цеха. Каждая запись привязана к WBS-этапу, физическому участку линии (Haotian, IMA, Буфер) и внешним инцидентам в <b>Pyrus</b>. Инженер указывает не просто проблему, а физическое решение и обоснование («Зачем все это?»).",
          side: "bottom",
          align: "center",
        },
        onHighlightStarted: () => {
          actions.setActiveTab("DIARY");
        },
      },
      {
        element: "#tour-cpm-btn",
        popover: {
          title: "5. CPM Engine (Математическое ядро)",
          description:
            "<b>NetworkX DAG:</b> Граф рассчитывает ранние и поздние даты (Forward & Backward Pass), свободный и полный резерв времени (Total Float). Задачи с нулевым резервом автоматически формируют <b>Критический путь</b>. Движок отслеживает циклические зависимости и защищает график от дедлоков.",
          side: "bottom",
          align: "end",
        },
        onHighlightStarted: () => {
          actions.setActiveTab("UI_PORTFOLIO");
        },
      },
      {
        element: "#tour-security-controls",
        popover: {
          title: "6. Безопасность: Time Machine & RBAC",
          description:
            "<b>Zero-Trust архитектура:</b> Вкладки «Админ-панель» и «Time Machine» доступны строго ролям <code>SUPERADMIN</code> и <code>AUDITOR</code>.<br/><br/>• <b>RBAC:</b> Гранулярная матрица разрешений поверх ролей.<br/>• <b>Time Machine:</b> Фиксация изменений в PostgreSQL JSONB с возможностью <b>1-клик отката (Undo) и восстановления из корзины (Undelete)</b>.",
          side: "bottom",
          align: "end",
        },
      },
    ],
  });

  driverObj.drive();
};