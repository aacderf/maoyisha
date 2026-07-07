const fs = require("node:fs");
const http = require("node:http");
const https = require("node:https");
const path = require("node:path");

const root = path.resolve(__dirname, "..");
const out = path.join(root, "release", "qiniu-hot-update");
const remoteBase =
  process.env.MAOYI_HOT_UPDATE_BASE_URL || "http://tgme05dcw.hn-bkt.clouddn.com";
const localManifest = JSON.parse(fs.readFileSync(path.join(root, "version.json"), "utf8"));

function fetchJson(url) {
  return new Promise((resolve, reject) => {
    const transport = url.startsWith("https:") ? https : http;
    const request = transport.get(url, { timeout: 8_000 }, (response) => {
      if (response.statusCode !== 200) {
        response.resume();
        reject(new Error(`HTTP ${response.statusCode}`));
        return;
      }
      const chunks = [];
      response.on("data", (chunk) => chunks.push(chunk));
      response.on("end", () => {
        try {
          resolve(JSON.parse(Buffer.concat(chunks).toString("utf8")));
        } catch (error) {
          reject(error);
        }
      });
    });
    request.on("timeout", () => request.destroy(new Error("request timeout")));
    request.on("error", reject);
  });
}

function copyKey(key) {
  const source = path.join(root, ...key.split("/"));
  const target = path.join(out, ...key.split("/"));
  fs.mkdirSync(path.dirname(target), { recursive: true });
  fs.copyFileSync(source, target);
}

async function main() {
  let remoteManifest;
  let comparisonNote;
  try {
    remoteManifest = await fetchJson(`${remoteBase}/version.json?compare=${Date.now()}`);
    comparisonNote = `Remote baseline: ${remoteManifest.appVersion || "unknown"} / ${remoteManifest.generatedAt || "unknown"}`;
  } catch (error) {
    remoteManifest = { files: [] };
    comparisonNote = `Remote manifest unavailable; safe fallback includes every asset (${error.message}).`;
  }

  const remoteByPath = new Map(
    (Array.isArray(remoteManifest.files) ? remoteManifest.files : []).map((file) => [
      file.path,
      file.md5,
    ])
  );
  const changedAssets = localManifest.files
    .filter((file) => file.path.startsWith("assets/") && remoteByPath.get(file.path) !== file.md5)
    .map((file) => file.path)
    .sort((a, b) => a.localeCompare(b));
  const appContentKey = "assets/config/app-content.json";
  const orderedAssets = changedAssets.filter((key) => key !== appContentKey);
  if (changedAssets.includes(appContentKey)) orderedAssets.push(appContentKey);
  const uploadKeys = [...orderedAssets, "version.json", "version.sig"];

  fs.rmSync(out, { recursive: true, force: true });
  fs.mkdirSync(out, { recursive: true });
  for (const key of uploadKeys) copyKey(key);

  const listPath = path.join(out, `qiniu-upload-list-${localManifest.appVersion}.txt`);
  fs.writeFileSync(
    listPath,
    [
      `茂一杀 ${localManifest.appVersion} 七牛差异上传清单`,
      comparisonNote,
      "",
      ...uploadKeys.map((key, index) => `${index + 1}. ${key}`),
      "",
      "上传后刷新以上对象的 CDN 缓存；version.sig 必须最后上传。",
      "不要上传 EXE、APK、私钥或签名密码。",
      "",
    ].join("\n"),
    "utf8"
  );

  console.log(`Qiniu delta package prepared: ${out}`);
  console.log(`Changed assets: ${changedAssets.length}`);
  console.log(`Upload list: ${listPath}`);
}

main().catch((error) => {
  console.error(error);
  process.exit(1);
});
