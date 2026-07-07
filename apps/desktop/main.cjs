const { app, BrowserWindow, ipcMain, safeStorage, session, shell } = require("electron");
const crypto = require("node:crypto");
const fs = require("node:fs");
const http = require("node:http");
const https = require("node:https");
const path = require("node:path");

if (process.env.MAOYI_USER_DATA_DIR) {
  app.setPath("userData", path.resolve(process.env.MAOYI_USER_DATA_DIR));
}

// ================== HOT UPDATE REMOTE BASE URL 需要替换的位置 ==================
// 七牛公开 Bucket 下载域名；七牛测试域名通常只支持 HTTP，例如：http://tgme05dcw.hn-bkt.clouddn.com
// 如果以后绑定自定义 HTTPS 域名，也可以改成 https://your-domain/path
const REMOTE_BASE_URL =
  process.env.MAOYI_HOT_UPDATE_BASE_URL || "http://tgme05dcw.hn-bkt.clouddn.com";
// =============================================================================

const DOWNLOAD_RETRY_COUNT = 3;
const MANIFEST_REQUEST_TIMEOUT_MS = 6_000;
const ASSET_REQUEST_TIMEOUT_MS = 30_000;

let mainWindow;
let webServer;
let webServerUrl;
let mediaPermissionConfigured = false;
let persistentStorageCache;

function persistentStoragePath() {
  return path.join(app.getPath("userData"), "persistent-storage.json");
}

function normalizeStorageKey(value) {
  const key = String(value ?? "");
  if (!key || key.length > 256) throw new Error("Invalid persistent storage key");
  return key;
}

function loadPersistentStorage() {
  if (persistentStorageCache) return persistentStorageCache;
  try {
    const parsed = JSON.parse(fs.readFileSync(persistentStoragePath(), "utf8"));
    persistentStorageCache =
      parsed && typeof parsed === "object" && !Array.isArray(parsed)
        ? Object.fromEntries(
            Object.entries(parsed)
              .filter(([key, value]) => key.length <= 256 && typeof value === "string")
              .map(([key, value]) => [key, value])
          )
        : {};
  } catch {
    persistentStorageCache = {};
  }
  return persistentStorageCache;
}

function savePersistentStorage() {
  const target = persistentStoragePath();
  const temp = `${target}.tmp`;
  fs.mkdirSync(path.dirname(target), { recursive: true });
  fs.writeFileSync(temp, JSON.stringify(loadPersistentStorage()), "utf8");
  try {
    fs.renameSync(temp, target);
  } catch {
    fs.rmSync(target, { force: true });
    fs.renameSync(temp, target);
  }
}

function logsRoot() {
  return app.getPath("logs");
}

function logPath() {
  return path.join(logsRoot(), "main.log");
}

function networkLogPath() {
  return path.join(logsRoot(), "network.log");
}

function serializeError(error) {
  if (error instanceof Error) return error.stack || error.message;
  return String(error);
}

function writeLog(level, message, detail = "") {
  const line = `[${new Date().toISOString()}] [${level}] ${message}${detail ? `\n${detail}` : ""}\n`;
  try {
    fs.mkdirSync(logsRoot(), { recursive: true });
    fs.appendFileSync(logPath(), line, "utf8");
  } catch {
    // Logging must never prevent the game from starting.
  }
}

function writeNetworkLog(value) {
  if (!value || typeof value !== "object") return;
  const entry = {
    timestamp: Number.isFinite(value.timestamp) ? value.timestamp : Date.now(),
    event: String(value.event || "").slice(0, 64),
    state: String(value.state || "").slice(0, 32),
    attempt: Number.isFinite(value.attempt) ? value.attempt : 0,
    roomCode: value.roomCode ? String(value.roomCode).slice(0, 32) : undefined,
    errorCode: Number.isFinite(value.errorCode) ? value.errorCode : undefined,
    operationCode: Number.isFinite(value.operationCode) ? value.operationCode : undefined,
    detail: value.detail ? String(value.detail).slice(0, 240) : undefined,
  };
  try {
    fs.mkdirSync(logsRoot(), { recursive: true });
    const target = networkLogPath();
    if (fs.existsSync(target) && fs.statSync(target).size > 1024 * 1024) {
      if (fs.existsSync(`${target}.1`)) fs.rmSync(`${target}.1`);
      fs.renameSync(target, `${target}.1`);
    }
    fs.appendFileSync(target, `${JSON.stringify(entry)}\n`, "utf8");
  } catch {
    // Diagnostics must never affect gameplay or startup.
  }
}

