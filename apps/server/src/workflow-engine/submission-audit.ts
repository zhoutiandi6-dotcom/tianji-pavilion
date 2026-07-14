export const SUBMISSION_TYPE = {
  INITIAL: "INITIAL",
  RESUBMIT: "RESUBMIT",
} as const;

export const SUBMISSION_RESULT = {
  PENDING: "PENDING",
  APPROVED: "APPROVED",
  REJECTED: "REJECTED",
  WITHDRAWN: "WITHDRAWN",
} as const;

export type SubmissionType = (typeof SUBMISSION_TYPE)[keyof typeof SUBMISSION_TYPE];
export type SubmissionResult = (typeof SUBMISSION_RESULT)[keyof typeof SUBMISSION_RESULT];
