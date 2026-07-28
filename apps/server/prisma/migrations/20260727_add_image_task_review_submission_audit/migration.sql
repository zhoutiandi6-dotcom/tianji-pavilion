-- Preserve the designer review submission actor and timestamp as nullable
-- audit fields so existing image tasks remain valid.
ALTER TABLE "image_tasks" ADD COLUMN "submittedAt" DATETIME;
ALTER TABLE "image_tasks" ADD COLUMN "submittedById" INTEGER REFERENCES "users"("id") ON DELETE SET NULL ON UPDATE CASCADE;

CREATE INDEX "image_tasks_submittedAt_idx" ON "image_tasks"("submittedAt");
CREATE INDEX "image_tasks_submittedById_idx" ON "image_tasks"("submittedById");
