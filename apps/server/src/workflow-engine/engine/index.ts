import { BadRequestException, ForbiddenException, Injectable, NotFoundException } from "@nestjs/common";
import { PrismaService } from "../../common/prisma.service";
import { EventBus } from "../../event-bus/event-bus";
import { OperationLogService } from "../../operation-log/operation-log.service";
import { StateMachine, TASK_WORKFLOW_STATUS } from "../state-machine";
import {
  WorkflowApproved, WorkflowCompleted, WorkflowCreated, WorkflowRejected,
  WorkflowSubmitted, WorkflowWithdrawn,
} from "../../domain-events";

export interface WorkflowActionResult {
  task: any;
  event?: InstanceType<any>;
}

@Injectable()
export class WorkflowEngine {
  constructor(
    private prisma: PrismaService,
    private eventBus: EventBus,
    private logService: OperationLogService,
  ) {}

  private async getTask(taskId: number) {
    const task = await this.prisma.task.findUnique({ where: { id: taskId } });
    if (!task) throw new NotFoundException("法旨不存在");
    return task;
  }

  private async transition(taskId: number, currentStatus: string, nextStatus: string) {
    if (!StateMachine.canTransition(currentStatus, nextStatus, "task")) {
      throw new BadRequestException(`非法状态转换: ${currentStatus} -> ${nextStatus}`);
    }
    return this.prisma.task.update({ where: { id: taskId }, data: { workflowStatus: nextStatus } });
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
    const task = await this.getTask(taskId);
    if (task.creatorId !== userId && userRole === "OPERATION") {
      throw new ForbiddenException("只能提交自己的法旨");
    }
    if (!StateMachine.canTransition(task.workflowStatus, TASK_WORKFLOW_STATUS.SUBMITTED, "task")) {
      throw new BadRequestException(`非法状态转换: ${task.workflowStatus} -> ${TASK_WORKFLOW_STATUS.SUBMITTED}`);
    }
    const updated = await this.prisma.$transaction(async (tx: any) => {
      await tx.imageTask.updateMany({
        where: { taskId },
        data: { status: "WAITING_OPS_APPROVAL" },
      });
      return tx.task.update({ where: { id: taskId }, data: { workflowStatus: TASK_WORKFLOW_STATUS.SUBMITTED } });
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
    const updated = await this.transition(taskId, task.workflowStatus, TASK_WORKFLOW_STATUS.DRAFT);
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

    const updated = await this.prisma.$transaction(async (tx: any) => {
      await tx.approvalRecord.create({ data: { taskId, approverId: userId, action: "OPS_APPROVED", comment } });
      await tx.imageTask.updateMany({
        where: { taskId, status: "WAITING_OPS_APPROVAL" },
        data: { status: "PENDING_ASSIGNMENT" },
      });
      return tx.task.update({
        where: { id: taskId },
        data: {
          workflowStatus: TASK_WORKFLOW_STATUS.OPS_APPROVED,
          approverId: userId,
          approvalComment: comment,
          approvedAt: new Date().toISOString(),
        },
      });
    });

    const event = new WorkflowApproved(taskId, userId, task.serialNumber, comment);
    await this.recordLog(userId, "ops_approve_task", "task", taskId, `运营主管审批通过: ${task.serialNumber}`);
    await this.eventBus.publish(event.name, event);
    return { task: updated, event };
  }

  async reject(taskId: number, userId: number, userRole: string, comment?: string): Promise<WorkflowActionResult> {
    if (!["OPERATION_MANAGER", "OWNER", "SUPER_ADMIN"].includes(userRole)) {
      throw new ForbiddenException("只有运营主管可以驳回");
    }
    if (!comment?.trim()) throw new BadRequestException("请填写退回原因");
    const task = await this.getTask(taskId);
    if (!StateMachine.canTransition(task.workflowStatus, TASK_WORKFLOW_STATUS.OPS_REJECTED, "task")) {
      throw new BadRequestException(`非法状态转换: ${task.workflowStatus} -> ${TASK_WORKFLOW_STATUS.OPS_REJECTED}`);
    }

    const updated = await this.prisma.$transaction(async (tx: any) => {
      await tx.approvalRecord.create({ data: { taskId, approverId: userId, action: "OPS_REJECTED", comment: comment.trim() } });
      return tx.task.update({
        where: { id: taskId },
        data: { workflowStatus: TASK_WORKFLOW_STATUS.OPS_REJECTED, approverId: userId, approvalComment: comment.trim() },
      });
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
    const imageTasks = await this.prisma.imageTask.findMany({ where: { taskId }, select: { status: true } });
    const computedStatus = StateMachine.calcTaskWorkflowStatus(imageTasks.map((t: any) => t.status));
    const task = await this.getTask(taskId);
    if ([TASK_WORKFLOW_STATUS.OPS_APPROVED, TASK_WORKFLOW_STATUS.DESIGN_ASSIGNED, TASK_WORKFLOW_STATUS.IN_DESIGN, TASK_WORKFLOW_STATUS.DESIGN_REVIEW, TASK_WORKFLOW_STATUS.DESIGN_APPROVED].includes(task.workflowStatus as any)) {
      if (task.workflowStatus !== computedStatus) {
        await this.prisma.task.update({ where: { id: taskId }, data: { workflowStatus: computedStatus } });
        await this.recordLog(0, "update_task_status", "task", taskId, `Task status changed: ${task.workflowStatus} -> ${computedStatus}`);
      }
      if (computedStatus === TASK_WORKFLOW_STATUS.DESIGN_APPROVED) {
        const event = new WorkflowCompleted(taskId, task.serialNumber);
        await this.eventBus.publish(event.name, event);
      }
    }
    return computedStatus;
  }

  private async recordLog(userId: number, action: string, targetType: string, targetId: number, content?: string) {
    return this.logService.log({ userId, action, targetType, targetId, content });
  }
}
