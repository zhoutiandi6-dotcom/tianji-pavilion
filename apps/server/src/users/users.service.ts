import { Injectable, NotFoundException, ConflictException, ForbiddenException } from "@nestjs/common";
import * as bcrypt from "bcryptjs";
import { PrismaService } from "../common/prisma.service";
import { OperationLogService } from "../operation-log/operation-log.service";
import { CreateUserDto } from "./dto/create-user.dto";
import { UpdateUserDto } from "./dto/update-user.dto";

@Injectable()
export class UsersService {
  constructor(
    private prisma: PrismaService,
    private logService: OperationLogService,
  ) {}

  private cleanDisplayText(value: any) {
    const text = value === undefined || value === null ? "" : String(value).trim();
    if (!text) return "";
    if (/^\?+$/.test(text)) return "";
    if (["undefined", "null"].includes(text.toLowerCase())) return "";
    return text;
  }

  async findAll(page = 1, pageSize = 50) {
    pageSize = Math.min(pageSize, 200);
    const skip = (page - 1) * pageSize;
    const users = await this.prisma.user.findMany({
      include: { role: true },
      orderBy: { id: "asc" },
      skip, take: pageSize,
    });
    const mapped = users.map((u: any) => ({
      id: u.id, username: u.username, displayName: u.displayName,
      email: u.email, role: u.role.name, roleId: u.roleId,
      isActive: u.isActive,
      mustChangePassword: u.mustChangePassword,
      createdAt: u.createdAt.toISOString(),
    }));
    return mapped;
  }

  async findOne(id: number) {
    const u = await this.prisma.user.findUnique({ where: { id }, include: { role: true } });
    if (!u) throw new NotFoundException("用户不存在");
    return {
      id: u.id, username: u.username, displayName: u.displayName,
      email: u.email, role: u.role.name, roleId: u.roleId,
      isActive: u.isActive,
      createdAt: u.createdAt.toISOString(),
    };
  }

  async findDesigners() {
    const users = await this.prisma.user.findMany({
      where: { isActive: true, role: { name: "DESIGNER" } },
      include: { role: true },
      orderBy: { id: "asc" },
    });
    return users.map((u: any) => ({
      // userId is the assignment identifier. Keep the legacy fields for existing callers.
      userId: u.id,
      id: u.id,
      name: this.cleanDisplayText(u.displayName) || u.username,
      username: u.username,
      roles: [u.role.name],
      enabled: u.isActive,
      displayName: u.displayName,
      email: u.email,
      role: u.role.name,
      roleId: u.roleId,
      isActive: u.isActive,
    }));
  }

  async create(dto: CreateUserDto, operatorId: number) {
    const existing = await this.prisma.user.findUnique({ where: { username: dto.username } });
    if (existing) throw new ConflictException("用户名已存在");

    if (dto.roleName === "OWNER") {
      throw new ForbiddenException("无法创建系统所有者账号");
    }

    const hash = await bcrypt.hash(dto.password, 10);
    let roleId = dto.roleId;
    if (dto.roleName) {
      const roleByName = await this.prisma.role.findUnique({ where: { name: dto.roleName } });
      if (!roleByName) throw new NotFoundException("角色不存在");
      roleId = roleByName.id;
    }
    if (!roleId) throw new ForbiddenException("请选择角色");
    const role = await this.prisma.role.findUnique({ where: { id: roleId } });
    if (!role) throw new NotFoundException("角色不存在");
    if (role.name === "OWNER") throw new ForbiddenException("无法创建系统所有者账号");

    const user = await this.prisma.user.create({
      data: {
        username: dto.username, password: hash,
        displayName: this.cleanDisplayText(dto.displayName) || dto.username, email: dto.email || "",
        roleId, isActive: false,
      },
      include: { role: true },
    });

    await this.logService.log({
      userId: operatorId, action: "create_user", targetType: "user",
      targetId: user.id, content: `创建用户: ${user.username} (${user.displayName})`,
    });

    return user;
  }

