import { Module } from "@nestjs/common";
import { WeeklyPlansController } from "./weekly-plans.controller";
import { WeeklyPlansService } from "./weekly-plans.service";
import { WeeklyDesignerPlansController } from "./weekly-designer-plans.controller";
import { WeeklyDesignerPlansService } from "./weekly-designer-plans.service";
import { WeeklyOperationsApprovalPlansController } from "./weekly-operations-approval-plans.controller";
import { WeeklyOperationsApprovalPlansService } from "./weekly-operations-approval-plans.service";
import { TaskVisibilityService } from "../common/task-visibility.service";

@Module({
  controllers: [WeeklyPlansController, WeeklyDesignerPlansController, WeeklyOperationsApprovalPlansController],
  providers: [WeeklyPlansService, WeeklyDesignerPlansService, WeeklyOperationsApprovalPlansService, TaskVisibilityService],
  exports: [WeeklyPlansService, WeeklyDesignerPlansService, WeeklyOperationsApprovalPlansService],
})
export class WeeklyPlansModule {}
