import { Controller, Get, Query, Request, UseGuards } from "@nestjs/common";
import { AuthGuard } from "@nestjs/passport";
import { PrismaService } from "../common/prisma.service";
import {
  ADMIN_ROLES,
  DESIGN_UNFINISHED_IMAGE_STATUSES,
  DESIGN_VISIBLE_STATUSES,
  TaskVisibilityService,
} from "../common/task-visibility.service";
import { WeeklyDesignerPlansService } from "../weekly-plans/weekly-designer-plans.service";
import { DashboardRoleService } from "./dashboard-role.service";

const RECENT_ACTION_LABELS: Record<string, string> = {
  create_task: "创建法旨",
  edit_task: "编辑法旨",
  submit_approval: "提交运营审批",
  withdraw_approval: "撤回审批",
  approve_task: "运营审批通过",
  reject_task: "运营审批退回",
  assign_designer: "分配设计师",
  start_making: "开始设计",
  submit_review: "提交设计审核",
  review_approve: "设计审核通过",
  review_reject: "设计审核退回",
  delete_task: "删除法旨",
  delete_image_task: "删除图片任务",
};

const ACTION_ALIASES: Record<string, string> = {
  create_task: "create_task",
  edit_task: "edit_task",
  update_task: "edit_task",
  submit_approval: "submit_approval",
  submit_ops_approval: "submit_approval",
  withdraw_approval: "withdraw_approval",
  approve_task: "approve_task",
  ops_approve_task: "approve_task",
  reject_task: "reject_task",
  ops_reject_task: "reject_task",
  assign_designer: "assign_designer",
  batch_assign_designer: "assign_designer",
  reassign_designer: "assign_designer",
  start_making: "start_making",
  submit_review: "submit_review",
  submit_design_review: "submit_review",
  resubmit_design_review: "submit_review",
  review_approve: "review_approve",
  design_review_approve: "review_approve",
  review_reject: "review_reject",
  design_review_reject: "review_reject",
  delete_task: "delete_task",
  delete_image_task: "delete_image_task",
};

@UseGuards(AuthGuard("jwt"))
@Controller("dashboard")
export class DashboardController {
  constructor(
    private prisma: PrismaService,
    private visibility: TaskVisibilityService,
    private weeklyDesignerPlans: WeeklyDesignerPlansService,
    private dashboardRole: DashboardRoleService,
  ) {}

  @Get("role")
  async getRoleDashboard(@Request() req: any, @Query("analytics") analytics?: string) {
    const userId = Number(req.user.sub);
    const role = String(req.user.role || "");
    const [overview, roleData] = await Promise.all([
      this.getOverview(req),
      this.dashboardRole.get(role, userId, analytics !== "false"),
    ]);
    return { ...overview, roleData };
  }

  @Get("overview")
  async getOverview(@Request() req: any) {
    const userId = Number(req.user.sub);
    const role = String(req.user.role || "");
    const subject = await this.visibility.subjectForUser(role, userId);
    const taskWhere = this.visibility.buildTaskVisibilityWhere(subject);

    const [cards, todo, recent, flowCounts, recentActivities, weeklyPlan] = await Promise.all([
      this.getCards(role, userId, taskWhere, subject),
      this.getTodoItems(role, userId, subject),
      this.getRecentTasks(role, userId, taskWhere),
      this.getFlowCounts(role, taskWhere),
      this.getRecentActivities(role, userId, taskWhere),
      role === "DESIGN_MANAGER" ? this.weeklyDesignerPlans.getWeekOverview(userId, role) : Promise.resolve(null),
    ]);

    return {
      role,
      title: this.roleTitle(role),
      subtitle: this.roleSubtitle(role),
      cards,
      todoItems: todo.items,
      todoTotal: todo.total,
      todoUnit: todo.unit,
      recentTasks: recent.items,
      recentTotal: recent.total,
      recentActivities,
      flowCounts,
      weeklyPlan,
      quickActions: this.quickActions(role),
    };
  }

