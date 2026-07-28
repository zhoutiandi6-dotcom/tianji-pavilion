import { PrismaClient } from "@prisma/client";
import { existsSync, mkdirSync, statSync } from "node:fs";
import { resolve } from "node:path";

type SqliteDatabase = { close(): void };
type SqliteRuntime = {
  DatabaseSync: new (path: string) => SqliteDatabase;
  backup: (source: SqliteDatabase, destination: string) => Promise<void>;
};

// Node 24 provides node:sqlite at runtime. The repository still pins Node 20
// type definitions, so load the built-in dynamically rather than widening the
// application type baseline just for this local maintenance script.
const sqlite = require("node:sqlite") as SqliteRuntime;

const CONFIRM_FLAG = "--confirm-delete-all-test-decrees";
const args = new Set(process.argv.slice(2));
const executeDelete = args.has(CONFIRM_FLAG);
const serverRoot = resolve(__dirname, "..");
const defaultDatabasePath = resolve(serverRoot, "prisma", "data", "dev.db");
const configuredDatabaseUrl = process.env.DATABASE_URL ?? "file:./data/dev.db";
const configuredDatabasePath = configuredDatabaseUrl.replace(/^file:/, "");
const databasePath = configuredDatabasePath.startsWith(".")
  ? resolve(serverRoot, "prisma", configuredDatabasePath)
  : configuredDatabasePath;
const databaseUrl = `file:${databasePath.replace(/\\/g, "/")}`;

process.env.DATABASE_URL = databaseUrl;

const prisma = new PrismaClient();

type CleanupScope = {
  tasks: Array<{
    id: number;
    serialNumber: string;
    productCode: string | null;
    workflowStatus: string;
    creator: { id: number; username: string };
  }>;
  taskIds: number[];
  imageTaskIds: number[];
  attachments: Array<{
    id: number;
    storagePath: string;
    previewPath: string | null;
    thumbnailPath: string | null;
  }>;
  counts: Record<string, number>;
};

function assertDevelopmentDatabase() {
  const normalizedPath = databasePath.replace(/\\/g, "/").toLowerCase();
  const expectedPath = defaultDatabasePath.replace(/\\/g, "/").toLowerCase();

  if (process.env.NODE_ENV === "production" || normalizedPath !== expectedPath) {
    throw new Error(
      "Refusing to run: cleanup:test-decrees is restricted to apps/server/prisma/data/dev.db in a non-production environment.",
    );
  }
}

async function buildScope(): Promise<CleanupScope> {
  // The E2E product-code prefix is the only approved deletion marker. Similar
  // looking manual records are deliberately excluded and reported as out of scope.
  const tasks = await prisma.task.findMany({
    where: { productCode: { startsWith: "E2E-" } },
    select: {
      id: true,
      serialNumber: true,
      productCode: true,
      workflowStatus: true,
      creator: { select: { id: true, username: true } },
      imageTasks: { select: { id: true } },
    },
    orderBy: { id: "asc" },
  });

  const taskIds = tasks.map((task) => task.id);
  const imageTaskIds = tasks.flatMap((task) => task.imageTasks.map((imageTask) => imageTask.id));
  const emptyScope: CleanupScope = {
    tasks: [],
    taskIds: [],
    imageTaskIds: [],
    attachments: [],
    counts: {},
  };

  if (!taskIds.length) {
    return emptyScope;
  }

  const taskOrImageNotificationWhere = {
    OR: [{ taskId: { in: taskIds } }, { imageTaskId: { in: imageTaskIds } }],
  };
  const [
    attachments,
    taskSubmissionRecords,
    approvalRecords,
    weeklyPlanItems,
    operationsPlanItems,
    notifications,
    workflowHistory,
    taskAuditEvents,
    imageAuditEvents,
    legacyAttachmentAuditEvents,
    taskOperationLogs,
    imageOperationLogs,
  ] = await Promise.all([
    prisma.attachment.findMany({
      where: { OR: [{ taskId: { in: taskIds } }, { imageTaskId: { in: imageTaskIds } }] },
      select: { id: true, storagePath: true, previewPath: true, thumbnailPath: true },
    }),
    prisma.taskSubmissionRecord.count({ where: { taskId: { in: taskIds } } }),
    prisma.approvalRecord.count({ where: { taskId: { in: taskIds } } }),
    prisma.weeklyPlanItem.count({ where: { imageTaskId: { in: imageTaskIds } } }),
    prisma.weeklyOperationsApprovalPlanItem.count({ where: { decreeId: { in: taskIds } } }),
    prisma.notification.count({ where: taskOrImageNotificationWhere }),
    prisma.workflowHistory.count({ where: { workflowId: { in: taskIds } } }),
    prisma.auditEvent.count({ where: { resourceType: "task", resourceId: { in: taskIds } } }),
    // Older E2E paths logged task IDs under image_task; include both verified ID shapes.
    prisma.auditEvent.count({
      where: { resourceType: "image_task", resourceId: { in: [...taskIds, ...imageTaskIds] } },
    }),
    prisma.auditEvent.count({ where: { resourceType: "attachment", resourceId: { in: taskIds } } }),
    prisma.operationLog.count({ where: { targetType: "task", targetId: { in: taskIds } } }),
    prisma.operationLog.count({ where: { targetType: "image_task", targetId: { in: imageTaskIds } } }),
  ]);

  return {
    tasks: tasks.map(({ imageTasks: _imageTasks, ...task }) => task),
    taskIds,
    imageTaskIds,
    attachments,
    counts: {
      decrees: taskIds.length,
      imageTasks: imageTaskIds.length,
      attachments: attachments.length,
      taskSubmissionRecords,
      approvalRecords,
      weeklyPlanItems,
      weeklyOperationsApprovalPlanItems: operationsPlanItems,
      notifications,
      workflowHistory,
      auditEvents: taskAuditEvents + imageAuditEvents + legacyAttachmentAuditEvents,
      operationLogs: taskOperationLogs + imageOperationLogs,
    },
  };
}

