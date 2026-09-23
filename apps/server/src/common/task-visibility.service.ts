import { ForbiddenException, Injectable, Optional } from "@nestjs/common";
import { getShanghaiWeekRange } from "./shanghai-time";
import { OperationsOrganizationService } from "../operations-organization/operations-organization.service";

/**
 * ORG-PERM-001 authorization contract.
 *
 * Data scope deliberately describes only the data set a subject may inspect;
 * it never grants a write capability. GROUP is a contract-only variant in
 * Phase 2: no production caller supplies a group yet.
 */
export type DataScope =
  | { type: "SELF" }
  | { type: "GROUP"; groupId: number }
  | { type: "ALL_OPERATIONS" }
  | { type: "GLOBAL_ADMIN" };

export type Capability =
  | "TASK_VIEW"
  | "TASK_CREATE"
  | "TASK_EDIT"
  | "TASK_DELETE"
  | "TASK_SUBMIT"
  | "TASK_APPROVE"
  | "TASK_REJECT"
  | "TASK_ROLLBACK"
  | "ATTACHMENT_VIEW"
  | "ATTACHMENT_UPLOAD"
  | "IMAGE_TASK_VIEW"
  | "IMAGE_TASK_EDIT"
  | "DASHBOARD_VIEW"
  | "STATISTICS_VIEW"
  | "WEEKLY_PLAN_VIEW"
  | "WEEKLY_PLAN_EDIT"
  | "FEEDBACK_VIEW"
  | "FEEDBACK_SUBMIT"
  | "FEEDBACK_STATUS_CHANGE"
  | "ORG_VIEW"
  | "ORG_MANAGE";

