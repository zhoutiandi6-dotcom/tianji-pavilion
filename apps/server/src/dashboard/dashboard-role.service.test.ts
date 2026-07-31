import { DashboardRoleService } from "./dashboard-role.service";

describe("DashboardRoleService", () => {
  let prisma: any;
  let service: DashboardRoleService;

  beforeEach(() => {
    prisma = {
      imageTask: { count: jest.fn(), findMany: jest.fn() },
      task: { findMany: jest.fn() },
      approvalRecord: { findMany: jest.fn() },
      weeklyPlanItem: { count: jest.fn() },
      auditEvent: { findMany: jest.fn() },
      attachment: { findMany: jest.fn() },
    };
    const visibility = {
      visibleWhere: jest.fn().mockReturnValue({ deletedAt: null }),
      scopeWhere: jest.fn().mockReturnValue({ deletedAt: null }),
    };
    const weeklyDesignerPlans = { getWeekOverview: jest.fn() };
    const weeklyOperationsPlans = { getWeekOverview: jest.fn() };
    service = new DashboardRoleService(prisma, visibility as any, weeklyDesignerPlans as any, weeklyOperationsPlans as any);
  });

  it("uses ImageTask.createdAt and approvedAt database queries for design manager additions and trend", async () => {
    prisma.imageTask.count.mockResolvedValueOnce(2).mockResolvedValueOnce(9);
    prisma.imageTask.findMany.mockResolvedValue([{ approvedAt: new Date() }]);
    prisma.task.findMany.mockResolvedValueOnce([]).mockResolvedValueOnce([]);
    const weeklyPlans = (service as any).weeklyDesignerPlans;
    weeklyPlans.getWeekOverview.mockResolvedValue({ plan: { id: 1 }, summary: { assignedCount: 0 } });

    const result = await service.get("DESIGN_MANAGER", 9) as any;

    expect(result.source).toBe("database");
    expect(result.metrics).toEqual({ todayNewImageCount: 2, weekNewImageCount: 9 });
    expect(result.week).toEqual(expect.objectContaining({ weekStart: expect.stringMatching(/^\d{4}-\d{2}-\d{2}$/), displayWeekEnd: expect.stringMatching(/^\d{4}-\d{2}-\d{2}$/), nextWeekStart: expect.stringMatching(/^\d{4}-\d{2}-\d{2}$/) }));
    expect(prisma.imageTask.count).toHaveBeenNthCalledWith(1, expect.objectContaining({ where: expect.objectContaining({ createdAt: expect.any(Object) }) }));
    expect(prisma.imageTask.findMany).toHaveBeenCalledWith(expect.objectContaining({ where: expect.objectContaining({ approvedAt: expect.any(Object) }) }));
  });

  it("aggregates operations manager queue images, plan, quality and exceptions from database records", async () => {
    const submittedAt = new Date();
    prisma.task.findMany
      .mockResolvedValueOnce([{ id: 1, serialNumber: "FZ-1", store: { name: "店铺" }, creator: { username: "operator" }, requesterName: null, productCode: "SKU-1", createdAt: submittedAt, submittedAt, updatedAt: submittedAt, imageTasks: [{ id: 1 }, { id: 2 }, { id: 3 }], submissionRecords: [{ submittedAt, submissionType: "INITIAL" }] }])
      .mockResolvedValueOnce([{ id: 2, workflowStatus: "SUBMITTED", creator: { id: 7, username: "operator" }, imageTasks: [{ id: 4 }, { id: 5 }], approvalRecords: [] }])
      .mockResolvedValueOnce([{ id: 3, serialNumber: "FZ-3", workflowStatus: "OPS_REJECTED", creator: { username: "operator" }, requesterName: null, imageTasks: [{ id: 6 }], approvalRecords: [{ comment: "缺少参考图" }], submissionRecords: [] }]);
    prisma.approvalRecord.findMany.mockResolvedValue([{ createdAt: submittedAt, task: { imageTasks: [{ id: 1 }, { id: 2 }] } }]);
    const weeklyPlans = (service as any).weeklyOperationsPlans;
    weeklyPlans.getWeekOverview.mockResolvedValue({ plan: { id: 2 }, summary: { plannedImageCount: 3 } });

    const result = await service.get("OPERATION_MANAGER", 3) as any;

    expect(result.queue.summary.pendingImageCount).toBe(3);
    expect(result.week.weekStart).toMatch(/^\d{4}-\d{2}-\d{2}$/);
    expect(result.week.weekStart).not.toContain("T");
    expect(result.queue.summary.todayNewImageCount).toBe(3);
    expect(result.trend.current.reduce((sum: number, value: number) => sum + value, 0)).toBe(2);
    expect(result.quality[0]).toEqual(expect.objectContaining({ submitted: 2, pending: 2 }));
    expect(result.exceptions[0]).toEqual(expect.objectContaining({ summary: "缺少参考图" }));
  });
});

