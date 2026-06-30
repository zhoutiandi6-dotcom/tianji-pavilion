import { Injectable, NotFoundException, ConflictException } from "@nestjs/common";
import * as bcrypt from "bcryptjs";
import { PrismaService } from "../common/prisma.service";
import { CreateUserDto } from "./dto/create-user.dto";
import { UpdateUserDto } from "./dto/update-user.dto";

@Injectable()
export class UsersService {
  constructor(private prisma: PrismaService) {}

  async findAll() {
    const users = await this.prisma.user.findMany({
      include: { role: true },
      orderBy: { id: "asc" },
    });
    return users.map((u) => ({
      id: u.id, username: u.username, displayName: u.displayName,
      email: u.email, role: u.role.name, roleId: u.roleId,
      isActive: u.isActive, mustChangePassword: u.mustChangePassword,
      createdAt: u.createdAt.toISOString(),
    }));
  }

  async findOne(id: number) {
    const u = await this.prisma.user.findUnique({ where: { id }, include: { role: true } });
    if (!u) throw new NotFoundException("用户不存在");
    return {
      id: u.id, username: u.username, displayName: u.displayName,
      email: u.email, role: u.role.name, roleId: u.roleId,
      isActive: u.isActive, createdAt: u.createdAt.toISOString(),
    };
  }

  async create(dto: CreateUserDto) {
    const existing = await this.prisma.user.findUnique({ where: { username: dto.username } });
    if (existing) throw new ConflictException("用户名已存在");
    const hash = await bcrypt.hash(dto.password, 10);
    return this.prisma.user.create({
      data: { ...dto, password: hash },
      include: { role: true },
    });
  }

  async update(id: number, dto: UpdateUserDto) {
    const u = await this.prisma.user.findUnique({ where: { id } });
    if (!u) throw new NotFoundException("用户不存在");
    return this.prisma.user.update({ where: { id }, data: dto, include: { role: true } });
  }

  async remove(id: number) {
    const u = await this.prisma.user.findUnique({ where: { id } });
    if (!u) throw new NotFoundException("用户不存在");
    await this.prisma.user.update({ where: { id }, data: { isActive: false } });
    return { message: "账号已停用" };
  }
}
