import { ForbiddenException, NotFoundException } from "@nestjs/common";
import { ApprovalService } from "./approval.service";
import { TaskVisibilityService } from "../common/task-visibility.service";

describe("ApprovalService records visibility", () => {
  const visibility = new TaskVisibilityService();
  const actions = {} as any;

  it("returns 404 when the task does not exist", async () => {
    const prisma = { task: { findFirst: jest.fn().mockResolvedValue(null) } } as any;
    const service = new ApprovalService(actions, prisma, visibility);
    await expect(service.records(404, "SUPER_ADMIN", 1)).rejects.toThrow(NotFoundException);
  });

  it("returns 403 when the task exists but is outside the user scope", async () => {
    const prisma = {
      task: { findFirst: jest.fn().mockResolvedValueOnce({ id: 2 }).mockResolvedValueOnce(null) },
    } as any;
    const service = new ApprovalService(actions, prisma, visibility);
    await expect(service.records(2, "OPERATION", 7)).rejects.toThrow(ForbiddenException);
  });

  it("returns approval history for a visible task", async () => {
    const records = [{ id: 1, taskId: 2 }];
    const prisma = {
      task: { findFirst: jest.fn().mockResolvedValueOnce({ id: 2 }).mockResolvedValueOnce({ id: 2 }) },
      approvalRecord: { findMany: jest.fn().mockResolvedValue(records) },
    } as any;
    const service = new ApprovalService(actions, prisma, visibility);
    await expect(service.records(2, "OPERATION", 7)).resolves.toEqual(records);
  });
});
