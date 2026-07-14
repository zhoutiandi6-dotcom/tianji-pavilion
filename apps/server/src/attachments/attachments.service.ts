import { BadRequestException, ForbiddenException, Injectable, NotFoundException } from "@nestjs/common";
import { mkdir, writeFile } from "fs/promises";
import { existsSync } from "fs";
import { extname, join, resolve } from "path";
import { PrismaService } from "../common/prisma.service";
import { OperationLogService } from "../operation-log/operation-log.service";

const ADMIN_ROLES = ["OWNER", "SUPER_ADMIN"];
const EDITABLE_TASK_STATUS = ["DRAFT", "OPS_REJECTED"];
const DESIGN_VISIBLE_TASK_STATUS = ["OPS_APPROVED", "DESIGN_ASSIGNED", "IN_DESIGN", "DESIGN_REVIEW", "DESIGN_APPROVED", "COMPLETED"];
const TASK_CATEGORIES = ["TASK_MATERIAL", "TASK_REFERENCE", "TASK_GENERAL"];
const IMAGE_CATEGORIES = ["IMAGE_ORIGINAL", "IMAGE_REFERENCE", "IMAGE_COMPLETED"];

@Injectable()
export class AttachmentsService {
  private readonly uploadRoot = resolve(process.cwd(), "uploads", "attachments");

  constructor(private prisma: PrismaService, private log: OperationLogService) {}

  async findByTask(taskId: number, userId: number, userRole: string) {
    const task = await this.prisma.task.findUnique({ where: { id: taskId }, include: { imageTasks: true } });
    if (!task) throw new NotFoundException("Task not found");
    if (!this.canViewTask(task, userId, userRole)) throw new ForbiddenException("No permission to view attachments");
    if (userRole === "DESIGNER") return [];
    return this.prisma.attachment.findMany({
      where: { taskId, imageTaskId: null, deletedAt: null },
      orderBy: { uploadedAt: "desc" },
    });
  }

  async findByImageTask(imageTaskId: number, userId: number, userRole: string) {
    const imageTask = await this.prisma.imageTask.findUnique({
      where: { id: imageTaskId },
      include: { task: { include: { imageTasks: true } } },
    });
    if (!imageTask) throw new NotFoundException("Image task not found");
    if (!this.canViewImageTask(imageTask, userId, userRole)) throw new ForbiddenException("No permission to view attachments");
    return this.prisma.attachment.findMany({ where: { imageTaskId, deletedAt: null }, orderBy: { uploadedAt: "desc" } });
  }

  async uploadTaskAttachment(taskId: number, category: string, file: any, userId: number, userRole: string, req?: any) {
    if (!TASK_CATEGORIES.includes(category)) throw new BadRequestException("Invalid task attachment category");
    if (!file) throw new BadRequestException("File is required");
    const task = await this.prisma.task.findUnique({ where: { id: taskId }, include: { imageTasks: true } });
    if (!task) throw new NotFoundException("Task not found");
    if (!this.canUploadTaskAttachment(task, userId, userRole)) throw new ForbiddenException("No permission to upload task attachment");
    const stored = await this.storeFile(file);
    const attachment = await this.prisma.attachment.create({
      data: {
        taskId,
        imageTaskId: null,
        category,
        fileName: file.originalname || stored.fileName,
        fileType: file.mimetype || "application/octet-stream",
        mimeType: file.mimetype || "application/octet-stream",
        extension: stored.extension,
        fileSize: file.size || file.buffer?.length || 0,
        storagePath: stored.storagePath,
        uploadedById: userId,
      },
    });
    await this.writeUploadLog(category, attachment.id, attachment.fileName, userId, req);
    return attachment;
  }

  async uploadImageTaskAttachment(imageTaskId: number, category: string, file: any, userId: number, userRole: string, req?: any) {
    if (!IMAGE_CATEGORIES.includes(category)) throw new BadRequestException("Invalid image attachment category");
    if (!file) throw new BadRequestException("File is required");
    const imageTask = await this.prisma.imageTask.findUnique({
      where: { id: imageTaskId },
      include: { task: { include: { imageTasks: true } } },
    });
    if (!imageTask) throw new NotFoundException("Image task not found");
    if (!this.canUploadImageTaskAttachment(imageTask, category, userId, userRole)) {
      throw new ForbiddenException("No permission to upload image task attachment");
    }
    const stored = await this.storeFile(file);
    const attachment = await this.prisma.attachment.create({
      data: {
        taskId: null,
        imageTaskId,
        category,
        fileName: file.originalname || stored.fileName,
        fileType: file.mimetype || "application/octet-stream",
        mimeType: file.mimetype || "application/octet-stream",
        extension: stored.extension,
        fileSize: file.size || file.buffer?.length || 0,
        storagePath: stored.storagePath,
        uploadedById: userId,
      },
    });
    if (category === "IMAGE_COMPLETED") {
      await this.prisma.imageTask.update({
        where: { id: imageTaskId },
        data: { completedAttachmentUrl: `/api/attachments/${attachment.id}/download` },
      });
    }
    await this.writeUploadLog(category, attachment.id, attachment.fileName, userId, req);
    return attachment;
  }

