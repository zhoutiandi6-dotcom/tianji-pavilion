import { ImageTasksService } from "./image-tasks.service";

describe("ImageTasksService stage A audit writes", () => {
  let service: ImageTasksService;
  let prisma: any;
  let log: any;
  let eventBus: any;
  let workflowEngine: any;
  let weeklyPlans: any;
  let operationsApprovalPlans: any;

  const imageTask = (overrides: Record<string, any> = {}) => ({
    id: 1,
    taskId: 10,
    imageIndex: 1,
    imageTitle: "Main image",
    designerId: null,
    status: "PENDING_ASSIGNMENT",
    reviewRemark: null,
    completedAttachmentUrl: null,
    attachments: [],
    task: { id: 10, creatorId: 2, workflowStatus: "OPS_APPROVED" },
    ...overrides,
  });

  beforeEach(() => {
    prisma = {
      user: { findFirst: jest.fn().mockResolvedValue({ id: 7 }) },
      task: { findMany: jest.fn() },
      imageTask: {
        findUnique: jest.fn(),
        findMany: jest.fn(),
        update: jest.fn().mockImplementation(({ data }) => ({ ...imageTask(), ...data })),
      },
      auditEvent: { create: jest.fn().mockResolvedValue({ id: 100 }) },
    };
    prisma.$transaction = jest.fn().mockImplementation(async (callback: any) => callback(prisma));
    log = { log: jest.fn().mockResolvedValue(undefined) };
    eventBus = { publish: jest.fn().mockResolvedValue(undefined) };
    workflowEngine = { recalcTaskStatus: jest.fn().mockResolvedValue("DESIGN_ASSIGNED"), recalcTaskStatusInTransaction: jest.fn().mockResolvedValue("DESIGN_REVIEW") };
    weeklyPlans = {
      addAssignedTasksInTransaction: jest.fn().mockResolvedValue({ id: 1 }),
      completeApprovedImageTaskInTransaction: jest.fn().mockResolvedValue({ state: "COMPLETED" }),
    };
    operationsApprovalPlans = { refreshPendingDecreeSnapshotInTransaction: jest.fn().mockResolvedValue({ updatedItemIds: [] }) };
    service = new ImageTasksService(prisma, log, eventBus, workflowEngine, weeklyPlans, operationsApprovalPlans);
  });

  it("rejects a per-image assignment so a decree cannot be split between designers", async () => {
    prisma.imageTask.findUnique.mockResolvedValue(imageTask());

    await expect(service.update(1, { designerId: 7 } as any, 9, "DESIGN_MANAGER")).rejects.toThrow("whole-decree assignment");
    expect(prisma.imageTask.update).not.toHaveBeenCalled();
    expect(weeklyPlans.addAssignedTasksInTransaction).not.toHaveBeenCalled();
  });

  it("assigns every effective image task of a decree in the same transaction", async () => {
    prisma.task.findMany.mockResolvedValue([{ id: 10, workflowStatus: "OPS_APPROVED", imageTasks: [imageTask({ id: 1 }), imageTask({ id: 2, imageIndex: 2 })] }]);

    await service.batchAssignTasks({ taskIds: [10], designerId: 7, mode: "ASSIGN" }, 9, "DESIGN_MANAGER");

    expect(prisma.imageTask.update).toHaveBeenCalledTimes(2);
    expect(weeklyPlans.addAssignedTasksInTransaction).toHaveBeenCalledWith(
      prisma,
      expect.arrayContaining([expect.objectContaining({ id: 1 }), expect.objectContaining({ id: 2 })]),
      7,
      9,
      expect.any(Date),
      "INITIAL",
      undefined,
      undefined,
    );
    expect(workflowEngine.recalcTaskStatusInTransaction).toHaveBeenCalledWith(prisma, 10);
  });

  it("writes approvedAt and approvedById only on final approval", async () => {
    prisma.imageTask.findUnique.mockResolvedValue(imageTask({
      designerId: 7,
      status: "SUBMITTED_FOR_REVIEW",
      attachments: [{ category: "IMAGE_COMPLETED" }],
      task: { id: 10, creatorId: 2, workflowStatus: "DESIGN_REVIEW" },
    }));

    await service.update(1, { status: "APPROVED" } as any, 9, "DESIGN_MANAGER");

    expect(prisma.imageTask.update).toHaveBeenCalledWith({
      where: { id: 1 },
      data: expect.objectContaining({
        status: "APPROVED",
        approvedAt: expect.any(Date),
        approvedById: 9,
      }),
    });
    expect(weeklyPlans.completeApprovedImageTaskInTransaction).toHaveBeenCalledWith(
      prisma,
      1,
      9,
      expect.any(Date),
    );
  });

  it("keeps final approval fields null when review is returned", async () => {
    prisma.imageTask.findUnique.mockResolvedValue(imageTask({
      designerId: 7,
      status: "SUBMITTED_FOR_REVIEW",
      task: { id: 10, creatorId: 2, workflowStatus: "DESIGN_REVIEW" },
    }));

    await service.update(1, { status: "REVISION_REQUIRED", reviewRemark: "Revise" } as any, 9, "DESIGN_MANAGER");

    expect(prisma.imageTask.update).toHaveBeenCalledWith({
      where: { id: 1 },
      data: expect.objectContaining({
        status: "REVISION_REQUIRED",
        approvedAt: null,
        approvedById: null,
      }),
    });
    expect(weeklyPlans.completeApprovedImageTaskInTransaction).not.toHaveBeenCalled();
  });

  it("submits a designer task atomically into pending design review with submission audit fields", async () => {
    prisma.imageTask.findUnique.mockResolvedValue(imageTask({
      designerId: 7,
      status: "IN_PROGRESS",
      task: { id: 10, creatorId: 2, workflowStatus: "IN_DESIGN" },
    }));

    await service.update(1, { status: "SUBMITTED_FOR_REVIEW" } as any, 7, "DESIGNER");

    expect(prisma.imageTask.update).toHaveBeenCalledWith({ where: { id: 1 }, data: expect.objectContaining({ status: "SUBMITTED_FOR_REVIEW", reviewStatus: "PENDING", submittedAt: expect.any(Date), submittedById: 7 }) });
    expect(workflowEngine.recalcTaskStatusInTransaction).toHaveBeenCalledWith(prisma, 10);
    expect(prisma.auditEvent.create).toHaveBeenCalledWith(expect.objectContaining({ data: expect.objectContaining({ action: "design_review_submitted", operatorId: 7 }) }));
  });

  it("allows a returned task to resubmit without creating a second assignment", async () => {
    prisma.imageTask.findUnique.mockResolvedValue(imageTask({
      designerId: 7,
      status: "REVISION_REQUIRED",
      task: { id: 10, creatorId: 2, workflowStatus: "IN_DESIGN" },
    }));

    await service.update(1, { status: "SUBMITTED_FOR_REVIEW" } as any, 7, "DESIGNER");

    expect(prisma.imageTask.update).toHaveBeenCalledWith({ where: { id: 1 }, data: expect.objectContaining({ status: "SUBMITTED_FOR_REVIEW", submittedById: 7 }) });
    expect(weeklyPlans.addAssignedTasksInTransaction).not.toHaveBeenCalled();
  });

  it("rolls back the staged assignment when its audit event fails", async () => {
    const persisted = {
      designerId: null as number | null,
      assignedAt: null as Date | null,
      assignedById: null as number | null,
      status: "NOT_STARTED",
    };
    prisma.imageTask.update.mockImplementation(async ({ data }: any) => {
      Object.assign(persisted, data);
      return { ...imageTask(), ...data };
    });
    prisma.auditEvent.create.mockRejectedValue(new Error("audit failed"));
    prisma.$transaction.mockImplementation(async (callback: any) => {
      const before = { ...persisted };
      try {
        return await callback(prisma);
      } catch (error) {
        Object.assign(persisted, before);
        throw error;
      }
    });

    await expect((service as any).assignImageTasks([imageTask()], 7, 9, "ASSIGN")).rejects.toThrow("audit failed");
    expect(persisted).toEqual({
      designerId: null,
      assignedAt: null,
      assignedById: null,
      status: "NOT_STARTED",
    });
    expect(eventBus.publish).not.toHaveBeenCalled();
  });

  it("preserves role checks for assignment operations", async () => {
    prisma.imageTask.findUnique.mockResolvedValue(imageTask({ designerId: 5 }));
    await expect(service.update(1, { designerId: 7 } as any, 8, "DESIGNER")).rejects.toThrow();
    expect(prisma.imageTask.update).not.toHaveBeenCalled();
  });

  it("flags historical mixed-designer decrees instead of silently overwriting them", async () => {
    prisma.task.findMany.mockResolvedValue([{
      id: 10,
      workflowStatus: "DESIGN_ASSIGNED",
      imageTasks: [
        imageTask({ id: 1, designerId: 7, status: "NOT_STARTED" }),
        imageTask({ id: 2, designerId: 8, status: "NOT_STARTED" }),
      ],
    }]);

    await expect(service.batchAssignTasks({ taskIds: [10], designerId: 9, mode: "REASSIGN", reason: "Normalize owner" }, 3, "DESIGN_MANAGER"))
      .rejects.toThrow("multiple designers");
    expect(prisma.imageTask.update).not.toHaveBeenCalled();
  });
});
