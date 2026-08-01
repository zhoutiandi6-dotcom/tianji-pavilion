import { TasksService } from "./tasks.service";
import { TaskVisibilityService } from "../common/task-visibility.service";

describe("TasksService compatible product mapping", () => {
  const draftTask = {
    id: 1,
    serialNumber: "TEST-001",
    creatorId: 9,
    workflowStatus: "DRAFT",
    imageTasks: [],
  };

  it("maps a legacy productName update into the canonical compatibleProduct field", async () => {
    const prisma: any = {
      task: {
        findUnique: jest.fn().mockResolvedValue(draftTask),
        update: jest.fn().mockResolvedValue(draftTask),
      },
      $transaction: jest.fn().mockImplementation(async (callback: any) => callback(prisma)),
    };
    const log = { log: jest.fn().mockResolvedValue(undefined) } as any;
    const operationsApprovalPlans = { refreshPendingDecreeSnapshotInTransaction: jest.fn() } as any;
    const service = new TasksService(prisma, log, {} as any, {} as any, operationsApprovalPlans);

    await service.update(1, { productName: "Legacy compatible product" }, 9, "OPERATION");

    expect(prisma.task.update).toHaveBeenCalledWith({
      where: { id: 1 },
      data: expect.objectContaining({
        productName: "Legacy compatible product",
        compatibleProduct: "Legacy compatible product",
      }),
    });
  });

  it("allows an ordinary operator to change priority only on their own draft", () => {
    const service = new TasksService({} as any, {} as any, {} as any, {} as any, {} as any);
    expect((service as any).canBatchPriority({ creatorId: 9, workflowStatus: "DRAFT" }, "OPERATION", 9)).toBe(true);
    expect((service as any).canBatchPriority({ creatorId: 9, workflowStatus: "SUBMITTED" }, "OPERATION", 9)).toBe(false);
    expect((service as any).canBatchPriority({ creatorId: 10, workflowStatus: "DRAFT" }, "OPERATION", 9)).toBe(false);
  });

  it("keeps designer list image-status filters and image metrics scoped to the current designer", async () => {
    const prisma: any = {
      task: {
        findMany: jest.fn().mockResolvedValue([]),
        count: jest.fn().mockResolvedValue(0),
      },
      imageTask: { count: jest.fn().mockResolvedValue(0) },
    };
    const service = new TasksService(prisma, {} as any, {} as any, new TaskVisibilityService(), {} as any);

    await service.findAll(1, 20, "DESIGNER", 7, { scope: "design-tasks", imageStatus: "IN_PROGRESS" });

    expect(prisma.task.findMany).toHaveBeenCalledWith(expect.objectContaining({
      where: {
        AND: [
          new TaskVisibilityService().scopeWhere("design-tasks", "DESIGNER", 7),
          { imageTasks: { some: { designerId: 7, status: "IN_PROGRESS" } } },
        ],
      },
    }));
    expect(prisma.imageTask.count).toHaveBeenCalledWith({
      where: expect.objectContaining({
        designerId: 7,
        status: "IN_PROGRESS",
        task: {
          AND: [
            new TaskVisibilityService().scopeWhere("design-tasks", "DESIGNER", 7),
            { imageTasks: { some: { designerId: 7, status: "IN_PROGRESS" } } },
          ],
        },
      }),
    });
  });

  it("persists a selected requirement type without clearing unrelated draft fields", async () => {
    const prisma: any = {
      task: {
        findUnique: jest.fn().mockResolvedValue({
          ...draftTask,
          productCode: "SKU-001",
          compatibleProduct: "Existing product",
          requirementTypeId: null,
        }),
        update: jest.fn().mockResolvedValue(draftTask),
      },
      $transaction: jest.fn().mockImplementation(async (callback: any) => callback(prisma)),
    };
    const service = new TasksService(
      prisma,
      { log: jest.fn().mockResolvedValue(undefined) } as any,
      {} as any,
      {} as any,
      { refreshPendingDecreeSnapshotInTransaction: jest.fn() } as any,
    );

    await service.update(1, { requirementTypeId: 3 }, 9, "OPERATION");

    expect(prisma.task.update).toHaveBeenCalledWith({
      where: { id: 1 },
      data: expect.objectContaining({ requirementTypeId: 3 }),
    });
    expect(prisma.task.update.mock.calls[0][0].data).not.toHaveProperty("productCode");
    expect(prisma.task.update.mock.calls[0][0].data).not.toHaveProperty("compatibleProduct");
  });

  it("does not allow an unrelated operator to change a draft requirement type", async () => {
    const prisma: any = {
      task: { findUnique: jest.fn().mockResolvedValue(draftTask) },
    };
    const service = new TasksService(prisma, {} as any, {} as any, {} as any, {} as any);

    await expect(service.update(1, { requirementTypeId: 3 }, 10, "OPERATION")).rejects.toThrow("只能编辑自己的法旨");
  });

  it("applies a designer search filter to the image workload summary", async () => {
    const prisma: any = {
      task: {
        findMany: jest.fn().mockResolvedValue([]),
        count: jest.fn().mockResolvedValue(0),
      },
      imageTask: { count: jest.fn().mockResolvedValue(0) },
    };
    const service = new TasksService(prisma, {} as any, {} as any, new TaskVisibilityService(), {} as any);

    await service.findAll(1, 20, "DESIGNER", 7, { scope: "design-tasks", search: "OTHER-DESIGNER" });

    expect(prisma.imageTask.count).toHaveBeenCalledWith({
      where: expect.objectContaining({
        designerId: 7,
        task: expect.objectContaining({
          AND: expect.arrayContaining([
            expect.objectContaining({ OR: expect.any(Array) }),
            new TaskVisibilityService().scopeWhere("design-tasks", "DESIGNER", 7),
          ]),
        }),
      }),
    });
  });

  it("returns the latest design rejection reason, reviewer, and time for each visible image task", async () => {
    const rejectedAt = new Date("2026-08-01T02:45:00.000Z");
    const prisma: any = {
      task: {
        findFirst: jest.fn().mockResolvedValue({
          id: 10,
          creatorId: 2,
          workflowStatus: "IN_DESIGN",
          imageTasks: [{ id: 101, designerId: 7, status: "REVISION_REQUIRED", reviewRemark: "补充细节" }],
        }),
      },
      auditEvent: {
        findMany: jest.fn()
          .mockResolvedValueOnce([])
          .mockResolvedValueOnce([{
            resourceId: 101,
            action: "image_task.review_rejected",
            operatorId: 9,
            createdAt: rejectedAt,
            metadata: JSON.stringify({ remark: "补充细节" }),
          }]),
      },
      user: { findMany: jest.fn().mockResolvedValue([{ id: 9, username: "manager", displayName: "设计主管" }]) },
    };
    const service = new TasksService(prisma, {} as any, {} as any, {} as any, {} as any);

    const result = await service.findOne(10, "DESIGNER", 7) as any;

    expect(result.imageReviewRejections[101]).toEqual({
      remark: "补充细节",
      reviewer: { id: 9, username: "manager", displayName: "设计主管" },
      reviewedAt: rejectedAt,
    });
  });
});
