-- Stage B adds structured weekly-plan records. Existing business rows remain unchanged.
CREATE TABLE "weekly_plans" (
    "id" INTEGER NOT NULL PRIMARY KEY AUTOINCREMENT,
    "weekStart" DATETIME NOT NULL,
    "weekEnd" DATETIME NOT NULL,
    "status" TEXT NOT NULL DEFAULT 'DRAFT',
    "createdById" INTEGER NOT NULL,
    "activatedAt" DATETIME,
    "activatedById" INTEGER,
    "closedAt" DATETIME,
    "closedById" INTEGER,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" DATETIME NOT NULL,
    CONSTRAINT "weekly_plans_status_check" CHECK ("status" IN ('DRAFT', 'ACTIVE', 'CLOSED')),
    CONSTRAINT "weekly_plans_createdById_fkey" FOREIGN KEY ("createdById") REFERENCES "users"("id") ON DELETE RESTRICT ON UPDATE CASCADE,
    CONSTRAINT "weekly_plans_activatedById_fkey" FOREIGN KEY ("activatedById") REFERENCES "users"("id") ON DELETE SET NULL ON UPDATE CASCADE,
    CONSTRAINT "weekly_plans_closedById_fkey" FOREIGN KEY ("closedById") REFERENCES "users"("id") ON DELETE SET NULL ON UPDATE CASCADE
);

CREATE UNIQUE INDEX "weekly_plans_weekStart_key" ON "weekly_plans"("weekStart");
CREATE INDEX "weekly_plans_status_idx" ON "weekly_plans"("status");
CREATE INDEX "weekly_plans_weekEnd_idx" ON "weekly_plans"("weekEnd");

CREATE TABLE "weekly_plan_items" (
    "id" INTEGER NOT NULL PRIMARY KEY AUTOINCREMENT,
    "weeklyPlanId" INTEGER NOT NULL,
    "imageTaskId" INTEGER NOT NULL,
    "designerId" INTEGER NOT NULL,
    "source" TEXT NOT NULL,
    "status" TEXT NOT NULL DEFAULT 'PLANNED',
    "plannedAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "reassignedAt" DATETIME,
    "completedAt" DATETIME,
    "cancelledAt" DATETIME,
    "cancelledById" INTEGER,
    "cancelReason" TEXT,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" DATETIME NOT NULL,
    CONSTRAINT "weekly_plan_items_source_check" CHECK ("source" IN ('INITIAL_PLAN', 'MIDWEEK_ADD', 'CARRY_OVER')),
    CONSTRAINT "weekly_plan_items_status_check" CHECK ("status" IN ('PLANNED', 'COMPLETED', 'CANCELLED')),
    CONSTRAINT "weekly_plan_items_weeklyPlanId_fkey" FOREIGN KEY ("weeklyPlanId") REFERENCES "weekly_plans"("id") ON DELETE CASCADE ON UPDATE CASCADE,
    CONSTRAINT "weekly_plan_items_imageTaskId_fkey" FOREIGN KEY ("imageTaskId") REFERENCES "image_tasks"("id") ON DELETE RESTRICT ON UPDATE CASCADE,
    CONSTRAINT "weekly_plan_items_designerId_fkey" FOREIGN KEY ("designerId") REFERENCES "users"("id") ON DELETE RESTRICT ON UPDATE CASCADE,
    CONSTRAINT "weekly_plan_items_cancelledById_fkey" FOREIGN KEY ("cancelledById") REFERENCES "users"("id") ON DELETE SET NULL ON UPDATE CASCADE
);

CREATE UNIQUE INDEX "weekly_plan_items_weeklyPlanId_imageTaskId_key" ON "weekly_plan_items"("weeklyPlanId", "imageTaskId");
CREATE INDEX "weekly_plan_items_weeklyPlanId_idx" ON "weekly_plan_items"("weeklyPlanId");
CREATE INDEX "weekly_plan_items_imageTaskId_idx" ON "weekly_plan_items"("imageTaskId");
CREATE INDEX "weekly_plan_items_designerId_idx" ON "weekly_plan_items"("designerId");
CREATE INDEX "weekly_plan_items_source_idx" ON "weekly_plan_items"("source");
CREATE INDEX "weekly_plan_items_status_idx" ON "weekly_plan_items"("status");
CREATE INDEX "weekly_plan_items_completedAt_idx" ON "weekly_plan_items"("completedAt");
