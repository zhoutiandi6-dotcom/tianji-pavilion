import { Injectable } from "@nestjs/common";
import { OperationsOrganizationService } from "./operations-organization.service";

export type OperationsApprovalRoutingStatus =
  | "READY"
  | "NO_ACTIVE_GROUP_LEADER"
  | "LEGACY_UNSCOPED";

export type OperationsApprovalShadowRoute = {
  taskId: number;
  groupId: number | null;
  currentGroupLeaderId: number | null;
  routingStatus: OperationsApprovalRoutingStatus;
};

/**
 * Future regular-approval routing only.  Nothing in Phase 4 consumes this
 * service for a real queue or changes the current operations-manager flow.
 */
@Injectable()
export class OperationsApprovalRoutingService {
  constructor(private readonly organization: OperationsOrganizationService) {}

  async resolveRegularOperationsApprover(task: {
    id: number;
    creatorId: number;
    operationGroupSnapshotId: number | null;
    operationSnapshotAt?: Date | null;
  }): Promise<OperationsApprovalShadowRoute> {
    if (!task.operationGroupSnapshotId || !task.operationSnapshotAt) {
      return { taskId: task.id, groupId: null, currentGroupLeaderId: null, routingStatus: "LEGACY_UNSCOPED" };
    }

    const leader = await this.organization.getActiveGroupLeader(task.operationGroupSnapshotId);
    if (!leader) {
      return {
        taskId: task.id,
        groupId: task.operationGroupSnapshotId,
        currentGroupLeaderId: null,
        routingStatus: "NO_ACTIVE_GROUP_LEADER",
      };
    }

    return {
      taskId: task.id,
      groupId: task.operationGroupSnapshotId,
      // A group leader may approve a decree they created themselves.  The
      // approval record will preserve that actor relationship for audit.
      currentGroupLeaderId: leader.userId,
      routingStatus: "READY",
    };
  }
}
