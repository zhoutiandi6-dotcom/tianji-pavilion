import { ImageTasksService } from "./image-tasks.service";

describe("ImageTasksService stage A audit writes", () => {
  let service: ImageTasksService;
  let prisma: any;
  let log: any;
  let eventBus: any;
  let workflowEngine: any;
  let weeklyPlans: any;
  let operationsApprovalPlans: any;

  const imageTask = (overrides: Record<string, any> = {}) => {
    const task = {
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
    };
    const attachments = task.attachments.map((attachment: any, index: number) => ({
      ...attachment,
      id: attachment.id ?? 21 + index,
      uploadedAt: attachment.uploadedAt ?? new Date("2026-08-10T01:40:00.000Z"),
    }));
    const currentCompletedAttachment = attachments.find((attachment: any) => attachment.category === "IMAGE_COMPLETED");
    return {
      ...task,
      attachments,
      completedAttachmentUrl: task.completedAttachmentUrl ?? (currentCompletedAttachment ? `/api/attachments/${currentCompletedAttachment.id}/download` : null),
    };
  };

  beforeEach(() => {
    prisma = {
      user: {
        findFirst: jest.fn().mockResolvedValue({ id: 7 }),
        findMany: jest.fn().mockResolvedValue([]),
      },
      task: { findMany: jest.fn() },
      imageTask: {
        findUnique: jest.fn(),
        findMany: jest.fn(),
        update: jest.fn().mockImplementation(({ data }) => ({ ...imageTask(), ...data })),
        updateMany: jest.fn().mockResolvedValue({ count: 1 }),
      },
      auditEvent: {
        create: jest.fn().mockResolvedValue({ id: 100 }),
        findMany: jest.fn().mockResolvedValue([]),
        findFirst: jest.fn().mockResolvedValue(null),
      },
      attachment: { findFirst: jest.fn().mockResolvedValue({ id: 21 }) },
      operationLog: { findMany: jest.fn().mockResolvedValue([]) },
    };
    prisma.$transaction = jest.fn().mockImplementation(async (callback: any) => callback(prisma));
    log = { log: jest.fn().mockResolvedValue(undefined) };
    eventBus = { publish: jest.fn().mockResolvedValue(undefined) };
    workflowEngine = {
      recalcTaskStatus: jest.fn().mockResolvedValue("DESIGN_ASSIGNED"),
      recalcTaskStatusInTransaction: jest.fn().mockResolvedValue("DESIGN_REVIEW"),
      recalcTaskDesignStatusInTransaction: jest.fn().mockResolvedValue({
        previousStatus: "DESIGN_REVIEW",
        nextStatus: "DESIGN_REVIEW",
        enteredDesignApproved: false,
        serialNumber: "TJ-10",
      }),
    };
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

    expect(prisma.imageTask.updateMany).toHaveBeenCalledWith({
      where: { id: 1, status: "SUBMITTED_FOR_REVIEW", deletedAt: null },
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
      attachments: [{ category: "IMAGE_COMPLETED" }],
      task: { id: 10, creatorId: 2, workflowStatus: "DESIGN_REVIEW" },
    }));

    await service.update(1, { status: "REVISION_REQUIRED", reviewRemark: "Revise" } as any, 9, "DESIGN_MANAGER");

    expect(prisma.imageTask.updateMany).toHaveBeenCalledWith({
      where: { id: 1, status: "SUBMITTED_FOR_REVIEW", deletedAt: null },
      data: expect.objectContaining({
        status: "REVISION_REQUIRED",
        approvedAt: null,
        approvedById: null,
      }),
    });
    expect(weeklyPlans.completeApprovedImageTaskInTransaction).not.toHaveBeenCalled();
  });

  it.each(["IN_PROGRESS", "REVISION_REQUIRED", "APPROVED", "COMPLETED"])("rejects %s manager approval before writing review side effects", async (status) => {
    prisma.imageTask.findUnique.mockResolvedValue(imageTask({
      designerId: 7,
      status,
      attachments: [{ category: "IMAGE_COMPLETED" }],
      task: { id: 10, creatorId: 2, workflowStatus: "DESIGN_REVIEW" },
    }));

    await expect(service.update(1, { status: "APPROVED" } as any, 9, "DESIGN_MANAGER"))
      .rejects.toThrow("Only submitted image tasks can be reviewed");

    expect(prisma.imageTask.updateMany).not.toHaveBeenCalled();
    expect(weeklyPlans.completeApprovedImageTaskInTransaction).not.toHaveBeenCalled();
    expect(workflowEngine.recalcTaskStatusInTransaction).not.toHaveBeenCalled();
    expect(eventBus.publish).not.toHaveBeenCalled();
  });

  it("rejects a blank review remark before changing the task", async () => {
    prisma.imageTask.findUnique.mockResolvedValue(imageTask({
      designerId: 7,
      status: "SUBMITTED_FOR_REVIEW",
      task: { id: 10, creatorId: 2, workflowStatus: "DESIGN_REVIEW" },
    }));

    await expect(service.update(1, { status: "REVISION_REQUIRED", reviewRemark: "  " } as any, 9, "DESIGN_MANAGER"))
      .rejects.toThrow("请填写退回原因");

    expect(prisma.imageTask.updateMany).not.toHaveBeenCalled();
    expect(eventBus.publish).not.toHaveBeenCalled();
  });

  it.each(["DESIGNER", "OPERATION", "OPERATION_MANAGER"])("keeps %s forbidden from manager review", async (role) => {
    prisma.imageTask.findUnique.mockResolvedValue(imageTask({
      designerId: 7,
      status: "SUBMITTED_FOR_REVIEW",
      attachments: [{ category: "IMAGE_COMPLETED" }],
      task: { id: 10, creatorId: 2, workflowStatus: "DESIGN_REVIEW" },
    }));

    await expect(service.update(1, { status: "APPROVED" } as any, role === "DESIGNER" ? 7 : 2, role))
      .rejects.toThrow();
    expect(prisma.imageTask.updateMany).not.toHaveBeenCalled();
  });

  it.each(["DESIGN_MANAGER", "OWNER", "SUPER_ADMIN"])("allows %s to approve a submitted review", async (role) => {
    prisma.imageTask.findUnique.mockResolvedValue(imageTask({
      designerId: 7,
      status: "SUBMITTED_FOR_REVIEW",
      attachments: [{ category: "IMAGE_COMPLETED" }],
      task: { id: 10, creatorId: 2, workflowStatus: "DESIGN_REVIEW" },
    }));

    await expect(service.update(1, { status: "APPROVED" } as any, 9, role)).resolves.toBeDefined();
    expect(prisma.imageTask.updateMany).toHaveBeenCalledWith(expect.objectContaining({
      where: { id: 1, status: "SUBMITTED_FOR_REVIEW", deletedAt: null },
    }));
  });

  it("allows only one concurrent approve transition and its review side effects", async () => {
    prisma.imageTask.findUnique.mockResolvedValue(imageTask({
      designerId: 7,
      status: "SUBMITTED_FOR_REVIEW",
      attachments: [{ category: "IMAGE_COMPLETED" }],
      task: { id: 10, creatorId: 2, workflowStatus: "DESIGN_REVIEW" },
    }));
    let persistedStatus = "SUBMITTED_FOR_REVIEW";
    prisma.imageTask.updateMany.mockImplementation(({ where, data }: any) => {
      if (persistedStatus !== where.status) return { count: 0 };
      persistedStatus = data.status;
      return { count: 1 };
    });

    const results = await Promise.allSettled([
      service.update(1, { status: "APPROVED" } as any, 9, "DESIGN_MANAGER"),
      service.update(1, { status: "APPROVED" } as any, 9, "DESIGN_MANAGER"),
    ]);

    expect(results.filter((result) => result.status === "fulfilled")).toHaveLength(1);
    expect(results.filter((result) => result.status === "rejected")).toHaveLength(1);
    expect(persistedStatus).toBe("APPROVED");
    expect(weeklyPlans.completeApprovedImageTaskInTransaction).toHaveBeenCalledTimes(1);
    expect(workflowEngine.recalcTaskDesignStatusInTransaction).toHaveBeenCalledTimes(1);
    expect(log.log).toHaveBeenCalledTimes(1);
    expect(eventBus.publish).toHaveBeenCalledTimes(1);
    expect(eventBus.publish.mock.calls[0][1]).toMatchObject({ reviewedAttachmentId: 21 });
  });

  it("makes concurrent approve and reject mutually exclusive", async () => {
    prisma.imageTask.findUnique.mockResolvedValue(imageTask({
      designerId: 7,
      status: "SUBMITTED_FOR_REVIEW",
      attachments: [{ category: "IMAGE_COMPLETED" }],
      task: { id: 10, creatorId: 2, workflowStatus: "DESIGN_REVIEW" },
    }));
    let persistedStatus = "SUBMITTED_FOR_REVIEW";
    prisma.imageTask.updateMany.mockImplementation(({ where, data }: any) => {
      if (persistedStatus !== where.status) return { count: 0 };
      persistedStatus = data.status;
      return { count: 1 };
    });

    const results = await Promise.allSettled([
      service.update(1, { status: "APPROVED" } as any, 9, "DESIGN_MANAGER"),
      service.update(1, { status: "REVISION_REQUIRED", reviewRemark: "Please revise" } as any, 9, "DESIGN_MANAGER"),
    ]);

    expect(results.filter((result) => result.status === "fulfilled")).toHaveLength(1);
    expect(results.filter((result) => result.status === "rejected")).toHaveLength(1);
    expect(["APPROVED", "REVISION_REQUIRED"]).toContain(persistedStatus);
    expect(workflowEngine.recalcTaskDesignStatusInTransaction).toHaveBeenCalledTimes(1);
    expect(log.log).toHaveBeenCalledTimes(1);
    expect(eventBus.publish).toHaveBeenCalledTimes(1);
    expect(eventBus.publish.mock.calls[0][1]).toMatchObject({ reviewedAttachmentId: 21 });
  });

  it("allows only one concurrent reject transition and its review side effects", async () => {
    prisma.imageTask.findUnique.mockResolvedValue(imageTask({
      designerId: 7,
      status: "SUBMITTED_FOR_REVIEW",
      attachments: [{ category: "IMAGE_COMPLETED" }],
      task: { id: 10, creatorId: 2, workflowStatus: "DESIGN_REVIEW" },
    }));
    let persistedStatus = "SUBMITTED_FOR_REVIEW";
    prisma.imageTask.updateMany.mockImplementation(({ where, data }: any) => {
      if (persistedStatus !== where.status) return { count: 0 };
      persistedStatus = data.status;
      return { count: 1 };
    });

    const results = await Promise.allSettled([
      service.update(1, { status: "REVISION_REQUIRED", reviewRemark: "Please revise" } as any, 9, "DESIGN_MANAGER"),
      service.update(1, { status: "REVISION_REQUIRED", reviewRemark: "Please revise" } as any, 9, "DESIGN_MANAGER"),
    ]);

    expect(results.filter((result) => result.status === "fulfilled")).toHaveLength(1);
    expect(results.filter((result) => result.status === "rejected")).toHaveLength(1);
    expect(persistedStatus).toBe("REVISION_REQUIRED");
    expect(weeklyPlans.completeApprovedImageTaskInTransaction).not.toHaveBeenCalled();
    expect(workflowEngine.recalcTaskDesignStatusInTransaction).toHaveBeenCalledTimes(1);
    expect(log.log).toHaveBeenCalledTimes(1);
    expect(eventBus.publish).toHaveBeenCalledTimes(1);
    expect(eventBus.publish.mock.calls[0][1]).toMatchObject({ reviewedAttachmentId: 21 });
  });

  it("submits a designer task atomically into pending design review with submission audit fields", async () => {
    prisma.imageTask.findUnique.mockResolvedValue(imageTask({
      designerId: 7,
      status: "IN_PROGRESS",
      attachments: [{ category: "IMAGE_COMPLETED" }],
      task: { id: 10, creatorId: 2, workflowStatus: "IN_DESIGN" },
    }));

    await service.update(1, { status: "SUBMITTED_FOR_REVIEW" } as any, 7, "DESIGNER");

    expect(prisma.imageTask.updateMany).toHaveBeenCalledWith({
      where: { id: 1, designerId: 7, status: { in: ["IN_PROGRESS", "REVISION_REQUIRED"] }, deletedAt: null, completedAttachmentUrl: "/api/attachments/21/download" },
      data: expect.objectContaining({ status: "SUBMITTED_FOR_REVIEW", reviewStatus: "PENDING", submittedAt: expect.any(Date), submittedById: 7 }),
    });
    expect(workflowEngine.recalcTaskStatusInTransaction).toHaveBeenCalledWith(prisma, 10);
    expect(prisma.auditEvent.create).toHaveBeenCalledWith(expect.objectContaining({ data: expect.objectContaining({ action: "design_review_submitted", operatorId: 7 }) }));
    const submissionAudit = prisma.auditEvent.create.mock.calls[0][0].data;
    expect(JSON.parse(submissionAudit.metadata)).toMatchObject({ submittedAttachmentId: 21 });
    expect(eventBus.publish).toHaveBeenCalledWith(
      "image_task.submitted_for_review",
      expect.objectContaining({ submittedAttachmentId: 21 }),
    );
  });

  it("binds a manager decision to the version recorded by the latest review submission", async () => {
    prisma.imageTask.findUnique.mockResolvedValue(imageTask({
      designerId: 7,
      status: "SUBMITTED_FOR_REVIEW",
      completedAttachmentUrl: "/api/attachments/42/download",
      attachments: [
        { id: 41, category: "IMAGE_COMPLETED", uploadedAt: new Date("2026-08-10T01:00:00.000Z") },
        { id: 42, category: "IMAGE_COMPLETED", uploadedAt: new Date("2026-08-10T02:00:00.000Z") },
      ],
      task: { id: 10, creatorId: 2, workflowStatus: "DESIGN_REVIEW" },
    }));
    prisma.auditEvent.findFirst.mockResolvedValue({ metadata: JSON.stringify({ submittedAttachmentId: 41 }) });
    prisma.attachment.findFirst.mockResolvedValue({ id: 41 });
    workflowEngine.recalcTaskDesignStatusInTransaction.mockResolvedValue({
      previousStatus: "DESIGN_REVIEW",
      nextStatus: "DESIGN_APPROVED",
      enteredDesignApproved: true,
      serialNumber: "TJ-10",
    });

    await service.update(1, { status: "APPROVED" } as any, 9, "DESIGN_MANAGER");

    expect(prisma.attachment.findFirst).toHaveBeenCalledWith(expect.objectContaining({
      where: expect.objectContaining({ id: 41, imageTaskId: 1, category: "IMAGE_COMPLETED", deletedAt: null }),
    }));
    expect(eventBus.publish).toHaveBeenCalledWith(
      "image_task.review_approved",
      expect.objectContaining({ reviewedAttachmentId: 41 }),
    );
    expect(eventBus.publish).toHaveBeenCalledWith(
      "workflow.completed",
      expect.objectContaining({ taskId: 10, serialNumber: "TJ-10" }),
    );
  });

  it("binds every batch review event to its submitted artwork version", async () => {
    prisma.task.findMany.mockResolvedValue([{
      id: 10,
      workflowStatus: "DESIGN_REVIEW",
      imageTasks: [{
        id: 1,
        taskId: 10,
        designerId: 7,
        imageTitle: "Main image",
        status: "SUBMITTED_FOR_REVIEW",
        completedAttachmentUrl: "/api/attachments/51/download",
        reviewRemark: null,
        attachments: [{ id: 51, category: "IMAGE_COMPLETED", uploadedAt: new Date("2026-08-10T03:00:00.000Z") }],
      }],
    }]);
    prisma.imageTask.findUnique.mockResolvedValue({
      id: 1,
      completedAttachmentUrl: "/api/attachments/51/download",
      attachments: [{ id: 51, category: "IMAGE_COMPLETED", uploadedAt: new Date("2026-08-10T03:00:00.000Z") }],
    });
    prisma.auditEvent.findFirst.mockResolvedValue({ metadata: JSON.stringify({ submittedAttachmentId: 51 }) });
    prisma.attachment.findFirst.mockResolvedValue({ id: 51 });
    workflowEngine.recalcTaskDesignStatusInTransaction.mockResolvedValue({
      previousStatus: "DESIGN_REVIEW",
      nextStatus: "DESIGN_APPROVED",
      enteredDesignApproved: true,
      serialNumber: "TJ-10",
    });

    await service.batchReviewTasks({ taskIds: [10], action: "APPROVE" }, 9, "DESIGN_MANAGER");

    expect(eventBus.publish).toHaveBeenCalledWith(
      "image_task.review_approved",
      expect.objectContaining({ reviewedAttachmentId: 51 }),
    );
    expect(log.log).toHaveBeenCalledWith(expect.objectContaining({
      afterValue: expect.objectContaining({ reviewedAttachmentId: 51 }),
    }));
    expect(eventBus.publish).toHaveBeenCalledWith(
      "workflow.completed",
      expect.objectContaining({ taskId: 10, serialNumber: "TJ-10" }),
    );
  });

  it("allows a returned task to resubmit without creating a second assignment", async () => {
    prisma.imageTask.findUnique.mockResolvedValue(imageTask({
      designerId: 7,
      status: "REVISION_REQUIRED",
      attachments: [{ category: "IMAGE_COMPLETED" }],
      task: { id: 10, creatorId: 2, workflowStatus: "IN_DESIGN" },
    }));

    await service.update(1, { status: "SUBMITTED_FOR_REVIEW" } as any, 7, "DESIGNER");

    expect(prisma.imageTask.updateMany).toHaveBeenCalledWith({
      where: { id: 1, designerId: 7, status: { in: ["IN_PROGRESS", "REVISION_REQUIRED"] }, deletedAt: null, completedAttachmentUrl: "/api/attachments/21/download" },
      data: expect.objectContaining({ status: "SUBMITTED_FOR_REVIEW", submittedById: 7 }),
    });
    expect(weeklyPlans.addAssignedTasksInTransaction).not.toHaveBeenCalled();
  });

  it("rejects a NOT_STARTED designer task before it can be submitted for review", async () => {
    prisma.imageTask.findUnique.mockResolvedValue(imageTask({
      designerId: 7,
      status: "NOT_STARTED",
      attachments: [{ category: "IMAGE_COMPLETED" }],
      task: { id: 10, creatorId: 2, workflowStatus: "DESIGN_ASSIGNED" },
    }));

    await expect(service.update(1, { status: "SUBMITTED_FOR_REVIEW" } as any, 7, "DESIGNER"))
      .rejects.toThrow("Invalid image task update");
    expect(prisma.imageTask.updateMany).not.toHaveBeenCalled();
    expect(prisma.auditEvent.create).not.toHaveBeenCalled();
  });

  it("requires a completed attachment before a designer can submit for review", async () => {
    prisma.imageTask.findUnique.mockResolvedValue(imageTask({
      designerId: 7,
      status: "IN_PROGRESS",
      attachments: [],
      task: { id: 10, creatorId: 2, workflowStatus: "IN_DESIGN" },
    }));

    await expect(service.update(1, { status: "SUBMITTED_FOR_REVIEW" } as any, 7, "DESIGNER"))
      .rejects.toThrow("completed attachment");
    expect(prisma.imageTask.updateMany).not.toHaveBeenCalled();
  });

  it.each(["SUBMITTED_FOR_REVIEW", "APPROVED", "COMPLETED"])("rejects %s designer task submission", async (status) => {
    prisma.imageTask.findUnique.mockResolvedValue(imageTask({
      designerId: 7,
      status,
      attachments: [{ category: "IMAGE_COMPLETED" }],
      task: { id: 10, creatorId: 2, workflowStatus: status === "SUBMITTED_FOR_REVIEW" ? "DESIGN_REVIEW" : "DESIGN_APPROVED" },
    }));

    await expect(service.update(1, { status: "SUBMITTED_FOR_REVIEW" } as any, 7, "DESIGNER"))
      .rejects.toThrow("Invalid image task update");
    expect(prisma.imageTask.updateMany).not.toHaveBeenCalled();
  });

  it("rejects a designer update for another designer's image task", async () => {
    prisma.imageTask.findUnique.mockResolvedValue(imageTask({
      designerId: 8,
      status: "IN_PROGRESS",
      attachments: [{ category: "IMAGE_COMPLETED" }],
      task: { id: 10, creatorId: 2, workflowStatus: "IN_DESIGN" },
    }));

    await expect(service.update(1, { status: "SUBMITTED_FOR_REVIEW" } as any, 7, "DESIGNER"))
      .rejects.toThrow("Only the assigned designer");
  });

  it("starts a NOT_STARTED task exactly once", async () => {
    prisma.imageTask.findUnique.mockResolvedValue(imageTask({
      designerId: 7,
      status: "NOT_STARTED",
      task: { id: 10, creatorId: 2, workflowStatus: "DESIGN_ASSIGNED" },
    }));

    await service.update(1, { status: "IN_PROGRESS" } as any, 7, "DESIGNER");

    expect(prisma.imageTask.updateMany).toHaveBeenCalledWith({
      where: { id: 1, designerId: 7, status: { in: ["NOT_STARTED"] }, deletedAt: null },
      data: { status: "IN_PROGRESS" },
    });
    expect(workflowEngine.recalcTaskStatusInTransaction).toHaveBeenCalledWith(prisma, 10);
    expect(eventBus.publish).toHaveBeenCalledTimes(1);
  });

  it("rejects a repeated start without creating another workflow update or event", async () => {
    prisma.imageTask.findUnique.mockResolvedValue(imageTask({
      designerId: 7,
      status: "IN_PROGRESS",
      task: { id: 10, creatorId: 2, workflowStatus: "IN_DESIGN" },
    }));

    await expect(service.update(1, { status: "IN_PROGRESS" } as any, 7, "DESIGNER"))
      .rejects.toThrow("Invalid image task update");
    expect(prisma.imageTask.updateMany).not.toHaveBeenCalled();
    expect(workflowEngine.recalcTaskStatusInTransaction).not.toHaveBeenCalled();
    expect(eventBus.publish).not.toHaveBeenCalled();
  });

  it.each(["REVISION_REQUIRED", "SUBMITTED_FOR_REVIEW", "APPROVED", "COMPLETED"])("rejects %s start without writing audit, logs, or events", async (status) => {
    prisma.imageTask.findUnique.mockResolvedValue(imageTask({
      designerId: 7,
      status,
      reviewRemark: status === "REVISION_REQUIRED" ? "Please revise the copy" : null,
      task: { id: 10, creatorId: 2, workflowStatus: status === "SUBMITTED_FOR_REVIEW" ? "DESIGN_REVIEW" : "DESIGN_APPROVED" },
    }));

    await expect(service.update(1, { status: "IN_PROGRESS" } as any, 7, "DESIGNER"))
      .rejects.toThrow("Invalid image task update");

    expect(prisma.imageTask.updateMany).not.toHaveBeenCalled();
    expect(prisma.auditEvent.create).not.toHaveBeenCalled();
    expect(log.log).not.toHaveBeenCalled();
    expect(eventBus.publish).not.toHaveBeenCalled();
  });

  it("rejects start by a different designer", async () => {
    prisma.imageTask.findUnique.mockResolvedValue(imageTask({
      designerId: 8,
      status: "NOT_STARTED",
      task: { id: 10, creatorId: 2, workflowStatus: "DESIGN_ASSIGNED" },
    }));

    await expect(service.update(1, { status: "IN_PROGRESS" } as any, 7, "DESIGNER"))
      .rejects.toThrow("Only the assigned designer");
    expect(prisma.imageTask.updateMany).not.toHaveBeenCalled();
  });

  it("allows only one concurrent submit transition and writes one submission audit", async () => {
    prisma.imageTask.findUnique.mockResolvedValue(imageTask({
      designerId: 7,
      status: "IN_PROGRESS",
      attachments: [{ category: "IMAGE_COMPLETED" }],
      task: { id: 10, creatorId: 2, workflowStatus: "IN_DESIGN" },
    }));
    prisma.imageTask.updateMany
      .mockResolvedValueOnce({ count: 1 })
      .mockResolvedValueOnce({ count: 0 });

    const results = await Promise.allSettled([
      service.update(1, { status: "SUBMITTED_FOR_REVIEW" } as any, 7, "DESIGNER"),
      service.update(1, { status: "SUBMITTED_FOR_REVIEW" } as any, 7, "DESIGNER"),
    ]);

    expect(results.filter((result) => result.status === "fulfilled")).toHaveLength(1);
    expect(results.filter((result) => result.status === "rejected")).toHaveLength(1);
    expect(prisma.auditEvent.create).toHaveBeenCalledTimes(1);
    expect(eventBus.publish).toHaveBeenCalledTimes(1);
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

  const detailImageTask = (overrides: Record<string, any> = {}) => ({
    id: 1,
    taskId: 10,
    imageIndex: 1,
    imageTitle: "Main image",
    imageType: "MAIN",
    requirement: "Show product clearly",
    remark: "Keep the background clean",
    status: "IN_PROGRESS",
    createdAt: new Date("2026-08-10T01:00:00.000Z"),
    updatedAt: new Date("2026-08-10T02:00:00.000Z"),
    submittedAt: null,
    designerId: 7,
    designer: { id: 7, username: "designer", displayName: "Designer" },
    assignedBy: { id: 8, username: "manager", displayName: "Design Manager" },
    attachments: [
      {
        id: 20,
        fileName: "source.png",
        mimeType: "image/png",
        fileSize: 2048,
        category: "IMAGE_ORIGINAL",
        uploadedAt: new Date("2026-08-10T01:30:00.000Z"),
        storagePath: "attachments\\source.png",
      },
      {
        id: 21,
        fileName: "completed.png",
        mimeType: "image/png",
        fileSize: 4096,
        category: "IMAGE_COMPLETED",
        uploadedAt: new Date("2026-08-10T01:40:00.000Z"),
        storagePath: "attachments\\completed.png",
      },
    ],
    task: {
      id: 10,
      serialNumber: "天字第000010号法旨",
      productCode: "TEST-DETAIL-001",
      priority: "NORMAL",
      requesterName: "Operator Requester",
      creatorId: 2,
      workflowStatus: "DESIGN_ASSIGNED",
      creator: { id: 2, username: "operator", displayName: "Operator" },
      store: { id: 3, name: "Test Store" },
      requirementType: { id: 4, name: "Main image" },
      imageTasks: [{ designerId: 7 }],
    },
    ...overrides,
  });

  it("returns a minimal safe detail projection for the assigned designer", async () => {
    prisma.imageTask.findUnique.mockResolvedValue(detailImageTask());
    prisma.auditEvent.findMany.mockResolvedValue([
      {
        action: "design_review_submitted",
        operatorId: 7,
        metadata: JSON.stringify({ reason: "Ready for review", submittedAttachmentId: 101 }),
        createdAt: new Date("2026-08-10T03:00:00.000Z"),
      },
      {
        action: "review_reject",
        operatorId: 7,
        metadata: JSON.stringify({ reviewerId: 8, remark: "Improve the logo", reviewedAttachmentId: 101 }),
        createdAt: new Date("2026-08-10T04:00:00.000Z"),
      },
      {
        action: "design_review_resubmitted",
        operatorId: 7,
        metadata: JSON.stringify({ reason: "Updated artwork", submittedAttachmentId: 102 }),
        createdAt: new Date("2026-08-10T05:00:00.000Z"),
      },
      {
        action: "review_approve",
        operatorId: 8,
        metadata: JSON.stringify({ reviewedAttachmentId: 102 }),
        createdAt: new Date("2026-08-10T06:00:00.000Z"),
      },
    ]);
    prisma.user.findMany.mockResolvedValue([
      { id: 7, username: "designer", displayName: "Designer" },
      { id: 8, username: "manager", displayName: "Design Manager" },
    ]);

    const result = await service.findOne(1, 7, "DESIGNER");

    expect(result).toMatchObject({
      id: 1,
      name: "Main image",
      decree: { id: 10, serialNumber: "天字第000010号法旨", productCode: "TEST-DETAIL-001" },
      people: {
        operator: { id: 2, displayName: "Operator" },
        designer: { id: 7, displayName: "Designer" },
        assignedBy: { id: 8, displayName: "Design Manager" },
      },
      sourceAttachments: [{ id: 20, fileName: "source.png", category: "IMAGE_ORIGINAL" }],
      completedAttachments: [{ id: 21, fileName: "completed.png", category: "IMAGE_COMPLETED" }],
      reviewHistory: expect.arrayContaining([
        expect.objectContaining({ action: "design_review_submitted", reason: "Ready for review" }),
        expect.objectContaining({ action: "review_reject", reason: "Improve the logo", reviewedAttachmentId: 101 }),
        expect.objectContaining({ action: "design_review_resubmitted", reason: "Updated artwork", submittedAttachmentId: 102 }),
        expect.objectContaining({ action: "review_approve", reviewedAttachmentId: 102 }),
      ]),
    });
    expect(result.reviewHistory.map((item) => item.action)).toEqual([
      "design_review_submitted",
      "review_reject",
      "design_review_resubmitted",
      "review_approve",
    ]);
    expect(result.reviewHistory.map((item) => [item.submittedAttachmentId, item.reviewedAttachmentId])).toEqual([
      [101, null],
      [null, 101],
      [102, null],
      [null, 102],
    ]);
    expect(result.reviewHistory.find((item) => item.action === "review_reject")?.operator).toEqual({
      id: 8,
      displayName: "Design Manager",
    });
    expect(JSON.stringify(result)).not.toMatch(/storagePath|password|token|cookie|email/i);
    expect(prisma.auditEvent.findMany).toHaveBeenCalledWith(expect.objectContaining({
      where: expect.objectContaining({ resourceType: "image_task", resourceId: 1 }),
    }));
    expect(prisma.operationLog.findMany).not.toHaveBeenCalled();
    expect(prisma.workflowHistory).toBeUndefined();
  });

  it.each([
    [2, "OPERATION"],
    [9, "OPERATION_MANAGER"],
    [8, "DESIGN_MANAGER"],
    [99, "OWNER"],
  ])("keeps the existing visibility scope for a legal detail reader (%s, %s)", async (userId, role) => {
    prisma.imageTask.findUnique.mockResolvedValue(detailImageTask());

    await expect(service.findOne(1, userId, role)).resolves.toMatchObject({ id: 1 });
  });

  it("rejects a different designer before returning any detail data", async () => {
    prisma.imageTask.findUnique.mockResolvedValue(detailImageTask());

    await expect(service.findOne(1, 6, "DESIGNER")).rejects.toThrow("No permission to view image task");
    expect(prisma.auditEvent.findMany).not.toHaveBeenCalled();
    expect(prisma.operationLog.findMany).not.toHaveBeenCalled();
  });

  it("returns not found for a missing image task", async () => {
    prisma.imageTask.findUnique.mockResolvedValue(null);

    await expect(service.findOne(404, 99, "OWNER")).rejects.toThrow("Image task not found");
  });
});
