// ===== 基础枚举 =====
export enum UserRole {
  ADMIN = 'ADMIN',
  MANAGER = 'MANAGER',
  DESIGNER = 'DESIGNER',
  OPERATOR = 'OPERATOR',
}

export enum TaskStatus {
  PENDING = 'PENDING',
  IN_PROGRESS = 'IN_PROGRESS',
  COMPLETED = 'COMPLETED',
  CANCELLED = 'CANCELLED',
}

export enum RequirementItemStatus {
  AWAITING_REVIEW = 'AWAITING_REVIEW',
  IN_REVISION = 'IN_REVISION',
  APPROVED = 'APPROVED',
}

// ===== JWT Payload =====
export interface JwtPayload {
  sub: number;
  username: string;
  role: UserRole;
}

// ===== API 统一响应 =====
export interface ApiResponse<T = unknown> {
  code: number;
  message: string;
  data?: T;
}

export interface PaginatedResponse<T> {
  items: T[];
  total: number;
  page: number;
  pageSize: number;
}

// ===== 用户 =====
export interface UserDto {
  id: number;
  username: string;
  displayName: string;
  email: string;
  role: UserRole;
  isActive: boolean;
  mustChangePassword: boolean;
  createdAt: string;
}

export interface LoginRequest {
  username: string;
  password: string;
}

export interface LoginResponse {
  accessToken: string;
  user: UserDto;
  mustChangePassword: boolean;
}

// ===== 权限 =====
export interface PermissionDto {
  id: number;
  action: string;
  resource: string;
  description: string | null;
}

export interface RoleDto {
  id: number;
  name: string;
  description: string | null;
  permissions: PermissionDto[];
}

// ===== 基础数据模型 DTO =====
export interface TaskDto {
  id: number;
  title: string;
  description: string | null;
  status: TaskStatus;
  creatorId: number;
  assigneeId: number | null;
  storeId: number | null;
  createdAt: string;
  updatedAt: string;
}

export interface StoreDto {
  id: number;
  name: string;
  code: string;
  description: string | null;
  isActive: boolean;
}

export interface RequirementTypeDto {
  id: number;
  name: string;
  description: string | null;
  sortOrder: number;
  isActive: boolean;
}
