const fs = require("node:fs");
const path = require("node:path");

const root = path.resolve(__dirname, "..");
const webDist = path.join(root, "apps", "web", "dist");

if (!fs.existsSync(webDist)) {
  throw new Error("apps/web/dist is missing. Run npm run build first.");
}

copyDirectory(path.join(root, "assets"), path.join(webDist, "assets"));
copyFile(path.join(root, "version.json"), path.join(webDist, "version.json"));
copyFile(path.join(root, "version.sig"), path.join(webDist, "version.sig"));

console.log("Android web assets prepared.");

function copyDirectory(source, target) {
  fs.rmSync(target, { recursive: true, force: true });
  fs.cpSync(source, target, { recursive: true, force: true });
}

function copyFile(source, target) {
  if (!fs.existsSync(source)) return;
  fs.mkdirSync(path.dirname(target), { recursive: true });
  fs.copyFileSync(source, target);
}
