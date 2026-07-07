const fs = require("node:fs");
const path = require("node:path");
const crypto = require("node:crypto");
const { spawnSync } = require("node:child_process");

const root = path.resolve(__dirname, "..");
const assetsRoot = path.join(root, "assets");
const appContentPath = path.join(assetsRoot, "config", "app-content.json");
const versionPath = path.join(root, "version.json");
const sigPath = path.join(root, "version.sig");

function md5File(filePath) {
  const hash = crypto.createHash("md5");
  hash.update(fs.readFileSync(filePath));
  return hash.digest("hex");
}

function walk(dir) {
  const result = [];
  for (const entry of fs.readdirSync(dir, { withFileTypes: true })) {
    const filePath = path.join(dir, entry.name);
    if (entry.isDirectory()) {
      result.push(...walk(filePath));
    } else if (entry.isFile()) {
      result.push(filePath);
    }
  }
  return result;
}

function readJsonSafe(filePath) {
  try {
    return JSON.parse(fs.readFileSync(filePath, "utf8"));
  } catch {
    return {};
  }
}

if (!fs.existsSync(assetsRoot)) {
  console.error("assets folder not found.");
  process.exit(1);
}

const content = readJsonSafe(appContentPath);
const files = walk(assetsRoot)
  .sort((a, b) => a.localeCompare(b))
  .map((filePath) => ({
    path: path.relative(root, filePath).replace(/\\/g, "/"),
    md5: md5File(filePath),
    size: fs.statSync(filePath).size,
  }));

const logicHash = crypto.createHash("md5");
for (const file of files) {
  if (
    file.path.startsWith("assets/logic/") ||
    file.path === "assets/config/characters.json" ||
    file.path === "assets/config/cards.json" ||
    file.path === "assets/config/werewolf-roles.json" ||
    file.path === "assets/config/werewolf-presets.json"
  ) {
    logicHash.update(file.path);
    logicHash.update(file.md5);
  }
}

const manifest = {
  appVersion: String(content.appVersion ?? "1.4"),
  announcementVersion: String(content.announcementVersion ?? content.appVersion ?? "1.4"),
  logicVersion: String(content.logicVersion ?? content.appVersion ?? "1.4"),
  protocolVersion: String(content.protocolVersion ?? content.appVersion ?? "1.4"),
  logicMd5: files.some((file) => file.path.startsWith("assets/logic/")) ? logicHash.digest("hex") : "",
  generatedAt: new Date().toISOString(),
  files,
};

fs.writeFileSync(versionPath, `${JSON.stringify(manifest, null, 2)}\n`, "utf8");
const sign = spawnSync(process.execPath, [path.join(root, "scripts", "sign_manifest.cjs"), versionPath, sigPath], {
  cwd: root,
  stdio: "inherit",
});
if (sign.status !== 0) process.exit(sign.status || 1);

console.log(`Generated version.json and version.sig`);
console.log(`Files: ${files.length}`);
console.log(`Logic version: ${manifest.logicVersion} / ${manifest.logicMd5}`);