function appPath(...segments) {
  return path.join(app.getAppPath(), ...segments);
}

function installRoot() {
  return app.isPackaged ? path.dirname(app.getPath("exe")) : app.getAppPath();
}

function externalPath(...segments) {
  return path.join(installRoot(), ...segments);
}

const MIME_TYPES = {
  ".html": "text/html; charset=utf-8",
  ".js": "text/javascript; charset=utf-8",
  ".mjs": "text/javascript; charset=utf-8",
  ".css": "text/css; charset=utf-8",
  ".json": "application/json; charset=utf-8",
  ".png": "image/png",
  ".jpg": "image/jpeg",
  ".jpeg": "image/jpeg",
  ".webp": "image/webp",
  ".svg": "image/svg+xml",
  ".ico": "image/x-icon",
  ".wav": "audio/wav",
  ".mp3": "audio/mpeg",
  ".ogg": "audio/ogg",
  ".mp4": "video/mp4",
  ".wasm": "application/wasm",
};

function resolveDistFile(requestPath) {
  const distRoot = appPath("apps", "web", "dist");
  const cleanPath = decodeURIComponent(requestPath.split("?")[0]).replace(/^\/+/, "");
  const target = path.normalize(path.join(distRoot, cleanPath || "index.html"));
  if (!isPathInside(distRoot, target)) return undefined;
  return target;
}

function resolveExternalFile(requestPath) {
  let cleanPath = decodeURIComponent(requestPath.split("?")[0]).replace(/^\/+/, "");
  if (cleanPath.startsWith("assets/assets/")) {
    cleanPath = `assets/${cleanPath.slice("assets/assets/".length)}`;
  }
  if (cleanPath !== "version.json" && cleanPath !== "version.sig" && !cleanPath.startsWith("assets/")) {
    return undefined;
  }
  const root = installRoot();
  const target = path.normalize(path.join(root, cleanPath));
  if (!isPathInside(root, target)) return undefined;
  return target;
}

function isPathInside(root, target) {
  const relative = path.relative(root, target);
  return relative === "" || (!!relative && !relative.startsWith("..") && !path.isAbsolute(relative));
}

function serveStaticFile(filePath, response, cacheExternal = false) {
  fs.readFile(filePath, (error, data) => {
    if (error) {
      response.writeHead(404, { "Content-Type": "text/plain; charset=utf-8" });
      response.end("Not found");
      return;
    }
    const ext = path.extname(filePath).toLowerCase();
    response.writeHead(200, {
      "Content-Type": MIME_TYPES[ext] || "application/octet-stream",
      "Cache-Control": ext === ".html" || cacheExternal ? "no-store" : "public, max-age=31536000, immutable",
    });
    response.end(data);
  });
}

function startLocalWebServer() {
  if (webServerUrl) return Promise.resolve(webServerUrl);

  const distRoot = appPath("apps", "web", "dist");
  webServer = http.createServer((request, response) => {
    const url = new URL(request.url || "/", "http://localhost");
    const external = resolveExternalFile(url.pathname);
    if (external && fs.existsSync(external) && fs.statSync(external).isFile()) {
      serveStaticFile(external, response, true);
      return;
    }

    const requested = resolveDistFile(url.pathname);
    if (!requested) {
      response.writeHead(403, { "Content-Type": "text/plain; charset=utf-8" });
      response.end("Forbidden");
      return;
    }

    fs.stat(requested, (statError, stat) => {
      if (!statError && stat.isFile()) {
        serveStaticFile(requested, response);
        return;
      }

      if (path.extname(requested)) {
        response.writeHead(404, { "Content-Type": "text/plain; charset=utf-8" });
        response.end("Not found");
        return;
      }

      serveStaticFile(path.join(distRoot, "index.html"), response);
    });
  });

  return new Promise((resolve, reject) => {
    webServer.once("error", reject);
    webServer.listen(0, "localhost", () => {
      const address = webServer.address();
      if (!address || typeof address === "string") {
        reject(new Error("Failed to start local web server"));
        return;
      }
      webServerUrl = `http://localhost:${address.port}/`;
      resolve(webServerUrl);
    });
  });
}

