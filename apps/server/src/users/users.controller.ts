import { Body, Controller, Delete, ForbiddenException, Get, HttpCode, HttpStatus, Param, ParseIntPipe, Patch, Post, Query, Request, UseGuards } from "@nestjs/common";
import { AuthGuard } from "@nestjs/passport";
import { UsersService } from "./users.service";
import { CreateUserDto } from "./dto/create-user.dto";
import { UpdateUserDto } from "./dto/update-user.dto";

@UseGuards(AuthGuard("jwt"))
@Controller("users")
export class UsersController {
  constructor(private service: UsersService) {}

  private checkPermission(role: string) {
    if (role !== "SUPER_ADMIN" && role !== "OWNER") {
      throw new ForbiddenException("仅管理员可管理用户");
    }
  }

  @Get()
  async findAll(@Request() req: any, @Query("page") page = 1, @Query("pageSize") pageSize = 50) {
    this.checkPermission(req.user.role);
    return this.service.findAll(Number(page), Number(pageSize));
  }

  @Get("designers")
  async findDesigners(@Request() req: any) {
    if (!["OWNER", "SUPER_ADMIN", "DESIGN_MANAGER"].includes(req.user.role)) {
      throw new ForbiddenException("仅管理员或设计主管可查看设计师列表");
    }
    return this.service.findDesigners();
  }

  @Get(":id")
  async findOne(@Param("id", ParseIntPipe) id: number, @Request() req: any) {
    this.checkPermission(req.user.role);
    return this.service.findOne(id);
  }

  @Post()
  @HttpCode(HttpStatus.CREATED)
  async create(@Body() dto: CreateUserDto, @Request() req: any) {
    this.checkPermission(req.user.role);
    return this.service.create(dto, req.user.sub);
  }

  @Patch(":id")
  async update(@Param("id", ParseIntPipe) id: number, @Body() dto: UpdateUserDto, @Request() req: any) {
    this.checkPermission(req.user.role);
    return this.service.update(id, dto, req.user.sub);
  }

  @Post(":id/activate")
  async activate(@Param("id", ParseIntPipe) id: number, @Request() req: any) {
    this.checkPermission(req.user.role);
    return this.service.activate(id, req.user.sub);
  }

  @Post(":id/deactivate")
  async deactivate(@Param("id", ParseIntPipe) id: number, @Request() req: any) {
    this.checkPermission(req.user.role);
    return this.service.deactivate(id, req.user.sub);
  }

  @Post(":id/reset-password")
  async resetPassword(@Param("id", ParseIntPipe) id: number, @Request() req: any) {
    this.checkPermission(req.user.role);
    return this.service.resetPassword(id, req.user.sub);
  }

  @Delete(":id")
  async remove(@Param("id", ParseIntPipe) id: number, @Request() req: any) {
    this.checkPermission(req.user.role);
    return this.service.remove(id, req.user.sub);
  }
}
