import { Module } from "@nestjs/common";
import { OperationLogModule } from "../operation-log/operation-log.module";
import { EventBusModule } from "../event-bus/event-bus.module";
import { WorkflowEngineModule } from "../workflow-engine/workflow-engine.module";
import { WeeklyPlansModule } from "../weekly-plans/weekly-plans.module";
import { ImageTasksService } from "./image-tasks.service";
import { ImageTasksController } from "./image-tasks.controller";
import { TaskVisibilityService } from "../common/task-visibility.service";

@Module({
  imports: [OperationLogModule, EventBusModule, WorkflowEngineModule, WeeklyPlansModule],
  controllers: [ImageTasksController],
  providers: [ImageTasksService, TaskVisibilityService],
})
export class ImageTasksModule {}
