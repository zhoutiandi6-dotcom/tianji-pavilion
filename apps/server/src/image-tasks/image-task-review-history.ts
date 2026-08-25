// Canonical actions emitted for image-task review lifecycle events.
export const IMAGE_TASK_REVIEW_AUDIT_ACTION = {
  submitted: "design_review_submitted",
  resubmitted: "design_review_resubmitted",
  approved: "review_approve",
  rejected: "review_reject",
} as const;

export type ImageTaskReviewVersionMetadata = {
  submittedAttachmentId?: number;
  reviewedAttachmentId?: number;
};

// Read old records without rewriting historical audit data.
export const IMAGE_TASK_REVIEW_HISTORY_ACTIONS: string[] = [
  IMAGE_TASK_REVIEW_AUDIT_ACTION.submitted,
  IMAGE_TASK_REVIEW_AUDIT_ACTION.resubmitted,
  IMAGE_TASK_REVIEW_AUDIT_ACTION.approved,
  IMAGE_TASK_REVIEW_AUDIT_ACTION.rejected,
  "submit_review",
  "design_review_approved",
  "design_review_rejected",
  "submit_design_review",
  "resubmit_design_review",
  "design_review_approve",
  "design_review_reject",
];

// Old review events may have an incorrect operatorId while retaining a
// reliable reviewerId in metadata. Limit compatibility to review decisions.
export const IMAGE_TASK_REVIEW_DECISION_ACTIONS = new Set<string>([
  IMAGE_TASK_REVIEW_AUDIT_ACTION.approved,
  IMAGE_TASK_REVIEW_AUDIT_ACTION.rejected,
  "design_review_approved",
  "design_review_rejected",
  "design_review_approve",
  "design_review_reject",
]);