async function createWindow() {
  writeLog("INFO", "Creating main window", `packaged=${app.isPackaged}`);
  configureMediaPermission();
  mainWindow = new BrowserWindow({
    width: 1360,
    height: 860,
    minWidth: 1120,
    minHeight: 720,
    backgroundColor: "#141511",
    title: "茂一杀",
    autoHideMenuBar: true,
    webPreferences: {
      preload: path.join(__dirname, "preload.cjs"),
      contextIsolation: true,
      nodeIntegration: false,
      sandbox: true,
    },
  });
  const gameWindow = mainWindow;

  mainWindow.webContents.setWindowOpenHandler(({ url }) => {
    void shell.openExternal(url);
    return { action: "deny" };
  });
  mainWindow.once("ready-to-show", () => writeLog("INFO", "Main window is ready to show"));
  mainWindow.on("unresponsive", () => writeLog("ERROR", "Main window became unresponsive"));
  mainWindow.on("responsive", () => writeLog("INFO", "Main window became responsive"));
  mainWindow.webContents.on("did-fail-load", (_event, errorCode, errorDescription, validatedUrl, isMainFrame) => {
    if (!isMainFrame || errorCode === -3) return;
    writeLog("ERROR", "Renderer failed to load", `${errorCode} ${errorDescription}\n${validatedUrl}`);
  });
  mainWindow.webContents.on("render-process-gone", (_event, details) => {
    writeLog("ERROR", "Renderer process exited", JSON.stringify(details));
    if (mainWindow === gameWindow) mainWindow = undefined;
    setTimeout(() => {
      void showStartupFailure(new Error(`渲染进程异常退出：${details.reason}`)).finally(() => {
        if (!gameWindow.isDestroyed()) gameWindow.destroy();
      });
    }, 300);
  });

  await showHotUpdateScreen();
  await runHotUpdate();
  const localUrl = await startLocalWebServer();
  await mainWindow.loadURL(localUrl);
  writeLog("INFO", "Application page loaded", localUrl);
}

function configureMediaPermission() {
  if (mediaPermissionConfigured) return;
  mediaPermissionConfigured = true;
  const isTrustedLocalPage = (url) => {
    try {
      const parsed = new URL(url);
      return parsed.protocol === "http:" && (parsed.hostname === "127.0.0.1" || parsed.hostname === "localhost");
    } catch {
      return false;
    }
  };
  session.defaultSession.setPermissionCheckHandler((_webContents, permission, requestingOrigin) => {
    return permission === "media" && isTrustedLocalPage(requestingOrigin);
  });
  session.defaultSession.setPermissionRequestHandler((webContents, permission, callback, details) => {
    const mediaTypes = Array.isArray(details?.mediaTypes) ? details.mediaTypes : [];
    const audioOnly = mediaTypes.length === 0 || (mediaTypes.includes("audio") && !mediaTypes.includes("video"));
    callback(permission === "media" && audioOnly && isTrustedLocalPage(webContents.getURL()));
  });
}

async function showHotUpdateScreen() {
  const html = `<!doctype html>
<html lang="zh-CN">
<head>
  <meta charset="utf-8" />
  <meta name="viewport" content="width=device-width,initial-scale=1" />
  <title>茂一杀更新</title>
  <style>
    html,body{margin:0;height:100%;background:#111;color:#f5ead0;font-family:"Microsoft YaHei",system-ui,sans-serif}
    body{display:grid;place-items:center;background:radial-gradient(circle at center,#2b2619,#080807 70%)}
    .box{width:min(520px,80vw);padding:28px;border:1px solid #8b6b2e;border-radius:10px;background:rgba(18,18,14,.88);box-shadow:0 24px 80px rgba(0,0,0,.55)}
    h1{margin:0 0 10px;font-size:28px}
    p{margin:0 0 16px;color:#c9bfa7}
    .bar{height:12px;border:1px solid #8b6b2e;border-radius:999px;overflow:hidden;background:#0b0c09}
    .fill{height:100%;width:0;background:linear-gradient(90deg,#2fbf8b,#e2bd56);transition:width .2s ease}
    .detail{margin-top:12px;font-size:13px;color:#b7ad97;white-space:pre-wrap}
  </style>
</head>
<body>
  <section class="box">
    <h1>茂一杀</h1>
    <p id="status">检查更新中</p>
    <div class="bar"><div id="fill" class="fill"></div></div>
    <div id="detail" class="detail"></div>
  </section>
  <script>
    window.__setHotUpdateStatus = (status, percent, detail) => {
      document.getElementById("status").textContent = status || "";
      document.getElementById("fill").style.width = Math.max(0, Math.min(100, percent || 0)) + "%";
      document.getElementById("detail").textContent = detail || "";
    };
  </script>
</body>
</html>`;
  await mainWindow.loadURL(`data:text/html;charset=utf-8,${encodeURIComponent(html)}`);
}

