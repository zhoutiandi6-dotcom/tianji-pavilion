import { BadRequestException, ForbiddenException, Injectable, NotFoundException } from "@nestjs/common";
import { PrismaService } from "../common/prisma.service";

export const FEEDBACK_STATUSES = ["PENDING", "PROCESSING", "COMPLETED", "DEFERRED", "REJECTED"] as const;
const ADMIN_ROLES = ["OWNER", "SUPER_ADMIN"];
const FEEDBACK_ROLES = ["OPERATION", "OPERATION_MANAGER", "DESIGNER", "DESIGN_MANAGER", ...ADMIN_ROLES];
const REASON_REQUIRED_STATUSES = ["COMPLETED", "DEFERRED", "REJECTED"];

@Injectable()
export class FeedbackService {
  constructor(private prisma: PrismaService) {}

  canAccess(role: string) { return FEEDBACK_ROLES.includes(role); }

  async create(dto: { module: string; title?: string; description: string; severity?: string; suggestion?: string }, user: { sub: number; role: string }) {
    if (!this.canAccess(user.role)) throw new ForbiddenException("当前角色无权使用反馈模块");
    const module = String(dto.module || "").trim();
    const description = String(dto.description || "").trim();
    if (!module || !description) throw new BadRequestException("反馈类型和内容不能为空");
    return this.prisma.pilotFeedback.create({ data: {
      userId: user.sub, role: user.role, module, title: String(dto.title || "").trim() || null,
      description, severity: dto.severity || "normal", suggestion: String(dto.suggestion || "").trim() || null, status: "PENDING",
    } });
  }

  private listInclude() { return { attachments: { where: { deletedAt: null }, orderBy: { uploadedAt: "asc" as const } } }; }
  async findMine(userId: number, page = 1, pageSize = 50) { return this.findPage({ userId }, page, pageSize, true); }
  async findShared(page = 1, pageSize = 50) { return this.findPage({}, page, pageSize, false); }

  private async findPage(where: any, page: number, pageSize: number, includeLatestNote: boolean) {
    pageSize = Math.min(Math.max(pageSize, 1), 100); page = Math.max(page, 1);
    const [items, total] = await Promise.all([
      this.prisma.pilotFeedback.findMany({ where, orderBy: { createdAt: "desc" }, skip: (page - 1) * pageSize, take: pageSize, include: this.listInclude() }),
      this.prisma.pilotFeedback.count({ where }),
    ]);
    return { items: items.map((item: any) => ({ ...item, latestHandlingNote: includeLatestNote ? item.handlingNote : undefined })), total, page, pageSize };
  }

  async findOne(id: number) {
    const feedback = await this.prisma.pilotFeedback.findUnique({ where: { id }, include: {
      ...this.listInclude(), statusHistory: { orderBy: { createdAt: "desc" }, include: { operator: { select: { id: true, displayName: true } } } },
    } });
    if (!feedback) throw new NotFoundException("反馈不存在");
    return feedback;
  }

  async updateStatus(id: number, status: string, note: string | undefined, user: { sub: number; role: string }) {
    if (!FEEDBACK_STATUSES.includes(status as any)) throw new BadRequestException("无效的反馈状态");
    if (!ADMIN_ROLES.includes(user.role)) {
      // A manager-to-member scope relation does not exist yet. Do not turn a role into global rejection power.
      if (user.role === "OPERATION_MANAGER" && status === "REJECTED") throw new ForbiddenException("当前缺少运营主管反馈管理范围依据");
      throw new ForbiddenException("当前角色不能修改反馈状态");
    }
    const normalizedNote = String(note || "").trim() || null;
    if (REASON_REQUIRED_STATUSES.includes(status) && !normalizedNote) throw new BadRequestException(status === "REJECTED" ? "不采纳必须填写不采纳原因" : "该状态必须填写处理说明");
    return this.prisma.$transaction(async (tx: any) => {
      const current = await tx.pilotFeedback.findUnique({ where: { id } });
      if (!current) throw new NotFoundException("反馈不存在");
      if (current.status === status) throw new BadRequestException("反馈已处于该状态");
      const operator = await tx.user.findUnique({ where: { id: user.sub }, select: { displayName: true } });
      const feedback = await tx.pilotFeedback.update({ where: { id }, data: { status, handlingNote: normalizedNote } });
      const history = await tx.feedbackStatusHistory.create({ data: { feedbackId: id, fromStatus: current.status, toStatus: status, operatorId: user.sub, operatorName: operator?.displayName || null, note: normalizedNote } });
      await tx.auditEvent.create({ data: { resourceType: "feedback", resourceId: id, action: "feedback_status_changed", operatorId: user.sub, correlationId: `feedback_${id}`, metadata: JSON.stringify({ fromStatus: current.status, toStatus: status, note: normalizedNote }) } });
      return { feedback, history };
    });
  }
}
