export enum UserRole {
  OWNER = "OWNER",
  SUPER_ADMIN = "SUPER_ADMIN",
  OPERATION_MANAGER = "OPERATION_MANAGER",
  DESIGN_MANAGER = "DESIGN_MANAGER",
  OPERATION = "OPERATION",
  DESIGNER = "DESIGNER",
  GUEST = "GUEST",
}

export enum TaskWorkflowStatus {
  DRAFT = "DRAFT",
  SUBMITTED = "SUBMITTED",
  OPS_REJECTED = "OPS_REJECTED",
  OPS_APPROVED = "OPS_APPROVED",
  DESIGN_ASSIGNED = "DESIGN_ASSIGNED",
  IN_DESIGN = "IN_DESIGN",
  DESIGN_REVIEW = "DESIGN_REVIEW",
  DESIGN_APPROVED = "DESIGN_APPROVED",
  COMPLETED = "COMPLETED",
}

export enum ImageTaskStatus {
  WAITING_OPS_APPROVAL = "WAITING_OPS_APPROVAL",
  PENDING_ASSIGNMENT = "PENDING_ASSIGNMENT",
  NOT_STARTED = "NOT_STARTED",
  IN_PROGRESS = "IN_PROGRESS",
  SUBMITTED_FOR_REVIEW = "SUBMITTED_FOR_REVIEW",
  REVISION_REQUIRED = "REVISION_REQUIRED",
  APPROVED = "APPROVED",
  COMPLETED = "COMPLETED",
}

export interface JwtPayload { sub: number; username: string; role: UserRole; }
export interface ApiResponse<T = unknown> { success: boolean; code: string; message: string; data?: T; }
export interface PaginatedResponse<T> { items: T[]; total: number; page: number; pageSize: number; }
