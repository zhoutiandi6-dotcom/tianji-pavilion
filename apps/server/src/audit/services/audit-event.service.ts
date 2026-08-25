import { Injectable, Logger } from "@nestjs/common";
import { PrismaService } from "../../common/prisma.service";
import { EventBus } from "../../event-bus/event-bus";

@Injectable()
export class AuditEventService {
  private readonly logger = new Logger(AuditEventService.name);

  constructor(
    private prisma: PrismaService,
    private eventBus: EventBus,
  ) {
    this.subscribe();
  }

  private subscribe() {
    const events = [
      "workflow.created", "workflow.submitted", "workflow.withdrawn",
      "workflow.approved", "workflow.rejected", "workflow.completed", "workflow.archived",
      "image_task.started", "image_task.submitted_for_review",
      "image_task.review_approved", "image_task.review_rejected", "image_task.assigned",
      "task.updated",
    ];
    for (const evt of events) {
      this.eventBus.subscribe(evt, this.onEvent.bind(this));
    }
    this.logger.log(`AuditEvent subscribed to ${events.length} events`);
  }

  private resolveOperatorId(event: any): number | null {
    // Review decisions carry both the reviewer and the assigned designer. The
    // reviewer is the actor; a generic field-priority fallback is incorrect.
    if (event.name === "image_task.review_approved" || event.name === "image_task.review_rejected") {
      return event.reviewerId ?? null;
    }

    if (event.name === "image_task.submitted_for_review") {
      return event.designerId ?? null;
    }

    return event.userId || event.approverId || event.designerId || event.creatorId || event.reviewerId || null;
  }

  private async onEvent(event: any) {
    try {
      const actionMap: Record<string, string> = {
        "workflow.created": "create_task",
        "workflow.submitted": "submit_approval",
        "workflow.withdrawn": "withdraw_approval",
        "workflow.approved": "approve_task",
        "workflow.rejected": "reject_task",
        "workflow.completed": "complete_task",
        "workflow.archived": "archive_task",
        "image_task.started": "start_making",
        "image_task.submitted_for_review": "submit_review",
        "image_task.review_approved": "review_approve",
        "image_task.review_rejected": "review_reject",
        "image_task.assigned": "assign_designer",
        "task.updated": "edit_task",
      };

      const action = actionMap[event.name] || event.name;
      const resourceType = event.imageTaskId ? "image_task" : "task";
      const resourceId = event.imageTaskId || event.taskId;

      await this.prisma.auditEvent.create({
        data: {
          resourceType,
          resourceId,
          action,
          correlationId: event.taskId ? 'task_' + event.taskId : event.imageTaskId ? 'img_' + event.imageTaskId : null,
          operatorId: this.resolveOperatorId(event),
          metadata: JSON.stringify(event),
        },
      });
    } catch (e: any) {
      this.logger.error(`AuditEvent failed for ${event.name}: ${e.message}`);
    }
  }

  async findAll(page = 1, pageSize = 50) {
    pageSize = Math.min(pageSize, 200);
    const skip = (page - 1) * pageSize;
    const [items, total] = await Promise.all([
      this.prisma.auditEvent.findMany({
        orderBy: { createdAt: "desc" },
        skip, take: pageSize,
      }),
      this.prisma.auditEvent.count(),
    ]);
    return { items, total, page, pageSize };
  }

  async findByResource(resourceType: string, resourceId: number) {
    return this.prisma.auditEvent.findMany({
      where: { resourceType, resourceId },
      orderBy: { createdAt: "asc" },
    });
  }
}