async function setHotUpdateStatus(status, percent = 0, detail = "") {
  if (!mainWindow || mainWindow.isDestroyed()) return;
  const script = `window.__setHotUpdateStatus(${JSON.stringify(status)}, ${Number(percent) || 0}, ${JSON.stringify(detail)})`;
  await mainWindow.webContents.executeJavaScript(script).catch(() => undefined);
}

async function runHotUpdate() {
  if (!isRemoteConfigured()) {
    await setHotUpdateStatus("无更新", 100, "未配置七牛下载域名，使用本地资源启动。");
    await delay(350);
    return;
  }

  try {
    await setHotUpdateStatus("检查更新中", 4, REMOTE_BASE_URL);
    const remoteManifestText = (
      await requestBuffer(remoteUrl("version.json"), {}, MANIFEST_REQUEST_TIMEOUT_MS)
    ).toString("utf8");
    const remoteSignatureText = (
      await requestBuffer(remoteUrl("version.sig"), {}, MANIFEST_REQUEST_TIMEOUT_MS)
    ).toString("utf8").trim();
    verifyManifestSignature(remoteManifestText, remoteSignatureText);

    const remoteManifest = JSON.parse(remoteManifestText);
    const localManifest = await readJsonSafe(externalPath("version.json"));
    if (isManifestRollback(remoteManifest, localManifest)) {
      await setHotUpdateStatus(
        "无更新",
        100,
        `已忽略较旧的远端清单：${remoteManifest.generatedAt || "未知时间"}`
      );
      await delay(500);
      return;
    }
    const files = selectChangedFiles(remoteManifest, localManifest);

    if (files.length === 0) {
      await setHotUpdateStatus("无更新", 100, `当前规则版本：${remoteManifest.logicVersion || "未知"}`);
      await delay(350);
      return;
    }

    const totalBytes = files.reduce((sum, file) => sum + Number(file.size || 0), 0);
    let completedBytes = 0;
    await cleanEmptyTempRoot();

    for (const file of files) {
      const tempFile = externalPath("temp", file.path);
      await downloadAndVerifyFile(file, tempFile, totalBytes, (currentFileBytes) => {
        const downloaded = completedBytes + currentFileBytes;
        const percent = totalBytes > 0 ? Math.round((downloaded / totalBytes) * 100) : 100;
        void setHotUpdateStatus("下载中", percent, `${formatBytes(downloaded)} / ${formatBytes(totalBytes)}\n${file.path}`);
      });
      completedBytes += Number(file.size || 0);
    }

    await setHotUpdateStatus("校验资源", 96, "正在覆盖本地 assets。");
    for (const file of files) {
      await moveFile(externalPath("temp", file.path), externalPath(file.path));
    }
    await fs.promises.writeFile(externalPath("version.json"), remoteManifestText, "utf8");
    await fs.promises.writeFile(externalPath("version.sig"), `${remoteSignatureText}\n`, "utf8");
    await fs.promises.rm(externalPath("temp"), { recursive: true, force: true });

    await setHotUpdateStatus("更新完成", 100, `规则版本：${remoteManifest.logicVersion || "未知"}`);
    await delay(500);
  } catch (error) {
    console.error("[HotUpdate] skipped", error);
    writeLog("WARN", "Hot update skipped; using local resources", serializeError(error));
    const message = error instanceof Error ? error.message : "未知错误";
    await setHotUpdateStatus("更新失败，使用本地资源启动", 100, message);
    await delay(800);
  }
}

