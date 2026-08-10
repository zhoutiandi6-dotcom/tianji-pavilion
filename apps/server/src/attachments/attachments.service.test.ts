jest.mock("fs/promises", () => ({
  mkdir: jest.fn().mockResolvedValue(undefined),
  writeFile: jest.fn().mockResolvedValue(undefined),
  unlink: jest.fn().mockResolvedValue(undefined),
}));

import { unlink, writeFile } from "fs/promises";
import { AttachmentsService } from "./attachments.service";

describe("AttachmentsService completed attachment lifecycle", () => {
  let service: AttachmentsService;
  let prisma: any;
  let log: any;

  const imageTask = (overrides: Record<string, any> = {}) => ({
    id: 10,
    taskId: 100,
    designerId: 7,
    status: "IN_PROGRESS",
    completedAttachmentUrl: null,
    task: { id: 100, creatorId: 2, workflowStatus: "IN_DESIGN", imageTasks: [{ id: 10, designerId: 7 }] },
    ...overrides,
  });

  const file = { originalname: "completed.png", mimetype: "image/png", size: 512, buffer: Buffer.from("test") };

  beforeEach(() => {
    jest.clearAllMocks();
    prisma = {
      imageTask: {
        findUnique: jest.fn(),
        update: jest.fn().mockResolvedValue({}),
        updateMany: jest.fn().mockResolvedValue({ count: 1 }),
      },
      attachment: {
        create: jest.fn().mockResolvedValue({ id: 22, fileName: "completed.png" }),
        findUnique: jest.fn(),
        findFirst: jest.fn().mockResolvedValue(null),
        update: jest.fn().mockResolvedValue({}),
      },
    };
    prisma.$transaction = jest.fn().mockImplementation(async (callback: any) => callback(prisma));
    log = { log: jest.fn().mockResolvedValue(undefined) };
    service = new AttachmentsService(prisma, log);
  });

  it.each(["NOT_STARTED", "SUBMITTED_FOR_REVIEW", "APPROVED", "COMPLETED"])("rejects completed attachment upload in %s", async (status) => {
    prisma.imageTask.findUnique.mockResolvedValue(imageTask({ status }));

    await expect(service.uploadImageTaskAttachment(10, "IMAGE_COMPLETED", file, 7, "DESIGNER"))
      .rejects.toThrow("No permission");
    expect(writeFile).not.toHaveBeenCalled();
  });

  it("allows the assigned designer to upload in progress and makes the new version current", async () => {
    prisma.imageTask.findUnique.mockResolvedValue(imageTask());

    await service.uploadImageTaskAttachment(10, "IMAGE_COMPLETED", file, 7, "DESIGNER");

    expect(prisma.attachment.create).toHaveBeenCalledWith(expect.objectContaining({
      data: expect.objectContaining({ imageTaskId: 10, category: "IMAGE_COMPLETED", uploadedById: 7 }),
    }));
    expect(prisma.imageTask.updateMany).toHaveBeenCalledWith({
      where: expect.objectContaining({ id: 10, designerId: 7, status: { in: ["IN_PROGRESS", "REVISION_REQUIRED"] } }),
      data: { completedAttachmentUrl: "/api/attachments/22/download" },
    });
    expect(prisma.attachment.update).not.toHaveBeenCalled();
  });

  it("allows a returned task to upload a new completed attachment version without deleting earlier versions", async () => {
    prisma.imageTask.findUnique.mockResolvedValue(imageTask({ status: "REVISION_REQUIRED" }));

    await service.uploadImageTaskAttachment(10, "IMAGE_COMPLETED", file, 7, "DESIGNER");

    expect(prisma.attachment.create).toHaveBeenCalledTimes(1);
    expect(prisma.attachment.update).not.toHaveBeenCalled();
    expect(prisma.imageTask.updateMany).toHaveBeenCalledWith(expect.objectContaining({
      data: { completedAttachmentUrl: "/api/attachments/22/download" },
    }));
  });

  it("rejects a different designer before storing a completed attachment", async () => {
    prisma.imageTask.findUnique.mockResolvedValue(imageTask({ designerId: 8 }));

    await expect(service.uploadImageTaskAttachment(10, "IMAGE_COMPLETED", file, 7, "DESIGNER"))
      .rejects.toThrow("No permission");
    expect(writeFile).not.toHaveBeenCalled();
  });

  it("removes only the current completed attachment and restores the previous current pointer", async () => {
    prisma.attachment.findUnique.mockResolvedValue({
      id: 22,
      imageTaskId: 10,
      category: "IMAGE_COMPLETED",
      deletedAt: null,
      imageTask: imageTask({
        completedAttachmentUrl: "/api/attachments/22/download",
        attachments: [{ id: 22 }, { id: 21 }],
      }),
    });
    prisma.attachment.findFirst.mockResolvedValue({ id: 21 });

    await service.remove(22, 7, "DESIGNER");

    expect(prisma.attachment.update).toHaveBeenCalledWith(expect.objectContaining({
      where: { id: 22 },
      data: expect.objectContaining({ deletedById: 7 }),
    }));
    expect(prisma.imageTask.updateMany).toHaveBeenCalledWith({
      where: expect.objectContaining({ id: 10, designerId: 7, completedAttachmentUrl: "/api/attachments/22/download" }),
      data: { completedAttachmentUrl: "/api/attachments/21/download" },
    });
  });

  it("rejects deletion of a historical completed attachment", async () => {
    prisma.attachment.findUnique.mockResolvedValue({
      id: 21,
      imageTaskId: 10,
      category: "IMAGE_COMPLETED",
      deletedAt: null,
      imageTask: imageTask({ completedAttachmentUrl: "/api/attachments/22/download" }),
    });

    await expect(service.remove(21, 7, "DESIGNER")).rejects.toThrow("Only the current completed attachment");
    expect(prisma.$transaction).not.toHaveBeenCalled();
  });

  it.each(["SUBMITTED_FOR_REVIEW", "APPROVED", "COMPLETED"])("rejects completed attachment deletion in %s", async (status) => {
    prisma.attachment.findUnique.mockResolvedValue({
      id: 22,
      imageTaskId: 10,
      category: "IMAGE_COMPLETED",
      deletedAt: null,
      imageTask: imageTask({ status, completedAttachmentUrl: "/api/attachments/22/download" }),
    });

    await expect(service.remove(22, 7, "DESIGNER")).rejects.toThrow("No permission");
    expect(prisma.$transaction).not.toHaveBeenCalled();
  });

  it("removes only the newly stored physical file when attachment persistence fails", async () => {
    prisma.imageTask.findUnique.mockResolvedValue(imageTask());
    prisma.$transaction.mockRejectedValue(new Error("database unavailable"));

    await expect(service.uploadImageTaskAttachment(10, "IMAGE_COMPLETED", file, 7, "DESIGNER"))
      .rejects.toThrow("database unavailable");
    expect(unlink).toHaveBeenCalledTimes(1);
    expect(String((unlink as jest.Mock).mock.calls[0][0])).toMatch(/attachments.*\.png$/i);
  });
});
