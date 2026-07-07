const fs = require("node:fs");
const path = require("node:path");
const { spawnSync } = require("node:child_process");

const root = path.resolve(__dirname, "..");
const appVersion = JSON.parse(fs.readFileSync(path.join(root, "package.json"), "utf8")).version;
const androidDir = path.join(root, "android");
const gradle = path.join(androidDir, "gradlew.bat");
const signingFile =
  process.env.MAOYI_ANDROID_SIGNING_FILE ||
  path.join(path.parse(root).root, "Keys", "maoyisha-android-signing.json");
const buildEnv = { ...process.env };

if (!buildEnv.MAOYI_ANDROID_KEYSTORE && fs.existsSync(signingFile)) {
  const signing = JSON.parse(
    fs.readFileSync(signingFile, "utf8").replace(/^\uFEFF/, "")
  );
  buildEnv.MAOYI_ANDROID_KEYSTORE = signing.keystore;
  buildEnv.MAOYI_ANDROID_KEY_ALIAS = signing.alias;
  buildEnv.MAOYI_ANDROID_KEYSTORE_PASSWORD = signing.storePassword;
  buildEnv.MAOYI_ANDROID_KEY_PASSWORD = signing.keyPassword;
}

const signedRelease =
  buildEnv.MAOYI_ANDROID_KEYSTORE &&
  buildEnv.MAOYI_ANDROID_KEY_ALIAS &&
  buildEnv.MAOYI_ANDROID_KEYSTORE_PASSWORD &&
  buildEnv.MAOYI_ANDROID_KEY_PASSWORD;

if (!fs.existsSync(gradle)) {
  throw new Error("Android project is missing. Run npm run android:add first.");
}

if (!signedRelease) {
  throw new Error(
    `Android release signing is not configured. Set MAOYI_ANDROID_* or create ${signingFile}.`
  );
}

const result = spawnSync(gradle, ["clean", "assembleRelease"], {
  cwd: androidDir,
  stdio: "inherit",
  shell: true,
  env: buildEnv,
});
if (result.status !== 0) process.exit(result.status || 1);

const source = path.join(
  androidDir,
  "app",
  "build",
  "outputs",
  "apk",
  "release",
  "app-release.apk"
);
const outputDir = path.join(root, "release", "android");
const output = path.join(outputDir, `\u8302\u4e00\u6740-${appVersion}.apk`);
fs.rmSync(outputDir, { recursive: true, force: true });
fs.mkdirSync(outputDir, { recursive: true });
fs.copyFileSync(source, output);
console.log(`Android APK created: ${output}`);
