const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");

const componentPath = path.resolve(__dirname, "../src/components/BreadcrumbNav.tsx");
const source = fs.readFileSync(componentPath, "utf8");

assert.match(source, /首页/);
assert.doesNotMatch(source, /\\u[0-9a-fA-F]{4}/);
assert.match(source, /href: "\/dashboard"/);

console.log("Breadcrumb labels verified.");
