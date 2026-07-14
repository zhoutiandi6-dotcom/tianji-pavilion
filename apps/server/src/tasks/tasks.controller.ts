import { Body, Controller, Delete, Get, Param, ParseIntPipe, Patch, Post, Query, Request, UseGuards } from "@nestjs/common";
import { AuthGuard } from "@nestjs/passport";
import { TasksService } from "./tasks.service";
import { CreateTaskDto } from "./dto/create-task.dto";
import { UpdateTaskDto } from "./dto/update-task.dto";
import { BatchPriorityDto } from "./dto/batch-priority.dto";

@UseGuards(AuthGuard("jwt"))
@Controller("tasks")
export class TasksController {
  constructor(private service: TasksService) {}

  @Get()
  async findAll(@Query() query: any, @Request() req: any) {
    return this.service.findAll(Number(query.page || 1), Number(query.pageSize || 20), req.user.role, req.user.sub, query);
  }

  @Post("batch/priority")
  async batchPriority(@Body() dto: BatchPriorityDto, @Request() req: any) {
    return this.service.batchPriority(dto, req.user.sub, req.user.role);
  }

  @Post("batch/delete")
  async batchDelete(@Body("taskIds") taskIds: number[], @Request() req: any) {
    return this.service.batchRemove(taskIds, req.user.sub, req.user.role);
  }

  @Get(":id")
  async findOne(@Param("id", ParseIntPipe) id: number, @Request() req: any) { return this.service.findOne(id, req.user.role, req.user.sub); }

  @Post()
  async create(@Body() dto: CreateTaskDto, @Request() req: any) { return this.service.create(dto, req.user.sub, req.user.role); }

  @Patch(":id")
  async update(@Param("id", ParseIntPipe) id: number, @Body() dto: UpdateTaskDto, @Request() req: any) { return this.service.update(id, dto, req.user.sub, req.user.role); }

  @Delete(":id")
  async remove(@Param("id", ParseIntPipe) id: number, @Request() req: any) { return this.service.remove(id, req.user.sub, req.user.role); }
}
