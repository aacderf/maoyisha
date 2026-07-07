const crypto = require("node:crypto");
const fs = require("node:fs");
const path = require("node:path");
const { spawnSync } = require("node:child_process");

const root = path.resolve(__dirname, "..");
const packageJson = JSON.parse(fs.readFileSync(path.join(root, "package.json"), "utf8"));
const version = packageJson.version;
const distribution = path.join(root, "release", "distribution");
const winDir = path.join(root, "release", "win-unpacked");
const appName = "茂一杀";
const cleanWinDirName = `${appName}-${version}-Windows-x64`;
const cleanWinDir = path.join(distribution, cleanWinDirName);
const zipPath = path.join(distribution, `${cleanWinDirName}.zip`);
const apkSource = path.join(root, "release", "android", `${appName}-${version}.apk`);
const apkPath = path.join(distribution, `${appName}-${version}.apk`);

for (const required of [path.join(winDir, `${appName}.exe`), path.join(winDir, "resources")]) {
  if (!fs.existsSync(required)) throw new Error(`Missing release artifact: ${required}`);
}

fs.rmSync(distribution, { recursive: true, force: true });
fs.mkdirSync(distribution, { recursive: true });
fs.cpSync(winDir, cleanWinDir, {
  recursive: true,
  filter: (source) => {
    const name = path.basename(source).toLowerCase();
    return !name.startsWith("builder") && !name.endsWith(".blockmap");
  },
});
fs.writeFileSync(
  path.join(cleanWinDir, "README-玩家必读.txt"),
  [
    `茂一杀 ${version}`,
    "",
    "1. 解压后直接运行本目录第一层的“茂一杀.exe”。",
    "2. 不要只复制 EXE，resources、assets、version.json、version.sig 必须和 EXE 放在一起。",
    "3. 如果使用离线更新包，请先关闭游戏，再运行“茂一杀更新器.exe”。",
    "4. 七牛热更新只更新资源；如果界面或主程序改动，必须使用完整包或离线更新包。",
    "",
  ].join("\r\n"),
  "utf8"
);

runPowerShell(
  "$ErrorActionPreference='Stop'; " +
    "$items=Get-ChildItem -LiteralPath $env:MAOYI_STAGE_DIR -Force; " +
    "Compress-Archive -Path $items.FullName -DestinationPath $env:MAOYI_ZIP_PATH -CompressionLevel Optimal"
);

const hasApk = fs.existsSync(apkSource);
if (hasApk) fs.copyFileSync(apkSource, apkPath);

const baseline = buildManifest(winDir);
const baselineDir = path.join(root, "release", "baselines", version);
fs.mkdirSync(baselineDir, { recursive: true });
fs.writeFileSync(path.join(baselineDir, "manifest.json"), `${JSON.stringify(baseline, null, 2)}\n`, "utf8");

const checksumTargets = hasApk ? [zipPath, apkPath] : [zipPath];
const checksums = checksumTargets
  .map((filePath) => `${sha256(filePath)}  ${path.basename(filePath)}`)
  .join("\n");
fs.writeFileSync(path.join(distribution, "SHA256SUMS.txt"), `${checksums}\n`, "utf8");
console.log(checksums);
console.log(`Clean Windows folder: ${cleanWinDir}`);
console.log(`Baseline manifest: ${path.join(baselineDir, "manifest.json")}`);

function runPowerShell(command) {
  const result = spawnSync("powershell.exe", ["-NoProfile", "-Command", command], {
    cwd: root,
    stdio: "inherit",
    env: { ...process.env, MAOYI_STAGE_DIR: cleanWinDir, MAOYI_ZIP_PATH: zipPath },
  });
  if (result.status !== 0) process.exit(result.status || 1);
}

function buildManifest(baseDir) {
  const files = [];
  walk(baseDir, (filePath) => {
    const relative = toManifestPath(path.relative(baseDir, filePath));
    files.push({
      path: relative,
      size: fs.statSync(filePath).size,
      sha256: sha256(filePath),
    });
  });
  files.sort((a, b) => a.path.localeCompare(b.path));
  return {
    appVersion: version,
    generatedAt: new Date().toISOString(),
    root: path.basename(baseDir),
    files,
  };
}

function walk(directory, onFile) {
  for (const entry of fs.readdirSync(directory, { withFileTypes: true })) {
    const fullPath = path.join(directory, entry.name);
    if (entry.isDirectory()) {
      walk(fullPath, onFile);
    } else if (entry.isFile()) {
      onFile(fullPath);
    }
  }
}

function toManifestPath(value) {
  return value.split(path.sep).join("/");
}

function sha256(filePath) {
  return crypto.createHash("sha256").update(fs.readFileSync(filePath)).digest("hex");
}
