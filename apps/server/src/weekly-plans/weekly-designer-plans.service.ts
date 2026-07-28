import { BadRequestException, ForbiddenException, Injectable, NotFoundException } from "@nestjs/common";
import { PrismaService } from "../common/prisma.service";
import { getShanghaiWeekRange } from "../common/shanghai-time";
import { WEEKLY_PLAN_ITEM_STATUS, WEEKLY_PLAN_MANAGER_ROLES, WEEKLY_PLAN_DESIGNER_ROLE } from "./weekly-plan.constants";
import { UpsertWeeklyDesignerPlanDto } from "./dto/upsert-weekly-designer-plan.dto";

type WeekRange = { start: Date; end: Date };

@Injectable()
export class WeeklyDesignerPlansService {
  constructor(private readonly prisma: PrismaService) {}

  private assertReadable(role: string) {
    if (![...WEEKLY_PLAN_MANAGER_ROLES, WEEKLY_PLAN_DESIGNER_ROLE].includes(role)) {
      throw new ForbiddenException("Current account cannot access designer weekly plans");
    }
  }

  private assertManager(role: string) {
    if (!WEEKLY_PLAN_MANAGER_ROLES.includes(role)) {
      throw new ForbiddenException("Only design managers or administrators can manage designer weekly plans");
    }
  }

  private shanghaiDate(value: Date) {
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
    if (this.shanghaiDate(range.start) !== weekStart) {
      throw new BadRequestException("weekStart must be a Monday in Asia/Shanghai");
    }
    return range;
  }

  private assertWritableRange(range: WeekRange) {
    const current = getShanghaiWeekRange();
    const offset = range.start.getTime() - current.start.getTime();
    if (offset !== 0 && offset !== 7 * 24 * 60 * 60 * 1000) {
      throw new ForbiddenException("Only the current or next Shanghai week can be changed");
    }
  }

  private async activeDesigners() {
    return this.prisma.user.findMany({
      where: { isActive: true, role: { name: WEEKLY_PLAN_DESIGNER_ROLE } },
      select: { id: true, username: true, displayName: true },
      orderBy: [{ displayName: "asc" }, { username: "asc" }],
    });
  }

  private async assertDesigner(designerId: number) {
    const designer = await this.prisma.user.findFirst({
      where: { id: designerId, isActive: true, role: { name: WEEKLY_PLAN_DESIGNER_ROLE } },
      select: { id: true, username: true, displayName: true },
    });
    if (!designer) throw new NotFoundException("Active designer not found");
    return designer;
  }

  async initializeWeek(weekStart: string, userId: number, role: string) {
    this.assertManager(role);
    const range = this.resolveRange(weekStart);
    this.assertWritableRange(range);
    const designers = await this.activeDesigners();
    const result = await this.prisma.$transaction(async (tx: any) => {
      const weeklyPlan = await tx.weeklyPlan.upsert({
        where: { weekStart: range.start },
        create: { weekStart: range.start, weekEnd: range.end, status: "DRAFT", createdById: userId },
        update: {},
      });
      const created: number[] = [];
      for (const designer of designers) {
        const existing = await tx.weeklyDesignerPlan.findUnique({
          where: { designerId_weekStart: { designerId: designer.id, weekStart: range.start } },
        });
        if (!existing) {
          const plan = await tx.weeklyDesignerPlan.create({
            data: { designerId: designer.id, weekStart: range.start, weekEnd: range.end, targetImageCount: 0, createdById: userId },
          });
          created.push(plan.id);
        }
      }
      return { created, weeklyPlan };
    });
    return { weekStart: range.start, weekEnd: range.end, createdCount: result.created.length, designerCount: designers.length, weeklyPlanId: result.weeklyPlan.id };
  }

  async upsertTarget(dto: UpsertWeeklyDesignerPlanDto, userId: number, role: string) {
    this.assertManager(role);
    const range = this.resolveRange(dto.weekStart);
    this.assertWritableRange(range);
    await this.assertDesigner(dto.designerId);
    const reason = dto.reason.trim();
    const target = Number(dto.targetImageCount);
    return this.prisma.$transaction(async (tx: any) => {
      await tx.weeklyPlan.upsert({
        where: { weekStart: range.start },
        create: { weekStart: range.start, weekEnd: range.end, status: "DRAFT", createdById: userId },
        update: {},
      });
      const existing = await tx.weeklyDesignerPlan.findUnique({
        where: { designerId_weekStart: { designerId: dto.designerId, weekStart: range.start } },
      });
      if (!existing) {
        const created = await tx.weeklyDesignerPlan.create({
          data: { designerId: dto.designerId, weekStart: range.start, weekEnd: range.end, targetImageCount: target, createdById: userId },
        });
        await tx.auditEvent.create({
          data: { resourceType: "weekly_designer_plan", resourceId: created.id, action: "weekly_designer_plan_created", operatorId: userId, metadata: JSON.stringify({ designerId: dto.designerId, weekStart: range.start.toISOString(), targetImageCount: target, reason }) },
        });
        return { plan: created, created: true, adjusted: false };
      }
      if (existing.targetImageCount === target) return { plan: existing, created: false, adjusted: false };
      const updated = await tx.weeklyDesignerPlan.update({ where: { id: existing.id }, data: { targetImageCount: target } });
      await tx.weeklyDesignerPlanAdjustment.create({
        data: { planId: existing.id, previousTarget: existing.targetImageCount, newTarget: target, reason, adjustedById: userId },
      });
      await tx.auditEvent.create({
        data: { resourceType: "weekly_designer_plan", resourceId: existing.id, action: "weekly_designer_plan_adjusted", operatorId: userId, metadata: JSON.stringify({ designerId: dto.designerId, weekStart: range.start.toISOString(), previousTarget: existing.targetImageCount, newTarget: target, reason }) },
      });
      return { plan: updated, created: false, adjusted: true };
    });
  }

