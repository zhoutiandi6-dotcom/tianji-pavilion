import { ConflictException } from "@nestjs/common";
import { OperationsOrganizationService } from "./operations-organization.service";

describe("OperationsOrganizationService", () => {
  const at0930 = new Date("2026-09-22T01:30:00.000Z");
  const at1030 = new Date("2026-09-22T02:30:00.000Z");

  it("queries membership history with an end-exclusive effective range", async () => {
    const prisma: any = { operationMembership: { findFirst: jest.fn().mockResolvedValue(null) } };
    const service = new OperationsOrganizationService(prisma);

    await service.getMembershipAt(7, at0930);
    expect(prisma.operationMembership.findFirst).toHaveBeenCalledWith(expect.objectContaining({
      where: expect.objectContaining({
        userId: 7,
        effectiveFrom: { lte: at0930 },
        OR: [{ effectiveTo: null }, { effectiveTo: { gt: at0930 } }],
      }),
      orderBy: { effectiveFrom: "desc" },
    }));

    await service.getMembershipAt(7, at1030);
    expect(prisma.operationMembership.findFirst).toHaveBeenLastCalledWith(expect.objectContaining({
      where: expect.objectContaining({ effectiveFrom: { lte: at1030 } }),
    }));
  });

  it("recovers MEMBER → GROUP_LEADER → MEMBER history at each point in time", async () => {
    const history = [
      { id: 1, groupId: 1, memberRole: "MEMBER", effectiveFrom: new Date("2026-09-22T00:00:00.000Z"), effectiveTo: new Date("2026-09-22T02:00:00.000Z") },
      { id: 2, groupId: 1, memberRole: "GROUP_LEADER", effectiveFrom: new Date("2026-09-22T02:00:00.000Z"), effectiveTo: new Date("2026-09-22T03:00:00.000Z") },
      { id: 3, groupId: 2, memberRole: "MEMBER", effectiveFrom: new Date("2026-09-22T03:00:00.000Z"), effectiveTo: null },
    ];
    const prisma: any = {
      operationMembership: {
        findFirst: jest.fn(({ where }: any) => Promise.resolve(history.find((membership) => (
          membership.effectiveFrom <= where.effectiveFrom.lte
          && (!membership.effectiveTo || membership.effectiveTo > where.effectiveFrom.lte)
        )) || null)),
      },
    };
    const service = new OperationsOrganizationService(prisma);

    await expect(service.getMembershipAt(7, new Date("2026-09-22T01:30:00.000Z"))).resolves.toMatchObject({ groupId: 1, memberRole: "MEMBER" });
    await expect(service.getMembershipAt(7, new Date("2026-09-22T02:30:00.000Z"))).resolves.toMatchObject({ groupId: 1, memberRole: "GROUP_LEADER" });
    await expect(service.getMembershipAt(7, new Date("2026-09-22T03:30:00.000Z"))).resolves.toMatchObject({ groupId: 2, memberRole: "MEMBER" });
  });

  it("queries the active leader as an active membership, not a separate entity", async () => {
    const prisma: any = { operationMembership: { findFirst: jest.fn().mockResolvedValue(null) } };
    const service = new OperationsOrganizationService(prisma);
    await service.getActiveGroupLeader(3);
    expect(prisma.operationMembership.findFirst).toHaveBeenCalledWith(expect.objectContaining({
      where: expect.objectContaining({
        groupId: 3,
        memberRole: "GROUP_LEADER",
        effectiveFrom: expect.objectContaining({ lte: expect.any(Date) }),
        OR: expect.any(Array),
      }),
    }));
  });

  it("reads submit membership through the supplied transaction and enforces its time range", async () => {
    const tx: any = { operationMembership: { findFirst: jest.fn().mockResolvedValue(null) } };
    const service = new OperationsOrganizationService({} as any);
    await service.getMembershipAtInTransaction(tx, 7, at0930);
    expect(tx.operationMembership.findFirst).toHaveBeenCalledWith(expect.objectContaining({
      where: expect.objectContaining({
        userId: 7,
        effectiveFrom: { lte: at0930 },
        OR: [{ effectiveTo: null }, { effectiveTo: { gt: at0930 } }],
      }),
    }));
  });

  it("refuses group deactivation while active memberships remain", async () => {
    const tx: any = {
      operationGroup: { findUnique: jest.fn().mockResolvedValue({ id: 3, status: "ACTIVE" }) },
      operationMembership: { count: jest.fn().mockResolvedValue(1) },
    };
    const prisma: any = { $transaction: jest.fn((callback: any) => callback(tx)) };
    const service = new OperationsOrganizationService(prisma);
    await expect(service.deactivateGroup(3, 1)).rejects.toBeInstanceOf(ConflictException);
    expect(tx.operationGroup.update).toBeUndefined();
  });

  it("converts a partial-unique race into a domain conflict", async () => {
    const prisma: any = { $transaction: jest.fn().mockRejectedValue({ code: "P2002" }) };
    const service = new OperationsOrganizationService(prisma);
    await expect(service.assignMembership({ userId: 7, groupId: 3, memberRole: "MEMBER", actorId: 1 })).rejects.toBeInstanceOf(ConflictException);
  });

  it("does not end a group leader through the ordinary member-leave operation", async () => {
    const tx: any = { operationMembership: { findFirst: jest.fn().mockResolvedValue({ id: 4, memberRole: "GROUP_LEADER", effectiveFrom: at0930 }) } };
    const service = new OperationsOrganizationService({ $transaction: jest.fn((callback: any) => callback(tx)) } as any);
    await expect(service.endActiveMembership(7, 1, "离组")).rejects.toBeInstanceOf(ConflictException);
    expect(tx.operationMembership.update).toBeUndefined();
  });

  it("refuses moving a group leader without an explicit revoke or replacement", async () => {
    const tx: any = {
      operationGroup: { findUnique: jest.fn().mockResolvedValue({ id: 2, status: "ACTIVE" }) },
      user: { findUnique: jest.fn().mockResolvedValue({ id: 7, role: { name: "OPERATION" } }) },
      operationMembership: { findFirst: jest.fn().mockResolvedValue({ id: 4, groupId: 1, memberRole: "GROUP_LEADER", effectiveFrom: at0930 }) },
    };
    const service = new OperationsOrganizationService({ $transaction: jest.fn((callback: any) => callback(tx)) } as any);
    await expect(service.moveMembership({ userId: 7, groupId: 2, memberRole: "MEMBER", actorId: 1, reason: "调组" })).rejects.toBeInstanceOf(ConflictException);
  });
});