  private async getCards(role: string, userId: number, taskWhere: any, subject?: any) {
    if (ADMIN_ROLES.includes(role)) {
      return [
        await this.taskCard("处理中", this.visibility.scopeWhere("processing", role, userId), "/dashboard/fazhi?scope=processing"),
        await this.taskCard("待运营主管审批", { workflowStatus: "SUBMITTED" }),
        await this.taskCard("已通过待设计分配", { workflowStatus: "OPS_APPROVED" }),
        await this.taskCard("设计中", { workflowStatus: "IN_DESIGN" }),
        await this.taskCard("待设计审核", { workflowStatus: "DESIGN_REVIEW" }),
        await this.taskCard("已完成归档", { workflowStatus: { in: ["DESIGN_APPROVED", "COMPLETED", "CANCELLED"] } }, "/dashboard/fazhi?scope=archived"),
      ];
    }
    if (role === "OPERATION") {
      if (this.visibility.resolveDataScope(subject || { role, userId }).type === "GROUP") {
        return [
          await this.taskCard("本组草稿", { AND: [taskWhere, { workflowStatus: "DRAFT" }] }),
          await this.taskCard("本组待审批", { AND: [taskWhere, { workflowStatus: "SUBMITTED" }] }),
          await this.taskCard("本组被退回", { AND: [taskWhere, { workflowStatus: "OPS_REJECTED" }] }),
          await this.taskCard("本组设计流程", { AND: [taskWhere, { workflowStatus: { in: DESIGN_VISIBLE_STATUSES } }] }, "/dashboard/fazhi?scope=design-flow-history&statusGroup=designflow"),
        ];
      }
      return [
        await this.taskCard("我的草稿", { creatorId: userId, workflowStatus: "DRAFT" }),
        await this.taskCard("被主管退回", { creatorId: userId, workflowStatus: "OPS_REJECTED" }),
        await this.taskCard("待运营主管审批", { creatorId: userId, workflowStatus: "SUBMITTED" }),
        await this.taskCard("已进入设计流程", { creatorId: userId, workflowStatus: { in: DESIGN_VISIBLE_STATUSES } }, "/dashboard/fazhi?scope=design-flow-history&statusGroup=designflow"),
      ];
    }
    if (role === "OPERATION_MANAGER") {
      return [
        await this.taskCard("待我审批", { workflowStatus: "SUBMITTED" }, "/dashboard/fazhi?scope=ops-approvals"),
        await this.approvalCard("我已审批", role, userId, "OPS_APPROVED"),
        await this.approvalCard("我退回的需求", role, userId, "OPS_REJECTED"),
      ];
    }
    if (role === "DESIGN_MANAGER") {
      return [
        await this.imageMetricCard("未完成图片任务", "processing", role, userId, undefined, DESIGN_UNFINISHED_IMAGE_STATUSES, "imageGroup=unfinished"),
        await this.imageMetricCard("待分配", "design-assignment", role, userId, "PENDING_ASSIGNMENT"),
        await this.imageMetricCard("已分配设计", "design-tasks", role, userId, "NOT_STARTED"),
        await this.imageMetricCard("设计中", "design-tasks", role, userId, "IN_PROGRESS"),
        await this.imageMetricCard("待设计审核", "design-reviews", role, userId, "SUBMITTED_FOR_REVIEW"),
        await this.imageMetricCard("退回修改中", "design-tasks", role, userId, "REVISION_REQUIRED"),
      ];
    }
    if (role === "DESIGNER") {
      return [
        await this.imageMetricCard("分配给我的未开始", "processing", role, userId, "NOT_STARTED"),
        await this.imageMetricCard("我的设计中", "processing", role, userId, "IN_PROGRESS"),
        await this.imageMetricCard("退回修改任务", "processing", role, userId, "REVISION_REQUIRED"),
        await this.imageMetricCard("已提交审核", "processing", role, userId, "SUBMITTED_FOR_REVIEW"),
      ];
    }
    return [await this.taskCard("可见法旨", taskWhere)];
  }

  private async taskCard(title: string, where: any, target?: string) {
    const activeWhere = { AND: [{ deletedAt: null }, where] };
    const status = typeof where?.workflowStatus === "string" ? where.workflowStatus : undefined;
    const scope = status === "DRAFT"
      ? "drafts"
      : status && ["DESIGN_APPROVED", "COMPLETED", "CANCELLED"].includes(status) ? "archived" : "processing";
    return {
      title,
      value: await this.prisma.task.count({ where: activeWhere }),
      unit: "条",
      target: target || (status ? `/dashboard/fazhi?scope=${scope}&status=${status}` : "/dashboard/fazhi?scope=processing"),
    };
  }

  private async imageMetricCard(
    title: string,
    scope: string,
    role: string,
    userId: number,
    imageStatus?: string,
    imageStatuses?: string[],
    extraQuery?: string,
  ) {
    const where = this.visibility.imageTaskMetricWhere(scope, role, userId, imageStatus, imageStatuses);
    const params = new URLSearchParams({ scope });
    if (imageStatus) params.set("imageStatus", imageStatus);
    if (extraQuery) {
      const extra = new URLSearchParams(extraQuery);
      extra.forEach((value, key) => params.set(key, value));
    }
    return {
      title,
      value: await this.prisma.imageTask.count({ where }),
      unit: "张",
      target: `/dashboard/fazhi?${params.toString()}`,
    };
  }

  private async approvalCard(title: string, role: string, userId: number, action: string) {
    const where = {
      AND: [
        this.visibility.scopeWhere("approval-history", role, userId),
        { approvalRecords: { some: { approverId: userId, action } } },
      ],
    };
    return {
      title,
      value: await this.prisma.task.count({ where }),
      unit: "条",
      target: `/dashboard/fazhi?scope=approval-history&approvalAction=${action}`,
    };
  }

