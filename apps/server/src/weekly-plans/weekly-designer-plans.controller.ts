import { Body, Controller, Get, Post, Query, Request, UseGuards } from "@nestjs/common";
import { AuthGuard } from "@nestjs/passport";
import { InitializeWeeklyDesignerPlansDto } from "./dto/initialize-weekly-designer-plans.dto";
import { UpsertWeeklyDesignerPlanDto } from "./dto/upsert-weekly-designer-plan.dto";
import { WeeklyDesignerPlanQueryDto } from "./dto/weekly-designer-plan-query.dto";
import { WeeklyDesignerPlansService } from "./weekly-designer-plans.service";

@UseGuards(AuthGuard("jwt"))
@Controller("weekly-designer-plans")
export class WeeklyDesignerPlansController {
  constructor(private readonly service: WeeklyDesignerPlansService) {}

  @Get()
  overview(@Query() query: WeeklyDesignerPlanQueryDto, @Request() req: any) {
    return this.service.getWeekOverview(req.user.sub, req.user.role, query.weekStart);
  }

  @Post("initialize")
  initialize(@Body() dto: InitializeWeeklyDesignerPlansDto, @Request() req: any) {
    return this.service.initializeWeek(dto.weekStart, req.user.sub, req.user.role);
  }

  @Post()
  upsert(@Body() dto: UpsertWeeklyDesignerPlanDto, @Request() req: any) {
    return this.service.upsertTarget(dto, req.user.sub, req.user.role);
  }

  @Get("adjustments")
  adjustments(@Query() query: WeeklyDesignerPlanQueryDto, @Request() req: any) {
    return this.service.getAdjustments(req.user.sub, req.user.role, query.weekStart);
  }

  @Get("unassigned")
  unassigned(@Request() req: any) {
    return this.service.getUnassigned(req.user.sub, req.user.role);
  }

  @Get("changes")
  changes(@Query() query: WeeklyDesignerPlanQueryDto, @Request() req: any) {
    return this.service.getChanges(req.user.sub, req.user.role, query.weekStart);
  }
}
