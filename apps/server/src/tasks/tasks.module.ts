import { Module } from "@nestjs/common";
import { TasksService } from "./tasks.service";
import { TasksController } from "./tasks.controller";
import { OperationLogModule } from "../operation-log/operation-log.module";
import { WorkflowEngineModule } from "../workflow-engine/workflow-engine.module";
import { TaskVisibilityService } from "../common/task-visibility.service";
import { WeeklyPlansModule } from "../weekly-plans/weekly-plans.module";

@Module({
  imports: [OperationLogModule, WorkflowEngineModule, WeeklyPlansModule],
  controllers: [TasksController],
  providers: [TasksService, TaskVisibilityService],
})
export class TasksModule {}
