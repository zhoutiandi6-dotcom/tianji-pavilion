import { Module } from "@nestjs/common";
import { DashboardController } from "./dashboard.controller";
import { StatusCalculatorService } from "../common/status-calculator.service";
import { TaskVisibilityService } from "../common/task-visibility.service";
import { WeeklyPlansModule } from "../weekly-plans/weekly-plans.module";
import { DashboardRoleService } from "./dashboard-role.service";

@Module({
  imports: [WeeklyPlansModule],
  controllers: [DashboardController],
  providers: [StatusCalculatorService, TaskVisibilityService, DashboardRoleService],
})
export class DashboardModule {}
