import { BadRequestException, ForbiddenException, Injectable, NotFoundException } from "@nestjs/common";
import { PrismaService } from "../common/prisma.service";
import { getPreviousShanghaiWeekRange, getShanghaiWeekRange } from "../common/shanghai-time";
import {
  FINAL_IMAGE_TASK_STATUSES,
  WEEKLY_PLAN_DESIGNER_ROLE,
  WEEKLY_PLAN_ITEM_SOURCE,
  WEEKLY_PLAN_ITEM_STATUS,
  WEEKLY_PLAN_MANAGER_ROLES,
  WEEKLY_PLAN_STATUS,
  WeeklyPlanItemSource,
} from "./weekly-plan.constants";

type AssignmentType = "INITIAL" | "REASSIGN";

@Injectable()
export class WeeklyPlansService {
  constructor(private prisma: PrismaService) {}

  private assertManager(role: string) {
    if (!WEEKLY_PLAN_MANAGER_ROLES.includes(role)) {
      throw new ForbiddenException("当前账号无权限操作周计划");
    }
  }

  private assertReadable(role: string) {
    if (![...WEEKLY_PLAN_MANAGER_ROLES, WEEKLY_PLAN_DESIGNER_ROLE].includes(role)) {
      throw new ForbiddenException("当前账号无权限访问周计划");
    }
  }

  private async getPlanOrThrow(id: number, tx: any = this.prisma) {
    const plan = await tx.weeklyPlan.findUnique({ where: { id } });
    if (!plan) throw new NotFoundException("周计划不存在");
    return plan;
  }

  private assertMutable(plan: { status: string }) {
    if (![WEEKLY_PLAN_STATUS.DRAFT, WEEKLY_PLAN_STATUS.ACTIVE].includes(plan.status as any)) {
      throw new ForbiddenException("已关闭的周计划不可修改");
    }
  }

  private async recordAudit(tx: any, action: string, operatorId: number, resourceId: number, metadata: Record<string, unknown>) {
    return tx.auditEvent.create({
      data: {
        resourceType: "weekly_plan",
        resourceId,
        action,
        operatorId,
        metadata: JSON.stringify(metadata),
      },
    });
  }

  private sourceForPlan(plan: { status: string }): WeeklyPlanItemSource {
    if (plan.status === WEEKLY_PLAN_STATUS.DRAFT) return WEEKLY_PLAN_ITEM_SOURCE.INITIAL_PLAN;
    if (plan.status === WEEKLY_PLAN_STATUS.ACTIVE) return WEEKLY_PLAN_ITEM_SOURCE.MIDWEEK_ADD;
    throw new ForbiddenException("已关闭的周计划不可添加任务");
  }

  private resolveAssignmentRange(weekStart: string | undefined, assignedAt: Date) {
    if (!weekStart) return getShanghaiWeekRange(assignedAt);
    if (!/^\d{4}-\d{2}-\d{2}$/.test(weekStart)) {
      throw new BadRequestException("weekStart must use YYYY-MM-DD");
    }
    const anchor = new Date(`${weekStart}T12:00:00+08:00`);
    if (Number.isNaN(anchor.getTime())) throw new BadRequestException("Invalid plan week");
    const range = getShanghaiWeekRange(anchor);
    const monday = new Intl.DateTimeFormat("en-CA", { timeZone: "Asia/Shanghai" }).format(range.start);
    if (monday !== weekStart) throw new BadRequestException("weekStart must be a Monday in Asia/Shanghai");
    if (range.start.getTime() < getShanghaiWeekRange().start.getTime()) {
      throw new ForbiddenException("Cannot assign a task into a historical week plan");
    }
    return range;
  }

