import { Injectable } from "@nestjs/common";
import { PrismaService } from "../common/prisma.service";

@Injectable()
export class OperationLogService {
  constructor(private prisma: PrismaService) {}

  async log(params: {
    userId: number;
    action: string;
    targetType: string;
    targetId?: number;
    content?: string;
    beforeValue?: any;
    afterValue?: any;
    ipAddress?: string;
    userAgent?: string;
  }) {
    return this.prisma.auditEvent.create({
      data: {
        resourceType: params.targetType,
        resourceId: params.targetId ?? 0,
        action: params.action,
        operatorId: params.userId,
        correlationId: null,
        metadata: JSON.stringify({
          content: params.content,
          beforeValue: params.beforeValue,
          afterValue: params.afterValue,
          ipAddress: params.ipAddress,
          userAgent: params.userAgent,
        }),
      },
    });
  }

  async findAll(page = 1, pageSize = 50) {
    pageSize = Math.min(pageSize, 200);
    const skip = (page - 1) * pageSize;
    const [items, total] = await Promise.all([
      this.prisma.auditEvent.findMany({ orderBy: { createdAt: "desc" }, skip, take: pageSize }),
      this.prisma.auditEvent.count(),
    ]);
    return { items, total, page, pageSize, _deprecated: true, _migration: "Use GET /api/audit instead" };
  }
}

