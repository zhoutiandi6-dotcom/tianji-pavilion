import { assertTianjiDataEnvironment, getTianjiDataPaths, resolveAttachmentStoragePath, toAttachmentStoragePath } from "./tianji-data-paths";

const root = "D:\\TianjiData";
const databaseUrl = "file:D:/TianjiData/database/tianji.db";

describe("Tianji data paths", () => {
  it("derives all runtime paths from TIANJI_DATA_ROOT", () => {
    const paths = getTianjiDataPaths({ TIANJI_DATA_ROOT: root });
    expect(paths.databasePath).toMatch(/[\\/]TianjiData[\\/]database[\\/]tianji\.db$/);
    expect(paths.attachmentsRoot).toMatch(/[\\/]TianjiData[\\/]uploads[\\/]attachments$/);
    expect(paths.backupsDatabaseRoot).toMatch(/[\\/]TianjiData[\\/]backups[\\/]database$/);
  });

  it("requires a database URL derived from the configured root", () => {
    expect(() => assertTianjiDataEnvironment({ TIANJI_DATA_ROOT: root, DATABASE_URL: databaseUrl })).not.toThrow();
    expect(() => assertTianjiDataEnvironment({ TIANJI_DATA_ROOT: root, DATABASE_URL: "file:./data/dev.db" })).toThrow("DATABASE_URL must match");
  });

  it("resolves only relative attachment paths below the uploads root", () => {
    const paths = getTianjiDataPaths({ TIANJI_DATA_ROOT: root });
    expect(toAttachmentStoragePath("asset.png")).toMatch(/^attachments[\\/]asset\.png$/);
    expect(resolveAttachmentStoragePath(toAttachmentStoragePath("asset.png"), paths)).toMatch(/[\\/]uploads[\\/]attachments[\\/]asset\.png$/);
    expect(() => resolveAttachmentStoragePath("..\\database\\tianji.db", paths)).toThrow("escapes");
    expect(() => resolveAttachmentStoragePath("C:\\other\\asset.png", paths)).toThrow("relative");
  });
});
