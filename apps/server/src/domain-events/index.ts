// ===== 天机阁 Domain Events =====

export class WorkflowCreated {
  constructor(public readonly taskId: number, public readonly creatorId: number, public readonly serialNumber: string) {}
  get name() { return "workflow.created"; }
}
export class WorkflowSubmitted {
  constructor(public readonly taskId: number, public readonly userId: number, public readonly serialNumber: string) {}
  get name() { return "workflow.submitted"; }
}
export class WorkflowWithdrawn {
  constructor(public readonly taskId: number, public readonly userId: number, public readonly serialNumber: string) {}
  get name() { return "workflow.withdrawn"; }
}
export class WorkflowApproved {
  constructor(public readonly taskId: number, public readonly approverId: number, public readonly serialNumber: string, public readonly comment?: string) {}
  get name() { return "workflow.approved"; }
}
export class WorkflowRejected {
  constructor(public readonly taskId: number, public readonly approverId: number, public readonly serialNumber: string, public readonly comment?: string) {}
  get name() { return "workflow.rejected"; }
}
export class WorkflowCompleted {
  constructor(public readonly taskId: number, public readonly serialNumber: string, public readonly operatorId?: number) {}
  get name() { return "workflow.completed"; }
}
export class WorkflowArchived {
  constructor(public readonly taskId: number, public readonly userId: number, public readonly serialNumber: string) {}
  get name() { return "workflow.archived"; }
}
export class ImageTaskStarted {
  constructor(public readonly imageTaskId: number, public readonly taskId: number, public readonly designerId: number, public readonly imageTitle?: string) {}
  get name() { return "image_task.started"; }
}
export class ImageTaskSubmittedForReview {
  constructor(public readonly imageTaskId: number, public readonly taskId: number, public readonly designerId: number, public readonly imageTitle?: string, public readonly submittedAttachmentId?: number) {}
  get name() { return "image_task.submitted_for_review"; }
}
export class ImageTaskReviewApproved {
  constructor(public readonly imageTaskId: number, public readonly taskId: number, public readonly reviewerId: number, public readonly designerId: number | null, public readonly imageTitle?: string, public readonly reviewedAttachmentId?: number) {}
  get name() { return "image_task.review_approved"; }
}
export class ImageTaskReviewRejected {
  constructor(public readonly imageTaskId: number, public readonly taskId: number, public readonly reviewerId: number, public readonly designerId: number | null, public readonly remark?: string, public readonly imageTitle?: string, public readonly reviewedAttachmentId?: number) {}
  get name() { return "image_task.review_rejected"; }
}
export class ImageTaskAssigned {
  constructor(
    public readonly imageTaskId: number,
    public readonly taskId: number,
    public readonly designerId: number,
    public readonly assignedById: number,
    public readonly imageTitle?: string,
  ) {}
  get name() { return "image_task.assigned"; }
}
export class TaskUpdated {
  constructor(public readonly taskId: number, public readonly userId: number, public readonly changes: Record<string, any>) {}
  get name() { return "task.updated"; }
}
