-- Operations-manager weekly approval-release targets. Approval completion is
-- calculated from approval_records and therefore is intentionally not stored.
CREATE TABLE "weekly_operations_approval_plans" (
    "id" INTEGER NOT NULL PRIMARY KEY AUTOINCREMENT,
    "managerId" INTEGER NOT NULL,
    "weekStart" DATETIME NOT NULL,
    "weekEnd" DATETIME NOT NULL,
    "targetImageCount" INTEGER NOT NULL DEFAULT 0,
    "createdById" INTEGER NOT NULL,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" DATETIME NOT NULL,
    CONSTRAINT "weekly_operations_approval_plans_managerId_fkey" FOREIGN KEY ("managerId") REFERENCES "users" ("id") ON DELETE RESTRICT ON UPDATE CASCADE,
    CONSTRAINT "weekly_operations_approval_plans_createdById_fkey" FOREIGN KEY ("createdById") REFERENCES "users" ("id") ON DELETE RESTRICT ON UPDATE CASCADE
);

CREATE TABLE "weekly_operations_approval_plan_adjustments" (
    "id" INTEGER NOT NULL PRIMARY KEY AUTOINCREMENT,
    "planId" INTEGER NOT NULL,
    "previousTarget" INTEGER NOT NULL,
    "newTarget" INTEGER NOT NULL,
    "reason" TEXT NOT NULL,
    "adjustedById" INTEGER NOT NULL,
    "adjustedAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "weekly_operations_approval_plan_adjustments_planId_fkey" FOREIGN KEY ("planId") REFERENCES "weekly_operations_approval_plans" ("id") ON DELETE CASCADE ON UPDATE CASCADE,
    CONSTRAINT "weekly_operations_approval_plan_adjustments_adjustedById_fkey" FOREIGN KEY ("adjustedById") REFERENCES "users" ("id") ON DELETE RESTRICT ON UPDATE CASCADE
);

CREATE INDEX "weekly_operations_approval_plans_weekStart_idx" ON "weekly_operations_approval_plans"("weekStart");
CREATE INDEX "weekly_operations_approval_plans_managerId_idx" ON "weekly_operations_approval_plans"("managerId");
CREATE UNIQUE INDEX "weekly_operations_approval_plans_managerId_weekStart_key" ON "weekly_operations_approval_plans"("managerId", "weekStart");
CREATE INDEX "weekly_operations_approval_plan_adjustments_planId_idx" ON "weekly_operations_approval_plan_adjustments"("planId");
CREATE INDEX "weekly_operations_approval_plan_adjustments_adjustedAt_idx" ON "weekly_operations_approval_plan_adjustments"("adjustedAt");
