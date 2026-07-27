import { ForbiddenException, Injectable, NotFoundException } from "@nestjs/common";
import { PrismaService } from "../common/prisma.service";
import { OperationLogService } from "../operation-log/operation-log.service";
import { WorkflowEngine } from "../workflow-engine/engine";
import { CreateTaskDto } from "./dto/create-task.dto";
import { UpdateTaskDto } from "./dto/update-task.dto";
import { BatchPriorityDto } from "./dto/batch-priority.dto";
import { ADMIN_ROLES, DESIGN_VISIBLE_STATUSES, TaskVisibilityService } from "../common/task-visibility.service";
import { WeeklyOperationsApprovalPlansService } from "../weekly-plans/weekly-operations-approval-plans.service";

const EDITABLE_BY_OPERATOR = ["DRAFT", "OPS_REJECTED"];

@Injectable()
export class TasksService {
  constructor(
    private prisma: PrismaService,
    private log: OperationLogService,
    private engine: WorkflowEngine,
    private visibility: TaskVisibilityService,
    private operationsApprovalPlans: WeeklyOperationsApprovalPlansService,
  ) {}

  async genSerial(): Promise<string> {
    const last = await this.prisma.task.findFirst({ orderBy: { id: "desc" }, select: { id: true } });
    return "天字第" + String((last?.id ?? 0) + 1).padStart(6, "0") + "号法旨";
  }

  async findAll(page = 1, pageSize = 20, userRole?: string, userId?: number, filters: any = {}) {
    pageSize = Math.min(pageSize, 100);
    const conditions: any[] = [];

    if (filters.search) {
      const q = String(filters.search);
      conditions.push({ OR: [
        { serialNumber: { contains: q } },
        { productCode: { contains: q } },
        { productName: { contains: q } },
        { requesterName: { contains: q } },
        { store: { name: { contains: q } } },
      ] });
    }
    const scope = String(filters.scope || (filters.view === "archive" ? "archived" : "processing"));
    conditions.push(this.visibility.scopeWhere(scope, userRole, userId));
    if (filters.status) conditions.push({ workflowStatus: filters.status });
    if (filters.statusGroup === "designflow") conditions.push({ workflowStatus: { in: DESIGN_VISIBLE_STATUSES } });
    if (filters.approvalAction) {
      conditions.push({ approvalRecords: { some: { approverId: userId, action: String(filters.approvalAction) } } });
    }
    if (filters.imageStatus) conditions.push({ imageTasks: { some: { status: String(filters.imageStatus) } } });
    const imageGroupStatuses = filters.imageGroup === "unfinished"
      ? ["PENDING_ASSIGNMENT", "NOT_STARTED", "IN_PROGRESS", "SUBMITTED_FOR_REVIEW", "REVISION_REQUIRED"]
      : undefined;
    if (imageGroupStatuses) conditions.push({ imageTasks: { some: { status: { in: imageGroupStatuses } } } });
    if (filters.storeId) conditions.push({ storeId: Number(filters.storeId) });
    if (filters.requesterName) conditions.push({ requesterName: { contains: String(filters.requesterName) } });
    if (filters.priority) conditions.push({ priority: filters.priority });
    const where: any = { AND: conditions };

    const skip = (page - 1) * pageSize;
    const listImageTasks: any = { select: { status: true, designerId: true } };
    if (userRole === "DESIGNER") {
      listImageTasks.where = { designerId: userId };
    }
    const canReadDrafts = userRole === "OPERATION" || ADMIN_ROLES.includes(userRole || "");
    const draftWhere = canReadDrafts ? this.visibility.scopeWhere("drafts", userRole, userId) : undefined;
    const usesImageMetric = Boolean(filters.imageStatus || imageGroupStatuses) || ["design-assignment", "design-reviews", "design-tasks"].includes(scope);
    const imageMetricWhere = usesImageMetric
      ? this.visibility.imageTaskMetricWhere(
          scope,
          userRole,
          userId,
          filters.imageStatus ? String(filters.imageStatus) : undefined,
          imageGroupStatuses,
        )
      : undefined;
    const [items, total, processingCount, draftCount, archivedCount, imageMetricTotal] = await Promise.all([
      this.prisma.task.findMany({
        where,
        orderBy: [{ priority: "desc" }, { createdAt: "desc" }, { id: "desc" }],
        include: {
          creator: { select: { id: true, username: true, displayName: true } },
          store: { select: { id: true, name: true } },
          requirementType: { select: { id: true, name: true } },
          _count: { select: { imageTasks: true } },
          imageTasks: listImageTasks,
        } as any,
        skip,
        take: pageSize,
      }),
      this.prisma.task.count({ where }),
      this.prisma.task.count({ where: this.visibility.scopeWhere("processing", userRole, userId) }),
      draftWhere ? this.prisma.task.count({ where: draftWhere }) : Promise.resolve(0),
      this.prisma.task.count({ where: this.visibility.scopeWhere("archived", userRole, userId) }),
      imageMetricWhere ? this.prisma.imageTask.count({ where: imageMetricWhere }) : Promise.resolve(0),
    ]);
    return {
      items,
      total,
      page,
      pageSize,
      metricTotal: usesImageMetric ? imageMetricTotal : total,
      metricUnit: usesImageMetric ? "张" : "条",
      scopeCounts: { processing: processingCount, drafts: draftCount, archived: archivedCount },
    };
  }

