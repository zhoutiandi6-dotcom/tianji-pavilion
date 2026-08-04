const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");

const page = fs.readFileSync(path.resolve(__dirname, "../src/app/dashboard/fazhi/new/page.tsx"), "utf8");
const api = fs.readFileSync(path.resolve(__dirname, "../src/lib/api.ts"), "utf8");

assert.match(page, /name="requirementTypeId"/);
assert.match(page, /requirementTypeId: values\.requirementTypeId/);
assert.match(page, /api\.get\("\/requirement-types"\)/);
assert.match(api, /requirementTypeId\?: number/);
assert.match(api, /create: \(data: CreateTaskPayload\)/);

console.log("New decree requirement type create guard passed.");
