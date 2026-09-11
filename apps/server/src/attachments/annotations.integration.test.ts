import { Test } from "@nestjs/testing";
import { INestApplication, ValidationPipe } from "@nestjs/common";
import { PassportModule } from "@nestjs/passport";
import { JwtService } from "@nestjs/jwt";
import { PrismaClient } from "@prisma/client";
import { resolve } from "path";
import { mkdirSync, writeFileSync, unlinkSync } from "fs";
import { AttachmentsController } from "./attachments.controller";
import { AttachmentsService } from "./attachments.service";
import { PrismaService } from "../common/prisma.service";
import { OperationLogService } from "../operation-log/operation-log.service";
import { JwtStrategy } from "../auth/jwt.strategy";
import { ResponseInterceptor } from "../common/response.interceptor";

const databaseUrl = process.env.ANNOTATION_TEST_DATABASE_URL;
const integration = databaseUrl ? describe : describe.skip;
integration("Annotations HTTP integration on isolated migrated copy", () => {
  let prisma: PrismaClient;
  let app: INestApplication;
  let base: string;
  let attachment: any;
  let image: any;
  let task: any;
  const users: any[] = [];
  const tokens: Record<string, string> = {};
  const document = { schemaVersion: 1, annotations: [{ id: "stable-mark-one", type: "point", x: 25, y: 30, color: "red", text: "保留此标注" }] };
  const call = async (method: string, id: any, role = "OPERATION", body?: unknown) => {
    const res = await fetch(`${base}/api/attachments/${id}/annotations`, { method, headers: { "Content-Type": "application/json", ...(tokens[role] ? { Authorization: `Bearer ${tokens[role]}` } : {}) }, ...(body === undefined ? {} : { body: JSON.stringify(body) }) });
    return { status: res.status, body: await res.json() as any, cache: res.headers.get("cache-control") };
  };
  beforeAll(async () => {
    if (!databaseUrl?.startsWith("file:") || !resolve(databaseUrl.slice(5)).includes("tianji-annotations-") || /[\\/]TianjiData[\\/]/i.test(databaseUrl)) throw new Error("An explicitly isolated database is required");
    process.env.JWT_SECRET = "isolated-annotation-integration-secret-only";
    process.env.TIANJI_DATA_ROOT = resolve(databaseUrl.slice(5), "../..");
    mkdirSync(resolve(process.env.TIANJI_DATA_ROOT, "uploads/attachments"), { recursive: true });
    writeFileSync(resolve(process.env.TIANJI_DATA_ROOT, "uploads/attachments/test-only.png"), Buffer.from("iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mP8/x8AAwMCAO+/l5cAAAAASUVORK5CYII=", "base64"));
    prisma = new PrismaClient({ datasources: { db: { url: databaseUrl } } });
    const jwt = new JwtService({ secret: process.env.JWT_SECRET });
    for (const name of ["OPERATION", "SUPER_ADMIN", "DESIGNER", "DESIGN_MANAGER", "OPERATION_MANAGER"]) {
      const role = await prisma.role.findUniqueOrThrow({ where: { name } });
      const user = await prisma.user.create({ data: { username: `annotation-test-${name}-${Date.now()}`, displayName: name, password: "unused-isolated-test", roleId: role.id } });
      users.push(user); tokens[name] = jwt.sign({ sub: user.id });
    }
    const outsider = await prisma.user.create({ data: { username: `annotation-outsider-${Date.now()}`, displayName: "outsider", password: "unused", roleId: users[0].roleId } });
    users.push(outsider); tokens.OUTSIDER = jwt.sign({ sub: outsider.id });
    task = await prisma.task.create({ data: { serialNumber: `ANNOTATION-TEST-${Date.now()}`, creatorId: users[0].id, workflowStatus: "DRAFT" } });
    image = await prisma.imageTask.create({ data: { taskId: task.id, imageTitle: "test", designerId: users[2].id } });
    attachment = await prisma.attachment.create({ data: { imageTaskId: image.id, category: "IMAGE_REFERENCE", fileName: "中文图.png", mimeType: "image/png", storagePath: "attachments/test-only.png", uploadedById: users[0].id } });
    const module = await Test.createTestingModule({ imports: [PassportModule], controllers: [AttachmentsController], providers: [AttachmentsService, JwtStrategy, { provide: PrismaService, useValue: prisma }, { provide: OperationLogService, useValue: { log: jest.fn() } }] }).compile();
    app = module.createNestApplication({ logger: false });
    app.setGlobalPrefix("api");
    app.useGlobalPipes(new ValidationPipe({ whitelist: true, forbidNonWhitelisted: true, transform: true }));
    app.useGlobalInterceptors(new ResponseInterceptor());
    await app.listen(0, "127.0.0.1"); base = await app.getUrl();
  }, 30000);
  beforeEach(async () => {
    await prisma.imageAnnotationDocument.deleteMany({ where: { attachmentId: attachment.id } });
    await prisma.attachment.update({ where: { id: attachment.id }, data: { deletedAt: null } });
    await prisma.task.update({ where: { id: task.id }, data: { workflowStatus: "DRAFT", deletedAt: null } });
  });
  afterAll(async () => {
    if (attachment) await prisma.attachment.delete({ where: { id: attachment.id } });
    if (image) await prisma.imageTask.delete({ where: { id: image.id } });
    if (task) await prisma.task.delete({ where: { id: task.id } });
    for (const user of users) await prisma.user.delete({ where: { id: user.id } });
    await app?.close(); await prisma?.$disconnect();
    unlinkSync(resolve(process.env.TIANJI_DATA_ROOT!, "uploads/attachments/test-only.png"));
  });
  it("rejects unauthenticated GET and PUT", async () => {
    expect((await call("GET", attachment.id, "NONE")).status).toBe(401);
    expect((await call("PUT", attachment.id, "NONE", { expectedVersion: 0, document })).status).toBe(401);
  });
  it("rejects another operator and a designer without visibility", async () => {
    expect((await call("GET", attachment.id, "OUTSIDER")).status).toBe(403);
    expect((await call("GET", attachment.id, "DESIGNER")).status).toBe(403);
    expect((await call("PUT", attachment.id, "OUTSIDER", { expectedVersion: 0, document })).status).toBe(403);
  });
  it("GET empty is read-only and no-store", async () => {
    const result = await call("GET", attachment.id);
    expect(result.status).toBe(200); expect(result.cache).toBe("no-store");
    expect(result.body.data).toMatchObject({ version: 0, document: { schemaVersion: 1, annotations: [] } });
    expect(await prisma.imageAnnotationDocument.count({ where: { attachmentId: attachment.id } })).toBe(0);
  });
  it("persists first, subsequent and empty saves with stable IDs", async () => {
    const first = await call("PUT", attachment.id, "OPERATION", { expectedVersion: 0, document });
    expect(first.status).toBe(200); expect(first.body.data.version).toBe(1);
    expect((await call("GET", attachment.id)).body.data.document).toEqual(document);
    const second = await call("PUT", attachment.id, "SUPER_ADMIN", { expectedVersion: 1, document });
    expect(second.status).toBe(200); expect(second.body.data).toMatchObject({ version: 2, createdById: users[0].id, updatedById: users[1].id });
    expect((await call("PUT", attachment.id, "OPERATION", { expectedVersion: 2, document: { schemaVersion: 1, annotations: [] } })).body.data.version).toBe(3);
    expect((await call("GET", attachment.id)).body.data.document.annotations).toEqual([]);
  });
  it("rejects stale updates and duplicate first saves without overwriting", async () => {
    await call("PUT", attachment.id, "OPERATION", { expectedVersion: 0, document });
    for (const expectedVersion of [0, 7]) expect((await call("PUT", attachment.id, "OPERATION", { expectedVersion, document })).status).toBe(409);
    expect((await call("GET", attachment.id)).body.data.version).toBe(1);
  });
  it.each([0, 1])("only one concurrent save wins at version %i", async expectedVersion => {
    if (expectedVersion) await call("PUT", attachment.id, "OPERATION", { expectedVersion: 0, document });
    const results = await Promise.all([call("PUT", attachment.id, "OPERATION", { expectedVersion, document }), call("PUT", attachment.id, "SUPER_ADMIN", { expectedVersion, document })]);
    expect(results.map(r => r.status).sort()).toEqual([200, 409]);
    expect((await call("GET", attachment.id)).body.data.version).toBe(expectedVersion + 1);
  }, 20000);
  it("denies soft-deleted attachment and parent without deleting annotations", async () => {
    await call("PUT", attachment.id, "OPERATION", { expectedVersion: 0, document });
    await prisma.attachment.update({ where: { id: attachment.id }, data: { deletedAt: new Date() } });
    expect((await call("GET", attachment.id)).status).toBe(404);
    expect((await call("PUT", attachment.id, "OPERATION", { expectedVersion: 1, document })).status).toBe(404);
    expect(await prisma.imageAnnotationDocument.count({ where: { attachmentId: attachment.id } })).toBe(1);
    await prisma.attachment.update({ where: { id: attachment.id }, data: { deletedAt: null } });
    await prisma.task.update({ where: { id: task.id }, data: { deletedAt: new Date() } });
    expect((await call("GET", attachment.id)).status).toBe(404);
  });
  it.each(["not-an-id", 0, -1, 999999999])("rejects invalid/nonexistent attachment %s", async id => {
    expect([400,404]).toContain((await call("GET", id)).status);
    expect([400,404]).toContain((await call("PUT", id, "OPERATION", { expectedVersion: 0, document })).status);
  });
  it.each([{}, { annotations: [] }, { schemaVersion: 1, annotations: {} }, { schemaVersion: 1, annotations: [{}] }, { schemaVersion: 1, annotations: [{ ...document.annotations[0], id: undefined }] }, { schemaVersion: 1, annotations: [{ ...document.annotations[0], type: "arrow" }] }, { schemaVersion: 1, annotations: [{ ...document.annotations[0], x: -1 }] }, { schemaVersion: 1, annotations: [document.annotations[0], document.annotations[0]] }])("rejects malformed document %#", async bad => {
    expect((await call("PUT", attachment.id, "OPERATION", { expectedVersion: 0, document: bad })).status).toBe(400);
  });
  it("rejects oversized and syntactically invalid JSON", async () => {
    const oversized = await call("PUT", attachment.id, "OPERATION", { expectedVersion: 0, document: { schemaVersion: 1, annotations: [], extra: "x".repeat(300000) } });
    expect(oversized.status).toBe(413);
    const result = await fetch(`${base}/api/attachments/${attachment.id}/annotations`, { method: "PUT", headers: { Authorization: `Bearer ${tokens.OPERATION}`, "Content-Type": "application/json" }, body: "{" });
    expect(result.status).toBe(400);
  });
  it("updates annotation text without changing identity, position or count", async () => {
    await call("PUT", attachment.id, "OPERATION", { expectedVersion: 0, document });
    const edited = { ...document, annotations: [{ ...document.annotations[0], text: "修改后的说明" }] };
    expect((await call("PUT", attachment.id, "OPERATION", { expectedVersion: 1, document: edited })).status).toBe(200);
    expect((await call("GET", attachment.id)).body.data.document).toEqual(edited);
    expect((await call("GET", attachment.id)).body.data.document.annotations).toHaveLength(1);
  });
  it("keeps authenticated download and attachment soft-delete behavior", async () => {
    await call("PUT", attachment.id, "OPERATION", { expectedVersion: 0, document });
    for (let attempt = 0; attempt < 2; attempt++) {
      const download = await fetch(`${base}/api/attachments/${attachment.id}/download`, { headers: { Authorization: `Bearer ${tokens.OPERATION}` } });
      expect(download.status).toBe(200);
      expect(download.headers.get("content-type")).toMatch(/image\/png/);
      expect((await download.arrayBuffer()).byteLength).toBeGreaterThan(0);
    }
    const removed = await fetch(`${base}/api/attachments/${attachment.id}`, { method: "DELETE", headers: { Authorization: `Bearer ${tokens.OPERATION}` } });
    expect(removed.status).toBe(200);
    expect((await call("GET", attachment.id)).status).toBe(404);
    expect(await prisma.imageAnnotationDocument.count({ where: { attachmentId: attachment.id } })).toBe(1);
  });
  it("rejects pseudo attachments containing links or missing physical files", async () => {
    for (const storagePath of ["https://example.invalid/image.png", "attachments/missing-test-image.png"]) {
      await prisma.attachment.update({ where: { id: attachment.id }, data: { storagePath } });
      expect((await call("GET", attachment.id)).status).toBe(404);
      expect((await call("PUT", attachment.id, "OPERATION", { expectedVersion: 0, document })).status).toBe(404);
    }
    await prisma.attachment.update({ where: { id: attachment.id }, data: { storagePath: "attachments/test-only.png" } });
  });
  it("shares saved annotations with visible roles but keeps them read-only", async () => {
    await call("PUT", attachment.id, "OPERATION", { expectedVersion: 0, document });
    await prisma.task.update({ where: { id: task.id }, data: { workflowStatus: "IN_DESIGN" } });
    for (const role of ["DESIGNER", "DESIGN_MANAGER", "OPERATION_MANAGER"]) {
      const result = await call("GET", attachment.id, role);
      expect(result.status).toBe(200); expect(result.body.data.document).toEqual(document);
      expect((await call("PUT", attachment.id, role, { expectedVersion: 1, document })).status).toBe(403);
    }
    expect((await call("PUT", attachment.id, "OPERATION", { expectedVersion: 1, document })).status).toBe(403);
  });
});
