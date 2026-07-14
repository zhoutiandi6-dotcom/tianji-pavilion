import { Injectable, Logger } from "@nestjs/common";
import { PrismaService } from "../common/prisma.service";
import { EventBus } from "../event-bus/event-bus";

@Injectable()
export class WorkflowHistoryService {
  private readonly logger = new Logger(WorkflowHistoryService.name);

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
    ];
    for (const evt of events) {
      this.eventBus.subscribe(evt, this.onEvent.bind(this));
    }
    this.logger.log(`WorkflowHistory subscribed to ${events.length} events`);
  }

  private async onEvent(event: any) {
    try {
      const taskId = event.taskId;
      const currentTask = await this.prisma.task.findUnique({ where: { id: taskId }, select: { workflowStatus: true } });
      await this.prisma.workflowHistory.create({
        data: {
          workflowId: taskId,
          eventType: event.name,
          fromState: currentTask?.workflowStatus || null,
          toState: event.name.replace("workflow.", "").toUpperCase(),
          operatorId: event.userId || event.approverId || event.designerId || event.creatorId || event.reviewerId || null,
          metadata: JSON.stringify(event),
        },
      });
    } catch (e: any) {
      this.logger.error(`WorkflowHistory failed for ${event.name}: ${e.message}`);
    }
  }

  async findByWorkflowId(workflowId: number) {
    return this.prisma.workflowHistory.findMany({
      where: { workflowId },
      orderBy: { createdAt: "asc" },
    });
  }
}
