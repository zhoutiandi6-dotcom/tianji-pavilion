-- Stage A adds nullable assignment/final-approval audit fields without
-- rewriting existing image task rows.
ALTER TABLE "image_tasks" ADD COLUMN "assignedAt" DATETIME;
ALTER TABLE "image_tasks" ADD COLUMN "assignedById" INTEGER REFERENCES "users"("id") ON DELETE SET NULL ON UPDATE CASCADE;
ALTER TABLE "image_tasks" ADD COLUMN "approvedAt" DATETIME;
ALTER TABLE "image_tasks" ADD COLUMN "approvedById" INTEGER REFERENCES "users"("id") ON DELETE SET NULL ON UPDATE CASCADE;

CREATE INDEX "image_tasks_assignedAt_idx" ON "image_tasks"("assignedAt");
CREATE INDEX "image_tasks_assignedById_idx" ON "image_tasks"("assignedById");
CREATE INDEX "image_tasks_approvedAt_idx" ON "image_tasks"("approvedAt");
CREATE INDEX "image_tasks_approvedById_idx" ON "image_tasks"("approvedById");

CREATE TABLE "task_submission_records" (
    "id" INTEGER NOT NULL PRIMARY KEY AUTOINCREMENT,
    "taskId" INTEGER NOT NULL,
    "submitterId" INTEGER NOT NULL,
    "submittedAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "submissionType" TEXT NOT NULL,
    "submissionSequence" INTEGER NOT NULL,
    "withdrawnAt" DATETIME,
    "withdrawnById" INTEGER,
    "processedAt" DATETIME,
    "processedById" INTEGER,
    "result" TEXT NOT NULL DEFAULT 'PENDING',
    "approvalRecordId" INTEGER,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "task_submission_records_submissionType_check" CHECK ("submissionType" IN ('INITIAL', 'RESUBMIT')),
    CONSTRAINT "task_submission_records_result_check" CHECK ("result" IN ('PENDING', 'APPROVED', 'REJECTED', 'WITHDRAWN')),
    CONSTRAINT "task_submission_records_taskId_fkey" FOREIGN KEY ("taskId") REFERENCES "tasks"("id") ON DELETE CASCADE ON UPDATE CASCADE,
    CONSTRAINT "task_submission_records_submitterId_fkey" FOREIGN KEY ("submitterId") REFERENCES "users"("id") ON DELETE RESTRICT ON UPDATE CASCADE,
    CONSTRAINT "task_submission_records_withdrawnById_fkey" FOREIGN KEY ("withdrawnById") REFERENCES "users"("id") ON DELETE RESTRICT ON UPDATE CASCADE,
    CONSTRAINT "task_submission_records_processedById_fkey" FOREIGN KEY ("processedById") REFERENCES "users"("id") ON DELETE RESTRICT ON UPDATE CASCADE,
    CONSTRAINT "task_submission_records_approvalRecordId_fkey" FOREIGN KEY ("approvalRecordId") REFERENCES "approval_records"("id") ON DELETE SET NULL ON UPDATE CASCADE
);

CREATE UNIQUE INDEX "task_submission_records_approvalRecordId_key" ON "task_submission_records"("approvalRecordId");
CREATE UNIQUE INDEX "task_submission_records_taskId_submissionSequence_key" ON "task_submission_records"("taskId", "submissionSequence");
CREATE INDEX "task_submission_records_taskId_idx" ON "task_submission_records"("taskId");
CREATE INDEX "task_submission_records_submitterId_idx" ON "task_submission_records"("submitterId");
CREATE INDEX "task_submission_records_withdrawnById_idx" ON "task_submission_records"("withdrawnById");
CREATE INDEX "task_submission_records_processedById_idx" ON "task_submission_records"("processedById");
CREATE INDEX "task_submission_records_submittedAt_idx" ON "task_submission_records"("submittedAt");
CREATE INDEX "task_submission_records_result_idx" ON "task_submission_records"("result");
