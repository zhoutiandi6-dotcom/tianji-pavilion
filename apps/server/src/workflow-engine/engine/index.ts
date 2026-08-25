import { BadRequestException, ConflictException, ForbiddenException, Injectable, NotFoundException } from "@nestjs/common";
import { PrismaService } from "../../common/prisma.service";
import { EventBus } from "../../event-bus/event-bus";
import { OperationLogService } from "../../operation-log/operation-log.service";
import { StateMachine, TASK_WORKFLOW_STATUS } from "../state-machine";
import {
  WorkflowApproved, WorkflowCompleted, WorkflowCreated, WorkflowRejected,
  WorkflowSubmitted, WorkflowWithdrawn,
} from "../../domain-events";
import { SUBMISSION_RESULT, SUBMISSION_TYPE } from "../submission-audit";
import { WeeklyOperationsApprovalPlansService } from "../../weekly-plans/weekly-operations-approval-plans.service";

export interface WorkflowActionResult {
  task: any;
  event?: InstanceType<any>;
}

export type TaskDesignStatusRecalculation = {
  previousStatus: string;
  nextStatus: string;
  enteredDesignApproved: boolean;
  serialNumber: string;
};

type RejectTaskInput = {
  comment?: string;
  issueImageTaskIds?: number[];
  issueTypes?: string[];
};

const APPROVAL_CONFLICT_MESSAGE = "该法旨已被其他人员处理，请刷新后查看最新状态。";

@Injectable()
export class WorkflowEngine {
  constructor(
    private prisma: PrismaService,
    private eventBus: EventBus,
    private logService: OperationLogService,
    private operationsApprovalPlans: WeeklyOperationsApprovalPlansService,
  ) {}

  private async getTask(taskId: number) {
    const task = await this.prisma.task.findUnique({ where: { id: taskId } });
    if (!task) throw new NotFoundException("法旨不存在");
    return task;
  }

  private findLatestSubmission(tx: any, taskId: number, result: string) {
    return tx.taskSubmissionRecord.findFirst({
      where: { taskId, result },
      orderBy: { submissionSequence: "desc" },
    });
  }

  private async ensurePendingSubmission(tx: any, task: any) {
    const existing = await this.findLatestSubmission(tx, task.id, SUBMISSION_RESULT.PENDING);
    if (existing) return { submission: existing, legacyRecovered: false };

    const sequence = await tx.taskSubmissionRecord.aggregate({
      where: { taskId: task.id },
      _max: { submissionSequence: true },
    });
    const submission = await tx.taskSubmissionRecord.create({
      data: {
        taskId: task.id,
        submitterId: task.creatorId,
        submittedAt: task.submittedAt || task.createdAt,
        submissionType: SUBMISSION_TYPE.INITIAL,
        submissionSequence: (sequence._max.submissionSequence ?? 0) + 1,
        result: SUBMISSION_RESULT.PENDING,
      },
    });
    return { submission, legacyRecovered: true };
  }

  private hasText(value?: string | null) {
    return Boolean(value && value.trim());
  }

  private submissionValidationIssues(task: any) {
    const issues: string[] = [];
    const mainFields: Array<[unknown, string]> = [
      [task.storeId, "法旨缺少店铺"],
      [task.requesterName, "法旨缺少运营需求人"],
      [task.compatibleProduct, "法旨缺少适配产品"],
      [task.productCode, "法旨缺少产品编号"],
      [task.requirementTypeId, "法旨缺少需求类型"],
    ];
    for (const [value, message] of mainFields) {
      if (typeof value === "string" ? !this.hasText(value) : !value) issues.push(message);
    }
    if (!task.imageCount || task.imageCount <= 0) issues.push("法旨图片任务数量必须大于 0");

    const activeImages = (task.imageTasks || []).filter((image: any) => image.deletedAt === null && image.status !== "CANCELLED");
    if (!activeImages.length) {
      issues.push("法旨至少需要一条有效图片任务");
      return issues;
    }

    const taskHasAttachment = (task.attachments || []).some((attachment: any) => !attachment.deletedAt);
    activeImages.forEach((image: any, index: number) => {
      const imageLabel = `第${image.imageIndex || index + 1}张图片`;
      if (!this.hasText(image.imageTitle) && !this.hasText(image.imageType)) {
        issues.push(`${imageLabel}缺少图片名称或图片类型`);
      }
      if (!this.hasText(image.requirement)) issues.push(`${imageLabel}缺少需求描述`);
      const hasImageAttachment = (image.attachments || []).some((attachment: any) => !attachment.deletedAt);
      if (!this.hasText(image.originalImageUrl) && !this.hasText(image.referenceImageUrl) && !hasImageAttachment && !taskHasAttachment) {
        issues.push(`${imageLabel}未提供原图、参考图或附件`);
      }
    });
    return issues;
  }

