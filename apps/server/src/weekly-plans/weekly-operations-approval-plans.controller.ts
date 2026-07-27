import { Body, Controller, Get, Param, Post, Query, Request, UseGuards } from "@nestjs/common";
import { AuthGuard } from "@nestjs/passport";
import { IsArray, IsDateString, IsInt, IsNotEmpty, IsString, MaxLength, Min } from "class-validator";
import { WeeklyOperationsApprovalPlanQueryDto } from "./dto/weekly-operations-approval-plan-query.dto";
import { WeeklyOperationsApprovalPlansService } from "./weekly-operations-approval-plans.service";

class AddOperationsApprovalPlanDecreesDto {
  @IsDateString() weekStart!: string;
  @IsArray() @IsInt({ each: true }) @Min(1, { each: true }) decreeIds!: number[];
}
class RemoveOperationsApprovalPlanItemDto {
  @IsString() @IsNotEmpty() @MaxLength(300) reason!: string;
}

@UseGuards(AuthGuard("jwt"))
@Controller("weekly-operations-approval-plans")
export class WeeklyOperationsApprovalPlansController {
  constructor(private readonly service: WeeklyOperationsApprovalPlansService) {}

  @Get()
  overview(@Query() query: WeeklyOperationsApprovalPlanQueryDto, @Request() req: any) { return this.service.getWeekOverview(req.user.sub, req.user.role, query.weekStart); }

  @Get("candidates")
  candidates(@Query() query: WeeklyOperationsApprovalPlanQueryDto & { search?: string }, @Request() req: any) { return this.service.listCandidates(req.user.sub, req.user.role, query.weekStart, query.search); }

  @Post("initialize")
  initialize(@Body() dto: { weekStart: string }, @Request() req: any) { return this.service.initializeWeek(dto.weekStart, req.user.sub, req.user.role); }

  @Post("items")
  addItems(@Body() dto: AddOperationsApprovalPlanDecreesDto, @Request() req: any) { return this.service.addDecrees(dto, req.user.sub, req.user.role); }

  @Post("items/:itemId/remove")
  removeItem(@Param("itemId") itemId: string, @Body() dto: RemoveOperationsApprovalPlanItemDto, @Request() req: any) { return this.service.removeDecreeItem(Number(itemId), dto.reason, req.user.sub, req.user.role); }
}
