const crypto = require("node:crypto");
const fs = require("node:fs");
const path = require("node:path");
const { spawnSync } = require("node:child_process");

const root = path.resolve(__dirname, "..");
const args = parseArgs(process.argv.slice(2));
const packageJson = JSON.parse(fs.readFileSync(path.join(root, "package.json"), "utf8"));
const appName = "茂一杀";
const minimumVersion = String(args.minimum || "").trim();
const fromVersion = String(args.from || minimumVersion || "").trim();
const toVersion = String(args.to || packageJson.version).trim();
const fromDir = args["from-dir"] ? path.resolve(String(args["from-dir"])) : "";
const cumulative = Boolean(minimumVersion);

if (!fromVersion) throw new Error("Missing --minimum <version> for cumulative update, or --from <version> for legacy diff update.");
if (!toVersion) throw new Error("Missing --to <version>.");

const winDir = path.join(root, "release", "win-unpacked");
const distribution = path.join(root, "release", "distribution");
const updateName = cumulative
  ? `${appName}累积更新-${minimumVersion}-to-${toVersion}-Windows-x64`
  : `${appName}离线更新-${fromVersion}-to-${toVersion}-Windows-x64`;
const updateRoot = path.join(root, "release", "offline-update", updateName);
const payloadRoot = path.join(updateRoot, "payload");
const zipPath = path.join(distribution, `${updateName}.zip`);
const updaterPublishDir = path.join(root, "tmp", "updater-publish");
const updaterSourceExe = path.join(updaterPublishDir, "MaoyishaUpdater.exe");
const updaterTargetExe = path.join(updateRoot, `${appName}更新器.exe`);

if (!fs.existsSync(path.join(winDir, `${appName}.exe`))) {
  throw new Error("Missing release/win-unpacked. Run npm run desktop:dist first.");
}

fs.mkdirSync(distribution, { recursive: true });
publishUpdater();

const currentManifest = buildFileManifest(winDir);
const oldBaselinePath = path.join(root, "release", "baselines", fromVersion, "manifest.json");
const oldManifest = cumulative ? maybeSaveOldBaseline() : loadOldManifest();
const diff = cumulative
  ? { files: currentManifest.files, deleteFiles: [] }
  : computeDiff(oldManifest, currentManifest);

fs.rmSync(updateRoot, { recursive: true, force: true });
fs.mkdirSync(payloadRoot, { recursive: true });
fs.copyFileSync(updaterSourceExe, updaterTargetExe);

for (const file of diff.files) {
  const source = safeJoin(winDir, file.path);
  const target = safeJoin(payloadRoot, file.path);
  fs.mkdirSync(path.dirname(target), { recursive: true });
  fs.copyFileSync(source, target);
}

const updateManifest = {
  minimumVersion: cumulative ? minimumVersion : undefined,
  fromVersions: [fromVersion],
  toVersion,
  generatedAt: new Date().toISOString(),
  files: diff.files,
  deleteFiles: diff.deleteFiles,
};
fs.writeFileSync(path.join(updateRoot, "update-manifest.json"), `${JSON.stringify(updateManifest, null, 2)}\n`, "utf8");
fs.writeFileSync(
  path.join(updateRoot, "README-累积更新说明.txt"),
  [
    cumulative
      ? `${appName}累积更新 ${minimumVersion}+ -> ${toVersion}`
      : `${appName}离线更新 ${fromVersion} -> ${toVersion}`,
    "",
    "1. 先完全关闭茂一杀。",
    `2. 运行“${appName}更新器.exe”。`,
    "3. 选择旧版茂一杀目录，也就是包含“茂一杀.exe”和“version.json”的目录。",
    "4. 点击“开始更新”。更新器不联网，只使用本文件夹 payload 内的文件。",
    "5. 累积更新包会按 SHA-256 自动检测缺失或不一致文件，已一致文件不会重复覆盖。",
    "6. 更新失败会自动回滚，并在游戏目录生成 .maoyisha-backup 备份。",
    "",
  ].join("\r\n"),
  "utf8"
);

runPowerShell(
  "$ErrorActionPreference='Stop'; " +
    "$items=Get-ChildItem -LiteralPath $env:MAOYI_UPDATE_DIR -Force; " +
    "Compress-Archive -Path $items.FullName -DestinationPath $env:MAOYI_UPDATE_ZIP -CompressionLevel Optimal"
);

const baselineDir = path.join(root, "release", "baselines", toVersion);
fs.mkdirSync(baselineDir, { recursive: true });
fs.writeFileSync(
  path.join(baselineDir, "manifest.json"),
  `${JSON.stringify({ appVersion: toVersion, generatedAt: new Date().toISOString(), root: path.basename(winDir), files: currentManifest.files }, null, 2)}\n`,
  "utf8"
);

upsertSha(zipPath);
console.log(`Offline update package: ${zipPath}`);
console.log(`Mode: ${cumulative ? "cumulative" : "legacy-diff"}`);
console.log(`Payload files: ${diff.files.length}`);
console.log(`Delete files: ${diff.deleteFiles.length}`);
if (!cumulative && !oldManifest) console.log(`No baseline found for ${fromVersion}; generated a full payload.`);

