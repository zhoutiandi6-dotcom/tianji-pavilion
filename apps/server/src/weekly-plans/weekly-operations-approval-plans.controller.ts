import { Body, Controller, Get, Post, Query, Request, UseGuards } from "@nestjs/common";
import { AuthGuard } from "@nestjs/passport";
import { InitializeWeeklyOperationsApprovalPlanDto } from "./dto/initialize-weekly-operations-approval-plan.dto";
import { UpsertWeeklyOperationsApprovalPlanDto } from "./dto/upsert-weekly-operations-approval-plan.dto";
import { WeeklyOperationsApprovalPlanQueryDto } from "./dto/weekly-operations-approval-plan-query.dto";
import { WeeklyOperationsApprovalPlansService } from "./weekly-operations-approval-plans.service";

@UseGuards(AuthGuard("jwt"))
@Controller("weekly-operations-approval-plans")
export class WeeklyOperationsApprovalPlansController {
  constructor(private readonly service: WeeklyOperationsApprovalPlansService) {}

  @Get()
  overview(@Query() query: WeeklyOperationsApprovalPlanQueryDto, @Request() req: any) {
    return this.service.getWeekOverview(req.user.sub, req.user.role, query.weekStart);
  }

  @Post("initialize")
  initialize(@Body() dto: InitializeWeeklyOperationsApprovalPlanDto, @Request() req: any) {
    return this.service.initializeWeek(dto.weekStart, req.user.sub, req.user.role);
  }

  @Post()
  upsert(@Body() dto: UpsertWeeklyOperationsApprovalPlanDto, @Request() req: any) {
    return this.service.upsertTarget(dto, req.user.sub, req.user.role);
  }

  @Get("adjustments")
  adjustments(@Query() query: WeeklyOperationsApprovalPlanQueryDto, @Request() req: any) {
    return this.service.getAdjustments(req.user.sub, req.user.role, query.weekStart);
  }
}
