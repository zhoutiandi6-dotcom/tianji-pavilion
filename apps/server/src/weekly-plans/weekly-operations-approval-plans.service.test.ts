import { ConflictException, ForbiddenException } from "@nestjs/common";
import { getShanghaiWeekRange } from "../common/shanghai-time";
import { WeeklyOperationsApprovalPlansService } from "./weekly-operations-approval-plans.service";

describe("WeeklyOperationsApprovalPlansService", () => {
  let prisma: any;
  let service: WeeklyOperationsApprovalPlansService;
  const formatWeekStart = (range: { start: Date }) => new Intl.DateTimeFormat("en-CA", { timeZone: "Asia/Shanghai" }).format(range.start);
  const currentWeekStart = () => formatWeekStart(getShanghaiWeekRange());
  const nextWeekStart = () => formatWeekStart(getShanghaiWeekRange(new Date(getShanghaiWeekRange().start.getTime() + 7 * 86400000)));

  beforeEach(() => {
    prisma = {
      weeklyOperationsApprovalPlan: { findUnique: jest.fn(), create: jest.fn().mockImplementation(({ data }: any) => ({ id: 41, ...data, createdAt: new Date(), updatedAt: new Date() })) },
      weeklyOperationsApprovalPlanItem: { findMany: jest.fn().mockResolvedValue([]), findFirst: jest.fn().mockResolvedValue(null), findUnique: jest.fn(), count: jest.fn().mockResolvedValue(0), createMany: jest.fn().mockResolvedValue({ count: 2 }), create: jest.fn().mockResolvedValue({ id: 51 }), update: jest.fn().mockResolvedValue({ id: 51 }) },
      task: { findMany: jest.fn().mockResolvedValue([]) },
      imageTask: { count: jest.fn().mockResolvedValue(6) },
      auditEvent: { create: jest.fn().mockResolvedValue({ id: 1 }) },
    };
    prisma.$transaction = jest.fn().mockImplementation(async (callback: any) => callback(prisma));
    service = new WeeklyOperationsApprovalPlansService(prisma);
  });

  it("creates an empty current-week container without a manual target", async () => {
    prisma.weeklyOperationsApprovalPlan.findUnique.mockResolvedValue(null);
    const result = await service.initializeWeek(currentWeekStart(), 9, "OPERATION_MANAGER");
    expect(result.created).toBe(true);
    expect(prisma.weeklyOperationsApprovalPlan.create).toHaveBeenCalledWith({ data: expect.objectContaining({ managerId: 9, createdById: 9 }) });
    expect(prisma.weeklyOperationsApprovalPlan.create.mock.calls[0][0].data).not.toHaveProperty("targetImageCount");
  });

  it("adds two whole decrees and snapshots their six plus five active images", async () => {
    prisma.weeklyOperationsApprovalPlan.findUnique.mockResolvedValue(null);
    prisma.task.findMany.mockResolvedValue([{ id: 11 }, { id: 12 }]);
    prisma.imageTask.count.mockResolvedValueOnce(6).mockResolvedValueOnce(5);
    const result = await service.addDecrees({ weekStart: nextWeekStart(), decreeIds: [11, 12] }, 9, "OPERATION_MANAGER");
    expect(result).toEqual(expect.objectContaining({ addedDecreeCount: 2, addedImageCount: 11, sourceType: "INITIAL_PLAN" }));
    expect(prisma.weeklyOperationsApprovalPlanItem.createMany).toHaveBeenCalledWith({ data: expect.arrayContaining([expect.objectContaining({ decreeId: 11, plannedImageCountSnapshot: 6 }), expect.objectContaining({ decreeId: 12, plannedImageCountSnapshot: 5 })]) });
  });

  it("does not allow a decree to enter two active weekly plans", async () => {
    prisma.weeklyOperationsApprovalPlan.findUnique.mockResolvedValue({ id: 41 });
    prisma.weeklyOperationsApprovalPlanItem.findMany.mockImplementationOnce(() => []).mockImplementationOnce(() => [{ decreeId: 11, planId: 99 }]);
    prisma.task.findMany.mockResolvedValue([{ id: 11 }]);
    await expect(service.addDecrees({ weekStart: currentWeekStart(), decreeIds: [11] }, 9, "OPERATION_MANAGER")).rejects.toBeInstanceOf(ConflictException);
  });

  it("uses MIDWEEK_ADDITION for subsequent current-week additions", async () => {
    prisma.weeklyOperationsApprovalPlan.findUnique.mockResolvedValue({ id: 41 });
    prisma.weeklyOperationsApprovalPlanItem.count.mockResolvedValue(1);
    prisma.task.findMany.mockResolvedValue([{ id: 11 }]);
    prisma.imageTask.count.mockResolvedValue(6);
    await service.addDecrees({ weekStart: currentWeekStart(), decreeIds: [11] }, 9, "OPERATION_MANAGER");
    expect(prisma.weeklyOperationsApprovalPlanItem.createMany).toHaveBeenCalledWith({ data: [expect.objectContaining({ sourceType: "MIDWEEK_ADDITION" })] });
  });

  it("auto-adds an approved decree in the same transaction with AUTO_ADDITION", async () => {
    prisma.weeklyOperationsApprovalPlan.findUnique.mockResolvedValue({ id: 41 });
    prisma.imageTask.count.mockResolvedValue(6);
    const result = await service.ensureAutoAddedInTransaction(prisma, 11, 9, new Date());
    expect(result).toEqual(expect.objectContaining({ added: true, imageCount: 6 }));
    expect(prisma.weeklyOperationsApprovalPlanItem.create).toHaveBeenCalledWith({ data: expect.objectContaining({ decreeId: 11, sourceType: "AUTO_ADDITION", plannedImageCountSnapshot: 6 }) });
  });

  it("refreshes pending item snapshots and writes an audit event when effective image count changes", async () => {
    prisma.weeklyOperationsApprovalPlanItem.findMany.mockResolvedValue([{
      id: 51,
      planId: 41,
      plannedImageCountSnapshot: 3,
      decree: { deletedAt: null, approvalRecords: [] },
    }]);
    prisma.imageTask.count.mockResolvedValue(4);

    const result = await service.refreshPendingDecreeSnapshotInTransaction(prisma, 11, 9, "image_task_created");

    expect(result).toEqual({ updatedItemIds: [51], imageCount: 4 });
    expect(prisma.weeklyOperationsApprovalPlanItem.update).toHaveBeenCalledWith({ where: { id: 51 }, data: { plannedImageCountSnapshot: 4 } });
    expect(JSON.parse(prisma.auditEvent.create.mock.calls[0][0].data.metadata)).toEqual(expect.objectContaining({ previousImageCount: 3, newImageCount: 4, reason: "image_task_created" }));
  });

  it("keeps an approved decree snapshot frozen after later image changes", async () => {
    prisma.weeklyOperationsApprovalPlanItem.findMany.mockResolvedValue([{
      id: 51,
      planId: 41,
      plannedImageCountSnapshot: 3,
      decree: { deletedAt: null, approvalRecords: [{ id: 1 }] },
    }]);
    prisma.imageTask.count.mockResolvedValue(4);

    const result = await service.refreshPendingDecreeSnapshotInTransaction(prisma, 11, 9, "image_task_updated");

    expect(result).toEqual({ updatedItemIds: [], imageCount: 4 });
    expect(prisma.weeklyOperationsApprovalPlanItem.update).not.toHaveBeenCalled();
  });

  it("keeps historical weeks and non-manager roles read-only", async () => {
    await expect(service.addDecrees({ weekStart: "2020-01-06", decreeIds: [11] }, 9, "OPERATION_MANAGER")).rejects.toBeInstanceOf(ForbiddenException);
    await expect(service.getWeekOverview(7, "OPERATION")).rejects.toBeInstanceOf(ForbiddenException);
  });
});
