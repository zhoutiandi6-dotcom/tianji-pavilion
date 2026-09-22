-- ORG-PERM-001 Phase 3: additive operations organization history.
-- No existing task is backfilled: all snapshot columns remain NULL so legacy
-- decrees retain their LEGACY_UNSCOPED interpretation until Phase 4.
PRAGMA foreign_keys=OFF;

CREATE TABLE "operation_groups" (
    "id" INTEGER NOT NULL PRIMARY KEY AUTOINCREMENT,
    "name" TEXT NOT NULL,
    "status" TEXT NOT NULL DEFAULT 'ACTIVE',
    "createdById" INTEGER NOT NULL,
    "deactivatedAt" DATETIME,
    "deactivatedById" INTEGER,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" DATETIME NOT NULL,
    CONSTRAINT "operation_groups_createdById_fkey" FOREIGN KEY ("createdById") REFERENCES "users" ("id") ON DELETE RESTRICT ON UPDATE CASCADE,
    CONSTRAINT "operation_groups_deactivatedById_fkey" FOREIGN KEY ("deactivatedById") REFERENCES "users" ("id") ON DELETE RESTRICT ON UPDATE CASCADE,
    CONSTRAINT "operation_groups_status_check" CHECK ("status" IN ('ACTIVE', 'INACTIVE'))
);

CREATE TABLE "operation_memberships" (
    "id" INTEGER NOT NULL PRIMARY KEY AUTOINCREMENT,
    "userId" INTEGER NOT NULL,
    "groupId" INTEGER NOT NULL,
    "memberRole" TEXT NOT NULL DEFAULT 'MEMBER',
    "effectiveFrom" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "effectiveTo" DATETIME,
    "assignedById" INTEGER NOT NULL,
    "endedById" INTEGER,
    "reason" TEXT,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" DATETIME NOT NULL,
    CONSTRAINT "operation_memberships_userId_fkey" FOREIGN KEY ("userId") REFERENCES "users" ("id") ON DELETE RESTRICT ON UPDATE CASCADE,
    CONSTRAINT "operation_memberships_groupId_fkey" FOREIGN KEY ("groupId") REFERENCES "operation_groups" ("id") ON DELETE RESTRICT ON UPDATE CASCADE,
    CONSTRAINT "operation_memberships_assignedById_fkey" FOREIGN KEY ("assignedById") REFERENCES "users" ("id") ON DELETE RESTRICT ON UPDATE CASCADE,
    CONSTRAINT "operation_memberships_endedById_fkey" FOREIGN KEY ("endedById") REFERENCES "users" ("id") ON DELETE RESTRICT ON UPDATE CASCADE,
    CONSTRAINT "operation_memberships_memberRole_check" CHECK ("memberRole" IN ('MEMBER', 'GROUP_LEADER')),
    CONSTRAINT "operation_memberships_effective_range_check" CHECK ("effectiveTo" IS NULL OR "effectiveTo" >= "effectiveFrom")
);

ALTER TABLE "tasks" ADD COLUMN "operationGroupSnapshotId" INTEGER REFERENCES "operation_groups" ("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "tasks" ADD COLUMN "operationMembershipSnapshotId" INTEGER REFERENCES "operation_memberships" ("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "tasks" ADD COLUMN "operationSnapshotAt" DATETIME;

CREATE UNIQUE INDEX "operation_groups_name_key" ON "operation_groups"("name");
CREATE INDEX "operation_groups_status_idx" ON "operation_groups"("status");
CREATE INDEX "operation_memberships_userId_idx" ON "operation_memberships"("userId");
CREATE INDEX "operation_memberships_groupId_idx" ON "operation_memberships"("groupId");
CREATE INDEX "operation_memberships_userId_effectiveTo_idx" ON "operation_memberships"("userId", "effectiveTo");
CREATE INDEX "operation_memberships_groupId_effectiveTo_idx" ON "operation_memberships"("groupId", "effectiveTo");
CREATE INDEX "operation_memberships_groupId_memberRole_effectiveTo_idx" ON "operation_memberships"("groupId", "memberRole", "effectiveTo");

-- Prisma schema cannot express a SQLite partial unique index. These database
-- constraints are the final concurrency barrier; transactions alone are not.
CREATE UNIQUE INDEX "operation_memberships_user_active_key"
  ON "operation_memberships"("userId") WHERE "effectiveTo" IS NULL;
CREATE UNIQUE INDEX "operation_memberships_group_active_leader_key"
  ON "operation_memberships"("groupId") WHERE "effectiveTo" IS NULL AND "memberRole" = 'GROUP_LEADER';

CREATE INDEX "tasks_operationGroupSnapshotId_idx" ON "tasks"("operationGroupSnapshotId");
CREATE INDEX "tasks_operationMembershipSnapshotId_idx" ON "tasks"("operationMembershipSnapshotId");

PRAGMA foreign_key_check;
PRAGMA foreign_keys=ON;
