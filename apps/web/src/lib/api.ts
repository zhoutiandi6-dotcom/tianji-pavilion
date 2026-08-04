import axios, { AxiosError, InternalAxiosRequestConfig } from "axios";
import type { ApiResponse } from "@tianji/types";

function resolveApiBaseUrl() {
  const configuredUrl = process.env.NEXT_PUBLIC_API_URL;

  // In LAN access, localhost belongs to the visitor's own computer.
  if (typeof window !== "undefined") {
    const currentHostUrl = `${window.location.protocol}//${window.location.hostname}:3001/api`;
    if (!configuredUrl || /localhost|127\.0\.0\.1/.test(configuredUrl)) {
      return currentHostUrl;
    }

    try {
      const configuredHost = new URL(configuredUrl).hostname;
      if (/^192\.168\./.test(configuredHost) && configuredHost !== window.location.hostname) {
        return currentHostUrl;
      }
    } catch {
      return currentHostUrl;
    }
  }

  return configuredUrl || "http://localhost:3001/api";
}

export const API_BASE_URL = resolveApiBaseUrl();

export function getErrorMessage(error: any, fallback = "操作失败，请稍后重试") {
  const message = error?.response?.data?.message;
  if (Array.isArray(message)) return message.join("; ");
  if (typeof message === "string" && message.trim()) return message;
  if (typeof error?.message === "string" && !error.response) return "无法连接服务器，请检查后端服务或网络";
  return fallback;
}

const api = axios.create({
  baseURL: API_BASE_URL,
  timeout: 15000,
  headers: { "Content-Type": "application/json" },
});

api.interceptors.request.use((config: InternalAxiosRequestConfig) => {
  if (typeof window !== "undefined") {
    const token = localStorage.getItem("accessToken");
    if (token) config.headers.Authorization = "Bearer " + token;
  }
  return config;
});

api.interceptors.response.use(
  (response) => {
    const method = String(response.config.method || "get").toLowerCase();
    if (typeof window !== "undefined" && ["post", "put", "patch", "delete"].includes(method)) {
      window.dispatchEvent(new Event("tianji:dashboard-refresh"));
    }
    return response;
  },
  (error: AxiosError<ApiResponse>) => {
    const data = error.response?.data;
    const requestUrl = error.config?.url || "";
    const isLoginRequest = requestUrl.includes("/auth/login");
    if (data && typeof data === "object" && "success" in data && data.success === false) {
      // Unified error response from backend
      if (data.code === "AUTH_UNAUTHORIZED" && !isLoginRequest && typeof window !== "undefined") {
        localStorage.removeItem("accessToken");
        window.location.href = "/login";
      }
    } else if (error.response?.status === 401 && !isLoginRequest && typeof window !== "undefined") {
      // Fallback for legacy error format
      localStorage.removeItem("accessToken");
      window.location.href = "/login";
    }
    return Promise.reject(error);
  },
);

export default api;

export const authApi = {
  login: (username: string, password: string) => api.post("/auth/login", { username, password }),
  getMe: () => api.get("/auth/me"),
};

export const userApi = {
  findAll: () => api.get("/users"),
  findOne: (id: number) => api.get("/users/" + id),
  findDesigners: () => api.get("/users/designers"),
};

export const rbacApi = {
  getRoles: () => api.get("/roles-permissions/roles"),
  getPermissions: () => api.get("/roles-permissions/permissions"),
};

export type CreateTaskPayload = {
  storeId?: number;
  productCode?: string;
  compatibleProduct?: string;
  requesterName?: string;
  operatorOwner?: string;
  priority?: string;
  urgent?: boolean;
  imageCount?: number;
  imageSize?: string;
  usagePosition?: string;
  requirementTypeId?: number;
  imageTasks?: Array<{ imageTitle?: string; requirementType?: string; requirement?: string }>;
};

export const taskApi = {
  findAll: (params?: Record<string, any>) => api.get("/tasks", { params }),
  findOne: (id: number) => api.get("/tasks/" + id),
  create: (data: CreateTaskPayload) => api.post("/tasks", data),
  update: (id: number, data: any) => api.patch("/tasks/" + id, data),
  remove: (id: number) => api.delete("/tasks/" + id),
  submit: (id: number) => api.post("/tasks/" + id + "/approval/submit"),
  withdraw: (id: number) => api.post("/tasks/" + id + "/approval/withdraw"),
  approve: (id: number, comment?: string) => api.post("/tasks/" + id + "/approval/approve", { comment }),
  reject: (id: number, data: { comment: string; issueImageTaskIds?: number[]; issueTypes?: string[] }) => api.post("/tasks/" + id + "/approval/reject", data),
  findOpsApprovalQueue: (params?: Record<string, any>) => api.get("/tasks/ops-approval-queue", { params }),
  rollbackApproval: (id: number) => api.post("/tasks/" + id + "/approval/rollback"),
  batchPriority: (data: { taskIds: number[]; priority: "URGENT" | "NORMAL" }) => api.post("/tasks/batch/priority", data),
  batchDelete: (data: { taskIds: number[] }) => api.post("/tasks/batch/delete", data),
};

