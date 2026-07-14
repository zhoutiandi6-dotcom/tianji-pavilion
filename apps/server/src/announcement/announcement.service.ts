// ===== 天机阁 系统公告模块 =====
// Manual announcements published by Owner/Authorized admins

import { Injectable, NotFoundException, ForbiddenException } from "@nestjs/common";
import { PrismaService } from "../common/prisma.service";
import { OperationLogService } from "../operation-log/operation-log.service";

// Permissions:
// announcement.read    — super_admin, owner, everyone
// announcement.create  — super_admin, owner
// announcement.update  — super_admin, owner
// announcement.delete  — owner
// announcement.publish — owner
// announcement.pin     — owner

const CAN_CREATE = ["OWNER", "SUPER_ADMIN"];
const CAN_UPDATE = ["OWNER", "SUPER_ADMIN"];
const CAN_DELETE = ["OWNER"];
const CAN_PUBLISH = ["OWNER"];
const CAN_PIN = ["OWNER"];

@Injectable()
export class AnnouncementService {
  constructor(private prisma: PrismaService, private logService: OperationLogService) {}

  async findAll(page = 1, pageSize = 20) {
    pageSize = Math.min(pageSize, 100);
    const skip = (page - 1) * pageSize;
    const where = { deletedAt: null };
    const [items, total] = await Promise.all([
      this.prisma.announcement.findMany({
        where, orderBy: [{ isPinned: "desc" }, { createdAt: "desc" }],
        skip, take: pageSize,
        include: { creator: { select: { id: true, username: true, displayName: true } } },
      }),
      this.prisma.announcement.count({ where }),
    ]);
    return { items, total, page, pageSize };
  }

  async findOne(id: number) {
    const a = await this.prisma.announcement.findUnique({ where: { id }, include: { creator: { select: { id: true, username: true, displayName: true } } } });
    if (!a || a.deletedAt) throw new NotFoundException("公告不存在");
    return a;
  }

  async create(dto: { title: string; content: string; priority?: string }, userId: number, userRole: string) {
    if (!CAN_CREATE.includes(userRole)) throw new ForbiddenException("无权限发布公告");
    const r = await this.prisma.announcement.create({
      data: { title: dto.title, content: dto.content, priority: dto.priority || "normal", creatorId: userId },
    });
    await this.logService.log({ userId, action: "create_announcement", targetType: "announcement", targetId: r.id, content: `创建公告: ${dto.title}` });
    return r;
  }

  async update(id: number, dto: { title?: string; content?: string; priority?: string }, userId: number, userRole: string) {
    if (!CAN_UPDATE.includes(userRole)) throw new ForbiddenException("无权限编辑公告");
    const a = await this.findOne(id);
    const r = await this.prisma.announcement.update({ where: { id }, data: dto });
    await this.logService.log({ userId, action: "update_announcement", targetType: "announcement", targetId: id, content: `编辑公告: ${a.title}` });
    return r;
  }

  async remove(id: number, userId: number, userRole: string) {
    if (!CAN_DELETE.includes(userRole)) throw new ForbiddenException("无权限删除公告");
    const a = await this.findOne(id);
    await this.prisma.announcement.update({ where: { id }, data: { deletedAt: new Date() } });
    await this.logService.log({ userId, action: "delete_announcement", targetType: "announcement", targetId: id, content: `删除公告: ${a.title}` });
  }

  async publish(id: number, userId: number, userRole: string) {
    if (!CAN_PUBLISH.includes(userRole)) throw new ForbiddenException("无权限发布公告");
    const a = await this.findOne(id);
    const r = await this.prisma.announcement.update({ where: { id }, data: { isPublished: true, publishedAt: new Date() } });
    await this.logService.log({ userId, action: "publish_announcement", targetType: "announcement", targetId: id, content: `发布公告: ${a.title}` });
    return r;
  }

  async togglePin(id: number, userId: number, userRole: string) {
    if (!CAN_PIN.includes(userRole)) throw new ForbiddenException("无权限置顶公告");
    const a = await this.findOne(id);
    const r = await this.prisma.announcement.update({ where: { id }, data: { isPinned: !a.isPinned } });
    await this.logService.log({ userId, action: "toggle_pin_announcement", targetType: "announcement", targetId: id, content: `${a.isPinned ? "取消" : ""}置顶公告: ${a.title}` });
    return r;
  }
}

