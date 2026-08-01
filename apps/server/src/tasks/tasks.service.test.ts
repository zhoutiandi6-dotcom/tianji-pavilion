import { TasksService } from "./tasks.service";

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
