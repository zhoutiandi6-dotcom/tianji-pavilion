import { Test, TestingModule } from "@nestjs/testing";
import { WorkflowEngine } from "./index";
import { PrismaService } from "../../common/prisma.service";
import { EventBus } from "../../event-bus/event-bus";
import { OperationLogService } from "../../operation-log/operation-log.service";

describe("WorkflowEngine", () => {
  let engine: WorkflowEngine;
  let prisma: any;
  let eventBus: any;

  const mockTask = {
    id: 1,
    workflowStatus: "DRAFT",
    serialNumber: "天字第000001号法旨",
    creatorId: 1,
  };

  beforeEach(async () => {
    prisma = {
      task: {
        findUnique: jest.fn().mockResolvedValue(mockTask),
        update: jest.fn().mockImplementation(({ data }) => ({ ...mockTask, ...data })),
      },
      approvalRecord: {
        create: jest.fn().mockResolvedValue({ id: 1 }),
      },
      imageTask: {
        findMany: jest.fn().mockResolvedValue([]),
      },
    };

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
      const result = await engine.submit(1, 1, "OPERATION");
      expect(prisma.task.update).toHaveBeenCalled();
      expect(eventBus.publish).toHaveBeenCalledWith("workflow.submitted", expect.any(Object));
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
      const result = await engine.approve(1, 1, "OPERATION_MANAGER");
      expect(prisma.approvalRecord.create).toHaveBeenCalled();
      expect(prisma.task.update).toHaveBeenCalled();
      expect(eventBus.publish).toHaveBeenCalledWith("workflow.approved", expect.any(Object));
    });

    it("rejects OPERATION from approving", async () => {
      await expect(engine.approve(1, 1, "OPERATION")).rejects.toThrow();
    });

    it("rejects DESIGNER from approving", async () => {
      await expect(engine.approve(1, 1, "DESIGNER")).rejects.toThrow();
    });
  });

  describe("reject", () => {
    it("allows OPERATION_MANAGER to reject", async () => {
      const result = await engine.reject(1, 1, "OPERATION_MANAGER", "需要修改");
      expect(prisma.approvalRecord.create).toHaveBeenCalledWith(
        expect.objectContaining({
          data: expect.objectContaining({ action: "OPS_REJECTED", comment: "需要修改" }),
        }),
      );
      expect(eventBus.publish).toHaveBeenCalledWith("workflow.rejected", expect.any(Object));
    });
  });

  describe("withdraw", () => {
    it("allows OPERATION to withdraw their own task", async () => {
      prisma.task.findUnique.mockResolvedValue({ ...mockTask, workflowStatus: "SUBMITTED" });
      const result = await engine.withdraw(1, 1, "OPERATION");
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

    it("returns COMPLETED when all image tasks completed", async () => {
      prisma.imageTask.findMany.mockResolvedValue([
        { status: "COMPLETED" }, { status: "COMPLETED" },
      ]);
      const status = await engine.recalcTaskStatus(1);
      expect(status).toBe("COMPLETED");
    });

    it("publishes workflow.completed when all tasks complete", async () => {
      prisma.imageTask.findMany.mockResolvedValue([
        { status: "COMPLETED" }, { status: "COMPLETED" },
      ]);
      await engine.recalcTaskStatus(1);
      expect(eventBus.publish).toHaveBeenCalledWith("workflow.completed", expect.any(Object));
    });
  });
});
