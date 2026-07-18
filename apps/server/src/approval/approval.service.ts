import { ForbiddenException, Injectable, NotFoundException } from "@nestjs/common";
import { PrismaService } from "../common/prisma.service";
import { TaskVisibilityService } from "../common/task-visibility.service";
import { WorkflowActions } from "../workflow-engine/actions";
import { RejectTaskDto } from "./dto/reject-task.dto";

@Injectable()
export class ApprovalService {
  constructor(
    private actions: WorkflowActions,
    private prisma: PrismaService,
    private visibility: TaskVisibilityService,
  ) {}

  async submit(taskId: number, userId: number, userRole: string) {
    return this.actions.submit(taskId, userId, userRole);
  }

  async withdraw(taskId: number, userId: number, userRole: string) {
    return this.actions.withdraw(taskId, userId, userRole);
  }

  async approve(taskId: number, userId: number, userRole: string, comment?: string) {
    return this.actions.approve(taskId, userId, userRole, comment);
  }

  async reject(taskId: number, userId: number, userRole: string, dto: RejectTaskDto) {
    return this.actions.reject(taskId, userId, userRole, dto);
  }

  async rollback(taskId: number, userId: number, userRole: string) {
    return this.actions.rollbackApproval(taskId, userId, userRole);
  }

  async records(taskId: number, userRole: string, userId: number) {
    const task = await this.prisma.task.findFirst({
      where: { id: taskId, deletedAt: null },
      select: { id: true },
    });
    if (!task) throw new NotFoundException("法旨不存在");

    const visibleTask = await this.prisma.task.findFirst({
      where: { AND: [{ id: taskId }, this.visibility.visibleWhere(userRole, userId)] },
      select: { id: true },
    });
    if (!visibleTask) throw new ForbiddenException("无权查看该法旨的审批记录");

    return this.prisma.approvalRecord.findMany({
      where: { taskId },
      include: { approver: { select: { id: true, username: true, displayName: true } } },
      orderBy: { createdAt: "desc" },
    });
  }
}
