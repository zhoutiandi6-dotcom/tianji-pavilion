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
});
