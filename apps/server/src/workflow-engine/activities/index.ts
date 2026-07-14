// ===== Workflow Activity Interface =====
// Future: ImageTask becomes a Workflow Activity.
// AI Production (ABIP) will execute as Workflow Activities.

export interface WorkflowActivity {
  id: number;
  workflowId: number;
  type: string;
  status: string;
  assigneeId: number | null;
  metadata: Record<string, any>;

  // Lifecycle
  start(): Promise<void>;
  complete(): Promise<void>;
  fail(error: string): Promise<void>;
  cancel(): Promise<void>;
}

export enum ActivityType {
  IMAGE_TASK = "image_task",
  APPROVAL = "approval",
  AI_GENERATION = "ai_generation",  // Future: ABIP
  REVIEW = "review",                 // Future: AI Review
  NOTIFICATION = "notification",     // Future: Auto notify
}

export enum ActivityStatus {
  PENDING = "PENDING",
  IN_PROGRESS = "IN_PROGRESS",
  COMPLETED = "COMPLETED",
  FAILED = "FAILED",
  CANCELLED = "CANCELLED",
}

// Activity registry: maps ActivityType to handler
// Future: ABIP modules register themselves here
export class ActivityRegistry {
  private static handlers = new Map<ActivityType, new (...args: any[]) => WorkflowActivity>();

  static register(type: ActivityType, handler: new (...args: any[]) => WorkflowActivity) {
    this.handlers.set(type, handler);
  }

  static getHandler(type: ActivityType): (new (...args: any[]) => WorkflowActivity) | undefined {
    return this.handlers.get(type);
  }
}
