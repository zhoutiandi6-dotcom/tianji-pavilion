import { Module } from "@nestjs/common";
import { WeeklyPlansController } from "./weekly-plans.controller";
import { WeeklyPlansService } from "./weekly-plans.service";
import { WeeklyDesignerPlansController } from "./weekly-designer-plans.controller";
import { WeeklyDesignerPlansService } from "./weekly-designer-plans.service";

@Module({
  controllers: [WeeklyPlansController, WeeklyDesignerPlansController],
  providers: [WeeklyPlansService, WeeklyDesignerPlansService],
  exports: [WeeklyPlansService, WeeklyDesignerPlansService],
})
export class WeeklyPlansModule {}
