import { ForbiddenException } from "@nestjs/common";
import { TaskVisibilityService } from "./task-visibility.service";

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

  it("denies unknown roles by default", () => {
    expect(service.visibleWhere("GUEST", 10)).toEqual({ id: -1 });
    expect(service.visibleWhere("UNKNOWN", 10)).toEqual({ id: -1 });
  });
});
