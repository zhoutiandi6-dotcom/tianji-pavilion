import { BadRequestException, ForbiddenException, Injectable } from "@nestjs/common";
import { PrismaService } from "../common/prisma.service";
import { getShanghaiWeekRange } from "../common/shanghai-time";
import { WEEKLY_OPERATIONS_APPROVAL_MANAGER_ROLES } from "./weekly-plan.constants";
import { UpsertWeeklyOperationsApprovalPlanDto } from "./dto/upsert-weekly-operations-approval-plan.dto";

type WeekRange = { start: Date; end: Date };

@Injectable()
export class WeeklyOperationsApprovalPlansService {
  constructor(private readonly prisma: PrismaService) {}

  private assertManager(role: string) {
    if (!WEEKLY_OPERATIONS_APPROVAL_MANAGER_ROLES.includes(role)) {
      throw new ForbiddenException("Only operations managers or administrators can access approval release plans");
    }
  }

  private formatShanghaiDate(value: Date) {
    return new Intl.DateTimeFormat("en-CA", { timeZone: "Asia/Shanghai" }).format(value);
  }

  private resolveRange(weekStart?: string): WeekRange {
    if (!weekStart) return getShanghaiWeekRange();
    if (!/^\d{4}-\d{2}-\d{2}$/.test(weekStart)) {
      throw new BadRequestException("weekStart must use YYYY-MM-DD");
    }
    const anchor = new Date(`${weekStart}T12:00:00+08:00`);
    if (Number.isNaN(anchor.getTime())) throw new BadRequestException("Invalid plan week");
    const range = getShanghaiWeekRange(anchor);
    if (this.formatShanghaiDate(range.start) !== weekStart) {
      throw new BadRequestException("weekStart must be a Monday in Asia/Shanghai");
    }
    return range;
  }

  private assertWritableRange(range: WeekRange) {
    const current = getShanghaiWeekRange();
    const next = getShanghaiWeekRange(new Date(current.start.getTime() + 7 * 24 * 60 * 60 * 1000));
    if (![current.start.getTime(), next.start.getTime()].includes(range.start.getTime())) {
      throw new ForbiddenException("Only the current or next Shanghai week can be changed");
    }
  }

  private async approvalMetrics(managerId: number, range: WeekRange) {
    const approvals = await this.prisma.approvalRecord.findMany({
      where: {
        approverId: managerId,
        action: "OPS_APPROVED",
        createdAt: { gte: range.start, lt: range.end },
        task: { deletedAt: null },
      },
      select: { taskId: true },
      orderBy: { createdAt: "asc" },
    });
    const approvedTaskIds = [...new Set(approvals.map((record) => record.taskId))];
    const approvedImageCount = approvedTaskIds.length
      ? await this.prisma.imageTask.count({
        where: {
          taskId: { in: approvedTaskIds },
          deletedAt: null,
          status: { not: "CANCELLED" },
          task: { deletedAt: null },
        },
      })
      : 0;
    return { approvedTaskCount: approvedTaskIds.length, approvedImageCount };
  }

  async initializeWeek(weekStart: string, userId: number, role: string) {
    this.assertManager(role);
    const range = this.resolveRange(weekStart);
    this.assertWritableRange(range);
    const plan = await this.prisma.$transaction(async (tx: any) => {
      const existing = await tx.weeklyOperationsApprovalPlan.findUnique({
        where: { managerId_weekStart: { managerId: userId, weekStart: range.start } },
      });
      if (existing) return { plan: existing, created: false };
      const created = await tx.weeklyOperationsApprovalPlan.create({
        data: { managerId: userId, weekStart: range.start, weekEnd: range.end, targetImageCount: 0, createdById: userId },
      });
      await tx.auditEvent.create({
        data: { resourceType: "weekly_operations_approval_plan", resourceId: created.id, action: "weekly_operations_approval_plan_initialized", operatorId: userId, metadata: JSON.stringify({ weekStart: range.start.toISOString() }) },
      });
      return { plan: created, created: true };
    });
    return { ...plan, weekStart: range.start, weekEnd: range.end };
  }

