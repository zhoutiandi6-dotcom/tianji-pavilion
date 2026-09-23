import { OperationsApprovalRoutingService } from "./operations-approval-routing.service";

describe("OperationsApprovalRoutingService", () => {
  const task = { id: 91, creatorId: 7, operationGroupSnapshotId: 3, operationSnapshotAt: new Date("2026-09-22T00:00:00.000Z") };

  it("follows the current group leader after a leader replacement", async () => {
    const organization = { getActiveGroupLeader: jest.fn().mockResolvedValue({ userId: 12 }) } as any;
    const service = new OperationsApprovalRoutingService(organization);
    await expect(service.resolveRegularOperationsApprover(task)).resolves.toEqual({ taskId: 91, groupId: 3, currentGroupLeaderId: 12, routingStatus: "READY" });
  });

  it("does not silently fall back to an operations manager when the group has no leader", async () => {
    const service = new OperationsApprovalRoutingService({ getActiveGroupLeader: jest.fn().mockResolvedValue(null) } as any);
    await expect(service.resolveRegularOperationsApprover(task)).resolves.toMatchObject({ routingStatus: "NO_ACTIVE_GROUP_LEADER", currentGroupLeaderId: null });
  });

  it("allows a group leader to route and approve their own submitted task", async () => {
    const service = new OperationsApprovalRoutingService({ getActiveGroupLeader: jest.fn().mockResolvedValue({ userId: 7 }) } as any);
    await expect(service.resolveRegularOperationsApprover(task)).resolves.toEqual({ taskId: 91, groupId: 3, currentGroupLeaderId: 7, routingStatus: "READY" });
  });

  it("does not infer a group for an unscoped legacy task", async () => {
    const organization = { getActiveGroupLeader: jest.fn() } as any;
    const service = new OperationsApprovalRoutingService(organization);
    await expect(service.resolveRegularOperationsApprover({ ...task, operationGroupSnapshotId: null, operationSnapshotAt: null })).resolves.toEqual({ taskId: 91, groupId: null, currentGroupLeaderId: null, routingStatus: "LEGACY_UNSCOPED" });
    expect(organization.getActiveGroupLeader).not.toHaveBeenCalled();
  });
});
