import { Test, TestingModule } from "@nestjs/testing";
import { WorkflowEngine } from "../index";
import { PrismaService } from "../../../common/prisma.service";
import { EventBus } from "../../../event-bus/event-bus";
import { OperationLogService } from "../../../operation-log/operation-log.service";

describe("WorkflowEngine", () => {
  let engine: WorkflowEngine;
  let prisma: any;
  let eventBus: any;

  const mockTask = {
    id: 1,
    workflowStatus: "DRAFT",
    serialNumber: "天字第000001号法旨",
    creatorId: 1,
    storeId: 1,
    requesterName: "运营人员",
    compatibleProduct: "测试产品",
    productCode: "SKU-001",
    requirementTypeId: 1,
    imageCount: 1,
    deletedAt: null,
    attachments: [],
    imageTasks: [{
      id: 11,
      imageIndex: 1,
      imageTitle: "主图",
      imageType: "主图",
      requirement: "替换产品主体",
      originalImageUrl: "https://example.com/original.jpg",
      referenceImageUrl: null,
      status: "WAITING_OPS_APPROVAL",
      deletedAt: null,
      attachments: [],
    }],
  };

  beforeEach(async () => {
    prisma = {
      task: {
        findUnique: jest.fn().mockResolvedValue(mockTask),
        update: jest.fn().mockImplementation(({ data }) => ({ ...mockTask, ...data })),
        updateMany: jest.fn().mockResolvedValue({ count: 1 }),
      },
      approvalRecord: {
        create: jest.fn().mockResolvedValue({ id: 1 }),
      },
      taskSubmissionRecord: {
        aggregate: jest.fn().mockResolvedValue({ _max: { submissionSequence: null } }),
        create: jest.fn().mockResolvedValue({ id: 1 }),
        findFirst: jest.fn().mockResolvedValue({ id: 1, submissionSequence: 1 }),
        update: jest.fn().mockResolvedValue({ id: 1 }),
      },
      imageTask: {
        findMany: jest.fn().mockResolvedValue([]),
        count: jest.fn().mockResolvedValue(1),
        updateMany: jest.fn().mockResolvedValue({ count: 1 }),
      },
      auditEvent: { create: jest.fn().mockResolvedValue({ id: 1 }) },
    };
    prisma.$transaction = jest.fn().mockImplementation(async (callback) => callback(prisma));

    eventBus = {
      publish: jest.fn().mockResolvedValue(undefined),
    };

    const module: TestingModule = await Test.createTestingModule({
      providers: [
        WorkflowEngine,
        { provide: PrismaService, useValue: prisma },
        { provide: EventBus, useValue: eventBus },
        { provide: OperationLogService, useValue: { log: jest.fn() } },
      ],
    }).compile();

    engine = module.get<WorkflowEngine>(WorkflowEngine);
  });

  describe("submit", () => {
    it("allows OPERATION to submit", async () => {
      await engine.submit(1, 1, "OPERATION");
      expect(prisma.task.updateMany).toHaveBeenCalled();
      expect(prisma.taskSubmissionRecord.create).toHaveBeenCalledWith({
        data: expect.objectContaining({
          taskId: 1,
          submitterId: 1,
          submissionType: "INITIAL",
          submissionSequence: 1,
          result: "PENDING",
        }),
      });
      expect(eventBus.publish).toHaveBeenCalledWith("workflow.submitted", expect.any(Object));
    });

    it("creates RESUBMIT records with the next sequence", async () => {
      prisma.task.findUnique.mockResolvedValue({ ...mockTask, workflowStatus: "OPS_REJECTED" });
      prisma.taskSubmissionRecord.aggregate.mockResolvedValue({ _max: { submissionSequence: 2 } });
      await engine.submit(1, 1, "OPERATION");
      expect(prisma.taskSubmissionRecord.create).toHaveBeenCalledWith({
        data: expect.objectContaining({ submissionType: "RESUBMIT", submissionSequence: 3 }),
      });
    });

    it("increments submissionSequence across repeated submissions", async () => {
      prisma.task.findUnique
        .mockResolvedValueOnce({ ...mockTask, workflowStatus: "DRAFT" })
        .mockResolvedValueOnce({ ...mockTask, workflowStatus: "OPS_REJECTED" });
      prisma.taskSubmissionRecord.aggregate
        .mockResolvedValueOnce({ _max: { submissionSequence: null } })
        .mockResolvedValueOnce({ _max: { submissionSequence: 1 } });

      await engine.submit(1, 1, "OPERATION");
      await engine.submit(1, 1, "OPERATION");

      expect(prisma.taskSubmissionRecord.create.mock.calls[0][0].data.submissionSequence).toBe(1);
      expect(prisma.taskSubmissionRecord.create.mock.calls[1][0].data.submissionSequence).toBe(2);
    });

    it("does not update task state when submission audit creation fails", async () => {
      prisma.taskSubmissionRecord.create.mockRejectedValue(new Error("audit write failed"));
      await expect(engine.submit(1, 1, "OPERATION")).rejects.toThrow("audit write failed");
      expect(eventBus.publish).not.toHaveBeenCalled();
      expect(eventBus.publish).not.toHaveBeenCalled();
    });

    it("rejects DESIGNER from submitting", async () => {
      await expect(engine.submit(1, 1, "DESIGNER")).rejects.toThrow();
    });

    it("rejects submit if user is not the task owner (OPERATOR)", async () => {
      await expect(engine.submit(1, 2, "OPERATION")).rejects.toThrow();
    });
  });

  describe("approve", () => {
    it("allows OPERATION_MANAGER to approve", async () => {
      prisma.task.findUnique.mockResolvedValue({ ...mockTask, workflowStatus: "SUBMITTED" });
      await engine.approve(1, 1, "OPERATION_MANAGER");
      expect(prisma.approvalRecord.create).toHaveBeenCalled();
      expect(prisma.taskSubmissionRecord.update).toHaveBeenCalledWith({
        where: { id: 1 },
        data: expect.objectContaining({
          processedById: 1,
          result: "APPROVED",
          approvalRecordId: 1,
        }),
      });
      expect(prisma.task.updateMany).toHaveBeenCalled();
      expect(eventBus.publish).toHaveBeenCalledWith("workflow.approved", expect.any(Object));
    });

    it("rejects OPERATION from approving", async () => {
      await expect(engine.approve(1, 1, "OPERATION")).rejects.toThrow();
    });

    it("rejects DESIGNER from approving", async () => {
      await expect(engine.approve(1, 1, "DESIGNER")).rejects.toThrow();
    });

    it("rejects a duplicate approval when another supervisor has already processed the task", async () => {
      prisma.task.findUnique.mockResolvedValue({ ...mockTask, workflowStatus: "SUBMITTED" });
      prisma.task.updateMany.mockResolvedValue({ count: 0 });
      await expect(engine.approve(1, 1, "OPERATION_MANAGER")).rejects.toThrow("该法旨已被其他人员处理");
      expect(prisma.approvalRecord.create).not.toHaveBeenCalled();
    });

    it("creates one pending submission record when approving a legacy submitted task without audit history", async () => {
      prisma.task.findUnique.mockResolvedValue({ ...mockTask, workflowStatus: "SUBMITTED", submittedAt: new Date(), createdAt: new Date() });
      prisma.taskSubmissionRecord.findFirst.mockResolvedValue(null);
      await engine.approve(1, 1, "OPERATION_MANAGER");
      expect(prisma.taskSubmissionRecord.create).toHaveBeenCalledWith({
        data: expect.objectContaining({ taskId: 1, submitterId: 1, submissionType: "INITIAL", result: "PENDING" }),
      });
    });
  });

  describe("reject", () => {
    it("allows OPERATION_MANAGER to reject", async () => {
      prisma.task.findUnique.mockResolvedValue({ ...mockTask, workflowStatus: "SUBMITTED" });
      await engine.reject(1, 1, "OPERATION_MANAGER", "需要修改");
      expect(prisma.approvalRecord.create).toHaveBeenCalledWith(
        expect.objectContaining({
          data: expect.objectContaining({ action: "OPS_REJECTED", comment: "需要修改" }),
        }),
      );
      expect(prisma.taskSubmissionRecord.update).toHaveBeenCalledWith({
        where: { id: 1 },
        data: expect.objectContaining({
          processedById: 1,
          result: "REJECTED",
          approvalRecordId: 1,
        }),
      });
      expect(eventBus.publish).toHaveBeenCalledWith("workflow.rejected", expect.any(Object));
    });

    it("stores structured image and issue-type metadata for a returned task", async () => {
      prisma.task.findUnique.mockResolvedValue({ ...mockTask, workflowStatus: "SUBMITTED" });
      await engine.reject(1, 1, "OPERATION_MANAGER", "补充素材", { issueImageTaskIds: [11], issueTypes: ["缺少参考图"] });
      expect(prisma.auditEvent.create).toHaveBeenCalledWith({
        data: expect.objectContaining({ action: "ops_approval_rejected", metadata: expect.stringContaining("缺少参考图") }),
      });
    });
  });

  describe("submission validation", () => {
    it("returns specific missing field messages before creating a submission record", async () => {
      prisma.task.findUnique.mockResolvedValue({
        ...mockTask,
        productCode: "",
        imageTasks: [{ ...mockTask.imageTasks[0], requirement: "", originalImageUrl: null, referenceImageUrl: null }],
      });
      await expect(engine.submit(1, 1, "OPERATION")).rejects.toThrow();
      expect(prisma.taskSubmissionRecord.create).not.toHaveBeenCalled();
    });
  });

  describe("withdraw", () => {
    it("allows OPERATION to withdraw their own task", async () => {
      prisma.task.findUnique.mockResolvedValue({ ...mockTask, workflowStatus: "SUBMITTED" });
      await engine.withdraw(1, 1, "OPERATION");
      expect(prisma.taskSubmissionRecord.update).toHaveBeenCalledWith({
        where: { id: 1 },
        data: expect.objectContaining({ withdrawnById: 1, result: "WITHDRAWN" }),
      });
      expect(eventBus.publish).toHaveBeenCalledWith("workflow.withdrawn", expect.any(Object));
    });

    it("cannot withdraw a non-SUBMITTED task", async () => {
      prisma.task.findUnique.mockResolvedValue({ ...mockTask, workflowStatus: "OPS_APPROVED" });
      await expect(engine.withdraw(1, 1, "OPERATION")).rejects.toThrow();
    });
  });

  describe("recalcTaskStatus", () => {
    it("returns OPS_APPROVED when no image tasks exist", async () => {
      prisma.imageTask.findMany.mockResolvedValue([]);
      const status = await engine.recalcTaskStatus(1);
      expect(status).toBe("OPS_APPROVED");
    });

    it("returns DESIGN_APPROVED when all image tasks completed", async () => {
      prisma.imageTask.findMany.mockResolvedValue([
        { status: "COMPLETED" }, { status: "COMPLETED" },
      ]);
      const status = await engine.recalcTaskStatus(1);
      expect(status).toBe("DESIGN_APPROVED");
    });

    it("publishes workflow.completed when all tasks complete", async () => {
      prisma.task.findUnique.mockResolvedValue({ ...mockTask, workflowStatus: "OPS_APPROVED" });
      prisma.imageTask.findMany.mockResolvedValue([
        { status: "COMPLETED" }, { status: "COMPLETED" },
      ]);
      await engine.recalcTaskStatus(1);
      expect(eventBus.publish).toHaveBeenCalledWith("workflow.completed", expect.any(Object));
    });
  });
});
