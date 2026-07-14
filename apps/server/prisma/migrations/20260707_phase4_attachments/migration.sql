PRAGMA foreign_keys=OFF;

CREATE TABLE "attachments_new" (
    "id" INTEGER NOT NULL PRIMARY KEY AUTOINCREMENT,
    "taskId" INTEGER,
    "imageTaskId" INTEGER,
    "category" TEXT NOT NULL DEFAULT 'IMAGE_ORIGINAL',
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
    CONSTRAINT "attachments_uploadedById_fkey" FOREIGN KEY ("uploadedById") REFERENCES "users" ("id") ON DELETE RESTRICT ON UPDATE CASCADE
);

INSERT INTO "attachments_new" (
    "id",
    "taskId",
    "imageTaskId",
    "category",
    "fileName",
    "fileType",
    "mimeType",
    "extension",
    "fileSize",
    "storagePath",
    "previewPath",
    "thumbnailPath",
    "uploadedById",
    "uploadedAt",
    "deletedAt",
    "deletedById"
)
SELECT
    "id",
    NULL,
    "imageTaskId",
    'IMAGE_ORIGINAL',
    "fileName",
    "fileType",
    "mimeType",
    "extension",
    "fileSize",
    "storagePath",
    "previewPath",
    "thumbnailPath",
    "uploadedById",
    "uploadedAt",
    "deletedAt",
    "deletedById"
FROM "attachments";

DROP TABLE "attachments";
ALTER TABLE "attachments_new" RENAME TO "attachments";

CREATE INDEX "attachments_taskId_idx" ON "attachments"("taskId");
CREATE INDEX "attachments_imageTaskId_idx" ON "attachments"("imageTaskId");
CREATE INDEX "attachments_category_idx" ON "attachments"("category");
CREATE INDEX "attachments_uploadedById_idx" ON "attachments"("uploadedById");
CREATE INDEX "attachments_deletedAt_idx" ON "attachments"("deletedAt");

PRAGMA foreign_key_check;
PRAGMA foreign_keys=ON;