  private assertSubmissionComplete(task: any) {
    const issues = this.submissionValidationIssues(task);
    if (issues.length) throw new BadRequestException(issues);
  }

  async publishCreated(taskId: number, creatorId: number, serialNumber: string): Promise<WorkflowActionResult> {
    const event = new WorkflowCreated(taskId, creatorId, serialNumber);
    await this.eventBus.publish(event.name, event);
    return { task: null, event };
  }

  async submit(taskId: number, userId: number, userRole: string): Promise<WorkflowActionResult> {
    if (!["OPERATION", "OWNER", "SUPER_ADMIN"].includes(userRole)) {
      throw new ForbiddenException("只有运营可以提交审批");
    }
    const task = await this.prisma.task.findUnique({
      where: { id: taskId },
      include: {
        attachments: { where: { deletedAt: null }, select: { id: true, deletedAt: true } },
        imageTasks: {
          where: { deletedAt: null },
          include: { attachments: { where: { deletedAt: null }, select: { id: true, deletedAt: true } } },
          orderBy: { imageIndex: "asc" },
        },
      },
    });
    if (!task || task.deletedAt) throw new NotFoundException("法旨不存在");
    if (task.creatorId !== userId && userRole === "OPERATION") {
      throw new ForbiddenException("只能提交自己的法旨");
    }
    if (!StateMachine.canTransition(task.workflowStatus, TASK_WORKFLOW_STATUS.SUBMITTED, "task")) {
      throw new BadRequestException(`非法状态转换: ${task.workflowStatus} -> ${TASK_WORKFLOW_STATUS.SUBMITTED}`);
    }
    this.assertSubmissionComplete(task);
    const submittedAt = new Date();
    const submissionType = task.workflowStatus === TASK_WORKFLOW_STATUS.OPS_REJECTED
      ? SUBMISSION_TYPE.RESUBMIT
      : SUBMISSION_TYPE.INITIAL;
    const updated = await this.prisma.$transaction(async (tx: any) => {
      const stateUpdated = await tx.task.updateMany({
        where: { id: taskId, workflowStatus: task.workflowStatus, deletedAt: null },
        data: { workflowStatus: TASK_WORKFLOW_STATUS.SUBMITTED, submittedAt },
      });
      if (stateUpdated.count !== 1) throw new ConflictException(APPROVAL_CONFLICT_MESSAGE);
      const sequence = await tx.taskSubmissionRecord.aggregate({
        where: { taskId },
        _max: { submissionSequence: true },
      });
      await tx.taskSubmissionRecord.create({
        data: {
          taskId,
          submitterId: userId,
          submittedAt,
          submissionType,
          submissionSequence: (sequence._max.submissionSequence ?? 0) + 1,
          result: SUBMISSION_RESULT.PENDING,
        },
      });
      await tx.imageTask.updateMany({
        where: { taskId, deletedAt: null },
        data: { status: "WAITING_OPS_APPROVAL" },
      });
      return tx.task.findUnique({ where: { id: taskId } });
    });
    const event = new WorkflowSubmitted(taskId, userId, task.serialNumber);
    await this.recordLog(userId, "submit_ops_approval", "task", taskId, `提交运营主管审批: ${task.serialNumber}`);
    await this.eventBus.publish(event.name, event);
    return { task: updated, event };
  }