  /** Used only by the decree-assignment workflow; never exposed as a manual item API. */
  async addAssignedTasksInTransaction(
    tx: any,
    imageTasks: Array<{ id: number; designerId?: number | null }>,
    designerId: number,
    userId: number,
    assignedAt: Date,
    assignmentType: AssignmentType,
    weekStart?: string,
  ) {
    const range = this.resolveAssignmentRange(weekStart, assignedAt);
    let plan = await tx.weeklyPlan.findUnique({ where: { weekStart: range.start } });
    if (!plan) {
      plan = await tx.weeklyPlan.create({
        data: { weekStart: range.start, weekEnd: range.end, status: WEEKLY_PLAN_STATUS.DRAFT, createdById: userId },
      });
      await this.recordAudit(tx, "weekly_plan_created", userId, plan.id, { weekStart: range.start.toISOString(), createdByAssignment: true });
    }
    this.assertMutable(plan);
    const source = this.sourceForPlan(plan);

    for (const imageTask of imageTasks) {
      const activeElsewhere = await tx.weeklyPlanItem.findFirst({
        where: {
          imageTaskId: imageTask.id,
          status: { not: WEEKLY_PLAN_ITEM_STATUS.CANCELLED },
          weeklyPlan: { id: { not: plan.id }, status: { in: [WEEKLY_PLAN_STATUS.DRAFT, WEEKLY_PLAN_STATUS.ACTIVE] } },
        },
      });
      if (activeElsewhere) throw new ForbiddenException("同一图片任务不能同时纳入两个有效周计划");

      const existing = await tx.weeklyPlanItem.findUnique({
        where: { weeklyPlanId_imageTaskId: { weeklyPlanId: plan.id, imageTaskId: imageTask.id } },
      });
      if (!existing) {
        const item = await tx.weeklyPlanItem.create({
          data: { weeklyPlanId: plan.id, imageTaskId: imageTask.id, designerId, source, status: WEEKLY_PLAN_ITEM_STATUS.PLANNED, plannedAt: assignedAt },
        });
        await this.recordAudit(tx, "weekly_plan_item_added", userId, plan.id, { weeklyPlanItemId: item.id, imageTaskId: imageTask.id, designerId, source });
      } else if (assignmentType === "REASSIGN" && existing.designerId !== designerId) {
        await tx.weeklyPlanItem.update({ where: { id: existing.id }, data: { designerId, reassignedAt: assignedAt } });
        await this.recordAudit(tx, "weekly_plan_item_reassigned", userId, plan.id, { weeklyPlanItemId: existing.id, imageTaskId: imageTask.id, designerId });
      }
    }
    await this.recordAudit(tx, assignmentType === "INITIAL" ? "weekly_plan_decree_assigned" : "weekly_plan_decree_reassigned", userId, plan.id, {
      weeklyPlanId: plan.id,
      imageTaskIds: imageTasks.map((item) => item.id),
      imageCount: imageTasks.length,
      designerId,
      weekStart: range.start.toISOString(),
      source,
    });
    return plan;
  }

  private async validateImageTask(tx: any, imageTaskId: number) {
    const imageTask = await tx.imageTask.findUnique({
      where: { id: imageTaskId },
      include: { task: { select: { id: true, serialNumber: true, deletedAt: true } } },
    });
    if (!imageTask || imageTask.deletedAt || imageTask.task.deletedAt) {
      throw new NotFoundException("图片任务不存在或已删除");
    }
    if (!imageTask.designerId) {
      throw new BadRequestException("图片任务尚未分配设计师，不能加入周计划");
    }
    if (FINAL_IMAGE_TASK_STATUSES.includes(imageTask.status)) {
      throw new BadRequestException("已完成的图片任务不能加入本周计划");
    }
    return imageTask;
  }

  private async createItemInTransaction(
    tx: any,
    plan: { id: number; status: string },
    imageTaskId: number,
    userId: number,
    source?: WeeklyPlanItemSource,
  ) {
    this.assertMutable(plan);
    const imageTask = await this.validateImageTask(tx, imageTaskId);
    const existing = await tx.weeklyPlanItem.findUnique({
      where: { weeklyPlanId_imageTaskId: { weeklyPlanId: plan.id, imageTaskId } },
    });
    if (existing?.status === WEEKLY_PLAN_ITEM_STATUS.CANCELLED) {
      throw new BadRequestException("该任务已在本周计划中取消，请使用恢复接口");
    }
    if (existing) throw new BadRequestException("同一图片任务不能重复加入本周计划");

    const item = await tx.weeklyPlanItem.create({
      data: {
        weeklyPlanId: plan.id,
        imageTaskId,
        designerId: imageTask.designerId,
        source: source || this.sourceForPlan(plan),
        status: WEEKLY_PLAN_ITEM_STATUS.PLANNED,
        plannedAt: new Date(),
      },
    });
    await this.recordAudit(tx, "weekly_plan_item_added", userId, plan.id, {
      weeklyPlanId: plan.id,
      weeklyPlanItemId: item.id,
      imageTaskId,
      designerId: imageTask.designerId,
      source: item.source,
    });
    return item;
  }

