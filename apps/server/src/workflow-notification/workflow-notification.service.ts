import { Injectable, Logger, OnModuleInit } from "@nestjs/common";
import { EventBus } from "../event-bus/event-bus";
import { PrismaService } from "../common/prisma.service";

@Injectable()
export class WorkflowNotificationService implements OnModuleInit {
  private readonly logger = new Logger(WorkflowNotificationService.name);

  constructor(
    private eventBus: EventBus,
    private prisma: PrismaService,
  ) {}

  onModuleInit() {
    this.eventBus.subscribe("workflow.submitted", this.onSubmitted.bind(this));
    this.eventBus.subscribe("workflow.approved", this.onApproved.bind(this));
    this.eventBus.subscribe("workflow.rejected", this.onRejected.bind(this));
    this.eventBus.subscribe("image_task.assigned", this.onTaskAssigned.bind(this));
    this.eventBus.subscribe("image_task.review_approved", this.onReviewDone.bind(this));
    this.eventBus.subscribe("image_task.review_rejected", this.onReviewRejected.bind(this));
    this.eventBus.subscribe("workflow.completed", this.onCompleted.bind(this));
    this.logger.log("WorkflowNotification subscribed to 7 events");
  }

  private async onSubmitted(event: any) {
    try {
      const task = await this.prisma.task.findUnique({ where: { id: event.taskId }, select: { serialNumber: true } });
      if (!task) return;
      const managers = await this.prisma.user.findMany({
        where: { role: { name: "OPERATION_MANAGER" }, isActive: true },
        select: { id: true },
      });
      if (managers.length > 0) {
        await this.prisma.notification.createMany({
          data: managers.map((m: any) => ({
            senderId: event.userId, receiverId: m.id,
            title: "\u65b0\u6cd5\u65e8\u5f85\u5ba1\u6279",
            content: task.serialNumber + " \u5df2\u63d0\u4ea4\u5ba1\u6279",
            type: "workflow", taskId: event.taskId,
          })),
        });
      }
    } catch (e: any) { this.logger.error("onSubmitted: " + e.message); }
  }

  private async onApproved(event: any) {
    try {
      const task = await this.prisma.task.findUnique({ where: { id: event.taskId }, select: { serialNumber: true, creatorId: true } });
      if (!task) return;
      const imageTasks = await this.prisma.imageTask.findMany({
        where: { taskId: event.taskId, designerId: { not: null } },
        select: { id: true, designerId: true },
      });
      const notified = new Set<number>();
      const notificationData: any[] = [];
      for (const it of imageTasks) {
        if (it.designerId && !notified.has(it.designerId)) {
          notified.add(it.designerId);
          notificationData.push({
            senderId: 1, receiverId: it.designerId,
            title: "\u65b0\u4efb\u52a1\u6d3e\u53d1",
            content: task.serialNumber + " \u5ba1\u6279\u901a\u8fc7\uff0c\u8bf7\u5f00\u59cb\u5236\u4f5c",
            type: "workflow", taskId: event.taskId, imageTaskId: it.id,
          });
        }
      }
      notificationData.push({
        senderId: 1, receiverId: task.creatorId,
        title: "\u5ba1\u6279\u901a\u8fc7",
        content: task.serialNumber + " \u5df2\u5ba1\u6279\u901a\u8fc7",
        type: "workflow", taskId: event.taskId,
      });
      if (notificationData.length > 0) {
        await this.prisma.notification.createMany({ data: notificationData });
      }
    } catch (e: any) { this.logger.error("onApproved: " + e.message); }
  }

  private async onRejected(event: any) {
    try {
      const task = await this.prisma.task.findUnique({ where: { id: event.taskId }, select: { serialNumber: true, creatorId: true } });
      if (!task) return;
      await this.prisma.notification.create({
        data: { senderId: event.approverId, receiverId: task.creatorId, title: "法旨已退回", content: "你提交的法旨已被运营主管退回，请修改后重新提交。原因：" + event.comment, type: "workflow", taskId: event.taskId },
      });
    } catch (e: any) { this.logger.error("onRejected: " + e.message); }
  }

  private async onTaskAssigned(event: any) {
    try {
      const it = await this.prisma.imageTask.findUnique({ where: { id: event.imageTaskId }, select: { imageTitle: true } });
      if (!it) return;
      await this.prisma.notification.create({
        data: { senderId: 1, receiverId: event.designerId, title: "\u65b0\u56fe\u7247\u4efb\u52a1", content: "\u8bf7\u67e5\u770b " + it.imageTitle, type: "workflow", taskId: event.taskId, imageTaskId: event.imageTaskId },
      });
    } catch (e: any) { this.logger.error("onTaskAssigned: " + e.message); }
  }

  private async onReviewDone(event: any) {
    try {
      if (!event.designerId) return;
      await this.prisma.notification.create({
        data: { senderId: 1, receiverId: event.designerId, title: "\u5ba1\u6838\u901a\u8fc7", content: "\u5df2\u5ba1\u6838\u901a\u8fc7", type: "workflow", taskId: event.taskId, imageTaskId: event.imageTaskId },
      });
    } catch (e: any) { this.logger.error("onReviewDone: " + e.message); }
  }

  private async onReviewRejected(event: any) {
    try {
      if (!event.designerId) return;
      await this.prisma.notification.create({
        data: { senderId: event.reviewerId, receiverId: event.designerId, title: "完成稿已退回", content: "你提交的完成稿已被设计主管退回，请修改后重新提交审核。原因：" + event.remark, type: "workflow", taskId: event.taskId, imageTaskId: event.imageTaskId },
      });
    } catch (e: any) { this.logger.error("onReviewRejected: " + e.message); }
  }

  private async onCompleted(event: any) {
    try {
      const task = await this.prisma.task.findUnique({ where: { id: event.taskId }, select: { serialNumber: true, creatorId: true } });
      if (!task) return;
      const notificationData: any[] = [
        { senderId: 1, receiverId: task.creatorId, title: "\u6cd5\u65e8\u5b8c\u6210", content: task.serialNumber + " \u5df2\u5168\u90e8\u5b8c\u6210", type: "workflow", taskId: event.taskId },
      ];
      const managers = await this.prisma.user.findMany({
        where: { role: { name: "OPERATION_MANAGER" }, isActive: true },
        select: { id: true },
      });
      for (const m of managers) {
        notificationData.push({ senderId: 1, receiverId: m.id, title: "\u6cd5\u65e8\u5b8c\u6210", content: task.serialNumber + " \u5df2\u5168\u90e8\u5b8c\u6210", type: "workflow", taskId: event.taskId });
      }
      if (notificationData.length > 0) {
        await this.prisma.notification.createMany({ data: notificationData });
      }
    } catch (e: any) { this.logger.error("onCompleted: " + e.message); }
  }
}