  async withdraw(taskId: number, userId: number, userRole: string): Promise<WorkflowActionResult> {
    if (!["OPERATION", "OWNER", "SUPER_ADMIN"].includes(userRole)) {
      throw new ForbiddenException("只有运营可以撤回");
    }
    const task = await this.getTask(taskId);
    if (task.workflowStatus !== TASK_WORKFLOW_STATUS.SUBMITTED) {
      throw new ForbiddenException("只能撤回待运营主管审批的法旨");
    }
    if (task.creatorId !== userId && userRole === "OPERATION") {
      throw new ForbiddenException("只能撤回自己的法旨");
    }
    const withdrawnAt = new Date();
    const updated = await this.prisma.$transaction(async (tx: any) => {
      const submission = await this.findLatestSubmission(tx, taskId, SUBMISSION_RESULT.PENDING);
      if (submission) {
        await tx.taskSubmissionRecord.update({
          where: { id: submission.id },
          data: {
            withdrawnAt,
            withdrawnById: userId,
            result: SUBMISSION_RESULT.WITHDRAWN,
          },
        });
      }
      return tx.task.update({
        where: { id: taskId },
        data: { workflowStatus: TASK_WORKFLOW_STATUS.DRAFT },
      });
    });
    const event = new WorkflowWithdrawn(taskId, userId, task.serialNumber);
    await this.recordLog(userId, "withdraw_ops_approval", "task", taskId, `撤回运营主管审批: ${task.serialNumber}`);
    await this.eventBus.publish(event.name, event);
    return { task: updated, event };
  }

  async approve(taskId: number, userId: number, userRole: string, comment?: string): Promise<WorkflowActionResult> {
    if (!["OPERATION_MANAGER", "OWNER", "SUPER_ADMIN"].includes(userRole)) {
      throw new ForbiddenException("只有运营主管可以审批");
    }
    const task = await this.getTask(taskId);
    if (!StateMachine.canTransition(task.workflowStatus, TASK_WORKFLOW_STATUS.OPS_APPROVED, "task")) {
      throw new BadRequestException(`非法状态转换: ${task.workflowStatus} -> ${TASK_WORKFLOW_STATUS.OPS_APPROVED}`);
    }

    const processedAt = new Date();
    const updated = await this.prisma.$transaction(async (tx: any) => {
      const activeImageCount = await tx.imageTask.count({ where: { taskId, deletedAt: null, status: { not: "CANCELLED" } } });
      if (!activeImageCount) throw new BadRequestException("法旨不存在有效图片任务，无法审批放行");
      const autoPlan = await this.operationsApprovalPlans.ensureAutoAddedInTransaction(tx, taskId, userId, processedAt);
      const stateUpdated = await tx.task.updateMany({
        where: { id: taskId, workflowStatus: TASK_WORKFLOW_STATUS.SUBMITTED, deletedAt: null },
        data: {
          workflowStatus: TASK_WORKFLOW_STATUS.OPS_APPROVED,
          approverId: userId,
          approvalComment: comment?.trim() || null,
          approvedAt: processedAt.toISOString(),
        },
      });
      if (stateUpdated.count !== 1) throw new ConflictException(APPROVAL_CONFLICT_MESSAGE);
      const approvalRecord = await tx.approvalRecord.create({ data: { taskId, approverId: userId, action: "OPS_APPROVED", comment } });
      const { submission, legacyRecovered } = await this.ensurePendingSubmission(tx, task);
      await tx.taskSubmissionRecord.update({
        where: { id: submission.id },
        data: {
          processedAt,
          processedById: userId,
          result: SUBMISSION_RESULT.APPROVED,
          approvalRecordId: approvalRecord.id,
        },
      });
      await tx.imageTask.updateMany({
        where: { taskId, deletedAt: null, status: "WAITING_OPS_APPROVAL" },
        data: { status: "PENDING_ASSIGNMENT" },
      });
      await tx.auditEvent.create({
        data: {
          resourceType: "task",
          resourceId: taskId,
          action: "ops_approval_approved",
          operatorId: userId,
          correlationId: `task_${taskId}`,
          metadata: JSON.stringify({ approvalRecordId: approvalRecord.id, effectiveImageCount: activeImageCount, processedAt, legacySubmissionRecovered: legacyRecovered, autoPlan }),
        },
      });
      return tx.task.findUnique({ where: { id: taskId } });
    });

    const event = new WorkflowApproved(taskId, userId, task.serialNumber, comment);
    await this.recordLog(userId, "ops_approve_task", "task", taskId, `运营主管审批通过: ${task.serialNumber}`);
    await this.eventBus.publish(event.name, event);
    return { task: updated, event };
  }