export type AuthorizationSubject = {
  userId?: number;
  role?: string;
  /** Contract-only until Phase 3 adds persisted operation memberships. */
  membershipRole?: "MEMBER" | "GROUP_LEADER";
  /** Contract-only until Phase 3 adds persisted operation groups. */
  groupId?: number;
};

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
  constructor(@Optional() private readonly organization?: OperationsOrganizationService) {}

  async subjectForUser(role?: string, userId?: number): Promise<AuthorizationSubject> {
    const subject: AuthorizationSubject = { role, userId };
    if (role !== "OPERATION" || !userId || !this.organization) return subject;
    const membership = await this.organization.getActiveMembership(userId);
    if (membership) {
      subject.membershipRole = membership.memberRole as "MEMBER" | "GROUP_LEADER";
      subject.groupId = membership.groupId;
    }
    return subject;
  }
  /**
   * The one authoritative operations data-scope resolver. It is intentionally
   * pure so Phase 2 tests can compare it with legacy role behavior without
   * changing any request or database result.
   */
  resolveDataScope(subject: AuthorizationSubject): DataScope {
    const role = subject.role || "";
    if (this.isAdmin(role)) return { type: "GLOBAL_ADMIN" };
    if (role === "OPERATION_MANAGER") return { type: "ALL_OPERATIONS" };
    if (role === "OPERATION" && subject.membershipRole === "GROUP_LEADER" && Number.isInteger(subject.groupId) && (subject.groupId || 0) > 0) {
      return { type: "GROUP", groupId: subject.groupId! };
    }
    return { type: "SELF" };
  }

  /**
   * Baseline capability only. Record/state checks remain in can* methods so
   * ALL_OPERATIONS can never imply edit, approval, or deletion.
   */
  hasCapability(subject: AuthorizationSubject, capability: Capability): boolean {
    const role = subject.role || "";
    if (this.isAdmin(role)) return true;
    // Contract-only in Phase 4: no production request resolves persisted
    // membership into this subject, so this cannot alter a real approval queue.
    if (role === "OPERATION" && subject.membershipRole === "GROUP_LEADER" && capability === "TASK_APPROVE") return true;
    const capabilities: Record<string, Capability[]> = {
      OPERATION: [
        "TASK_VIEW", "TASK_CREATE", "TASK_EDIT", "TASK_DELETE", "TASK_SUBMIT",
        "ATTACHMENT_VIEW", "ATTACHMENT_UPLOAD", "IMAGE_TASK_VIEW", "IMAGE_TASK_EDIT",
        "DASHBOARD_VIEW", "STATISTICS_VIEW", "FEEDBACK_VIEW", "FEEDBACK_SUBMIT",
      ],
      OPERATION_MANAGER: [
        "TASK_VIEW", "TASK_EDIT", "TASK_APPROVE", "TASK_REJECT", "TASK_ROLLBACK",
        "ATTACHMENT_VIEW", "IMAGE_TASK_VIEW", "DASHBOARD_VIEW", "STATISTICS_VIEW",
        "WEEKLY_PLAN_VIEW", "WEEKLY_PLAN_EDIT", "FEEDBACK_VIEW", "FEEDBACK_SUBMIT", "ORG_VIEW",
      ],
      DESIGN_MANAGER: [
        "TASK_VIEW", "IMAGE_TASK_VIEW", "IMAGE_TASK_EDIT", "DASHBOARD_VIEW",
        "STATISTICS_VIEW", "WEEKLY_PLAN_VIEW", "WEEKLY_PLAN_EDIT", "FEEDBACK_VIEW", "FEEDBACK_SUBMIT",
      ],
      DESIGNER: [
        "TASK_VIEW", "IMAGE_TASK_VIEW", "IMAGE_TASK_EDIT", "DASHBOARD_VIEW",
        "FEEDBACK_VIEW", "FEEDBACK_SUBMIT",
      ],
    };
    return capabilities[role]?.includes(capability) || false;
  }

  buildTaskVisibilityWhere(subject: AuthorizationSubject) {
    const activeWhere: any = { deletedAt: null };
    const scope = this.resolveDataScope(subject);
    if (scope.type === "GLOBAL_ADMIN") return activeWhere;
    if (scope.type === "ALL_OPERATIONS") {
      return {
        AND: [activeWhere, { OR: [
          // New organization decrees are globally inspectable by the operations
          // manager regardless of workflow state. This does not grant TASK_EDIT.
          { operationGroupSnapshotId: { not: null } },
          // Keep the legacy visibility contract intact instead of widening old
          // unscoped drafts merely because GROUP authorization is now enabled.
          {
            operationGroupSnapshotId: null,
            operationMembershipSnapshotId: null,
            operationSnapshotAt: null,
            workflowStatus: { in: OPERATION_MANAGER_VISIBLE_STATUSES },
          },
        ] }],
      };
    }
    if (scope.type === "GROUP") {
      return {
        AND: [activeWhere, { OR: [
          { operationGroupSnapshotId: scope.groupId },
          // A leader retains only their pre-organization SELF compatibility;
          // unscoped decrees never become group data by current membership.
          { creatorId: subject.userId, operationGroupSnapshotId: null, operationMembershipSnapshotId: null, operationSnapshotAt: null },
        ] }],
      };
    }
    return this.visibleWhere(subject.role, subject.userId);
  }

  /** Phase 4 shadow-only query; it is deliberately not wired into visibleWhere. */
  shadowGroupSnapshotWhere(groupId: number) {
    return { deletedAt: null, operationGroupSnapshotId: groupId };
  }

  /** Legacy-compatible task read decision for direct-record callers. */
  canAccessTask(subject: AuthorizationSubject, task: { creatorId: number; workflowStatus: string; operationGroupSnapshotId?: number | null; operationMembershipSnapshotId?: number | null; operationSnapshotAt?: Date | null; imageTasks?: Array<{ designerId?: number | null }> }): boolean {
    const role = subject.role || "";
    const userId = subject.userId;
    if (!this.hasCapability(subject, "TASK_VIEW")) return false;
    if (this.isAdmin(role)) return true;
    if (role === "OPERATION") {
      const scope = this.resolveDataScope(subject);
      if (scope.type !== "GROUP") return task.creatorId === userId;
      return task.operationGroupSnapshotId === scope.groupId
        || (task.creatorId === userId && !task.operationGroupSnapshotId && !task.operationMembershipSnapshotId && !task.operationSnapshotAt);
    }
    if (role === "OPERATION_MANAGER") {
      return Boolean(task.operationGroupSnapshotId)
        || task.workflowStatus !== "DRAFT"
        || task.creatorId === userId;
    }
    if (role === "DESIGN_MANAGER") return DESIGN_VISIBLE_STATUSES.includes(task.workflowStatus);
    if (role === "DESIGNER") return DESIGN_VISIBLE_STATUSES.includes(task.workflowStatus)
      && Boolean(task.imageTasks?.some((item) => item.designerId === userId));
    return false;
  }

  /** Legacy-compatible main-task edit decision; it does not change endpoints. */
  canEditTask(subject: AuthorizationSubject, task: { creatorId: number; workflowStatus: string }): boolean {
    const role = subject.role || "";
    if (!this.hasCapability(subject, "TASK_EDIT")) return false;
    if (role === "OPERATION") return task.creatorId === subject.userId && ["DRAFT", "OPS_REJECTED"].includes(task.workflowStatus);
    return this.isAdmin(role);
  }

  canApproveTask(subject: AuthorizationSubject, task: { workflowStatus: string }): boolean {
    return this.hasCapability(subject, "TASK_APPROVE") && task.workflowStatus === "SUBMITTED";
  }

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

  scopeWhere(scope: string, role?: string, userId?: number, subject?: AuthorizationSubject) {
    const visible = subject ? this.buildTaskVisibilityWhere(subject) : this.visibleWhere(role, userId);
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
