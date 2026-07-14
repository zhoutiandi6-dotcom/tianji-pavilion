import { Module } from "@nestjs/common";
import { WorkflowNotificationService } from "./workflow-notification.service";

@Module({
  providers: [WorkflowNotificationService],
})
export class WorkflowNotificationModule {}