export const imageTaskApi = {
  findByTask: (taskId: number) => api.get("/image-tasks/by-task/" + taskId),
  create: (data: { taskId: number; imageTitle: string; imageType?: string; requirementType?: string; requirement?: string; designerId?: number }) => api.post("/image-tasks", data),
  update: (id: number, data: any) => api.patch("/image-tasks/" + id, data),
  start: (id: number) => api.post("/image-tasks/" + id + "/start"),
  submitReview: (id: number) => api.post("/image-tasks/" + id + "/submit-review"),
  approveReview: (id: number, remark?: string) => api.post("/image-tasks/" + id + "/approve-review", { remark }),
  rejectReview: (id: number, remark?: string) => api.post("/image-tasks/" + id + "/reject-review", { remark }),
  batchAssignTasks: (data: { taskIds: number[]; designerId: number; mode: "ASSIGN" | "REASSIGN"; weekStart?: string; reason?: string }) => api.post("/image-tasks/batch/assign-tasks", data),
  batchReviewTasks: (data: { taskIds: number[]; action: "APPROVE" | "REJECT"; remark?: string }) => api.post("/image-tasks/batch/review-tasks", data),
  remove: (id: number) => api.delete("/image-tasks/" + id),
};

export const weeklyDesignerPlanApi = {
  getOverview: (weekStart?: string) => api.get("/weekly-designer-plans", { params: weekStart ? { weekStart } : undefined }),
  initialize: (weekStart: string) => api.post("/weekly-designer-plans/initialize", { weekStart }),
  getUnassigned: () => api.get("/weekly-designer-plans/unassigned"),
  getChanges: (weekStart?: string) => api.get("/weekly-designer-plans/changes", { params: weekStart ? { weekStart } : undefined }),
  removeDecree: (taskId: number, data: { weekStart: string; reason: string }) => api.post(`/weekly-designer-plans/decrees/${taskId}/remove`, data),
};

export const weeklyOperationsApprovalPlanApi = {
  getOverview: (weekStart?: string) => api.get("/weekly-operations-approval-plans", { params: weekStart ? { weekStart } : undefined }),
  initialize: (weekStart: string) => api.post("/weekly-operations-approval-plans/initialize", { weekStart }),
  getCandidates: (weekStart: string, search?: string) => api.get("/weekly-operations-approval-plans/candidates", { params: { weekStart, search } }),
  addDecrees: (data: { weekStart: string; decreeIds: number[] }) => api.post("/weekly-operations-approval-plans/items", data),
  removeItem: (itemId: number, reason: string) => api.post(`/weekly-operations-approval-plans/items/${itemId}/remove`, { reason }),
  moveItem: (itemId: number, data: { weekStart: string; reason: string }) => api.post(`/weekly-operations-approval-plans/items/${itemId}/move`, data),
};

export const attachmentApi = {
  findByTask: (taskId: number) => api.get("/attachments/by-task/" + taskId),
  findByImageTask: (imageTaskId: number) => api.get("/attachments/by-image-task/" + imageTaskId),
  uploadTask: (taskId: number, category: string, file: File) => {
    const form = new FormData();
    form.append("category", category);
    form.append("file", file);
    return api.post("/attachments/task/" + taskId + "/upload", form, { headers: { "Content-Type": "multipart/form-data" } });
  },
  uploadImageTask: (imageTaskId: number, category: string, file: File) => {
    const form = new FormData();
    form.append("category", category);
    form.append("file", file);
    return api.post("/attachments/image-task/" + imageTaskId + "/upload", form, { headers: { "Content-Type": "multipart/form-data" } });
  },
  download: (id: number) => api.get("/attachments/" + id + "/download", { responseType: "blob" }),
  remove: (id: number) => api.delete("/attachments/" + id),
};

export const dashboardApi = {
  getStats: () => api.get("/dashboard/overview"),
  getRoleDashboard: (includeAnalytics = true) => api.get("/dashboard/role", { params: { analytics: includeAnalytics ? undefined : "false" } }),
};

export const logApi = {
  findAll: (page?: number) => api.get("/operation-logs", { params: { page } }),
};
