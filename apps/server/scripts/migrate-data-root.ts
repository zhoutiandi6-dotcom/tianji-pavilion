import { createHash } from "crypto";
import { cp, mkdir, readFile, rename, rm, stat, writeFile } from "fs/promises";
import { existsSync } from "fs";
import { basename, isAbsolute, join, resolve } from "path";
import { spawnSync } from "child_process";

type SqliteDatabase = { close(): void; prepare(sql: string): { all(...params: unknown[]): any[]; get(...params: unknown[]): any; run(...params: unknown[]): any } };
type SqliteRuntime = {
  DatabaseSync: new (path: string, options?: { readOnly?: boolean }) => SqliteDatabase;
  backup: (source: SqliteDatabase, destination: string) => Promise<void>;
};

const sqlite = require("node:sqlite") as SqliteRuntime;
const serverRoot = resolve(__dirname, "..");
const prismaRoot = join(serverRoot, "prisma");
const projectRoot = resolve(serverRoot, "..", "..");
const envPath = join(serverRoot, ".env");
const confirmation = "MIGRATE-TIANJI-DATA";

interface AttachmentRow {
  id: number;
  fileName: string;
  fileSize: number;
  storagePath: string;
}

interface Inventory {
  databasePath: string;
  uploadsPath: string;
  attachments: AttachmentRow[];
  physicalFiles: string[];
  missingFiles: AttachmentRow[];
  orphanFiles: string[];
  absolutePathCount: number;
  copyBytes: number;
  conflicts: string[];
  tableCounts: Record<string, number>;
}

function readEnvironment() {
  const values: Record<string, string> = {};
  if (existsSync(envPath)) {
    for (const line of require("fs").readFileSync(envPath, "utf8").split(/\r?\n/)) {
      const trimmed = line.trim();
      const separator = trimmed.indexOf("=");
      if (!trimmed || trimmed.startsWith("#") || separator < 1) continue;
      values[trimmed.slice(0, separator).trim()] = trimmed.slice(separator + 1).trim();
    }
  }
  const runtimeValues: Record<string, string> = {};
  for (const [key, value] of Object.entries(process.env)) {
    if (typeof value === "string") runtimeValues[key] = value;
  }
  return { ...values, ...runtimeValues };
}

