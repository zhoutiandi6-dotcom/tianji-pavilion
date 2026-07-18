-- Per-designer weekly targets. Live allocation and completion metrics remain
-- derived from image_tasks so they cannot become stale.
CREATE TABLE "weekly_designer_plans" (
    "id" INTEGER NOT NULL PRIMARY KEY AUTOINCREMENT,
    "designerId" INTEGER NOT NULL,
    "weekStart" DATETIME NOT NULL,
    "weekEnd" DATETIME NOT NULL,
    "targetImageCount" INTEGER NOT NULL DEFAULT 0,
    "createdById" INTEGER NOT NULL,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" DATETIME NOT NULL,
    CONSTRAINT "weekly_designer_plans_designerId_fkey" FOREIGN KEY ("designerId") REFERENCES "users" ("id") ON DELETE RESTRICT ON UPDATE CASCADE,
    CONSTRAINT "weekly_designer_plans_createdById_fkey" FOREIGN KEY ("createdById") REFERENCES "users" ("id") ON DELETE RESTRICT ON UPDATE CASCADE
);

CREATE TABLE "weekly_designer_plan_adjustments" (
    "id" INTEGER NOT NULL PRIMARY KEY AUTOINCREMENT,
    "planId" INTEGER NOT NULL,
    "previousTarget" INTEGER NOT NULL,
    "newTarget" INTEGER NOT NULL,
    "reason" TEXT NOT NULL,
    "adjustedById" INTEGER NOT NULL,
    "adjustedAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "weekly_designer_plan_adjustments_planId_fkey" FOREIGN KEY ("planId") REFERENCES "weekly_designer_plans" ("id") ON DELETE CASCADE ON UPDATE CASCADE,
    CONSTRAINT "weekly_designer_plan_adjustments_adjustedById_fkey" FOREIGN KEY ("adjustedById") REFERENCES "users" ("id") ON DELETE RESTRICT ON UPDATE CASCADE
);

CREATE INDEX "weekly_designer_plans_weekStart_idx" ON "weekly_designer_plans"("weekStart");
CREATE INDEX "weekly_designer_plans_designerId_idx" ON "weekly_designer_plans"("designerId");
CREATE UNIQUE INDEX "weekly_designer_plans_designerId_weekStart_key" ON "weekly_designer_plans"("designerId", "weekStart");
CREATE INDEX "weekly_designer_plan_adjustments_planId_idx" ON "weekly_designer_plan_adjustments"("planId");
CREATE INDEX "weekly_designer_plan_adjustments_adjustedAt_idx" ON "weekly_designer_plan_adjustments"("adjustedAt");
