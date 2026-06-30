import {
  Controller, Get, Post, Patch, Delete,
  Body, Param, Query, UseGuards, Request, ParseIntPipe,
} from "@nestjs/common";
import { AuthGuard } from "@nestjs/passport";
import { TasksService } from "./tasks.service";
import { CreateTaskDto } from "./dto/create-task.dto";
import { UpdateTaskDto } from "./dto/update-task.dto";
import { QueryTaskDto } from "./dto/query-task.dto";

@UseGuards(AuthGuard("jwt"))
@Controller("tasks")
export class TasksController {
  constructor(private service: TasksService) {}

  @Get()
  async findAll(@Query() query: QueryTaskDto, @Request() req: any) {
    return this.service.findAll(query, req.user.sub, req.user.role);
  }

  @Get(":id")
  async findOne(@Param("id", ParseIntPipe) id: number) {
    return this.service.findOne(id);
  }

  @Post()
  async create(@Body() dto: CreateTaskDto, @Request() req: any) {
    return this.service.create(dto, req.user.sub);
  }

  @Patch(":id")
  async update(
    @Param("id", ParseIntPipe) id: number,
    @Body() dto: UpdateTaskDto,
    @Request() req: any,
  ) {
    return this.service.update(id, dto, req.user.sub, req.user.role);
  }

  @Patch(":id/status")
  async updateStatus(
    @Param("id", ParseIntPipe) id: number,
    @Body("status") status: string,
    @Request() req: any,
  ) {
    return this.service.updateStatus(id, status, req.user.sub, req.user.role);
  }

  @Delete(":id")
  async remove(@Param("id", ParseIntPipe) id: number, @Request() req: any) {
    return this.service.remove(id, req.user.sub, req.user.role);
  }
}