  async findOpsApprovalQueue(page = 1, pageSize = 20, userRole?: string, filters: any = {}) {
    if (userRole !== "OPERATION_MANAGER" && !ADMIN_ROLES.includes(userRole || "")) {
      throw new ForbiddenException("当前账号无权访问待运营主管审批列表");
    }

    const tasks = await this.prisma.task.findMany({
      where: { deletedAt: null, workflowStatus: "SUBMITTED" },
      include: {
        creator: { select: { id: true, username: true, displayName: true } },
        store: { select: { id: true, name: true } },
        requirementType: { select: { id: true, name: true } },
        imageTasks: {
          where: { deletedAt: null },
          include: { attachments: { where: { deletedAt: null }, select: { id: true } } },
          orderBy: { imageIndex: "asc" },
        },
        attachments: { where: { deletedAt: null }, select: { id: true } },
        submissionRecords: {
          include: { submitter: { select: { id: true, username: true, displayName: true } } },
          orderBy: { submissionSequence: "asc" },
        },
        approvalRecords: {
          where: { action: "OPS_REJECTED" },
          orderBy: { createdAt: "desc" },
          select: { id: true, comment: true, createdAt: true },
        },
      },
    });

    const now = Date.now();
    const hasText = (value?: string | null) => Boolean(value && value.trim());
    const items = tasks.map((task: any) => {
      const activeImages = task.imageTasks.filter((image: any) => image.status !== "CANCELLED");
      const latestSubmission = task.submissionRecords[task.submissionRecords.length - 1] || null;
      const firstSubmission = task.submissionRecords[0] || null;
      const latestSubmittedAt = latestSubmission?.submittedAt || task.submittedAt || task.createdAt;
      const waitingHours = Math.max(0, Math.floor((now - new Date(latestSubmittedAt).getTime()) / 3_600_000));
      const taskHasAttachment = task.attachments.length > 0;
      const dataIssues: string[] = [];
      if (!task.storeId) dataIssues.push("缺少店铺");
      if (!hasText(task.requesterName)) dataIssues.push("缺少运营需求人");
      if (!hasText(task.compatibleProduct)) dataIssues.push("缺少适配产品");
      if (!hasText(task.productCode)) dataIssues.push("缺少产品编号");
      if (!task.requirementTypeId) dataIssues.push("缺少需求类型");
      if (!activeImages.length) dataIssues.push("没有有效图片任务");
      activeImages.forEach((image: any, index: number) => {
        const label = `第${image.imageIndex || index + 1}张图片`;
        if (!hasText(image.imageTitle) && !hasText(image.imageType)) dataIssues.push(`${label}缺少名称或类型`);
        if (!hasText(image.requirement)) dataIssues.push(`${label}缺少需求描述`);
        if (!hasText(image.originalImageUrl) && !hasText(image.referenceImageUrl) && !image.attachments.length && !taskHasAttachment) {
          dataIssues.push(`${label}缺少素材`);
        }
      });
      return {
        id: task.id,
        serialNumber: task.serialNumber,
        store: task.store,
        requester: task.requesterName || task.creator?.displayName || task.creator?.username || "-",
        requesterUser: task.creator,
        compatibleProduct: task.compatibleProduct || task.productName || "-",
        productCode: task.productCode || "-",
        requirementType: task.requirementType,
        effectiveImageCount: activeImages.length,
        firstSubmittedAt: firstSubmission?.submittedAt || null,
        latestSubmittedAt,
        waitingHours,
        isOverdue: waitingHours >= 24,
        submissionType: latestSubmission?.submissionType || "INITIAL",
        submissionCount: task.submissionRecords.length,
        returnCount: task.approvalRecords.length,
        latestReturnReason: task.approvalRecords[0]?.comment || null,
        workflowStatus: task.workflowStatus,
        dataIssues,
      };
    });

    const queueFilter = String(filters.queueFilter || "ALL").toUpperCase();
    const search = String(filters.search || "").trim().toLowerCase();
    const filtered = items.filter((item) => {
      if (queueFilter === "INITIAL" && item.submissionType !== "INITIAL") return false;
      if (queueFilter === "RESUBMIT" && item.submissionType !== "RESUBMIT") return false;
      if (queueFilter === "OVERDUE" && !item.isOverdue) return false;
      if (queueFilter === "DATA_ISSUE" && !item.dataIssues.length) return false;
      if (!search) return true;
      return [item.serialNumber, item.store?.name, item.requester, item.productCode]
        .filter(Boolean)
        .some((value) => String(value).toLowerCase().includes(search));
    }).sort((a, b) => {
      if (Number(b.isOverdue) !== Number(a.isOverdue)) return Number(b.isOverdue) - Number(a.isOverdue);
      return new Date(a.latestSubmittedAt).getTime() - new Date(b.latestSubmittedAt).getTime();
    });

    const safePageSize = Math.min(Math.max(Number(pageSize) || 20, 1), 100);
    const safePage = Math.max(Number(page) || 1, 1);
    const start = (safePage - 1) * safePageSize;
    return {
      items: filtered.slice(start, start + safePageSize),
      total: filtered.length,
      page: safePage,
      pageSize: safePageSize,
      summary: {
        pendingTaskCount: items.length,
        pendingImageCount: items.reduce((total, item) => total + item.effectiveImageCount, 0),
        initialCount: items.filter((item) => item.submissionType === "INITIAL").length,
        resubmitCount: items.filter((item) => item.submissionType === "RESUBMIT").length,
        overdueCount: items.filter((item) => item.isOverdue).length,
        dataIssueCount: items.filter((item) => item.dataIssues.length > 0).length,
      },
    };
  }

