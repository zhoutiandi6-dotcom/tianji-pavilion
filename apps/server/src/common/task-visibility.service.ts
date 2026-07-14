import { ForbiddenException, Injectable } from "@nestjs/common";

export const ADMIN_ROLES = ["OWNER", "SUPER_ADMIN"];
export const DESIGN_VISIBLE_STATUSES = ["OPS_APPROVED", "DESIGN_ASSIGNED", "IN_DESIGN", "DESIGN_REVIEW", "DESIGN_APPROVED", "COMPLETED"];
export const ARCHIVED_TASK_STATUSES = ["DESIGN_APPROVED", "COMPLETED", "CANCELLED"];
export const OPERATION_MANAGER_VISIBLE_STATUSES = ["SUBMITTED", "OPS_REJECTED", ...DESIGN_VISIBLE_STATUSES];

@Injectable()
export class TaskVisibilityService {
  isAdmin(role?: string) {
    return ADMIN_ROLES.includes(role || "");
  }

  visibleWhere(role?: string, userId?: number) {
    const activeWhere: any = { deletedAt: null };
    if (!role || this.isAdmin(role)) return activeWhere;
    if (role === "OPERATION") return { ...activeWhere, creatorId: userId };
    if (role === "OPERATION_MANAGER") return { ...activeWhere, workflowStatus: { in: OPERATION_MANAGER_VISIBLE_STATUSES } };
    if (role === "DESIGN_MANAGER") return { ...activeWhere, workflowStatus: { in: DESIGN_VISIBLE_STATUSES } };
    if (role === "DESIGNER") {
      return { ...activeWhere, workflowStatus: { in: DESIGN_VISIBLE_STATUSES }, imageTasks: { some: { designerId: userId } } };
    }
    return { id: -1 };
  }

  scopeWhere(scope: string, role?: string, userId?: number) {
    const visible = this.visibleWhere(role, userId);
    if (scope === "ops-approvals") {
      if (role !== "OPERATION_MANAGER" && !this.isAdmin(role)) throw new ForbiddenException("当前账号无权限访问该页面。");
      return { AND: [visible, { workflowStatus: "SUBMITTED" }] };
    }
    if (scope === "design-assignment") {
      if (role !== "DESIGN_MANAGER" && !this.isAdmin(role)) throw new ForbiddenException("当前账号无权限访问该页面。");
      return { AND: [visible, { workflowStatus: "OPS_APPROVED" }, { imageTasks: { some: { status: "PENDING_ASSIGNMENT", designerId: null } } }] };
    }
    if (scope === "design-reviews") {
      if (role !== "DESIGN_MANAGER" && !this.isAdmin(role)) throw new ForbiddenException("当前账号无权限访问该页面。");
      return { AND: [visible, { workflowStatus: "DESIGN_REVIEW" }, { imageTasks: { some: { status: "SUBMITTED_FOR_REVIEW" } } }] };
    }
    if (scope === "design-tasks") {
      if (role !== "DESIGN_MANAGER" && !this.isAdmin(role)) throw new ForbiddenException("当前账号无权限访问该页面。");
      return { AND: [visible, { workflowStatus: { in: ["DESIGN_ASSIGNED", "IN_DESIGN", "DESIGN_REVIEW", "DESIGN_APPROVED"] } }] };
    }
    if (scope === "drafts") {
      if (role !== "OPERATION" && !this.isAdmin(role)) throw new ForbiddenException("当前账号无权限访问该页面。");
      return { AND: [visible, { workflowStatus: "DRAFT" }] };
    }
    if (scope === "archived") return { AND: [visible, { workflowStatus: { in: ARCHIVED_TASK_STATUSES } }] };
    return { AND: [visible, { workflowStatus: { notIn: ["DRAFT", ...ARCHIVED_TASK_STATUSES] } }] };
  }
}
