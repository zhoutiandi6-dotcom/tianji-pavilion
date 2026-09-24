const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");
const ts = require("typescript");
const vm = require("node:vm");

const root = path.resolve(__dirname, "..");
const navigation = fs.readFileSync(path.join(root, "src/lib/dashboard-navigation.ts"), "utf8");
const breadcrumbs = fs.readFileSync(path.join(root, "src/components/BreadcrumbNav.tsx"), "utf8");
const imageDetail = fs.readFileSync(path.join(root, "src/app/dashboard/image-tasks/[id]/page.tsx"), "utf8");
const decreeDetail = fs.readFileSync(path.join(root, "src/app/dashboard/fazhi/[id]/page.tsx"), "utf8");

assert.match(navigation, /function defaultTaskListPathForRole/);
assert.match(navigation, /function isPermittedTaskListPath/);
assert.match(navigation, /url\.pathname !== "\/dashboard\/fazhi"/);
assert.match(navigation, /taskListScopesByRole/);
assert.match(breadcrumbs, /segment === "image-tasks"\s*\?\s*defaultTaskListPathForRole\(role\)/);
assert.match(imageDetail, /resolveImageTaskListReturnPath\(requestedReturnTo, currentUser\?\.role\)/);
assert.match(imageDetail, /isPermittedReturnTo \? requestedReturnTo/);
assert.match(imageDetail, /returnToPreviousDashboardPage\(router, returnPath/);
assert.match(decreeDetail, /const listReturnTo = searchParams\.get\("returnTo"\)/);
assert.doesNotMatch(decreeDetail, /image-tasks\/\$\{row\.id\}\?returnTo=\$\{encodeURIComponent\(`\/dashboard\/fazhi\/\$\{task\.id\}`\)\}/);

const compiledNavigation = ts.transpileModule(navigation, {
  compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2020 },
}).outputText;
const navigationModule = { exports: {} };
vm.runInNewContext(compiledNavigation, {
  exports: navigationModule.exports,
  module: navigationModule,
  URL,
  window: { location: { origin: "http://localhost:3000" } },
});
const { defaultTaskListPathForRole, isPermittedTaskListPath, resolveImageTaskListReturnPath } = navigationModule.exports;

assert.equal(defaultTaskListPathForRole("DESIGN_MANAGER"), "/dashboard/fazhi?scope=design-tasks");
for (const role of ["DESIGNER", "OPERATION", "OPERATION_MANAGER", "OWNER", "SUPER_ADMIN"]) {
  assert.equal(defaultTaskListPathForRole(role), "/dashboard/fazhi?scope=processing");
}
assert.equal(isPermittedTaskListPath("/dashboard/fazhi?scope=design-reviews", "DESIGNER"), false);
assert.equal(isPermittedTaskListPath("/dashboard/fazhi/123", "DESIGNER"), false);
assert.equal(isPermittedTaskListPath("https://example.test/dashboard/fazhi?scope=processing", "DESIGNER"), false);
assert.equal(isPermittedTaskListPath("/dashboard/fazhi?scope=processing&page=3", "OPERATION"), true);
assert.equal(resolveImageTaskListReturnPath("/dashboard/fazhi/123", "DESIGN_MANAGER"), "/dashboard/fazhi?scope=design-tasks");

console.log("NAV-003 navigation contract verified.");
