-- Legacy review submissions could leave the parent decree in DESIGN_ASSIGNED.
-- Derive the parent workflow state from the authoritative image-task status;
-- no submission timestamp or actor is invented for historical rows.
UPDATE "tasks"
SET "workflowStatus" = 'DESIGN_REVIEW'
WHERE "deletedAt" IS NULL
  AND "workflowStatus" IN ('OPS_APPROVED', 'DESIGN_ASSIGNED', 'IN_DESIGN')
  AND EXISTS (
    SELECT 1
    FROM "image_tasks"
    WHERE "image_tasks"."taskId" = "tasks"."id"
      AND "image_tasks"."deletedAt" IS NULL
      AND "image_tasks"."status" = 'SUBMITTED_FOR_REVIEW'
  );