  async findOne(id: number, userRole?: string, userId?: number) {
    const imageTaskInclude: any = {
      include: { designer: { select: { id: true, username: true, displayName: true } }, attachments: { where: { deletedAt: null }, orderBy: { uploadedAt: "desc" } } },
      orderBy: { sortOrder: "asc" },
    };
    if (userRole === "DESIGNER") {
      imageTaskInclude.where = { designerId: userId };
    }

    const task = await this.prisma.task.findFirst({
      where: { id, deletedAt: null },
      include: {
        creator: { select: { id: true, username: true, displayName: true } },
        store: { select: { id: true, name: true } },
        requirementType: { select: { id: true, name: true } },
        attachments: { where: { deletedAt: null }, orderBy: { uploadedAt: "desc" } },
        imageTasks: imageTaskInclude,
        submissionRecords: {
          include: {
            submitter: { select: { id: true, username: true, displayName: true } },
            withdrawnBy: { select: { id: true, username: true, displayName: true } },
            processedBy: { select: { id: true, username: true, displayName: true } },
          },
          orderBy: { submissionSequence: "desc" },
        },
        approvalRecords: {
          include: { approver: { select: { id: true, username: true, displayName: true } } },
          orderBy: { createdAt: "desc" },
        },
      },
    });
    if (!task) throw new NotFoundException("法旨不存在");
    if (!this.canView(task, userRole, userId)) throw new ForbiddenException("无权查看该法旨");
    const auditEvents = await this.prisma.auditEvent.findMany({
      where: { resourceType: "task", resourceId: id },
      orderBy: { createdAt: "desc" },
    });
    return { ...task, auditEvents };
  }

