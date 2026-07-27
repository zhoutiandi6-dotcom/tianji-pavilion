-- Replace the hand-entered operations approval target with decree plan items.
-- The preceding release has no persisted adjustment history, so the obsolete
-- adjustment table can be removed without discarding business audit data.
PRAGMA foreign_keys=OFF;

CREATE TABLE "new_weekly_operations_approval_plans" (
    "id" INTEGER NOT NULL PRIMARY KEY AUTOINCREMENT,
    "managerId" INTEGER NOT NULL,
    "weekStart" DATETIME NOT NULL,
    "weekEnd" DATETIME NOT NULL,
    "createdById" INTEGER NOT NULL,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" DATETIME NOT NULL,
    CONSTRAINT "weekly_operations_approval_plans_managerId_fkey" FOREIGN KEY ("managerId") REFERENCES "users" ("id") ON DELETE RESTRICT ON UPDATE CASCADE,
    CONSTRAINT "weekly_operations_approval_plans_createdById_fkey" FOREIGN KEY ("createdById") REFERENCES "users" ("id") ON DELETE RESTRICT ON UPDATE CASCADE
);

INSERT INTO "new_weekly_operations_approval_plans" ("id", "managerId", "weekStart", "weekEnd", "createdById", "createdAt", "updatedAt")
SELECT "id", "managerId", "weekStart", "weekEnd", "createdById", "createdAt", "updatedAt"
FROM "weekly_operations_approval_plans";

DROP TABLE "weekly_operations_approval_plan_adjustments";
DROP TABLE "weekly_operations_approval_plans";
ALTER TABLE "new_weekly_operations_approval_plans" RENAME TO "weekly_operations_approval_plans";
CREATE UNIQUE INDEX "weekly_operations_approval_plans_managerId_weekStart_key" ON "weekly_operations_approval_plans"("managerId", "weekStart");
CREATE INDEX "weekly_operations_approval_plans_weekStart_idx" ON "weekly_operations_approval_plans"("weekStart");
CREATE INDEX "weekly_operations_approval_plans_managerId_idx" ON "weekly_operations_approval_plans"("managerId");

CREATE TABLE "weekly_operations_approval_plan_items" (
    "id" INTEGER NOT NULL PRIMARY KEY AUTOINCREMENT,
    "planId" INTEGER NOT NULL,
    "decreeId" INTEGER NOT NULL,
    "plannedImageCountSnapshot" INTEGER NOT NULL,
    "sourceType" TEXT NOT NULL,
    "addedById" INTEGER NOT NULL,
    "addedAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "removedAt" DATETIME,
    "removedById" INTEGER,
    "removedReason" TEXT,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" DATETIME NOT NULL,
    CONSTRAINT "weekly_operations_approval_plan_items_planId_fkey" FOREIGN KEY ("planId") REFERENCES "weekly_operations_approval_plans" ("id") ON DELETE CASCADE ON UPDATE CASCADE,
    CONSTRAINT "weekly_operations_approval_plan_items_decreeId_fkey" FOREIGN KEY ("decreeId") REFERENCES "tasks" ("id") ON DELETE RESTRICT ON UPDATE CASCADE,
    CONSTRAINT "weekly_operations_approval_plan_items_addedById_fkey" FOREIGN KEY ("addedById") REFERENCES "users" ("id") ON DELETE RESTRICT ON UPDATE CASCADE,
    CONSTRAINT "weekly_operations_approval_plan_items_removedById_fkey" FOREIGN KEY ("removedById") REFERENCES "users" ("id") ON DELETE SET NULL ON UPDATE CASCADE
);
CREATE UNIQUE INDEX "weekly_operations_approval_plan_items_planId_decreeId_key" ON "weekly_operations_approval_plan_items"("planId", "decreeId");
CREATE INDEX "weekly_operations_approval_plan_items_planId_idx" ON "weekly_operations_approval_plan_items"("planId");
CREATE INDEX "weekly_operations_approval_plan_items_decreeId_idx" ON "weekly_operations_approval_plan_items"("decreeId");
CREATE INDEX "weekly_operations_approval_plan_items_sourceType_idx" ON "weekly_operations_approval_plan_items"("sourceType");
CREATE INDEX "weekly_operations_approval_plan_items_removedAt_idx" ON "weekly_operations_approval_plan_items"("removedAt");

PRAGMA foreign_key_check;
PRAGMA foreign_keys=ON;
