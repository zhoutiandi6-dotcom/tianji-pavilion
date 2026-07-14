import { Controller, Get, Request, UseGuards } from "@nestjs/common";
import { AuthGuard } from "@nestjs/passport";
import { PrismaService } from "../common/prisma.service";
import { TaskVisibilityService } from "../common/task-visibility.service";

const ADMIN_ROLES = ["OWNER", "SUPER_ADMIN"];
const DESIGN_VISIBLE = ["OPS_APPROVED", "DESIGN_ASSIGNED", "IN_DESIGN", "DESIGN_REVIEW", "DESIGN_APPROVED", "COMPLETED"];

@UseGuards(AuthGuard("jwt"))
@Controller("dashboard")
export class DashboardController {
  constructor(private prisma: PrismaService, private visibility: TaskVisibilityService) {}

  private cleanDisplayText(value: any) {
    const text = value === undefined || value === null ? "" : String(value).trim();
    if (!text) return "";
    if (/^\?+$/.test(text)) return "";
    if (["undefined", "null"].includes(text.toLowerCase())) return "";
    return text;
  }

  private displayUserName(user: any, fallback = "未填写") {
    return this.cleanDisplayText(user?.displayName)
      || this.cleanDisplayText(user?.username)
      || fallback;
  }

  private displayRequester(task: any, fallback = "未填写") {
    return this.cleanDisplayText(task?.requesterName)
      || this.displayUserName(task?.creator, fallback);
  }

  @Get("overview")
  async getOverview(@Request() req: any) {
    const userId = Number(req.user.sub);
    const role = req.user.role;
    const taskWhere = this.taskWhere(role, userId);

    const [cards, todoItems, recentTasks, flowCounts] = await Promise.all([
      this.getCards(role, userId, taskWhere),
      this.getTodoItems(role, userId),
      this.getRecentTasks(role, userId, taskWhere),
      this.getFlowCounts(role, taskWhere),
    ]);

    return {
      role,
      title: this.roleTitle(role),
      subtitle: this.roleSubtitle(role),
      cards,
      todoItems,
      recentTasks,
      flowCounts,
      quickActions: this.quickActions(role),
    };
  }

  private taskWhere(role: string, userId: number) {
    return this.visibility.visibleWhere(role, userId);
  }

  private async getCards(role: string, userId: number, taskWhere: any) {
    if (ADMIN_ROLES.includes(role)) {
      return [
        await this.taskCard("正式法旨", { workflowStatus: { not: "DRAFT" } }),
        await this.taskCard("待运营主管审批", { workflowStatus: "SUBMITTED" }),
        await this.taskCard("已通过待设计分配", { workflowStatus: "OPS_APPROVED" }),
        await this.taskCard("设计中", { workflowStatus: "IN_DESIGN" }),
        await this.taskCard("待设计审核", { workflowStatus: "DESIGN_REVIEW" }),
        await this.taskCard("设计审核已通过", { workflowStatus: "DESIGN_APPROVED" }),
      ];
    }
    if (role === "OPERATION") {
      return [
        await this.taskCard("我的草稿", { creatorId: userId, workflowStatus: "DRAFT" }),
        await this.taskCard("被主管退回", { creatorId: userId, workflowStatus: "OPS_REJECTED" }),
        await this.taskCard("待运营主管审批", { creatorId: userId, workflowStatus: "SUBMITTED" }),
        await this.taskCard("已通过待设计处理", { creatorId: userId, workflowStatus: { in: DESIGN_VISIBLE } }),
      ];
    }
    if (role === "OPERATION_MANAGER") {
      return [
        await this.taskCard("待我审批", { workflowStatus: "SUBMITTED" }),
        await this.approvalCard("我已审批", userId, "OPS_APPROVED"),
        await this.approvalCard("我退回的需求", userId, "OPS_REJECTED"),
        await this.taskCard("最近提交审批", { workflowStatus: "SUBMITTED" }),
      ];
    }
    if (role === "DESIGN_MANAGER") {
      return [
        await this.taskCard("已通过待分配", { workflowStatus: "OPS_APPROVED", deletedAt: null }),
        await this.taskCard("已分配设计", { workflowStatus: "DESIGN_ASSIGNED", deletedAt: null }),
        await this.taskCard("设计中", { workflowStatus: "IN_DESIGN", deletedAt: null }),
        await this.taskCard("待设计审核", { workflowStatus: "DESIGN_REVIEW", deletedAt: null }),
        await this.imageCard("退回修改中", { status: "REVISION_REQUIRED", task: { workflowStatus: "IN_DESIGN", deletedAt: null } }),
      ];
    }
    if (role === "DESIGNER") {
      return [
        await this.imageCard("分配给我的未开始", { designerId: userId, status: "NOT_STARTED", task: { workflowStatus: { in: DESIGN_VISIBLE } } }),
        await this.imageCard("我的设计中", { designerId: userId, status: "IN_PROGRESS", task: { workflowStatus: { in: DESIGN_VISIBLE } } }),
        await this.imageCard("退回修改任务", { designerId: userId, status: "REVISION_REQUIRED", task: { workflowStatus: { in: DESIGN_VISIBLE } } }),
        await this.imageCard("待我重新提交", { designerId: userId, status: "REVISION_REQUIRED", task: { workflowStatus: { in: DESIGN_VISIBLE } } }),
        await this.imageCard("已提交审核", { designerId: userId, status: "SUBMITTED_FOR_REVIEW", task: { workflowStatus: { in: DESIGN_VISIBLE } } }),
      ];
    }
    return [await this.taskCard("可见法旨", taskWhere)];
  }

