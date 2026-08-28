import { BadRequestException, ConflictException, ForbiddenException, Injectable, NotFoundException } from "@nestjs/common";
import { PrismaService } from "../common/prisma.service";
import { OperationLogService } from "../operation-log/operation-log.service";
import { EventBus } from "../event-bus/event-bus";
import {
  ImageTaskAssigned,
  ImageTaskReviewApproved,
  ImageTaskReviewRejected,
  ImageTaskStarted,
  ImageTaskSubmittedForReview,
  WorkflowCompleted,
} from "../domain-events";
import { WorkflowEngine } from "../workflow-engine/engine";
import { CreateImageTaskDto } from "./dto/create-image-task.dto";
import { UpdateImageTaskDto } from "./dto/update-image-task.dto";
import { BatchAssignImageTasksDto } from "./dto/batch-assign-image-tasks.dto";
import { BatchAssignTasksDto } from "./dto/batch-assign-tasks.dto";
import { BatchReviewTasksDto } from "./dto/batch-review-tasks.dto";
import {
  IMAGE_TASK_REVIEW_AUDIT_ACTION,
  IMAGE_TASK_REVIEW_DECISION_ACTIONS,
  IMAGE_TASK_REVIEW_HISTORY_ACTIONS,
  type ImageTaskReviewVersionMetadata,
} from "./image-task-review-history";
import { WeeklyPlansService } from "../weekly-plans/weekly-plans.service";
import { WeeklyOperationsApprovalPlansService } from "../weekly-plans/weekly-operations-approval-plans.service";
import {
  ImageTaskDetailAttachmentDto,
  ImageTaskDetailDto,
  ImageTaskDetailPersonDto,
  ImageTaskReviewHistoryItemDto,
} from "./dto/image-task-detail.dto";

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
    private weeklyPlans: WeeklyPlansService,
    private operationsApprovalPlans: WeeklyOperationsApprovalPlansService,
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
      await this.operationsApprovalPlans.refreshPendingDecreeSnapshotInTransaction(tx, dto.taskId, userId, "image_task_created");
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

  private parseReviewAttachmentId(metadata: string | null | undefined, field: keyof ImageTaskReviewVersionMetadata) {
    if (!metadata) return null;
    try {
      const parsed = JSON.parse(metadata);
      const value = parsed?.[field] ?? parsed?.afterValue?.[field];
      return Number.isInteger(value) && value > 0 ? value : null;
    } catch {
      return null;
    }
  }

  private resolveCurrentCompletedAttachmentId(imageTask: any) {
    const attachments = (imageTask.attachments || [])
      .filter((attachment: any) => attachment.category === "IMAGE_COMPLETED" && Number.isInteger(attachment.id));
    if (!attachments.length) throw new BadRequestException("At least one completed attachment is required before design review submission");
    if (imageTask.completedAttachmentUrl) {
      const pointedAttachment = attachments.find((attachment: any) => imageTask.completedAttachmentUrl === `/api/attachments/${attachment.id}/download`);
      if (!pointedAttachment) throw new ConflictException("Current completed attachment pointer is inconsistent. Refresh and try again.");
      return pointedAttachment.id;
    }
    return [...attachments].sort((left: any, right: any) => {
      const rightTime = right.uploadedAt ? new Date(right.uploadedAt).getTime() : 0;
      const leftTime = left.uploadedAt ? new Date(left.uploadedAt).getTime() : 0;
      return rightTime - leftTime || right.id - left.id;
    })[0].id;
  }

  private async resolveReviewedAttachmentIdInTransaction(tx: any, imageTask: any) {
    const latestSubmission = await tx.auditEvent.findFirst({
      where: {
        resourceType: "image_task",
        resourceId: imageTask.id,
        action: { in: [IMAGE_TASK_REVIEW_AUDIT_ACTION.submitted, IMAGE_TASK_REVIEW_AUDIT_ACTION.resubmitted] },
      },
      select: { metadata: true },
      orderBy: [{ createdAt: "desc" }, { id: "desc" }],
    });
    const submittedAttachmentId = this.parseReviewAttachmentId(latestSubmission?.metadata, "submittedAttachmentId");
    if (submittedAttachmentId) {
      const submittedAttachment = await tx.attachment.findFirst({
        where: {
          id: submittedAttachmentId,
          imageTaskId: imageTask.id,
          category: "IMAGE_COMPLETED",
          deletedAt: null,
        },
        select: { id: true },
      });
      if (!submittedAttachment) throw new ConflictException("Submitted completed attachment is unavailable. Refresh and try again.");
      return submittedAttachment.id;
    }
    return this.resolveCurrentCompletedAttachmentId(imageTask);
  }

  async findOne(id: number, userId: number, userRole: string) {
    const imageTask = await this.prisma.imageTask.findUnique({
      where: { id },
      select: {
        id: true,
        taskId: true,
        imageIndex: true,
        imageTitle: true,
        imageType: true,
        requirement: true,
        remark: true,
        status: true,
        createdAt: true,
        updatedAt: true,
        submittedAt: true,
        designerId: true,
        designer: { select: { id: true, username: true, displayName: true } },
        assignedBy: { select: { id: true, username: true, displayName: true } },
        attachments: {
          where: { deletedAt: null },
          select: {
            id: true,
            fileName: true,
            mimeType: true,
            fileSize: true,
            category: true,
            uploadedAt: true,
          },
          orderBy: { uploadedAt: "desc" },
        },
        task: {
          select: {
            id: true,
            serialNumber: true,
            productCode: true,
            priority: true,
            requesterName: true,
            creatorId: true,
            workflowStatus: true,
            creator: { select: { id: true, username: true, displayName: true } },
            store: { select: { id: true, name: true } },
            requirementType: { select: { id: true, name: true } },
            imageTasks: { select: { designerId: true } },
          },
        },
      },
    });
    if (!imageTask) throw new NotFoundException("Image task not found");
    if (!this.canViewTask(imageTask.task, userId, userRole)) throw new ForbiddenException("No permission to view image task");
    if (userRole === "DESIGNER" && imageTask.designerId !== userId) throw new ForbiddenException("No permission to view image task");

    const auditEvents = await this.prisma.auditEvent.findMany({
      where: {
        resourceType: "image_task",
        resourceId: id,
        action: { in: IMAGE_TASK_REVIEW_HISTORY_ACTIONS },
      },
      select: { action: true, operatorId: true, metadata: true, createdAt: true },
      orderBy: { createdAt: "asc" },
    });

    const parseMetadata = (raw: string | null): Record<string, unknown> | null => {
      if (!raw) return null;
      try {
        const parsed = JSON.parse(raw);
        return parsed && typeof parsed === "object" ? parsed : null;
      } catch {
        return null;
      }
    };
    const readReviewerId = (raw: string | null): number | null => {
      const reviewerId = parseMetadata(raw)?.reviewerId;
      return typeof reviewerId === "number" && Number.isInteger(reviewerId) ? reviewerId : null;
    };
    const historyEvents = auditEvents.map((event) => ({
      event,
      actorId: IMAGE_TASK_REVIEW_DECISION_ACTIONS.has(event.action)
        ? readReviewerId(event.metadata) ?? event.operatorId
        : event.operatorId,
    }));
    const actorIds = Array.from(new Set(historyEvents
      .map(({ actorId }) => actorId)
      .filter((actorId): actorId is number => actorId !== null)));
    const auditActors = actorIds.length
      ? await this.prisma.user.findMany({
        where: { id: { in: actorIds } },
        select: { id: true, username: true, displayName: true },
      })
      : [];
    const actorById = new Map(auditActors.map((actor) => [actor.id, actor]));

    const toPerson = (person: { id: number; username: string; displayName: string | null } | null): ImageTaskDetailPersonDto | null => {
      if (!person) return null;
      return { id: person.id, displayName: person.displayName || person.username };
    };
    const readReason = (raw: string | null) => {
      if (!raw) return null;
      try {
        const parsed = JSON.parse(raw);
        const source = parsed?.afterValue || parsed;
        return typeof source.reviewRemark === "string" ? source.reviewRemark
          : typeof source.remark === "string" ? source.remark
            : typeof source.reason === "string" ? source.reason
              : null;
      } catch {
        return null;
      }
    };
    const toAttachment = (attachment: {
      id: number;
      fileName: string;
      mimeType: string;
      fileSize: number;
      category: string;
      uploadedAt: Date;
    }): ImageTaskDetailAttachmentDto => ({
      id: attachment.id,
      fileName: attachment.fileName,
      mimeType: attachment.mimeType,
      fileSize: attachment.fileSize,
      category: attachment.category,
      createdAt: attachment.uploadedAt,
    });

    const reviewHistory: ImageTaskReviewHistoryItemDto[] = [
      ...historyEvents.map(({ event, actorId }) => ({
        source: "AUDIT_EVENT" as const,
        action: event.action,
        operator: toPerson(actorById.get(actorId ?? -1) || null),
        reason: readReason(event.metadata),
        submittedAttachmentId: this.parseReviewAttachmentId(event.metadata, "submittedAttachmentId"),
        reviewedAttachmentId: this.parseReviewAttachmentId(event.metadata, "reviewedAttachmentId"),
        createdAt: event.createdAt,
      })),
    ].sort((left, right) => left.createdAt.getTime() - right.createdAt.getTime());

    const sourceCategories = new Set(["IMAGE_ORIGINAL", "IMAGE_REFERENCE"]);
    return {
      id: imageTask.id,
      imageIndex: imageTask.imageIndex,
      name: imageTask.imageTitle,
      imageType: imageTask.imageType,
      status: imageTask.status,
      requirementDescription: imageTask.requirement,
      modificationRequirement: imageTask.remark,
      createdAt: imageTask.createdAt,
      updatedAt: imageTask.updatedAt,
      submittedAt: imageTask.submittedAt,
      decree: {
        id: imageTask.task.id,
        serialNumber: imageTask.task.serialNumber,
        productCode: imageTask.task.productCode,
        store: imageTask.task.store,
        requirementType: imageTask.task.requirementType,
        priority: imageTask.task.priority,
      },
      people: {
        operator: toPerson(imageTask.task.creator)!,
        requesterName: imageTask.task.requesterName,
        designer: toPerson(imageTask.designer),
        assignedBy: toPerson(imageTask.assignedBy),
      },
      sourceAttachments: imageTask.attachments.filter((attachment) => sourceCategories.has(attachment.category)).map(toAttachment),
      completedAttachments: imageTask.attachments.filter((attachment) => attachment.category === "IMAGE_COMPLETED").map(toAttachment),
      reviewHistory,
    } satisfies ImageTaskDetailDto;
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
    await this.assignImageTasks(imageTasks, Number(dto.designerId), userId, "ASSIGN", dto.weekStart);
    if (imageTasks.length > 1) {
      await this.log.log({
        userId,
        action: "batch_assign_designer",
        targetType: "image_task",
        targetId: 0,
        content: `批量分配设计师：${imageTasks.length} 项`,
        afterValue: { designerId: Number(dto.designerId), imageTaskIds: ids },
      });
    }
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
          designerId: newDesignerId,
          assignedById,
          assignedAt: assignedAt.toISOString(),
          assignmentType,
        }),
      },
    });
  }

  private async assignImageTasks(
    imageTasks: any[],
    designerId: number,
    userId: number,
    mode: "ASSIGN" | "REASSIGN",
    weekStart?: string,
    reason?: string,
  ) {
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
      await this.weeklyPlans.addAssignedTasksInTransaction(tx, imageTasks, designerId, userId, assignedAt, assignmentType, weekStart, reason);
      for (const taskId of [...new Set(imageTasks.map((item) => item.taskId))]) {
        await this.workflowEngine.recalcTaskStatusInTransaction(tx, taskId);
      }
    });
    for (const item of imageTasks) {
      await this.eventBus.publish("image_task.assigned", new ImageTaskAssigned(item.id, item.taskId, designerId, userId));
    }
  }

  async batchAssignTasks(dto: BatchAssignTasksDto, userId: number, userRole: string) {
    if (!["DESIGN_MANAGER", ...ADMIN_ROLES].includes(userRole)) throw new ForbiddenException("仅设计主管或管理员可批量分配设计师");
    const taskIds = Array.from(new Set(dto.taskIds.map(Number))).slice(0, 100);
    await this.ensureDesigner(dto.designerId);
    const tasks = await this.prisma.task.findMany({ where: { id: { in: taskIds }, deletedAt: null }, include: { imageTasks: { where: { deletedAt: null } } } });
    if (tasks.length !== taskIds.length) throw new NotFoundException("存在法旨不存在或已删除");
    const expectedWorkflow = dto.mode === "ASSIGN" ? "OPS_APPROVED" : "DESIGN_ASSIGNED";
    if (tasks.some((task) => task.workflowStatus !== expectedWorkflow)) throw new ForbiddenException("所选法旨的状态不满足本次批量操作");
    const invalidTask = tasks.find((task) => {
      if (!task.imageTasks.length) return true;
      if (dto.mode === "ASSIGN") return task.imageTasks.some((item) => item.status !== "PENDING_ASSIGNMENT" || !!item.designerId);
      const owners = new Set(task.imageTasks.map((item) => item.designerId).filter((id): id is number => !!id));
      return task.imageTasks.some((item) => item.status !== "NOT_STARTED" || !item.designerId) || owners.size !== 1;
    });
    if (invalidTask) {
      if (dto.mode === "REASSIGN") {
        const ownerIds = new Set((invalidTask.imageTasks || []).map((item: any) => item.designerId).filter(Boolean));
        if (ownerIds.size > 1) {
          throw new BadRequestException("Data anomaly: this decree has multiple designers. Normalize its owner with an explicit whole-decree reassignment before changing its weekly plan.");
        }
      }
      throw new BadRequestException(dto.mode === "ASSIGN"
        ? "A decree can be assigned only when every effective image task is pending assignment"
        : "A decree can be reassigned only when every effective image task is unstarted and has the same designer");
    }
    if (dto.mode === "REASSIGN" && !dto.reason?.trim()) throw new BadRequestException("A reason is required when adjusting a decree assignment");
    const imageTasks = tasks.flatMap((task) => task.imageTasks.filter((item) => dto.mode === "ASSIGN"
      ? item.status === "PENDING_ASSIGNMENT" && !item.designerId
      : item.status === "NOT_STARTED" && !!item.designerId));
    if (!imageTasks.length) throw new BadRequestException("所选法旨没有可处理的图片任务");
    await this.assignImageTasks(imageTasks, dto.designerId, userId, dto.mode, dto.weekStart, dto.reason?.trim());
    if (taskIds.length > 1) {
      await this.log.log({ userId, action: "batch_assign_designer", targetType: "task", targetId: 0, content: `批量${dto.mode === "ASSIGN" ? "分配" : "改派"}设计师：${taskIds.length} 条法旨`, afterValue: { taskIds, designerId: dto.designerId, mode: dto.mode } });
    }
    return { total: taskIds.length, successCount: taskIds.length, failedCount: 0 };
  }

  async batchReviewTasks(dto: BatchReviewTasksDto, userId: number, userRole: string) {
    if (!["DESIGN_MANAGER", ...ADMIN_ROLES].includes(userRole)) throw new ForbiddenException("仅设计主管或管理员可批量审核");
    const taskIds = Array.from(new Set(dto.taskIds.map(Number))).slice(0, 100);
    const remark = dto.remark?.trim();
    if (dto.action === "REJECT" && !remark) throw new BadRequestException("请填写退回原因");
    const tasks = await this.prisma.task.findMany({ where: { id: { in: taskIds }, deletedAt: null }, include: { imageTasks: { include: { attachments: { where: { deletedAt: null }, select: { id: true, category: true, uploadedAt: true } } } } } });
    if (tasks.length !== taskIds.length) throw new NotFoundException("存在法旨不存在或已删除");
    if (tasks.some((task) => task.workflowStatus !== "DESIGN_REVIEW")) throw new ForbiddenException("仅待设计审核的法旨可批量审核");
    const imageTasks = tasks.flatMap((task) => task.imageTasks.filter((item) => item.status === "SUBMITTED_FOR_REVIEW"));
    if (!imageTasks.length) throw new BadRequestException("所选法旨没有待审核图片任务");
    if (dto.action === "APPROVE" && imageTasks.some((item) => !item.completedAttachmentUrl && !item.attachments.some((attachment) => attachment.category === "IMAGE_COMPLETED"))) {
      throw new BadRequestException("存在未上传完成稿的图片任务，无法批量审核通过");
    }
    const status = dto.action === "APPROVE" ? "APPROVED" : "REVISION_REQUIRED";
    const approvedAt = dto.action === "APPROVE" ? new Date() : null;
    const reviewedAttachmentIds = new Map<number, number>();
    const completedTasks = await this.prisma.$transaction(async (tx: any) => {
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
        const reviewedTask = await tx.imageTask.findUnique({
          where: { id: item.id },
          select: {
            id: true,
            completedAttachmentUrl: true,
            attachments: { where: { deletedAt: null }, select: { id: true, category: true, uploadedAt: true } },
          },
        });
        if (!reviewedTask) throw new NotFoundException("Image task not found");
        reviewedAttachmentIds.set(item.id, await this.resolveReviewedAttachmentIdInTransaction(tx, reviewedTask));
        if (dto.action === "APPROVE" && approvedAt) {
          await this.weeklyPlans.completeApprovedImageTaskInTransaction(tx, item.id, userId, approvedAt);
        }
      }
      const results = await Promise.all(taskIds.map(async (taskId) => ({
        taskId,
        result: await this.workflowEngine.recalcTaskDesignStatusInTransaction(tx, taskId),
      })));
      return results.filter(({ result }) => result.enteredDesignApproved);
    });
    for (const item of imageTasks) {
      const reviewedAttachmentId = reviewedAttachmentIds.get(item.id);
      await this.log.log({ userId, action: dto.action === "APPROVE" ? "design_review_approve" : "design_review_reject", targetType: "image_task", targetId: item.id, content: dto.action === "APPROVE" ? "批量审核通过" : "批量退回修改", afterValue: { status, reviewRemark: remark, reviewedAttachmentId } });
      const event = dto.action === "APPROVE" ? new ImageTaskReviewApproved(item.id, item.taskId, userId, item.designerId, item.imageTitle || undefined, reviewedAttachmentId) : new ImageTaskReviewRejected(item.id, item.taskId, userId, item.designerId, remark, item.imageTitle || undefined, reviewedAttachmentId);
      await this.eventBus.publish(event.name, event);
    }
    for (const { taskId, result } of completedTasks) {
      const event = new WorkflowCompleted(taskId, result.serialNumber, userId);
      await this.eventBus.publish(event.name, event);
    }
    return { total: taskIds.length, successCount: taskIds.length, failedCount: 0 };
  }

  async update(id: number, dto: UpdateImageTaskDto, userId: number, userRole: string) {
    const imageTask = await this.prisma.imageTask.findUnique({
      where: { id },
      include: { task: true, attachments: { where: { deletedAt: null }, select: { id: true, category: true, uploadedAt: true } } },
    });
    if (!imageTask) throw new NotFoundException("Image task not found");

    const isReviewDecision = dto.status === "APPROVED" || dto.status === "REVISION_REQUIRED";
    const canReviewImageTask = userRole === "DESIGN_MANAGER" || ADMIN_ROLES.includes(userRole);
    if (isReviewDecision) {
      if (!canReviewImageTask) throw new ForbiddenException("No permission to review image task");
      if (imageTask.status !== "SUBMITTED_FOR_REVIEW") {
        throw new ConflictException("Image task is no longer pending review. Refresh and try again.");
      }
    }

    if (dto.designerId !== undefined && dto.designerId !== imageTask.designerId && (userRole === "DESIGN_MANAGER" || ADMIN_ROLES.includes(userRole))) {
      throw new BadRequestException("Designer assignment must use the whole-decree assignment endpoint");
    }

    if (userRole === "DESIGNER") {
      if (imageTask.designerId !== userId) throw new ForbiddenException("Only the assigned designer can update this image task");
      if (!DESIGN_VISIBLE_TASK_STATUS.includes(imageTask.task.workflowStatus)) {
        throw new ForbiddenException("Image task is not visible to designers before operation manager approval");
      }
      const data: any = {};
      let expectedStatuses: string[] | null = null;
      let submittedAttachmentId: number | null = null;
      if (dto.status === "IN_PROGRESS" && imageTask.status === "NOT_STARTED") {
        data.status = "IN_PROGRESS";
        expectedStatuses = ["NOT_STARTED"];
      }
      if (dto.status === "SUBMITTED_FOR_REVIEW" && ["IN_PROGRESS", "REVISION_REQUIRED"].includes(imageTask.status)) {
        data.status = "SUBMITTED_FOR_REVIEW";
        data.reviewStatus = "PENDING";
        data.submittedAt = new Date();
        data.submittedById = userId;
        expectedStatuses = ["IN_PROGRESS", "REVISION_REQUIRED"];
      }
      if (dto.designNote !== undefined) data.designNote = dto.designNote;
      if (dto.completedAttachmentUrl !== undefined) data.completedAttachmentUrl = dto.completedAttachmentUrl;
      if (!Object.keys(data).length) throw new ForbiddenException("Invalid image task update");
      const result = await this.prisma.$transaction(async (tx: any) => {
        if (data.status && expectedStatuses) {
          let currentCompletedAttachmentUrl: string | null = null;
          if (data.status === "SUBMITTED_FOR_REVIEW") {
            const current = await tx.imageTask.findUnique({
              where: { id },
              select: {
                id: true,
                completedAttachmentUrl: true,
                attachments: { where: { deletedAt: null }, select: { id: true, category: true, uploadedAt: true } },
              },
            });
            if (!current) throw new NotFoundException("Image task not found");
            submittedAttachmentId = this.resolveCurrentCompletedAttachmentId(current);
            currentCompletedAttachmentUrl = current.completedAttachmentUrl;
          }
          const transition = await tx.imageTask.updateMany({
            where: {
              id,
              designerId: userId,
              status: { in: expectedStatuses },
              deletedAt: null,
              ...(data.status === "SUBMITTED_FOR_REVIEW" ? { completedAttachmentUrl: currentCompletedAttachmentUrl } : {}),
            },
            data,
          });
          if (transition.count !== 1) {
            throw new ConflictException("Image task status has changed. Refresh and try again.");
          }
        } else {
          await tx.imageTask.update({ where: { id }, data });
        }
        if (data.status === "IN_PROGRESS" || data.status === "SUBMITTED_FOR_REVIEW") {
          await this.workflowEngine.recalcTaskStatusInTransaction(tx, imageTask.taskId);
        }
        if (data.status === "SUBMITTED_FOR_REVIEW") {
          await tx.auditEvent.create({
            data: {
              resourceType: "image_task",
              resourceId: id,
              action: imageTask.status === "REVISION_REQUIRED" ? "design_review_resubmitted" : "design_review_submitted",
              operatorId: userId,
              metadata: JSON.stringify({ taskId: imageTask.taskId, previousStatus: imageTask.status, submittedAt: data.submittedAt.toISOString(), submittedById: userId, submittedAttachmentId }),
            },
          });
        }
        return tx.imageTask.findUnique({ where: { id } });
      });
      if (data.status === "IN_PROGRESS") {
        await this.eventBus.publish("image_task.started", new ImageTaskStarted(id, imageTask.taskId, userId));
      } else if (data.status === "SUBMITTED_FOR_REVIEW") {
        await this.eventBus.publish(
          "image_task.submitted_for_review",
          new ImageTaskSubmittedForReview(id, imageTask.taskId, userId, imageTask.imageTitle || undefined, submittedAttachmentId ?? undefined),
        );
      }
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

    if (userRole === "DESIGN_MANAGER" || (ADMIN_ROLES.includes(userRole) && (dto.designerId !== undefined || isReviewDecision))) {
      if (!isReviewDecision && !["OPS_APPROVED", "DESIGN_ASSIGNED", "IN_DESIGN", "DESIGN_REVIEW"].includes(imageTask.task.workflowStatus)) {
        throw new ForbiddenException("Designers can only be assigned after operation manager approval");
      }
      const data: any = {};
      let assignmentType: "INITIAL" | "REASSIGN" | null = null;
      let assignedAt: Date | null = null;
      let approvedAt: Date | null = null;
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
      if (isReviewDecision) {
        if (dto.status === "REVISION_REQUIRED" && !(dto.reviewRemark ?? dto.remark)?.trim()) {
          throw new BadRequestException("请填写退回原因");
        }
        if (dto.status === "APPROVED" && !imageTask.attachments.some((item: any) => item.category === "IMAGE_COMPLETED") && !imageTask.completedAttachmentUrl) {
          throw new BadRequestException("暂无完成稿，无法审核通过");
        }
        data.status = dto.status;
        data.reviewStatus = dto.status;
        data.reviewRemark = (dto.reviewRemark ?? dto.remark)?.trim() || imageTask.reviewRemark;
        approvedAt = dto.status === "APPROVED" ? new Date() : null;
        data.approvedAt = approvedAt;
        data.approvedById = dto.status === "APPROVED" ? userId : null;
      }
      if (!Object.keys(data).length) throw new ForbiddenException("Invalid design manager update");
      let reviewedAttachmentId: number | null = null;
      const reviewResult = await this.prisma.$transaction(async (tx: any) => {
        let updated: any;
        if (isReviewDecision) {
          const transition = await tx.imageTask.updateMany({
            where: { id, status: "SUBMITTED_FOR_REVIEW", deletedAt: null },
            data,
          });
          if (transition.count !== 1) {
            const current = await tx.imageTask.findUnique({ where: { id }, select: { status: true } });
            if (!current) throw new NotFoundException("Image task not found");
            throw new ConflictException(`Image task review status has changed to ${current.status}. Refresh and try again.`);
          }
          const reviewedTask = await tx.imageTask.findUnique({
            where: { id },
            select: {
              id: true,
              completedAttachmentUrl: true,
              attachments: { where: { deletedAt: null }, select: { id: true, category: true, uploadedAt: true } },
            },
          });
          if (!reviewedTask) throw new NotFoundException("Image task not found");
          reviewedAttachmentId = await this.resolveReviewedAttachmentIdInTransaction(tx, reviewedTask);
          updated = await tx.imageTask.findUnique({ where: { id } });
        } else {
          updated = await tx.imageTask.update({ where: { id }, data });
        }
        if (assignmentType && assignedAt && dto.designerId !== undefined) {
          await this.createAssignmentAudit(tx, imageTask, Number(dto.designerId), userId, assignedAt, assignmentType);
          await this.weeklyPlans.addAssignedTasksInTransaction(tx, [imageTask], Number(dto.designerId), userId, assignedAt, assignmentType, dto.weekStart);
        }
        if (data.status === "APPROVED" && approvedAt) {
          await this.weeklyPlans.completeApprovedImageTaskInTransaction(tx, id, userId, approvedAt);
        }
        const parentStatus = data.status === "APPROVED" || data.status === "REVISION_REQUIRED"
          ? await this.workflowEngine.recalcTaskDesignStatusInTransaction(tx, imageTask.taskId)
          : null;
        return { updated, parentStatus };
      });
      if (dto.designerId && dto.designerId !== imageTask.designerId) {
        await this.eventBus.publish("image_task.assigned", new ImageTaskAssigned(id, imageTask.taskId, dto.designerId, userId));
      }
      if (dto.designerId !== undefined && dto.designerId !== imageTask.designerId) {
        await this.workflowEngine.recalcTaskStatus(imageTask.taskId);
      }
      if (data.status && data.status !== imageTask.status) {
        await this.log.log({ userId, action: "update_image_task_status", targetType: "image_task", targetId: id, content: `Image task status changed: ${imageTask.status} -> ${data.status}` });
        const event = data.status === "APPROVED"
          ? new ImageTaskReviewApproved(id, imageTask.taskId, userId, imageTask.designerId, imageTask.imageTitle || undefined, reviewedAttachmentId ?? undefined)
          : new ImageTaskReviewRejected(id, imageTask.taskId, userId, imageTask.designerId, data.reviewRemark, imageTask.imageTitle || undefined, reviewedAttachmentId ?? undefined);
        await this.eventBus.publish(event.name, event);
      }
      if (reviewResult.parentStatus?.enteredDesignApproved) {
        const event = new WorkflowCompleted(imageTask.taskId, reviewResult.parentStatus.serialNumber, userId);
        await this.eventBus.publish(event.name, event);
      }
      return reviewResult.updated;
    }

    if (["OPERATION", "OWNER", "SUPER_ADMIN"].includes(userRole)) {
      if (userRole === "OPERATION") {
        if (imageTask.task.creatorId !== userId) throw new ForbiddenException("Only the creator can edit this image task");
        if (!EDITABLE_TASK_STATUS.includes(imageTask.task.workflowStatus)) {
          throw new ForbiddenException("Image task details can only be edited while the task is draft or rejected");
        }
      }
      const { weekStart: _weekStart, ...imageTaskData } = dto;
      const result = await this.prisma.$transaction(async (tx: any) => {
        const updated = await tx.imageTask.update({ where: { id }, data: imageTaskData });
        await this.operationsApprovalPlans.refreshPendingDecreeSnapshotInTransaction(tx, imageTask.taskId, userId, "image_task_updated");
        return updated;
      });
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
    await this.prisma.$transaction(async (tx: any) => {
      await tx.imageTask.delete({ where: { id } });
      await this.operationsApprovalPlans.refreshPendingDecreeSnapshotInTransaction(tx, imageTask.taskId, userId, "image_task_deleted");
    });
    await this.log.log({
      userId,
      action: "delete_image_task",
      targetType: "image_task",
      targetId: id,
      content: `Delete image task: ${imageTask.imageTitle || `#${imageTask.imageIndex}`}`,
    });
  }
}