  private canView(task: any, userRole?: string, userId?: number) {
    if (!userRole || ADMIN_ROLES.includes(userRole)) return true;
    if (userRole === "OPERATION") return task.creatorId === userId;
    if (userRole === "OPERATION_MANAGER") return task.workflowStatus !== "DRAFT" || task.creatorId === userId;
    if (userRole === "DESIGN_MANAGER") return DESIGN_VISIBLE_STATUSES.includes(task.workflowStatus);
    if (userRole === "DESIGNER") {
      return DESIGN_VISIBLE_STATUSES.includes(task.workflowStatus) && task.imageTasks?.some((it: any) => it.designerId === userId);
    }
    return false;
  }

  private canBatchPriority(task: any, userRole?: string, userId?: number) {
    if (ADMIN_ROLES.includes(userRole || "")) return true;
    if (userRole === "OPERATION") {
      return task.creatorId === userId && !DESIGN_VISIBLE_STATUSES.includes(task.workflowStatus);
    }
    if (userRole === "OPERATION_MANAGER" || userRole === "DESIGN_MANAGER") {
      return this.canView(task, userRole, userId);
    }
    return false;
  }

  async batchPriority(dto: BatchPriorityDto, userId: number, userRole: string) {
    if (!["OPERATION", "OPERATION_MANAGER", "DESIGN_MANAGER", ...ADMIN_ROLES].includes(userRole)) {
      throw new ForbiddenException("无权批量设置优先级");
    }
    const priority = dto.priority === "URGENT" ? "URGENT" : "NORMAL";
    const ids = Array.from(new Set((dto.taskIds || []).map(Number).filter(Boolean))).slice(0, 100);
    if (!ids.length) throw new ForbiddenException("请选择需要设置优先级的法旨");

    const results: Array<{ id: number; success: boolean; message: string }> = [];
    for (const id of ids) {
      try {
        const task = await this.prisma.task.findUnique({
          where: { id },
          include: { imageTasks: { select: { designerId: true } } },
        });
        if (!task) throw new NotFoundException("法旨不存在");
        if (!this.canBatchPriority(task, userRole, userId)) throw new ForbiddenException("无权设置该法旨优先级");
        await this.prisma.task.update({ where: { id }, data: { priority } });
        await this.log.log({
          userId,
          action: "batch_update_priority",
          targetType: "task",
          targetId: id,
          content: `批量设置优先级：${task.serialNumber} -> ${priority === "URGENT" ? "加急" : "普通"}`,
          beforeValue: { priority: task.priority },
          afterValue: { priority },
        });
        results.push({ id, success: true, message: "已更新" });
      } catch (err: any) {
        results.push({ id, success: false, message: err?.response?.message || err?.message || "设置失败" });
      }
    }

    const successCount = results.filter((item) => item.success).length;
    return { total: results.length, successCount, failedCount: results.length - successCount, results };
  }

