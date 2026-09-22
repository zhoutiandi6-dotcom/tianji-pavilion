import { BadRequestException, ConflictException, Injectable, NotFoundException } from "@nestjs/common";
import { PrismaService } from "../common/prisma.service";

export const OPERATION_MEMBERSHIP_ROLE = {
  MEMBER: "MEMBER",
  GROUP_LEADER: "GROUP_LEADER",
} as const;

export type OperationMembershipRole = (typeof OPERATION_MEMBERSHIP_ROLE)[keyof typeof OPERATION_MEMBERSHIP_ROLE];

type MembershipAssignment = {
  userId: number;
  groupId: number;
  memberRole: OperationMembershipRole;
  actorId: number;
  effectiveFrom?: Date;
  reason?: string;
};

/**
 * Phase 3 organization domain boundary. It intentionally has no controller
 * and is not wired into authorization, workflow, plans, or feedback yet.
 * Membership rows are never deleted: state changes end one row and create the
 * next one, preserving the historical organization fact.
 */
@Injectable()
export class OperationsOrganizationService {
  constructor(private readonly prisma: PrismaService) {}

  getActiveMembership(userId: number) {
    return this.prisma.operationMembership.findFirst({
      where: { userId, effectiveTo: null },
      include: { group: true },
    });
  }

  getActiveGroupLeader(groupId: number) {
    return this.prisma.operationMembership.findFirst({
      where: { groupId, memberRole: OPERATION_MEMBERSHIP_ROLE.GROUP_LEADER, effectiveTo: null },
      include: { user: { select: { id: true, username: true, displayName: true } } },
    });
  }

  getMembershipAt(userId: number, timestamp: Date) {
    return this.prisma.operationMembership.findFirst({
      where: {
        userId,
        effectiveFrom: { lte: timestamp },
        OR: [{ effectiveTo: null }, { effectiveTo: { gt: timestamp } }],
      },
      include: { group: true },
      orderBy: { effectiveFrom: "desc" },
    });
  }

  getGroupMemberships(groupId: number, timestamp?: Date) {
    const where: any = { groupId };
    if (timestamp) {
      where.effectiveFrom = { lte: timestamp };
      where.OR = [{ effectiveTo: null }, { effectiveTo: { gt: timestamp } }];
    }
    return this.prisma.operationMembership.findMany({
      where,
      include: { user: { select: { id: true, username: true, displayName: true } } },
      orderBy: [{ memberRole: "asc" }, { effectiveFrom: "asc" }, { id: "asc" }],
    });
  }

  async createGroup(name: string, actorId: number) {
    const normalized = name.trim();
    if (!normalized) throw new BadRequestException("运营组名称不能为空");
    return this.prisma.$transaction(async (tx: any) => {
      const group = await tx.operationGroup.create({ data: { name: normalized, createdById: actorId } });
      await this.audit(tx, "operation_group.created", actorId, group.id, { groupId: group.id, after: { name: group.name, status: group.status } });
      return group;
    });
  }

  async renameGroup(groupId: number, name: string, actorId: number) {
    const normalized = name.trim();
    if (!normalized) throw new BadRequestException("运营组名称不能为空");
    return this.prisma.$transaction(async (tx: any) => {
      const group = await this.requireGroup(tx, groupId);
      const updated = await tx.operationGroup.update({ where: { id: groupId }, data: { name: normalized } });
      await this.audit(tx, "operation_group.renamed", actorId, groupId, { groupId, before: { name: group.name }, after: { name: updated.name } });
      return updated;
    });
  }

  async deactivateGroup(groupId: number, actorId: number, at = new Date()) {
    return this.prisma.$transaction(async (tx: any) => {
      const group = await this.requireGroup(tx, groupId);
      if (group.status === "INACTIVE") return group;
      const activeMembershipCount = await tx.operationMembership.count({ where: { groupId, effectiveTo: null } });
      if (activeMembershipCount) throw new ConflictException("运营组仍有有效成员，必须先显式结束成员关系");
      const updated = await tx.operationGroup.update({ where: { id: groupId }, data: { status: "INACTIVE", deactivatedAt: at, deactivatedById: actorId } });
      await this.audit(tx, "operation_group.deactivated", actorId, groupId, { groupId, before: { status: group.status }, after: { status: updated.status, deactivatedAt: at.toISOString() } });
      return updated;
    });
  }