  async reject(taskId: number, userId: number, userRole: string, comment?: string, input: RejectTaskInput = {}): Promise<WorkflowActionResult> {
    if (!["OPERATION_MANAGER", "OWNER", "SUPER_ADMIN"].includes(userRole)) {
      throw new ForbiddenException("只有运营主管可以驳回");
    }
    if (!comment?.trim()) throw new BadRequestException("请填写退回原因");
    const task = await this.getTask(taskId);
    if (!StateMachine.canTransition(task.workflowStatus, TASK_WORKFLOW_STATUS.OPS_REJECTED, "task")) {
      throw new BadRequestException(`非法状态转换: ${task.workflowStatus} -> ${TASK_WORKFLOW_STATUS.OPS_REJECTED}`);
    }

    const processedAt = new Date();
    const updated = await this.prisma.$transaction(async (tx: any) => {
      const issueImageTaskIds = Array.from(new Set((input.issueImageTaskIds || []).map(Number).filter(Boolean)));
      if (issueImageTaskIds.length) {
        const issueImageCount = await tx.imageTask.count({ where: { id: { in: issueImageTaskIds }, taskId, deletedAt: null } });
        if (issueImageCount !== issueImageTaskIds.length) {
          throw new BadRequestException("问题图片中包含不属于当前法旨或已删除的图片任务");
        }
      }
      const stateUpdated = await tx.task.updateMany({
        where: { id: taskId, workflowStatus: TASK_WORKFLOW_STATUS.SUBMITTED, deletedAt: null },
        data: { workflowStatus: TASK_WORKFLOW_STATUS.OPS_REJECTED, approverId: userId, approvalComment: comment.trim() },
      });
      if (stateUpdated.count !== 1) throw new ConflictException(APPROVAL_CONFLICT_MESSAGE);
      const approvalRecord = await tx.approvalRecord.create({ data: { taskId, approverId: userId, action: "OPS_REJECTED", comment: comment.trim() } });
      const { submission, legacyRecovered } = await this.ensurePendingSubmission(tx, task);
      await tx.taskSubmissionRecord.update({
        where: { id: submission.id },
        data: {
          processedAt,
          processedById: userId,
          result: SUBMISSION_RESULT.REJECTED,
          approvalRecordId: approvalRecord.id,
        },
      });
      await tx.auditEvent.create({
        data: {
          resourceType: "task",
          resourceId: taskId,
          action: "ops_approval_rejected",
          operatorId: userId,
          correlationId: `task_${taskId}`,
          metadata: JSON.stringify({ approvalRecordId: approvalRecord.id, issueImageTaskIds, issueTypes: input.issueTypes || [], reason: comment.trim(), processedAt, legacySubmissionRecovered: legacyRecovered }),
        },
      });
      return tx.task.findUnique({ where: { id: taskId } });
    });

    const event = new WorkflowRejected(taskId, userId, task.serialNumber, comment.trim());
    await this.recordLog(userId, "ops_reject_task", "task", taskId, `运营主管退回: ${task.serialNumber}`);
    await this.eventBus.publish(event.name, event);
    return { task: updated, event };
  }