  private async getTodoItems(role: string, userId: number, subject?: any) {
    if (role === "DESIGNER") {
      const where = {
        designerId: userId,
        deletedAt: null,
        status: { in: ["NOT_STARTED", "IN_PROGRESS", "REVISION_REQUIRED"] },
        task: subject ? this.visibility.buildTaskVisibilityWhere(subject) : this.visibility.visibleWhere(role, userId),
      };
      const [items, total] = await Promise.all([
        this.prisma.imageTask.findMany({
          where,
          include: { task: { include: { store: { select: { name: true } } } } },
          orderBy: { updatedAt: "desc" },
          take: 8,
        }),
        this.prisma.imageTask.count({ where }),
      ]);
      return {
        total,
        unit: "张",
        items: items.map((item: any) => ({
          id: `image-${item.id}`,
          taskId: item.taskId,
          title: `${item.task.serialNumber} / 图片 ${item.imageIndex}`,
          status: item.status,
          description: `${item.task.store?.name || "未选店铺"} · ${item.task.productCode || "未填产品编号"} · ${item.requirement || "未填修改要求"}`,
        })),
      };
    }

    const where = this.todoTaskWhere(role, userId, subject);
    const [tasks, total] = await Promise.all([
      this.prisma.task.findMany({
        where,
        include: {
          creator: { select: { username: true, displayName: true } },
          store: { select: { name: true } },
        },
        orderBy: [{ priority: "desc" }, { updatedAt: "desc" }],
        take: 8,
      }),
      this.prisma.task.count({ where }),
    ]);
    return {
      total,
      unit: "条",
      items: tasks.map((task: any) => ({
        id: `task-${task.id}`,
        taskId: task.id,
        title: task.serialNumber,
        status: task.workflowStatus,
        description: `${task.store?.name || "未选店铺"} · ${task.productCode || "未填产品编号"} · ${this.displayRequester(task)}`,
      })),
    };
  }

  private todoTaskWhere(role: string, userId: number, subject?: any) {
    const visible = subject ? this.visibility.buildTaskVisibilityWhere(subject) : this.visibility.visibleWhere(role, userId);
    if (ADMIN_ROLES.includes(role)) {
      return { AND: [visible, { workflowStatus: { in: ["SUBMITTED", "OPS_APPROVED", "DESIGN_REVIEW"] } }] };
    }
    if (role === "OPERATION") {
      return { AND: [visible, { workflowStatus: { in: ["OPS_REJECTED", "SUBMITTED", "OPS_APPROVED", "DESIGN_REVIEW"] } }] };
    }
    if (role === "OPERATION_MANAGER") return this.visibility.scopeWhere("ops-approvals", role, userId);
    if (role === "DESIGN_MANAGER") {
      return { AND: [visible, { workflowStatus: { in: ["OPS_APPROVED", "DESIGN_REVIEW"] } }] };
    }
    return { id: -1 };
  }

  private async getRecentTasks(role: string, userId: number, where: any) {
    const [items, total] = await Promise.all([
      this.prisma.task.findMany({
        where,
        orderBy: { createdAt: "desc" },
        take: 6,
        include: {
          creator: { select: { username: true, displayName: true } },
          store: { select: { name: true } },
          imageTasks: role === "DESIGNER"
            ? { where: { designerId: userId }, select: { status: true, designerId: true } }
            : { select: { status: true, designerId: true } },
        } as any,
      }),
      this.prisma.task.count({ where }),
    ]);
    return { items, total };
  }

  private async getFlowCounts(role: string, baseWhere: any) {
    const statuses = ["SUBMITTED", "OPS_REJECTED", "OPS_APPROVED", "DESIGN_ASSIGNED", "IN_DESIGN", "DESIGN_REVIEW", "DESIGN_APPROVED"];
    const rows = await Promise.all(statuses.map(async (status) => ({
      status,
      count: await this.prisma.task.count({ where: { AND: [baseWhere, { workflowStatus: status }] } }),
      unit: "条",
    })));
    return role === "DESIGNER" ? rows.filter((row) => row.status !== "SUBMITTED") : rows;
  }

