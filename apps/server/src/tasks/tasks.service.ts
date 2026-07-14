import { ForbiddenException, Injectable, NotFoundException } from "@nestjs/common";
import { PrismaService } from "../common/prisma.service";
import { OperationLogService } from "../operation-log/operation-log.service";
import { WorkflowEngine } from "../workflow-engine/engine";
import { CreateTaskDto } from "./dto/create-task.dto";
import { UpdateTaskDto } from "./dto/update-task.dto";
import { BatchPriorityDto } from "./dto/batch-priority.dto";
import { ADMIN_ROLES, DESIGN_VISIBLE_STATUSES, TaskVisibilityService } from "../common/task-visibility.service";

const EDITABLE_BY_OPERATOR = ["DRAFT", "OPS_REJECTED"];

@Injectable()
export class TasksService {
  constructor(
    private prisma: PrismaService,
    private log: OperationLogService,
    private engine: WorkflowEngine,
    private visibility: TaskVisibilityService,
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
      },
    });
    if (!task) throw new NotFoundException("法旨不存在");
    if (!this.canView(task, userRole, userId)) throw new ForbiddenException("无权查看该法旨");
    return task;
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
