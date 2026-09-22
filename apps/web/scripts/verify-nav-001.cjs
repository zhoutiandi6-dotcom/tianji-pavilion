const fs = require('fs');
const path = require('path');

const root = path.resolve(__dirname, '..');
const list = fs.readFileSync(path.join(root, 'src/components/operator-dashboard/OperatorDecreeList.tsx'), 'utf8');
const detail = fs.readFileSync(path.join(root, 'src/app/dashboard/fazhi/[id]/page.tsx'), 'utf8');
const navigation = fs.readFileSync(path.join(root, 'src/lib/dashboard-navigation.ts'), 'utf8');

const checks = [
  ['keeps the exact current list URL as returnTo', list, /const returnTo = `\$\{window\.location\.pathname\}\$\{window\.location\.search\}`/],
  ['persists scroll and last viewed task in sessionStorage', list, /scrollTop: window\.scrollY, lastViewedTaskId: id/],
  ['restores scroll and has a row-location fallback', list, /window\.scrollTo\(\{ top: context!\.scrollTop, behavior: 'auto' \}\)/, /scrollIntoView\(\{ behavior: 'auto', block: 'center' \}\)/],
  ['adds a temporary returned-task highlight hook', list, /setHighlightedId\(target\.id\)/, /setHighlightedId\(null\)/],
  ['uses the NAV-002-safe return helper on detail', detail, /returnToPreviousDashboardPage\(router, fallback, returnTo \|\| undefined\)/],
  ['uses back only with a verified predecessor and replace for fallback', navigation, /previousMatchesExpected/, /router\.back\(\)/, /router\.replace\(fallback\)/],
];

for (const [label, source, ...assertions] of checks) {
  if (!assertions.every((assertion) => assertion.test(source))) {
    throw new Error(`NAV-001 verification failed: ${label}`);
  }
}

console.log('NAV-001 navigation contract verified.');