  async getCurrent(userId: number, role: string) {
    this.assertReadable(role);
    const range = getShanghaiWeekRange();
    const plan = await this.prisma.weeklyPlan.findUnique({ where: { weekStart: range.start } });
    if (!plan) return { plan: null, weekStart: range.start, weekEnd: range.end };
    if (role === WEEKLY_PLAN_DESIGNER_ROLE) {
      return {
        plan,
        mine: await this.getDesignerSummary(plan.id, userId),
      };
    }
    return { plan };
  }

  async createCurrent(userId: number, role: string) {
    this.assertManager(role);
    const range = getShanghaiWeekRange();
    const existing = await this.prisma.weeklyPlan.findUnique({ where: { weekStart: range.start } });
    if (existing) return { plan: existing, created: false };
    try {
      const plan = await this.prisma.$transaction(async (tx: any) => {
        const created = await tx.weeklyPlan.create({
          data: { weekStart: range.start, weekEnd: range.end, status: WEEKLY_PLAN_STATUS.DRAFT, createdById: userId },
        });
        await this.recordAudit(tx, "weekly_plan_created", userId, created.id, {
          weeklyPlanId: created.id,
          weekStart: created.weekStart.toISOString(),
          weekEnd: created.weekEnd.toISOString(),
        });
        return created;
      });
      return { plan, created: true };
    } catch (error: any) {
      if (error?.code === "P2002") {
        const plan = await this.prisma.weeklyPlan.findUniqueOrThrow({ where: { weekStart: range.start } });
        return { plan, created: false };
      }
      throw error;
    }
  }

  async getPlan(id: number, userId: number, role: string) {
    this.assertReadable(role);
    const plan = await this.getPlanOrThrow(id);
    if (role === WEEKLY_PLAN_DESIGNER_ROLE) {
      const current = getShanghaiWeekRange();
      if (plan.weekStart.getTime() !== current.start.getTime()) {
        throw new ForbiddenException("设计师只能查看当前周计划");
      }
      return { plan, mine: await this.getDesignerSummary(id, userId) };
    }
    return { plan };
  }

  async addItem(planId: number, imageTaskId: number, userId: number, role: string) {
    this.assertManager(role);
    return this.prisma.$transaction(async (tx: any) => {
      const plan = await this.getPlanOrThrow(planId, tx);
      return this.createItemInTransaction(tx, plan, imageTaskId, userId);
    });
  }

  async addItems(planId: number, imageTaskIds: number[], userId: number, role: string) {
    this.assertManager(role);
    const uniqueIds = [...new Set(imageTaskIds.map(Number))].slice(0, 100);
    const results: Array<Record<string, unknown>> = [];
    for (const imageTaskId of uniqueIds) {
      try {
        const item = await this.prisma.$transaction(async (tx: any) => {
          const plan = await this.getPlanOrThrow(planId, tx);
          return this.createItemInTransaction(tx, plan, imageTaskId, userId);
        });
        results.push({ imageTaskId, success: true, itemId: item.id });
      } catch (error: any) {
        results.push({ imageTaskId, success: false, message: error?.message || "添加失败" });
      }
    }
    return {
      total: uniqueIds.length,
      successCount: results.filter((item) => item.success).length,
      failedCount: results.filter((item) => !item.success).length,
      results,
    };
  }

  async activate(planId: number, allowEmpty: boolean, userId: number, role: string) {
    this.assertManager(role);
    return this.prisma.$transaction(async (tx: any) => {
      const plan = await this.getPlanOrThrow(planId, tx);
      if (plan.status !== WEEKLY_PLAN_STATUS.DRAFT) {
        throw new ForbiddenException("只有草稿周计划可以激活");
      }
      const itemCount = await tx.weeklyPlanItem.count({ where: { weeklyPlanId: planId } });
      if (!itemCount && !allowEmpty) {
        throw new BadRequestException("空周计划默认不可激活，请明确确认后再激活");
      }
      const activatedAt = new Date();
      const updated = await tx.weeklyPlan.update({
        where: { id: planId },
        data: { status: WEEKLY_PLAN_STATUS.ACTIVE, activatedAt, activatedById: userId },
      });
      await this.recordAudit(tx, "weekly_plan_activated", userId, planId, { weeklyPlanId: planId, activatedAt: activatedAt.toISOString(), allowEmpty });
      return updated;
    });
  }