  private async taskCard(title: string, where: any) {
    const status = typeof where?.workflowStatus === "string" ? where.workflowStatus : undefined;
    const scope = status === "DRAFT" ? "drafts" : status && ["DESIGN_APPROVED", "COMPLETED", "CANCELLED"].includes(status) ? "archived" : "processing";
    return { title, value: await this.prisma.task.count({ where }), target: status ? `/dashboard/fazhi?scope=${scope}&status=${status}` : "/dashboard/fazhi?scope=processing" };
  }

  private async imageCard(title: string, where: any) {
    const map: Record<string, string> = {
      NOT_STARTED: "DESIGN_ASSIGNED",
      IN_PROGRESS: "IN_DESIGN",
      SUBMITTED_FOR_REVIEW: "DESIGN_REVIEW",
      APPROVED: "DESIGN_APPROVED",
      COMPLETED: "COMPLETED",
      REVISION_REQUIRED: "IN_DESIGN",
      PENDING_ASSIGNMENT: "OPS_APPROVED",
    };
    const status = typeof where?.status === "string" ? map[where.status] : undefined;
    const taskWhere = status
      ? { deletedAt: null, workflowStatus: status, imageTasks: { some: where } }
      : { deletedAt: null, imageTasks: { some: where } };
    return {
      title,
      value: await this.prisma.task.count({ where: taskWhere }),
      target: status ? `/dashboard/fazhi?scope=processing&status=${status}&imageStatus=${where.status}` : "/dashboard/fazhi",
    };
  }

  private async approvalCard(title: string, userId: number, action: string) {
    return { title, value: await this.prisma.approvalRecord.count({ where: { approverId: userId, action } }), target: "/dashboard/fazhi" };
  }

  private async getTodoItems(role: string, userId: number) {
    if (role === "DESIGNER") {
      const items = await this.prisma.imageTask.findMany({
        where: { designerId: userId, status: { in: ["NOT_STARTED", "IN_PROGRESS", "REVISION_REQUIRED"] }, task: { workflowStatus: { in: DESIGN_VISIBLE } } },
        include: { task: { include: { store: { select: { name: true } } } }, designer: { select: { displayName: true } } },
        orderBy: [{ updatedAt: "desc" }],
        take: 8,
      });
      return items.map((it: any) => ({
        id: `image-${it.id}`,
        taskId: it.taskId,
        title: `${it.task.serialNumber} / 图片 ${it.imageIndex}`,
        status: it.status,
        description: `${it.task.store?.name || "未选店铺"} · ${it.task.productCode || "未填 SKU"} · ${it.requirement || "未填修改要求"}`,
      }));
    }

    const where = this.todoTaskWhere(role, userId);
    const tasks = await this.prisma.task.findMany({
      where,
      include: {
        creator: { select: { username: true, displayName: true } },
        store: { select: { name: true } },
        _count: { select: { imageTasks: true } },
      },
      orderBy: [{ priority: "desc" }, { updatedAt: "desc" }],
      take: 8,
    });
    return tasks.map((task: any) => ({
      id: `task-${task.id}`,
      taskId: task.id,
      title: task.serialNumber,
      status: task.workflowStatus,
      description: `${task.store?.name || "未选店铺"} · ${task.productCode || "未填 SKU"} · ${this.displayRequester(task, "未填需求人")}`,
    }));
  }

