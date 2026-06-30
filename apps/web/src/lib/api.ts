import axios, { AxiosError, InternalAxiosRequestConfig } from "axios";
import type { ApiResponse } from "@tianji/types";

const api = axios.create({
  baseURL: process.env.NEXT_PUBLIC_API_URL || "http://localhost:3001/api",
  timeout: 15000,
  headers: { "Content-Type": "application/json" },
});

// 自动注入 JWT Token
api.interceptors.request.use((config: InternalAxiosRequestConfig) => {
  if (typeof window !== "undefined") {
    const token = localStorage.getItem("accessToken");
    if (token) {
      config.headers.Authorization = `Bearer ${token}`;
    }
  }
  return config;
});

// 统一错误处理
api.interceptors.response.use(
  (response) => response,
  (error: AxiosError<ApiResponse>) => {
    if (error.response?.status === 401 && typeof window !== "undefined") {
      localStorage.removeItem("accessToken");
      window.location.href = "/login";
    }
    return Promise.reject(error);
  },
);

export default api;

// 认证 API
export const authApi = {
  login: (username: string, password: string) =>
    api.post("/auth/login", { username, password }),
  getMe: () => api.get("/auth/me"),
};

export const userApi = {
  findAll: () => api.get("/users"),
  findOne: (id: number) => api.get(`/users/${id}`),
};

export const rbacApi = {
  getRoles: () => api.get("/roles-permissions/roles"),
  getPermissions: () => api.get("/roles-permissions/permissions"),
};


// 法旨 API
export const taskApi = {
  findAll: (params?: Record<string, any>) =>
    api.get("/tasks", { params }),
  findOne: (id: number) =>
    api.get(`/tasks/${id}`),
  create: (data: { title: string; description?: string; priority?: string; assigneeId?: number; storeId?: number }) =>
    api.post("/tasks", data),
  update: (id: number, data: Record<string, any>) =>
    api.patch(`/tasks/${id}`, data),
  updateStatus: (id: number, status: string) =>
    api.patch(`/tasks/${id}/status`, { status }),
  remove: (id: number) =>
    api.delete(`/tasks/${id}`),
};
