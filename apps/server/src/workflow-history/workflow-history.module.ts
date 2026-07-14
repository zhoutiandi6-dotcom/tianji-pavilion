import { Module } from "@nestjs/common";
import { WorkflowHistoryService } from "./workflow-history.service";

@Module({
  providers: [WorkflowHistoryService],
  exports: [WorkflowHistoryService],
})
export class WorkflowHistoryModule {}
