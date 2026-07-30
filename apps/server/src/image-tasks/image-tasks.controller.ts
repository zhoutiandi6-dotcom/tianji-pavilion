import { Body, Controller, Delete, Get, Param, ParseIntPipe, Patch, Post, Request, UseGuards } from "@nestjs/common";
import { AuthGuard } from "@nestjs/passport";
import { ImageTasksService } from "./image-tasks.service";
import { CreateImageTaskDto } from "./dto/create-image-task.dto";
import { UpdateImageTaskDto } from "./dto/update-image-task.dto";
import { BatchAssignTasksDto } from "./dto/batch-assign-tasks.dto";
import { BatchReviewTasksDto } from "./dto/batch-review-tasks.dto";

@UseGuards(AuthGuard("jwt"))
@Controller("image-tasks")
export class ImageTasksController {
  constructor(private service: ImageTasksService) {}

  @Get("by-task/:taskId")
  async findByTask(@Param("taskId", ParseIntPipe) taskId: number, @Request() req: any) { return this.service.findByTask(taskId, req.user.sub, req.user.role); }

  @Post("batch/assign-tasks")
  async batchAssignTasks(@Body() dto: BatchAssignTasksDto, @Request() req: any) {
    return this.service.batchAssignTasks(dto, req.user.sub, req.user.role);
  }

  @Post("batch/review-tasks")
  async batchReviewTasks(@Body() dto: BatchReviewTasksDto, @Request() req: any) {
    return this.service.batchReviewTasks(dto, req.user.sub, req.user.role);
  }

  @Get(":id")
  async findOne(@Param("id", ParseIntPipe) id: number, @Request() req: any) { return this.service.findOne(id, req.user.sub, req.user.role); }

  @Post()
  async create(@Body() dto: CreateImageTaskDto, @Request() req: any) { return this.service.create(dto, req.user.sub); }

  @Patch(":id")
  async update(@Param("id", ParseIntPipe) id: number, @Body() dto: UpdateImageTaskDto, @Request() req: any) { return this.service.update(id, dto, req.user.sub, req.user.role); }

  @Post(":id/start")
  async start(@Param("id", ParseIntPipe) id: number, @Request() req: any) { return this.service.update(id, { status: "IN_PROGRESS" } as any, req.user.sub, req.user.role); }

  @Post(":id/submit-review")
  async submitReview(@Param("id", ParseIntPipe) id: number, @Request() req: any) { return this.service.update(id, { status: "SUBMITTED_FOR_REVIEW" } as any, req.user.sub, req.user.role); }

  @Post(":id/approve-review")
  async approveReview(@Param("id", ParseIntPipe) id: number, @Body("remark") remark: string, @Request() req: any) {
    return this.service.update(id, { status: "APPROVED", reviewRemark: remark } as any, req.user.sub, req.user.role);
  }

  @Post(":id/reject-review")
  async rejectReview(@Param("id", ParseIntPipe) id: number, @Body("remark") remark: string, @Request() req: any) {
    return this.service.update(id, { status: "REVISION_REQUIRED", reviewRemark: remark } as any, req.user.sub, req.user.role);
  }

  @Delete(":id")
  async remove(@Param("id", ParseIntPipe) id: number, @Request() req: any) { return this.service.remove(id, req.user.sub, req.user.role); }
}
