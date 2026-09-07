import { ForbiddenException } from "@nestjs/common";
import { formatShanghaiDate, getShanghaiWeekRange } from "../common/shanghai-time";
import { TaskVisibilityService } from "../common/task-visibility.service";
import { WeeklyDesignerPlansService } from "./weekly-designer-plans.service";

describe("WeeklyDesignerPlansService", () => {
  let prisma: any;
  let service: WeeklyDesignerPlansService;

  const designer = { id: 7, username: "designer-a", displayName: "设计师甲" };
  const currentRange = () => getShanghaiWeekRange();
  const currentWeekStart = () => formatShanghaiDate(currentRange().start);
  const nextWeekStart = () => formatShanghaiDate(new Date(currentRange().start.getTime() + 7 * 24 * 60 * 60 * 1000));
  const planItem = (overrides: Record<string, any> = {}) => ({
    id: 1,
    imageTaskId: 10,
    designerId: designer.id,
    status: "PLANNED",
    plannedAt: new Date(),
    designer,
    imageTask: {
      id: 10,
      taskId: 3,
      imageTitle: "主图",
      designerId: designer.id,
      status: "NOT_STARTED",
      approvedAt: null,
      task: { id: 3, serialNumber: "TJ-3", productCode: "SKU-3", workflowStatus: "DESIGN_ASSIGNED", store: null, requirementType: null },
    },
    ...overrides,
  });

  beforeEach(() => {
    prisma = {
      weeklyPlan: {
        findUnique: jest.fn(),
        upsert: jest.fn().mockImplementation(({ create }: any) => ({ id: 1, ...create })),
      },
      weeklyPlanItem: { update: jest.fn().mockResolvedValue({ id: 1 }) },
      weeklyDesignerPlan: { findMany: jest.fn() },
      weeklyDesignerPlanAdjustment: { create: jest.fn() },
      auditEvent: { create: jest.fn().mockResolvedValue({ id: 1 }), findMany: jest.fn().mockResolvedValue([]) },
      user: { findMany: jest.fn().mockResolvedValue([designer]) },
      task: { findMany: jest.fn().mockResolvedValue([]) },
    };
    prisma.$transaction = jest.fn().mockImplementation(async (callback: any) => callback(prisma));
    service = new WeeklyDesignerPlansService(prisma, new TaskVisibilityService());
  });

  it("aggregates designer planning solely from weekly plan items and image tasks", async () => {
    const range = currentRange();
    prisma.weeklyPlan.findUnique.mockResolvedValue({
      id: 1,
      status: "ACTIVE",
      items: [
        planItem({ imageTask: { ...planItem().imageTask, status: "APPROVED", approvedAt: new Date(range.start.getTime() + 60_000) } }),
        planItem({ id: 2, imageTaskId: 11, imageTask: { ...planItem().imageTask, id: 11, status: "SUBMITTED_FOR_REVIEW" } }),
      ],
    });

    const result = await service.getWeekOverview(9, "DESIGN_MANAGER", currentWeekStart());

    expect(result.summary).toEqual(expect.objectContaining({ decreeCount: 1, plannedImageCount: 2, assignedCount: 2, completedCount: 1, pendingReviewCount: 1, remainingCount: 1, completionRate: 50 }));
    expect(result.designers[0]).toEqual(expect.objectContaining({ designerId: 7, plannedImageCount: 2, completedCount: 1 }));
    expect(prisma.weeklyDesignerPlan.findMany).not.toHaveBeenCalled();
  });

  it("keeps a legacy target value out of formal plan statistics", async () => {
    prisma.weeklyDesignerPlan.findMany.mockResolvedValue([{ designerId: 7, targetImageCount: 999 }]);
    prisma.weeklyPlan.findUnique.mockResolvedValue({ id: 1, status: "ACTIVE", items: [planItem()] });

    const result = await service.getWeekOverview(9, "DESIGN_MANAGER", currentWeekStart());

    expect(result.summary.plannedImageCount).toBe(1);
    expect(result.summary).not.toHaveProperty("targetImageCount");
    expect(prisma.weeklyDesignerPlan.findMany).not.toHaveBeenCalled();
  });

  it("initializes only a DRAFT weekly plan without creating legacy numeric targets", async () => {
    const result = await service.initializeWeek(currentWeekStart(), 9, "DESIGN_MANAGER");

    expect(result).toEqual(expect.objectContaining({ weekStart: currentWeekStart(), status: "DRAFT" }));
    expect(prisma.weeklyPlan.upsert).toHaveBeenCalledWith(expect.objectContaining({
      create: expect.objectContaining({ status: "DRAFT", createdById: 9 }),
    }));
    expect(prisma.weeklyDesignerPlan.findMany).not.toHaveBeenCalled();
    expect(prisma.weeklyDesignerPlanAdjustment.create).not.toHaveBeenCalled();
  });

  it("allows only current and next week configuration", async () => {
    prisma.weeklyPlan.findUnique.mockResolvedValue(null);
    const next = await service.getWeekOverview(9, "DESIGN_MANAGER", nextWeekStart());
    const farFuture = formatShanghaiDate(new Date(currentRange().start.getTime() + 14 * 24 * 60 * 60 * 1000));
    const later = await service.getWeekOverview(9, "DESIGN_MANAGER", farFuture);

    expect(next.canConfigure).toBe(true);
    expect(later.canConfigure).toBe(false);
  });

  it("keeps historical weeks read-only", async () => {
    await expect(service.initializeWeek("2020-01-06", 9, "DESIGN_MANAGER")).rejects.toBeInstanceOf(ForbiddenException);
  });

  it("rejects removal once a decree has started or completed", async () => {
    prisma.weeklyPlan.findUnique.mockResolvedValue({
      id: 1,
      items: [planItem({ imageTask: { status: "APPROVED", designerId: 7 } })],
    });

    await expect(service.removeDecreeFromPlan(3, currentWeekStart(), "已开始制作", 9, "DESIGN_MANAGER")).rejects.toBeInstanceOf(ForbiddenException);
    expect(prisma.weeklyPlanItem.update).not.toHaveBeenCalled();
  });

  it("shows only whole decrees whose effective image tasks are all pending assignment", async () => {
    prisma.task.findMany.mockResolvedValue([
      { id: 1, serialNumber: "TJ-1", store: null, requirementType: null, creator: designer, priority: "NORMAL", productCode: "SKU-1", taskType: null, imageTasks: [{ id: 1, status: "PENDING_ASSIGNMENT", designerId: null }, { id: 2, status: "PENDING_ASSIGNMENT", designerId: null }] },
      { id: 2, serialNumber: "TJ-2", store: null, requirementType: null, creator: designer, priority: "NORMAL", productCode: "SKU-2", taskType: null, imageTasks: [{ id: 3, status: "PENDING_ASSIGNMENT", designerId: null }, { id: 4, status: "IN_PROGRESS", designerId: 7 }] },
    ]);

    const result = await service.getUnassigned(9, "DESIGN_MANAGER");

    expect(result).toEqual(expect.objectContaining({ total: 1, imageCount: 2 }));
    expect(result.items[0]?.id).toBe(1);
  });
});
