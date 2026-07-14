import { ImageTasksService } from "./image-tasks.service";

describe("ImageTasksService stage A audit writes", () => {
  let service: ImageTasksService;
  let prisma: any;
  let log: any;
  let eventBus: any;
  let workflowEngine: any;

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
    workflowEngine = { recalcTaskStatus: jest.fn().mockResolvedValue("DESIGN_ASSIGNED") };
    service = new ImageTasksService(prisma, log, eventBus, workflowEngine);
  });

  it("writes assignedAt and assignedById for a single initial assignment", async () => {
    prisma.imageTask.findUnique.mockResolvedValue(imageTask());

    await service.update(1, { designerId: 7 } as any, 9, "DESIGN_MANAGER");

    expect(prisma.imageTask.update).toHaveBeenCalledWith({
      where: { id: 1 },
      data: expect.objectContaining({
        designerId: 7,
        assignedAt: expect.any(Date),
        assignedById: 9,
        status: "NOT_STARTED",
      }),
    });
    const metadata = JSON.parse(prisma.auditEvent.create.mock.calls[0][0].data.metadata);
    expect(metadata).toEqual(expect.objectContaining({
      imageTaskId: 1,
      previousDesignerId: null,
      newDesignerId: 7,
      assignedById: 9,
      assignmentType: "INITIAL",
    }));
  });

  it("writes assignment audit fields for every task in a batch", async () => {
    prisma.imageTask.findMany.mockResolvedValue([
      imageTask({ id: 1 }),
      imageTask({ id: 2, imageIndex: 2 }),
    ]);

    await service.batchAssign({ imageTaskIds: [1, 2], designerId: 7 } as any, 9, "DESIGN_MANAGER");

    expect(prisma.imageTask.update).toHaveBeenCalledTimes(2);
    for (const call of prisma.imageTask.update.mock.calls) {
      expect(call[0].data).toEqual(expect.objectContaining({
        designerId: 7,
        assignedAt: expect.any(Date),
        assignedById: 9,
      }));
    }
    expect(prisma.auditEvent.create).toHaveBeenCalledTimes(2);
  });

  it("records the previous designer and refreshes assignment fields on reassignment", async () => {
    prisma.imageTask.findUnique.mockResolvedValue(imageTask({
      designerId: 5,
      status: "NOT_STARTED",
      task: { id: 10, creatorId: 2, workflowStatus: "DESIGN_ASSIGNED" },
    }));

    await service.update(1, { designerId: 7 } as any, 9, "DESIGN_MANAGER");

    const metadata = JSON.parse(prisma.auditEvent.create.mock.calls[0][0].data.metadata);
    expect(metadata).toEqual(expect.objectContaining({
      previousDesignerId: 5,
      newDesignerId: 7,
      assignmentType: "REASSIGN",
    }));
    expect(prisma.imageTask.update.mock.calls[0][0].data).toEqual(expect.objectContaining({
      assignedAt: expect.any(Date),
      assignedById: 9,
    }));
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
  });

  it("rolls back the staged assignment when its audit event fails", async () => {
    const persisted = {
      designerId: null as number | null,
      assignedAt: null as Date | null,
      assignedById: null as number | null,
      status: "NOT_STARTED",
    };
    prisma.imageTask.findUnique.mockResolvedValue(imageTask());
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

    await expect(service.update(1, { designerId: 7 } as any, 9, "DESIGN_MANAGER")).rejects.toThrow("audit failed");
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
});