function isRemoteConfigured() {
  return /^https?:\/\//i.test(REMOTE_BASE_URL) && !REMOTE_BASE_URL.includes("你的七牛下载域名");
}

function remoteUrl(key) {
  const base = REMOTE_BASE_URL.replace(/\/+$/, "");
  const encoded = key
    .split("/")
    .filter(Boolean)
    .map((part) => encodeURIComponent(part))
    .join("/");
  return `${base}/${encoded}`;
}

function requestBuffer(url, headers = {}, timeoutMs = ASSET_REQUEST_TIMEOUT_MS) {
  return new Promise((resolve, reject) => {
    const request = (url.startsWith("https:") ? https : http).request(url, { headers, timeout: timeoutMs }, (response) => {
      const status = response.statusCode || 0;
      if (status >= 300 && status < 400 && response.headers.location) {
        response.resume();
        requestBuffer(new URL(response.headers.location, url).toString(), headers, timeoutMs).then(resolve, reject);
        return;
      }
      if (status < 200 || status >= 300) {
        response.resume();
        reject(new Error(`HTTP ${status}: ${url}`));
        return;
      }
      const chunks = [];
      response.on("data", (chunk) => chunks.push(Buffer.from(chunk)));
      response.on("end", () => resolve(Buffer.concat(chunks)));
    });
    request.on("timeout", () => {
      request.destroy(new Error(`Request timeout after ${timeoutMs}ms: ${url}`));
    });
    request.on("error", reject);
    request.end();
  });
}

function selectChangedFiles(remoteManifest, localManifest) {
  const remoteFiles = Array.isArray(remoteManifest?.files) ? remoteManifest.files : [];
  const localFiles = new Map((Array.isArray(localManifest?.files) ? localManifest.files : []).map((file) => [file.path, file]));
  return remoteFiles.filter((file) => {
    if (!isSafeAssetPath(file.path)) return false;
    const local = localFiles.get(file.path);
    const localFile = externalPath(file.path);
    return !local || local.md5 !== file.md5 || Number(local.size) !== Number(file.size) || !fs.existsSync(localFile);
  });
}

// A stale Qiniu manifest must never downgrade resources shipped with a newer EXE.
function isManifestRollback(remoteManifest, localManifest) {
  if (!localManifest || !remoteManifest) return false;
  const versionOrder = compareVersion(String(remoteManifest.appVersion || "0"), String(localManifest.appVersion || "0"));
  if (versionOrder < 0) return true;
  if (versionOrder > 0) return false;
  const remoteTime = Date.parse(String(remoteManifest.generatedAt || ""));
  const localTime = Date.parse(String(localManifest.generatedAt || ""));
  return Number.isFinite(remoteTime) && Number.isFinite(localTime) && remoteTime < localTime;
}

function compareVersion(left, right) {
  const a = left.split(".").map((part) => Number.parseInt(part, 10) || 0);
  const b = right.split(".").map((part) => Number.parseInt(part, 10) || 0);
  const length = Math.max(a.length, b.length);
  for (let index = 0; index < length; index += 1) {
    const difference = (a[index] || 0) - (b[index] || 0);
    if (difference !== 0) return difference > 0 ? 1 : -1;
  }
  return 0;
}

function isSafeAssetPath(filePath) {
  return typeof filePath === "string" && filePath.startsWith("assets/") && !filePath.includes("..") && !path.isAbsolute(filePath);
}

async function downloadAndVerifyFile(file, tempFile, totalBytes, onProgress) {
  for (let attempt = 1; attempt <= DOWNLOAD_RETRY_COUNT; attempt += 1) {
    try {
      await downloadFile(file, tempFile, onProgress);
      const md5 = await md5File(tempFile);
      if (md5 !== file.md5) throw new Error(`MD5 mismatch for ${file.path}`);
      return;
    } catch (error) {
      if (attempt === DOWNLOAD_RETRY_COUNT) throw error;
      await setHotUpdateStatus("下载重试中", Math.max(1, Math.round((attempt / DOWNLOAD_RETRY_COUNT) * 10)), `${file.path}\n第 ${attempt + 1} 次重试`);
      await delay(300);
    }
  }
}