  async assignMembership(input: MembershipAssignment) {
    const effectiveFrom = input.effectiveFrom || new Date();
    try {
      return await this.prisma.$transaction(async (tx: any) => {
        await this.requireActiveGroup(tx, input.groupId);
        await this.requireOperationUser(tx, input.userId);
        const existing = await tx.operationMembership.findFirst({ where: { userId: input.userId, effectiveTo: null } });
        if (existing) throw new ConflictException("该运营已有有效运营组关系，请先显式调组或结束关系");
        const membership = await tx.operationMembership.create({
          data: {
            userId: input.userId, groupId: input.groupId, memberRole: input.memberRole,
            effectiveFrom, assignedById: input.actorId, reason: input.reason?.trim() || null,
          },
        });
        await this.auditMembership(tx, "operation_membership.assigned", input.actorId, membership, { reason: membership.reason });
        if (input.memberRole === OPERATION_MEMBERSHIP_ROLE.GROUP_LEADER) {
          await this.auditMembership(tx, "operation_group_leader.appointed", input.actorId, membership, { reason: membership.reason });
        }
        return membership;
      });
    } catch (error: any) {
      this.rethrowPartialUniqueConflict(error);
    }
  }

  async endActiveMembership(userId: number, actorId: number, reason: string, effectiveTo = new Date()) {
    if (!reason.trim()) throw new BadRequestException("结束成员关系必须填写原因");
    return this.prisma.$transaction(async (tx: any) => {
      const membership = await tx.operationMembership.findFirst({ where: { userId, effectiveTo: null } });
      if (!membership) throw new NotFoundException("未找到有效运营组关系");
      if (effectiveTo.getTime() < membership.effectiveFrom.getTime()) throw new BadRequestException("结束时间不能早于生效时间");
      const updated = await tx.operationMembership.update({ where: { id: membership.id }, data: { effectiveTo, endedById: actorId, reason: reason.trim() } });
      await this.auditMembership(tx, "operation_membership.ended", actorId, updated, { before: { effectiveTo: null }, reason: updated.reason });
      if (membership.memberRole === OPERATION_MEMBERSHIP_ROLE.GROUP_LEADER) {
        await this.auditMembership(tx, "operation_group_leader.revoked", actorId, updated, { reason: updated.reason });
      }
      return updated;
    });
  }

  async moveMembership(input: MembershipAssignment & { reason: string }) {
    if (!input.reason.trim()) throw new BadRequestException("调组必须填写原因");
    const effectiveFrom = input.effectiveFrom || new Date();
    try {
      return await this.prisma.$transaction(async (tx: any) => {
        await this.requireActiveGroup(tx, input.groupId);
        await this.requireOperationUser(tx, input.userId);
        const current = await tx.operationMembership.findFirst({ where: { userId: input.userId, effectiveTo: null } });
        if (!current) throw new NotFoundException("未找到有效运营组关系");
        if (effectiveFrom.getTime() < current.effectiveFrom.getTime()) throw new BadRequestException("调组时间不能早于原关系生效时间");
        await tx.operationMembership.update({ where: { id: current.id }, data: { effectiveTo: effectiveFrom, endedById: input.actorId, reason: input.reason.trim() } });
        const membership = await tx.operationMembership.create({ data: { userId: input.userId, groupId: input.groupId, memberRole: input.memberRole, effectiveFrom, assignedById: input.actorId, reason: input.reason.trim() } });
        await this.auditMembership(tx, "operation_membership.moved", input.actorId, membership, { fromGroupId: current.groupId, fromMembershipId: current.id, reason: input.reason.trim() });
        return membership;
      });
    } catch (error: any) {
      this.rethrowPartialUniqueConflict(error);
    }
  }

  private async requireGroup(tx: any, groupId: number) {
    const group = await tx.operationGroup.findUnique({ where: { id: groupId } });
    if (!group) throw new NotFoundException("运营组不存在");
    return group;
  }

  private async requireActiveGroup(tx: any, groupId: number) {
    const group = await this.requireGroup(tx, groupId);
    if (group.status !== "ACTIVE") throw new ConflictException("运营组已停用");
    return group;
  }

  private async requireOperationUser(tx: any, userId: number) {
    const user = await tx.user.findUnique({ where: { id: userId }, include: { role: { select: { name: true } } } });
    if (!user || user.role.name !== "OPERATION") throw new BadRequestException("运营组成员必须是 OPERATION 用户");
    return user;
  }

  private async audit(tx: any, action: string, actorId: number, resourceId: number, metadata: Record<string, unknown>) {
    return tx.auditEvent.create({ data: { resourceType: "operation_group", resourceId, action, operatorId: actorId, correlationId: `operation_group_${resourceId}`, metadata: JSON.stringify(metadata) } });
  }

  private async auditMembership(tx: any, action: string, actorId: number, membership: any, metadata: Record<string, unknown>) {
    return tx.auditEvent.create({ data: { resourceType: "operation_membership", resourceId: membership.id, action, operatorId: actorId, correlationId: `operation_group_${membership.groupId}`, metadata: JSON.stringify({ groupId: membership.groupId, userId: membership.userId, memberRole: membership.memberRole, effectiveFrom: membership.effectiveFrom, effectiveTo: membership.effectiveTo, ...metadata }) } });
  }

  private rethrowPartialUniqueConflict(error: any): never {
    if (error?.code === "P2002") throw new ConflictException("并发冲突：用户已有有效运营组关系，或该运营组已有有效组长");
    throw error;
  }
}
