import { Injectable, UnauthorizedException, BadRequestException, ForbiddenException } from "@nestjs/common";
import { JwtService } from "@nestjs/jwt";
import * as bcrypt from "bcryptjs";
import { PrismaService } from "../common/prisma.service";
import { OperationLogService } from "../operation-log/operation-log.service";
import { OperationsOrganizationService } from "../operations-organization/operations-organization.service";

@Injectable()
export class AuthService {
  constructor(
    private prisma: PrismaService,
    private jwtService: JwtService,
    private logService: OperationLogService,
    private readonly organization: OperationsOrganizationService,
  ) {}

  async login(username: string, password: string, ipAddress?: string) {
    const user = await this.prisma.user.findUnique({
      where: { username },
      include: { role: true },
    });

    if (!user) {
      throw new UnauthorizedException("账号或密码错误");
    }
    if (!user.isActive) {
      throw new UnauthorizedException("账号已停用，请联系管理员。");
    }

    // Login lockout check
    if (user.lockedUntil && new Date(user.lockedUntil) > new Date()) {
      const remaining = Math.ceil((new Date(user.lockedUntil).getTime() - Date.now()) / 60000);
      throw new UnauthorizedException(`账号已锁定，请${remaining}分钟后再试`);
    }

    const valid = await bcrypt.compare(password, user.password);
    if (!valid) {
      const attempts = user.loginAttempts + 1;
      const threshold = 5;
      if (attempts >= threshold) {
        const lockMinutes = 15;
        await this.prisma.user.update({
          where: { id: user.id },
          data: { loginAttempts: 0, lockedUntil: new Date(Date.now() + lockMinutes * 60000) },
        });
        await this.logService.log({ userId: user.id, action: "login_locked", targetType: "user", targetId: user.id, content: `登录失败${attempts}次，已锁定${lockMinutes}分钟`, ipAddress });
        throw new UnauthorizedException(`登录失败次数过多，账号已锁定${lockMinutes}分钟`);
      }
      await this.prisma.user.update({ where: { id: user.id }, data: { loginAttempts: attempts } });
      throw new UnauthorizedException("账号或密码错误");
    }

    if (user.loginAttempts > 0 || user.lockedUntil) {
      await this.prisma.user.update({ where: { id: user.id }, data: { loginAttempts: 0, lockedUntil: null } });
    }

    const payload = { sub: user.id, username: user.username, role: user.role.name };

    await this.logService.log({ userId: user.id, action: "login", targetType: "user", targetId: user.id, content: "登录成功", ipAddress });

    return {
      accessToken: this.jwtService.sign(payload),
      user: {
        id: user.id,
        username: user.username,
        displayName: user.displayName,
        email: user.email,
        role: user.role.name,
        isActive: user.isActive,
        mustChangePassword: user.mustChangePassword,
        createdAt: user.createdAt.toISOString(),
      },
      mustChangePassword: user.mustChangePassword,
    };
  }

  async changePassword(userId: number, oldPassword: string, newPassword: string) {
    const user = await this.prisma.user.findUnique({ where: { id: userId } });
    if (!user) throw new UnauthorizedException("用户不存在");

    const valid = await bcrypt.compare(oldPassword, user.password);
    if (!valid) throw new BadRequestException("原密码错误");

    if (newPassword.length < 6) throw new BadRequestException("新密码至少6位");

    const hash = await bcrypt.hash(newPassword, 10);
    await this.prisma.user.update({
      where: { id: userId },
      data: { password: hash, mustChangePassword: false },
    });

    await this.logService.log({ userId, action: "change_password", targetType: "user", targetId: userId, content: "修改密码" });

    return { message: "密码修改成功" };
  }

  async getCurrentUser(userId: number) {
    const user = await this.prisma.user.findUnique({
      where: { id: userId },
      include: {
        role: {
          include: {
            rolePermissions: { include: { permission: true } },
          },
        },
      },
    });

    if (!user) throw new UnauthorizedException("用户不存在");

    // Presentation identity is derived from the active membership; it is not a Role.
    const activeMembership = user.role.name === "OPERATION"
      ? await this.organization.getActiveMembership(userId)
      : null;
    const organizationIdentity = activeMembership?.memberRole === "GROUP_LEADER"
      ? "GROUP_LEADER"
      : null;

    return {
      id: user.id,
      username: user.username,
      displayName: user.displayName,
      email: user.email,
      role: user.role.name,
      isActive: user.isActive,
      mustChangePassword: user.mustChangePassword,
      organizationIdentity,
      createdAt: user.createdAt.toISOString(),
      permissions: user.role.rolePermissions.map((rp: any) => ({
        action: rp.permission.action,
        resource: rp.permission.resource,
      })),
    };
  }

  async initOwner(username: string, password: string, displayName: string) {
    const ownerRole = await this.prisma.role.findUnique({ where: { name: "OWNER" } });
    if (!ownerRole) throw new BadRequestException("系统角色未初始化，请先执行 Seed");

    const existingOwner = await this.prisma.user.findFirst({
      where: { roleId: ownerRole.id },
    });
    if (existingOwner) throw new ForbiddenException("系统已初始化，无法重复创建");

    const hash = await bcrypt.hash(password, 10);
    const user = await this.prisma.user.create({
      data: {
        username, password: hash, displayName,
        email: "", roleId: ownerRole.id,
        isActive: true, mustChangePassword: true,
      },
    });

    await this.logService.log({ userId: user.id, action: "system_init", targetType: "system", content: "系统初始化完成，创建Owner账号" });

    return { message: "系统初始化完成", username: user.username };
  }

  async isInitialized() {
    const ownerRole = await this.prisma.role.findUnique({ where: { name: "OWNER" } });
    if (!ownerRole) return { initialized: false };
    const owner = await this.prisma.user.findFirst({ where: { roleId: ownerRole.id } });
    return { initialized: !!owner };
  }

  async hasOwnerRole(userId: number): Promise<boolean> {
    const user = await this.prisma.user.findUnique({
      where: { id: userId },
      include: { role: true },
    });
    return user?.role.name === "OWNER";
  }
}
