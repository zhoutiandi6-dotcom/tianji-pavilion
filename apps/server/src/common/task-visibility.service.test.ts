import { ForbiddenException } from "@nestjs/common";
import { currentOperationsApprovalPlanMembershipWhere, DESIGN_UNFINISHED_IMAGE_STATUSES, TaskVisibilityService } from "./task-visibility.service";

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
