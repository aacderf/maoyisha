const fs = require("node:fs");
const path = require("node:path");
const crypto = require("node:crypto");
const { spawnSync } = require("node:child_process");

const root = path.resolve(__dirname, "..");
const appName = "茂一杀";
const version = JSON.parse(fs.readFileSync(path.join(root, "package.json"), "utf8")).version;
const minimumVersion = process.env.MAOYI_UPDATER_TEST_MINIMUM || "1.3";
const updateDir = path.join(root, "release", "offline-update", `${appName}累积更新-${minimumVersion}-to-${version}-Windows-x64`);
const updaterExe = path.join(updateDir, `${appName}更新器.exe`);
const tmpRoot = path.join(root, "tmp", "offline-updater-test");

if (!fs.existsSync(updaterExe)) {
  throw new Error(`Missing updater package. Run: npm run release:offline-update -- --minimum ${minimumVersion} --to ${version}`);
}

fs.rmSync(tmpRoot, { recursive: true, force: true });
fs.mkdirSync(tmpRoot, { recursive: true });

for (const fromVersion of ["1.3", "1.3.1", "1.4", "1.4.1", "1.4.6"]) {
  const target = path.join(tmpRoot, `target-${fromVersion}`);
  fs.mkdirSync(target, { recursive: true });
  fs.writeFileSync(
    path.join(target, "version.json"),
    JSON.stringify({ appVersion: fromVersion, generatedAt: new Date().toISOString(), files: [] }, null, 2),
    "utf8"
  );

  run(updaterExe, ["--check", target], 0);
  run(updaterExe, ["--apply", target], 0);
  assertUpdatedTarget(target, fromVersion);
  run(updaterExe, ["--check", target], 0);

  fs.rmSync(path.join(target, "resources", "app.asar"), { force: true });
  run(updaterExe, ["--apply", target], 0);
  if (!fs.existsSync(path.join(target, "resources", "app.asar"))) {
    throw new Error(`Cumulative update did not restore deleted app.asar for ${fromVersion}`);
  }
}

for (const unsupportedVersion of ["1.2", "1.2.9"]) {
  const unsupported = path.join(tmpRoot, `unsupported-${unsupportedVersion}`);
  fs.mkdirSync(unsupported, { recursive: true });
  fs.writeFileSync(path.join(unsupported, "version.json"), JSON.stringify({ appVersion: unsupportedVersion }, null, 2), "utf8");
  run(updaterExe, ["--apply", unsupported], 1);
}

const missingVersion = path.join(tmpRoot, "missing-version");
fs.mkdirSync(missingVersion, { recursive: true });
run(updaterExe, ["--apply", missingVersion], 1);

console.log("Cumulative offline updater smoke test passed.");

function assertUpdatedTarget(target, fromVersion) {
  const updatedVersion = JSON.parse(fs.readFileSync(path.join(target, "version.json"), "utf8")).appVersion;
  if (updatedVersion !== version) throw new Error(`Expected version ${version}, got ${updatedVersion} from ${fromVersion}`);
  for (const required of [`${appName}.exe`, "resources/app.asar", "version.sig"]) {
    if (!fs.existsSync(path.join(target, ...required.split("/")))) throw new Error(`Updated target missing ${required}`);
  }
  const manifest = JSON.parse(fs.readFileSync(path.join(updateDir, "update-manifest.json"), "utf8"));
  for (const file of manifest.files.filter((item) => item.path === "version.json" || item.path === "resources/app.asar")) {
    const targetFile = path.join(target, ...file.path.split("/"));
    const hash = crypto.createHash("sha256").update(fs.readFileSync(targetFile)).digest("hex");
    if (hash !== file.sha256) throw new Error(`Hash mismatch after update: ${file.path}`);
  }
}

function run(command, args, expected) {
  const result = spawnSync(command, args, { cwd: path.dirname(command), encoding: "utf8" });
  if (expected === 1) {
    if (result.status === 0) {
      throw new Error(`Expected failure but command succeeded: ${command} ${args.join(" ")}`);
    }
    return;
  }
  if (result.status !== expected) {
    console.error(result.stdout);
    console.error(result.stderr);
    throw new Error(`Command failed (${result.status}): ${command} ${args.join(" ")}`);
  }
}
