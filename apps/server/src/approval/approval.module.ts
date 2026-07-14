import { Module } from "@nestjs/common";
import { PrismaModule } from "../common/prisma.module";
import { TaskVisibilityService } from "../common/task-visibility.service";
import { WorkflowEngineModule } from "../workflow-engine/workflow-engine.module";
import { ApprovalController } from "./approval.controller";
import { ApprovalService } from "./approval.service";

@Module({
  imports: [WorkflowEngineModule, PrismaModule],
  controllers: [ApprovalController],
  providers: [ApprovalService, TaskVisibilityService],
})
export class ApprovalModule {}