function resolveDatabasePath(databaseUrl: string) {
  if (!databaseUrl?.startsWith("file:")) throw new Error("DATABASE_URL must be a SQLite file URL.");
  const rawPath = databaseUrl.slice("file:".length).replace(/\//g, "\\");
  return isAbsolute(rawPath) ? resolve(rawPath) : resolve(prismaRoot, rawPath);
}

function expectedDatabaseUrl(dataRoot: string) {
  return `file:${join(dataRoot, "database", "tianji.db").replace(/\\/g, "/")}`;
}

function getDataRoot(env: Record<string, string>) {
  const value = env.TIANJI_DATA_ROOT?.trim();
  if (!value) throw new Error("TIANJI_DATA_ROOT must be set for data-root migration.");
  return resolve(value);
}

async function sha256(path: string) {
  return createHash("sha256").update(await readFile(path)).digest("hex");
}

function queryCount(db: SqliteDatabase, table: string) {
  return Number(db.prepare(`SELECT COUNT(*) AS count FROM "${table}"`).get().count);
}

function verifyDatabase(path: string) {
  const db = new sqlite.DatabaseSync(path, { readOnly: true });
  try {
    const quickCheck = db.prepare("PRAGMA quick_check").get().quick_check;
    const foreignKeyViolations = db.prepare("PRAGMA foreign_key_check").all().length;
    if (quickCheck !== "ok" || foreignKeyViolations !== 0) {
      throw new Error(`Database verification failed: quick_check=${quickCheck}, foreign_key_check=${foreignKeyViolations}`);
    }
    const counts: Record<string, number> = {};
    for (const table of ["users", "tasks", "image_tasks", "approval_records", "weekly_plan_items", "workflow_history", "audit_events"]) {
      counts[table] = queryCount(db, table);
    }
    return counts;
  } finally {
    db.close();
  }
}

async function inspect(databasePath: string, uploadsPath: string): Promise<Inventory> {
  if (!existsSync(databasePath)) throw new Error(`Legacy database not found: ${databasePath}`);
  if (!existsSync(uploadsPath)) throw new Error(`Legacy uploads directory not found: ${uploadsPath}`);
  const db = new sqlite.DatabaseSync(databasePath, { readOnly: true });
  let attachments: AttachmentRow[];
  let tableCounts: Record<string, number>;
  try {
    attachments = db.prepare("SELECT id, fileName, fileSize, storagePath FROM attachments ORDER BY id").all() as AttachmentRow[];
    tableCounts = verifyDatabase(databasePath);
  } finally {
    db.close();
  }
  const physicalFiles: string[] = (require("fs").readdirSync(uploadsPath) as string[])
    .map((name: string) => join(uploadsPath, name))
    .filter((file: string) => require("fs").statSync(file).isFile() && basename(file) !== ".gitkeep");
  const referencedPaths = new Set(attachments.map((attachment) => resolve(attachment.storagePath)));
  const missingFiles = attachments.filter((attachment) => !existsSync(attachment.storagePath));
  const orphanFiles = physicalFiles.filter((file) => !referencedPaths.has(resolve(file)));
  const fileNames = new Map<string, string>();
  const conflicts: string[] = [];
  for (const attachment of attachments) {
    const targetName = basename(attachment.storagePath);
    const existing = fileNames.get(targetName);
    if (existing && resolve(existing) !== resolve(attachment.storagePath)) conflicts.push(targetName);
    fileNames.set(targetName, attachment.storagePath);
  }
  const copyBytes = (await Promise.all(physicalFiles.map((file) => stat(file)))).reduce((total, item) => total + item.size, 0);
  return {
    databasePath,
    uploadsPath,
    attachments,
    physicalFiles,
    missingFiles,
    orphanFiles,
    absolutePathCount: attachments.filter((attachment) => isAbsolute(attachment.storagePath)).length,
    copyBytes,
    conflicts,
    tableCounts,
  };
}

async function getFreeBytes(path: string) {
  const output = spawnSync("powershell.exe", ["-NoProfile", "-Command", `(Get-PSDrive -Name '${resolve(path).slice(0, 1)}').Free`], { encoding: "utf8" });
  return output.status === 0 ? Number(output.stdout.trim()) : NaN;
}

function printDryRun(inventory: Inventory, dataRoot: string, freeBytes: number) {
  const dbSize = require("fs").statSync(inventory.databasePath).size;
  console.log(JSON.stringify({
    mode: "dry-run",
    oldDatabasePath: inventory.databasePath,
    oldUploadsPath: inventory.uploadsPath,
    dataRoot,
    databaseSize: dbSize,
    attachmentRecords: inventory.attachments.length,
    physicalFiles: inventory.physicalFiles.length,
    absoluteStoragePaths: inventory.absolutePathCount,
    missingFiles: inventory.missingFiles.map((item) => item.id),
    orphanFiles: inventory.orphanFiles.length,
    fileConflicts: inventory.conflicts,
    estimatedCopyBytes: inventory.copyBytes + dbSize,
    dataDiskFreeBytes: freeBytes,
    plannedSteps: [
      "stop Tianji-owned frontend, backend, and watchdog",
      "create and verify a local migration protection backup",
      "stage a verified SQLite backup and all upload files under TIANJI_DATA_ROOT/temp",
      "convert attachment storagePath values to relative attachments\\<filename> in the staged database",
      "place unreferenced files in quarantine/orphan-attachments without deletion",
      "verify hashes and table counts before switching the local .env configuration",
    ],
  }, null, 2));
}

function stopTianji() {
  const result = spawnSync("powershell.exe", ["-NoProfile", "-ExecutionPolicy", "Bypass", "-File", join(projectRoot, "scripts", "stop-tianji.ps1"), "-NoPause"], { cwd: projectRoot, encoding: "utf8" });
  if (result.status !== 0) throw new Error(`Failed to stop Tianji: ${result.stderr || result.stdout}`);
  for (const port of [3000, 3001]) {
    const result = spawnSync("powershell.exe", ["-NoProfile", "-Command", `(Get-NetTCPConnection -LocalPort ${port} -State Listen -ErrorAction SilentlyContinue | Measure-Object).Count`], { encoding: "utf8" });
    if (Number(result.stdout.trim()) !== 0) throw new Error(`Port ${port} is still listening after Tianji stop. Refusing migration.`);
  }
}

async function copyVerified(source: string, destination: string) {
  await mkdir(resolve(destination, ".."), { recursive: true });
  await cp(source, destination, { force: false, errorOnExist: true });
  const [sourceHash, destinationHash] = await Promise.all([sha256(source), sha256(destination)]);
  if (sourceHash !== destinationHash) throw new Error(`Hash mismatch after copy: ${source}`);
}

async function createSQLiteBackup(sourcePath: string, destinationPath: string) {
  const source = new sqlite.DatabaseSync(sourcePath, { readOnly: true });
  try {
    await mkdir(resolve(destinationPath, ".."), { recursive: true });
    await sqlite.backup(source, destinationPath);
  } finally {
    source.close();
  }
  verifyDatabase(destinationPath);
}

function updateEnvValue(content: string, name: string, value: string) {
  const expression = new RegExp(`^${name}=.*$`, "m");
  return expression.test(content) ? content.replace(expression, `${name}=${value}`) : `${content.replace(/\s*$/, "")}\n${name}=${value}\n`;
}

async function writeMigratedEnvironment(dataRoot: string, env: Record<string, string>) {
  let content = existsSync(envPath) ? await readFile(envPath, "utf8") : "";
  content = updateEnvValue(content, "TIANJI_DATA_ROOT", dataRoot);
  content = updateEnvValue(content, "DATABASE_URL", expectedDatabaseUrl(dataRoot));
  if (env.TIANJI_BACKUP_ROOT) content = updateEnvValue(content, "TIANJI_BACKUP_ROOT", env.TIANJI_BACKUP_ROOT);
  await writeFile(envPath, content, "utf8");
}

async function executeMigration(inventory: Inventory, dataRoot: string, env: Record<string, string>) {
  if (inventory.missingFiles.length || inventory.conflicts.length) {
    throw new Error("Migration preflight has missing files or filename conflicts. Resolve them before execution.");
  }
  const databaseTarget = join(dataRoot, "database", "tianji.db");
  const uploadsTarget = join(dataRoot, "uploads", "attachments");
  if (existsSync(databaseTarget) || existsSync(uploadsTarget)) {
    throw new Error("Target database or attachments directory already exists. Refusing to overwrite a data root.");
  }

  stopTianji();
  const timestamp = new Date().toISOString().replace(/[:.]/g, "-");
  const protectionRoot = join(dataRoot, "backups", "migration-pre-switch", timestamp);
  const stagingRoot = join(dataRoot, "temp", `data-root-migration-${timestamp}`);
  const stagedDatabase = join(stagingRoot, "database", "tianji.db");
  const stagedAttachments = join(stagingRoot, "uploads", "attachments");
  const stagedQuarantine = join(stagingRoot, "quarantine", "orphan-attachments");
  const quarantineTarget = join(dataRoot, "quarantine", "orphan-attachments");
  const installedTargets: Array<{ source: string; destination: string }> = [];

  try {
    await createSQLiteBackup(inventory.databasePath, join(protectionRoot, "database", "legacy-tianji.db"));
    await cp(inventory.uploadsPath, join(protectionRoot, "uploads", "attachments"), { recursive: true, force: false, errorOnExist: true });
    const protectionFiles = require("fs").readdirSync(join(protectionRoot, "uploads", "attachments"))
      .filter((name: string) => name !== ".gitkeep");
    if (protectionFiles.length !== inventory.physicalFiles.length) throw new Error("Protection upload backup file count mismatch.");
    for (const sourceFile of inventory.physicalFiles) {
      const backupFile = join(protectionRoot, "uploads", "attachments", basename(sourceFile));
      if ((await sha256(sourceFile)) !== (await sha256(backupFile))) {
        throw new Error(`Protection upload backup verification failed: ${basename(sourceFile)}`);
      }
    }

    await createSQLiteBackup(inventory.databasePath, stagedDatabase);
    await mkdir(stagedAttachments, { recursive: true });
    await mkdir(stagedQuarantine, { recursive: true });
    const attachmentPaths = new Set(inventory.attachments.map((attachment) => resolve(attachment.storagePath)));
    for (const sourceFile of inventory.physicalFiles) {
      const destinationRoot = attachmentPaths.has(resolve(sourceFile)) ? stagedAttachments : stagedQuarantine;
      await copyVerified(sourceFile, join(destinationRoot, basename(sourceFile)));
    }

    const staged = new sqlite.DatabaseSync(stagedDatabase);
    try {
      staged.prepare("BEGIN IMMEDIATE").run();
      for (const attachment of inventory.attachments) {
        staged.prepare("UPDATE attachments SET storagePath = ? WHERE id = ?").run(`attachments\\${basename(attachment.storagePath)}`, attachment.id);
      }
      staged.prepare("COMMIT").run();
    } catch (error) {
      try { staged.prepare("ROLLBACK").run(); } catch { /* no open transaction */ }
      throw error;
    } finally {
      staged.close();
    }
    const stagedCounts = verifyDatabase(stagedDatabase);
    for (const [table, count] of Object.entries(inventory.tableCounts)) {
      if (stagedCounts[table] !== count) throw new Error(`Core table count changed for ${table}.`);
    }
    for (const attachment of inventory.attachments) {
      const oldPath = attachment.storagePath;
      const newPath = join(stagedAttachments, basename(oldPath));
      if ((await stat(oldPath)).size !== (await stat(newPath)).size || (await sha256(oldPath)) !== (await sha256(newPath))) {
        throw new Error(`Attachment verification failed for record #${attachment.id}.`);
      }
    }

    await mkdir(join(dataRoot, "database"), { recursive: true });
    await mkdir(join(dataRoot, "uploads"), { recursive: true });
    await mkdir(join(dataRoot, "backups", "database"), { recursive: true });
    await mkdir(join(dataRoot, "backups", "uploads"), { recursive: true });
    await mkdir(join(dataRoot, "logs"), { recursive: true });
    await mkdir(join(dataRoot, "quarantine"), { recursive: true });
    for (const target of [
      { source: stagedDatabase, destination: databaseTarget },
      { source: stagedAttachments, destination: uploadsTarget },
      { source: stagedQuarantine, destination: quarantineTarget },
    ]) {
      await rename(target.source, target.destination);
      installedTargets.push(target);
    }
    await writeMigratedEnvironment(dataRoot, env);
    await rm(stagingRoot, { recursive: true, force: true });
    console.log(JSON.stringify({
      mode: "executed",
      dataRoot,
      databaseTarget,
      convertedAttachmentPaths: inventory.attachments.length,
      copiedUploadFiles: inventory.physicalFiles.length,
      quarantinedOrphanFiles: inventory.orphanFiles.length,
      protectionRoot,
      tableCounts: stagedCounts,
    }, null, 2));
  } catch (error) {
    for (const target of installedTargets.reverse()) {
      if (existsSync(target.destination) && !existsSync(target.source)) {
        try { await rename(target.destination, target.source); } catch { /* preserve the target for manual recovery */ }
      }
    }
    console.error(`Migration failed before configuration switch. Legacy C-drive data remains unchanged. Staging retained at ${stagingRoot}.`);
    throw error;
  }
}

async function main() {
  const args = new Set(process.argv.slice(2));
  const execute = args.has("--execute");
  if (execute && (!args.has("--confirm") || !process.argv.includes(confirmation))) {
    throw new Error(`Execution requires: --execute --confirm ${confirmation}`);
  }
  const env = readEnvironment();
  const dataRoot = getDataRoot(env);
  const targetDatabase = join(dataRoot, "database", "tianji.db");
  if (existsSync(targetDatabase) && resolveDatabasePath(env.DATABASE_URL ?? "") === targetDatabase) {
    console.log(JSON.stringify({ mode: "already-migrated", dataRoot, databasePath: targetDatabase }, null, 2));
    return;
  }
  const legacyDatabasePath = resolveDatabasePath(env.DATABASE_URL ?? "file:./data/dev.db");
  const legacyUploadsPath = resolve(serverRoot, "uploads", "attachments");
  const inventory = await inspect(legacyDatabasePath, legacyUploadsPath);
  const freeBytes = await getFreeBytes(dataRoot);
  if (!execute) {
    printDryRun(inventory, dataRoot, freeBytes);
    return;
  }
  if (!Number.isFinite(freeBytes) || freeBytes < inventory.copyBytes * 3) {
    throw new Error("Data disk free space is insufficient for protection backup, staging, and final data.");
  }
  await executeMigration(inventory, dataRoot, env);
}

main().catch((error) => {
  console.error(error instanceof Error ? error.stack : error);
  process.exitCode = 1;
});
