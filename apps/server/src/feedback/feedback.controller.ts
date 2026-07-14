import { Controller, Get, Post, Patch, Param, Body, Query, UseGuards, Request, ParseIntPipe, ForbiddenException } from "@nestjs/common";
import { AuthGuard } from "@nestjs/passport";
import { FeedbackService } from "./feedback.service";

@Controller("feedback")
export class FeedbackController {
  constructor(private service: FeedbackService) {}

  @Post()
  async create(@Body() dto: any, @Request() req: any) {
    const userId = req.user?.sub;
    return this.service.create(dto, userId);
  }

  @UseGuards(AuthGuard("jwt"))
  @Get()
  async findAll(@Request() req: any, @Query("page") page = 1, @Query("pageSize") pageSize = 50) {
    if (req.user.role !== "OWNER" && req.user.role !== "SUPER_ADMIN") {
      throw new ForbiddenException("仅管理员可查看反馈");
    }
    return this.service.findAll(Number(page), Number(pageSize));
  }

  @UseGuards(AuthGuard("jwt"))
  @Patch(":id/status")
  async updateStatus(
    @Param("id", ParseIntPipe) id: number,
    @Body("status") status: string,
    @Request() req: any,
  ) {
    if (req.user.role !== "OWNER" && req.user.role !== "SUPER_ADMIN") {
      throw new ForbiddenException("仅管理员可处理反馈");
    }
    return this.service.updateStatus(id, status);
  }
}