  private todoTaskWhere(role: string, userId: number) {
    if (ADMIN_ROLES.includes(role)) {
      return { workflowStatus: { in: ["SUBMITTED", "OPS_APPROVED", "DESIGN_REVIEW"] } };
    }
    if (role === "OPERATION") {
      return { creatorId: userId, workflowStatus: { in: ["OPS_REJECTED", "SUBMITTED", "OPS_APPROVED", "DESIGN_REVIEW"] } };
    }
    if (role === "OPERATION_MANAGER") return { workflowStatus: "SUBMITTED" };
    if (role === "DESIGN_MANAGER") return { deletedAt: null, workflowStatus: { in: ["OPS_APPROVED", "DESIGN_REVIEW"] } };
    return { id: -1 };
  }

  private async getRecentTasks(role: string, userId: number, where: any) {
    return this.prisma.task.findMany({
      where,
      orderBy: { createdAt: "desc" },
      take: 6,
      include: {
        creator: { select: { username: true, displayName: true } },
        store: { select: { name: true } },
        _count: { select: { imageTasks: true } },
        imageTasks: role === "DESIGNER" ? { where: { designerId: userId }, select: { status: true, designerId: true } } : { select: { status: true, designerId: true } },
      } as any,
    });
  }

  private async getFlowCounts(role: string, baseWhere: any) {
    const statuses = ["SUBMITTED", "OPS_REJECTED", "OPS_APPROVED", "DESIGN_ASSIGNED", "IN_DESIGN", "DESIGN_REVIEW", "DESIGN_APPROVED"];
    const rows = await Promise.all(statuses.map(async (status) => ({
      status,
      count: await this.prisma.task.count({ where: { ...baseWhere, workflowStatus: status } }),
    })));
    if (role === "DESIGNER") return rows.filter((row) => row.status !== "SUBMITTED");
    return rows;
  }

  private roleTitle(role: string) {
    if (ADMIN_ROLES.includes(role)) return "管理员工作台";
    if (role === "OPERATION") return "运营工作台";
    if (role === "OPERATION_MANAGER") return "运营主管审批台";
    if (role === "DESIGN_MANAGER") return "设计主管分配与审核台";
    if (role === "DESIGNER") return "设计师任务台";
    return "角色工作台";
  }

  private roleSubtitle(role: string) {
    if (ADMIN_ROLES.includes(role)) return "查看全局流转与全部待处理事项";
    if (role === "OPERATION") return "聚焦我创建和需要补充的法旨";
    if (role === "OPERATION_MANAGER") return "聚焦运营审批、退回和已处理需求";
    if (role === "DESIGN_MANAGER") return "聚焦设计分配、设计中和待审核任务";
    if (role === "DESIGNER") return "聚焦分配给我的图片任务";
    return "查看与你相关的事项";
  }

  private quickActions(role: string) {
    if (ADMIN_ROLES.includes(role)) return [{ label: "查看全部法旨", href: "/dashboard/fazhi" }, { label: "查看操作日志", href: "/dashboard/logs" }];
    if (role === "OPERATION") return [{ label: "新建法旨", href: "/dashboard/fazhi/new" }, { label: "查看我的法旨", href: "/dashboard/fazhi?scope=processing" }];
    if (role === "OPERATION_MANAGER") return [{ label: "处理待审批", href: "/dashboard/fazhi?scope=ops-approvals" }];
    if (role === "DESIGN_MANAGER") return [{ label: "处理待分配", href: "/dashboard/fazhi?scope=design-assignment" }, { label: "处理待审核", href: "/dashboard/fazhi?scope=design-reviews" }];
    if (role === "DESIGNER") return [{ label: "查看我的任务", href: "/dashboard/fazhi?scope=processing" }];
    return [{ label: "进入法旨中心", href: "/dashboard/fazhi?scope=processing" }];
  }
}
