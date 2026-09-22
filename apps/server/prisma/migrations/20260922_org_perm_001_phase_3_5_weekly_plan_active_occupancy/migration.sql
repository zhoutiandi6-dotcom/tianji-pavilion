-- ORG-PERM-001 Phase 3.5
-- A decree may be actively scheduled in exactly one operations approval plan.
-- Removed items remain as historical evidence and may be scheduled again.
CREATE UNIQUE INDEX "weekly_operations_approval_plan_items_decree_active_key"
ON "weekly_operations_approval_plan_items"("decreeId")
WHERE "removedAt" IS NULL;
