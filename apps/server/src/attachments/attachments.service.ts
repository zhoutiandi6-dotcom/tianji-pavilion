import { BadRequestException, ConflictException, ForbiddenException, Injectable, NotFoundException } from "@nestjs/common";
import { mkdir, unlink, writeFile } from "fs/promises";
import { existsSync, statSync } from "fs";
import { extname, join } from "path";
import { PrismaService } from "../common/prisma.service";
import { OperationLogService } from "../operation-log/operation-log.service";
import { TaskVisibilityService } from "../common/task-visibility.service";
import { getTianjiDataPaths, resolveAttachmentStoragePath, toAttachmentStoragePath } from "../common/tianji-data-paths";
import { emptyAnnotationDocument, validateAnnotationSave } from "./annotation-document";

const ADMIN_ROLES = ["OWNER", "SUPER_ADMIN"];
const EDITABLE_TASK_STATUS = ["DRAFT", "OPS_REJECTED"];
const DESIGN_VISIBLE_TASK_STATUS = ["OPS_APPROVED", "DESIGN_ASSIGNED", "IN_DESIGN", "DESIGN_REVIEW", "DESIGN_APPROVED", "COMPLETED"];
const TASK_CATEGORIES = ["TASK_MATERIAL", "TASK_REFERENCE", "TASK_GENERAL"];
const IMAGE_CATEGORIES = ["IMAGE_ORIGINAL", "IMAGE_REFERENCE", "IMAGE_COMPLETED"];
const DESIGNER_COMPLETED_ATTACHMENT_STATUSES = ["IN_PROGRESS", "REVISION_REQUIRED"];
const FEEDBACK_ROLES = ["OPERATION", "OPERATION_MANAGER", "DESIGNER", "DESIGN_MANAGER", ...ADMIN_ROLES];

@Injectable()
export class AttachmentsService {
  private readonly dataPaths = getTianjiDataPaths();
  private readonly uploadRoot = this.dataPaths.attachmentsRoot;

  constructor(private prisma: PrismaService, private log: OperationLogService, private visibility: TaskVisibilityService = new TaskVisibilityService()) {}

  private async annotationAttachment(client: any, id: number, userId: number, userRole: string, write = false) {
    if (!Number.isSafeInteger(id) || id <= 0) throw new BadRequestException("Invalid attachment ID");
    const attachment = await client.attachment.findUnique({
      where: { id },
      include: { task: { include: { imageTasks: true } }, imageTask: { include: { task: { include: { imageTasks: true } } } } },
    });
    if (!attachment || attachment.deletedAt || attachment.imageTask?.deletedAt || attachment.imageTask?.task?.deletedAt || attachment.task?.deletedAt) throw new NotFoundException("Attachment not found");
    if (!await this.canViewAttachment(attachment, userId, userRole)) throw new ForbiddenException("No permission to view attachment");
    if (!attachment.imageTaskId || !attachment.imageTask || !IMAGE_CATEGORIES.includes(attachment.category)
      || !(attachment.mimeType?.startsWith("image/") || /\.(jpg|jpeg|png|webp|gif)$/i.test(attachment.fileName))) throw new BadRequestException("A real image-task attachment is required");
    try {
      if (!statSync(resolveAttachmentStoragePath(attachment.storagePath, this.dataPaths)).isFile()) throw new Error("Not a file");
    } catch {
      throw new NotFoundException("The uploaded image file is unavailable");
    }
    if (write) {
      // Same demand-edit boundary as ImageTasksService.update; no new role capability.
      const task = attachment.imageTask.task;
      if (!ADMIN_ROLES.includes(userRole) && !(userRole === "OPERATION" && task.creatorId === userId && EDITABLE_TASK_STATUS.includes(task.workflowStatus))) throw new ForbiddenException("No permission to edit annotations");
    }
    return attachment;
  }

