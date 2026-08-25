import { WorkflowNotificationService } from "./workflow-notification.service";

describe("WorkflowNotificationService completion notification", () => {
  it("uses the existing workflow.completed recipients and notification type", async () => {
    const handlers = new Map<string, (event: any) => Promise<void>>();
    const eventBus = { subscribe: jest.fn((name: string, handler: (event: any) => Promise<void>) => handlers.set(name, handler)) };
    const prisma = {
      task: { findUnique: jest.fn().mockResolvedValue({ serialNumber: "TJ-10", creatorId: 7 }) },
      user: { findMany: jest.fn().mockResolvedValue([{ id: 9 }, { id: 10 }]) },
      notification: { createMany: jest.fn().mockResolvedValue({ count: 3 }), create: jest.fn() },
    };
    const service = new WorkflowNotificationService(eventBus as any, prisma as any);

    service.onModuleInit();
    await handlers.get("workflow.completed")!({ taskId: 10 });

    expect(prisma.notification.createMany).toHaveBeenCalledWith({
      data: expect.arrayContaining([
        expect.objectContaining({ receiverId: 7, type: "workflow", taskId: 10 }),
        expect.objectContaining({ receiverId: 9, type: "workflow", taskId: 10 }),
        expect.objectContaining({ receiverId: 10, type: "workflow", taskId: 10 }),
      ]),
    });
  });
});