describe("DashboardRoleService designer aggregation", () => {
  const createService = () => {
    const prisma: any = {
      imageTask: { count: jest.fn(), findMany: jest.fn() },
      weeklyPlanItem: { count: jest.fn() },
      auditEvent: { findMany: jest.fn() },
      attachment: { findMany: jest.fn() },
    };
    const visibility = { visibleWhere: jest.fn(), scopeWhere: jest.fn() };
    const weeklyDesignerPlans = { getWeekOverview: jest.fn() };
    const weeklyOperationsPlans = { getWeekOverview: jest.fn() };
    return { prisma, service: new DashboardRoleService(prisma, visibility as any, weeklyDesignerPlans as any, weeklyOperationsPlans as any) };
  };

  it("keeps designer data private and computes task counts, priorities, rejection reason and activities", async () => {
    const { prisma, service } = createService();
    const now = new Date("2026-07-30T04:00:00.000Z");
    const rejectedAt = new Date("2026-07-29T04:00:00.000Z");
    const tasks = [
      { id: 11, taskId: 101, imageIndex: 1, imageTitle: "主图", status: "REVISION_REQUIRED", reviewRemark: "旧备注", updatedAt: now, task: { serialNumber: "FZ-101", priority: "NORMAL", store: { name: "店铺 A" } } },
      { id: 12, taskId: 101, imageIndex: 2, imageTitle: "细节图", status: "IN_PROGRESS", updatedAt: new Date("2026-07-28T04:00:00.000Z"), task: { serialNumber: "FZ-101", priority: "NORMAL", store: { name: "店铺 A" } } },
      { id: 13, taskId: 102, imageIndex: 1, imageTitle: "场景图", status: "NOT_STARTED", updatedAt: new Date("2026-07-27T04:00:00.000Z"), task: { serialNumber: "FZ-102", priority: "NORMAL", store: { name: "店铺 B" } } },
      { id: 14, taskId: 103, imageIndex: 1, imageTitle: "待审核图", status: "SUBMITTED_FOR_REVIEW", updatedAt: now, task: { serialNumber: "FZ-103", priority: "NORMAL", store: { name: "店铺 C" } } },
    ];
    prisma.imageTask.findMany.mockResolvedValueOnce(tasks).mockResolvedValueOnce(tasks);
    prisma.imageTask.count.mockResolvedValue(2);
    prisma.weeklyPlanItem.count.mockResolvedValue(4);
    prisma.auditEvent.findMany.mockResolvedValue([
      { id: 1, resourceId: 11, action: "review_reject", createdAt: rejectedAt, metadata: JSON.stringify({ designerId: 8, remark: "请补充细节" }) },
      { id: 2, resourceId: 99, action: "review_approve", createdAt: now, metadata: JSON.stringify({ designerId: 9 }) },
    ]);
    prisma.attachment.findMany.mockResolvedValue([{ id: 7, imageTaskId: 12, uploadedAt: now }]);

    const result = (await service.get("DESIGNER", 8)) as any;

    expect(result.designer.summary).toEqual(expect.objectContaining({
      pendingTotal: 3, decreeCount: 3, notStartedCount: 1, inProgressCount: 1,
      revisionRequiredCount: 1, submittedForReviewCount: 1, approvedThisWeekCount: 2,
      plannedImageCount: 4, completionRate: 50,
    }));
    expect(result.designer.priorityTasks.map((item: any) => item.status)).toEqual(["REVISION_REQUIRED", "IN_PROGRESS", "NOT_STARTED"]);
    expect(result.designer.priorityTasks[0]).toEqual(expect.objectContaining({ latestRejectionReason: "请补充细节", latestRejectionAt: rejectedAt.toISOString() }));
    expect(result.designer.recentActivities).toHaveLength(2);
    expect(result.designer.recentActivities.every((item: any) => item.imageTaskId !== 99)).toBe(true);
  });

  it("returns null completion rate when no active weekly-plan items exist", async () => {
    const { prisma, service } = createService();
    prisma.imageTask.findMany.mockResolvedValueOnce([]).mockResolvedValueOnce([]);
    prisma.imageTask.count.mockResolvedValue(0);
    prisma.weeklyPlanItem.count.mockResolvedValue(0);
    const result = (await service.get("DESIGNER", 8)) as any;
    expect(result.designer.summary.completionRate).toBeNull();
    expect(result.designer.summary.plannedImageCount).toBe(0);
  });
});
