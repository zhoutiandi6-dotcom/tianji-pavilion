-- Task.id is an internal SQLite primary key. Business decree numbers are
-- allocated from this durable sequence and must never be derived from Task.id.
CREATE TABLE "business_sequences" (
    "key" TEXT NOT NULL PRIMARY KEY,
    "currentValue" INTEGER NOT NULL,
    "updatedAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP
);

-- 147 is the verified historical high-water mark before this migration. The
-- runtime scan also includes existing persisted history so a task created
-- between code review and production deployment cannot move the sequence back.
WITH "issued_numbers"("value") AS (
    SELECT CAST(SUBSTR("serialNumber", 4, 6) AS INTEGER)
    FROM "tasks"
    WHERE "serialNumber" LIKE '天字第______号法旨'

    UNION ALL

    SELECT CAST(SUBSTR("metadata", INSTR("metadata", '天字第') + 3, 6) AS INTEGER)
    FROM "audit_events"
    WHERE "metadata" LIKE '%天字第______号法旨%'

    UNION ALL

    SELECT CAST(SUBSTR("metadata", INSTR("metadata", '天字第') + 3, 6) AS INTEGER)
    FROM "workflow_history"
    WHERE "metadata" LIKE '%天字第______号法旨%'

    UNION ALL

    SELECT CAST(SUBSTR("content", INSTR("content", '天字第') + 3, 6) AS INTEGER)
    FROM "notifications"
    WHERE "content" LIKE '%天字第______号法旨%'

    UNION ALL

    SELECT CAST(SUBSTR("content", INSTR("content", '天字第') + 3, 6) AS INTEGER)
    FROM "operation_logs"
    WHERE "content" LIKE '%天字第______号法旨%'
)
INSERT INTO "business_sequences" ("key", "currentValue", "updatedAt")
SELECT
    'TASK_DECREE',
    CASE WHEN COALESCE(MAX("value"), 0) > 147 THEN MAX("value") ELSE 147 END,
    CURRENT_TIMESTAMP
FROM "issued_numbers";
