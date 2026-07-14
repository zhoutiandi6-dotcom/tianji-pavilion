import { BadRequestException, ForbiddenException, Injectable, NotFoundException } from "@nestjs/common";
import { PrismaService } from "../common/prisma.service";
import { OperationLogService } from "../operation-log/operation-log.service";
import { EventBus } from "../event-bus/event-bus";
import {
  ImageTaskAssigned,
  ImageTaskReviewApproved,
  ImageTaskReviewRejected,
  ImageTaskStarted,
  ImageTaskSubmittedForReview,
} from "../domain-events";
import { WorkflowEngine } from "../workflow-engine/engine";
import { CreateImageTaskDto } from "./dto/create-image-task.dto";
import { UpdateImageTaskDto } from "./dto/update-image-task.dto";
import { BatchAssignImageTasksDto } from "./dto/batch-assign-image-tasks.dto";
import { BatchAssignTasksDto } from "./dto/batch-assign-tasks.dto";
import { BatchReviewTasksDto } from "./dto/batch-review-tasks.dto";

const EDITABLE_TASK_STATUS = ["DRAFT", "OPS_REJECTED"];
const ADMIN_ROLES = ["OWNER", "SUPER_ADMIN"];
const DESIGN_VISIBLE_TASK_STATUS = ["OPS_APPROVED", "DESIGN_ASSIGNED", "IN_DESIGN", "DESIGN_REVIEW", "DESIGN_APPROVED", "COMPLETED"];

@Injectable()
export class ImageTasksService {
  constructor(
    private prisma: PrismaService,
    private log: OperationLogService,
    private eventBus: EventBus,
    private workflowEngine: WorkflowEngine,
  ) {}

