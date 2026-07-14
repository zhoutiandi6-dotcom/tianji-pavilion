import { Controller, Get, Param, UseGuards, ParseIntPipe } from "@nestjs/common";
import { AuthGuard } from "@nestjs/passport";
import { TimelineService } from "./timeline.service";

@UseGuards(AuthGuard("jwt"))
@Controller("timeline")
export class TimelineController {
  constructor(private service: TimelineService) {}

  @Get("task/:taskId")
  async getTaskTimeline(@Param("taskId", ParseIntPipe) taskId: number) {
    return this.service.getTaskTimeline(taskId);
  }
}
