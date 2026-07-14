import { WeeklyPlansService } from "./weekly-plans.service";

describe("WeeklyPlansService", () => {
  let service: WeeklyPlansService;
  let prisma: any;

  const draftPlan = (overrides: Record<string, any> = {}) => ({
    id: 1,
    weekStart: new Date("2026-07-12T16:00:00.000Z"),
    weekEnd: new Date("2026-07-19T16:00:00.000Z"),
    status: "DRAFT",
    createdById: 9,
    ...overrides,
  });
  const imageTask = (overrides: Record<string, any> = {}) => ({
    id: 10,
    designerId: 7,
    status: "NOT_STARTED",
    deletedAt: null,
    imageTitle: "主图",
    task: { id: 2, serialNumber: "天字第000002号法旨", deletedAt: null },
    ...overrides,
  });

  beforeEach(() => {
    prisma = {
      weeklyPlan: {
        findUnique: jest.fn(),
        findUniqueOrThrow: jest.fn(),
        create: jest.fn().mockImplementation(({ data }: any) => ({ id: 1, ...data })),
        update: jest.fn().mockImplementation(({ data }: any) => ({ ...draftPlan(), ...data })),
      },
      weeklyPlanItem: {
        findUnique: jest.fn(),
        findFirst: jest.fn(),
        findMany: jest.fn(),
        create: jest.fn().mockImplementation(({ data }: any) => ({ id: 101, ...data })),
        update: jest.fn().mockImplementation(({ data }: any) => ({ id: 101, ...data })),
        count: jest.fn().mockResolvedValue(1),
      },
      imageTask: {
        findUnique: jest.fn().mockResolvedValue(imageTask()),
        count: jest.fn().mockResolvedValue(0),
      },
      auditEvent: { create: jest.fn().mockResolvedValue({ id: 1 }) },
      user: { findMany: jest.fn().mockResolvedValue([]) },
    };
    prisma.$transaction = jest.fn().mockImplementation(async (callback: any) => callback(prisma));
    service = new WeeklyPlansService(prisma);
  });

  it("creates exactly one current-week DRAFT plan for a design manager", async () => {
    prisma.weeklyPlan.findUnique.mockResolvedValue(null);
    const result = await service.createCurrent(9, "DESIGN_MANAGER");
    expect(result.created).toBe(true);
    expect(prisma.weeklyPlan.create).toHaveBeenCalledWith({
      data: expect.objectContaining({ status: "DRAFT", createdById: 9, weekStart: expect.any(Date), weekEnd: expect.any(Date) }),
    });
    const data = prisma.weeklyPlan.create.mock.calls[0][0].data;
    expect(data.weekEnd.getTime() - data.weekStart.getTime()).toBe(7 * 24 * 60 * 60 * 1000);
  });

  it("returns the existing plan instead of creating another plan for the same week", async () => {
    prisma.weeklyPlan.findUnique.mockResolvedValue(draftPlan());
    const result = await service.createCurrent(9, "DESIGN_MANAGER");
    expect(result.created).toBe(false);
    expect(prisma.weeklyPlan.create).not.toHaveBeenCalled();
  });

  it("uses INITIAL_PLAN when adding an item to a DRAFT plan", async () => {
    prisma.weeklyPlan.findUnique.mockResolvedValue(draftPlan());
    prisma.weeklyPlanItem.findUnique.mockResolvedValue(null);
    await service.addItem(1, 10, 9, "DESIGN_MANAGER");
    expect(prisma.weeklyPlanItem.create).toHaveBeenCalledWith({
      data: expect.objectContaining({ weeklyPlanId: 1, imageTaskId: 10, designerId: 7, source: "INITIAL_PLAN", status: "PLANNED" }),
    });
  });

  it("uses MIDWEEK_ADD when adding an item to an ACTIVE plan", async () => {
    prisma.weeklyPlan.findUnique.mockResolvedValue(draftPlan({ status: "ACTIVE" }));
    prisma.weeklyPlanItem.findUnique.mockResolvedValue(null);
    await service.addItem(1, 10, 9, "DESIGN_MANAGER");
    expect(prisma.weeklyPlanItem.create.mock.calls[0][0].data.source).toBe("MIDWEEK_ADD");
  });

  it("rejects duplicate image tasks in the same weekly plan", async () => {
    prisma.weeklyPlan.findUnique.mockResolvedValue(draftPlan());
    prisma.weeklyPlanItem.findUnique.mockResolvedValue({ id: 101, status: "PLANNED" });
    await expect(service.addItem(1, 10, 9, "DESIGN_MANAGER")).rejects.toThrow("重复");
  });

  it("does not activate an empty DRAFT plan without explicit confirmation", async () => {
    prisma.weeklyPlan.findUnique.mockResolvedValue(draftPlan());
    prisma.weeklyPlanItem.count.mockResolvedValue(0);
    await expect(service.activate(1, false, 9, "DESIGN_MANAGER")).rejects.toThrow("空周计划");
    expect(prisma.weeklyPlan.update).not.toHaveBeenCalled();
  });

  it("allows only design managers and administrators to activate", async () => {
    await expect(service.activate(1, false, 7, "DESIGNER")).rejects.toThrow();
  });

  it("cancels a plan item without deleting the image task", async () => {
    prisma.weeklyPlan.findUnique.mockResolvedValue(draftPlan());
    prisma.weeklyPlanItem.findFirst.mockResolvedValue({ id: 101, weeklyPlanId: 1, imageTaskId: 10, status: "PLANNED" });
    await service.cancelItem(1, 101, "本周不处理", 9, "DESIGN_MANAGER");
    expect(prisma.weeklyPlanItem.update).toHaveBeenCalledWith({
      where: { id: 101 },
      data: expect.objectContaining({ status: "CANCELLED", cancelReason: "本周不处理", cancelledById: 9 }),
    });
    expect(prisma.imageTask.delete).toBeUndefined();
  });

  it("does not cancel a completed item", async () => {
    prisma.weeklyPlan.findUnique.mockResolvedValue(draftPlan());
    prisma.weeklyPlanItem.findFirst.mockResolvedValue({ id: 101, weeklyPlanId: 1, imageTaskId: 10, status: "COMPLETED" });
    await expect(service.cancelItem(1, 101, "错误", 9, "DESIGN_MANAGER")).rejects.toThrow("已完成");
  });

  it("restores the cancelled record instead of creating a duplicate", async () => {
    prisma.weeklyPlan.findUnique.mockResolvedValue(draftPlan());
    prisma.weeklyPlanItem.findFirst.mockResolvedValue({ id: 101, weeklyPlanId: 1, imageTaskId: 10, status: "CANCELLED" });
    await service.restoreItem(1, 101, "重新排入", 9, "DESIGN_MANAGER");
    expect(prisma.weeklyPlanItem.update).toHaveBeenCalledWith({
      where: { id: 101 },
      data: expect.objectContaining({ status: "PLANNED", cancelledAt: null, cancelledById: null }),
    });
    expect(prisma.weeklyPlanItem.create).not.toHaveBeenCalled();
  });

  it("updates the existing plan item during reassignment without adding a second item", async () => {
    prisma.weeklyPlan.findUnique.mockResolvedValue(draftPlan({ status: "ACTIVE" }));
    prisma.weeklyPlanItem.findUnique.mockResolvedValue({ id: 101, imageTaskId: 10, designerId: 5, status: "PLANNED" });
    const result = await service.syncAssignmentInTransaction(prisma, imageTask({ designerId: 5 }), 7, 9, new Date(), "REASSIGN");
    expect(result.state).toBe("REASSIGNED");
    expect(prisma.weeklyPlanItem.update).toHaveBeenCalledWith({ where: { id: 101 }, data: expect.objectContaining({ designerId: 7, reassignedAt: expect.any(Date) }) });
    expect(prisma.weeklyPlanItem.create).not.toHaveBeenCalled();
  });

  it("does not auto-add tasks when no current weekly plan exists", async () => {
    prisma.weeklyPlan.findUnique.mockResolvedValue(null);
    const result = await service.syncAssignmentInTransaction(prisma, imageTask(), 7, 9, new Date(), "INITIAL");
    expect(result).toEqual(expect.objectContaining({ state: "NO_PLAN" }));
    expect(prisma.weeklyPlanItem.create).not.toHaveBeenCalled();
  });

  it("marks only an ACTIVE planned item as completed after final review", async () => {
    prisma.weeklyPlan.findUnique.mockResolvedValue(draftPlan({ status: "ACTIVE" }));
    prisma.weeklyPlanItem.findUnique.mockResolvedValue({ id: 101, status: "PLANNED" });
    const approvedAt = new Date();
    const result = await service.completeApprovedImageTaskInTransaction(prisma, 10, 9, approvedAt);
    expect(result.state).toBe("COMPLETED");
    expect(prisma.weeklyPlanItem.update).toHaveBeenCalledWith({ where: { id: 101 }, data: { status: "COMPLETED", completedAt: approvedAt } });
  });

  it("does not modify CLOSED plan items after an image task is approved", async () => {
    prisma.weeklyPlan.findUnique.mockResolvedValue(draftPlan({ status: "CLOSED" }));
    const result = await service.completeApprovedImageTaskInTransaction(prisma, 10, 9, new Date());
    expect(result.state).toBe("NO_ACTIVE_PLAN");
    expect(prisma.weeklyPlanItem.update).not.toHaveBeenCalled();
  });

  it("reports planned completion separately from actual approvals in the week", async () => {
    prisma.weeklyPlan.findUnique.mockResolvedValue(draftPlan({ status: "ACTIVE" }));
    prisma.weeklyPlanItem.count
      .mockResolvedValueOnce(3)
      .mockResolvedValueOnce(1)
      .mockResolvedValueOnce(1)
      .mockResolvedValueOnce(5)
      .mockResolvedValueOnce(2)
      .mockResolvedValueOnce(3)
      .mockResolvedValueOnce(1);
    prisma.imageTask.count.mockResolvedValueOnce(7);

    const summary = await service.getSummary(1, 9, "DESIGN_MANAGER");

    expect(summary).toEqual(expect.objectContaining({
      activePlanCount: 5,
      completedCount: 2,
      remainingCount: 3,
      cancelledCount: 1,
      completionRate: 0.4,
      actualApprovedCount: 7,
    }));
    expect(prisma.imageTask.count).toHaveBeenCalledWith({
      where: expect.objectContaining({ approvedAt: { gte: draftPlan().weekStart, lt: draftPlan().weekEnd } }),
    });
  });

  it("does not write previous-week data when previewing carry-over candidates", async () => {
    prisma.weeklyPlan.findUnique.mockResolvedValue(draftPlan());
    const preview = await service.getCarryOverPreview(1, 9, "DESIGN_MANAGER");

    expect(preview).toEqual(expect.objectContaining({ candidates: [], excluded: [] }));
    expect(prisma.weeklyPlanItem.create).not.toHaveBeenCalled();
    expect(prisma.weeklyPlanItem.update).not.toHaveBeenCalled();
  });

  it("keeps operators out of weekly-plan data", async () => {
    await expect(service.getCurrent(3, "OPERATION")).rejects.toThrow();
  });
});
