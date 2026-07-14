import { Injectable, NotFoundException } from "@nestjs/common";
import { PrismaService } from "../common/prisma.service";
import { CreateRequirementTypeDto } from "./dto/create-requirement-type.dto";
import { UpdateRequirementTypeDto } from "./dto/update-requirement-type.dto";

@Injectable()
export class RequirementTypesService {
  constructor(private prisma: PrismaService) {}

  async findAll() {
    return this.prisma.requirementType.findMany({ orderBy: { sortOrder: "asc" } });
  }

  async findOne(id: number) {
    const rt = await this.prisma.requirementType.findUnique({ where: { id } });
    if (!rt) throw new NotFoundException("需求类型不存在");
    return rt;
  }

  async create(dto: CreateRequirementTypeDto) {
    return this.prisma.requirementType.create({ data: dto });
  }

  async update(id: number, dto: UpdateRequirementTypeDto) {
    const rt = await this.prisma.requirementType.findUnique({ where: { id } });
    if (!rt) throw new NotFoundException("需求类型不存在");
    return this.prisma.requirementType.update({ where: { id }, data: dto });
  }

  async remove(id: number) {
    const rt = await this.prisma.requirementType.findUnique({ where: { id } });
    if (!rt) throw new NotFoundException("需求类型不存在");
    await this.prisma.requirementType.delete({ where: { id } });
    return { message: "已删除" };
  }
}
