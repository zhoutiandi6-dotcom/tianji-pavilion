import { BadRequestException, PayloadTooLargeException } from "@nestjs/common";

export interface ImageAnnotationValue {
  id: string;
  type: "point" | "rectangle";
  x: number;
  y: number;
  width?: number;
  height?: number;
  color: string;
  text: string;
}
export interface AnnotationDocument {
  schemaVersion: 1;
  annotations: ImageAnnotationValue[];
}
export const emptyAnnotationDocument = (): AnnotationDocument => ({ schemaVersion: 1, annotations: [] });

export function validateAnnotationSave(body: unknown): { expectedVersion: number; document: AnnotationDocument } {
  const fail = () => { throw new BadRequestException("Invalid annotation document"); };
  if (!body || typeof body !== "object" || Array.isArray(body)) return fail();
  if (Buffer.byteLength(JSON.stringify(body), "utf8") > 256 * 1024) throw new PayloadTooLargeException();
  const input = body as any;
  if (Object.keys(input).some(key => !["expectedVersion", "document"].includes(key))) return fail();
  if (!Number.isSafeInteger(input.expectedVersion) || input.expectedVersion < 0) return fail();
  const doc = input.document;
  if (!doc || typeof doc !== "object" || Array.isArray(doc) || doc.schemaVersion !== 1 || !Array.isArray(doc.annotations)) return fail();
  if (Object.keys(doc).some(key => !["schemaVersion", "annotations"].includes(key)) || doc.annotations.length > 1000) return fail();
  const ids = new Set<string>();
  const percent = (v: unknown) => typeof v === "number" && Number.isFinite(v) && v >= 0 && v <= 100;
  for (const mark of doc.annotations) {
    if (!mark || typeof mark !== "object" || Array.isArray(mark)) return fail();
    if (Object.keys(mark).some(key => !["id", "type", "x", "y", "width", "height", "color", "text"].includes(key))) return fail();
    if (typeof mark.id !== "string" || !/^[A-Za-z0-9_-]{1,128}$/.test(mark.id) || ids.has(mark.id)) return fail();
    ids.add(mark.id);
    if (!["point", "rectangle"].includes(mark.type) || !percent(mark.x) || !percent(mark.y)) return fail();
    if (!["red", "orange", "yellow", "green", "blue", "purple"].includes(mark.color)) return fail();
    if (typeof mark.text !== "string" || mark.text.length > 2000) return fail();
    if (mark.type === "rectangle") {
      if (!percent(mark.width) || !percent(mark.height) || mark.width <= 0 || mark.height <= 0 || mark.x + mark.width > 100.000001 || mark.y + mark.height > 100.000001) return fail();
    } else if (mark.width !== undefined || mark.height !== undefined) return fail();
  }
  return { expectedVersion: input.expectedVersion, document: doc };
}