  async close(planId: number, userId: number, role: string) {
    this.assertManager(role);
    return this.prisma.$transaction(async (tx: any) => {
      const plan = await this.getPlanOrThrow(planId, tx);
      if (plan.status !== WEEKLY_PLAN_STATUS.ACTIVE) {
        throw new ForbiddenException("只有进行中的周计划可以关闭");
      }
      const closedAt = new Date();
      const updated = await tx.weeklyPlan.update({
        where: { id: planId },
        data: { status: WEEKLY_PLAN_STATUS.CLOSED, closedAt, closedById: userId },
      });
      await this.recordAudit(tx, "weekly_plan_closed", userId, planId, { weeklyPlanId: planId, closedAt: closedAt.toISOString() });
      return updated;
    });
  }

  async cancelItem(planId: number, itemId: number, cancelReason: string, userId: number, role: string) {
    this.assertManager(role);
    if (!cancelReason.trim()) throw new BadRequestException("取消周计划项必须填写原因");
    return this.prisma.$transaction(async (tx: any) => {
      const plan = await this.getPlanOrThrow(planId, tx);
      this.assertMutable(plan);
      const item = await tx.weeklyPlanItem.findFirst({ where: { id: itemId, weeklyPlanId: planId } });
      if (!item) throw new NotFoundException("周计划项不存在");
      if (item.status === WEEKLY_PLAN_ITEM_STATUS.COMPLETED) throw new BadRequestException("已完成的周计划项不能取消");
      if (item.status === WEEKLY_PLAN_ITEM_STATUS.CANCELLED) throw new BadRequestException("周计划项已取消");
      const cancelledAt = new Date();
      const updated = await tx.weeklyPlanItem.update({
        where: { id: itemId },
        data: { status: WEEKLY_PLAN_ITEM_STATUS.CANCELLED, cancelledAt, cancelledById: userId, cancelReason: cancelReason.trim() },
      });
      await this.recordAudit(tx, "weekly_plan_item_cancelled", userId, planId, {
        weeklyPlanId: planId, weeklyPlanItemId: itemId, imageTaskId: item.imageTaskId, cancelReason: cancelReason.trim(), cancelledAt: cancelledAt.toISOString(),
      });
      return updated;
    });
  }

  async restoreItem(planId: number, itemId: number, reason: string, userId: number, role: string) {
    this.assertManager(role);
    if (!reason.trim()) throw new BadRequestException("恢复周计划项必须填写原因");
    return this.prisma.$transaction(async (tx: any) => {
      const plan = await this.getPlanOrThrow(planId, tx);
      this.assertMutable(plan);
      const item = await tx.weeklyPlanItem.findFirst({ where: { id: itemId, weeklyPlanId: planId } });
      if (!item) throw new NotFoundException("周计划项不存在");
      if (item.status !== WEEKLY_PLAN_ITEM_STATUS.CANCELLED) throw new BadRequestException("只有已取消的周计划项可以恢复");
      const updated = await tx.weeklyPlanItem.update({
        where: { id: itemId },
        data: { status: WEEKLY_PLAN_ITEM_STATUS.PLANNED, cancelledAt: null, cancelledById: null, cancelReason: null },
      });
      await this.recordAudit(tx, "weekly_plan_item_restored", userId, planId, {
        weeklyPlanId: planId, weeklyPlanItemId: itemId, imageTaskId: item.imageTaskId, reason: reason.trim(),
      });
      return updated;
    });
  }

  async getCarryOverPreview(planId: number, _userId: number, role: string) {
    this.assertManager(role);
    const plan = await this.getPlanOrThrow(planId);
    const previous = getPreviousShanghaiWeekRange(plan.weekStart);
    const previousPlan = await this.prisma.weeklyPlan.findUnique({
      where: { weekStart: previous.start },
      include: { items: { where: { status: WEEKLY_PLAN_ITEM_STATUS.PLANNED }, include: { imageTask: true } } },
    });
    if (!previousPlan || previousPlan.status !== WEEKLY_PLAN_STATUS.CLOSED) {
      return { previousPlan: null, candidates: [], excluded: [] };
    }
    const candidates: any[] = [];
    const excluded: any[] = [];
    for (const item of previousPlan.items) {
      if (FINAL_IMAGE_TASK_STATUSES.includes(item.imageTask.status)) {
        excluded.push({ imageTaskId: item.imageTaskId, reason: "任务已完成" });
      } else if (!item.imageTask.designerId) {
        excluded.push({ imageTaskId: item.imageTaskId, reason: "当前没有设计师" });
      } else {
        candidates.push({ imageTaskId: item.imageTaskId, previousItemId: item.id, designerId: item.imageTask.designerId, imageTitle: item.imageTask.imageTitle });
      }
    }
    return { previousPlan: { id: previousPlan.id, weekStart: previousPlan.weekStart, weekEnd: previousPlan.weekEnd }, candidates, excluded };
  }