  async update(id: number, dto: UpdateUserDto, operatorId: number) {
    const u = await this.prisma.user.findUnique({ where: { id }, include: { role: true } });
    if (!u) throw new NotFoundException("用户不存在");
    if (id === operatorId && dto.isActive === false) throw new ForbiddenException("不能停用当前登录账号");

    // Owner protection: cannot modify Owner's role or deactivate Owner
    if (u.role.name === "OWNER") {
      if (dto.roleId !== undefined && dto.roleId !== u.roleId) {
        throw new ForbiddenException("无法修改系统所有者的角色");
      }
      if (dto.isActive === false) {
        throw new ForbiddenException("无法禁用系统所有者账号");
      }
    }

    const data: any = { ...dto };
    if (dto.displayName !== undefined) data.displayName = this.cleanDisplayText(dto.displayName) || u.username;
    const before = { roleId: u.roleId, isActive: u.isActive, displayName: u.displayName };
    const updated = await this.prisma.user.update({
      where: { id }, data,
      include: { role: true },
    });

    await this.logService.log({
      userId: operatorId, action: "update_user", targetType: "user",
      targetId: id, content: `修改用户: ${u.username}`,
      beforeValue: before,
      afterValue: { roleId: updated.roleId, isActive: updated.isActive, displayName: updated.displayName },
    });

    return updated;
  }

  async deactivate(id: number, operatorId: number) {
    const u = await this.prisma.user.findUnique({ where: { id }, include: { role: true } });
    if (!u) throw new NotFoundException("用户不存在");
    if (id === operatorId) throw new ForbiddenException("不能停用当前登录账号");
    if (u.role.name === "OWNER") throw new ForbiddenException("无法禁用系统所有者");

    await this.prisma.user.update({ where: { id }, data: { isActive: false } });

    await this.logService.log({
      userId: operatorId, action: "disable_user", targetType: "user",
      targetId: id, content: `禁用用户: ${u.username}`,
    });

    return { message: "用户已禁用" };
  }

  async activate(id: number, operatorId: number) {
    const u = await this.prisma.user.findUnique({ where: { id } });
    if (!u) throw new NotFoundException("用户不存在");

    await this.prisma.user.update({ where: { id }, data: { isActive: true } });

    await this.logService.log({
      userId: operatorId, action: "enable_user", targetType: "user",
      targetId: id, content: `启用用户: ${u.username}`,
    });

    return { message: "用户已启用" };
  }

  async resetPassword(id: number, operatorId: number) {
    const u = await this.prisma.user.findUnique({ where: { id } });
    if (!u) throw new NotFoundException("用户不存在");

    const defaultPassword = "123456";
    const hash = await bcrypt.hash(defaultPassword, 10);
    await this.prisma.user.update({
      where: { id },
      data: { password: hash, mustChangePassword: true },
    });

    await this.logService.log({
      userId: operatorId, action: "reset_password", targetType: "user",
      targetId: id, content: `重置密码: ${u.username}`,
    });

    return { message: "密码已重置为 123456", defaultPassword };
  }

  async remove(id: number, operatorId: number) {
    if (id === operatorId) throw new ForbiddenException("不能删除当前登录账号");
    const u = await this.prisma.user.findUnique({ where: { id }, include: { role: true } });
    if (!u) throw new NotFoundException("用户不存在");
    if (u.role.name === "OWNER") throw new ForbiddenException("无法删除系统所有者");

    const [
      createdTasks,
      imageTasks,
      approvalRecords,
      operationLogs,
      uploadedAttachments,
      announcements,
    ] = await Promise.all([
      this.prisma.task.count({ where: { creatorId: id } }),
      this.prisma.imageTask.count({ where: { designerId: id } }),
      this.prisma.approvalRecord.count({ where: { approverId: id } }),
      this.prisma.operationLog.count({ where: { userId: id } }),
      this.prisma.attachment.count({ where: { uploadedById: id } }),
      this.prisma.announcement.count({ where: { creatorId: id } }),
    ]);
    const relationCount = createdTasks + imageTasks + approvalRecords + operationLogs + uploadedAttachments + announcements;
    if (relationCount > 0) {
      throw new ForbiddenException("该用户已有历史任务或操作记录，请改为停用。");
    }

    await this.logService.log({
      userId: operatorId, action: "delete_test_user", targetType: "user",
      targetId: id, content: `删除测试用户: ${u.username}`,
    });
    await this.prisma.user.delete({ where: { id } });
    return { message: "测试用户已删除" };
  }
}

