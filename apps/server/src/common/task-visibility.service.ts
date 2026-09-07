import { ForbiddenException, Injectable } from "@nestjs/common";
import { getShanghaiWeekRange } from "./shanghai-time";

export const ADMIN_ROLES = ["OWNER", "SUPER_ADMIN"];
export const DESIGN_VISIBLE_STATUSES = [
  "OPS_APPROVED",
  "DESIGN_ASSIGNED",
  "IN_DESIGN",
  "DESIGN_REVIEW",
  "DESIGN_APPROVED",
  "COMPLETED",
];
export const ARCHIVED_TASK_STATUSES = ["DESIGN_APPROVED", "COMPLETED", "CANCELLED"];
export const OPERATION_MANAGER_VISIBLE_STATUSES = ["SUBMITTED", "OPS_REJECTED", ...DESIGN_VISIBLE_STATUSES];
export const DESIGN_UNFINISHED_IMAGE_STATUSES = [
  "PENDING_ASSIGNMENT",
  "NOT_STARTED",
  "IN_PROGRESS",
  "SUBMITTED_FOR_REVIEW",
  "REVISION_REQUIRED",
];

/** The active operations-manager plan is the gate into design assignment. */
export function currentOperationsApprovalPlanMembershipWhere(at = new Date()) {
  const range = getShanghaiWeekRange(at);
  return {
    some: {
      removedAt: null,
      plan: { weekStart: range.start, weekEnd: range.end },
    },
  };
}

@Injectable()
export class TaskVisibilityService {
  isAdmin(role?: string) {
    return ADMIN_ROLES.includes(role || "");
  }

  visibleWhere(role?: string, userId?: number) {
    const activeWhere: any = { deletedAt: null };
    if (!role || this.isAdmin(role)) return activeWhere;
    if (role === "OPERATION") return { ...activeWhere, creatorId: userId };
    if (role === "OPERATION_MANAGER") {
      return { ...activeWhere, workflowStatus: { in: OPERATION_MANAGER_VISIBLE_STATUSES } };
    }
    if (role === "DESIGN_MANAGER") {
      return {
        AND: [
          activeWhere,
          {
            OR: [
              { workflowStatus: { in: DESIGN_VISIBLE_STATUSES.filter((status) => status !== "OPS_APPROVED") } },
              {
                workflowStatus: "OPS_APPROVED",
                weeklyOperationsApprovalPlanItems: currentOperationsApprovalPlanMembershipWhere(),
              },
            ],
          },
        ],
      };
    }
    if (role === "DESIGNER") {
      return {
        ...activeWhere,
        workflowStatus: { in: DESIGN_VISIBLE_STATUSES },
        imageTasks: { some: { designerId: userId } },
      };
    }
    return { id: -1 };
  }

  designAssignmentWhere(role?: string, userId?: number) {
    this.assertDesignManager(role);
    return {
      AND: [
        this.visibleWhere(role, userId),
        { workflowStatus: "OPS_APPROVED" },
        { imageTasks: { some: { status: "PENDING_ASSIGNMENT", designerId: null } } },
      ],
    };
  }

  designReviewWhere(role?: string, userId?: number) {
    this.assertDesignManager(role);
    return {
      AND: [
        this.visibleWhere(role, userId),
        { workflowStatus: "DESIGN_REVIEW" },
        { imageTasks: { some: { status: "SUBMITTED_FOR_REVIEW" } } },
      ],
    };
  }

  designTaskWhere(role?: string, userId?: number) {
    if (role !== "DESIGNER") this.assertDesignManager(role);
    return {
      AND: [
        this.visibleWhere(role, userId),
        { workflowStatus: { in: ["DESIGN_ASSIGNED", "IN_DESIGN", "DESIGN_REVIEW", "DESIGN_APPROVED"] } },
      ],
    };
  }

