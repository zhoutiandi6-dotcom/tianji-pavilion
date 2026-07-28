import { BadRequestException, ConflictException, ForbiddenException, Injectable, NotFoundException } from "@nestjs/common";
import { PrismaService } from "../common/prisma.service";
import { getShanghaiWeekRange } from "../common/shanghai-time";
import { WEEKLY_OPERATIONS_APPROVAL_MANAGER_ROLES } from "./weekly-plan.constants";

type WeekRange = { start: Date; end: Date };
type SourceType = "INITIAL_PLAN" | "MIDWEEK_ADDITION" | "AUTO_ADDITION";

const ACTIVE_IMAGE_WHERE = { deletedAt: null, status: { not: "CANCELLED" } };

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
    if (!/^\d{4}-\d{2}-\d{2}$/.test(weekStart)) throw new BadRequestException("weekStart must use YYYY-MM-DD");
    const anchor = new Date(`${weekStart}T12:00:00+08:00`);
    if (Number.isNaN(anchor.getTime())) throw new BadRequestException("Invalid plan week");
    const range = getShanghaiWeekRange(anchor);
    if (this.formatShanghaiDate(range.start) !== weekStart) throw new BadRequestException("weekStart must be a Monday in Asia/Shanghai");
    return range;
  }

  private assertWritableRange(range: WeekRange) {
    const current = getShanghaiWeekRange();
    const next = getShanghaiWeekRange(new Date(current.start.getTime() + 7 * 24 * 60 * 60 * 1000));
    if (![current.start.getTime(), next.start.getTime()].includes(range.start.getTime())) {
      throw new ForbiddenException("Only the current or next Shanghai week can be changed");
    }
  }

  private sourceFor(range: WeekRange, activeCount: number, automatic = false): SourceType {
    if (automatic) return "AUTO_ADDITION";
    const current = getShanghaiWeekRange();
    return activeCount === 0 || range.start.getTime() > current.start.getTime() ? "INITIAL_PLAN" : "MIDWEEK_ADDITION";
  }

  private async getOrCreatePlan(tx: any, range: WeekRange, managerId: number, createdById: number) {
    const existing = await tx.weeklyOperationsApprovalPlan.findUnique({
      where: { managerId_weekStart: { managerId, weekStart: range.start } },
    });
    if (existing) return { plan: existing, created: false };
    const plan = await tx.weeklyOperationsApprovalPlan.create({
      data: { managerId, weekStart: range.start, weekEnd: range.end, createdById },
    });
    await tx.auditEvent.create({
      data: {
        resourceType: "weekly_operations_approval_plan",
        resourceId: plan.id,
        action: "weekly_operations_approval_plan_initialized",
        operatorId: createdById,
        metadata: JSON.stringify({ weekStart: range.start.toISOString() }),
      },
    });
    return { plan, created: true };
  }

  private async activeImageCount(tx: any, decreeId: number) {
    return tx.imageTask.count({ where: { taskId: decreeId, ...ACTIVE_IMAGE_WHERE } });
  }

  private isCancelled(task: any) {
    return Boolean(task?.deletedAt || task?.workflowStatus === "CANCELLED");
  }

  async initializeWeek(weekStart: string, userId: number, role: string) {
    this.assertManager(role);
    const range = this.resolveRange(weekStart);
    this.assertWritableRange(range);
    return this.prisma.$transaction(async (tx: any) => {
      const result = await this.getOrCreatePlan(tx, range, userId, userId);
      return { ...result, weekStart: range.start, weekEnd: range.end };
    });
  }

  async listCandidates(userId: number, role: string, weekStart?: string, search?: string) {
    this.assertManager(role);
    const range = this.resolveRange(weekStart);
    this.assertWritableRange(range);
    const [plan, activeItems, tasks] = await Promise.all([
      this.prisma.weeklyOperationsApprovalPlan.findUnique({ where: { managerId_weekStart: { managerId: userId, weekStart: range.start } } }),
      this.prisma.weeklyOperationsApprovalPlanItem.findMany({ where: { removedAt: null }, select: { decreeId: true } }),
      this.prisma.task.findMany({
        where: { workflowStatus: "SUBMITTED", deletedAt: null },
        include: {
          store: { select: { name: true } },
          requirementType: { select: { name: true } },
          creator: { select: { displayName: true, username: true } },
          imageTasks: { where: ACTIVE_IMAGE_WHERE, select: { id: true } },
          submissionRecords: { orderBy: { submissionSequence: "desc" }, take: 1, select: { submissionType: true, submittedAt: true } },
        },
        orderBy: { submittedAt: "asc" },
      }),
    ]);
    const unavailable = new Set(activeItems.map((item: any) => item.decreeId));
    const keyword = search?.trim().toLowerCase();
    const items = tasks
      .filter((task: any) => !unavailable.has(task.id) && task.imageTasks.length > 0)
      .filter((task: any) => !keyword || [task.serialNumber, task.productCode, task.store?.name, task.requesterName, task.creator?.displayName, task.creator?.username].some((value) => value?.toLowerCase().includes(keyword)))
      .map((task: any) => ({
        id: task.id,
        serialNumber: task.serialNumber,
        storeName: task.store?.name || "-",
        requester: task.requesterName || task.creator?.displayName || task.creator?.username || "-",
        productCode: task.productCode || "-",
        requirementType: task.requirementType?.name || "-",
        effectiveImageCount: task.imageTasks.length,
        firstSubmittedAt: task.submittedAt,
        latestSubmittedAt: task.submissionRecords[0]?.submittedAt || task.submittedAt,
        submissionType: task.submissionRecords[0]?.submissionType || "INITIAL",
        workflowStatus: task.workflowStatus,
      }));
    return { weekStart: range.start, planId: plan?.id || null, items, total: items.length };
  }

  async addDecrees(dto: { weekStart: string; decreeIds: number[] }, userId: number, role: string) {
    this.assertManager(role);
    const range = this.resolveRange(dto.weekStart);
    this.assertWritableRange(range);
    const decreeIds = [...new Set(dto.decreeIds.map(Number).filter(Number.isInteger))];
    if (!decreeIds.length) throw new BadRequestException("Select at least one decree");
    return this.prisma.$transaction(async (tx: any) => {
      const { plan, created } = await this.getOrCreatePlan(tx, range, userId, userId);
      const [existingOnPlan, activeMemberships, decrees] = await Promise.all([
        tx.weeklyOperationsApprovalPlanItem.findMany({ where: { planId: plan.id, decreeId: { in: decreeIds } }, select: { decreeId: true } }),
        tx.weeklyOperationsApprovalPlanItem.findMany({ where: { decreeId: { in: decreeIds }, removedAt: null }, select: { decreeId: true, planId: true } }),
        tx.task.findMany({ where: { id: { in: decreeIds }, workflowStatus: "SUBMITTED", deletedAt: null }, select: { id: true, serialNumber: true } }),
      ]);
      if (decrees.length !== decreeIds.length) throw new BadRequestException("Only pending operations approvals can be added to a plan");
      if (existingOnPlan.length || activeMemberships.length) throw new ConflictException("One or more decrees are already in an active weekly approval plan");
      const activeCount = await tx.weeklyOperationsApprovalPlanItem.count({ where: { planId: plan.id, removedAt: null } });
      const sourceType = this.sourceFor(range, activeCount);
      const snapshots = await Promise.all(decreeIds.map(async (decreeId) => ({ decreeId, count: await this.activeImageCount(tx, decreeId) })));
      const invalid = snapshots.filter((item) => item.count <= 0);
      if (invalid.length) throw new BadRequestException("Selected decree has no active image tasks");
      await tx.weeklyOperationsApprovalPlanItem.createMany({
        data: snapshots.map((item) => ({ planId: plan.id, decreeId: item.decreeId, plannedImageCountSnapshot: item.count, sourceType, addedById: userId })),
      });
      await tx.auditEvent.create({
        data: { resourceType: "weekly_operations_approval_plan", resourceId: plan.id, action: "weekly_operations_approval_plan_items_added", operatorId: userId, metadata: JSON.stringify({ decreeIds, sourceType, created }) },
      });
      return { planId: plan.id, addedDecreeCount: decreeIds.length, addedImageCount: snapshots.reduce((sum, item) => sum + item.count, 0), sourceType };
    });
  }

  async removeDecreeItem(itemId: number, reason: string, userId: number, role: string) {
    this.assertManager(role);
    if (!reason?.trim()) throw new BadRequestException("Removal reason is required");
    return this.prisma.$transaction(async (tx: any) => {
      const item = await tx.weeklyOperationsApprovalPlanItem.findUnique({
        where: { id: itemId },
        include: { plan: true, decree: { include: { approvalRecords: { where: { action: "OPS_APPROVED" }, select: { id: true } } } } },
      });
      if (!item || item.plan.managerId !== userId) throw new NotFoundException("Plan item not found");
      this.assertWritableRange({ start: item.plan.weekStart, end: item.plan.weekEnd });
      if (item.removedAt) throw new ConflictException("Plan item has already been removed");
      if (item.decree.approvalRecords.length || item.decree.workflowStatus === "OPS_APPROVED") throw new BadRequestException("Approved decrees cannot be removed from plan history");
      const removedAt = new Date();
      const result = await tx.weeklyOperationsApprovalPlanItem.updateMany({ where: { id: itemId, removedAt: null }, data: { removedAt, removedById: userId, removedReason: reason.trim() } });
      if (result.count !== 1) throw new ConflictException("Plan item changed by another operator");
      await tx.auditEvent.create({ data: { resourceType: "weekly_operations_approval_plan", resourceId: item.planId, action: "weekly_operations_approval_plan_item_removed", operatorId: userId, metadata: JSON.stringify({ itemId, decreeId: item.decreeId, reason: reason.trim(), removedAt }) } });
      return { itemId, removedAt };
    });
  }

  async moveDecreeItem(itemId: number, weekStart: string, reason: string, userId: number, role: string) {
    this.assertManager(role);
    if (!reason?.trim()) throw new BadRequestException("Move reason is required");
    const targetRange = this.resolveRange(weekStart);
    this.assertWritableRange(targetRange);
    return this.prisma.$transaction(async (tx: any) => {
      const item = await tx.weeklyOperationsApprovalPlanItem.findUnique({
        where: { id: itemId },
        include: { plan: true, decree: { include: { approvalRecords: { where: { action: "OPS_APPROVED" }, select: { id: true } } } } },
      });
      if (!item || item.plan.managerId !== userId) throw new NotFoundException("Plan item not found");
      this.assertWritableRange({ start: item.plan.weekStart, end: item.plan.weekEnd });
      if (item.removedAt) throw new ConflictException("Plan item has already been removed");
      if (item.decree.approvalRecords.length || item.decree.workflowStatus === "OPS_APPROVED") {
        throw new BadRequestException("Approved decrees cannot be moved between plan weeks");
      }
      if (item.plan.weekStart.getTime() === targetRange.start.getTime()) {
        throw new BadRequestException("Decree is already arranged for this plan week");
      }

      const activeInTarget = await tx.weeklyOperationsApprovalPlanItem.findFirst({
        where: { decreeId: item.decreeId, removedAt: null, plan: { weekStart: targetRange.start } },
        select: { id: true },
      });
      if (activeInTarget) throw new ConflictException("Decree is already in the destination plan week");

      const { plan: targetPlan } = await this.getOrCreatePlan(tx, targetRange, userId, userId);
      const movedAt = new Date();
      const imageCount = await this.activeImageCount(tx, item.decreeId);
      if (!imageCount) throw new BadRequestException("Decree has no active image tasks");
      const removedReason = `Moved to ${this.formatShanghaiDate(targetRange.start)}: ${reason.trim()}`;
      const sourceUpdate = await tx.weeklyOperationsApprovalPlanItem.updateMany({
        where: { id: item.id, removedAt: null },
        data: { removedAt: movedAt, removedById: userId, removedReason },
      });
      if (sourceUpdate.count !== 1) throw new ConflictException("Plan item changed by another operator");

      const existingDestination = await tx.weeklyOperationsApprovalPlanItem.findUnique({
        where: { planId_decreeId: { planId: targetPlan.id, decreeId: item.decreeId } },
      });
      const sourceType = this.sourceFor(targetRange, await tx.weeklyOperationsApprovalPlanItem.count({ where: { planId: targetPlan.id, removedAt: null } }));
      const destination = existingDestination
        ? await tx.weeklyOperationsApprovalPlanItem.update({
            where: { id: existingDestination.id },
            data: { plannedImageCountSnapshot: imageCount, sourceType, addedById: userId, addedAt: movedAt, removedAt: null, removedById: null, removedReason: null },
          })
        : await tx.weeklyOperationsApprovalPlanItem.create({
            data: { planId: targetPlan.id, decreeId: item.decreeId, plannedImageCountSnapshot: imageCount, sourceType, addedById: userId, addedAt: movedAt },
          });
      await tx.auditEvent.create({
        data: {
          resourceType: "weekly_operations_approval_plan_item",
          resourceId: destination.id,
          action: "weekly_operations_approval_plan_item_moved",
          operatorId: userId,
          metadata: JSON.stringify({ decreeId: item.decreeId, sourceItemId: item.id, destinationItemId: destination.id, fromWeekStart: item.plan.weekStart.toISOString(), toWeekStart: targetRange.start.toISOString(), imageCount, reason: reason.trim(), movedAt: movedAt.toISOString() }),
        },
      });
      return { itemId: destination.id, fromWeekStart: item.plan.weekStart, toWeekStart: targetRange.start, movedAt };
    });
  }

  async ensureAutoAddedInTransaction(tx: any, decreeId: number, managerId: number, approvedAt: Date) {
    const range = getShanghaiWeekRange(approvedAt);
    const activeMembership = await tx.weeklyOperationsApprovalPlanItem.findFirst({ where: { decreeId, removedAt: null }, select: { id: true, planId: true } });
    if (activeMembership) return { added: false, reason: "already_planned" };
    const { plan } = await this.getOrCreatePlan(tx, range, managerId, managerId);
    const imageCount = await this.activeImageCount(tx, decreeId);
    if (!imageCount) throw new BadRequestException("Decree has no active image tasks");
    const item = await tx.weeklyOperationsApprovalPlanItem.create({ data: { planId: plan.id, decreeId, plannedImageCountSnapshot: imageCount, sourceType: "AUTO_ADDITION", addedById: managerId } });
    await tx.auditEvent.create({ data: { resourceType: "weekly_operations_approval_plan", resourceId: plan.id, action: "weekly_operations_approval_plan_item_auto_added", operatorId: managerId, metadata: JSON.stringify({ itemId: item.id, decreeId, imageCount, approvedAt }) } });
    return { added: true, planId: plan.id, itemId: item.id, imageCount };
  }

  /**
   * Keep a pending decree's workload snapshot aligned with its effective image
   * tasks. Once an operations approval exists the snapshot is historical data
   * and must never be changed by later edits.
   */
  async refreshPendingDecreeSnapshotInTransaction(
    tx: any,
    decreeId: number,
    actorId: number,
    reason: string,
    occurredAt = new Date(),
  ) {
    const items = await tx.weeklyOperationsApprovalPlanItem.findMany({
      where: { decreeId, removedAt: null },
      include: {
        decree: {
          select: {
            deletedAt: true,
            approvalRecords: { where: { action: "OPS_APPROVED" }, select: { id: true }, take: 1 },
          },
        },
      },
    });
    if (!items.length) return { updatedItemIds: [], imageCount: null };

    const imageCount = await this.activeImageCount(tx, decreeId);
    const updatedItemIds: number[] = [];
    for (const item of items) {
      // Approval freezes the workload used by the historical plan. A deleted
      // decree is accounted for separately as a cancelled plan item.
      if (item.decree.deletedAt || item.decree.approvalRecords.length || item.plannedImageCountSnapshot === imageCount) continue;

      await tx.weeklyOperationsApprovalPlanItem.update({
        where: { id: item.id },
        data: { plannedImageCountSnapshot: imageCount },
      });
      await tx.auditEvent.create({
        data: {
          resourceType: "weekly_operations_approval_plan_item",
          resourceId: item.id,
          action: "weekly_operations_approval_plan_item_snapshot_refreshed",
          operatorId: actorId,
          metadata: JSON.stringify({
            decreeId,
            planId: item.planId,
            previousImageCount: item.plannedImageCountSnapshot,
            newImageCount: imageCount,
            reason,
            occurredAt: occurredAt.toISOString(),
          }),
        },
      });
      updatedItemIds.push(item.id);
    }
    return { updatedItemIds, imageCount };
  }

  async getWeekOverview(userId: number, role: string, weekStart?: string) {
    this.assertManager(role);
    const range = this.resolveRange(weekStart);
    const plan = await this.prisma.weeklyOperationsApprovalPlan.findUnique({
      where: { managerId_weekStart: { managerId: userId, weekStart: range.start } },
      include: {
        items: {
          include: {
            decree: { include: { store: { select: { name: true } }, creator: { select: { displayName: true, username: true } }, approvalRecords: { where: { action: "OPS_APPROVED", approverId: userId, createdAt: { gte: range.start, lt: range.end } }, select: { createdAt: true }, orderBy: { createdAt: "desc" } } } },
            addedBy: { select: { displayName: true, username: true } },
            removedBy: { select: { displayName: true, username: true } },
          },
          orderBy: { addedAt: "asc" },
        },
      },
    });
    const items = (plan?.items || []).map((item: any) => ({
      id: item.id, decreeId: item.decreeId, serialNumber: item.decree.serialNumber, storeName: item.decree.store?.name || "-", requester: item.decree.requesterName || item.decree.creator?.displayName || item.decree.creator?.username || "-", productCode: item.decree.productCode || "-", plannedImageCountSnapshot: item.plannedImageCountSnapshot, sourceType: item.sourceType, addedAt: item.addedAt, removedAt: item.removedAt, removedReason: item.removedReason, workflowStatus: item.decree.workflowStatus, approvedAt: item.decree.approvalRecords[0]?.createdAt || null, isCancelled: this.isCancelled(item.decree),
    }));
    const activeItems = items.filter((item: any) => !item.removedAt && !item.isCancelled);
    const approvedItems = activeItems.filter((item: any) => Boolean(item.approvedAt));
    const sum = (values: any[]) => values.reduce((total, item) => total + item.plannedImageCountSnapshot, 0);
    const plannedImageCount = sum(activeItems);
    const approvedImageCount = sum(approvedItems);
    const cancelledImageCount = sum(items.filter((item: any) => !item.removedAt && item.isCancelled));
    const pendingImageCount = sum(activeItems.filter((item: any) => item.workflowStatus === "SUBMITTED"));
    const returnedImageCount = sum(activeItems.filter((item: any) => item.workflowStatus === "OPS_REJECTED"));
    const current = getShanghaiWeekRange();
    const next = getShanghaiWeekRange(new Date(current.start.getTime() + 7 * 24 * 60 * 60 * 1000));
    return {
      weekStart: range.start,
      weekEnd: range.end,
      plan: plan ? { id: plan.id, createdAt: plan.createdAt, updatedAt: plan.updatedAt } : null,
      items,
      isHistorical: range.start.getTime() < current.start.getTime(),
      canManage: WEEKLY_OPERATIONS_APPROVAL_MANAGER_ROLES.includes(role),
      canConfigure: [current.start.getTime(), next.start.getTime()].includes(range.start.getTime()),
      summary: {
        plannedImageCount,
        plannedDecreeCount: activeItems.length,
        approvedImageCount,
        pendingImageCount,
        returnedImageCount,
        cancelledImageCount,
        remainingImageCount: Math.max(plannedImageCount - approvedImageCount, 0),
        completionRate: plannedImageCount ? Math.round((approvedImageCount / plannedImageCount) * 1000) / 10 : null,
        initialPlanImageCount: sum(activeItems.filter((item: any) => item.sourceType === "INITIAL_PLAN")),
        midweekAdditionImageCount: sum(activeItems.filter((item: any) => item.sourceType === "MIDWEEK_ADDITION")),
        autoAdditionImageCount: sum(activeItems.filter((item: any) => item.sourceType === "AUTO_ADDITION")),
      },
    };
  }
}