function downloadFile(file, tempFile, onProgress) {
  return new Promise(async (resolve, reject) => {
    await fs.promises.mkdir(path.dirname(tempFile), { recursive: true }).catch(reject);
    const expectedSize = Number(file.size || 0);
    const existingSize = fs.existsSync(tempFile) ? fs.statSync(tempFile).size : 0;
    const canResume = existingSize > 0 && existingSize < expectedSize;
    const headers = canResume ? { Range: `bytes=${existingSize}-` } : {};
    let written = canResume ? existingSize : 0;

    const request = (remoteUrl(file.path).startsWith("https:") ? https : http).request(remoteUrl(file.path), { headers, timeout: ASSET_REQUEST_TIMEOUT_MS }, (response) => {
      const status = response.statusCode || 0;
      if (status >= 300 && status < 400 && response.headers.location) {
        response.resume();
        reject(new Error(`Redirect is not supported for asset file: ${file.path}`));
        return;
      }
      if (status !== 200 && status !== 206) {
        response.resume();
        reject(new Error(`HTTP ${status}: ${file.path}`));
        return;
      }
      const append = status === 206 && canResume;
      if (!append) written = 0;
      const stream = fs.createWriteStream(tempFile, { flags: append ? "a" : "w" });
      response.on("data", (chunk) => {
        written += chunk.length;
        onProgress(Math.min(expectedSize, written));
      });
      response.pipe(stream);
      stream.on("finish", () => stream.close(resolve));
      stream.on("error", reject);
    });
    request.on("timeout", () => request.destroy(new Error(`Download timeout: ${file.path}`)));
    request.on("error", reject);
    request.end();
  });
}

function md5File(filePath) {
  return new Promise((resolve, reject) => {
    const hash = crypto.createHash("md5");
    const stream = fs.createReadStream(filePath);
    stream.on("data", (chunk) => hash.update(chunk));
    stream.on("end", () => resolve(hash.digest("hex")));
    stream.on("error", reject);
  });
}

async function moveFile(from, to) {
  await fs.promises.mkdir(path.dirname(to), { recursive: true });
  await fs.promises.rm(to, { force: true });
  try {
    await fs.promises.rename(from, to);
  } catch {
    await fs.promises.copyFile(from, to);
    await fs.promises.rm(from, { force: true });
  }
}

async function readJsonSafe(filePath) {
  try {
    return JSON.parse(await fs.promises.readFile(filePath, "utf8"));
  } catch {
    return undefined;
  }
}

function verifyManifestSignature(manifestText, signatureText) {
  const publicKeyPath = appPath("apps", "desktop", "hot_update_public_key.pem");
  if (!fs.existsSync(publicKeyPath)) {
    throw new Error("热更公钥缺失，请先运行 build_manifest.py 并重新打包。");
  }
  const publicKey = fs.readFileSync(publicKeyPath, "utf8");
  const signature = Buffer.from(signatureText, "base64");
  const ok = crypto.verify("sha256", Buffer.from(manifestText, "utf8"), publicKey, signature);
  if (!ok) throw new Error("version.sig 校验失败，已拒绝本次热更。");
}

async function cleanEmptyTempRoot() {
  await fs.promises.mkdir(externalPath("temp"), { recursive: true });
}