  async getDownload(id: number, userId: number, userRole: string) {
    const attachment = await this.prisma.attachment.findUnique({
      where: { id },
      include: { task: { include: { imageTasks: true } }, imageTask: { include: { task: { include: { imageTasks: true } } } } },
    });
    if (!attachment || attachment.deletedAt) throw new NotFoundException("Attachment not found");
    if (!this.canViewAttachment(attachment, userId, userRole)) throw new ForbiddenException("No permission to download attachment");
    const filePath = resolve(attachment.storagePath);
    if (!filePath.startsWith(this.uploadRoot) || !existsSync(filePath)) throw new NotFoundException("File not found");
    return { attachment, filePath };
  }

  async remove(id: number, userId: number, userRole: string) {
    const attachment = await this.prisma.attachment.findUnique({
      where: { id },
      include: { task: { include: { imageTasks: true } }, imageTask: { include: { task: { include: { imageTasks: true } } } } },
    });
    if (!attachment || attachment.deletedAt) throw new NotFoundException("Attachment not found");
    if (!this.canDeleteAttachment(attachment, userId, userRole)) throw new ForbiddenException("No permission to delete attachment");
    await this.prisma.$transaction(async (tx: any) => {
      await tx.attachment.update({ where: { id }, data: { deletedAt: new Date(), deletedById: userId } });
      if (attachment.category === "IMAGE_COMPLETED" && attachment.imageTaskId && attachment.imageTask?.completedAttachmentUrl === `/api/attachments/${id}/download`) {
        await tx.imageTask.update({ where: { id: attachment.imageTaskId }, data: { completedAttachmentUrl: null } });
      }
    });
    await this.log.log({ userId, action: "delete_attachment", targetType: "attachment", targetId: id, content: "Delete attachment" });
  }

  private canViewTask(task: any, userId: number, userRole: string) {
    if (ADMIN_ROLES.includes(userRole)) return true;
    if (userRole === "OPERATION") return task.creatorId === userId;
    if (userRole === "OPERATION_MANAGER") return task.workflowStatus !== "DRAFT";
    if (userRole === "DESIGN_MANAGER") return DESIGN_VISIBLE_TASK_STATUS.includes(task.workflowStatus);
    if (userRole === "DESIGNER") {
      return DESIGN_VISIBLE_TASK_STATUS.includes(task.workflowStatus) && task.imageTasks?.some((it: any) => it.designerId === userId);
    }
    return false;
  }

  private canViewImageTask(imageTask: any, userId: number, userRole: string) {
    if (!this.canViewTask(imageTask.task, userId, userRole)) return false;
    if (userRole === "DESIGNER") return imageTask.designerId === userId;
    return true;
  }

  private canViewAttachment(attachment: any, userId: number, userRole: string) {
    if (attachment.taskId) return this.canViewTask(attachment.task, userId, userRole) && userRole !== "DESIGNER";
    if (attachment.imageTaskId) return this.canViewImageTask(attachment.imageTask, userId, userRole);
    return false;
  }

  private canUploadTaskAttachment(task: any, userId: number, userRole: string) {
    if (ADMIN_ROLES.includes(userRole)) return true;
    return userRole === "OPERATION" && task.creatorId === userId && EDITABLE_TASK_STATUS.includes(task.workflowStatus);
  }

  private canUploadImageTaskAttachment(imageTask: any, category: string, userId: number, userRole: string) {
    if (ADMIN_ROLES.includes(userRole)) return true;
    if (category === "IMAGE_COMPLETED") {
      return userRole === "DESIGNER" && imageTask.designerId === userId && DESIGN_VISIBLE_TASK_STATUS.includes(imageTask.task.workflowStatus);
    }
    return userRole === "OPERATION" && imageTask.task.creatorId === userId && EDITABLE_TASK_STATUS.includes(imageTask.task.workflowStatus);
  }

  private canDeleteAttachment(attachment: any, userId: number, userRole: string) {
    if (ADMIN_ROLES.includes(userRole)) return true;
    if (attachment.taskId) return this.canUploadTaskAttachment(attachment.task, userId, userRole);
    if (!attachment.imageTaskId) return false;
    return this.canUploadImageTaskAttachment(attachment.imageTask, attachment.category, userId, userRole);
  }

  private async storeFile(file: any) {
    await mkdir(this.uploadRoot, { recursive: true });
    const extension = extname(file.originalname || "").toLowerCase();
    const fileName = `${Date.now()}-${Math.random().toString(36).slice(2)}${extension}`;
    const storagePath = join(this.uploadRoot, fileName);
    await writeFile(storagePath, file.buffer);
    return { fileName, extension, storagePath };
  }

  private async writeUploadLog(category: string, attachmentId: number, fileName: string, userId: number, req?: any) {
    const actions: Record<string, string> = {
      TASK_MATERIAL: "upload_task_attachment",
      TASK_REFERENCE: "upload_task_attachment",
      TASK_GENERAL: "upload_task_attachment",
      IMAGE_ORIGINAL: "upload_image_original_attachment",
      IMAGE_REFERENCE: "upload_image_reference_attachment",
      IMAGE_COMPLETED: "upload_completed_attachment",
    };
    await this.log.log({
      userId,
      action: actions[category] || "upload_attachment",
      targetType: "attachment",
      targetId: attachmentId,
      content: `Upload attachment: ${fileName}`,
      ipAddress: req?.ip,
      userAgent: req?.headers?.["user-agent"],
    });
  }
}
