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

const MEMBER_SELECT = { id: true, username: true, displayName: true, isActive: true };

/**
 * Phase 3 organization domain boundary. It intentionally has no controller
 * and is not wired into authorization, workflow, plans, or feedback yet.
 * Membership rows are never deleted: state changes end one row and create the
 * next one, preserving the historical organization fact.
 */
@Injectable()
export class OperationsOrganizationService {
  constructor(private readonly prisma: PrismaService) {}

  getActiveMembership(userId: number, at = new Date()) {
    return this.prisma.operationMembership.findFirst({
      where: {
        userId,
        effectiveFrom: { lte: at },
        OR: [{ effectiveTo: null }, { effectiveTo: { gt: at } }],
      },
      include: { group: true },
    });
  }

  getActiveGroupLeader(groupId: number, at = new Date()) {
    return this.prisma.operationMembership.findFirst({
      where: {
        groupId,
        memberRole: OPERATION_MEMBERSHIP_ROLE.GROUP_LEADER,
        effectiveFrom: { lte: at },
        OR: [{ effectiveTo: null }, { effectiveTo: { gt: at } }],
      },
      include: { user: { select: { id: true, username: true, displayName: true } } },
    });
  }

  /** Uses the caller's transaction so submit and snapshot freezing are atomic. */
  getMembershipAtInTransaction(tx: any, userId: number, timestamp: Date) {
    return tx.operationMembership.findFirst({
      where: {
        userId,
        effectiveFrom: { lte: timestamp },
        OR: [{ effectiveTo: null }, { effectiveTo: { gt: timestamp } }],
      },
      include: { group: true },
      orderBy: { effectiveFrom: "desc" },
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

  async listGroups() {
    const groups = await this.prisma.operationGroup.findMany({
      include: {
        memberships: {
          where: { effectiveTo: null },
          include: { user: { select: MEMBER_SELECT } },
          orderBy: [{ memberRole: "desc" }, { effectiveFrom: "asc" }],
        },
      },
      orderBy: [{ status: "asc" }, { name: "asc" }],
    });
    return groups.map((group: any) => this.presentGroup(group));
  }

  async getGroupDetail(groupId: number) {
    const group = await this.prisma.operationGroup.findUnique({
      where: { id: groupId },
      include: { memberships: { where: { effectiveTo: null }, include: { user: { select: MEMBER_SELECT } }, orderBy: [{ memberRole: "desc" }, { effectiveFrom: "asc" }] } },
    });
    if (!group) throw new NotFoundException("运营组不存在");
    return this.presentGroup(group);
  }

  async getUnassignedOperations() {
    return this.prisma.user.findMany({
      where: { isActive: true, role: { name: "OPERATION" }, operationMemberships: { none: { effectiveTo: null } } },
      select: MEMBER_SELECT,
      orderBy: [{ displayName: "asc" }, { username: "asc" }],
    });
  }

  async getReadiness() {
    const [operationUserCount, activeMembershipCount, leaderCount, managerCount, groups, duplicateMemberships, duplicateLeaders] = await Promise.all([
      this.prisma.user.count({ where: { isActive: true, role: { name: "OPERATION" } } }),
      this.prisma.operationMembership.count({ where: { effectiveTo: null } }),
      this.prisma.operationMembership.count({ where: { effectiveTo: null, memberRole: "GROUP_LEADER" } }),
      this.prisma.user.count({ where: { isActive: true, role: { name: "OPERATION_MANAGER" } } }),
      this.listGroups(),
      this.prisma.operationMembership.groupBy({ by: ["userId"], where: { effectiveTo: null }, _count: { _all: true }, having: { userId: { _count: { gt: 1 } } } }),
      this.prisma.operationMembership.groupBy({ by: ["groupId"], where: { effectiveTo: null, memberRole: "GROUP_LEADER" }, _count: { _all: true }, having: { groupId: { _count: { gt: 1 } } } }),
    ]);
    const activeGroups = groups.filter((group: any) => group.status === "ACTIVE");
    return {
      mode: process.env.ORG_PERMISSION_ENFORCEMENT || "compatibility",
      source: "current configured database (read-only query)",
      operationUserCount,
      assignedOperationCount: activeMembershipCount,
      unassignedOperationCount: Math.max(operationUserCount - activeMembershipCount, 0),
      groupLeaderCount: leaderCount,
      operationManagerCount: managerCount,
      activeGroupCount: activeGroups.length,
      groupsWithoutLeader: activeGroups.filter((group: any) => !group.leader).map((group: any) => ({ id: group.id, name: group.name })),
      duplicateActiveMemberships: duplicateMemberships.map((row: any) => row.userId),
      duplicateActiveLeaders: duplicateLeaders.map((row: any) => row.groupId),
      strictReady: operationUserCount === activeMembershipCount && activeGroups.every((group: any) => group.leader) && !duplicateMemberships.length && !duplicateLeaders.length,
    };
  }

  async listAudit(limit = 100) {
    const items = await this.prisma.auditEvent.findMany({
      where: { OR: [{ action: { startsWith: "operation_group" } }, { action: { startsWith: "operation_membership" } }] },
      orderBy: { createdAt: "desc" },
      take: Math.min(Math.max(limit, 1), 200),
    });
    return items.map((item: any) => ({ ...item, metadata: this.parseAuditMetadata(item.metadata) }));
  }

  async createGroup(name: string, actorId: number) {
    const normalized = name.trim();
    if (!normalized) throw new BadRequestException("运营组名称不能为空");
    if (normalized.length > 80) throw new BadRequestException("运营组名称不能超过 80 个字符");
    return this.prisma.$transaction(async (tx: any) => {
      const group = await tx.operationGroup.create({ data: { name: normalized, createdById: actorId } });
      await this.audit(tx, "operation_group.created", actorId, group.id, { groupId: group.id, userId: null, before: null, after: this.groupSnapshot(group) });
      return group;
    });
  }

  async renameGroup(groupId: number, name: string, actorId: number) {
    const normalized = name.trim();
    if (!normalized) throw new BadRequestException("运营组名称不能为空");
    if (normalized.length > 80) throw new BadRequestException("运营组名称不能超过 80 个字符");
    return this.prisma.$transaction(async (tx: any) => {
      const group = await this.requireGroup(tx, groupId);
      const updated = await tx.operationGroup.update({ where: { id: groupId }, data: { name: normalized } });
      await this.audit(tx, "operation_group.renamed", actorId, groupId, { groupId, userId: null, before: this.groupSnapshot(group), after: this.groupSnapshot(updated) });
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
      await this.audit(tx, "operation_group.deactivated", actorId, groupId, { groupId, userId: null, before: this.groupSnapshot(group), after: this.groupSnapshot(updated) });
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
          await this.auditMembership(tx, "operation_group_leader.appointed", input.actorId, membership, { before: null, after: this.membershipSnapshot(membership), reason: membership.reason });
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
      if (membership.memberRole === OPERATION_MEMBERSHIP_ROLE.GROUP_LEADER) throw new ConflictException("当前用户是运营组长，请先撤销或更换组长");
      if (effectiveTo.getTime() < membership.effectiveFrom.getTime()) throw new BadRequestException("结束时间不能早于生效时间");
      const updated = await tx.operationMembership.update({ where: { id: membership.id }, data: { effectiveTo, endedById: actorId, reason: reason.trim() } });
      await this.auditMembership(tx, "operation_membership.ended", actorId, updated, { before: this.membershipSnapshot(membership), after: this.membershipSnapshot(updated), reason: updated.reason });
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
        if (current.memberRole === OPERATION_MEMBERSHIP_ROLE.GROUP_LEADER) throw new ConflictException("当前用户是运营组长，请先撤销或更换组长");
        if (effectiveFrom.getTime() < current.effectiveFrom.getTime()) throw new BadRequestException("调组时间不能早于原关系生效时间");
        const ended = await tx.operationMembership.update({ where: { id: current.id }, data: { effectiveTo: effectiveFrom, endedById: input.actorId, reason: input.reason.trim() } });
        const membership = await tx.operationMembership.create({ data: { userId: input.userId, groupId: input.groupId, memberRole: input.memberRole, effectiveFrom, assignedById: input.actorId, reason: input.reason.trim() } });
        await this.auditMembership(tx, "operation_membership.moved", input.actorId, membership, { before: this.membershipSnapshot(current), after: this.membershipSnapshot(membership), endedMembership: this.membershipSnapshot(ended), reason: input.reason.trim() });
        return membership;
      });
    } catch (error: any) {
      this.rethrowPartialUniqueConflict(error);
    }
  }

  async appointLeader(groupId: number, userId: number, actorId: number, reason?: string) {
    return this.prisma.$transaction(async (tx: any) => {
      await this.requireActiveGroup(tx, groupId);
      const member = await tx.operationMembership.findFirst({ where: { groupId, userId, effectiveTo: null, memberRole: OPERATION_MEMBERSHIP_ROLE.MEMBER } });
      if (!member) throw new BadRequestException("只能任命当前运营组成员为组长");
      const leader = await tx.operationMembership.findFirst({ where: { groupId, effectiveTo: null, memberRole: OPERATION_MEMBERSHIP_ROLE.GROUP_LEADER } });
      if (leader) throw new ConflictException("该运营组已有有效组长，请使用更换组长");
      const now = new Date();
      await tx.operationMembership.update({ where: { id: member.id }, data: { effectiveTo: now, endedById: actorId, reason: reason?.trim() || "任命运营组长" } });
      const appointed = await tx.operationMembership.create({ data: { userId, groupId, memberRole: OPERATION_MEMBERSHIP_ROLE.GROUP_LEADER, effectiveFrom: now, assignedById: actorId, reason: reason?.trim() || null } });
      await this.auditMembership(tx, "operation_group_leader.appointed", actorId, appointed, { before: this.membershipSnapshot(member), after: this.membershipSnapshot(appointed), reason: appointed.reason });
      return appointed;
    }).catch((error: any) => this.rethrowPartialUniqueConflict(error));
  }

  async replaceLeader(groupId: number, userId: number, actorId: number, keepPreviousMember = true, reason?: string) {
    return this.prisma.$transaction(async (tx: any) => {
      await this.requireActiveGroup(tx, groupId);
      const [previous, candidate] = await Promise.all([
        tx.operationMembership.findFirst({ where: { groupId, effectiveTo: null, memberRole: OPERATION_MEMBERSHIP_ROLE.GROUP_LEADER } }),
        tx.operationMembership.findFirst({ where: { groupId, userId, effectiveTo: null, memberRole: OPERATION_MEMBERSHIP_ROLE.MEMBER } }),
      ]);
      if (!previous) throw new NotFoundException("该运营组当前无有效组长，请使用任命组长");
      if (!candidate) throw new BadRequestException("新组长必须是当前运营组成员");
      const now = new Date();
      const note = reason?.trim() || "更换运营组长";
      await tx.operationMembership.update({ where: { id: previous.id }, data: { effectiveTo: now, endedById: actorId, reason: note } });
      await tx.operationMembership.update({ where: { id: candidate.id }, data: { effectiveTo: now, endedById: actorId, reason: note } });
      if (keepPreviousMember) {
        const demoted = await tx.operationMembership.create({ data: { userId: previous.userId, groupId, memberRole: OPERATION_MEMBERSHIP_ROLE.MEMBER, effectiveFrom: now, assignedById: actorId, reason: note } });
        await this.auditMembership(tx, "operation_group_leader.revoked", actorId, demoted, { before: this.membershipSnapshot(previous), after: this.membershipSnapshot(demoted), reason: note });
      } else {
        await this.auditMembership(tx, "operation_group_leader.revoked", actorId, previous, { before: this.membershipSnapshot(previous), after: null, reason: note });
      }
      const appointed = await tx.operationMembership.create({ data: { userId, groupId, memberRole: OPERATION_MEMBERSHIP_ROLE.GROUP_LEADER, effectiveFrom: now, assignedById: actorId, reason: note } });
      await this.auditMembership(tx, "operation_group_leader.appointed", actorId, appointed, { before: this.membershipSnapshot(candidate), after: this.membershipSnapshot(appointed), replacedUserId: previous.userId, reason: note });
      return appointed;
    }).catch((error: any) => this.rethrowPartialUniqueConflict(error));
  }

  async revokeLeader(groupId: number, actorId: number, reason?: string) {
    return this.prisma.$transaction(async (tx: any) => {
      const leader = await tx.operationMembership.findFirst({ where: { groupId, effectiveTo: null, memberRole: OPERATION_MEMBERSHIP_ROLE.GROUP_LEADER } });
      if (!leader) throw new NotFoundException("该运营组当前无有效组长");
      const now = new Date();
      const note = reason?.trim() || "撤销运营组长";
      await tx.operationMembership.update({ where: { id: leader.id }, data: { effectiveTo: now, endedById: actorId, reason: note } });
      const member = await tx.operationMembership.create({ data: { userId: leader.userId, groupId, memberRole: OPERATION_MEMBERSHIP_ROLE.MEMBER, effectiveFrom: now, assignedById: actorId, reason: note } });
      await this.auditMembership(tx, "operation_group_leader.revoked", actorId, member, { before: this.membershipSnapshot(leader), after: this.membershipSnapshot(member), reason: note });
      return member;
    }).catch((error: any) => this.rethrowPartialUniqueConflict(error));
  }

  private presentGroup(group: any) {
    const memberships = group.memberships || [];
    return { ...group, memberships, leader: memberships.find((item: any) => item.memberRole === OPERATION_MEMBERSHIP_ROLE.GROUP_LEADER) || null, memberCount: memberships.length };
  }

  private groupSnapshot(group: any) {
    return { id: group.id, name: group.name, status: group.status, deactivatedAt: group.deactivatedAt || null };
  }

  private membershipSnapshot(membership: any) {
    return { id: membership.id, userId: membership.userId, groupId: membership.groupId, memberRole: membership.memberRole, effectiveFrom: membership.effectiveFrom, effectiveTo: membership.effectiveTo || null };
  }

  private parseAuditMetadata(value: string | null) {
    if (!value) return null;
    try { return JSON.parse(value); } catch { return value; }
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
    return tx.auditEvent.create({ data: { resourceType: "operation_group", resourceId, action, operatorId: actorId, correlationId: `operation_group_${resourceId}`, metadata: JSON.stringify({ actorId, userId: null, before: null, after: null, ...metadata }) } });
  }

  private async auditMembership(tx: any, action: string, actorId: number, membership: any, metadata: Record<string, unknown>) {
    return tx.auditEvent.create({ data: { resourceType: "operation_membership", resourceId: membership.id, action, operatorId: actorId, correlationId: `operation_group_${membership.groupId}`, metadata: JSON.stringify({ actorId, groupId: membership.groupId, userId: membership.userId, before: null, after: this.membershipSnapshot(membership), ...metadata }) } });
  }

  private rethrowPartialUniqueConflict(error: any): never {
    if (error?.code === "P2002") throw new ConflictException("并发冲突：用户已有有效运营组关系，或该运营组已有有效组长");
    throw error;
  }
}