function printDryRun(scope: CleanupScope) {
  console.log("\n=== Test decree cleanup: DRY RUN ===");
  console.log(`Database: ${databasePath}`);
  console.log("Deletion marker: productCode starts with E2E-");
  console.log("Candidate decrees:");
  for (const task of scope.tasks) {
    console.log(
      `  - #${task.id} ${task.serialNumber} | ${task.productCode ?? "(no product code)"} | ${task.workflowStatus} | ${task.creator.username}`,
    );
  }
  console.log("Predicted database deletions:");
  for (const [name, count] of Object.entries(scope.counts)) {
    console.log(`  - ${name}: ${count}`);
  }
  console.log(`Candidate unreferenced physical attachment paths (not deleted): ${scope.attachments.length}`);
  for (const attachment of scope.attachments) {
    console.log(`  - Attachment #${attachment.id}: ${attachment.storagePath}`);
  }
  console.log("Protected: users, roles, permissions, stores, requirement types, settings, migrations, and plan parent records.");
  console.log(`To execute after explicit approval: npm run cleanup:test-decrees -w @tianji/server -- ${CONFIRM_FLAG}`);
}

async function createBackup() {
  const timestamp = new Date().toISOString().replace(/[-:]/g, "").replace(/\.\d{3}Z$/, "").replace("T", "-");
  const backupDirectory = resolve(serverRoot, "prisma", "data", "backups");
  const backupPath = resolve(backupDirectory, `dev-before-decree-cleanup-${timestamp}.db`);

  mkdirSync(backupDirectory, { recursive: true });
  const source = new sqlite.DatabaseSync(databasePath);
  try {
    await sqlite.backup(source, backupPath);
  } finally {
    source.close();
  }

  if (!existsSync(backupPath) || statSync(backupPath).size === 0) {
    throw new Error(`Database backup failed: ${backupPath}`);
  }

  console.log(`Verified SQLite backup: ${backupPath} (${statSync(backupPath).size} bytes)`);
  return backupPath;
}

async function deleteScope(scope: CleanupScope) {
  if (!scope.taskIds.length) {
    console.log("No E2E-marked decrees found. Nothing to delete.");
    return;
  }

  await createBackup();

  await prisma.$transaction(async (tx) => {
    await tx.notification.deleteMany({
      where: { OR: [{ taskId: { in: scope.taskIds } }, { imageTaskId: { in: scope.imageTaskIds } }] },
    });
    await tx.weeklyPlanItem.deleteMany({ where: { imageTaskId: { in: scope.imageTaskIds } } });
    await tx.weeklyOperationsApprovalPlanItem.deleteMany({ where: { decreeId: { in: scope.taskIds } } });
    await tx.attachment.deleteMany({
      where: { OR: [{ taskId: { in: scope.taskIds } }, { imageTaskId: { in: scope.imageTaskIds } }] },
    });
    await tx.taskSubmissionRecord.deleteMany({ where: { taskId: { in: scope.taskIds } } });
    await tx.approvalRecord.deleteMany({ where: { taskId: { in: scope.taskIds } } });
    await tx.workflowHistory.deleteMany({ where: { workflowId: { in: scope.taskIds } } });
    await tx.auditEvent.deleteMany({
      where: {
        OR: [
          { resourceType: "task", resourceId: { in: scope.taskIds } },
          { resourceType: "image_task", resourceId: { in: [...scope.taskIds, ...scope.imageTaskIds] } },
          { resourceType: "attachment", resourceId: { in: scope.taskIds } },
        ],
      },
    });
    await tx.operationLog.deleteMany({
      where: {
        OR: [
          { targetType: "task", targetId: { in: scope.taskIds } },
          { targetType: "image_task", targetId: { in: scope.imageTaskIds } },
        ],
      },
    });
    await tx.imageTask.deleteMany({ where: { taskId: { in: scope.taskIds } } });
    await tx.task.deleteMany({ where: { id: { in: scope.taskIds } } });
  });

  const remaining = await buildScope();
  console.log("Post-cleanup remaining E2E-marked records:");
  for (const [name, count] of Object.entries(remaining.counts)) {
    console.log(`  - ${name}: ${count}`);
  }
  console.log("Cleanup transaction committed. Physical attachment files were not deleted.");
}

async function main() {
  assertDevelopmentDatabase();
  const scope = await buildScope();
  printDryRun(scope);

  if (executeDelete) {
    await deleteScope(scope);
  }
}

main()
  .catch((error) => {
    console.error(error);
    process.exitCode = 1;
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