  async rollbackApproval(taskId: number, userId: number, userRole: string): Promise<WorkflowActionResult> {
    if (!["OPERATION_MANAGER", "OWNER", "SUPER_ADMIN"].includes(userRole)) {
      throw new ForbiddenException("当前账号无权限回退审批");
    }
    const task = await this.prisma.task.findUnique({
      where: { id: taskId },
      include: { imageTasks: { select: { id: true, status: true, designerId: true } } },
    });
    if (!task) throw new NotFoundException("法旨不存在");
    if (task.workflowStatus !== TASK_WORKFLOW_STATUS.OPS_APPROVED) {
      throw new ForbiddenException("当前法旨已进入后续流程，不能在列表中回退审批，请进入详情页处理。");
    }
    const canRollback = task.imageTasks.every((item: any) => item.status === "PENDING_ASSIGNMENT" && !item.designerId);
    if (!canRollback) {
      throw new ForbiddenException("当前法旨已进入后续流程，不能在列表中回退审批，请进入详情页处理。");
    }
    const updated = await this.prisma.$transaction(async (tx: any) => {
      await tx.approvalRecord.create({ data: { taskId, approverId: userId, action: "OPS_APPROVAL_ROLLBACK", comment: "rollback approval from list" } });
      const submission = await this.findLatestSubmission(tx, taskId, SUBMISSION_RESULT.APPROVED);
      if (submission) {
        await tx.taskSubmissionRecord.update({
          where: { id: submission.id },
          data: {
            processedAt: null,
            processedById: null,
            result: SUBMISSION_RESULT.PENDING,
            approvalRecordId: null,
          },
        });
      }
      await tx.imageTask.updateMany({
        where: { taskId, status: "PENDING_ASSIGNMENT" },
        data: { status: "WAITING_OPS_APPROVAL" },
      });
      return tx.task.update({
        where: { id: taskId },
        data: { workflowStatus: TASK_WORKFLOW_STATUS.SUBMITTED, approverId: null, approvalComment: null, approvedAt: null },
      });
    });
    await this.recordLog(userId, "ops_approval_rollback", "task", taskId, `运营主管审批回退: ${task.serialNumber}`);
    return { task: updated };
  }

  async recalcTaskStatus(taskId: number): Promise<string> {
    const result = await this.prisma.$transaction((tx: any) => this.recalcTaskDesignStatusInTransaction(tx, taskId));
    if (result.enteredDesignApproved) {
      const event = new WorkflowCompleted(taskId, result.serialNumber);
      await this.eventBus.publish(event.name, event);
    }
    if (result.previousStatus !== result.nextStatus) {
      await this.recordLog(0, "update_task_status", "task", taskId, `Task status changed: ${result.previousStatus} -> ${result.nextStatus}`);
    }
    return result.nextStatus;
  }

  async recalcTaskDesignStatusInTransaction(tx: any, taskId: number): Promise<TaskDesignStatusRecalculation> {
    const [imageTasks, task] = await Promise.all([
      tx.imageTask.findMany({ where: { taskId, deletedAt: null }, select: { status: true } }),
      tx.task.findUnique({ where: { id: taskId }, select: { workflowStatus: true, serialNumber: true } }),
    ]);
    if (!task) throw new NotFoundException("Task not found");
    const computedStatus = StateMachine.calcTaskWorkflowStatus(imageTasks.map((item: any) => item.status));
    const previousStatus = task.workflowStatus;
    const canRecalculate = [TASK_WORKFLOW_STATUS.OPS_APPROVED, TASK_WORKFLOW_STATUS.DESIGN_ASSIGNED, TASK_WORKFLOW_STATUS.IN_DESIGN, TASK_WORKFLOW_STATUS.DESIGN_REVIEW, TASK_WORKFLOW_STATUS.DESIGN_APPROVED].includes(previousStatus as any);
    if (!canRecalculate || previousStatus === computedStatus) {
      return { previousStatus, nextStatus: computedStatus, enteredDesignApproved: false, serialNumber: task.serialNumber };
    }
    const transition = await tx.task.updateMany({
      where: { id: taskId, workflowStatus: previousStatus, deletedAt: null },
      data: { workflowStatus: computedStatus },
    });
    if (transition.count !== 1) {
      const current = await tx.task.findUnique({ where: { id: taskId }, select: { workflowStatus: true, serialNumber: true } });
      if (!current) throw new NotFoundException("Task not found");
      return { previousStatus: current.workflowStatus, nextStatus: current.workflowStatus, enteredDesignApproved: false, serialNumber: current.serialNumber };
    }
    return {
      previousStatus,
      nextStatus: computedStatus,
      enteredDesignApproved: previousStatus !== TASK_WORKFLOW_STATUS.DESIGN_APPROVED && computedStatus === TASK_WORKFLOW_STATUS.DESIGN_APPROVED,
      serialNumber: task.serialNumber,
    };
  }

  async recalcTaskStatusInTransaction(tx: any, taskId: number): Promise<string> {
    return (await this.recalcTaskDesignStatusInTransaction(tx, taskId)).nextStatus;
  }

  private async recordLog(userId: number, action: string, targetType: string, targetId: number, content?: string) {
    return this.logService.log({ userId, action, targetType, targetId, content });
  }
}