  async getWeekOverview(userId: number, role: string, weekStart?: string) {
    this.assertReadable(role);
    const range = this.resolveRange(weekStart);
    const [designers, targetPlans, weeklyPlan, completedTasks] = await Promise.all([
      this.activeDesigners(),
      this.prisma.weeklyDesignerPlan.findMany({
        where: { weekStart: range.start },
        include: { designer: { select: { id: true, username: true, displayName: true, isActive: true } } },
      }),
      this.prisma.weeklyPlan.findUnique({
        where: { weekStart: range.start },
        include: {
          items: {
            where: { status: { not: WEEKLY_PLAN_ITEM_STATUS.CANCELLED }, imageTask: { deletedAt: null, task: { deletedAt: null } } },
            include: { imageTask: { select: { id: true, taskId: true, imageTitle: true, status: true, designerId: true, approvedAt: true, task: { select: { id: true, serialNumber: true, productCode: true, workflowStatus: true, store: { select: { name: true } }, requirementType: { select: { name: true } } } } } }, designer: { select: { id: true, username: true, displayName: true } } },
          },
        },
      }),
      this.prisma.imageTask.findMany({
        where: { deletedAt: null, designerId: { not: null }, approvedAt: { gte: range.start, lt: range.end }, task: { deletedAt: null } },
        select: { id: true, designerId: true },
      }),
    ]);

    const planByDesigner = new Map(targetPlans.map((plan) => [plan.designerId, plan]));
    const completedByDesigner = new Map<number, number>();
    completedTasks.forEach((task) => completedByDesigner.set(task.designerId!, (completedByDesigner.get(task.designerId!) || 0) + 1));
    const allDesigners = new Map<number, { id: number; username: string; displayName: string }>();
    designers.forEach((designer) => allDesigners.set(designer.id, designer));
    targetPlans.forEach((plan) => allDesigners.set(plan.designerId, plan.designer));

    const rows = [...allDesigners.values()].map((designer) => {
      const memberships = (weeklyPlan?.items || []).filter((item) => item.designerId === designer.id && item.imageTask.designerId === designer.id);
      const targetPlan = planByDesigner.get(designer.id);
      const targetImageCount = targetPlan?.targetImageCount || 0;
      const assignedCount = memberships.length;
      const pendingReviewCount = memberships.filter((item) => item.imageTask.status === "SUBMITTED_FOR_REVIEW").length;
      const completedCount = completedByDesigner.get(designer.id) || 0;
      const remainingTargetCount = Math.max(targetImageCount - completedCount, 0);
      const completionRate = targetImageCount ? Math.round((completedCount / targetImageCount) * 1000) / 10 : null;
      return {
        designerId: designer.id,
        designerName: designer.displayName || designer.username,
        targetPlanId: targetPlan?.id || null,
        targetImageCount,
        assignedCount,
        completedCount,
        pendingReviewCount,
        remainingTargetCount,
        completionRate,
        isOverTarget: targetImageCount > 0 && completedCount > targetImageCount,
      };
    }).sort((left, right) => left.designerName.localeCompare(right.designerName, "zh-CN"));

    const visibleRows = role === WEEKLY_PLAN_DESIGNER_ROLE ? rows.filter((row) => row.designerId === userId) : rows;
    const visibleItems = role === WEEKLY_PLAN_DESIGNER_ROLE ? (weeklyPlan?.items || []).filter((item) => item.designerId === userId) : (weeklyPlan?.items || []);
    const decrees = [...new Map(visibleItems.map((item) => [item.imageTask.taskId, item])).values()].map((item) => ({
      taskId: item.imageTask.task.id,
      serialNumber: item.imageTask.task.serialNumber,
      storeName: item.imageTask.task.store?.name || "-",
      productCode: item.imageTask.task.productCode || "-",
      requirementType: item.imageTask.task.requirementType?.name || "-",
      imageCount: visibleItems.filter((entry) => entry.imageTask.taskId === item.imageTask.taskId).length,
      designerName: item.designer.displayName || item.designer.username,
      workflowStatus: item.imageTask.task.workflowStatus,
      plannedAt: item.plannedAt,
    }));
    const summary = visibleRows.reduce((total, row) => ({
      targetImageCount: total.targetImageCount + row.targetImageCount,
      assignedCount: total.assignedCount + row.assignedCount,
      completedCount: total.completedCount + row.completedCount,
      pendingReviewCount: total.pendingReviewCount + row.pendingReviewCount,
      remainingTargetCount: total.remainingTargetCount + row.remainingTargetCount,
      overTargetCount: total.overTargetCount + (row.isOverTarget ? 1 : 0),
    }), { targetImageCount: 0, assignedCount: 0, completedCount: 0, pendingReviewCount: 0, remainingTargetCount: 0, overTargetCount: 0 });
    return {
      weekStart: range.start,
      weekEnd: range.end,
      plan: weeklyPlan ? { id: weeklyPlan.id, status: weeklyPlan.status } : null,
      canManage: WEEKLY_PLAN_MANAGER_ROLES.includes(role),
      canConfigure: WEEKLY_PLAN_MANAGER_ROLES.includes(role) && [getShanghaiWeekRange().start.getTime(), getShanghaiWeekRange(new Date(getShanghaiWeekRange().start.getTime() + 7 * 24 * 60 * 60 * 1000)).start.getTime()].includes(range.start.getTime()),
      isHistorical: range.start.getTime() < getShanghaiWeekRange().start.getTime(),
      summary: { ...summary, designerCount: visibleRows.length, imageCount: summary.assignedCount, remainingCount: summary.remainingTargetCount, decreeCount: decrees.length, completionRate: summary.targetImageCount ? Math.round((summary.completedCount / summary.targetImageCount) * 1000) / 10 : null },
      designers: visibleRows.map((row) => ({ ...row, imageCount: row.assignedCount, remainingCount: row.remainingTargetCount })),
      decrees,
    };
  }

