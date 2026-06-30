import { Controller, Get, Post, Patch, Delete, Body, Param, UseGuards, ParseIntPipe } from "@nestjs/common";
import { AuthGuard } from "@nestjs/passport";
import { RequirementTypesService } from "./requirement-types.service";
import { CreateRequirementTypeDto } from "./dto/create-requirement-type.dto";
import { UpdateRequirementTypeDto } from "./dto/update-requirement-type.dto";

@UseGuards(AuthGuard("jwt"))
@Controller("requirement-types")
export class RequirementTypesController {
  constructor(private service: RequirementTypesService) {}

  @Get()
  async findAll() { return this.service.findAll(); }

  @Get(":id")
  async findOne(@Param("id", ParseIntPipe) id: number) { return this.service.findOne(id); }

  @Post()
  async create(@Body() dto: CreateRequirementTypeDto) { return this.service.create(dto); }

  @Patch(":id")
  async update(@Param("id", ParseIntPipe) id: number, @Body() dto: UpdateRequirementTypeDto) { return this.service.update(id, dto); }

  @Delete(":id")
  async remove(@Param("id", ParseIntPipe) id: number) { return this.service.remove(id); }
}