  scopeWhere(scope: string, role?: string, userId?: number) {
    const visible = this.visibleWhere(role, userId);
    if (scope === "all") return visible;
    if (role === "OPERATION") {
      if (scope === "returned-for-supplement") return { AND: [visible, { workflowStatus: "OPS_REJECTED" }] };
      if (scope === "pending-operations-approval") return { AND: [visible, { workflowStatus: "SUBMITTED" }] };
      if (scope === "in-production") return { AND: [visible, { workflowStatus: { in: ["OPS_APPROVED", "DESIGN_ASSIGNED", "IN_DESIGN", "DESIGN_REVIEW"] } }] };
      if (scope === "design-completed") return { AND: [visible, { workflowStatus: { in: ["DESIGN_APPROVED", "COMPLETED"] } }] };
      if (scope === "processing") return { AND: [visible, { workflowStatus: { in: ["SUBMITTED", "OPS_APPROVED", "DESIGN_ASSIGNED", "IN_DESIGN", "DESIGN_REVIEW"] } }] };
    }
    if (scope === "ops-approvals") {
      if (role !== "OPERATION_MANAGER" && !this.isAdmin(role)) {
        throw new ForbiddenException("当前账号无权限访问该页面。");
      }
      return { AND: [visible, { workflowStatus: "SUBMITTED" }] };
    }
    if (scope === "design-assignment") return this.designAssignmentWhere(role, userId);
    if (scope === "design-reviews") return this.designReviewWhere(role, userId);
    if (scope === "design-tasks") return this.designTaskWhere(role, userId);
    if (scope === "approval-history") {
      if (role !== "OPERATION_MANAGER" && !this.isAdmin(role)) {
        throw new ForbiddenException("当前账号无权限访问该页面。");
      }
      return visible;
    }
    if (scope === "design-flow-history") {
      if (role !== "OPERATION" && !this.isAdmin(role)) {
        throw new ForbiddenException("当前账号无权限访问该页面。");
      }
      return visible;
    }
    if (scope === "drafts") {
      if (role !== "OPERATION" && !this.isAdmin(role)) {
        throw new ForbiddenException("当前账号无权限访问该页面。");
      }
      return { AND: [visible, { workflowStatus: "DRAFT" }] };
    }
    if (scope === "archived") {
      return { AND: [visible, { workflowStatus: { in: ARCHIVED_TASK_STATUSES } }] };
    }
    return { AND: [visible, { workflowStatus: { notIn: ["DRAFT", ...ARCHIVED_TASK_STATUSES] } }] };
  }

  imageTaskMetricWhere(
    scope: string,
    role?: string,
    userId?: number,
    imageStatus?: string,
    imageStatuses?: string[],
  ) {
    const where: any = {
      deletedAt: null,
      task: this.scopeWhere(scope, role, userId),
    };

    if (imageStatuses?.length) {
      where.status = { in: imageStatuses };
    } else if (imageStatus) {
      where.status = imageStatus;
    } else if (scope === "design-assignment") {
      where.status = "PENDING_ASSIGNMENT";
      where.designerId = null;
    } else if (scope === "design-reviews") {
      where.status = "SUBMITTED_FOR_REVIEW";
    } else if (scope === "design-tasks") {
      where.status = { in: DESIGN_UNFINISHED_IMAGE_STATUSES };
    }

    if (role === "DESIGNER") where.designerId = userId;
    return where;
  }

  unfinishedImageTaskWhere(role?: string, userId?: number) {
    const where: any = {
      deletedAt: null,
      status: { in: DESIGN_UNFINISHED_IMAGE_STATUSES },
      task: this.visibleWhere(role, userId),
    };
    if (role === "DESIGNER") where.designerId = userId;
    return where;
  }

  private assertDesignManager(role?: string) {
    if (role !== "DESIGN_MANAGER" && !this.isAdmin(role)) {
      throw new ForbiddenException("当前账号无权限访问该页面。");
    }
  }
}
