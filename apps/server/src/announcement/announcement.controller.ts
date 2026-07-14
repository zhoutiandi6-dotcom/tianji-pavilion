import { Body, Controller, Delete, Get, Param, ParseIntPipe, Patch, Post, Query, Request, UseGuards } from "@nestjs/common";
import { AuthGuard } from "@nestjs/passport";
import { AnnouncementService } from "./announcement.service";
import { CreateAnnouncementDto } from "./dto/create-announcement.dto";
import { UpdateAnnouncementDto } from "./dto/update-announcement.dto";

@UseGuards(AuthGuard("jwt"))
@Controller("announcements")
export class AnnouncementController {
  constructor(private service: AnnouncementService) {}

  @Get()
  async findAll(@Query("page") page = 1, @Query("pageSize") pageSize = 20) {
    return this.service.findAll(Number(page), Number(pageSize));
  }

  @Get(":id")
  async findOne(@Param("id", ParseIntPipe) id: number) { return this.service.findOne(id); }

  @Post()
  async create(@Body() dto: CreateAnnouncementDto, @Request() req: any) { return this.service.create(dto, req.user.sub, req.user.role); }

  @Patch(":id")
  async update(@Param("id", ParseIntPipe) id: number, @Body() dto: UpdateAnnouncementDto, @Request() req: any) { return this.service.update(id, dto, req.user.sub, req.user.role); }

  @Delete(":id")
  async remove(@Param("id", ParseIntPipe) id: number, @Request() req: any) { return this.service.remove(id, req.user.sub, req.user.role); }

  @Post(":id/publish")
  async publish(@Param("id", ParseIntPipe) id: number, @Request() req: any) { return this.service.publish(id, req.user.sub, req.user.role); }

  @Post(":id/toggle-pin")
  async togglePin(@Param("id", ParseIntPipe) id: number, @Request() req: any) { return this.service.togglePin(id, req.user.sub, req.user.role); }
}