  async getAdjustments(userId: number, role: string, weekStart?: string) {
    this.assertReadable(role);
    const range = this.resolveRange(weekStart);
    const where: any = { plan: { weekStart: range.start } };
    if (role === WEEKLY_PLAN_DESIGNER_ROLE) where.plan.designerId = userId;
    return this.prisma.weeklyDesignerPlanAdjustment.findMany({
      where,
      include: { plan: { include: { designer: { select: { id: true, username: true, displayName: true } } } }, adjustedBy: { select: { id: true, username: true, displayName: true } } },
      orderBy: { adjustedAt: "desc" },
    });
  }

  async getUnassigned(_userId: number, role: string) {
    this.assertManager(role);
    const tasks = await this.prisma.task.findMany({
      where: { deletedAt: null, workflowStatus: "OPS_APPROVED", imageTasks: { some: { deletedAt: null, status: "PENDING_ASSIGNMENT", designerId: null } } },
      include: { store: { select: { name: true } }, requirementType: { select: { name: true } }, creator: { select: { displayName: true, username: true } }, imageTasks: { where: { deletedAt: null, status: "PENDING_ASSIGNMENT", designerId: null }, select: { id: true } } },
      orderBy: { updatedAt: "asc" },
    });
    const items = tasks.map((task) => ({ id: task.id, serialNumber: task.serialNumber, storeName: task.store?.name || "-", productCode: task.productCode || "-", requirementType: task.requirementType?.name || task.taskType || "-", requesterName: task.creator.displayName || task.creator.username, priority: task.priority, imageCount: task.imageTasks.length }));
    return { items, total: items.length, imageCount: items.reduce((total, item) => total + item.imageCount, 0) };
  }

  async getChanges(_userId: number, role: string, weekStart?: string) {
    this.assertManager(role);
    const range = this.resolveRange(weekStart);
    const plan = await this.prisma.weeklyPlan.findUnique({ where: { weekStart: range.start } });
    if (!plan) return [];
    const events = await this.prisma.auditEvent.findMany({
      where: { resourceType: "weekly_plan", resourceId: plan.id },
      orderBy: { createdAt: "desc" },
      take: 100,
    });
    const operatorIds = [...new Set(events.map((event) => event.operatorId).filter((id): id is number => Boolean(id)))];
    const operators = await this.prisma.user.findMany({ where: { id: { in: operatorIds } }, select: { id: true, username: true, displayName: true } });
    const operatorMap = new Map(operators.map((operator) => [operator.id, operator]));
    return events.map((event) => ({ ...event, operator: event.operatorId ? operatorMap.get(event.operatorId) || null : null }));
  }
}
