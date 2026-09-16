import { Body, Controller, ForbiddenException, Get, Patch, Param, ParseIntPipe, Post, Query, Request, UseGuards } from "@nestjs/common";
import { AuthGuard } from "@nestjs/passport";
import { FeedbackService } from "./feedback.service";

@UseGuards(AuthGuard("jwt"))
@Controller("feedback")
export class FeedbackController {
  constructor(private service: FeedbackService) {}

  @Post()
  create(@Body() dto: any, @Request() req: any) { return this.service.create(dto, req.user); }

  @Get("mine")
  findMine(@Request() req: any, @Query("page") page = 1, @Query("pageSize") pageSize = 50) {
    if (!this.service.canAccess(req.user.role)) throw new ForbiddenException("当前角色无权使用反馈模块");
    return this.service.findMine(req.user.sub, Number(page), Number(pageSize));
  }

  @Get()
  findShared(@Request() req: any, @Query("page") page = 1, @Query("pageSize") pageSize = 50) {
    if (!this.service.canAccess(req.user.role)) throw new ForbiddenException("当前角色无权使用反馈模块");
    return this.service.findShared(Number(page), Number(pageSize));
  }

  @Get(":id")
  findOne(@Param("id", ParseIntPipe) id: number, @Request() req: any) {
    if (!this.service.canAccess(req.user.role)) throw new ForbiddenException("当前角色无权使用反馈模块");
    return this.service.findOne(id);
  }

  @Patch(":id/status")
  updateStatus(@Param("id", ParseIntPipe) id: number, @Body() body: { status: string; note?: string }, @Request() req: any) {
    return this.service.updateStatus(id, body.status, body.note, req.user);
  }
}
