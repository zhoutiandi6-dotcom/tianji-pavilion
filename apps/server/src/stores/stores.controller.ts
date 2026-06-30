import { Controller, Get, Post, Patch, Delete, Body, Param, UseGuards, ParseIntPipe } from "@nestjs/common";
import { AuthGuard } from "@nestjs/passport";
import { StoresService } from "./stores.service";
import { CreateStoreDto } from "./dto/create-store.dto";
import { UpdateStoreDto } from "./dto/update-store.dto";

@UseGuards(AuthGuard("jwt"))
@Controller("stores")
export class StoresController {
  constructor(private service: StoresService) {}

  @Get()
  async findAll() { return this.service.findAll(); }

  @Get(":id")
  async findOne(@Param("id", ParseIntPipe) id: number) { return this.service.findOne(id); }

  @Post()
  async create(@Body() dto: CreateStoreDto) { return this.service.create(dto); }

  @Patch(":id")
  async update(@Param("id", ParseIntPipe) id: number, @Body() dto: UpdateStoreDto) { return this.service.update(id, dto); }

  @Delete(":id")
  async remove(@Param("id", ParseIntPipe) id: number) { return this.service.remove(id); }
}
