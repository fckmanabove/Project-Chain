import axios from "axios";
import {
  ProjectPassport,
  GanttTask,
  CPMRecalculateResult,
  Role,
  User,
  SystemPermission,
  AuditLogItem,
  TrashItem,
  AuthTokens,
  DiaryEntry,
  OverlapReport,
} from "../types";

// Автоматически определяем адрес бэкенда: через прокси code-server или напрямую через домен
const isCodeServerProxy =
  typeof window !== "undefined" &&
  (window.location.pathname.includes("/proxy/") || window.location.pathname.includes("/absproxy/"));

let API_BASE_URL = "/api/v1";
if (isCodeServerProxy) {
  const origin = window.location.origin;
  const isAbsProxy = window.location.pathname.includes("/absproxy/");
  const proxyPrefix = isAbsProxy ? "/absproxy/8000" : "/proxy/8000";
  API_BASE_URL = `${origin}${proxyPrefix}/api/v1`;
}

export const apiClient = axios.create({
  baseURL: API_BASE_URL,
  headers: {
    "Content-Type": "application/json",
  },
});

apiClient.interceptors.request.use((config) => {
  const token = typeof window !== "undefined" ? localStorage.getItem("prochain_access_token") : null;
  if (token) {
    config.headers.Authorization = `Bearer ${token}`;
  }
  return config;
});

apiClient.interceptors.response.use(
  (response) => response,
  (error) => {
    if (error.response?.status === 401 && typeof window !== "undefined") {
      localStorage.removeItem("prochain_access_token");
      localStorage.removeItem("prochain_user");
    }
    return Promise.reject(error);
  }
);

