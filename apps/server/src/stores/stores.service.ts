import { Injectable, NotFoundException } from "@nestjs/common";
import { PrismaService } from "../common/prisma.service";
import { CreateStoreDto } from "./dto/create-store.dto";
import { UpdateStoreDto } from "./dto/update-store.dto";

@Injectable()
export class StoresService {
  constructor(private prisma: PrismaService) {}

  async findAll() {
    return this.prisma.store.findMany({ orderBy: { name: "asc" } });
  }

  async findOne(id: number) {
    const store = await this.prisma.store.findUnique({ where: { id } });
    if (!store) throw new NotFoundException("店铺不存在");
    return store;
  }

  async create(dto: CreateStoreDto) {
    return this.prisma.store.create({ data: dto });
  }

  async update(id: number, dto: UpdateStoreDto) {
    const store = await this.prisma.store.findUnique({ where: { id } });
    if (!store) throw new NotFoundException("店铺不存在");
    return this.prisma.store.update({ where: { id }, data: dto });
  }

  async remove(id: number) {
    const store = await this.prisma.store.findUnique({ where: { id } });
    if (!store) throw new NotFoundException("店铺不存在");
    await this.prisma.store.delete({ where: { id } });
    return { message: "已删除" };
  }
}
