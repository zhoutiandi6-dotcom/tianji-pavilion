import { Controller, Get, Post, Patch, Param, Query, UseGuards, Request, ParseIntPipe } from "@nestjs/common";
import { AuthGuard } from "@nestjs/passport";
import { NotificationsService } from "./notifications.service";

@UseGuards(AuthGuard("jwt"))
@Controller("notifications")
export class NotificationsController {
  constructor(private service: NotificationsService) {}

  @Get()
  async findByUser(@Request() req: any, @Query("page") page = 1, @Query("pageSize") pageSize = 20) {
    return this.service.findByUser(req.user.sub, Number(page), Number(pageSize));
  }

  @Get("unread-count")
  async getUnreadCount(@Request() req: any) {
    const count = await this.service.getUnreadCount(req.user.sub);
    return { count };
  }

  @Patch(":id/read")
  async markRead(@Param("id", ParseIntPipe) id: number, @Request() req: any) {
    return this.service.markRead(id, req.user.sub);
  }

  @Post("read-all")
  async markAllRead(@Request() req: any) {
    return this.service.markAllRead(req.user.sub);
  }
}
