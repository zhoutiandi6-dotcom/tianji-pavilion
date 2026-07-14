import { Controller, Get, Post, Patch, Delete, Body, Param, UseGuards, ParseIntPipe , HttpCode, HttpStatus, ForbiddenException, Request } from "@nestjs/common";
import { AuthGuard } from "@nestjs/passport";
import { RequirementTypesService } from "./requirement-types.service";
import { CreateRequirementTypeDto } from "./dto/create-requirement-type.dto";
import { UpdateRequirementTypeDto } from "./dto/update-requirement-type.dto";

@UseGuards(AuthGuard("jwt"))
@Controller("requirement-types")
export class RequirementTypesController {
  constructor(private service: RequirementTypesService) {}

  private checkManagePermission(role: string) {
    if (!["OWNER", "SUPER_ADMIN"].includes(role)) {
      throw new ForbiddenException("当前账号无权限访问该页面。");
    }
  }

  @Get()
  async findAll() { return this.service.findAll(); }

  @Get(":id")
  async findOne(@Param("id", ParseIntPipe) id: number) { return this.service.findOne(id); }

  @Post()
  @HttpCode(HttpStatus.CREATED)
  async create(@Body() dto: CreateRequirementTypeDto, @Request() req: any) {
    this.checkManagePermission(req.user.role);
    return this.service.create(dto);
  }

  @Patch(":id")
  async update(@Param("id", ParseIntPipe) id: number, @Body() dto: UpdateRequirementTypeDto, @Request() req: any) {
    this.checkManagePermission(req.user.role);
    return this.service.update(id, dto);
  }

  @Delete(":id")
  async remove(@Param("id", ParseIntPipe) id: number, @Request() req: any) {
    this.checkManagePermission(req.user.role);
    return this.service.remove(id);
  }
}
