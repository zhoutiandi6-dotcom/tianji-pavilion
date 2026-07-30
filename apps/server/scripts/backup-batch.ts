/*
 * Cold-backup batch helper. It deliberately operates on a stopped Tianji
 * runtime and writes only complete, verified batches.
 */
import { createHash } from "crypto";
import { cp, mkdir, readdir, readFile, rename, stat, writeFile } from "fs/promises";
import { join, relative, resolve, sep } from "path";

type SqliteDatabase = { close: () => void; prepare: (sql: string) => { all: () => any[]; get: () => any } };
type SqliteRuntime = {
  DatabaseSync: new (path: string, options?: { readOnly?: boolean }) => SqliteDatabase;
  backup: (source: SqliteDatabase, destination: string) => Promise<void>;
};
// Node 24 is used by the Windows launcher. @types/node in this repository is
// intentionally older, so retain the explicit runtime contract.
const sqlite = require("node:sqlite") as SqliteRuntime;

const coreTables = ["users", "tasks", "image_tasks", "attachments", "approval_records", "weekly_plan_items", "workflow_history", "audit_events"];
const manifestVersion = 1;

function required(name: string) {
  const value = process.env[name]?.trim();
  if (!value) throw new Error(`${name} is required.`);
  return value;
}

function sha256Buffer(value: Buffer | string) {
  return createHash("sha256").update(value).digest("hex");
}

async function sha256(path: string) {
  return sha256Buffer(await readFile(path));
}

async function walkFiles(root: string) {
  const files: string[] = [];
  async function visit(directory: string) {
    for (const entry of await readdir(directory, { withFileTypes: true })) {
      const fullPath = join(directory, entry.name);
      if (entry.isDirectory()) await visit(fullPath);
      else if (entry.isFile()) files.push(fullPath);
    }
  }
  try { await visit(root); } catch (error: any) { if (error?.code !== "ENOENT") throw error; }
  return files.sort();
}

async function inventory(root: string) {
  const files = await walkFiles(root);
  const entries = await Promise.all(files.map(async (file) => ({
    path: relative(root, file).split(sep).join("/"),
    size: (await stat(file)).size,
    sha256: await sha256(file),
  })));
  return { count: entries.length, bytes: entries.reduce((sum, entry) => sum + entry.size, 0), files: entries };
}

function verifyDatabase(path: string) {
  const db = new sqlite.DatabaseSync(path, { readOnly: true });
  try {
    const quickCheck = db.prepare("PRAGMA quick_check").all().map((row) => Object.values(row)[0]);
    const foreignKeyCheck = db.prepare("PRAGMA foreign_key_check").all();
    const counts: Record<string, number> = {};
    for (const table of coreTables) counts[table] = Number(db.prepare(`SELECT COUNT(*) AS count FROM ${table}`).get().count);
    const attachmentRecordCount = Number(db.prepare("SELECT COUNT(*) AS count FROM attachments").get().count);
    const attachmentPaths = db.prepare("SELECT storagePath FROM attachments WHERE deletedAt IS NULL").all().map((row) => String(row.storagePath));
    return { quickCheck, foreignKeyCheckCount: foreignKeyCheck.length, coreTableCounts: counts, attachmentRecordCount, attachmentPaths };
  } finally { db.close(); }
}

function assertRelativeAttachmentPaths(paths: string[]) {
  for (const storagePath of paths) {
    if (!storagePath || /^[a-zA-Z]:/.test(storagePath) || storagePath.startsWith("\\\\") || storagePath.includes("..") || !/^attachments[\\/]/.test(storagePath)) {
      throw new Error(`Unsafe attachment storagePath in backup source: ${storagePath}`);
    }
  }
}

async function writeJson(path: string, data: unknown) {
  await writeFile(path, `${JSON.stringify(data, null, 2)}\n`, "utf8");
}

async function writeManifestChecksum(batchPath: string) {
  const manifestPath = join(batchPath, "manifest.json");
  const checksum = await sha256(manifestPath);
  const checksumPath = join(batchPath, "manifest.sha256");
  await writeFile(checksumPath, `${checksum}  manifest.json\n`, "utf8");
  const writtenChecksum = (await readFile(checksumPath, "utf8")).trim().split(/\s+/)[0];
  if (writtenChecksum !== checksum) throw new Error("Backup manifest SHA-256 write verification failed.");
}

