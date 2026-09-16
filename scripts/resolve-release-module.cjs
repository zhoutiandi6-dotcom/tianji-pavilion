const fs = require('fs');
const path = require('path');
const root = fs.realpathSync(process.argv[2]);
const workingDirectory = fs.realpathSync(process.argv[3]);
const resolved = fs.realpathSync(require.resolve(process.argv[4], { paths: [workingDirectory] }));
if (!resolved.toLowerCase().startsWith(root.toLowerCase() + path.sep)) {
  throw new Error(`Resolved outside release: ${resolved}`);
}
process.stdout.write(resolved);
