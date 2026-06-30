import { Controller, Get, Post, Patch, Delete, Body, Param, UseGuards, ParseIntPipe } from "@nestjs/common";
import { AuthGuard } from "@nestjs/passport";
import { UsersService } from "./users.service";
import { CreateUserDto } from "./dto/create-user.dto";
import { UpdateUserDto } from "./dto/update-user.dto";

@UseGuards(AuthGuard("jwt"))
@Controller("users")
export class UsersController {
  constructor(private service: UsersService) {}

  @Get()
  async findAll() { return this.service.findAll(); }

  @Get(":id")
  async findOne(@Param("id", ParseIntPipe) id: number) { return this.service.findOne(id); }

  @Post()
  async create(@Body() dto: CreateUserDto) { return this.service.create(dto); }

  @Patch(":id")
  async update(@Param("id", ParseIntPipe) id: number, @Body() dto: UpdateUserDto) { return this.service.update(id, dto); }

  @Delete(":id")
  async remove(@Param("id", ParseIntPipe) id: number) { return this.service.remove(id); }
}
