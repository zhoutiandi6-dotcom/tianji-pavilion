import { ForbiddenException, Injectable, NotFoundException } from "@nestjs/common";
import { PrismaService } from "../common/prisma.service";
import { TaskVisibilityService } from "../common/task-visibility.service";

@Injectable()
export class TimelineService {
  constructor(
    private prisma: PrismaService,
    private visibility: TaskVisibilityService,
  ) {}

  async getTaskTimeline(taskId: number, userRole: string, userId: number) {
    const task = await this.prisma.task.findFirst({
      where: { id: taskId, deletedAt: null },
      select: { id: true, createdAt: true, serialNumber: true, creatorId: true },
    });
    if (!task) throw new NotFoundException("法旨不存在");

    const subject = await this.visibility.subjectForUser(userRole, userId);
    const visibleTask = await this.prisma.task.findFirst({
      where: { AND: [{ id: taskId }, this.visibility.buildTaskVisibilityWhere(subject)] },
      select: { id: true },
    });
    if (!visibleTask) throw new ForbiddenException("无权查看该法旨的流程记录");

    const history = await this.prisma.workflowHistory.findMany({
      where: { workflowId: taskId },
      orderBy: { createdAt: "asc" },
    });
    const imageTasks = await this.prisma.imageTask.findMany({
      where: {
        taskId,
        deletedAt: null,
        ...(userRole === "DESIGNER" ? { designerId: userId } : {}),
      },
      include: { designer: { select: { id: true, username: true, displayName: true } } },
      orderBy: { createdAt: "asc" },
    });
    const operatorIds = Array.from(new Set([
      task.creatorId,
      ...history.map((item: any) => item.operatorId).filter(Boolean),
    ]));
    const operators = await this.prisma.user.findMany({
      where: { id: { in: operatorIds } },
      select: { id: true, username: true, displayName: true },
    });
    const operatorNames = new Map(operators.map((user: any) => [user.id, this.displayUserName(user, "系统")]));

    const events: any[] = history.map((item: any) => ({
      id: item.id,
      time: item.createdAt,
      event: item.eventType,
      label: this.eventLabel(item.eventType),
      fromState: item.fromState,
      toState: item.toState,
      operator: item.operatorId ? operatorNames.get(item.operatorId) || "系统" : "系统",
      metadata: this.parseMetadata(item.metadata),
    }));

    for (const item of imageTasks) {
      events.push({
        id: 200000 + item.id,
        time: item.createdAt,
        event: "ImageTaskCreated",
        label: `新增图片任务：${item.imageTitle}`,
        operator: this.displayUserName(item.designer),
        metadata: { imageTitle: item.imageTitle, designer: this.displayUserName(item.designer) },
      });
    }

    events.sort((left, right) => new Date(left.time).getTime() - new Date(right.time).getTime());
    return events.map((event) => ({ ...event, time: new Date(event.time).toISOString() }));
  }

  private cleanDisplayText(value: any) {
    const text = value === undefined || value === null ? "" : String(value).trim();
    if (!text || /^\?+$/.test(text) || ["undefined", "null"].includes(text.toLowerCase())) return "";
    return text;
  }

  private displayUserName(user: any, fallback = "未分配") {
    return this.cleanDisplayText(user?.displayName) || this.cleanDisplayText(user?.username) || fallback;
  }

  private parseMetadata(value?: string | null) {
    if (!value) return null;
    try {
      return JSON.parse(value);
    } catch {
      return null;
    }
  }

  private eventLabel(eventType: string) {
    const labels: Record<string, string> = {
      "workflow.created": "创建法旨",
      "workflow.submitted": "提交审批",
      "workflow.withdrawn": "撤回审批",
      "workflow.approved": "审批通过",
      "workflow.rejected": "审批驳回",
      "workflow.completed": "法旨完成",
      "workflow.archived": "法旨归档",
      "image_task.started": "开始制作",
      "image_task.submitted_for_review": "提交审核",
      "image_task.review_approved": "审核通过",
      "image_task.review_rejected": "退回修改",
      "image_task.assigned": "分配负责人",
      "task.updated": "编辑法旨",
    };
    return labels[eventType] || eventType;
  }
}
