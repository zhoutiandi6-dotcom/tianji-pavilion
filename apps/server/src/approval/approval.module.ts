import { Module } from "@nestjs/common";
import { ApprovalService } from "./approval.service";
import { ApprovalController } from "./approval.controller";
import { WorkflowEngineModule } from "../workflow-engine/workflow-engine.module";
import { PrismaModule } from "../common/prisma.module";

@Module({
  imports: [WorkflowEngineModule, PrismaModule],
  controllers: [ApprovalController],
  providers: [ApprovalService],
})
export class ApprovalModule {}
