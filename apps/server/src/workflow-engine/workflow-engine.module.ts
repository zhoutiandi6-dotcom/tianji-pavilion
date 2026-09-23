import { Module } from "@nestjs/common";
import { WorkflowEngine } from "./engine";
import { WorkflowActions } from "./actions";
import { OperationLogModule } from "../operation-log/operation-log.module";
import { WeeklyPlansModule } from "../weekly-plans/weekly-plans.module";
import { OperationsOrganizationModule } from "../operations-organization/operations-organization.module";

@Module({
  imports: [OperationLogModule, WeeklyPlansModule, OperationsOrganizationModule],
  providers: [WorkflowEngine, WorkflowActions],
  exports: [WorkflowEngine, WorkflowActions],
})
export class WorkflowEngineModule {}
