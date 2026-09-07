import { BadRequestException, ForbiddenException, Injectable } from "@nestjs/common";
import { PrismaService } from "../common/prisma.service";
import { TaskVisibilityService } from "../common/task-visibility.service";
import { formatShanghaiDate, getShanghaiWeekRange, getShanghaiWeekRangeForWeekStart } from "../common/shanghai-time";
import { FINAL_IMAGE_TASK_STATUSES, WEEKLY_PLAN_DESIGNER_ROLE, WEEKLY_PLAN_ITEM_STATUS, WEEKLY_PLAN_MANAGER_ROLES } from "./weekly-plan.constants";

type WeekRange = { start: Date; end: Date };

@Injectable()
export class WeeklyDesignerPlansService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly visibility: TaskVisibilityService,
  ) {}

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

  private resolveRange(weekStart?: string): WeekRange {
    if (!weekStart) return getShanghaiWeekRange();
    const range = getShanghaiWeekRangeForWeekStart(weekStart);
    if (!range) throw new BadRequestException("weekStart must be a Monday in Asia/Shanghai and use YYYY-MM-DD");
    return range;
  }

  private assertWritableRange(range: WeekRange) {
    const current = getShanghaiWeekRange();
    const next = getShanghaiWeekRange(new Date(current.start.getTime() + 7 * 24 * 60 * 60 * 1000));
    if (range.start.getTime() !== current.start.getTime() && range.start.getTime() !== next.start.getTime()) {
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

  async initializeWeek(weekStart: string, userId: number, role: string) {
    this.assertManager(role);
    const range = this.resolveRange(weekStart);
    this.assertWritableRange(range);
    const weeklyPlan = await this.prisma.$transaction(async (tx: any) => {
      const plan = await tx.weeklyPlan.upsert({
        where: { weekStart: range.start },
        create: { weekStart: range.start, weekEnd: range.end, status: "DRAFT", createdById: userId },
        update: {},
      });
      await tx.auditEvent.create({
        data: {
          resourceType: "weekly_plan",
          resourceId: plan.id,
          action: "weekly_plan_initialized",
          operatorId: userId,
          metadata: JSON.stringify({ weekStart: formatShanghaiDate(range.start) }),
        },
      });
      return plan;
    });
    return { weekStart: formatShanghaiDate(range.start), weekEnd: formatShanghaiDate(range.end), weeklyPlanId: weeklyPlan.id, status: weeklyPlan.status };
  }

  async getWeekOverview(userId: number, role: string, weekStart?: string) {
    this.assertReadable(role);
    const range = this.resolveRange(weekStart);
    const [designers, weeklyPlan] = await Promise.all([
      this.activeDesigners(),
      this.prisma.weeklyPlan.findUnique({
        where: { weekStart: range.start },
        include: {
          items: {
            where: { status: { not: WEEKLY_PLAN_ITEM_STATUS.CANCELLED }, imageTask: { deletedAt: null, task: { deletedAt: null } } },
            include: {
              designer: { select: { id: true, username: true, displayName: true } },
              imageTask: {
                select: {
                  id: true, taskId: true, imageTitle: true, status: true, designerId: true, approvedAt: true,
                  task: { select: { id: true, serialNumber: true, productCode: true, workflowStatus: true, store: { select: { name: true } }, requirementType: { select: { name: true } } } },
                },
              },
            },
          },
        },
      }),
    ]);

    const allItems = weeklyPlan?.items || [];
    const visibleItems = role === WEEKLY_PLAN_DESIGNER_ROLE ? allItems.filter((item) => item.designerId === userId) : allItems;
    const visibleDesignerIds = role === WEEKLY_PLAN_DESIGNER_ROLE ? [userId] : designers.map((designer) => designer.id);
    const designerById = new Map(designers.map((designer) => [designer.id, designer]));
    const assignmentAnomalies = visibleItems
      .filter((item) => item.designerId !== item.imageTask.designerId)
      .map((item) => ({ imageTaskId: item.imageTaskId, taskId: item.imageTask.taskId, plannedDesignerId: item.designerId, currentDesignerId: item.imageTask.designerId }));

    const rows = visibleDesignerIds.map((designerId) => {
      const designer = designerById.get(designerId) || { id: designerId, username: "-", displayName: "-" };
      const memberships = visibleItems.filter((item) => item.designerId === designerId && item.imageTask.designerId === designerId);
      const plannedImageCount = memberships.length;
      const completedCount = memberships.filter((item) => item.imageTask.approvedAt && item.imageTask.approvedAt >= range.start && item.imageTask.approvedAt < range.end && FINAL_IMAGE_TASK_STATUSES.includes(item.imageTask.status)).length;
      const inProgressCount = memberships.filter((item) => item.imageTask.status === "IN_PROGRESS").length;
      const pendingReviewCount = memberships.filter((item) => item.imageTask.status === "SUBMITTED_FOR_REVIEW").length;
      const revisionCount = memberships.filter((item) => item.imageTask.status === "REVISION_REQUIRED").length;
      const decreeCount = new Set(memberships.map((item) => item.imageTask.taskId)).size;
      return {
        designerId,
        designerName: designer.displayName || designer.username,
        decreeCount,
        plannedImageCount,
        assignedCount: plannedImageCount,
        inProgressCount,
        pendingReviewCount,
        completedCount,
        revisionCount,
        remainingCount: Math.max(plannedImageCount - completedCount, 0),
        completionRate: plannedImageCount ? Math.round((completedCount / plannedImageCount) * 1000) / 10 : null,
      };
    }).sort((left, right) => left.designerName.localeCompare(right.designerName, "zh-CN"));

    const decrees = [...new Map(visibleItems.map((item) => [item.imageTask.taskId, item])).values()].map((item) => {
      const decreeItems = visibleItems.filter((entry) => entry.imageTask.taskId === item.imageTask.taskId);
      const designerIds = [...new Set(decreeItems.map((entry) => entry.designerId))];
      return {
        taskId: item.imageTask.task.id,
        serialNumber: item.imageTask.task.serialNumber,
        storeName: item.imageTask.task.store?.name || "-",
        productCode: item.imageTask.task.productCode || "-",
        requirementType: item.imageTask.task.requirementType?.name || "-",
        plannedImageCount: decreeItems.length,
        designerId: designerIds.length === 1 ? designerIds[0] : null,
        designerName: designerIds.length === 1 ? (decreeItems[0]?.designer.displayName || decreeItems[0]?.designer.username || "-") : "数据异常",
        workflowStatus: item.imageTask.task.workflowStatus,
        plannedAt: item.plannedAt,
        isAssignmentAnomaly: designerIds.length !== 1 || decreeItems.some((entry) => entry.designerId !== entry.imageTask.designerId),
        isCompleted: decreeItems.every((entry) => FINAL_IMAGE_TASK_STATUSES.includes(entry.imageTask.status)),
      };
    });

    const summary = rows.reduce((total, row) => ({
      decreeCount: total.decreeCount + row.decreeCount,
      plannedImageCount: total.plannedImageCount + row.plannedImageCount,
      assignedCount: total.assignedCount + row.assignedCount,
      inProgressCount: total.inProgressCount + row.inProgressCount,
      pendingReviewCount: total.pendingReviewCount + row.pendingReviewCount,
      completedCount: total.completedCount + row.completedCount,
      revisionCount: total.revisionCount + row.revisionCount,
      remainingCount: total.remainingCount + row.remainingCount,
    }), { decreeCount: 0, plannedImageCount: 0, assignedCount: 0, inProgressCount: 0, pendingReviewCount: 0, completedCount: 0, revisionCount: 0, remainingCount: 0 });

    const currentRange = getShanghaiWeekRange();
    const nextRange = getShanghaiWeekRange(new Date(currentRange.start.getTime() + 7 * 24 * 60 * 60 * 1000));
    const isHistorical = range.start.getTime() < currentRange.start.getTime();
    const canConfigure = WEEKLY_PLAN_MANAGER_ROLES.includes(role)
      && [currentRange.start.getTime(), nextRange.start.getTime()].includes(range.start.getTime());

    return {
      weekStart: formatShanghaiDate(range.start),
      weekEnd: formatShanghaiDate(range.end),
      plan: weeklyPlan ? { id: weeklyPlan.id, status: weeklyPlan.status } : null,
      canManage: WEEKLY_PLAN_MANAGER_ROLES.includes(role),
      canConfigure,
      isHistorical,
      summary: { ...summary, designerCount: rows.length, completionRate: summary.plannedImageCount ? Math.round((summary.completedCount / summary.plannedImageCount) * 1000) / 10 : null },
      designers: rows,
      decrees,
      assignmentAnomalies,
    };
  }

  async removeDecreeFromPlan(taskId: number, weekStart: string, reason: string, userId: number, role: string) {
    this.assertManager(role);
    const range = this.resolveRange(weekStart);
    this.assertWritableRange(range);
    const trimmedReason = reason.trim();
    if (!trimmedReason) throw new BadRequestException("A removal reason is required");
    return this.prisma.$transaction(async (tx: any) => {
      const plan = await tx.weeklyPlan.findUnique({
        where: { weekStart: range.start },
        include: { items: { where: { imageTask: { taskId, deletedAt: null } }, include: { imageTask: { select: { status: true, designerId: true } } } } },
      });
      if (!plan || !plan.items.length) throw new BadRequestException("This decree is not in the selected weekly plan");
      if (plan.items.some((item: any) => item.status !== WEEKLY_PLAN_ITEM_STATUS.PLANNED || item.imageTask.status !== "NOT_STARTED")) {
        throw new ForbiddenException("Only decrees whose image tasks have not started can be removed from the plan");
      }
      const removedAt = new Date();
      for (const item of plan.items) {
        await tx.weeklyPlanItem.update({ where: { id: item.id }, data: { status: WEEKLY_PLAN_ITEM_STATUS.CANCELLED, cancelledAt: removedAt, cancelledById: userId, cancelReason: trimmedReason } });
      }
      await tx.auditEvent.create({
        data: { resourceType: "weekly_plan", resourceId: plan.id, action: "weekly_plan_decree_removed", operatorId: userId, metadata: JSON.stringify({ taskId, weekStart: formatShanghaiDate(range.start), reason: trimmedReason, removedAt: removedAt.toISOString(), imageTaskCount: plan.items.length }) },
      });
      return { taskId, removedImageCount: plan.items.length, removedAt };
    });
  }

  async getUnassigned(_userId: number, role: string) {
    this.assertManager(role);
    const tasks = await this.prisma.task.findMany({
      where: {
        AND: [
          this.visibility.designAssignmentWhere(role, _userId),
          { imageTasks: { some: { deletedAt: null } } },
        ],
      },
      include: { store: { select: { name: true } }, requirementType: { select: { name: true } }, creator: { select: { displayName: true, username: true } }, imageTasks: { where: { deletedAt: null }, select: { id: true, status: true, designerId: true } } },
      orderBy: { updatedAt: "asc" },
    });
    const items = tasks
      .filter((task) => task.imageTasks.length > 0 && task.imageTasks.every((imageTask) => imageTask.status === "PENDING_ASSIGNMENT" && !imageTask.designerId))
      .map((task) => ({ id: task.id, serialNumber: task.serialNumber, storeName: task.store?.name || "-", productCode: task.productCode || "-", requirementType: task.requirementType?.name || task.taskType || "-", requesterName: task.creator.displayName || task.creator.username, priority: task.priority, imageCount: task.imageTasks.length }));
    return { items, total: items.length, imageCount: items.reduce((total, item) => total + item.imageCount, 0) };
  }

  async getChanges(_userId: number, role: string, weekStart?: string) {
    this.assertManager(role);
    const range = this.resolveRange(weekStart);
    const plan = await this.prisma.weeklyPlan.findUnique({ where: { weekStart: range.start } });
    if (!plan) return [];
    const events = await this.prisma.auditEvent.findMany({ where: { resourceType: "weekly_plan", resourceId: plan.id }, orderBy: { createdAt: "desc" }, take: 100 });
    const operatorIds = [...new Set(events.map((event) => event.operatorId).filter((id): id is number => Boolean(id)))];
    const operators = await this.prisma.user.findMany({ where: { id: { in: operatorIds } }, select: { id: true, username: true, displayName: true } });
    const operatorMap = new Map(operators.map((operator) => [operator.id, operator]));
    return events.map((event) => ({ ...event, operator: event.operatorId ? operatorMap.get(event.operatorId) || null : null }));
  }
}