  private annotationResponse(attachment: any, row: any) {
    return {
      id: row?.id ?? null, attachmentId: attachment.id, imageTaskId: attachment.imageTaskId,
      version: row?.version ?? 0, document: row ? JSON.parse(row.data) : emptyAnnotationDocument(),
      createdById: row?.createdById ?? null, updatedById: row?.updatedById ?? null,
      createdAt: row?.createdAt ?? null, updatedAt: row?.updatedAt ?? null,
    };
  }

  async getAnnotations(id: number, userId: number, userRole: string) {
    return this.prisma.$transaction(async (tx) => {
      const attachment = await this.annotationAttachment(tx, id, userId, userRole);
      const row = await tx.imageAnnotationDocument.findUnique({ where: { attachmentId: id } });
      return this.annotationResponse(attachment, row);
    });
  }

  async saveAnnotations(id: number, body: unknown, userId: number, userRole: string) {
    const { expectedVersion, document } = validateAnnotationSave(body);
    try {
      return await this.prisma.$transaction(async (tx) => {
        const attachment = await this.annotationAttachment(tx, id, userId, userRole, true);
        const data = JSON.stringify(document);
        if (expectedVersion === 0) {
          const row = await tx.imageAnnotationDocument.create({ data: { attachmentId: id, data, version: 1, createdById: userId, updatedById: userId } });
          return this.annotationResponse(attachment, row);
        }
        const result = await tx.imageAnnotationDocument.updateMany({
          where: { attachmentId: id, version: expectedVersion },
          data: { data, version: { increment: 1 }, updatedById: userId },
        });
        if (result.count !== 1) throw new ConflictException("Annotations have changed. Reload before saving.");
        const row = await tx.imageAnnotationDocument.findUnique({ where: { attachmentId: id } });
        return this.annotationResponse(attachment, row);
      });
    } catch (error: any) {
      // SQLite competing transactions can surface a busy/transaction conflict instead of a zero-row update.
      if (["P2002", "P2034", "P1008", "P2028"].includes(error?.code)) throw new ConflictException("Annotations changed or another save is in progress. Reload before saving.");
      throw error;
    }
  }

  async findByTask(taskId: number, userId: number, userRole: string) {
    const task = await this.prisma.task.findUnique({ where: { id: taskId }, include: { imageTasks: true } });
    if (!task) throw new NotFoundException("Task not found");
    if (!await this.canViewTask(task, userId, userRole)) throw new ForbiddenException("No permission to view attachments");
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
    if (!await this.canViewImageTask(imageTask, userId, userRole)) throw new ForbiddenException("No permission to view attachments");
    return this.prisma.attachment.findMany({ where: { imageTaskId, deletedAt: null }, orderBy: { uploadedAt: "desc" } });
  }