  async create(dto: CreateTaskDto, userId: number, userRole: string) {
    if (!["OPERATION", ...ADMIN_ROLES].includes(userRole)) {
      throw new ForbiddenException("当前账号无权限访问该页面。");
    }
    const serialNumber = await this.genSerial();
    const requestedImageTasks = Array.isArray(dto.imageTasks) ? dto.imageTasks.slice(0, 200) : [];
    const imageCount = Math.max(1, Math.min(Number(dto.imageCount || requestedImageTasks.length || 1), 200));
    const priority = dto.urgent ? "URGENT" : (dto.priority || "NORMAL");

    const task = await this.prisma.$transaction(async (tx: any) => {
      const created = await tx.task.create({
        data: {
          serialNumber,
          priority,
          workflowStatus: "DRAFT",
          productCode: dto.productCode,
          productName: dto.productName,
          storeId: dto.storeId,
          requirementTypeId: dto.requirementTypeId,
          compatibleProduct: dto.compatibleProduct,
          requesterName: dto.requesterName,
          operatorOwner: dto.operatorOwner,
          submittedAt: dto.submittedAt ? new Date(dto.submittedAt) : null,
          deadline: dto.deadline ? new Date(dto.deadline) : null,
          imageCount,
          imageSize: dto.imageSize,
          usagePosition: dto.usagePosition,
          taskType: dto.taskType,
          overallRequirementType: dto.overallRequirementType,
          unifiedModificationNote: dto.unifiedModificationNote,
          outputSpec: dto.outputSpec,
          materialLinks: dto.materialLinks,
          creatorId: userId,
        },
      });

      await tx.imageTask.createMany({
        data: Array.from({ length: imageCount }, (_, i) => ({
          taskId: created.id,
          imageIndex: i + 1,
          sortOrder: i,
          imageTitle: requestedImageTasks[i]?.imageTitle || `图片 ${i + 1}`,
          requirementType: requestedImageTasks[i]?.requirementType,
          requirement: requestedImageTasks[i]?.requirement || "",
          status: "WAITING_OPS_APPROVAL",
          useUnifiedRequirement: true,
        })),
      });

      return created;
    });

    await this.log.log({ userId, action: "create_task", targetType: "task", targetId: task.id, content: `创建法旨: ${serialNumber}` });
    await this.engine.publishCreated(task.id, userId, serialNumber);
    return task;
  }

  async update(id: number, dto: UpdateTaskDto, userId: number, userRole: string) {
    const task = await this.prisma.task.findUnique({
      where: { id },
      include: { imageTasks: { include: { attachments: { where: { deletedAt: null }, select: { id: true } } }, orderBy: { imageIndex: "asc" } } },
    });
    if (!task) throw new NotFoundException("法旨不存在");

    if (["DESIGNER", "DESIGN_MANAGER"].includes(userRole)) throw new ForbiddenException("无权编辑法旨主单");
    if (userRole === "OPERATION" && task.creatorId !== userId) throw new ForbiddenException("只能编辑自己的法旨");
    if (userRole === "OPERATION" && !EDITABLE_BY_OPERATOR.includes(task.workflowStatus)) {
      throw new ForbiddenException("提交审批后不可编辑，请先撤回或等待主管退回");
    }

    const data: any = { ...dto };
    delete data.urgent;
    if (dto.urgent !== undefined) data.priority = dto.urgent ? "URGENT" : "NORMAL";
    if (dto.deadline !== undefined) data.deadline = dto.deadline ? new Date(dto.deadline) : null;
    if (dto.submittedAt !== undefined) data.submittedAt = dto.submittedAt ? new Date(dto.submittedAt) : null;

    const requestedCount = dto.imageCount ? Math.max(1, Math.min(Number(dto.imageCount), 200)) : undefined;
    if (requestedCount !== undefined) data.imageCount = requestedCount;

    const updated = await this.prisma.$transaction(async (tx: any) => {
      const result = await tx.task.update({ where: { id }, data });
      if (requestedCount !== undefined && requestedCount !== task.imageTasks.length) {
        if (!EDITABLE_BY_OPERATOR.includes(task.workflowStatus)) throw new ForbiddenException("当前状态不可调整需求张数");
        if (requestedCount > task.imageTasks.length) {
          await tx.imageTask.createMany({
            data: Array.from({ length: requestedCount - task.imageTasks.length }, (_, idx) => {
              const imageIndex = task.imageTasks.length + idx + 1;
              return { taskId: id, imageIndex, sortOrder: imageIndex - 1, imageTitle: `图片 ${imageIndex}`, status: "WAITING_OPS_APPROVAL", useUnifiedRequirement: true };
            }),
          });
        } else {
          const candidates = task.imageTasks.filter((imageTask: any) => imageTask.imageIndex > requestedCount);
          const hasContent = (imageTask: any) => {
            const defaultTitlePattern = new RegExp(`^(图片|鍥剧墖)\\s*${imageTask.imageIndex}$`);
            return imageTask.status !== "WAITING_OPS_APPROVAL"
              || !!imageTask.requirementType
              || !!imageTask.requirement
              || !!imageTask.originalImageUrl
              || !!imageTask.referenceImageUrl
              || !!imageTask.designerId
              || !!imageTask.designNote
              || !!imageTask.reviewRemark
              || !!imageTask.completedAttachmentUrl
              || (imageTask.attachments || []).length > 0
              || (!!imageTask.imageTitle && !defaultTitlePattern.test(String(imageTask.imageTitle).trim()));
          };
          if (candidates.some(hasContent)) {
            throw new ForbiddenException("该图片任务已有内容或附件，请先清空后再减少数量。");
          }
          await tx.imageTask.deleteMany({ where: { id: { in: candidates.map((imageTask: any) => imageTask.id) } } });
        }
        await this.operationsApprovalPlans.refreshPendingDecreeSnapshotInTransaction(tx, id, userId, "task_image_count_updated");
      }
      return result;
    });

    await this.log.log({ userId, action: "edit_task", targetType: "task", targetId: id, content: `编辑法旨: ${task.serialNumber}` });
    if (dto.materialLinks !== undefined && dto.materialLinks !== task.materialLinks) {
      await this.log.log({ userId, action: "update_link", targetType: "task", targetId: id, content: `Update task links: ${task.serialNumber}` });
    }
    return updated;
  }

