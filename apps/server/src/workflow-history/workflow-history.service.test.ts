import {
  ImageTaskReviewApproved,
  ImageTaskReviewRejected,
  ImageTaskSubmittedForReview,
  WorkflowCompleted,
} from "../domain-events";
import { WorkflowHistoryService } from "./workflow-history.service";

describe("WorkflowHistoryService image review actors", () => {
  let handlers: Map<string, (event: any) => Promise<void>>;
  let prisma: any;

  beforeEach(() => {
    handlers = new Map();
    prisma = {
      task: { findUnique: jest.fn().mockResolvedValue({ workflowStatus: "DESIGN_REVIEW" }) },
      workflowHistory: { create: jest.fn().mockResolvedValue({ id: 1 }) },
    };
    new WorkflowHistoryService(prisma, {
      subscribe: jest.fn((name: string, handler: (event: any) => Promise<void>) => handlers.set(name, handler)),
    } as any);
  });

  const publish = async (event: any) => {
    const handler = handlers.get(event.name);
    expect(handler).toBeDefined();
    await handler!(event);
    return prisma.workflowHistory.create.mock.calls.at(-1)[0].data;
  };

  it("records the submitting designer as the submit-review actor", async () => {
    const history = await publish(new ImageTaskSubmittedForReview(1, 10, 44, "Main image", 131));

    expect(history.operatorId).toBe(44);
  });

  it("records the reviewer instead of the assigned designer for a rejection", async () => {
    const history = await publish(new ImageTaskReviewRejected(1, 10, 35, 44, "Revise", "Main image", 131));

    expect(history.operatorId).toBe(35);
    expect(history.operatorId).not.toBe(44);
  });

  it("records the reviewer instead of the assigned designer for an approval", async () => {
    const history = await publish(new ImageTaskReviewApproved(1, 10, 35, 44, "Main image", 131));

    expect(history.operatorId).toBe(35);
    expect(history.operatorId).not.toBe(44);
  });

  it("records the triggering reviewer on a design-approved workflow completion", async () => {
    const history = await publish(new WorkflowCompleted(10, "TJ-10", 35));

    expect(history.operatorId).toBe(35);
  });
});