function maybeSaveOldBaseline() {
  if (!fromDir) return undefined;
  return loadOldManifest();
}

function loadOldManifest() {
  if (fromDir) {
    if (!fs.existsSync(fromDir) || !fs.statSync(fromDir).isDirectory()) {
      throw new Error(`--from-dir is not a directory: ${fromDir}`);
    }
    const versionPath = path.join(fromDir, "version.json");
    const exePath = path.join(fromDir, `${appName}.exe`);
    if (!fs.existsSync(versionPath) || !fs.existsSync(exePath)) {
      throw new Error(`--from-dir must point to a Windows game folder containing version.json and ${appName}.exe: ${fromDir}`);
    }
    const manifest = {
      appVersion: fromVersion,
      generatedAt: new Date().toISOString(),
      root: path.basename(fromDir),
      files: buildFileManifest(fromDir).files,
    };
    const baselineDir = path.dirname(oldBaselinePath);
    fs.mkdirSync(baselineDir, { recursive: true });
    fs.writeFileSync(oldBaselinePath, `${JSON.stringify(manifest, null, 2)}\n`, "utf8");
    console.log(`Old baseline from directory: ${fromDir}`);
    console.log(`Saved old baseline: ${oldBaselinePath}`);
    return manifest;
  }
  return fs.existsSync(oldBaselinePath)
    ? JSON.parse(fs.readFileSync(oldBaselinePath, "utf8"))
    : undefined;
}

function publishUpdater() {
  fs.rmSync(updaterPublishDir, { recursive: true, force: true });
  const result = spawnSync(
    "dotnet",
    [
      "publish",
      path.join(root, "apps", "updater", "MaoyishaUpdater.csproj"),
      "-c",
      "Release",
      "-r",
      "win-x64",
      "--self-contained",
      "true",
      "-o",
      updaterPublishDir,
      "/p:PublishSingleFile=true",
      "/p:EnableCompressionInSingleFile=true",
      "/p:IncludeNativeLibrariesForSelfExtract=true",
      "/p:PublishTrimmed=false",
    ],
    { cwd: root, stdio: "inherit" }
  );
  if (result.status !== 0) process.exit(result.status || 1);
  if (!fs.existsSync(updaterSourceExe)) throw new Error(`Updater build did not create ${updaterSourceExe}`);
}

function computeDiff(oldManifest, currentManifest) {
  if (!oldManifest || !Array.isArray(oldManifest.files)) {
    return { files: currentManifest.files, deleteFiles: [] };
  }
  const oldByPath = new Map(oldManifest.files.map((file) => [file.path, file.sha256]));
  const currentByPath = new Map(currentManifest.files.map((file) => [file.path, file]));
  const files = currentManifest.files.filter((file) => oldByPath.get(file.path) !== file.sha256);
  const deleteFiles = oldManifest.files
    .map((file) => file.path)
    .filter((key) => !currentByPath.has(key))
    .sort((a, b) => a.localeCompare(b));
  return { files, deleteFiles };
}

function buildFileManifest(baseDir) {
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
  return { files };
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

function upsertSha(filePath) {
  const shaPath = path.join(distribution, "SHA256SUMS.txt");
  const basename = path.basename(filePath);
  const line = `${sha256(filePath)}  ${basename}`;
  const lines = fs.existsSync(shaPath)
    ? fs.readFileSync(shaPath, "utf8").split(/\r?\n/).filter(Boolean).filter((item) => !item.endsWith(`  ${basename}`))
    : [];
  lines.push(line);
  fs.writeFileSync(shaPath, `${lines.join("\n")}\n`, "utf8");
}

function runPowerShell(command) {
  if (fs.existsSync(zipPath)) fs.rmSync(zipPath, { force: true });
  const result = spawnSync("powershell.exe", ["-NoProfile", "-Command", command], {
    cwd: root,
    stdio: "inherit",
    env: { ...process.env, MAOYI_UPDATE_DIR: updateRoot, MAOYI_UPDATE_ZIP: zipPath },
  });
  if (result.status !== 0) process.exit(result.status || 1);
}

function safeJoin(rootDir, relativePath) {
  const normalizedRoot = path.resolve(rootDir);
  const fullPath = path.resolve(normalizedRoot, relativePath.split("/").join(path.sep));
  if (fullPath !== normalizedRoot && !fullPath.startsWith(`${normalizedRoot}${path.sep}`)) {
    throw new Error(`Unsafe path: ${relativePath}`);
  }
  return fullPath;
}

function toManifestPath(value) {
  return value.split(path.sep).join("/");
}

function sha256(filePath) {
  return crypto.createHash("sha256").update(fs.readFileSync(filePath)).digest("hex");
}

function parseArgs(values) {
  const result = {};
  for (let index = 0; index < values.length; index += 1) {
    const item = values[index];
    if (!item.startsWith("--")) continue;
    const key = item.slice(2);
    const next = values[index + 1];
    if (next && !next.startsWith("--")) {
      result[key] = next;
      index += 1;
    } else {
      result[key] = true;
    }
  }
  return result;
}
