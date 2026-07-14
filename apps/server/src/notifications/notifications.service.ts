import { Injectable } from "@nestjs/common";
import { PrismaService } from "../common/prisma.service";

@Injectable()
export class NotificationsService {
  constructor(private prisma: PrismaService) {}

  async findByUser(userId: number, page = 1, pageSize = 20) {
    pageSize = Math.min(pageSize, 100);
    const skip = (page - 1) * pageSize;
    const [items, total] = await Promise.all([
      this.prisma.notification.findMany({
        where: { receiverId: userId },
        orderBy: { createdAt: "desc" },
        skip, take: pageSize,
      }),
      this.prisma.notification.count({ where: { receiverId: userId } }),
    ]);
    return { items, total, page, pageSize };
  }

  async markRead(id: number, userId: number) {
    return this.prisma.notification.updateMany({
      where: { id, receiverId: userId },
      data: { isRead: true },
    });
  }

  async markAllRead(userId: number) {
    await this.prisma.notification.updateMany({
      where: { receiverId: userId, isRead: false },
      data: { isRead: true },
    });
    return { message: "全部已读" };
  }

  async getUnreadCount(userId: number) {
    return this.prisma.notification.count({ where: { receiverId: userId, isRead: false } });
  }

  async create(data: { userId: number; title: string; content: string; type?: string }) {
    return this.prisma.notification.create({
      data: { senderId: 1, receiverId: data.userId, title: data.title, content: data.content, type: data.type || "info" },
    });
  }
}

