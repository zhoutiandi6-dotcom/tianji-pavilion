// Workflow actions that wrap engine calls with permission checks
// Controllers should use these instead of calling services directly

import { Injectable } from "@nestjs/common";
import { WorkflowEngine } from "../engine";

@Injectable()
export class WorkflowActions {
  constructor(private engine: WorkflowEngine) {}

  async submit(taskId: number, userId: number, userRole: string) {
    return this.engine.submit(taskId, userId, userRole);
  }

  async withdraw(taskId: number, userId: number, userRole: string) {
    return this.engine.withdraw(taskId, userId, userRole);
  }

  async approve(taskId: number, userId: number, userRole: string, comment?: string) {
    return this.engine.approve(taskId, userId, userRole, comment);
  }

  async reject(taskId: number, userId: number, userRole: string, comment?: string) {
    return this.engine.reject(taskId, userId, userRole, comment);
  }

  async rollbackApproval(taskId: number, userId: number, userRole: string) {
    return this.engine.rollbackApproval(taskId, userId, userRole);
  }

  async recalcTaskStatus(taskId: number) {
    return this.engine.recalcTaskStatus(taskId);
  }
}
