import { Module } from "@nestjs/common";
import { TaskVisibilityService } from "../common/task-visibility.service";
import { TimelineController } from "./timeline.controller";
import { TimelineService } from "./timeline.service";

@Module({
  controllers: [TimelineController],
  providers: [TimelineService, TaskVisibilityService],
})
export class TimelineModule {}
