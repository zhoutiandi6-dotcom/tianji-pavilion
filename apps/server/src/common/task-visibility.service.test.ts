import { ForbiddenException } from "@nestjs/common";
import { Capability, currentOperationsApprovalPlanMembershipWhere, DESIGN_UNFINISHED_IMAGE_STATUSES, TaskVisibilityService } from "./task-visibility.service";

describe("TaskVisibilityService", () => {
  const service = new TaskVisibilityService();

  it("limits operation users to tasks they created", () => {
    expect(service.visibleWhere("OPERATION", 7)).toEqual({ deletedAt: null, creatorId: 7 });
  });

  it("limits designers to visible workflows and their own image tasks", () => {
    expect(service.visibleWhere("DESIGNER", 9)).toEqual(expect.objectContaining({
      deletedAt: null,
      imageTasks: { some: { designerId: 9 } },
    }));
  });

  it("uses the same assignment condition for page and image metrics", () => {
    expect(service.scopeWhere("design-assignment", "DESIGN_MANAGER", 4)).toEqual(
      service.designAssignmentWhere("DESIGN_MANAGER", 4),
    );
    expect(service.imageTaskMetricWhere("design-assignment", "DESIGN_MANAGER", 4)).toEqual(expect.objectContaining({
      deletedAt: null,
      status: "PENDING_ASSIGNMENT",
      designerId: null,
    }));
  });

  it("rejects non design managers from design manager scopes", () => {
    expect(() => service.scopeWhere("design-reviews", "DESIGNER", 9)).toThrow(ForbiddenException);
  });

  it("resolves the Phase 2 operations scope contract without enabling group behavior", () => {
    expect(service.resolveDataScope({ role: "OPERATION", userId: 7 })).toEqual({ type: "SELF" });
    expect(service.resolveDataScope({ role: "OPERATION", userId: 7, membershipRole: "GROUP_LEADER", groupId: 3 })).toEqual({ type: "GROUP", groupId: 3 });
    expect(service.resolveDataScope({ role: "OPERATION_MANAGER", userId: 8 })).toEqual({ type: "ALL_OPERATIONS" });
    expect(service.resolveDataScope({ role: "OWNER", userId: 1 })).toEqual({ type: "GLOBAL_ADMIN" });
  });

  it("keeps data scope independent from operation capability", () => {
    expect(service.hasCapability({ role: "OPERATION_MANAGER", userId: 8 }, "TASK_VIEW")).toBe(true);
    expect(service.hasCapability({ role: "OPERATION_MANAGER", userId: 8 }, "TASK_APPROVE")).toBe(true);
    expect(service.hasCapability({ role: "OPERATION_MANAGER", userId: 8 }, "TASK_DELETE")).toBe(false);
    expect(service.hasCapability({ role: "OPERATION_MANAGER", userId: 8 }, "ORG_MANAGE")).toBe(false);
  });

  it("declares every capability used by the Phase 2 contract", () => {
    const capabilities: Capability[] = [
      "TASK_VIEW", "TASK_CREATE", "TASK_EDIT", "TASK_DELETE", "TASK_SUBMIT", "TASK_APPROVE", "TASK_REJECT", "TASK_ROLLBACK",
      "ATTACHMENT_VIEW", "ATTACHMENT_UPLOAD", "IMAGE_TASK_VIEW", "IMAGE_TASK_EDIT", "DASHBOARD_VIEW", "STATISTICS_VIEW",
      "WEEKLY_PLAN_VIEW", "WEEKLY_PLAN_EDIT", "FEEDBACK_VIEW", "FEEDBACK_SUBMIT", "FEEDBACK_STATUS_CHANGE", "ORG_VIEW", "ORG_MANAGE",
    ];
    expect(capabilities).toHaveLength(21);
  });

  it("shadows the legacy direct-task access decisions for all active roles", () => {
    const submitted = { creatorId: 7, workflowStatus: "SUBMITTED", imageTasks: [{ designerId: 9 }] };
    const draft = { creatorId: 7, workflowStatus: "DRAFT", imageTasks: [{ designerId: 9 }] };
    expect(service.canAccessTask({ role: "OPERATION", userId: 7 }, submitted)).toBe(true);
    expect(service.canAccessTask({ role: "OPERATION", userId: 8 }, submitted)).toBe(false);
    expect(service.canAccessTask({ role: "OPERATION_MANAGER", userId: 8 }, submitted)).toBe(true);
    expect(service.canAccessTask({ role: "OPERATION_MANAGER", userId: 8 }, draft)).toBe(false);
    expect(service.canAccessTask({ role: "OPERATION_MANAGER", userId: 7 }, draft)).toBe(true);
    expect(service.canAccessTask({ role: "DESIGN_MANAGER", userId: 4 }, submitted)).toBe(false);
    expect(service.canAccessTask({ role: "DESIGNER", userId: 9 }, { ...submitted, workflowStatus: "IN_DESIGN" })).toBe(true);
    expect(service.canAccessTask({ role: "DESIGNER", userId: 10 }, { ...submitted, workflowStatus: "IN_DESIGN" })).toBe(false);
    expect(service.canAccessTask({ role: "OWNER", userId: 1 }, draft)).toBe(true);
  });

  it("shadows current main-task edit and approval boundaries without activating a new policy", () => {
    expect(service.canEditTask({ role: "OPERATION", userId: 7 }, { creatorId: 7, workflowStatus: "DRAFT" })).toBe(true);
    expect(service.canEditTask({ role: "OPERATION", userId: 7 }, { creatorId: 7, workflowStatus: "SUBMITTED" })).toBe(false);
    expect(service.canEditTask({ role: "OPERATION_MANAGER", userId: 8 }, { creatorId: 7, workflowStatus: "SUBMITTED" })).toBe(true);
    expect(service.canEditTask({ role: "DESIGN_MANAGER", userId: 4 }, { creatorId: 7, workflowStatus: "SUBMITTED" })).toBe(false);
    expect(service.canApproveTask({ role: "OPERATION_MANAGER", userId: 8 }, { workflowStatus: "SUBMITTED" })).toBe(true);
    expect(service.canApproveTask({ role: "OPERATION_MANAGER", userId: 8 }, { workflowStatus: "DRAFT" })).toBe(false);
    expect(service.canApproveTask({ role: "OPERATION", userId: 7 }, { workflowStatus: "SUBMITTED" })).toBe(false);
  });

  it("gates OPS_APPROVED design-manager visibility on the current operations plan", () => {
    expect(service.visibleWhere("DESIGN_MANAGER", 4)).toEqual(expect.objectContaining({
      AND: expect.arrayContaining([
        expect.objectContaining({
          OR: expect.arrayContaining([
            expect.objectContaining({
              workflowStatus: "OPS_APPROVED",
              weeklyOperationsApprovalPlanItems: currentOperationsApprovalPlanMembershipWhere(),
            }),
          ]),
        }),
      ]),
    }));
  });

  it("allows designers to query only their assigned design-task scope", () => {
    expect(service.scopeWhere("design-tasks", "DESIGNER", 9)).toEqual({
      AND: [
        service.visibleWhere("DESIGNER", 9),
        { workflowStatus: { in: ["DESIGN_ASSIGNED", "IN_DESIGN", "DESIGN_REVIEW", "DESIGN_APPROVED"] } },
      ],
    });
    expect(service.imageTaskMetricWhere("design-tasks", "DESIGNER", 9)).toEqual(expect.objectContaining({
      designerId: 9,
      status: { in: DESIGN_UNFINISHED_IMAGE_STATUSES },
    }));
  });

  it("denies unknown roles by default", () => {
    expect(service.visibleWhere("GUEST", 10)).toEqual({ id: -1 });
    expect(service.visibleWhere("UNKNOWN", 10)).toEqual({ id: -1 });
  });

  it("keeps ordinary-operator views owned by the current operator", () => {
    expect(service.scopeWhere("all", "OPERATION", 7)).toEqual({ deletedAt: null, creatorId: 7 });
    expect(service.scopeWhere("pending-operations-approval", "OPERATION", 7)).toEqual({
      AND: [{ deletedAt: null, creatorId: 7 }, { workflowStatus: "SUBMITTED" }],
    });
  });

  it("keeps operations-manager returns separate from design-flow processing", () => {
    expect(service.scopeWhere("returned-for-supplement", "OPERATION", 7)).toEqual({
      AND: [{ deletedAt: null, creatorId: 7 }, { workflowStatus: "OPS_REJECTED" }],
    });
    expect(service.scopeWhere("processing", "OPERATION", 7)).toEqual({
      AND: [
        { deletedAt: null, creatorId: 7 },
        { workflowStatus: { in: ["SUBMITTED", "OPS_APPROVED", "DESIGN_ASSIGNED", "IN_DESIGN", "DESIGN_REVIEW"] } },
      ],
    });
  });

  it("exposes completed decrees only after the design workflow reaches its approved state", () => {
    expect(service.scopeWhere("design-completed", "OPERATION", 7)).toEqual({
      AND: [{ deletedAt: null, creatorId: 7 }, { workflowStatus: { in: ["DESIGN_APPROVED", "COMPLETED"] } }],
    });
  });
});
