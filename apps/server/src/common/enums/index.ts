export enum TaskPriority {
  NORMAL = "NORMAL",
  URGENT = "URGENT",
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
  CANCELLED = "CANCELLED",
}

export enum ApprovalAction {
  OPS_APPROVED = "OPS_APPROVED",
  OPS_REJECTED = "OPS_REJECTED",
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

export function calcTaskStatus(imageTasks: { status: string }[]): string {
  if (!imageTasks || imageTasks.length === 0) return TaskWorkflowStatus.OPS_APPROVED;
  if (imageTasks.every(t => t.status === ImageTaskStatus.COMPLETED || t.status === ImageTaskStatus.APPROVED)) return TaskWorkflowStatus.DESIGN_APPROVED;
  if (imageTasks.some(t => t.status === ImageTaskStatus.SUBMITTED_FOR_REVIEW)) return TaskWorkflowStatus.DESIGN_REVIEW;
  if (imageTasks.some(t => [ImageTaskStatus.IN_PROGRESS, ImageTaskStatus.REVISION_REQUIRED].includes(t.status as ImageTaskStatus))) return TaskWorkflowStatus.IN_DESIGN;
  if (imageTasks.some(t => t.status === ImageTaskStatus.NOT_STARTED)) return TaskWorkflowStatus.DESIGN_ASSIGNED;
  return TaskWorkflowStatus.OPS_APPROVED;
}
