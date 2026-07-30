import { isAbsolute, relative, resolve, sep } from "path";

export interface TianjiDataPaths {
  dataRoot: string;
  databasePath: string;
  databaseUrl: string;
  uploadsRoot: string;
  attachmentsRoot: string;
  backupsDatabaseRoot: string;
  backupsUploadsRoot: string;
  logsRoot: string;
  tempRoot: string;
  quarantineRoot: string;
}

function toPrismaFileUrl(path: string) {
  return `file:${path.replace(/\\/g, "/")}`;
}

export function getTianjiDataPaths(env: NodeJS.ProcessEnv = process.env): TianjiDataPaths {
  const configuredRoot = env.TIANJI_DATA_ROOT?.trim();
  if (!configuredRoot) {
    throw new Error("TIANJI_DATA_ROOT is required. Refusing to use a project-directory data fallback.");
  }

  const dataRoot = resolve(configuredRoot);
  const uploadsRoot = resolve(dataRoot, "uploads");
  return {
    dataRoot,
    databasePath: resolve(dataRoot, "database", "tianji.db"),
    databaseUrl: toPrismaFileUrl(resolve(dataRoot, "database", "tianji.db")),
    uploadsRoot,
    attachmentsRoot: resolve(uploadsRoot, "attachments"),
    backupsDatabaseRoot: resolve(dataRoot, "backups", "database"),
    backupsUploadsRoot: resolve(dataRoot, "backups", "uploads"),
    logsRoot: resolve(dataRoot, "logs"),
    tempRoot: resolve(dataRoot, "temp"),
    quarantineRoot: resolve(dataRoot, "quarantine"),
  };
}

export function assertTianjiDataEnvironment(env: NodeJS.ProcessEnv = process.env) {
  const paths = getTianjiDataPaths(env);
  if (!env.DATABASE_URL) {
    throw new Error("DATABASE_URL is required and must be derived from TIANJI_DATA_ROOT.");
  }
  if (env.DATABASE_URL.replace(/\\/g, "/") !== paths.databaseUrl) {
    throw new Error("DATABASE_URL must match TIANJI_DATA_ROOT/database/tianji.db. Refusing a mismatched data source.");
  }
  return paths;
}

export function toAttachmentStoragePath(fileName: string) {
  if (!fileName || fileName.includes("/") || fileName.includes("\\")) {
    throw new Error("Attachment filename must not contain a path separator.");
  }
  return `attachments${sep}${fileName}`;
}

export function resolveAttachmentStoragePath(storagePath: string, paths = getTianjiDataPaths()) {
  if (!storagePath || isAbsolute(storagePath) || /^[a-zA-Z]:/.test(storagePath) || /^\\\\/.test(storagePath)) {
    throw new Error("Attachment storage path must be a relative path inside TIANJI_DATA_ROOT/uploads.");
  }

  const candidate = resolve(paths.uploadsRoot, storagePath);
  const pathFromUploads = relative(paths.uploadsRoot, candidate);
  if (!pathFromUploads || pathFromUploads === ".." || pathFromUploads.startsWith(`..${sep}`) || isAbsolute(pathFromUploads)) {
    throw new Error("Attachment storage path escapes TIANJI_DATA_ROOT/uploads.");
  }
  return candidate;
}