  async carryOver(planId: number, imageTaskIds: number[], userId: number, role: string) {
    this.assertManager(role);
    const preview = await this.getCarryOverPreview(planId, userId, role);
    const allowed = new Set(preview.candidates.map((item: any) => item.imageTaskId));
    const results: Array<Record<string, unknown>> = [];
    for (const imageTaskId of [...new Set(imageTaskIds.map(Number))].slice(0, 100)) {
      if (!allowed.has(imageTaskId)) {
        results.push({ imageTaskId, success: false, message: "任务不满足跨周结转条件" });
        continue;
      }
      try {
        const item = await this.prisma.$transaction(async (tx: any) => {
          const plan = await this.getPlanOrThrow(planId, tx);
          return this.createItemInTransaction(tx, plan, imageTaskId, userId, WEEKLY_PLAN_ITEM_SOURCE.CARRY_OVER);
        });
        results.push({ imageTaskId, success: true, itemId: item.id });
      } catch (error: any) {
        results.push({ imageTaskId, success: false, message: error?.message || "结转失败" });
      }
    }
    return { total: results.length, successCount: results.filter((item) => item.success).length, failedCount: results.filter((item) => !item.success).length, results };
  }

  async completeApprovedImageTaskInTransaction(tx: any, imageTaskId: number, userId: number, approvedAt: Date) {
    const range = getShanghaiWeekRange(approvedAt);
    const plan = await tx.weeklyPlan.findUnique({ where: { weekStart: range.start } });
    if (!plan || plan.status !== WEEKLY_PLAN_STATUS.ACTIVE) return { state: "NO_ACTIVE_PLAN" };
    const item = await tx.weeklyPlanItem.findUnique({ where: { weeklyPlanId_imageTaskId: { weeklyPlanId: plan.id, imageTaskId } } });
    if (!item || item.status !== WEEKLY_PLAN_ITEM_STATUS.PLANNED) return { state: item ? item.status : "NO_ITEM" };
    const updated = await tx.weeklyPlanItem.update({
      where: { id: item.id },
      data: { status: WEEKLY_PLAN_ITEM_STATUS.COMPLETED, completedAt: approvedAt },
    });
    await this.recordAudit(tx, "weekly_plan_item_completed", userId, plan.id, {
      weeklyPlanId: plan.id, weeklyPlanItemId: item.id, imageTaskId, completedAt: approvedAt.toISOString(),
    });
    return { state: "COMPLETED", weeklyPlanId: plan.id, weeklyPlanItemId: updated.id };
  }

  private async getDesignerSummary(planId: number, designerId: number) {
    const [plannedCount, completedCount, remainingCount] = await Promise.all([
      this.prisma.weeklyPlanItem.count({ where: { weeklyPlanId: planId, designerId, status: { not: WEEKLY_PLAN_ITEM_STATUS.CANCELLED } } }),
      this.prisma.weeklyPlanItem.count({ where: { weeklyPlanId: planId, designerId, status: WEEKLY_PLAN_ITEM_STATUS.COMPLETED } }),
      this.prisma.weeklyPlanItem.count({ where: { weeklyPlanId: planId, designerId, status: WEEKLY_PLAN_ITEM_STATUS.PLANNED } }),
    ]);
    return { designerId, plannedCount, completedCount, remainingCount, completionRate: plannedCount ? completedCount / plannedCount : null };
  }

