export type ProjectStatus =
  | "INITIATION"
  | "PLANNING"
  | "EXECUTION"
  | "MONITORING"
  | "CLOSING"
  | "ARCHIVED"
  | "ON_HOLD";

export type TaskType = "TASK" | "MILESTONE" | "SUMMARY";
export type TaskStatus =
  | "NOT_STARTED"
  | "IN_PROGRESS"
  | "COMPLETED"
  | "SUSPENDED";
export type DependencyType = "FS" | "SS" | "FF" | "SF";

export interface TaskDependency {
  id: string;
  predecessor_task_id: string;
  successor_task_id: string;
  dependency_type: DependencyType;
  lag_days: number; // <-- исправлено с int на number
}

export interface ProjectPassport {
  id: string;
  code: string;
  name: string;
  description?: string;
  location?: string;
  status: ProjectStatus;
  planned_start_date: string;
  planned_finish_date: string;
  actual_start_date?: string;
  actual_finish_date?: string;
  currency: string;
  planned_budget?: number;
  actual_cost?: number;
  raci_matrix: Record<string, any>;
  passport_data: Record<string, any>;
  created_at: string;
  updated_at: string;
}

export interface GanttTask {
  id: string;
  project_id: string;
  wbs_code: string;
  parent_wbs?: string;
  level: number;
  sort_order: number;
  name: string;
  task_type: TaskType;
  status: TaskStatus;

  // Baseline Plan
  planned_duration: number;
  planned_start: string;
  planned_finish: string;

  // Actuals
  actual_start?: string;
  actual_finish?: string;
  progress_percent: number;
  is_plan_locked: boolean;

  // CPM Calculated
  early_start?: string;
  early_finish?: string;
  late_start?: string;
  late_finish?: string;
  total_float: number;
  free_float: number;
  is_critical: boolean;

  // RACI
  raci_assignee?: string;
  raci_approver?: string;
  raci_consulted: string[];
  raci_informed: string[];

  predecessor_links: TaskDependency[];
  custom_attributes?: Record<string, any>;
}

export interface CPMRecalculateResult {
  status: string;
  project_id: string;
  calculated_start: string;
  calculated_finish: string;
  total_duration_days: number;
  critical_path_wbs: string[];
  tasks_count: number;
}

export interface TaskDelayDetail {
  task_id: string;
  wbs_code: string;
  name: string;
  is_critical: boolean;
  total_float: number;
  progress_percent: number;
  planned_finish: string;
  delay_days: number;
  raci_assignee?: string;
  issues_and_risks?: string[];
}

export interface DelayReport {
  total_critical_delay_days: number;
  delayed_tasks_count: number;
  critical_delayed_tasks: TaskDelayDetail[];
  raci_distribution: Record<string, number>;
  root_causes: string[];
}

export type DiaryEntryType = "FACT" | "PROGRESS" | "ISSUE" | "WEATHER" | "NOTE" | "DAILY_LOG";

export interface DiaryEntry {
  id?: string;
  project_id?: string;
  task_id?: string;
  category?: "A" | "B" | "C" | string;
  wbs_affected?: string;
  entry_date: string;
  line_section?: string;
  content: string;
  solution?: string;
  physical_action?: string;
  purpose?: string;
  author_name: string;
  deadline_str?: string;
  status?: string;
  source?: string;
  entry_type?: DiaryEntryType;
  issues_and_risks?: string;
  weather_conditions?: string;
  created_at?: string;
}

// --- Безопасность, Пользователи, Роли (RBAC) ---
export interface Role {
  id: string;
  name: string;
  description?: string;
  permissions: string[];
  is_system: boolean;
}

export interface User {
  id: string;
  email: string;
  full_name: string;
  position?: string;
  role_id: string;
  role_name?: string;
  is_active: boolean;
  is_verified: boolean;
  theme?: "dark" | "light";
  custom_permissions?: {
    allow?: string[];
    deny?: string[];
  };
  created_at?: string;
}

export interface SystemPermission {
  key: string;
  name: string;
  category: string;
}

// --- Аудит и Time Machine (Undo / Undelete) ---
export interface AuditLogItem {
  id: string;
  user_id?: string;
  user_email?: string;
  user_name?: string;
  entity_type: string;
  entity_id: string;
  entity_name?: string;
  action: "CREATE" | "UPDATE" | "DELETE" | "ROLLBACK" | "RESTORE" | string;
  summary?: string;
  before_state?: Record<string, any>;
  after_state?: Record<string, any>;
  is_reverted: boolean;
  created_at: string;
}

export interface TrashItem {
  log_id: string;
  entity_type: string;
  entity_id: string;
  entity_name?: string;
  deleted_by?: string;
  deleted_at: string;
  snapshot?: Record<string, any>;
}

export interface AuthTokens {
  access_token: string;
  refresh_token: string;
  token_type: string;
  user: User;
}

export interface SiteConflict {
  location: string;
  overlap_start: string;
  overlap_finish: string;
  overlap_days: number;
  project_a: string;
  task_a_wbs: string;
  task_a_name: string;
  project_b: string;
  task_b_wbs: string;
  task_b_name: string;
}

export interface ResourceConflict {
  person: string;
  overlap_start: string;
  overlap_finish: string;
  overlap_days: number;
  is_multi_project: boolean;
  project_a: string;
  task_a_wbs: string;
  task_a_name: string;
  project_b: string;
  task_b_wbs: string;
  task_b_name: string;
}

export interface OverlapReport {
  total_site_conflicts: number;
  total_resource_conflicts: number;
  site_conflicts: SiteConflict[];
  resource_conflicts: ResourceConflict[];
}