  async upsertTarget(dto: UpsertWeeklyOperationsApprovalPlanDto, userId: number, role: string) {
    this.assertManager(role);
    const range = this.resolveRange(dto.weekStart);
    this.assertWritableRange(range);
    const target = Number(dto.targetImageCount);
    const reason = dto.reason.trim();
    return this.prisma.$transaction(async (tx: any) => {
      const existing = await tx.weeklyOperationsApprovalPlan.findUnique({
        where: { managerId_weekStart: { managerId: userId, weekStart: range.start } },
      });
      if (!existing) {
        const created = await tx.weeklyOperationsApprovalPlan.create({
          data: { managerId: userId, weekStart: range.start, weekEnd: range.end, targetImageCount: target, createdById: userId },
        });
        await tx.auditEvent.create({
          data: { resourceType: "weekly_operations_approval_plan", resourceId: created.id, action: "weekly_operations_approval_plan_created", operatorId: userId, metadata: JSON.stringify({ weekStart: range.start.toISOString(), targetImageCount: target, reason }) },
        });
        return { plan: created, created: true, adjusted: false };
      }
      if (existing.targetImageCount === target) return { plan: existing, created: false, adjusted: false };
      const updated = await tx.weeklyOperationsApprovalPlan.update({ where: { id: existing.id }, data: { targetImageCount: target } });
      await tx.weeklyOperationsApprovalPlanAdjustment.create({
        data: { planId: existing.id, previousTarget: existing.targetImageCount, newTarget: target, reason, adjustedById: userId },
      });
      await tx.auditEvent.create({
        data: { resourceType: "weekly_operations_approval_plan", resourceId: existing.id, action: "weekly_operations_approval_plan_adjusted", operatorId: userId, metadata: JSON.stringify({ weekStart: range.start.toISOString(), previousTarget: existing.targetImageCount, newTarget: target, reason }) },
      });
      return { plan: updated, created: false, adjusted: true };
    });
  }

  async getWeekOverview(userId: number, role: string, weekStart?: string) {
    this.assertManager(role);
    const range = this.resolveRange(weekStart);
    const [plan, metrics] = await Promise.all([
      this.prisma.weeklyOperationsApprovalPlan.findUnique({
        where: { managerId_weekStart: { managerId: userId, weekStart: range.start } },
        include: { adjustments: { orderBy: { adjustedAt: "desc" } } },
      }),
      this.approvalMetrics(userId, range),
    ]);
    const targetImageCount = plan?.targetImageCount || 0;
    const totalDecreaseCount = (plan?.adjustments || []).reduce((total, item) => total + Math.max(item.previousTarget - item.newTarget, 0), 0);
    const totalIncreaseCount = (plan?.adjustments || []).reduce((total, item) => total + Math.max(item.newTarget - item.previousTarget, 0), 0);
    const completionRate = targetImageCount ? Math.round((metrics.approvedImageCount / targetImageCount) * 1000) / 10 : null;
    const current = getShanghaiWeekRange();
    return {
      weekStart: range.start,
      weekEnd: range.end,
      plan: plan ? { id: plan.id, targetImageCount: plan.targetImageCount, createdAt: plan.createdAt, updatedAt: plan.updatedAt } : null,
      isHistorical: range.start.getTime() < current.start.getTime(),
      canManage: WEEKLY_OPERATIONS_APPROVAL_MANAGER_ROLES.includes(role),
      canConfigure: [current.start.getTime(), getShanghaiWeekRange(new Date(current.start.getTime() + 7 * 24 * 60 * 60 * 1000)).start.getTime()].includes(range.start.getTime()),
      summary: {
        targetImageCount,
        approvedImageCount: metrics.approvedImageCount,
        approvedTaskCount: metrics.approvedTaskCount,
        remainingTargetCount: Math.max(targetImageCount - metrics.approvedImageCount, 0),
        completionRate,
        overTargetImageCount: Math.max(metrics.approvedImageCount - targetImageCount, 0),
        adjustmentCount: plan?.adjustments.length || 0,
        increasedTargetImageCount: totalIncreaseCount,
        decreasedTargetImageCount: totalDecreaseCount,
      },
    };
  }

  async getAdjustments(userId: number, role: string, weekStart?: string) {
    this.assertManager(role);
    const range = this.resolveRange(weekStart);
    return this.prisma.weeklyOperationsApprovalPlanAdjustment.findMany({
      where: { plan: { managerId: userId, weekStart: range.start } },
      include: { adjustedBy: { select: { id: true, username: true, displayName: true } } },
      orderBy: { adjustedAt: "desc" },
    });
  }
}
