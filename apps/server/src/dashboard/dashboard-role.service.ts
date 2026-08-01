import { Injectable } from "@nestjs/common";
import { PrismaService } from "../common/prisma.service";
import { formatShanghaiDate, getPreviousShanghaiWeekRange, getShanghaiDayRange, getShanghaiWeekRange } from "../common/shanghai-time";
import { TaskVisibilityService } from "../common/task-visibility.service";
import { WeeklyDesignerPlansService } from "../weekly-plans/weekly-designer-plans.service";
import { WeeklyOperationsApprovalPlansService } from "../weekly-plans/weekly-operations-approval-plans.service";

const DAY_MS = 24 * 60 * 60 * 1000;

@Injectable()
export class DashboardRoleService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly visibility: TaskVisibilityService,
    private readonly weeklyDesignerPlans: WeeklyDesignerPlansService,
    private readonly weeklyOperationsPlans: WeeklyOperationsApprovalPlansService,
  ) {}

  async get(role: string, userId: number, includeAnalytics = true) {
    if (role === "DESIGN_MANAGER") return this.designManager(userId, role, includeAnalytics);
    if (role === "OPERATION_MANAGER") return this.operationManager(userId, role, includeAnalytics);
    if (role === "DESIGNER") return this.designer(userId);
    if (role === "OPERATION") return this.operator(userId);
    return { source: "database", refreshedAt: new Date().toISOString() };
  }

  private weekLabel(range: { start: Date; end: Date }) {
    const format = (value: Date) => new Intl.DateTimeFormat("zh-CN", { timeZone: "Asia/Shanghai", month: "2-digit", day: "2-digit" }).format(value);
    return `${format(range.start)}—${format(new Date(range.end.getTime() - 1))}`;
  }

  private serializeWeek(range: { start: Date; end: Date }) {
    return {
      weekStart: formatShanghaiDate(range.start),
      displayWeekEnd: formatShanghaiDate(new Date(range.end.getTime() - DAY_MS)),
      nextWeekStart: formatShanghaiDate(range.end),
      label: this.weekLabel(range),
    };
  }

  private dailyTrend(range: { start: Date; end: Date }, rows: { at: Date; count: number }[]) {
    const buckets = Array.from({ length: 7 }, () => 0);
    for (const row of rows) {
      const index = Math.floor((row.at.getTime() - range.start.getTime()) / DAY_MS);
      if (index >= 0 && index < 7) buckets[index] = (buckets[index] || 0) + row.count;
    }
    return buckets;
  }

  private async designManager(userId: number, role: string, includeAnalytics: boolean) {
    const today = getShanghaiDayRange();
    const currentWeek = getShanghaiWeekRange();
    const previousWeek = getPreviousShanghaiWeekRange();
    const taskWhere = this.visibility.visibleWhere(role, userId);
    const baseImageWhere = { deletedAt: null, task: taskWhere } as any;
    const [todayNewImageCount, weekNewImageCount, approvedRows, weeklyPlan, assignmentTasks, reviewTasks] = await Promise.all([
      this.prisma.imageTask.count({ where: { ...baseImageWhere, createdAt: { gte: today.start, lt: today.end } } }),
      this.prisma.imageTask.count({ where: { ...baseImageWhere, createdAt: { gte: currentWeek.start, lt: currentWeek.end } } }),
      includeAnalytics ? this.prisma.imageTask.findMany({
        where: { ...baseImageWhere, approvedAt: { gte: previousWeek.start, lt: currentWeek.end } },
        select: { approvedAt: true },
      }) : Promise.resolve([]),
      this.weeklyDesignerPlans.getWeekOverview(userId, role),
      this.prisma.task.findMany({
        where: this.visibility.scopeWhere("design-assignment", role, userId),
        include: { store: { select: { name: true } }, creator: { select: { username: true, displayName: true } }, imageTasks: { where: { deletedAt: null, status: "PENDING_ASSIGNMENT" }, select: { id: true } } },
        orderBy: { updatedAt: "asc" }, take: 5,
      }),
      this.prisma.task.findMany({
        where: this.visibility.scopeWhere("design-reviews", role, userId),
        include: { store: { select: { name: true } }, creator: { select: { username: true, displayName: true } }, imageTasks: { where: { deletedAt: null, status: "SUBMITTED_FOR_REVIEW" }, select: { id: true, imageTitle: true, imageIndex: true, designer: { select: { username: true, displayName: true } }, submittedAt: true } } },
        orderBy: { updatedAt: "asc" }, take: 5,
      }),
    ]);
    const rows = approvedRows.filter((row) => row.approvedAt).map((row) => ({ at: row.approvedAt!, count: 1 }));
    return {
      source: "database", refreshedAt: new Date().toISOString(), week: this.serializeWeek(currentWeek),
      metrics: { todayNewImageCount, weekNewImageCount },
      ...(includeAnalytics ? { trend: { days: ["周一", "周二", "周三", "周四", "周五", "周六", "周日"], previous: this.dailyTrend(previousWeek, rows), current: this.dailyTrend(currentWeek, rows) } } : {}),
      weeklyPlan,
      workLists: {
        assignment: assignmentTasks.map((task: any) => ({ id: task.id, serialNumber: task.serialNumber, storeName: task.store?.name || "-", requester: task.requesterName || task.creator?.displayName || task.creator?.username || "-", productCode: task.productCode || "-", imageCount: task.imageTasks.length })),
        review: reviewTasks.flatMap((task: any) => task.imageTasks.map((image: any) => ({ id: task.id, imageTaskId: image.id, serialNumber: task.serialNumber, imageTitle: image.imageTitle || `图片 ${image.imageIndex}`, designerName: image.designer?.displayName || image.designer?.username || "-", submittedAt: image.submittedAt }))),
      },
    };
  }

  private async operationManager(userId: number, role: string, includeAnalytics: boolean) {
    const today = getShanghaiDayRange();
    const currentWeek = getShanghaiWeekRange();
    const previousWeek = getPreviousShanghaiWeekRange();
    const [queueTasks, approvedRecords, qualityTasks, exceptionTasks, weeklyPlan] = await Promise.all([
      this.prisma.task.findMany({
        where: { deletedAt: null, workflowStatus: "SUBMITTED" },
        include: { store: { select: { name: true } }, creator: { select: { username: true, displayName: true } }, imageTasks: { where: { deletedAt: null }, select: { id: true, imageTitle: true, imageType: true, requirement: true, originalImageUrl: true, referenceImageUrl: true, attachments: { select: { id: true } } } }, submissionRecords: { orderBy: { submissionSequence: "desc" }, take: 1 } },
        orderBy: { updatedAt: "asc" },
      }),
      includeAnalytics ? this.prisma.approvalRecord.findMany({
        where: { action: "OPS_APPROVED", createdAt: { gte: previousWeek.start, lt: currentWeek.end } },
        include: { task: { include: { imageTasks: { where: { deletedAt: null }, select: { id: true } } } } },
      }) : Promise.resolve([]),
      includeAnalytics ? this.prisma.task.findMany({
        where: { deletedAt: null, creator: { role: { name: "OPERATION" } }, submissionRecords: { some: { submittedAt: { gte: currentWeek.start, lt: currentWeek.end } } } },
        include: { creator: { select: { id: true, username: true, displayName: true } }, imageTasks: { where: { deletedAt: null }, select: { id: true } }, approvalRecords: { select: { action: true, createdAt: true } } },
      }) : Promise.resolve([]),
      includeAnalytics ? this.prisma.task.findMany({
        where: { deletedAt: null, workflowStatus: { in: ["OPS_REJECTED", "SUBMITTED"] } },
        include: { creator: { select: { username: true, displayName: true } }, imageTasks: { where: { deletedAt: null }, select: { id: true } }, approvalRecords: { where: { action: "OPS_REJECTED" }, orderBy: { createdAt: "desc" }, take: 1 }, submissionRecords: { orderBy: { submissionSequence: "desc" }, take: 1 } },
        orderBy: { updatedAt: "desc" }, take: 30,
      }) : Promise.resolve([]),
      this.weeklyOperationsPlans.getWeekOverview(userId, role),
    ]);
    const queue = queueTasks.map((task: any) => {
      const latest = task.submissionRecords[0];
      const submittedAt = latest?.submittedAt || task.submittedAt || task.createdAt;
      const hasDataIssue = task.imageTasks.some((image: any) => !String(image.imageTitle || image.imageType || "").trim() || !String(image.requirement || "").trim() || (!String(image.originalImageUrl || "").trim() && !String(image.referenceImageUrl || "").trim() && !image.attachments?.length));
      return { id: task.id, serialNumber: task.serialNumber, storeName: task.store?.name || "-", requester: task.requesterName || task.creator?.displayName || task.creator?.username || "-", productCode: task.productCode || "-", effectiveImageCount: task.imageTasks.length, submittedAt, submissionType: latest?.submissionType || "INITIAL", waitingHours: Math.max(0, Math.floor((Date.now() - new Date(submittedAt).getTime()) / 3600000)), hasDataIssue };
    });
    const queueSummary = {
      pendingTaskCount: queue.length,
      pendingImageCount: queue.reduce((sum, task) => sum + task.effectiveImageCount, 0),
      initialImageCount: queue.filter((task) => task.submissionType === "INITIAL").reduce((sum, task) => sum + task.effectiveImageCount, 0),
      resubmitImageCount: queue.filter((task) => task.submissionType === "RESUBMIT").reduce((sum, task) => sum + task.effectiveImageCount, 0),
      overdueImageCount: queue.filter((task) => task.waitingHours >= 24).reduce((sum, task) => sum + task.effectiveImageCount, 0),
      dataIssueImageCount: queue.filter((task) => task.hasDataIssue).reduce((sum, task) => sum + task.effectiveImageCount, 0),
      todayNewImageCount: queue.filter((task) => new Date(task.submittedAt) >= today.start).reduce((sum, task) => sum + task.effectiveImageCount, 0),
      weekNewImageCount: queue.filter((task) => new Date(task.submittedAt) >= currentWeek.start).reduce((sum, task) => sum + task.effectiveImageCount, 0),
    };
    const approved = approvedRecords.map((record: any) => ({ at: record.createdAt, count: record.task.imageTasks.length }));
    const qualityByUser = new Map<number, any>();
    for (const task of qualityTasks as any[]) {
      const creator = task.creator;
      const row = qualityByUser.get(creator.id) || { id: creator.id, name: creator.displayName || creator.username, submitted: 0, firstPass: 0, returned: 0, pending: 0 };
      const count = task.imageTasks.length;
      row.submitted += count;
      const approvedAt = task.approvalRecords.find((record: any) => record.action === "OPS_APPROVED");
      const rejected = task.approvalRecords.some((record: any) => record.action === "OPS_REJECTED");
      if (approvedAt && !rejected) row.firstPass += count;
      if (task.workflowStatus === "OPS_REJECTED") row.returned += count;
      if (task.workflowStatus === "SUBMITTED") row.pending += count;
      qualityByUser.set(creator.id, row);
    }
    const exceptions = (exceptionTasks as any[]).map((task) => {
      const latest = task.submissionRecords[0]?.submittedAt || task.submittedAt || task.updatedAt;
      const rejected = task.approvalRecords[0];
      const waitingHours = Math.max(0, Math.floor((Date.now() - new Date(latest).getTime()) / 3600000));
      return { id: task.id, serialNumber: task.serialNumber, requester: task.requesterName || task.creator?.displayName || task.creator?.username || "-", imageCount: task.imageTasks.length, status: task.workflowStatus, summary: rejected?.comment || (waitingHours >= 24 ? `等待 ${waitingHours} 小时` : "等待审批"), waitingHours };
    }).filter((row) => row.status === "OPS_REJECTED" || row.waitingHours >= 24).slice(0, 5);
    return {
      source: "database", refreshedAt: new Date().toISOString(), week: this.serializeWeek(currentWeek), queue: { summary: queueSummary, items: queue.slice(0, 5) },
      ...(includeAnalytics ? { trend: { days: ["周一", "周二", "周三", "周四", "周五", "周六", "周日"], previous: this.dailyTrend(previousWeek, approved), current: this.dailyTrend(currentWeek, approved) }, quality: [...qualityByUser.values()], exceptions } : {}), weeklyPlan,
    };
  }

  private async designer(userId: number) {
    const currentWeek = getShanghaiWeekRange();
    const weekStart = formatShanghaiDate(currentWeek.start);
    const activeStatuses = ["NOT_STARTED", "IN_PROGRESS", "REVISION_REQUIRED", "SUBMITTED_FOR_REVIEW"];
    const pendingStatuses = ["NOT_STARTED", "IN_PROGRESS", "REVISION_REQUIRED"];
    const [activeImages, approvedThisWeekCount, plannedImageCount, activityImages] = await Promise.all([
      this.prisma.imageTask.findMany({
        where: { designerId: userId, deletedAt: null, status: { in: activeStatuses }, task: { deletedAt: null } },
        include: { task: { include: { store: { select: { name: true } } } } },
      }),
      this.prisma.imageTask.count({
        where: {
          designerId: userId,
          deletedAt: null,
          status: "APPROVED",
          approvedAt: { gte: currentWeek.start, lt: currentWeek.end },
          task: { deletedAt: null },
        },
      }),
      this.prisma.weeklyPlanItem.count({
        where: {
          designerId: userId,
          status: { not: "CANCELLED" },
          weeklyPlan: { weekStart: currentWeek.start, status: "ACTIVE" },
        },
      }),
      this.prisma.imageTask.findMany({
        where: { designerId: userId, deletedAt: null, task: { deletedAt: null } },
        include: { task: { select: { id: true, serialNumber: true } } },
        orderBy: { updatedAt: "desc" },
        take: 100,
      }),
    ]);

    const activityImageIds = activityImages.map((item: any) => item.id);
    const [auditEvents, completedUploads] = activityImageIds.length
      ? await Promise.all([
          this.prisma.auditEvent.findMany({
            where: {
              resourceType: "image_task",
              resourceId: { in: activityImageIds },
              action: { in: ["assign_designer", "start_making", "submit_review", "review_reject", "review_approve"] },
            },
            orderBy: { createdAt: "desc" },
            take: 100,
          }),
          this.prisma.attachment.findMany({
            where: { imageTaskId: { in: activityImageIds }, category: "IMAGE_COMPLETED", deletedAt: null },
            select: { id: true, imageTaskId: true, uploadedAt: true },
            orderBy: { uploadedAt: "desc" },
            take: 30,
          }),
        ])
      : [[], []];

    const imageById = new Map(activityImages.map((item: any) => [item.id, item]));
    const latestRejections = new Map<number, { reason: string | null; occurredAt: Date }>();
    const activityRows: any[] = [];
    const actionDescriptions: Record<string, string> = {
      assign_designer: "设计主管已分配任务",
      start_making: "开始设计",
      submit_review: "已提交设计主管审核",
      review_reject: "设计主管退回修改",
      review_approve: "设计主管审核通过",
    };

    for (const event of auditEvents as any[]) {
      const image = imageById.get(event.resourceId);
      if (!image) continue;
      let metadata: any = null;
      try {
        metadata = event.metadata ? JSON.parse(event.metadata) : null;
      } catch {
        metadata = null;
      }
      if (metadata?.designerId !== undefined && Number(metadata.designerId) !== userId) continue;
      if (event.action === "review_reject" && !latestRejections.has(event.resourceId)) {
        latestRejections.set(event.resourceId, {
          reason: typeof metadata?.remark === "string" && metadata.remark.trim() ? metadata.remark.trim() : null,
          occurredAt: event.createdAt,
        });
      }
      activityRows.push({
        id: `audit-${event.id}`,
        type: event.action,
        decreeId: image.taskId,
        decreeNo: image.task?.serialNumber || "-",
        imageTaskId: image.id,
        imageName: image.imageTitle || `图片 ${image.imageIndex}`,
        occurredAt: event.createdAt,
        description: actionDescriptions[event.action] || event.action,
      });
    }

    for (const upload of completedUploads as any[]) {
      const image = imageById.get(upload.imageTaskId);
      if (!image) continue;
      activityRows.push({
        id: `upload-${upload.id}`,
        type: "upload_completed",
        decreeId: image.taskId,
        decreeNo: image.task?.serialNumber || "-",
        imageTaskId: image.id,
        imageName: image.imageTitle || `图片 ${image.imageIndex}`,
        occurredAt: upload.uploadedAt,
        description: "上传完成稿",
      });
    }

    const countByStatus = activeImages.reduce((counts: Record<string, number>, item: any) => {
      counts[item.status] = (counts[item.status] || 0) + 1;
      return counts;
    }, {});
    const priorityRank: Record<string, number> = { REVISION_REQUIRED: 0, IN_PROGRESS: 1, NOT_STARTED: 2 };
    const priorityTasks = (activeImages as any[])
      .filter((item) => pendingStatuses.includes(item.status))
      .map((item) => {
        const rejection = latestRejections.get(item.id);
        return {
          taskId: item.id,
          imageTaskId: item.id,
          decreeId: item.taskId,
          decreeNo: item.task?.serialNumber || "-",
          storeName: item.task?.store?.name || null,
          productCode: item.task?.productCode || null,
          imageIndex: item.imageIndex,
          imageName: item.imageTitle || null,
          status: item.status,
          latestRejectionReason: rejection?.reason || (item.status === "REVISION_REQUIRED" ? item.reviewRemark || null : null),
          latestRejectionAt: rejection?.occurredAt.toISOString() || null,
          updatedAt: item.updatedAt,
          priority: item.task?.priority || "NORMAL",
        };
      })
      .sort((left, right) => {
        const rankDiff = (priorityRank[left.status] ?? Number.MAX_SAFE_INTEGER) - (priorityRank[right.status] ?? Number.MAX_SAFE_INTEGER);
        if (rankDiff) return rankDiff;
        const rejectionDiff = new Date(right.latestRejectionAt || 0).getTime() - new Date(left.latestRejectionAt || 0).getTime();
        if (rejectionDiff) return rejectionDiff;
        const updatedDiff = new Date(right.updatedAt).getTime() - new Date(left.updatedAt).getTime();
        if (updatedDiff) return updatedDiff;
        return left.taskId - right.taskId;
      })
      .slice(0, 8);

    const decreeCount = new Set((activeImages as any[]).map((item) => item.taskId)).size;
    const pendingTotal = pendingStatuses.reduce((total, status) => total + Number(countByStatus[status] || 0), 0);
    const completionRate = plannedImageCount > 0 ? Math.round((approvedThisWeekCount / plannedImageCount) * 100) : null;
    return {
      source: "database",
      refreshedAt: new Date().toISOString(),
      designer: {
        week: { weekStart, displayWeekEnd: formatShanghaiDate(new Date(currentWeek.end.getTime() - DAY_MS)) },
        summary: {
          pendingTotal,
          decreeCount,
          notStartedCount: Number(countByStatus.NOT_STARTED || 0),
          inProgressCount: Number(countByStatus.IN_PROGRESS || 0),
          revisionRequiredCount: Number(countByStatus.REVISION_REQUIRED || 0),
          submittedForReviewCount: Number(countByStatus.SUBMITTED_FOR_REVIEW || 0),
          approvedThisWeekCount,
          plannedImageCount,
          completionRate,
        },
        priorityTasks,
        recentActivities: activityRows
          .sort((left, right) => new Date(right.occurredAt).getTime() - new Date(left.occurredAt).getTime())
          .slice(0, 10),
      },
    };
  }

  private async operator(userId: number) {
    const today = getShanghaiDayRange();
    const currentWeek = getShanghaiWeekRange();
    const taskWhere = { creatorId: userId, deletedAt: null };
    const tasks = await this.prisma.task.findMany({
      where: taskWhere,
      include: {
        store: { select: { name: true } },
        requirementType: { select: { name: true } },
        imageTasks: {
          where: { deletedAt: null, status: { not: "CANCELLED" } },
          include: {
            designer: { select: { id: true, username: true, displayName: true } },
            attachments: {
              where: { deletedAt: null, category: "IMAGE_COMPLETED" },
              select: { id: true, fileName: true, uploadedAt: true },
              orderBy: { uploadedAt: "desc" },
            },
          },
          orderBy: { imageIndex: "asc" },
        },
        approvalRecords: {
          where: { action: "OPS_REJECTED" },
          include: { approver: { select: { username: true, displayName: true } } },
          orderBy: { createdAt: "desc" },
          take: 1,
        },
      },
      orderBy: [{ priority: "desc" }, { updatedAt: "desc" }, { id: "desc" }],
      take: 100,
    });

    const taskIds = tasks.map((task: any) => task.id);
    const imageTaskIds = tasks.flatMap((task: any) => task.imageTasks.map((image: any) => image.id));
    const auditEvents = taskIds.length
      ? await this.prisma.auditEvent.findMany({
          where: {
            action: {
              in: [
                "create_task", "edit_task", "submit_approval", "submit_ops_approval",
                "ops_reject_task", "reject_task", "ops_approve_task", "approve_task",
                "assign_designer", "batch_assign_designer", "start_making", "submit_review",
                "review_reject", "design_review_reject", "review_approve", "design_review_approve",
              ],
            },
            OR: [
              { resourceType: "task", resourceId: { in: taskIds } },
              { resourceType: "image_task", resourceId: { in: imageTaskIds } },
            ],
          },
          orderBy: { createdAt: "desc" },
          take: 100,
        })
      : [];

    const cleanName = (value: unknown) => {
      const text = value === undefined || value === null ? "" : String(value).trim();
      return !text || /^\?+$/.test(text) || ["undefined", "null"].includes(text.toLowerCase()) ? "" : text;
    };
    const displayName = (person: any) => cleanName(person?.displayName) || cleanName(person?.username) || "-";
    const effectiveImages = (task: any) => task.imageTasks || [];
    const allApproved = (task: any) => {
      const images = effectiveImages(task);
      return images.length > 0 && images.every((image: any) => image.status === "APPROVED");
    };
    const processingWorkflows = ["OPS_APPROVED", "DESIGN_ASSIGNED", "IN_DESIGN", "DESIGN_REVIEW"];
    const progressLabel = (task: any) => {
      const images = effectiveImages(task);
      if (task.workflowStatus === "DRAFT") return "草稿";
      if (task.workflowStatus === "OPS_REJECTED") return "退回补充";
      if (task.workflowStatus === "SUBMITTED") return "待运营主管审批";
      if (allApproved(task)) return "设计已完成";
      if (images.some((image: any) => image.status === "REVISION_REQUIRED")) return "设计修改中";
      if (images.some((image: any) => image.status === "SUBMITTED_FOR_REVIEW")) return "待设计审核";
      if (images.some((image: any) => image.status === "IN_PROGRESS")) return "设计中";
      if (images.some((image: any) => image.status === "NOT_STARTED")) return "已分配";
      if (images.some((image: any) => image.status === "PENDING_ASSIGNMENT")) return "待设计分配";
      return processingWorkflows.includes(task.workflowStatus) ? "设计流程中" : task.workflowStatus;
    };
    const mapTask = (task: any) => {
      const images = effectiveImages(task);
      const completed = images.filter((image: any) => image.status === "APPROVED");
      const designerIds = [...new Set(images.map((image: any) => image.designerId).filter(Boolean))];
      const designerName = !designerIds.length
        ? "待设计主管分配"
        : designerIds.length === 1
          ? displayName(images.find((image: any) => image.designerId === designerIds[0])?.designer)
          : "多人协作";
      const latestApprovedAt = completed.reduce((latest: Date | null, image: any) => {
        if (!image.approvedAt) return latest;
        return !latest || image.approvedAt > latest ? image.approvedAt : latest;
      }, null);
      const completedAttachment = completed.flatMap((image: any) => image.attachments || [])[0] || null;
      const latestReturn = task.approvalRecords[0] || null;
      return {
        id: task.id,
        serialNumber: task.serialNumber,
        productCode: task.productCode || "-",
        storeName: task.store?.name || "-",
        requirementType: task.requirementType?.name || task.overallRequirementType || "-",
        priority: task.priority || "NORMAL",
        workflowStatus: task.workflowStatus,
        currentDesigner: designerName,
        progress: progressLabel(task),
        effectiveImageCount: images.length,
        approvedImageCount: completed.length,
        completionRate: images.length ? Math.round((completed.length / images.length) * 100) : null,
        createdAt: task.createdAt,
        updatedAt: task.updatedAt,
        designCompletedAt: latestApprovedAt,
        latestReturnReason: latestReturn?.comment || null,
        returnedBy: latestReturn ? displayName(latestReturn.approver) : null,
        returnedAt: latestReturn?.createdAt || null,
        missingMaterials: latestReturn?.comment || null,
        completedAttachmentId: completedAttachment?.id || null,
        completedAttachmentName: completedAttachment?.fileName || null,
      };
    };

    const rows = tasks.map(mapTask);
    const createdThisWeek = tasks.filter((task: any) => task.createdAt >= currentWeek.start && task.createdAt < currentWeek.end);
    const processingTasks = tasks.filter((task: any) => !allApproved(task) && task.workflowStatus !== "CANCELLED");
    const completedTasks = tasks.filter((task: any) => task.workflowStatus !== "CANCELLED" && allApproved(task));
    const inProductionTasks = tasks.filter((task: any) => processingWorkflows.includes(task.workflowStatus) && !allApproved(task));
    const priorityLabels: Record<string, string> = {
      create_task: "创建草稿",
      edit_task: "修改法旨",
      submit_approval: "提交运营主管审批",
      submit_ops_approval: "提交运营主管审批",
      ops_reject_task: "运营主管退回补充",
      reject_task: "运营主管退回补充",
      ops_approve_task: "运营主管放行",
      approve_task: "运营主管放行",
      assign_designer: "设计主管分配",
      batch_assign_designer: "设计主管分配",
      start_making: "设计师开始设计",
      submit_review: "设计师提交完成稿",
      review_reject: "设计主管退回设计师",
      design_review_reject: "设计主管退回设计师",
      review_approve: "设计主管审核通过",
      design_review_approve: "设计主管审核通过",
    };
    const taskById = new Map(tasks.map((task: any) => [task.id, task]));
    const imageToTaskId = new Map(tasks.flatMap((task: any) => effectiveImages(task).map((image: any) => [image.id, task.id])));
    const activities = auditEvents.map((event: any) => {
      const taskId = event.resourceType === "image_task" ? imageToTaskId.get(event.resourceId) : event.resourceId;
      const task = taskById.get(taskId);
      if (!task || !priorityLabels[event.action]) return null;
      return {
        id: event.id,
        decreeId: task.id,
        decreeNo: task.serialNumber,
        action: event.action,
        label: priorityLabels[event.action],
        createdAt: event.createdAt,
      };
    }).filter(Boolean).slice(0, 10);

    const createdThisWeekImages = createdThisWeek.flatMap((task: any) => effectiveImages(task));
    const approvedThisWeekImages = tasks.flatMap((task: any) => effectiveImages(task))
      .filter((image: any) => image.status === "APPROVED" && image.approvedAt && image.approvedAt >= currentWeek.start && image.approvedAt < currentWeek.end);
    return {
      source: "database",
      refreshedAt: new Date().toISOString(),
      operator: {
        week: this.serializeWeek(currentWeek),
        summary: {
          processingDecreeCount: processingTasks.length,
          pendingOperationsApprovalCount: tasks.filter((task: any) => task.workflowStatus === "SUBMITTED").length,
          inProductionCount: inProductionTasks.length,
          designCompletedCount: completedTasks.length,
          returnedForSupplementCount: tasks.filter((task: any) => task.workflowStatus === "OPS_REJECTED").length,
          createdTodayCount: tasks.filter((task: any) => task.createdAt >= today.start && task.createdAt < today.end).length,
          createdThisWeekCount: createdThisWeek.length,
        },
        weekOverview: {
          decreeCount: new Set(createdThisWeek.map((task: any) => task.id)).size,
          totalImageCount: createdThisWeekImages.length,
          approvedImageCount: approvedThisWeekImages.length,
          processingImageCount: createdThisWeekImages.filter((image: any) => image.status !== "APPROVED").length,
        },
        decreeProgress: rows
          .filter(
            (row: any) =>
              row.workflowStatus !== "DRAFT" &&
              row.workflowStatus !== "OPS_REJECTED" &&
              row.workflowStatus !== "CANCELLED" &&
              row.progress !== "设计已完成",
          )
          .sort((left: any, right: any) => right.updatedAt.getTime() - left.updatedAt.getTime())
          .slice(0, 10),
        completedDecrees: rows.filter((row: any) => row.progress === "设计已完成")
          .sort((left: any, right: any) => {
            const priorityDiff = Number(right.priority === "URGENT") - Number(left.priority === "URGENT");
            if (priorityDiff) return priorityDiff;
            return new Date(right.designCompletedAt || 0).getTime() - new Date(left.designCompletedAt || 0).getTime();
          })
          .slice(0, 5),
        returnedDecrees: rows.filter((row: any) => row.workflowStatus === "OPS_REJECTED").slice(0, 5),
        recentActivities: activities,
      },
    };
  }
}