export const projectApi = {
  listProjects: async (): Promise<ProjectPassport[]> => {
    const res = await apiClient.get<ProjectPassport[]>("/projects");
    return res.data;
  },
  createProject: async (
    payload: Partial<ProjectPassport>,
  ): Promise<ProjectPassport> => {
    const res = await apiClient.post<ProjectPassport>("/projects", payload);
    return res.data;
  },
  updateProject: async (
    projectId: string,
    payload: Partial<ProjectPassport>,
  ): Promise<ProjectPassport> => {
    const res = await apiClient.patch<ProjectPassport>(`/projects/${projectId}`, payload);
    return res.data;
  },
  deleteProject: async (
    projectId: string,
    passcode: string,
  ): Promise<{ status: string; message: string }> => {
    const res = await apiClient.delete(`/projects/${projectId}`, {
      headers: { "X-Delete-Passcode": passcode },
    });
    return res.data;
  },
  getProject: async (projectId: string): Promise<ProjectPassport> => {
    const res = await apiClient.get<ProjectPassport>(`/projects/${projectId}`);
    return res.data;
  },
  recalculateCPM: async (projectId: string): Promise<CPMRecalculateResult> => {
    const res = await apiClient.post<CPMRecalculateResult>(
      `/projects/${projectId}/recalculate`,
    );
    return res.data;
  },
  getProjectTasks: async (projectId: string): Promise<GanttTask[]> => {
    const res = await apiClient.get<GanttTask[]>(
      `/projects/${projectId}/tasks`,
    );
    return res.data;
  },
  getAllTasks: async (): Promise<GanttTask[]> => {
    const res = await apiClient.get<GanttTask[]>("/tasks");
    return res.data;
  },
  createTask: async (
    projectId: string,
    payload: Partial<GanttTask>,
  ): Promise<GanttTask> => {
    try {
      const res = await apiClient.post<GanttTask>(
        `/projects/${projectId}/tasks`,
        payload,
      );
      return res.data;
    } catch {
      const res = await apiClient.post<GanttTask>("/tasks", {
        ...payload,
        project_id: projectId,
      });
      return res.data;
    }
  },
  updateTask: async (
    taskId: string,
    payload: Partial<GanttTask>,
  ): Promise<GanttTask> => {
    const res = await apiClient.patch<GanttTask>(`/tasks/${taskId}`, payload);
    return res.data;
  },
  deleteTask: async (taskId: string): Promise<{ status: string }> => {
    const res = await apiClient.delete(`/tasks/${taskId}`);
    return res.data;
  },
  lockTask: async (
    taskId: string,
    ownerId: string,
  ): Promise<{ status: string }> => {
    const res = await apiClient.post(`/tasks/${taskId}/lock`, {
      owner_id: ownerId,
      ttl_seconds: 30,
    });
    return res.data;
  },
  unlockTask: async (
    taskId: string,
    ownerId: string,
  ): Promise<{ status: string }> => {
    const res = await apiClient.post(`/tasks/${taskId}/unlock`, {
      owner_id: ownerId,
    });
    return res.data;
  },
  getTaskDiary: async (
    taskId: string,
  ): Promise<import("../types").DiaryEntry[]> => {
    try {
      const res = await apiClient.get<import("../types").DiaryEntry[]>(
        `/tasks/${taskId}/diary`,
      );
      return res.data;
    } catch {
      return [];
    }
  },
  createDiaryEntry: async (
    taskId: string,
    payload: Omit<import("../types").DiaryEntry, "id" | "created_at">,
  ): Promise<import("../types").DiaryEntry> => {
    const res = await apiClient.post<import("../types").DiaryEntry>(
      `/tasks/${taskId}/diary`,
      payload,
    );
    return res.data;
  },
  updateDiaryEntry: async (
    taskId: string,
    entryId: string,
    payload: Partial<import("../types").DiaryEntry>,
  ): Promise<import("../types").DiaryEntry> => {
    try {
      const res = await apiClient.patch<import("../types").DiaryEntry>(
        `/tasks/${taskId}/diary/${entryId}`,
        payload,
      );
      return res.data;
    } catch {
      return { id: entryId, task_id: taskId, ...payload } as any;
    }
  },
  deleteDiaryEntry: async (
    taskId: string,
    entryId: string,
  ): Promise<{ status: string }> => {
    try {
      const res = await apiClient.delete(`/tasks/${taskId}/diary/${entryId}`);
      return res.data;
    } catch {
      return { status: "deleted" };
    }
  },
  uploadExcel: async (
    file: File,
  ): Promise<{ message?: string; project_id?: string }> => {
    const formData = new FormData();
    formData.append("file", file);
    const res = await apiClient.post("/projects/import-excel", formData, {
      headers: { "Content-Type": "multipart/form-data" },
    });
    return res.data;
  },
  previewExcel: async (file: File): Promise<{
    status: string;
    source_filename: string;
    total_in_file: number;
    unchanged_count: number;
    changed_count: number;
    changes: Array<{
      key: string;
      project_code: string;
      wbs_code: string;
      task_name: string;
      change_type: "CREATE" | "UPDATE";
      diff_summary: string;
      old_values?: Record<string, any>;
      new_values: Record<string, any>;
    }>;
  }> => {
    const formData = new FormData();
    formData.append("file", file);
    const res = await apiClient.post("/projects/import-excel/preview", formData, {
      headers: { "Content-Type": "multipart/form-data" },
    });
    return res.data;
  },
  applyExcel: async (
    file: File,
    approvedKeys: string[]
  ): Promise<{ status: string; applied_count: number; message: string }> => {
    const formData = new FormData();
    formData.append("file", file);
    formData.append("approved_keys_json", JSON.stringify(approvedKeys));
    const res = await apiClient.post("/projects/import-excel/apply", formData, {
      headers: { "Content-Type": "multipart/form-data" },
    });
    return res.data;
  },
  downloadM06Excel: async (): Promise<void> => {
    const res = await apiClient.get("/projects/export-excel", {
      responseType: "blob",
    });
    const url = window.URL.createObjectURL(new Blob([res.data]));
    const link = document.createElement("a");
    link.href = url;
    link.setAttribute("download", `Portfolio_03_M06_Data_${new Date().toISOString().split("T")[0]}.xlsx`);
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
    window.URL.revokeObjectURL(url);
  },
};

