import { Module } from "@nestjs/common";
import { WorkflowEngine } from "./engine";
import { WorkflowActions } from "./actions";
import { OperationLogModule } from "../operation-log/operation-log.module";

@Module({
  imports: [OperationLogModule],
  providers: [WorkflowEngine, WorkflowActions],
  exports: [WorkflowEngine, WorkflowActions],
})
export class WorkflowEngineModule {}
