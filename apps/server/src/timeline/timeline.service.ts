import { Injectable, NotFoundException } from "@nestjs/common";
import { PrismaService } from "../common/prisma.service";

@Injectable()
export class TimelineService {
  constructor(private prisma: PrismaService) {}

  private cleanDisplayText(value: any) {
    const text = value === undefined || value === null ? "" : String(value).trim();
    if (!text) return "";
    if (/^\?+$/.test(text)) return "";
    if (["undefined", "null"].includes(text.toLowerCase())) return "";
    return text;
  }

  private displayUserName(user: any, fallback = "未分配") {
    return this.cleanDisplayText(user?.displayName) || this.cleanDisplayText(user?.username) || fallback;
  }

  async getTaskTimeline(taskId: number) {
    const task = await this.prisma.task.findUnique({
      where: { id: taskId },
      select: { id: true, createdAt: true, serialNumber: true, creatorId: true },
    });
    if (!task) throw new NotFoundException("\u6cd5\u65e8\u4e0d\u5b58\u5728");

    const events: any[] = [];

    // Single authoritative source: WorkflowHistory
    // All workflow transitions (created, submitted, approved, rejected, etc.)
    // are recorded here automatically via Domain Events.
    const history = await this.prisma.workflowHistory.findMany({
      where: { workflowId: taskId },
      orderBy: { createdAt: "asc" },
    });

    // Collect operator IDs to resolve names in one query
    const operatorIds = new Set<number>();
    for (const h of history) {
      if (h.operatorId) operatorIds.add(h.operatorId);
    }
    // Also add creator
    if (task.creatorId) operatorIds.add(task.creatorId);

    // Batch resolve operator names
    const operators = await this.prisma.user.findMany({
      where: { id: { in: Array.from(operatorIds) } },
      select: { id: true, username: true, displayName: true },
    });
    const operatorName: Record<number, string> = {};
    for (const o of operators) {
      operatorName[o.id] = this.displayUserName(o, "系统");
    }

    for (const h of history) {
      events.push({
        id: h.id,
        time: h.createdAt,
        event: h.eventType,
        label: this.eventLabel(h.eventType),
        fromState: h.fromState,
        toState: h.toState,
        operator: h.operatorId ? (operatorName[h.operatorId] || "\u7cfb\u7edf") : "\u7cfb\u7edf",
        metadata: h.metadata ? JSON.parse(h.metadata) : null,
      });
    }

    // Image task creation events (not in WorkflowHistory)
    const imageTasks = await this.prisma.imageTask.findMany({
      where: { taskId },
      include: { designer: { select: { id: true, username: true, displayName: true } } },
      orderBy: { createdAt: "asc" },
    });

    for (const it of imageTasks) {
      events.push({
        id: 200000 + it.id,
        time: it.createdAt,
        event: "ImageTaskCreated",
        label: `\u65b0\u589e\u56fe\u7247\u4efb\u52a1: ${it.imageTitle}`,
        operator: this.displayUserName(it.designer),
        metadata: { imageTitle: it.imageTitle, designer: this.displayUserName(it.designer) },
      });
    }

    // Sort by time
    events.sort((a: any, b: any) => new Date(a.time).getTime() - new Date(b.time).getTime());

    return events.map((e: any) => ({
      ...e,
      time: new Date(e.time).toISOString(),
    }));
  }

  private eventLabel(eventType: string): string {
    const labels: Record<string, string> = {
      "workflow.created": "\u521b\u5efa\u6cd5\u65e8",
      "workflow.submitted": "\u63d0\u4ea4\u5ba1\u6279",
      "workflow.withdrawn": "\u64a4\u56de\u5ba1\u6279",
      "workflow.approved": "\u5ba1\u6279\u901a\u8fc7",
      "workflow.rejected": "\u5ba1\u6279\u9a73\u56de",
      "workflow.completed": "\u6cd5\u65e8\u5b8c\u6210",
      "workflow.archived": "\u6cd5\u65e8\u5f52\u6863",
      "image_task.started": "\u5f00\u59cb\u5236\u4f5c",
      "image_task.submitted_for_review": "\u63d0\u4ea4\u5ba1\u6838",
      "image_task.review_approved": "\u5ba1\u6838\u901a\u8fc7",
      "image_task.review_rejected": "\u9000\u56de\u4fee\u6539",
      "image_task.assigned": "\u5206\u914d\u8d1f\u8d23\u4eba",
      "task.updated": "\u7f16\u8f91\u6cd5\u65e8",
    };
    return labels[eventType] || eventType;
  }
}
