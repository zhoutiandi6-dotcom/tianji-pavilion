import { Controller, Get, Param, ParseIntPipe, Request, UseGuards } from "@nestjs/common";
import { AuthGuard } from "@nestjs/passport";
import { TimelineService } from "./timeline.service";

@UseGuards(AuthGuard("jwt"))
@Controller("timeline")
export class TimelineController {
  constructor(private service: TimelineService) {}

  @Get("task/:taskId")
  getTaskTimeline(@Param("taskId", ParseIntPipe) taskId: number, @Request() req: any) {
    return this.service.getTaskTimeline(taskId, req.user.role, Number(req.user.sub));
  }
}
