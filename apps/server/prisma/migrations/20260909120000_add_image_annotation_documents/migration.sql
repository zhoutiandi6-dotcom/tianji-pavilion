-- Additive only: annotation documents. No existing business data is modified.
BEGIN IMMEDIATE;
CREATE TABLE "image_annotation_documents" (
  "id" INTEGER NOT NULL PRIMARY KEY AUTOINCREMENT,
  "attachmentId" INTEGER NOT NULL,
  "data" TEXT NOT NULL,
  "version" INTEGER NOT NULL DEFAULT 1,
  "createdById" INTEGER,
  "updatedById" INTEGER,
  "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" DATETIME NOT NULL,
  CONSTRAINT "image_annotation_documents_attachmentId_fkey"
    FOREIGN KEY ("attachmentId") REFERENCES "attachments" ("id") ON DELETE CASCADE ON UPDATE CASCADE,
  CONSTRAINT "image_annotation_documents_createdById_fkey"
    FOREIGN KEY ("createdById") REFERENCES "users" ("id") ON DELETE SET NULL ON UPDATE CASCADE,
  CONSTRAINT "image_annotation_documents_updatedById_fkey"
    FOREIGN KEY ("updatedById") REFERENCES "users" ("id") ON DELETE SET NULL ON UPDATE CASCADE
);
CREATE UNIQUE INDEX "image_annotation_documents_attachmentId_key" ON "image_annotation_documents"("attachmentId");
CREATE INDEX "image_annotation_documents_createdById_idx" ON "image_annotation_documents"("createdById");
CREATE INDEX "image_annotation_documents_updatedById_idx" ON "image_annotation_documents"("updatedById");
COMMIT;
