import { AuditEventService } from "./audit-event.service";
import {
  ImageTaskReviewApproved,
  ImageTaskReviewRejected,
  ImageTaskSubmittedForReview,
} from "../../domain-events";

describe("AuditEventService image review actors", () => {
  let prisma: any;
  let eventBus: any;

  beforeEach(() => {
    prisma = { auditEvent: { create: jest.fn().mockResolvedValue({ id: 1 }) } };
    eventBus = { subscribe: jest.fn() };
    new AuditEventService(prisma, eventBus);
  });

  const dispatch = async (eventName: string, event: unknown) => {
    const subscription = eventBus.subscribe.mock.calls.find(([name]: [string]) => name === eventName);
    await subscription[1](event);
  };

  it("records the submitting designer as the submit-review operator", async () => {
    await dispatch(
      "image_task.submitted_for_review",
      new ImageTaskSubmittedForReview(101, 10, 7, "Main image", 501),
    );

    expect(prisma.auditEvent.create).toHaveBeenCalledWith(expect.objectContaining({
      data: expect.objectContaining({ action: "submit_review", operatorId: 7 }),
    }));
  });

  it("records the reviewer, not the assigned designer, for a rejection", async () => {
    await dispatch(
      "image_task.review_rejected",
      new ImageTaskReviewRejected(101, 10, 9, 7, "Adjust spacing", "Main image", 501),
    );

    const data = prisma.auditEvent.create.mock.calls[0][0].data;
    expect(data).toMatchObject({ action: "review_reject", operatorId: 9 });
    expect(JSON.parse(data.metadata)).toMatchObject({ reviewerId: 9, designerId: 7, reviewedAttachmentId: 501 });
  });

  it.each(["DESIGN_MANAGER", "OWNER", "SUPER_ADMIN"]) (
    "records an actual %s reviewer for approval events",
    async (_role) => {
      await dispatch(
        "image_task.review_approved",
        new ImageTaskReviewApproved(101, 10, 12, 7, "Main image", 501),
      );

      const data = prisma.auditEvent.create.mock.calls[0][0].data;
      expect(data).toMatchObject({ action: "review_approve", operatorId: 12 });
      expect(JSON.parse(data.metadata)).toMatchObject({ reviewerId: 12, designerId: 7, reviewedAttachmentId: 501 });
    },
  );

  it("does not create a second audit event unless the review event is published", async () => {
    await dispatch(
      "image_task.review_rejected",
      new ImageTaskReviewRejected(101, 10, 9, 7, "Adjust spacing", "Main image", 501),
    );

    expect(prisma.auditEvent.create).toHaveBeenCalledTimes(1);
  });
});
