const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");

const detailPage = fs.readFileSync(
  path.resolve(__dirname, "../src/app/dashboard/fazhi/[id]/page.tsx"),
  "utf8",
);

assert.match(detailPage, /const loadTask = useCallback\(async \(showLoading = false, preserveMainDraft = false\)/);
assert.match(detailPage, /if \(!preserveMainDraft\) \{\s*setMainDraft\(/s);
assert.match(detailPage, /useDashboardRefresh\(\{ refreshCore: \(\) => loadTask\(false, true\) \}\)/);

console.log("Decree requirement type refresh guard passed.");