  async findByFeedback(feedbackId: number, userId: number, userRole: string) {
    if (!Number.isSafeInteger(userId) || userId <= 0) throw new ForbiddenException("No permission to view feedback attachments");
    if (!FEEDBACK_ROLES.includes(userRole)) throw new ForbiddenException("No permission to view feedback attachments");
    const feedback = await this.prisma.pilotFeedback.findUnique({ where: { id: feedbackId } });
    if (!feedback) throw new NotFoundException("Feedback not found");
    return this.prisma.attachment.findMany({ where: { feedbackId, deletedAt: null }, orderBy: { uploadedAt: "asc" } });
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
    let attachment: any;
    try {
      attachment = await this.prisma.$transaction(async (tx: any) => {
        const created = await tx.attachment.create({
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
          const currentPointer = await tx.imageTask.updateMany({
            where: {
              id: imageTaskId,
              designerId: userId,
              status: { in: DESIGNER_COMPLETED_ATTACHMENT_STATUSES },
              deletedAt: null,
            },
            data: { completedAttachmentUrl: `/api/attachments/${created.id}/download` },
          });
          if (currentPointer.count !== 1) {
            throw new ConflictException("Image task status has changed. Refresh and try again.");
          }
        }
        return created;
      });
    } catch (error) {
      try {
        await unlink(join(this.uploadRoot, stored.fileName));
      } catch (cleanupError) {
        try {
          await this.log.log({
            userId,
            action: "upload_attachment_cleanup_failed",
            targetType: "image_task",
            targetId: imageTaskId,
            content: `Failed to remove newly stored attachment after database failure: ${stored.fileName}`,
          });
        } catch {
          // Preserve the original database error even when cleanup logging is unavailable.
        }
      }
      throw error;
    }
    await this.writeUploadLog(category, attachment.id, attachment.fileName, userId, req);
    return attachment;
  }

  async uploadFeedbackAttachment(feedbackId: number, file: any, userId: number, userRole: string, req?: any) {
    if (!FEEDBACK_ROLES.includes(userRole)) throw new ForbiddenException("No permission to upload feedback attachments");
    if (!file) throw new BadRequestException("File is required");
    if (!String(file.mimetype || "").startsWith("image/")) throw new BadRequestException("仅支持图片截图");
    const feedback = await this.prisma.pilotFeedback.findUnique({ where: { id: feedbackId } });
    if (!feedback) throw new NotFoundException("Feedback not found");
    if (!ADMIN_ROLES.includes(userRole) && feedback.userId !== userId) throw new ForbiddenException("只能为本人反馈上传截图");
    const stored = await this.storeFile(file);
    try {
      const attachment = await this.prisma.attachment.create({ data: {
        feedbackId, category: "FEEDBACK_SCREENSHOT", fileName: file.originalname || stored.fileName,
        fileType: file.mimetype, mimeType: file.mimetype, extension: stored.extension,
        fileSize: file.size || file.buffer?.length || 0, storagePath: stored.storagePath, uploadedById: userId,
      } });
      await this.writeUploadLog("FEEDBACK_SCREENSHOT", attachment.id, attachment.fileName, userId, req);
      return attachment;
    } catch (error) {
      try { await unlink(join(this.uploadRoot, stored.fileName)); } catch { /* preserve database error */ }
      throw error;
    }
  }

  async getDownload(id: number, userId: number, userRole: string) {
    const attachment = await this.prisma.attachment.findUnique({
      where: { id },
      include: { task: { include: { imageTasks: true } }, imageTask: { include: { task: { include: { imageTasks: true } } } }, feedback: true },
    });
    if (!attachment || attachment.deletedAt) throw new NotFoundException("Attachment not found");
    if (!await this.canViewAttachment(attachment, userId, userRole)) throw new ForbiddenException("No permission to download attachment");
    let filePath: string;
    try {
      filePath = resolveAttachmentStoragePath(attachment.storagePath, this.dataPaths);
    } catch {
      throw new NotFoundException("Attachment storage path is invalid");
    }
    if (!existsSync(filePath)) throw new NotFoundException("File not found");
    return { attachment, filePath };
  }

  async remove(id: number, userId: number, userRole: string) {
    const attachment = await this.prisma.attachment.findUnique({
      where: { id },
      include: { task: { include: { imageTasks: true } }, imageTask: { include: { task: { include: { imageTasks: true } } } }, feedback: true },
    });
    if (!attachment || attachment.deletedAt) throw new NotFoundException("Attachment not found");
    if (!this.canDeleteAttachment(attachment, userId, userRole)) throw new ForbiddenException("No permission to delete attachment");
    const currentCompletedAttachmentUrl = `/api/attachments/${id}/download`;
    if (attachment.category === "IMAGE_COMPLETED" && attachment.imageTaskId && attachment.imageTask?.completedAttachmentUrl !== currentCompletedAttachmentUrl) {
      throw new ForbiddenException("Only the current completed attachment can be deleted");
    }
    await this.prisma.$transaction(async (tx: any) => {
      await tx.attachment.update({ where: { id }, data: { deletedAt: new Date(), deletedById: userId } });
      if (attachment.category === "IMAGE_COMPLETED" && attachment.imageTaskId) {
        const previousAttachment = await tx.attachment.findFirst({
          where: { imageTaskId: attachment.imageTaskId, category: "IMAGE_COMPLETED", deletedAt: null, id: { not: id } },
          orderBy: [{ uploadedAt: "desc" }, { id: "desc" }],
        });
        const restoredPointer = await tx.imageTask.updateMany({
          where: {
            id: attachment.imageTaskId,
            designerId: userId,
            status: { in: DESIGNER_COMPLETED_ATTACHMENT_STATUSES },
            completedAttachmentUrl: currentCompletedAttachmentUrl,
            deletedAt: null,
          },
          data: { completedAttachmentUrl: previousAttachment ? `/api/attachments/${previousAttachment.id}/download` : null },
        });
        if (restoredPointer.count !== 1) {
          throw new ConflictException("Image task status or completed attachment has changed. Refresh and try again.");
        }
      }
    });
    await this.log.log({ userId, action: "delete_attachment", targetType: "attachment", targetId: id, content: "Delete attachment" });
  }

  private async canViewTask(task: any, userId: number, userRole: string) {
    return this.visibility.canAccessTask(await this.visibility.subjectForUser(userRole, userId), task);
  }

  private async canViewImageTask(imageTask: any, userId: number, userRole: string) {
    if (!await this.canViewTask(imageTask.task, userId, userRole)) return false;
    if (userRole === "DESIGNER") return imageTask.designerId === userId;
    return true;
  }

  private async canViewAttachment(attachment: any, userId: number, userRole: string) {
    if (attachment.taskId) return await this.canViewTask(attachment.task, userId, userRole) && userRole !== "DESIGNER";
    if (attachment.imageTaskId) return this.canViewImageTask(attachment.imageTask, userId, userRole);
    if (attachment.feedbackId) return FEEDBACK_ROLES.includes(userRole);
    return false;
  }

  private canUploadTaskAttachment(task: any, userId: number, userRole: string) {
    if (ADMIN_ROLES.includes(userRole)) return true;
    return userRole === "OPERATION" && task.creatorId === userId && EDITABLE_TASK_STATUS.includes(task.workflowStatus);
  }

  private canUploadImageTaskAttachment(imageTask: any, category: string, userId: number, userRole: string) {
    if (category === "IMAGE_COMPLETED") {
      return userRole === "DESIGNER"
        && imageTask.designerId === userId
        && DESIGN_VISIBLE_TASK_STATUS.includes(imageTask.task.workflowStatus)
        && DESIGNER_COMPLETED_ATTACHMENT_STATUSES.includes(imageTask.status);
    }
    if (ADMIN_ROLES.includes(userRole)) return true;
    return userRole === "OPERATION" && imageTask.task.creatorId === userId && EDITABLE_TASK_STATUS.includes(imageTask.task.workflowStatus);
  }

  private canDeleteAttachment(attachment: any, userId: number, userRole: string) {
    if (ADMIN_ROLES.includes(userRole)) return true;
    if (attachment.feedbackId) return attachment.uploadedById === userId;
    if (attachment.taskId) return this.canUploadTaskAttachment(attachment.task, userId, userRole);
    if (!attachment.imageTaskId) return false;
    return this.canUploadImageTaskAttachment(attachment.imageTask, attachment.category, userId, userRole);
  }

  private async storeFile(file: any) {
    await mkdir(this.uploadRoot, { recursive: true });
    const extension = extname(file.originalname || "").toLowerCase();
    const fileName = `${Date.now()}-${Math.random().toString(36).slice(2)}${extension}`;
    await writeFile(join(this.uploadRoot, fileName), file.buffer);
    return { fileName, extension, storagePath: toAttachmentStoragePath(fileName) };
  }

  private async writeUploadLog(category: string, attachmentId: number, fileName: string, userId: number, req?: any) {
    const actions: Record<string, string> = {
      TASK_MATERIAL: "upload_task_attachment",
      TASK_REFERENCE: "upload_task_attachment",
      TASK_GENERAL: "upload_task_attachment",
      IMAGE_ORIGINAL: "upload_image_original_attachment",
      IMAGE_REFERENCE: "upload_image_reference_attachment",
      IMAGE_COMPLETED: "upload_completed_attachment",
      FEEDBACK_SCREENSHOT: "upload_feedback_screenshot",
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
