import { Injectable } from "@nestjs/common";
import { WorkflowActions } from "../workflow-engine/actions";

@Injectable()
export class ApprovalService {
  constructor(private actions: WorkflowActions) {}

  async submit(taskId: number, userId: number, userRole: string) {
    return this.actions.submit(taskId, userId, userRole);
  }

  async withdraw(taskId: number, userId: number, userRole: string) {
    return this.actions.withdraw(taskId, userId, userRole);
  }

  async approve(taskId: number, userId: number, userRole: string, comment?: string) {
    return this.actions.approve(taskId, userId, userRole, comment);
  }

  async reject(taskId: number, userId: number, userRole: string, comment?: string) {
    return this.actions.reject(taskId, userId, userRole, comment);
  }

  async rollback(taskId: number, userId: number, userRole: string) {
    return this.actions.rollbackApproval(taskId, userId, userRole);
  }
}