async function markFailedBatch(temporaryPath: string, phase: string, error: unknown) {
  await writeJson(join(temporaryPath, "failure.json"), {
    status: "FAILED",
    failedAt: new Date().toISOString(),
    phase,
    error: error instanceof Error ? error.message : String(error),
  }).catch(() => undefined);
}

async function verifyBatch(batchPath: string) {
  const manifestPath = join(batchPath, "manifest.json");
  const manifestHashPath = join(batchPath, "manifest.sha256");
  const manifest = JSON.parse((await readFile(manifestPath, "utf8")).replace(/^\uFEFF/, ""));
  const expectedManifestHash = (await readFile(manifestHashPath, "utf8")).trim().split(/\s+/)[0];
  if ((await sha256(manifestPath)) !== expectedManifestHash) throw new Error("Backup manifest SHA-256 mismatch.");
  const databasePath = join(batchPath, "database", "tianji.db");
  const attachmentsRoot = join(batchPath, "uploads", "attachments");
  const quarantineRoot = join(batchPath, "quarantine", "orphan-attachments");
  const database = verifyDatabase(databasePath);
  if (!database.quickCheck.every((value) => value === "ok") || database.foreignKeyCheckCount !== 0) throw new Error("SQLite validation failed for backup batch.");
  assertRelativeAttachmentPaths(database.attachmentPaths);
  const attachments = await inventory(attachmentsRoot);
  const quarantine = await inventory(quarantineRoot);
  if ((await sha256(databasePath)) !== manifest.database.sha256) throw new Error("Backup database SHA-256 mismatch.");
  if (attachments.count !== manifest.uploads.count || attachments.bytes !== manifest.uploads.bytes) throw new Error("Backup upload inventory mismatch.");
  if (quarantine.count !== manifest.quarantine.count || quarantine.bytes !== manifest.quarantine.bytes) throw new Error("Backup quarantine inventory mismatch.");
  const expectedHashes = new Map(manifest.uploads.files.map((file: any) => [file.path, file.sha256]));
  for (const file of attachments.files) if (expectedHashes.get(file.path) !== file.sha256) throw new Error(`Backup upload SHA-256 mismatch: ${file.path}`);
  const attachmentPaths = new Set(attachments.files.map((file) => file.path));
  for (const storagePath of database.attachmentPaths) {
    const relativeAttachmentPath = storagePath.replace(/\\/g, "/").replace(/^attachments\//, "");
    if (!attachmentPaths.has(relativeAttachmentPath)) throw new Error(`Active attachment record is missing its backup file: ${storagePath}`);
  }
  const verification = {
    verifiedAt: new Date().toISOString(),
    database: { quickCheck: database.quickCheck, foreignKeyCheckCount: database.foreignKeyCheckCount, coreTableCounts: database.coreTableCounts },
    uploads: { count: attachments.count, bytes: attachments.bytes },
    quarantine: { count: quarantine.count, bytes: quarantine.bytes },
    result: "ok",
  };
  await writeJson(join(batchPath, "verification.json"), verification);
  return verification;
}

async function createBatch() {
  const sourceDatabase = resolve(required("TIANJI_BACKUP_SOURCE_DATABASE"));
  const sourceAttachments = resolve(required("TIANJI_BACKUP_SOURCE_ATTACHMENTS"));
  const sourceQuarantine = resolve(required("TIANJI_BACKUP_SOURCE_QUARANTINE"));
  const batchesRoot = resolve(required("TIANJI_BACKUP_BATCHES_ROOT"));
  const batchId = required("TIANJI_BACKUP_BATCH_ID");
  const gitCommit = process.env.TIANJI_BACKUP_GIT_COMMIT?.trim() || "unknown";
  const finalPath = join(batchesRoot, batchId);
  const temporaryPath = `${finalPath}.tmp`;
  if (await stat(finalPath).then(() => true).catch(() => false) || await stat(temporaryPath).then(() => true).catch(() => false)) throw new Error(`Backup batch already exists: ${batchId}`);

  let phase = "validate-source";
  let temporaryDirectoryCreated = false;
  try {
    const sourceDatabaseInfo = verifyDatabase(sourceDatabase);
    if (!sourceDatabaseInfo.quickCheck.every((value) => value === "ok") || sourceDatabaseInfo.foreignKeyCheckCount !== 0) throw new Error("Source database validation failed.");
    assertRelativeAttachmentPaths(sourceDatabaseInfo.attachmentPaths);
    phase = "create-temporary-directory";
    await mkdir(batchesRoot, { recursive: true });
    await mkdir(temporaryPath);
    temporaryDirectoryCreated = true;
    await mkdir(join(temporaryPath, "database"), { recursive: true });
    await mkdir(join(temporaryPath, "uploads"), { recursive: true });
    await mkdir(join(temporaryPath, "quarantine"), { recursive: true });

    phase = "copy-database";
    const source = new sqlite.DatabaseSync(sourceDatabase, { readOnly: true });
    try { await sqlite.backup(source, join(temporaryPath, "database", "tianji.db")); } finally { source.close(); }
    phase = "copy-uploads";
    await cp(sourceAttachments, join(temporaryPath, "uploads", "attachments"), { recursive: true, force: false, errorOnExist: true });
    phase = "copy-quarantine";
    // Quarantine is archived separately and is never restored into active uploads by default.
    if (await stat(sourceQuarantine).then(() => true).catch(() => false)) await cp(sourceQuarantine, join(temporaryPath, "quarantine", "orphan-attachments"), { recursive: true, force: false, errorOnExist: true });

    phase = "write-manifest";
    const databasePath = join(temporaryPath, "database", "tianji.db");
    const uploads = await inventory(join(temporaryPath, "uploads", "attachments"));
    const quarantine = await inventory(join(temporaryPath, "quarantine", "orphan-attachments"));
    const manifest: any = {
      manifestVersion,
      batchId,
      createdAt: new Date().toISOString(),
      gitCommit,
      dataRoot: process.env.TIANJI_DATA_ROOT ?? null,
      database: { relativePath: "database/tianji.db", size: (await stat(databasePath)).size, sha256: await sha256(databasePath) },
      coreTableCounts: sourceDatabaseInfo.coreTableCounts,
      attachmentRecordCount: sourceDatabaseInfo.attachmentRecordCount,
      activeAttachmentRecordCount: sourceDatabaseInfo.attachmentPaths.length,
      uploads,
      quarantine,
      toolVersion: "tianji-backup-batch/1",
      automatic: process.env.TIANJI_BACKUP_AUTOMATIC === "true",
      verification: { status: "pending" },
      cloudSync: { status: "not-synced" },
    };
    await writeJson(join(temporaryPath, "manifest.json"), manifest);
    phase = "write-manifest-checksum";
    await writeManifestChecksum(temporaryPath);
    phase = "verify-batch";
    const verification = await verifyBatch(temporaryPath);
    manifest.verification = { status: "ok", verifiedAt: verification.verifiedAt };
    await writeJson(join(temporaryPath, "manifest.json"), manifest);
    phase = "write-final-manifest-checksum";
    await writeManifestChecksum(temporaryPath);
    phase = "final-verify-batch";
    const finalVerification = await verifyBatch(temporaryPath);
    phase = "publish-batch";
    await rename(temporaryPath, finalPath);
    console.log(JSON.stringify({ status: "ok", batchPath: finalPath, batchId, verification: finalVerification }, null, 2));
  } catch (error) {
    if (temporaryDirectoryCreated) await markFailedBatch(temporaryPath, phase, error);
    throw error;
  }
}

async function commandVerify() {
  const batchPath = resolve(required("TIANJI_BACKUP_BATCH_PATH"));
  console.log(JSON.stringify({ status: "ok", batchPath, verification: await verifyBatch(batchPath) }, null, 2));
}

async function main() {
  const command = process.argv[2];
  if (command === "create") await createBatch();
  else if (command === "verify") await commandVerify();
  else throw new Error("Usage: ts-node scripts/backup-batch.ts <create|verify>");
}

main().catch(async (error) => {
  console.error(error instanceof Error ? error.stack ?? error.message : error);
  process.exitCode = 1;
});
