import { ForbiddenException } from "@nestjs/common";
import { getShanghaiWeekRange } from "../common/shanghai-time";
import { WeeklyDesignerPlansService } from "./weekly-designer-plans.service";

describe("WeeklyDesignerPlansService", () => {
  let prisma: any;
  let service: WeeklyDesignerPlansService;

  const designer = { id: 7, username: "designer", displayName: "设计师甲", isActive: true };
  const currentWeek = () => getShanghaiWeekRange();
  const currentWeekStart = () => new Intl.DateTimeFormat("en-CA", { timeZone: "Asia/Shanghai" }).format(currentWeek().start);
  const nextWeekStart = () => new Intl.DateTimeFormat("en-CA", { timeZone: "Asia/Shanghai" }).format(
    getShanghaiWeekRange(new Date(currentWeek().start.getTime() + 7 * 24 * 60 * 60 * 1000)).start,
  );
  const planItem = (overrides: Record<string, unknown> = {}) => ({
    id: 1,
    designerId: 7,
    status: "PLANNED",
    plannedAt: new Date(),
    designer,
    imageTask: {
      id: 10,
      taskId: 3,
      imageTitle: "主图",
      designerId: 7,
      status: "NOT_STARTED",
      task: { id: 3, serialNumber: "TJ-3", productCode: "SKU-3", workflowStatus: "DESIGN_ASSIGNED", store: null, requirementType: null },
    },
    ...overrides,
  });

  beforeEach(() => {
    prisma = {
      weeklyPlan: { findUnique: jest.fn(), upsert: jest.fn().mockImplementation(({ create }: any) => ({ id: 1, ...create })) },
      weeklyPlanItem: { findMany: jest.fn() },
      weeklyDesignerPlan: {
        findMany: jest.fn(),
        findUnique: jest.fn(),
        create: jest.fn().mockImplementation(({ data }: any) => ({ id: 31, ...data })),
        update: jest.fn().mockImplementation(({ data }: any) => ({ id: 31, ...data })),
      },
      weeklyDesignerPlanAdjustment: { create: jest.fn().mockResolvedValue({ id: 1 }), findMany: jest.fn().mockResolvedValue([]) },
      imageTask: { findMany: jest.fn() },
      task: { findMany: jest.fn() },
      auditEvent: { create: jest.fn().mockResolvedValue({ id: 1 }), findMany: jest.fn().mockResolvedValue([]) },
      user: { findMany: jest.fn().mockResolvedValue([designer]), findFirst: jest.fn().mockResolvedValue(designer) },
    };
    prisma.$transaction = jest.fn().mockImplementation(async (callback: any) => callback(prisma));
    service = new WeeklyDesignerPlansService(prisma);
  });

  it("calculates assigned work from weekly task memberships and completion from final approvals", async () => {
    const range = currentWeek();
    prisma.weeklyDesignerPlan.findMany.mockResolvedValue([{ id: 31, designerId: 7, targetImageCount: 6, designer }]);
    prisma.weeklyPlan.findUnique.mockResolvedValue({ id: 1, status: "ACTIVE", items: [planItem(), planItem({ id: 2, imageTask: { ...planItem().imageTask, id: 11, status: "SUBMITTED_FOR_REVIEW" } })] });
    prisma.imageTask.findMany.mockResolvedValue([{ id: 10, designerId: 7 }, { id: 11, designerId: 7 }]);

    const result = await service.getWeekOverview(9, "DESIGN_MANAGER", currentWeekStart());

    expect(result.summary).toEqual(expect.objectContaining({ targetImageCount: 6, assignedCount: 2, completedCount: 2, remainingTargetCount: 4, completionRate: 33.3 }));
    expect(result.designers[0]).toEqual(expect.objectContaining({ designerId: 7, targetImageCount: 6, assignedCount: 2, pendingReviewCount: 1 }));
    expect(prisma.imageTask.findMany).toHaveBeenCalledWith(expect.objectContaining({ where: expect.objectContaining({ approvedAt: { gte: range.start, lt: range.end } }) }));
  });

  it("creates zero-target records for every active designer when initializing the current week", async () => {
    prisma.weeklyDesignerPlan.findUnique.mockResolvedValue(null);
    const result = await service.initializeWeek(currentWeekStart(), 9, "DESIGN_MANAGER");

    expect(result).toEqual(expect.objectContaining({ createdCount: 1, designerCount: 1 }));
    expect(prisma.weeklyDesignerPlan.create).toHaveBeenCalledWith({
      data: expect.objectContaining({ designerId: 7, targetImageCount: 0, createdById: 9 }),
    });
  });

  it("creates a next-week target plan using the same unique target source", async () => {
    prisma.weeklyDesignerPlan.findUnique.mockResolvedValue(null);
    const result = await service.upsertTarget({ designerId: 7, weekStart: nextWeekStart(), targetImageCount: 12, reason: "周初计划" }, 9, "DESIGN_MANAGER");

    expect(result).toEqual(expect.objectContaining({ created: true, adjusted: false }));
    expect(prisma.weeklyDesignerPlan.create).toHaveBeenCalledWith({
      data: expect.objectContaining({ designerId: 7, targetImageCount: 12, createdById: 9 }),
    });
  });

  it("records a durable adjustment when the current-week target changes", async () => {
    prisma.weeklyDesignerPlan.findUnique.mockResolvedValue({ id: 31, designerId: 7, targetImageCount: 4 });
    await service.upsertTarget({ designerId: 7, weekStart: currentWeekStart(), targetImageCount: 6, reason: "周中调整" }, 9, "DESIGN_MANAGER");

    expect(prisma.weeklyDesignerPlan.update).toHaveBeenCalledWith({ where: { id: 31 }, data: { targetImageCount: 6 } });
    expect(prisma.weeklyDesignerPlanAdjustment.create).toHaveBeenCalledWith({
      data: expect.objectContaining({ planId: 31, previousTarget: 4, newTarget: 6, reason: "周中调整", adjustedById: 9 }),
    });
  });

  it("keeps historical target plans read-only for design managers", async () => {
    await expect(service.upsertTarget({ designerId: 7, weekStart: "2020-01-06", targetImageCount: 6, reason: "历史修改" }, 9, "DESIGN_MANAGER")).rejects.toBeInstanceOf(ForbiddenException);
    expect(prisma.weeklyDesignerPlan.update).not.toHaveBeenCalled();
  });

  it("allows completion to exceed the target and returns null for a zero target", async () => {
    prisma.weeklyDesignerPlan.findMany.mockResolvedValue([{ id: 31, designerId: 7, targetImageCount: 0, designer }]);
    prisma.weeklyPlan.findUnique.mockResolvedValue({ id: 1, status: "ACTIVE", items: [planItem()] });
    prisma.imageTask.findMany.mockResolvedValue([{ id: 10, designerId: 7 }]);

    const zeroTarget = await service.getWeekOverview(9, "DESIGN_MANAGER", currentWeekStart());
    expect(zeroTarget.designers[0]).toEqual(expect.objectContaining({ targetImageCount: 0, completedCount: 1, completionRate: null, isOverTarget: false }));

    prisma.weeklyDesignerPlan.findMany.mockResolvedValue([{ id: 31, designerId: 7, targetImageCount: 1, designer }]);
    prisma.imageTask.findMany.mockResolvedValue([{ id: 10, designerId: 7 }, { id: 11, designerId: 7 }]);
    const overTarget = await service.getWeekOverview(9, "DESIGN_MANAGER", currentWeekStart());
    expect(overTarget.designers[0]).toEqual(expect.objectContaining({ completionRate: 200, isOverTarget: true }));
  });

  it("does not let designers configure targets or access the unassigned manager queue", async () => {
    await expect(service.upsertTarget({ designerId: 7, weekStart: currentWeekStart(), targetImageCount: 4, reason: "越权" }, 7, "DESIGNER")).rejects.toBeInstanceOf(ForbiddenException);
    await expect(service.getUnassigned(7, "DESIGNER")).rejects.toBeInstanceOf(ForbiddenException);
  });
});