  async create(dto: CreateImageTaskDto, userId: number) {
    const task = await this.prisma.task.findUnique({ where: { id: dto.taskId } });
    if (!task) throw new NotFoundException("Task not found");
    if (task.creatorId !== userId) throw new ForbiddenException("Only the creator can add image tasks");
    if (!EDITABLE_TASK_STATUS.includes(task.workflowStatus)) {
      throw new ForbiddenException("Image tasks can only be added while the task is draft or rejected");
    }

    const agg = await this.prisma.imageTask.aggregate({
      where: { taskId: dto.taskId },
      _max: { imageIndex: true, sortOrder: true },
    });
    const imageIndex = (agg._max.imageIndex ?? 0) + 1;

    const result = await this.prisma.$transaction(async (tx: any) => {
      const created = await tx.imageTask.create({
        data: {
          taskId: dto.taskId,
          imageTitle: dto.imageTitle,
          imageType: dto.imageType,
          requirementType: dto.requirementType,
          originalImageUrl: dto.originalImageUrl,
          referenceImageUrl: dto.referenceImageUrl,
          requirement: dto.requirement || "",
          useUnifiedRequirement: dto.useUnifiedRequirement ?? true,
          inheritFromImageIndex: dto.inheritFromImageIndex,
          designerId: dto.designerId ?? null,
          imageIndex,
          sortOrder: (agg._max.sortOrder ?? -1) + 1,
          status: "WAITING_OPS_APPROVAL",
          remark: dto.remark,
        },
      });
      await tx.task.update({ where: { id: dto.taskId }, data: { imageCount: imageIndex } });
      return created;
    });

    await this.log.log({
      userId,
      action: "create_image_task",
      targetType: "image_task",
      targetId: result.id,
      content: `Create image task: ${dto.imageTitle || `#${imageIndex}`}`,
    });
    return result;
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

  async findByTask(taskId: number, userId: number, userRole: string) {
    const task = await this.prisma.task.findUnique({
      where: { id: taskId },
      include: { imageTasks: { select: { designerId: true } } },
    });
    if (!task) throw new NotFoundException("Task not found");
    if (!this.canViewTask(task, userId, userRole)) throw new ForbiddenException("No permission to view image tasks");
    const where: any = { taskId };
    if (userRole === "DESIGNER") where.designerId = userId;
    return this.prisma.imageTask.findMany({
      where,
      include: { designer: { select: { id: true, username: true, displayName: true } }, attachments: true },
      orderBy: { sortOrder: "asc" },
    });
  }

  async findOne(id: number, userId: number, userRole: string) {
    const imageTask = await this.prisma.imageTask.findUnique({
      where: { id },
      include: { designer: true, attachments: true, task: { include: { imageTasks: { select: { designerId: true } } } } },
    });
    if (!imageTask) throw new NotFoundException("Image task not found");
    if (!this.canViewTask(imageTask.task, userId, userRole)) throw new ForbiddenException("No permission to view image task");
    if (userRole === "DESIGNER" && imageTask.designerId !== userId) throw new ForbiddenException("No permission to view image task");
    return imageTask;
  }

  async batchAssign(dto: BatchAssignImageTasksDto, userId: number, userRole: string) {
    if (!["DESIGN_MANAGER", ...ADMIN_ROLES].includes(userRole)) {
      throw new ForbiddenException("仅设计主管或管理员可批量分配设计师");
    }
    const ids = Array.from(new Set((dto.imageTaskIds || []).map(Number).filter(Boolean))).slice(0, 100);
    if (!ids.length) throw new ForbiddenException("请选择需要分配的图片任务");
    if (!dto.designerId) throw new ForbiddenException("请选择设计师");

    await this.ensureDesigner(Number(dto.designerId));
    const imageTasks = await this.prisma.imageTask.findMany({ where: { id: { in: ids } }, include: { task: true } });
    if (imageTasks.length !== ids.length) throw new NotFoundException("存在图片任务不存在");
    if (imageTasks.some((item) => item.task.workflowStatus !== "OPS_APPROVED" || item.designerId || item.status !== "PENDING_ASSIGNMENT")) {
      throw new ForbiddenException("仅已通过运营审批且待分配的图片任务可批量分配");
    }
    await this.assignImageTasks(imageTasks, Number(dto.designerId), userId, "ASSIGN");
    await this.log.log({
      userId,
      action: "batch_assign_designer",
      targetType: "image_task",
      targetId: 0,
      content: `批量分配设计师：${imageTasks.length} 项`,
      afterValue: { designerId: Number(dto.designerId), imageTaskIds: ids },
    });
    return { total: imageTasks.length, successCount: imageTasks.length, failedCount: 0, results: ids.map((id) => ({ id, success: true, message: "已分配" })) };
  }

  private async ensureDesigner(designerId: number) {
    const designer = await this.prisma.user.findFirst({
      where: { id: designerId, isActive: true, role: { name: "DESIGNER" } },
    });
    if (!designer) throw new BadRequestException("设计师不存在、未启用或角色不正确");
    return designer;
  }

  private createAssignmentAudit(
    tx: any,
    imageTask: { id: number; designerId?: number | null },
    newDesignerId: number,
    assignedById: number,
    assignedAt: Date,
    assignmentType: "INITIAL" | "REASSIGN",
  ) {
    return tx.auditEvent.create({
      data: {
        resourceType: "image_task",
        resourceId: imageTask.id,
        action: assignmentType === "INITIAL" ? "assign_designer" : "reassign_designer",
        operatorId: assignedById,
        correlationId: null,
        metadata: JSON.stringify({
          imageTaskId: imageTask.id,
          previousDesignerId: imageTask.designerId ?? null,
          newDesignerId,
          assignedById,
          assignedAt: assignedAt.toISOString(),
          assignmentType,
        }),
      },
    });
  }

  private async assignImageTasks(imageTasks: any[], designerId: number, userId: number, mode: "ASSIGN" | "REASSIGN") {
    const assignedAt = new Date();
    const assignmentType = mode === "ASSIGN" ? "INITIAL" : "REASSIGN";
    await this.prisma.$transaction(async (tx: any) => {
      for (const item of imageTasks) {
        await tx.imageTask.update({
          where: { id: item.id },
          data: { designerId, assignedAt, assignedById: userId, status: "NOT_STARTED" },
        });
        await this.createAssignmentAudit(tx, item, designerId, userId, assignedAt, assignmentType);
      }
    });
    for (const item of imageTasks) {
      await this.eventBus.publish("image_task.assigned", new ImageTaskAssigned(item.id, item.taskId, designerId));
      await this.log.log({
        userId,
        action: mode === "ASSIGN" ? "assign_designer" : "reassign_designer",
        targetType: "image_task",
        targetId: item.id,
        content: `${mode === "ASSIGN" ? "分配" : "改派"}设计师：${item.imageTitle || `#${item.imageIndex}`}`,
      });
    }
    await Promise.all([...new Set(imageTasks.map((item) => item.taskId))].map((taskId) => this.workflowEngine.recalcTaskStatus(taskId)));
  }

  async batchAssignTasks(dto: BatchAssignTasksDto, userId: number, userRole: string) {
    if (!["DESIGN_MANAGER", ...ADMIN_ROLES].includes(userRole)) throw new ForbiddenException("仅设计主管或管理员可批量分配设计师");
    const taskIds = Array.from(new Set(dto.taskIds.map(Number))).slice(0, 100);
    await this.ensureDesigner(dto.designerId);
    const tasks = await this.prisma.task.findMany({ where: { id: { in: taskIds }, deletedAt: null }, include: { imageTasks: true } });
    if (tasks.length !== taskIds.length) throw new NotFoundException("存在法旨不存在或已删除");
    const expectedWorkflow = dto.mode === "ASSIGN" ? "OPS_APPROVED" : "DESIGN_ASSIGNED";
    if (tasks.some((task) => task.workflowStatus !== expectedWorkflow)) throw new ForbiddenException("所选法旨的状态不满足本次批量操作");
    const imageTasks = tasks.flatMap((task) => task.imageTasks.filter((item) => dto.mode === "ASSIGN"
      ? item.status === "PENDING_ASSIGNMENT" && !item.designerId
      : item.status === "NOT_STARTED" && !!item.designerId));
    if (!imageTasks.length) throw new BadRequestException("所选法旨没有可处理的图片任务");
    await this.assignImageTasks(imageTasks, dto.designerId, userId, dto.mode);
    await this.log.log({ userId, action: "batch_assign_designer", targetType: "task", targetId: 0, content: `批量${dto.mode === "ASSIGN" ? "分配" : "改派"}设计师：${taskIds.length} 条法旨`, afterValue: { taskIds, designerId: dto.designerId, mode: dto.mode } });
    return { total: taskIds.length, successCount: taskIds.length, failedCount: 0 };
  }

  async batchReviewTasks(dto: BatchReviewTasksDto, userId: number, userRole: string) {
    if (!["DESIGN_MANAGER", ...ADMIN_ROLES].includes(userRole)) throw new ForbiddenException("仅设计主管或管理员可批量审核");
    const taskIds = Array.from(new Set(dto.taskIds.map(Number))).slice(0, 100);
    const remark = dto.remark?.trim();
    if (dto.action === "REJECT" && !remark) throw new BadRequestException("请填写退回原因");
    const tasks = await this.prisma.task.findMany({ where: { id: { in: taskIds }, deletedAt: null }, include: { imageTasks: { include: { attachments: { where: { deletedAt: null }, select: { category: true } } } } } });
    if (tasks.length !== taskIds.length) throw new NotFoundException("存在法旨不存在或已删除");
    if (tasks.some((task) => task.workflowStatus !== "DESIGN_REVIEW")) throw new ForbiddenException("仅待设计审核的法旨可批量审核");
    const imageTasks = tasks.flatMap((task) => task.imageTasks.filter((item) => item.status === "SUBMITTED_FOR_REVIEW"));
    if (!imageTasks.length) throw new BadRequestException("所选法旨没有待审核图片任务");
    if (dto.action === "APPROVE" && imageTasks.some((item) => !item.completedAttachmentUrl && !item.attachments.some((attachment) => attachment.category === "IMAGE_COMPLETED"))) {
      throw new BadRequestException("存在未上传完成稿的图片任务，无法批量审核通过");
    }
    const status = dto.action === "APPROVE" ? "APPROVED" : "REVISION_REQUIRED";
    const approvedAt = dto.action === "APPROVE" ? new Date() : null;
    await this.prisma.$transaction(async (tx: any) => {
      for (const item of imageTasks) {
        await tx.imageTask.update({
          where: { id: item.id },
          data: {
            status,
            reviewStatus: status,
            reviewRemark: remark || item.reviewRemark,
            approvedAt,
            approvedById: dto.action === "APPROVE" ? userId : null,
          },
        });
      }
    });
    for (const item of imageTasks) {
      await this.log.log({ userId, action: dto.action === "APPROVE" ? "design_review_approve" : "design_review_reject", targetType: "image_task", targetId: item.id, content: dto.action === "APPROVE" ? "批量审核通过" : "批量退回修改", afterValue: { status, reviewRemark: remark } });
      const event = dto.action === "APPROVE" ? new ImageTaskReviewApproved(item.id, item.taskId, userId, item.designerId, item.imageTitle || undefined) : new ImageTaskReviewRejected(item.id, item.taskId, userId, item.designerId, remark, item.imageTitle || undefined);
      await this.eventBus.publish(event.name, event);
    }
    await Promise.all(taskIds.map((taskId) => this.workflowEngine.recalcTaskStatus(taskId)));
    return { total: taskIds.length, successCount: taskIds.length, failedCount: 0 };
  }

  async update(id: number, dto: UpdateImageTaskDto, userId: number, userRole: string) {
    const imageTask = await this.prisma.imageTask.findUnique({
      where: { id },
      include: { task: true, attachments: { where: { deletedAt: null }, select: { category: true } } },
    });
    if (!imageTask) throw new NotFoundException("Image task not found");

    if (userRole === "DESIGNER") {
      if (imageTask.designerId !== userId) throw new ForbiddenException("Only the assigned designer can update this image task");
      if (!DESIGN_VISIBLE_TASK_STATUS.includes(imageTask.task.workflowStatus)) {
        throw new ForbiddenException("Image task is not visible to designers before operation manager approval");
      }
      const data: any = {};
      if (dto.status === "IN_PROGRESS" && ["NOT_STARTED", "REVISION_REQUIRED"].includes(imageTask.status)) data.status = "IN_PROGRESS";
      if (dto.status === "SUBMITTED_FOR_REVIEW" && ["IN_PROGRESS", "REVISION_REQUIRED"].includes(imageTask.status)) {
        data.status = "SUBMITTED_FOR_REVIEW";
        data.reviewStatus = "PENDING";
      }
      if (dto.designNote !== undefined) data.designNote = dto.designNote;
      if (dto.completedAttachmentUrl !== undefined) data.completedAttachmentUrl = dto.completedAttachmentUrl;
      if (!Object.keys(data).length) throw new ForbiddenException("Invalid image task update");
      const result = await this.prisma.imageTask.update({ where: { id }, data });
      if (data.status === "IN_PROGRESS") {
        await this.eventBus.publish("image_task.started", new ImageTaskStarted(id, imageTask.taskId, userId));
      } else if (data.status === "SUBMITTED_FOR_REVIEW") {
        await this.eventBus.publish(
          "image_task.submitted_for_review",
          new ImageTaskSubmittedForReview(id, imageTask.taskId, userId, imageTask.imageTitle || undefined),
        );
      }
      if (data.status === "IN_PROGRESS" || data.status === "SUBMITTED_FOR_REVIEW") await this.workflowEngine.recalcTaskStatus(imageTask.taskId);
      await this.log.log({
        userId,
        action: "update_image_task",
        targetType: "image_task",
        targetId: id,
        content: `Update image task: ${imageTask.imageTitle || `#${imageTask.imageIndex}`}`,
      });
      if (data.status && data.status !== imageTask.status) {
        await this.log.log({ userId, action: "update_image_task_status", targetType: "image_task", targetId: id, content: `Image task status changed: ${imageTask.status} -> ${data.status}` });
      }
      if (data.status === "SUBMITTED_FOR_REVIEW") {
        await this.log.log({
          userId,
          action: imageTask.status === "REVISION_REQUIRED" ? "resubmit_design_review" : "submit_design_review",
          targetType: "image_task",
          targetId: id,
          content: `Submit design review: ${imageTask.imageTitle || `#${imageTask.imageIndex}`}`,
        });
      }
      if (dto.designNote !== undefined && dto.designNote !== imageTask.designNote) {
        await this.log.log({ userId, action: "update_design_note", targetType: "image_task", targetId: id, content: `Update design note: ${imageTask.imageTitle || `#${imageTask.imageIndex}`}` });
      }
      return result;
    }

    if (userRole === "DESIGN_MANAGER" || (ADMIN_ROLES.includes(userRole) && (dto.designerId !== undefined || dto.status === "APPROVED" || dto.status === "REVISION_REQUIRED"))) {
      if (!["OPS_APPROVED", "DESIGN_ASSIGNED", "IN_DESIGN", "DESIGN_REVIEW"].includes(imageTask.task.workflowStatus)) {
        throw new ForbiddenException("Designers can only be assigned after operation manager approval");
      }
      const data: any = {};
      let assignmentType: "INITIAL" | "REASSIGN" | null = null;
      let assignedAt: Date | null = null;
      if (dto.designerId !== undefined && dto.designerId !== imageTask.designerId) {
        await this.ensureDesigner(Number(dto.designerId));
        const assignable = imageTask.status === "PENDING_ASSIGNMENT" && !imageTask.designerId;
        const reassignable = imageTask.status === "NOT_STARTED" && !!imageTask.designerId;
        if (!assignable && !reassignable) {
          throw new ForbiddenException("仅待分配任务可分配、仅已分配未开始任务可改派");
        }
        assignmentType = imageTask.designerId ? "REASSIGN" : "INITIAL";
        assignedAt = new Date();
        data.designerId = dto.designerId;
        data.assignedAt = assignedAt;
        data.assignedById = userId;
        data.status = "NOT_STARTED";
      }
      if (dto.status === "APPROVED" || dto.status === "REVISION_REQUIRED") {
        if (imageTask.status !== "SUBMITTED_FOR_REVIEW") {
          throw new ForbiddenException("Only submitted image tasks can be reviewed");
        }
        if (dto.status === "REVISION_REQUIRED" && !(dto.reviewRemark ?? dto.remark)?.trim()) {
          throw new BadRequestException("请填写退回原因");
        }
        if (dto.status === "APPROVED" && !imageTask.attachments.some((item: any) => item.category === "IMAGE_COMPLETED") && !imageTask.completedAttachmentUrl) {
          throw new BadRequestException("暂无完成稿，无法审核通过");
        }
        data.status = dto.status;
        data.reviewStatus = dto.status;
        data.reviewRemark = (dto.reviewRemark ?? dto.remark)?.trim() || imageTask.reviewRemark;
        data.approvedAt = dto.status === "APPROVED" ? new Date() : null;
        data.approvedById = dto.status === "APPROVED" ? userId : null;
      }
      if (!Object.keys(data).length) throw new ForbiddenException("Invalid design manager update");
      const result = await this.prisma.$transaction(async (tx: any) => {
        const updated = await tx.imageTask.update({ where: { id }, data });
        if (assignmentType && assignedAt && dto.designerId !== undefined) {
          await this.createAssignmentAudit(tx, imageTask, Number(dto.designerId), userId, assignedAt, assignmentType);
        }
        return updated;
      });
      if (dto.designerId && dto.designerId !== imageTask.designerId) {
        await this.eventBus.publish("image_task.assigned", new ImageTaskAssigned(id, imageTask.taskId, dto.designerId));
      }
      if (dto.designerId !== undefined && dto.designerId !== imageTask.designerId) {
        await this.workflowEngine.recalcTaskStatus(imageTask.taskId);
      }
      if (dto.designerId !== undefined && dto.designerId !== imageTask.designerId) {
        await this.log.log({
          userId,
          action: "assign_designer",
          targetType: "image_task",
          targetId: id,
          content: `Assign designer: ${imageTask.imageTitle || `#${imageTask.imageIndex}`}`,
        });
      }
      if (data.status && data.status !== imageTask.status) {
        await this.log.log({ userId, action: "update_image_task_status", targetType: "image_task", targetId: id, content: `Image task status changed: ${imageTask.status} -> ${data.status}` });
        await this.log.log({
          userId,
          action: data.status === "APPROVED" ? "design_review_approve" : "design_review_reject",
          targetType: "image_task",
          targetId: id,
          content: data.status === "APPROVED" ? `Approve design review: ${imageTask.imageTitle || `#${imageTask.imageIndex}`}` : `Reject design review: ${imageTask.imageTitle || `#${imageTask.imageIndex}`}`,
        });
        await this.workflowEngine.recalcTaskStatus(imageTask.taskId);
        const event = data.status === "APPROVED"
          ? new ImageTaskReviewApproved(id, imageTask.taskId, userId, imageTask.designerId, imageTask.imageTitle || undefined)
          : new ImageTaskReviewRejected(id, imageTask.taskId, userId, imageTask.designerId, data.reviewRemark, imageTask.imageTitle || undefined);
        await this.eventBus.publish(event.name, event);
      }
      return result;
    }

    if (["OPERATION", "OWNER", "SUPER_ADMIN"].includes(userRole)) {
      if (userRole === "OPERATION") {
        if (imageTask.task.creatorId !== userId) throw new ForbiddenException("Only the creator can edit this image task");
        if (!EDITABLE_TASK_STATUS.includes(imageTask.task.workflowStatus)) {
          throw new ForbiddenException("Image task details can only be edited while the task is draft or rejected");
        }
      }
      const result = await this.prisma.imageTask.update({ where: { id }, data: dto });
      await this.log.log({
        userId,
        action: "edit_image_task",
        targetType: "image_task",
        targetId: id,
        content: `Edit image task: ${imageTask.imageTitle || `#${imageTask.imageIndex}`}`,
      });
      if (
        (dto.originalImageUrl !== undefined && dto.originalImageUrl !== imageTask.originalImageUrl) ||
        (dto.referenceImageUrl !== undefined && dto.referenceImageUrl !== imageTask.referenceImageUrl) ||
        (dto.completedAttachmentUrl !== undefined && dto.completedAttachmentUrl !== imageTask.completedAttachmentUrl)
      ) {
        await this.log.log({ userId, action: "update_link", targetType: "image_task", targetId: id, content: `Update image task links: ${imageTask.imageTitle || `#${imageTask.imageIndex}`}` });
      }
      if (dto.designNote !== undefined && dto.designNote !== imageTask.designNote) {
        await this.log.log({ userId, action: "update_design_note", targetType: "image_task", targetId: id, content: `Update design note: ${imageTask.imageTitle || `#${imageTask.imageIndex}`}` });
      }
      return result;
    }

    throw new ForbiddenException("No permission to update image task");
  }

  async remove(id: number, userId: number, userRole: string) {
    const imageTask = await this.prisma.imageTask.findUnique({ where: { id }, include: { task: true } });
    if (!imageTask) throw new NotFoundException("Image task not found");
    if (!ADMIN_ROLES.includes(userRole)) {
      if (userRole !== "OPERATION" || imageTask.task.creatorId !== userId) throw new ForbiddenException("No permission to delete image task");
    }
    if (!EDITABLE_TASK_STATUS.includes(imageTask.task.workflowStatus)) {
      throw new ForbiddenException("Image tasks can only be deleted while the task is draft or rejected");
    }
    await this.prisma.imageTask.delete({ where: { id } });
    await this.log.log({
      userId,
      action: "delete_image_task",
      targetType: "image_task",
      targetId: id,
      content: `Delete image task: ${imageTask.imageTitle || `#${imageTask.imageIndex}`}`,
    });
  }
}
