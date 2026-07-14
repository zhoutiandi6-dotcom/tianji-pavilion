import { Body, Controller, Get, Param, ParseIntPipe, Post, Query, Request, UseGuards } from "@nestjs/common";
import { AuthGuard } from "@nestjs/passport";
import { AddWeeklyPlanItemDto, AddWeeklyPlanItemsDto, ActivateWeeklyPlanDto } from "./dto/add-weekly-plan-items.dto";
import { CancelWeeklyPlanItemDto, RestoreWeeklyPlanItemDto } from "./dto/update-weekly-plan-item.dto";
import { CarryOverWeeklyPlanItemsDto } from "./dto/carry-over.dto";
import { WeeklyPlanItemsQueryDto } from "./dto/weekly-plan-query.dto";
import { WeeklyPlansService } from "./weekly-plans.service";

@UseGuards(AuthGuard("jwt"))
@Controller("weekly-plans")
export class WeeklyPlansController {
  constructor(private service: WeeklyPlansService) {}

  @Get("current")
  current(@Request() req: any) { return this.service.getCurrent(req.user.sub, req.user.role); }

  @Post("current")
  createCurrent(@Request() req: any) { return this.service.createCurrent(req.user.sub, req.user.role); }

  @Get(":id")
  getPlan(@Param("id", ParseIntPipe) id: number, @Request() req: any) { return this.service.getPlan(id, req.user.sub, req.user.role); }

  @Post(":id/activate")
  activate(@Param("id", ParseIntPipe) id: number, @Body() dto: ActivateWeeklyPlanDto, @Request() req: any) {
    return this.service.activate(id, Boolean(dto.allowEmpty), req.user.sub, req.user.role);
  }

  @Post(":id/close")
  close(@Param("id", ParseIntPipe) id: number, @Request() req: any) { return this.service.close(id, req.user.sub, req.user.role); }

  @Post(":id/items")
  addItem(@Param("id", ParseIntPipe) id: number, @Body() dto: AddWeeklyPlanItemDto, @Request() req: any) {
    return this.service.addItem(id, dto.imageTaskId, req.user.sub, req.user.role);
  }

  @Post(":id/items/batch")
  addItems(@Param("id", ParseIntPipe) id: number, @Body() dto: AddWeeklyPlanItemsDto, @Request() req: any) {
    return this.service.addItems(id, dto.imageTaskIds, req.user.sub, req.user.role);
  }

  @Post(":id/items/:itemId/cancel")
  cancelItem(@Param("id", ParseIntPipe) id: number, @Param("itemId", ParseIntPipe) itemId: number, @Body() dto: CancelWeeklyPlanItemDto, @Request() req: any) {
    return this.service.cancelItem(id, itemId, dto.cancelReason, req.user.sub, req.user.role);
  }

  @Post(":id/items/:itemId/restore")
  restoreItem(@Param("id", ParseIntPipe) id: number, @Param("itemId", ParseIntPipe) itemId: number, @Body() dto: RestoreWeeklyPlanItemDto, @Request() req: any) {
    return this.service.restoreItem(id, itemId, dto.reason, req.user.sub, req.user.role);
  }

  @Get(":id/carry-over-preview")
  carryOverPreview(@Param("id", ParseIntPipe) id: number, @Request() req: any) { return this.service.getCarryOverPreview(id, req.user.sub, req.user.role); }

  @Post(":id/carry-over")
  carryOver(@Param("id", ParseIntPipe) id: number, @Body() dto: CarryOverWeeklyPlanItemsDto, @Request() req: any) {
    return this.service.carryOver(id, dto.imageTaskIds, req.user.sub, req.user.role);
  }

  @Get(":id/summary")
  summary(@Param("id", ParseIntPipe) id: number, @Request() req: any) { return this.service.getSummary(id, req.user.sub, req.user.role); }

  @Get(":id/designers")
  designers(@Param("id", ParseIntPipe) id: number, @Request() req: any) { return this.service.getDesigners(id, req.user.sub, req.user.role); }

  @Get(":id/items")
  items(@Param("id", ParseIntPipe) id: number, @Query() query: WeeklyPlanItemsQueryDto, @Request() req: any) {
    return this.service.getItems(id, query, req.user.sub, req.user.role);
  }
}