export const authApi = {
  loginInit: async (email: string): Promise<{ auth_method: "TOTP" | "EMAIL_OTP" | "PASSWORD"; email: string }> => {
    const res = await apiClient.post("/auth/login-init", { email });
    return res.data;
  },
  register: async (payload: { email: string; password: string; full_name: string; position?: string }) => {
    const res = await apiClient.post<{ status: string; message: string; email: string; dev_otp?: string }>("/auth/register", payload);
    return res.data;
  },
  resendOtp: async (email: string) => {
    const res = await apiClient.post<{ status: string; message: string; dev_otp?: string }>("/auth/resend-otp", { email });
    return res.data;
  },
  forgotPassword: async (email: string) => {
    const res = await apiClient.post<{ status: string; message: string; dev_otp?: string }>("/auth/forgot-password", { email });
    return res.data;
  },
  resetPassword: async (payload: { email: string; code: string; new_password: string }): Promise<AuthTokens> => {
    const res = await apiClient.post<AuthTokens>("/auth/reset-password", payload);
    localStorage.setItem("prochain_access_token", res.data.access_token);
    localStorage.setItem("prochain_refresh_token", res.data.refresh_token);
    localStorage.setItem("prochain_user", JSON.stringify(res.data.user));
    return res.data;
  },
  verifyOtp: async (email: string, code: string): Promise<AuthTokens> => {
    const res = await apiClient.post<AuthTokens>("/auth/verify-otp", { email, code });
    localStorage.setItem("prochain_access_token", res.data.access_token);
    localStorage.setItem("prochain_refresh_token", res.data.refresh_token);
    localStorage.setItem("prochain_user", JSON.stringify(res.data.user));
    return res.data;
  },
  login: async (email: string, password: string): Promise<any> => {
    const res = await apiClient.post<any>("/auth/login", { email, password });
    if (res.data.access_token) {
      localStorage.setItem("prochain_access_token", res.data.access_token);
      localStorage.setItem("prochain_refresh_token", res.data.refresh_token);
      localStorage.setItem("prochain_user", JSON.stringify(res.data.user));
    }
    return res.data;
  },
  verifyLogin2FA: async (email: string, code: string): Promise<AuthTokens> => {
    const res = await apiClient.post<AuthTokens>("/auth/verify-login-2fa", { email, code });
    localStorage.setItem("prochain_access_token", res.data.access_token);
    localStorage.setItem("prochain_refresh_token", res.data.refresh_token);
    localStorage.setItem("prochain_user", JSON.stringify(res.data.user));
    return res.data;
  },
  logout: async () => {
    try {
      await apiClient.post("/auth/logout");
    } finally {
      localStorage.removeItem("prochain_access_token");
      localStorage.removeItem("prochain_refresh_token");
      localStorage.removeItem("prochain_user");
    }
  },
  getSavedUser: (): User | null => {
    try {
      const u = localStorage.getItem("prochain_user");
      return u ? JSON.parse(u) : null;
    } catch {
      return null;
    }
  },
};

export const adminApi = {
  getPermissionsCatalog: async (): Promise<SystemPermission[]> => {
    const res = await apiClient.get<SystemPermission[]>("/admin/permissions-catalog");
    return res.data;
  },
  listUsers: async (): Promise<User[]> => {
    const res = await apiClient.get<User[]>("/admin/users");
    return res.data;
  },
  createUser: async (payload: { email: string; password: string; full_name: string; position?: string; role_id: string }) => {
    const res = await apiClient.post<{ status: string; message: string; user_id: string }>("/admin/users", payload);
    return res.data;
  },
  updateUser: async (userId: string, payload: Partial<User>) => {
    const res = await apiClient.patch(`/admin/users/${userId}`, payload);
    return res.data;
  },
  deleteUser: async (userId: string) => {
    const res = await apiClient.delete<{ status: string; message: string }>(`/admin/users/${userId}`);
    return res.data;
  },
  listRoles: async (): Promise<Role[]> => {
    const res = await apiClient.get<Role[]>("/admin/roles");
    return res.data;
  },
  createRole: async (payload: { id: string; name: string; description?: string; permissions?: string[] }) => {
    const res = await apiClient.post<{ status: string; message: string }>("/admin/roles", payload);
    return res.data;
  },
  updateRole: async (roleId: string, payload: { name?: string; description?: string; permissions?: string[] }) => {
    const res = await apiClient.patch(`/admin/roles/${roleId}`, payload);
    return res.data;
  },
  deleteRole: async (roleId: string) => {
    const res = await apiClient.delete<{ status: string; message: string }>(`/admin/roles/${roleId}`);
    return res.data;
  },
  resetUserPassword: async (userId: string, new_password: string) => {
    const res = await apiClient.post<{ status: string; message: string }>(`/admin/users/${userId}/reset-password`, { new_password });
    return res.data;
  },
  resetUserTotp: async (userId: string) => {
    const res = await apiClient.post<{ status: string; message: string }>(`/admin/users/${userId}/reset-totp`);
    return res.data;
  },
};