  async getSummary(planId: number, userId: number, role: string) {
    this.assertReadable(role);
    const plan = await this.getPlanOrThrow(planId);
    if (role === WEEKLY_PLAN_DESIGNER_ROLE) return this.getDesignerSummary(planId, userId);
    const [initialPlanCount, midweekAddCount, carryOverCount, activePlanCount, completedCount, remainingCount, cancelledCount, actualApprovedCount] = await Promise.all([
      this.prisma.weeklyPlanItem.count({ where: { weeklyPlanId: planId, source: WEEKLY_PLAN_ITEM_SOURCE.INITIAL_PLAN, status: { not: WEEKLY_PLAN_ITEM_STATUS.CANCELLED } } }),
      this.prisma.weeklyPlanItem.count({ where: { weeklyPlanId: planId, source: WEEKLY_PLAN_ITEM_SOURCE.MIDWEEK_ADD, status: { not: WEEKLY_PLAN_ITEM_STATUS.CANCELLED } } }),
      this.prisma.weeklyPlanItem.count({ where: { weeklyPlanId: planId, source: WEEKLY_PLAN_ITEM_SOURCE.CARRY_OVER, status: { not: WEEKLY_PLAN_ITEM_STATUS.CANCELLED } } }),
      this.prisma.weeklyPlanItem.count({ where: { weeklyPlanId: planId, status: { not: WEEKLY_PLAN_ITEM_STATUS.CANCELLED } } }),
      this.prisma.weeklyPlanItem.count({ where: { weeklyPlanId: planId, status: WEEKLY_PLAN_ITEM_STATUS.COMPLETED } }),
      this.prisma.weeklyPlanItem.count({ where: { weeklyPlanId: planId, status: WEEKLY_PLAN_ITEM_STATUS.PLANNED } }),
      this.prisma.weeklyPlanItem.count({ where: { weeklyPlanId: planId, status: WEEKLY_PLAN_ITEM_STATUS.CANCELLED } }),
      this.prisma.imageTask.count({ where: { deletedAt: null, approvedAt: { gte: plan.weekStart, lt: plan.weekEnd } } }),
    ]);
    return {
      weekStart: plan.weekStart, weekEnd: plan.weekEnd, status: plan.status,
      initialPlanCount, midweekAddCount, carryOverCount, activePlanCount, completedCount, remainingCount, cancelledCount,
      completionRate: activePlanCount ? completedCount / activePlanCount : null,
      actualApprovedCount,
    };
  }

  async getDesigners(planId: number, _userId: number, role: string) {
    this.assertManager(role);
    await this.getPlanOrThrow(planId);
    const items = await this.prisma.weeklyPlanItem.findMany({ where: { weeklyPlanId: planId }, select: { designerId: true, status: true } });
    const designerIds = [...new Set(items.map((item) => item.designerId))];
    const users = await this.prisma.user.findMany({ where: { id: { in: designerIds } }, select: { id: true, displayName: true, username: true } });
    return users.map((user) => {
      const own = items.filter((item) => item.designerId === user.id);
      const plannedCount = own.filter((item) => item.status !== WEEKLY_PLAN_ITEM_STATUS.CANCELLED).length;
      const completedCount = own.filter((item) => item.status === WEEKLY_PLAN_ITEM_STATUS.COMPLETED).length;
      const remainingCount = own.filter((item) => item.status === WEEKLY_PLAN_ITEM_STATUS.PLANNED).length;
      return { designerId: user.id, designerName: user.displayName || user.username, plannedCount, completedCount, remainingCount, completionRate: plannedCount ? completedCount / plannedCount : null };
    });
  }

  async getItems(planId: number, query: any, userId: number, role: string) {
    this.assertReadable(role);
    const plan = await this.getPlanOrThrow(planId);
    if (role === WEEKLY_PLAN_DESIGNER_ROLE) {
      const current = getShanghaiWeekRange();
      if (plan.weekStart.getTime() !== current.start.getTime()) throw new ForbiddenException("设计师只能查看当前周计划");
    }
    const page = Math.max(1, Number(query.page || 1));
    const pageSize = Math.min(100, Math.max(1, Number(query.pageSize || 20)));
    const where: any = { weeklyPlanId: planId };
    where.designerId = role === WEEKLY_PLAN_DESIGNER_ROLE ? userId : query.designerId ? Number(query.designerId) : undefined;
    if (query.source) where.source = query.source;
    if (query.status) where.status = query.status;
    if (query.requirementType) where.imageTask = { task: { requirementTypeId: Number(query.requirementType) } };
    const [total, items] = await Promise.all([
      this.prisma.weeklyPlanItem.count({ where }),
      this.prisma.weeklyPlanItem.findMany({
        where, skip: (page - 1) * pageSize, take: pageSize, orderBy: [{ plannedAt: "asc" }, { id: "asc" }],
        include: { designer: { select: { id: true, displayName: true, username: true } }, imageTask: { include: { task: { select: { id: true, serialNumber: true, productCode: true, requirementTypeId: true } } } }, },
      }),
    ]);
    return { items, total, page, pageSize };
  }
}