  private async getRecentActivities(role: string, userId: number, taskWhere: any) {
    const tasks = await this.prisma.task.findMany({
      where: taskWhere,
      select: { id: true, serialNumber: true },
    });
    if (!tasks.length) return [];
    const taskIds = tasks.map((task: any) => task.id);
    const taskMap = new Map(tasks.map((task: any) => [task.id, task.serialNumber]));
    const images = await this.prisma.imageTask.findMany({
      where: {
        taskId: { in: taskIds },
        deletedAt: null,
        ...(role === "DESIGNER" ? { designerId: userId } : {}),
      },
      select: { id: true, taskId: true, imageTitle: true, imageIndex: true },
    });
    const imageMap = new Map(images.map((item: any) => [item.id, item]));
    const events = await this.prisma.auditEvent.findMany({
      where: {
        action: { in: Object.keys(ACTION_ALIASES) },
        OR: [
          { resourceType: "task", resourceId: { in: taskIds } },
          { resourceType: "image_task", resourceId: { in: images.map((item: any) => item.id) } },
        ],
      },
      orderBy: { createdAt: "desc" },
      take: 100,
    });
    const operatorIds = Array.from(new Set(events.map((event: any) => event.operatorId).filter(Boolean)));
    const operators = await this.prisma.user.findMany({
      where: { id: { in: operatorIds } },
      select: { id: true, username: true, displayName: true },
    });
    const operatorMap = new Map(operators.map((user: any) => [user.id, this.displayUserName(user, "系统")]));
    const seen = new Map<string, number>();
    const result: any[] = [];

    for (const event of events) {
      const action = ACTION_ALIASES[event.action];
      if (!action) continue;
      const image = event.resourceType === "image_task" ? imageMap.get(event.resourceId) : undefined;
      const taskId = image?.taskId || event.resourceId;
      const serialNumber = taskMap.get(taskId);
      if (!serialNumber) continue;
      const key = `${event.operatorId || 0}:${event.resourceType}:${event.resourceId}:${action}`;
      const time = new Date(event.createdAt).getTime();
      const previous = seen.get(key);
      if (previous !== undefined && Math.abs(previous - time) <= 5000) continue;
      seen.set(key, time);
      result.push({
        id: event.id,
        taskId,
        action,
        label: RECENT_ACTION_LABELS[action] || action,
        operator: operatorMap.get(event.operatorId || 0) || "系统",
        target: image ? `${serialNumber} / ${image.imageTitle || `图片 ${image.imageIndex}`}` : serialNumber,
        createdAt: event.createdAt,
      });
      if (result.length >= 8) break;
    }
    return result;
  }

  private cleanDisplayText(value: any) {
    const text = value === undefined || value === null ? "" : String(value).trim();
    if (!text || /^\?+$/.test(text) || ["undefined", "null"].includes(text.toLowerCase())) return "";
    return text;
  }

  private displayUserName(user: any, fallback = "未填写") {
    return this.cleanDisplayText(user?.displayName) || this.cleanDisplayText(user?.username) || fallback;
  }

  private displayRequester(task: any, fallback = "未填写") {
    return this.cleanDisplayText(task?.requesterName) || this.displayUserName(task?.creator, fallback);
  }

  private roleTitle(role: string) {
    if (ADMIN_ROLES.includes(role)) return "管理员工作台";
    if (role === "OPERATION") return "运营工作台";
    if (role === "OPERATION_MANAGER") return "运营主管审批台";
    if (role === "DESIGN_MANAGER") return "设计主管分配与审核台";
    if (role === "DESIGNER") return "设计师任务台";
    return "工作台";
  }

  private roleSubtitle(role: string) {
    if (ADMIN_ROLES.includes(role)) return "查看全局流转与全部待处理事项";
    if (role === "OPERATION") return "聚焦我创建和需要补充的法旨";
    if (role === "OPERATION_MANAGER") return "聚焦运营审批、退回和已处理需求";
    if (role === "DESIGN_MANAGER") return "聚焦图片任务分配、设计中和待审核事项";
    if (role === "DESIGNER") return "聚焦分配给我的图片任务";
    return "当前账号暂无业务工作台权限";
  }

  private quickActions(role: string) {
    if (ADMIN_ROLES.includes(role)) {
      return [
        { label: "查看全部法旨", href: "/dashboard/fazhi?scope=processing" },
        { label: "查看操作日志", href: "/dashboard/logs" },
      ];
    }
    if (role === "OPERATION") {
      return [
        { label: "新建法旨", href: "/dashboard/fazhi/new" },
        { label: "查看我的法旨", href: "/dashboard/fazhi?scope=processing" },
      ];
    }
    if (role === "OPERATION_MANAGER") {
      return [{ label: "处理待审批", href: "/dashboard/fazhi?scope=ops-approvals" }];
    }
    if (role === "DESIGN_MANAGER") {
      return [
        { label: "管理本周计划", href: "/dashboard/weekly-designer-plans" },
        { label: "处理待分配", href: "/dashboard/weekly-designer-plans?tab=unassigned" },
        { label: "处理待审核", href: "/dashboard/fazhi?scope=design-reviews" },
      ];
    }
    if (role === "DESIGNER") {
      return [{ label: "查看我的任务", href: "/dashboard/fazhi?scope=processing" }];
    }
    return [];
  }
}
