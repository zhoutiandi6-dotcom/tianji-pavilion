import { Injectable } from "@nestjs/common";
import { PrismaService } from "../common/prisma.service";

@Injectable()
export class FeedbackService {
  constructor(private prisma: PrismaService) {}

  async create(dto: { role: string; module: string; description: string; severity?: string; suggestion?: string }, userId?: number) {
    return this.prisma.pilotFeedback.create({
      data: {
        userId: userId ?? null,
        role: dto.role,
        module: dto.module,
        description: dto.description,
        severity: dto.severity || "normal",
        suggestion: dto.suggestion || null,
      },
    });
  }

  async findAll(page = 1, pageSize = 50) {
    pageSize = Math.min(pageSize, 100);
    const skip = (page - 1) * pageSize;
    const [items, total] = await Promise.all([
      this.prisma.pilotFeedback.findMany({
        orderBy: { createdAt: "desc" },
        skip, take: pageSize,
      }),
      this.prisma.pilotFeedback.count(),
    ]);
    return { items, total, page, pageSize };
  }

  async updateStatus(id: number, status: string) {
    return this.prisma.pilotFeedback.update({
      where: { id },
      data: { status },
    });
  }
}
