import { BadRequestException, ForbiddenException } from "@nestjs/common";
import { FeedbackService } from "./feedback.service";

describe("FeedbackService V2 authorization", () => {
  const feedback = { id: 7, userId: 11, status: "PENDING" };
  const tx = {
    pilotFeedback: { findUnique: jest.fn().mockResolvedValue(feedback), update: jest.fn().mockResolvedValue({ ...feedback, status: "COMPLETED" }) },
    user: { findUnique: jest.fn().mockResolvedValue({ displayName: "天帝" }) },
    feedbackStatusHistory: { create: jest.fn().mockResolvedValue({ id: 1 }) },
    auditEvent: { create: jest.fn().mockResolvedValue({ id: 1 }) },
  };
  const prisma: any = {
    pilotFeedback: { create: jest.fn(), findMany: jest.fn(), count: jest.fn(), findUnique: jest.fn() },
    $transaction: jest.fn((callback: any) => callback(tx)),
  };
  const service = new FeedbackService(prisma);

  beforeEach(() => jest.clearAllMocks());

  it("filters my feedback in the database query", async () => {
    prisma.pilotFeedback.findMany.mockResolvedValue([]); prisma.pilotFeedback.count.mockResolvedValue(0);
    await service.findMine(11);
    expect(prisma.pilotFeedback.findMany).toHaveBeenCalledWith(expect.objectContaining({ where: { userId: 11 } }));
    expect(prisma.pilotFeedback.count).toHaveBeenCalledWith({ where: { userId: 11 } });
  });

  it.each(["OPERATION", "OPERATION_MANAGER", "DESIGNER", "DESIGN_MANAGER"])("allows %s to use feedback without granting status management", async (role) => {
    expect(service.canAccess(role)).toBe(true);
    await expect(service.updateStatus(7, "PROCESSING", undefined, { sub: 2, role })).rejects.toBeInstanceOf(ForbiddenException);
  });

  it("does not turn OPERATION_MANAGER into global rejection authority", async () => {
    await expect(service.updateStatus(7, "REJECTED", "重复问题", { sub: 2, role: "OPERATION_MANAGER" })).rejects.toBeInstanceOf(ForbiddenException);
    expect(prisma.$transaction).not.toHaveBeenCalled();
  });

  it("requires an explanation for administrator completed/deferred/rejected decisions", async () => {
    await expect(service.updateStatus(7, "COMPLETED", "", { sub: 1, role: "SUPER_ADMIN" })).rejects.toBeInstanceOf(BadRequestException);
    await expect(service.updateStatus(7, "REJECTED", "", { sub: 1, role: "SUPER_ADMIN" })).rejects.toBeInstanceOf(BadRequestException);
  });

  it("writes one immutable status history record with operator name", async () => {
    await service.updateStatus(7, "COMPLETED", "已修复", { sub: 1, role: "SUPER_ADMIN" });
    expect(tx.feedbackStatusHistory.create).toHaveBeenCalledWith({ data: expect.objectContaining({ feedbackId: 7, fromStatus: "PENDING", toStatus: "COMPLETED", operatorId: 1, operatorName: "天帝", note: "已修复" }) });
  });
});