export const auditApi = {
  getLogs: async (params?: { entity_type?: string; action?: string; user_email?: string; group_by?: "date" | "user" }) => {
    const res = await apiClient.get<{ mode: string; total: number; items?: AuditLogItem[]; groups?: Record<string, AuditLogItem[]> }>("/audit/logs", { params });
    return res.data;
  },
  getTrashBin: async (): Promise<TrashItem[]> => {
    const res = await apiClient.get<TrashItem[]>("/audit/trash");
    return res.data;
  },
  rollback: async (logId: string) => {
    const res = await apiClient.post(`/audit/rollback/${logId}`);
    return res.data;
  },
};

export const userApi = {
  getMe: async (): Promise<User> => {
    const res = await apiClient.get<User>("/users/me");
    return res.data;
  },
  updateMe: async (payload: { full_name?: string; current_password?: string; new_password?: string; theme?: string }) => {
    const res = await apiClient.patch<{ status: string; message: string }>("/users/me", payload);
    return res.data;
  },
  setupTotp: async () => {
    const res = await apiClient.post<{ secret: string; otpauth_uri: string }>("/users/me/totp/setup");
    return res.data;
  },
  enableTotp: async (secret: string, code: string) => {
    const res = await apiClient.post<{ status: string; message: string }>("/users/me/totp/enable", { secret, code });
    return res.data;
  },
  disableTotp: async (password: string) => {
    const res = await apiClient.post<{ status: string; message: string }>("/users/me/totp/disable", { password });
    return res.data;
  },
  set2faPolicy: async (method: string) => {
    const res = await apiClient.post<{ status: string; message: string; two_factor_method: string }>("/users/me/2fa-policy", { method });
    return res.data;
  },
  changeEmailOtp: async (new_email: string) => {
    const res = await apiClient.post<{ status: string; message: string; dev_otp?: string }>("/users/me/change-email-otp", { new_email });
    return res.data;
  },
  changeEmail: async (new_email: string, otp_code: string) => {
    const res = await apiClient.post<{ status: string; message: string; email: string }>("/users/me/change-email", { new_email, otp_code });
    return res.data;
  },
  requestDeleteOtp: async () => {
    const res = await apiClient.post<{ status: string; message: string; dev_otp?: string }>("/users/me/delete-otp");
    return res.data;
  },
  deleteMe: async (otp_code: string) => {
    const res = await apiClient.delete<{ status: string; message: string }>("/users/me", { data: { otp_code } });
    return res.data;
  },
};

export const diaryApi = {
  listEntries: async (params?: {
    project_id?: string;
    category?: string;
    line_section?: string;
    status?: string;
    search?: string;
  }): Promise<DiaryEntry[]> => {
    const res = await apiClient.get<DiaryEntry[]>("/diary", { params });
    return res.data;
  },
  createEntry: async (projectId: string, payload: Partial<DiaryEntry>): Promise<DiaryEntry> => {
    const res = await apiClient.post<DiaryEntry>(`/projects/${projectId}/diary`, payload);
    return res.data;
  },
  updateEntry: async (entryId: string, payload: Partial<DiaryEntry>): Promise<DiaryEntry> => {
    const res = await apiClient.patch<DiaryEntry>(`/diary/${entryId}`, payload);
    return res.data;
  },
  deleteEntry: async (entryId: string): Promise<{ status: string }> => {
    const res = await apiClient.delete(`/diary/${entryId}`);
    return res.data;
  },
};

export const analyticsApi = {
  getOverlaps: async (): Promise<OverlapReport> => {
    const res = await apiClient.get<OverlapReport>("/analytics/overlaps");
    return res.data;
  },
};