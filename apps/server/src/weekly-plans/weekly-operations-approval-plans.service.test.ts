import { ForbiddenException } from "@nestjs/common";
import { getShanghaiWeekRange } from "../common/shanghai-time";
import { WeeklyOperationsApprovalPlansService } from "./weekly-operations-approval-plans.service";

describe("WeeklyOperationsApprovalPlansService", () => {
  let prisma: any;
  let service: WeeklyOperationsApprovalPlansService;

  const currentWeek = () => getShanghaiWeekRange();
  const formatWeekStart = (range: { start: Date }) => new Intl.DateTimeFormat("en-CA", { timeZone: "Asia/Shanghai" }).format(range.start);
  const currentWeekStart = () => formatWeekStart(currentWeek());
  const nextWeekStart = () => formatWeekStart(getShanghaiWeekRange(new Date(currentWeek().start.getTime() + 7 * 24 * 60 * 60 * 1000)));

  beforeEach(() => {
    prisma = {
      weeklyOperationsApprovalPlan: {
        findUnique: jest.fn(),
        create: jest.fn().mockImplementation(({ data }: any) => ({ id: 41, ...data, createdAt: new Date(), updatedAt: new Date() })),
        update: jest.fn().mockImplementation(({ data }: any) => ({ id: 41, ...data, createdAt: new Date(), updatedAt: new Date() })),
      },
      weeklyOperationsApprovalPlanAdjustment: { create: jest.fn().mockResolvedValue({ id: 1 }), findMany: jest.fn().mockResolvedValue([]) },
      approvalRecord: { findMany: jest.fn().mockResolvedValue([]) },
      imageTask: { count: jest.fn().mockResolvedValue(0) },
      auditEvent: { create: jest.fn().mockResolvedValue({ id: 1 }) },
    };
    prisma.$transaction = jest.fn().mockImplementation(async (callback: any) => callback(prisma));
    service = new WeeklyOperationsApprovalPlansService(prisma);
  });

  it("creates a current-week zero target plan for an operations manager", async () => {
    prisma.weeklyOperationsApprovalPlan.findUnique.mockResolvedValue(null);

    const result = await service.initializeWeek(currentWeekStart(), 9, "OPERATION_MANAGER");

    expect(result).toEqual(expect.objectContaining({ created: true }));
    expect(prisma.weeklyOperationsApprovalPlan.create).toHaveBeenCalledWith({
      data: expect.objectContaining({ managerId: 9, targetImageCount: 0, createdById: 9 }),
    });
  });

  it("creates a next-week target without changing the current plan", async () => {
    prisma.weeklyOperationsApprovalPlan.findUnique.mockResolvedValue(null);

    await service.upsertTarget({ weekStart: nextWeekStart(), targetImageCount: 60, reason: "下周审批计划" }, 9, "OPERATION_MANAGER");

    expect(prisma.weeklyOperationsApprovalPlan.create).toHaveBeenCalledWith({
      data: expect.objectContaining({ managerId: 9, targetImageCount: 60, createdById: 9 }),
    });
  });

  it("records every current-week target adjustment", async () => {
    prisma.weeklyOperationsApprovalPlan.findUnique.mockResolvedValue({ id: 41, managerId: 9, targetImageCount: 60 });

    await service.upsertTarget({ weekStart: currentWeekStart(), targetImageCount: 70, reason: "周中增加放行目标" }, 9, "OPERATION_MANAGER");

    expect(prisma.weeklyOperationsApprovalPlanAdjustment.create).toHaveBeenCalledWith({
      data: expect.objectContaining({ planId: 41, previousTarget: 60, newTarget: 70, adjustedById: 9 }),
    });
  });

  it("keeps historical weeks read-only and blocks non-manager roles", async () => {
    await expect(service.upsertTarget({ weekStart: "2020-01-06", targetImageCount: 60, reason: "历史修改" }, 9, "OPERATION_MANAGER")).rejects.toBeInstanceOf(ForbiddenException);
    await expect(service.getWeekOverview(7, "OPERATION")).rejects.toBeInstanceOf(ForbiddenException);
  });

  it("counts each approved decree only once and sums its valid image tasks", async () => {
    prisma.weeklyOperationsApprovalPlan.findUnique.mockResolvedValue({
      id: 41,
      managerId: 9,
      targetImageCount: 6,
      createdAt: new Date(),
      updatedAt: new Date(),
      adjustments: [],
    });
    prisma.approvalRecord.findMany.mockResolvedValue([{ taskId: 11 }, { taskId: 11 }, { taskId: 12 }]);
    prisma.imageTask.count.mockResolvedValue(6);

    const result = await service.getWeekOverview(9, "OPERATION_MANAGER", currentWeekStart());

    expect(prisma.imageTask.count).toHaveBeenCalledWith(expect.objectContaining({ where: expect.objectContaining({ taskId: { in: [11, 12] }, deletedAt: null }) }));
    expect(result.summary).toEqual(expect.objectContaining({ approvedTaskCount: 2, approvedImageCount: 6, remainingTargetCount: 0, completionRate: 100 }));
  });

  it("does not divide by zero and permits completion over plan", async () => {
    prisma.weeklyOperationsApprovalPlan.findUnique.mockResolvedValue({ id: 41, managerId: 9, targetImageCount: 0, createdAt: new Date(), updatedAt: new Date(), adjustments: [] });
    prisma.approvalRecord.findMany.mockResolvedValue([{ taskId: 11 }]);
    prisma.imageTask.count.mockResolvedValue(6);

    const zeroTarget = await service.getWeekOverview(9, "OPERATION_MANAGER", currentWeekStart());
    expect(zeroTarget.summary).toEqual(expect.objectContaining({ completionRate: null, overTargetImageCount: 6 }));

    prisma.weeklyOperationsApprovalPlan.findUnique.mockResolvedValue({ id: 41, managerId: 9, targetImageCount: 4, createdAt: new Date(), updatedAt: new Date(), adjustments: [] });
    const overTarget = await service.getWeekOverview(9, "OPERATION_MANAGER", currentWeekStart());
    expect(overTarget.summary).toEqual(expect.objectContaining({ completionRate: 150, overTargetImageCount: 2 }));
  });

  it("returns only the current manager's adjustment history", async () => {
    await service.getAdjustments(9, "OPERATION_MANAGER", currentWeekStart());

    expect(prisma.weeklyOperationsApprovalPlanAdjustment.findMany).toHaveBeenCalledWith(expect.objectContaining({
      where: expect.objectContaining({ plan: expect.objectContaining({ managerId: 9 }) }),
    }));
  });
});
