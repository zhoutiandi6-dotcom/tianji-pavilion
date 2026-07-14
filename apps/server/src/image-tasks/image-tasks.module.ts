import { Module } from "@nestjs/common";
import { OperationLogModule } from "../operation-log/operation-log.module";
import { EventBusModule } from "../event-bus/event-bus.module";
import { WorkflowEngineModule } from "../workflow-engine/workflow-engine.module";
import { ImageTasksService } from "./image-tasks.service";
import { ImageTasksController } from "./image-tasks.controller";

@Module({
  imports: [OperationLogModule, EventBusModule, WorkflowEngineModule],
  controllers: [ImageTasksController],
  providers: [ImageTasksService],
})
export class ImageTasksModule {}