  async remove(id: number, userId: number, userRole: string) {
    if (!["SUPER_ADMIN", "OWNER", "OPERATION"].includes(userRole)) throw new ForbiddenException("无权删除");
    const task = await this.prisma.task.findUnique({ where: { id }, include: { imageTasks: { select: { id: true } } } });
    if (!task) throw new NotFoundException("法旨不存在");
    if (userRole === "OPERATION" && task.creatorId !== userId) throw new ForbiddenException("只能删除自己的法旨");
    if (!EDITABLE_BY_OPERATOR.includes(task.workflowStatus)) throw new ForbiddenException("当前状态不可删除法旨");

    await this.prisma.$transaction(async (tx: any) => {
      const imageTaskIds = task.imageTasks.map((item: any) => item.id);
      await tx.attachment.updateMany({
        where: { OR: [{ taskId: id }, { imageTaskId: { in: imageTaskIds } }] },
        data: { taskId: null, imageTaskId: null, deletedAt: new Date(), deletedById: userId },
      });
      await tx.approvalRecord.deleteMany({ where: { taskId: id } });
      await tx.imageTask.deleteMany({ where: { taskId: id } });
      await tx.task.delete({ where: { id } });
    });
    await this.log.log({ userId, action: "delete_task", targetType: "task", targetId: id, content: `删除法旨: ${task.serialNumber}` });
  }

  async batchRemove(taskIds: number[] = [], userId: number, userRole: string) {
    const ids = Array.from(new Set((taskIds || []).map(Number).filter(Boolean))).slice(0, 100);
    if (!ids.length) throw new ForbiddenException("请选择需要删除的法旨");
    const results: Array<{ id: number; success: boolean; message: string }> = [];
    for (const id of ids) {
      try {
        await this.remove(id, userId, userRole);
        results.push({ id, success: true, message: "已删除" });
      } catch (err: any) {
        results.push({ id, success: false, message: err?.response?.message || err?.message || "删除失败" });
      }
    }
    const successCount = results.filter((item) => item.success).length;
    await this.log.log({
      userId,
      action: "batch_delete_task",
      targetType: "task",
      targetId: 0,
      content: `批量删除法旨：成功 ${successCount} 条，失败 ${results.length - successCount} 条`,
      afterValue: { ids, results },
    });
    return { total: results.length, successCount, failedCount: results.length - successCount, results };
  }

}
