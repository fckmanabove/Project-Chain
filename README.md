# Project-Chain (ProChain) ⛓️

**ProChain** — это высокопроизводительная система управления портфелем проектов автоматизации. Система представляет собой полную миграцию сложной экосистемы Excel/VBA MVP в реактивную веб-среду с использованием математической модели сетевого планирования (CPM) и ИИ-аналитики.

## 🏗 Архитектура системы

### 1. Логическая схема процессов (Mermaid)
```mermaid
graph TD
    A[Excel Archive/P-00x] -->|Legacy Parser| B(Migration Service)
    B --> C[(PostgreSQL 16 + pgvector)]
    D[Diary Input/Logs] -->|Reactive Sync| E{FastAPI Core}
    E -->|Update Tasks| C
    E -->|Trigger| F[CPM Engine]
    F -->|Recalculate Chain| C
    C -->|Daily Snapshot| G[Celery Worker]
    G -->|Embeddings| H[(Vector Store)]
    I[User/Management] -->|Natural Language| J[ИИ-аналитик]
    J -->|Semantic Search| H
    J -->|Insights/Reasons| I
```

### 2. Реляционная структура данных (ER Diagram)
```mermaid
erDiagram
    PROJECT ||--o{ TASK : "contains"
    TASK ||--o{ DEPENDENCY : "predecessor_of"
    TASK ||--o{ DIARY_ENTRY : "logs"
    TASK ||--o{ OPERATIONAL_ISSUE : "has_problems"
    TASK ||--o{ TASK_SNAPSHOT : "history"
    PROJECT {
        string id "PRJ-XXX / P-XXX"
        string name
        date planned_finish
    }
    TASK {
        string id "TSK-XXXX / MS-XXXX"
        int duration
        date start_date
        date finish_date
        int slack "Reserve"
        boolean is_critical
        string location_tag
    }
    OPERATIONAL_ISSUE {
        string category "A, B, C, F"
        text issue_description
        string technical_issue_class
    }
```

## 📂 Структура репозитория
```text
project-chain/
├── backend/                # Python / FastAPI
│   ├── app/
│   │   ├── api/            # Эндпоинты (Gantt, Diary, Analytics)
│   │   ├── core/           # Движок CPM и производственный календарь
│   │   ├── models/         # Модели SQLAlchemy (Валидация ID через Regex)
│   │   ├── services/       # ИИ-сервисы и логика снапшотов
│   │   └── crud/           # Логика блокировок и CRUD
│   ├── parser/             # Инструмент миграции из ProjectArchive
│   └── alembic/            # Миграции базы данных
├── frontend/               # React / TypeScript
│   ├── src/
│   │   ├── components/     # Интерактивный Гантт, Формы дневников
│   │   ├── hooks/          # WebSocket (Live Cell Locking)
│   │   └── store/          # Состояние (Zustand)
├── ai_agent/               # Логика векторного поиска (LangChain/PGVector)
├── docker-compose.yml      # Infra: Postgres, Redis, RabbitMQ, pgvector
└── data_archive/           # Входящие данные (Excel/XLSM)
```

## 🚀 Ключевые бизнес-правила (MVP DNA)

### 1. Движок расчетов (CPM Engine)
- **Алгоритм:** Полная реализация Forward/Backward Pass. Определение критического пути (Slack = 0).
- **Логика Вехи (MS):** `duration = 0`. Каждая веха имеет собственные атрибуты `start_date` и `finish_date`. Веха является самостоятельным контрольным объектом в графе зависимостей с фиксированными сроками.
- **Производственный календарь:** Кастомная функция `get_next_working_day`. Пропуск выходных и праздников из `holiday_calendar`.

### 2. Система идентификации и связей
- **Жесткие ключи:** 
    - Проекты: `^PRJ-[0-9]{3}$` (или `P-[0-9]{3}`)
    - Задачи: `^TSK-[0-9]{4}$`
    - Вехи: `^MS-[0-9]{4}$`
- **Integrity:** Связь данных в Ганте и Дневниках идет исключительно по ID. Текстовое переименование задачи не разрывает связь.

### 3. Реактивные блокировки (Data Integrity)
- **Data Lock:** Если в `diary_entries` или `operational_issues` по задаче зафиксирован факт (`hours_worked > 0`), поля `planned_start` и `dependencies` в Ганте блокируются для ручного изменения.
- **Live Lock (UX):** Использование Redis + WebSockets для блокировки ячейки при редактировании ("Живой курсор").

### 4. ИИ-аналитика (Семантический поиск)
- **Механика:** Поиск по векторному индексу денормализованной таблицы снапшотов.
- **Источник данных:** Поле `aggregated_comments`, содержащее хронологическую склейку всех текстовых записей и логов проблем по конкретной задаче.
- **Функционал:** Ответы на запросы о причинах задержек на основе сопоставления текста дневников со сроками задач. Обработка текстовых и голосовых команд.

## 📁 Спецификация импорта Legacy данных
- **Архив:** `ProjectArchive_20260828_134022`.
- **Маппинг:**
    - `План-график*.xlsx` → `portfolio_tasks`.
    - `Дневник*.xlsx` → `operational_issues` и `diary_entries`.
    - `鐵__1.0.14h.xlsm` → Извлечение `queryTable.xml` (кэши Power Query) в кодировке `gbk` для наполнения исторической базы.

## 🛠 Технологический стек
- **Backend:** FastAPI, SQLAlchemy 2.0, Celery.
- **Data:** PostgreSQL 16 (pgvector), Redis 7.
- **Frontend:** React, Tailwind CSS, SVAR/DHTMLX Gantt.
- **AI:** LangChain, OpenAI API / DeepSeek.