function formatBytes(value) {
  const bytes = Number(value || 0);
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`;
  return `${(bytes / 1024 / 1024).toFixed(1)} MB`;
}

function delay(ms) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

async function showStartupFailure(error) {
  writeLog("ERROR", "Startup recovery screen shown", serializeError(error));
  if (!mainWindow || mainWindow.isDestroyed()) {
    mainWindow = new BrowserWindow({
      width: 760,
      height: 520,
      minWidth: 620,
      minHeight: 440,
      backgroundColor: "#090b09",
      title: "茂一杀启动恢复",
      autoHideMenuBar: true,
      webPreferences: {
        preload: path.join(__dirname, "preload.cjs"),
        contextIsolation: true,
        nodeIntegration: false,
        sandbox: true,
      },
    });
  }
  const detail = error instanceof Error ? error.message : String(error);
  const recoveryLoaded = await mainWindow
    .loadFile(appPath("apps", "desktop", "recovery.html"), { query: { detail: detail.slice(0, 500) } })
    .then(() => true)
    .catch((loadError) => {
      writeLog("ERROR", "Startup recovery screen failed to load", serializeError(loadError));
      return false;
    });
  if (recoveryLoaded) writeLog("INFO", "Startup recovery screen loaded");
  if (!mainWindow.isVisible()) mainWindow.show();
}

ipcMain.on("desktop:restart", () => {
  writeLog("INFO", "Restart requested from recovery screen");
  app.relaunch();
  app.exit(0);
});

ipcMain.on("desktop:quit", () => {
  writeLog("INFO", "Quit requested from renderer");
  app.quit();
});

ipcMain.handle("desktop:open-logs", async () => {
  fs.mkdirSync(logsRoot(), { recursive: true });
  return shell.openPath(logsRoot());
});

ipcMain.handle("desktop:can-encrypt-text", () => {
  try {
    return Boolean(safeStorage?.isEncryptionAvailable?.());
  } catch {
    return false;
  }
});

ipcMain.handle("desktop:encrypt-text", (_event, value) => {
  if (!safeStorage?.isEncryptionAvailable?.()) {
    throw new Error("当前系统不可用安全存储，已改为只记住邮箱。");
  }
  return safeStorage.encryptString(String(value ?? "")).toString("base64");
});

ipcMain.handle("desktop:decrypt-text", (_event, value) => {
  if (!safeStorage?.isEncryptionAvailable?.()) {
    throw new Error("当前系统不可用安全存储。");
  }
  return safeStorage.decryptString(Buffer.from(String(value ?? ""), "base64"));
});

ipcMain.on("desktop:storage-get", (event, rawKey) => {
  try {
    const key = normalizeStorageKey(rawKey);
    const storage = loadPersistentStorage();
    event.returnValue = Object.prototype.hasOwnProperty.call(storage, key) ? storage[key] : null;
  } catch (error) {
    writeLog("ERROR", "Persistent storage read failed", serializeError(error));
    event.returnValue = null;
  }
});

ipcMain.on("desktop:storage-set", (event, rawKey, rawValue) => {
  try {
    const key = normalizeStorageKey(rawKey);
    const value = String(rawValue ?? "");
    if (Buffer.byteLength(value, "utf8") > 2 * 1024 * 1024) {
      throw new Error("Persistent storage value is too large");
    }
    loadPersistentStorage()[key] = value;
    savePersistentStorage();
    event.returnValue = true;
  } catch (error) {
    writeLog("ERROR", "Persistent storage write failed", serializeError(error));
    event.returnValue = false;
  }
});

ipcMain.on("desktop:storage-remove", (event, rawKey) => {
  try {
    const key = normalizeStorageKey(rawKey);
    delete loadPersistentStorage()[key];
    savePersistentStorage();
    event.returnValue = true;
  } catch (error) {
    writeLog("ERROR", "Persistent storage delete failed", serializeError(error));
    event.returnValue = false;
  }
});

ipcMain.on("desktop:network-diagnostic", (_event, value) => {
  writeNetworkLog(value);
});

process.on("uncaughtException", (error) => {
  writeLog("ERROR", "Uncaught main-process exception", serializeError(error));
  void showStartupFailure(error);
});

process.on("unhandledRejection", (error) => {
  writeLog("ERROR", "Unhandled main-process rejection", serializeError(error));
});

const lock = app.requestSingleInstanceLock();
if (!lock) {
  writeLog("INFO", "Second instance exited because the lock is held");
  app.quit();
} else {
  app.on("second-instance", () => {
    if (!mainWindow) return;
    if (mainWindow.isMinimized()) mainWindow.restore();
    if (!mainWindow.isVisible()) mainWindow.show();
    mainWindow.focus();
    writeLog("INFO", "Existing window focused by second-instance request");
  });

  app.whenReady().then(async () => {
    try {
      await createWindow();
    } catch (error) {
      await showStartupFailure(error);
    }

    app.on("activate", () => {
      if (BrowserWindow.getAllWindows().length === 0) {
        void createWindow().catch(showStartupFailure);
      }
    });
  });
}

app.on("window-all-closed", () => {
  if (process.platform !== "darwin") {
    app.quit();
  }
});

app.on("before-quit", () => {
  if (webServer) {
    webServer.close();
    webServer = undefined;
    webServerUrl = undefined;
  }
});
