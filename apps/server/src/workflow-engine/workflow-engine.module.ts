import { Module } from "@nestjs/common";
import { WorkflowEngine } from "./engine";
import { WorkflowActions } from "./actions";
import { OperationLogModule } from "../operation-log/operation-log.module";
import { WeeklyPlansModule } from "../weekly-plans/weekly-plans.module";

@Module({
  imports: [OperationLogModule, WeeklyPlansModule],
  providers: [WorkflowEngine, WorkflowActions],
  exports: [WorkflowEngine, WorkflowActions],
})
export class WorkflowEngineModule {}
