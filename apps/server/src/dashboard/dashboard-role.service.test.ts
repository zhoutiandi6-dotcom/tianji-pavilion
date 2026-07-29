import { DashboardRoleService } from "./dashboard-role.service";

describe("DashboardRoleService", () => {
  let prisma: any;
  let service: DashboardRoleService;

  beforeEach(() => {
    prisma = {
      imageTask: { count: jest.fn(), findMany: jest.fn() },
      task: { findMany: jest.fn() },
      approvalRecord: { findMany: jest.fn() },
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
