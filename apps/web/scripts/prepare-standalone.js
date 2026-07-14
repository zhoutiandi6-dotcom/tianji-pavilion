const fs = require("fs");
const path = require("path");

const webRoot = path.resolve(__dirname, "..");
const runtimeRoot = path.join(webRoot, ".next", "standalone", "apps", "web");

function copyDirectory(source, destination) {
  if (!fs.existsSync(source)) return;
  fs.mkdirSync(path.dirname(destination), { recursive: true });
  fs.cpSync(source, destination, { recursive: true, force: true });
}

if (!fs.existsSync(path.join(runtimeRoot, "server.js"))) {
  throw new Error("Standalone server was not generated. Check next.config.js output setting.");
}

copyDirectory(path.join(webRoot, ".next", "static"), path.join(runtimeRoot, ".next", "static"));
copyDirectory(path.join(webRoot, "public"), path.join(runtimeRoot, "public"));

console.log("Standalone web runtime prepared.");
