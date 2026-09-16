-- FEEDBACK V2: apply only with an isolated test DATABASE_URL first.
-- This migration normalizes legacy feedback statuses and adds feedback-bound screenshots/history.
PRAGMA foreign_keys=OFF;

ALTER TABLE "pilot_feedback" ADD COLUMN "title" TEXT;
ALTER TABLE "pilot_feedback" ADD COLUMN "handlingNote" TEXT;
UPDATE "pilot_feedback"
SET "status" = CASE "status"
  WHEN 'open' THEN 'PENDING'
  WHEN 'in_progress' THEN 'PROCESSING'
  WHEN 'resolved' THEN 'COMPLETED'
  WHEN 'closed' THEN 'COMPLETED'
  ELSE "status"
END;

CREATE TABLE "feedback_status_history" (
  "id" INTEGER NOT NULL PRIMARY KEY AUTOINCREMENT,
  "feedbackId" INTEGER NOT NULL,
  "fromStatus" TEXT NOT NULL,
  "toStatus" TEXT NOT NULL,
  "operatorId" INTEGER NOT NULL,
  "operatorName" TEXT,
  "note" TEXT,
  "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "feedback_status_history_feedbackId_fkey" FOREIGN KEY ("feedbackId") REFERENCES "pilot_feedback" ("id") ON DELETE CASCADE ON UPDATE CASCADE,
  CONSTRAINT "feedback_status_history_operatorId_fkey" FOREIGN KEY ("operatorId") REFERENCES "users" ("id") ON DELETE RESTRICT ON UPDATE CASCADE
);
CREATE INDEX "feedback_status_history_feedbackId_idx" ON "feedback_status_history"("feedbackId");
CREATE INDEX "feedback_status_history_operatorId_idx" ON "feedback_status_history"("operatorId");
CREATE INDEX "feedback_status_history_createdAt_idx" ON "feedback_status_history"("createdAt");
CREATE INDEX "pilot_feedback_userId_idx" ON "pilot_feedback"("userId");

CREATE TABLE "attachments_new" (
  "id" INTEGER NOT NULL PRIMARY KEY AUTOINCREMENT,
  "taskId" INTEGER,
  "imageTaskId" INTEGER,
  "feedbackId" INTEGER,
  "category" TEXT NOT NULL,
  "fileName" TEXT NOT NULL,
  "fileType" TEXT NOT NULL DEFAULT 'application/octet-stream',
  "mimeType" TEXT NOT NULL DEFAULT 'application/octet-stream',
  "extension" TEXT NOT NULL DEFAULT '',
  "fileSize" INTEGER NOT NULL DEFAULT 0,
  "storagePath" TEXT NOT NULL,
  "previewPath" TEXT,
  "thumbnailPath" TEXT,
  "uploadedById" INTEGER NOT NULL,
  "uploadedAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "deletedAt" DATETIME,
  "deletedById" INTEGER,
  CONSTRAINT "attachments_taskId_fkey" FOREIGN KEY ("taskId") REFERENCES "tasks" ("id") ON DELETE RESTRICT ON UPDATE CASCADE,
  CONSTRAINT "attachments_imageTaskId_fkey" FOREIGN KEY ("imageTaskId") REFERENCES "image_tasks" ("id") ON DELETE RESTRICT ON UPDATE CASCADE,
  CONSTRAINT "attachments_feedbackId_fkey" FOREIGN KEY ("feedbackId") REFERENCES "pilot_feedback" ("id") ON DELETE CASCADE ON UPDATE CASCADE,
  CONSTRAINT "attachments_uploadedById_fkey" FOREIGN KEY ("uploadedById") REFERENCES "users" ("id") ON DELETE RESTRICT ON UPDATE CASCADE
);
INSERT INTO "attachments_new" ("id", "taskId", "imageTaskId", "feedbackId", "category", "fileName", "fileType", "mimeType", "extension", "fileSize", "storagePath", "previewPath", "thumbnailPath", "uploadedById", "uploadedAt", "deletedAt", "deletedById")
SELECT "id", "taskId", "imageTaskId", NULL, "category", "fileName", "fileType", "mimeType", "extension", "fileSize", "storagePath", "previewPath", "thumbnailPath", "uploadedById", "uploadedAt", "deletedAt", "deletedById" FROM "attachments";
DROP TABLE "attachments";
ALTER TABLE "attachments_new" RENAME TO "attachments";
CREATE INDEX "attachments_taskId_idx" ON "attachments"("taskId");
CREATE INDEX "attachments_imageTaskId_idx" ON "attachments"("imageTaskId");
CREATE INDEX "attachments_feedbackId_idx" ON "attachments"("feedbackId");
CREATE INDEX "attachments_category_idx" ON "attachments"("category");
CREATE INDEX "attachments_uploadedById_idx" ON "attachments"("uploadedById");
CREATE INDEX "attachments_deletedAt_idx" ON "attachments"("deletedAt");

PRAGMA foreign_key_check;
PRAGMA foreign_keys=ON;
