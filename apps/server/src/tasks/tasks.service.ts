import { Injectable, NotFoundException, ForbiddenException } from "@nestjs/common";
import { PrismaService } from "../common/prisma.service";
import { CreateTaskDto } from "./dto/create-task.dto";
import { UpdateTaskDto } from "./dto/update-task.dto";
import { QueryTaskDto } from "./dto/query-task.dto";

@Injectable()
export class TasksService {
  constructor(private prisma: PrismaService) {}

  async findAll(query: QueryTaskDto, userId: number, userRole: string) {
    const page = query.page || 1;
    const pageSize = query.pageSize || 20;
    const skip = (page - 1) * pageSize;
    const where: any = {};

    // RBAC: OPERATOR only sees own tasks
    if (userRole === "OPERATOR") where.creatorId = userId;

    if (query.search) {
      where.OR = [
        { title: { contains: query.search } },
        { description: { contains: query.search } },
      ];
    }
    if (query.status) where.status = query.status;
    if (query.priority) where.priority = query.priority;
    if (query.storeId) where.storeId = query.storeId;
    if (query.creatorId) where.creatorId = query.creatorId;
    if (query.assigneeId) where.assigneeId = query.assigneeId;

    const [items, total] = await Promise.all([
      this.prisma.task.findMany({
        where,
        include: {
          creator: { select: { id: true, username: true, displayName: true } },
          assignee: { select: { id: true, username: true, displayName: true } },
          store: { select: { id: true, name: true } },
          _count: { select: { attachments: true, requirementItems: true } },
        },
        orderBy: { createdAt: "desc" },
        skip,
        take: pageSize,
      }),
      this.prisma.task.count({ where }),
    ]);

    return { items, total, page, pageSize };
  }

  async findOne(id: number) {
    const task = await this.prisma.task.findUnique({
      where: { id },
      include: {
        creator: { select: { id: true, username: true, displayName: true } },
        assignee: { select: { id: true, username: true, displayName: true } },
        store: { select: { id: true, name: true } },
        requirementItems: {
          include: { requirementType: true },
          orderBy: { sortOrder: "asc" },
        },
        attachments: { orderBy: { createdAt: "desc" } },
      },
    });
    if (!task) throw new NotFoundException("\u6cd5\u65e8\u4e0d\u5b58\u5728");
    return task;
  }

  async create(dto: CreateTaskDto, userId: number) {
    return this.prisma.task.create({
      data: {
        title: dto.title,
        description: dto.description || "",
        productCode: dto.productCode || null,
        isUrgent: dto.isUrgent || false,
        priority: dto.priority || "MEDIUM",
        status: "PENDING",
        creatorId: userId,
        assigneeId: dto.assigneeId || null,
        storeId: dto.storeId || null,
      },
      include: {
        creator: { select: { id: true, username: true, displayName: true } },
        assignee: { select: { id: true, username: true, displayName: true } },
        store: { select: { id: true, name: true } },
      },
    });
  }

  async update(id: number, dto: UpdateTaskDto, userId: number, userRole: string) {
    const task = await this.prisma.task.findUnique({ where: { id } });
    if (!task) throw new NotFoundException("\u6cd5\u65e8\u4e0d\u5b58\u5728");
    if (task.creatorId !== userId && userRole === "OPERATOR") {
      throw new ForbiddenException("\u65e0\u6743\u4fee\u6539\u6b64\u6cd5\u65e8");
    }
    return this.prisma.task.update({
      where: { id },
      data: dto,
      include: {
        creator: { select: { id: true, username: true, displayName: true } },
        assignee: { select: { id: true, username: true, displayName: true } },
        store: { select: { id: true, name: true } },
      },
    });
  }

  async updateStatus(id: number, status: string, userId: number, userRole: string) {
    const task = await this.prisma.task.findUnique({ where: { id } });
    if (!task) throw new NotFoundException("\u6cd5\u65e8\u4e0d\u5b58\u5728");
    if (userRole === "DESIGNER" && task.assigneeId !== userId) {
      throw new ForbiddenException("\u65e0\u6743\u4fee\u6539\u6b64\u6cd5\u65e8\u72b6\u6001");
    }
    return this.prisma.task.update({ where: { id }, data: { status } });
  }

  async remove(id: number, userId: number, userRole: string) {
    const task = await this.prisma.task.findUnique({ where: { id } });
    if (!task) throw new NotFoundException("\u6cd5\u65e8\u4e0d\u5b58\u5728");
    if (task.creatorId !== userId && userRole !== "ADMIN") {
      throw new ForbiddenException("\u65e0\u6743\u5220\u9664\u6b64\u6cd5\u65e8");
    }
    await this.prisma.task.delete({ where: { id } });
    return { message: "\u6cd5\u65e8\u5df2\u5220\u9664" };
  }
}
