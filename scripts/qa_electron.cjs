const fs = require("node:fs");
const path = require("node:path");
const { spawn } = require("node:child_process");
const { chromium } = require("playwright");

const root = path.resolve(__dirname, "..");
const exe = path.join(root, "release", "win-unpacked", "茂一杀.exe");
const qaUserData = path.join(root, "tmp", "electron-qa-user-data");
const logs = path.join(qaUserData, "logs");

function launch(port, extraEnv = {}) {
  return spawn(exe, [`--remote-debugging-port=${port}`], {
    cwd: path.dirname(exe),
    windowsHide: true,
    stdio: "ignore",
    env: { ...process.env, MAOYI_USER_DATA_DIR: qaUserData, ...extraEnv },
  });
}

async function connect(port, timeoutMs = 10_000) {
  const startedAt = Date.now();
  let lastError;
  while (Date.now() - startedAt < timeoutMs) {
    try {
      return await chromium.connectOverCDP(`http://127.0.0.1:${port}`);
    } catch (error) {
      lastError = error;
      await new Promise((resolve) => setTimeout(resolve, 200));
    }
  }
  throw lastError || new Error("Electron DevTools endpoint timed out");
}

async function stop(child) {
  if (!child || child.exitCode !== null) return;
  child.kill();
  await new Promise((resolve) => {
    const timer = setTimeout(resolve, 2_000);
    child.once("exit", () => {
      clearTimeout(timer);
      resolve();
    });
  });
}

async function waitForPage(browser, text, timeoutMs = 10_000) {
  const startedAt = Date.now();
  while (Date.now() - startedAt < timeoutMs) {
    const pages = browser.contexts().flatMap((context) => context.pages());
    for (const page of pages) {
      try {
        if (
          /^http:\/\/localhost:\d+\//.test(page.url()) ||
          (await page.locator("input[type='email']").count()) > 0 ||
          (await page.locator("body").innerText()).includes(text)
        ) return page;
      } catch {
        // The target may be replaced while the renderer recovery page loads.
      }
    }
    await new Promise((resolve) => setTimeout(resolve, 200));
  }
  throw new Error(`Electron page did not contain: ${text}`);
}

(async () => {
  if (!fs.existsSync(exe)) throw new Error(`Missing packaged EXE: ${exe}`);
  fs.rmSync(qaUserData, { recursive: true, force: true });
  let app;
  let browser;
  const results = {};
  try {
    const coldStartAt = Date.now();
    app = launch(9321, { MAOYI_HOT_UPDATE_BASE_URL: "http://127.0.0.1:9" });
    browser = await connect(9321);
    const page = await waitForPage(browser, "邮箱登录");
    results.offlineColdStartMs = Date.now() - coldStartAt;
    let currentPage = page;
    if (results.offlineColdStartMs > 8_000) throw new Error("offline cold start exceeded 8 seconds");

    results.persistenceSeed = await page.evaluate(async () => {
      const bridge = window.desktopApp;
      if (!bridge?.storageSet || !bridge.encryptText) return false;
      const passwordCipher = await bridge.encryptText("qa-password-159");
      bridge.storageSet("maoyisha.settings", JSON.stringify({
        customCursorEnabled: true,
        cursorTheme: "luoxiaohei",
        cursorSize: 1.35,
        cursorTrail: "sakura",
      }));
      bridge.storageSet("maoyisha.rememberCredentials", JSON.stringify({
        version: 2,
        rememberEmail: true,
        rememberPassword: true,
        email: "qa159@example.com",
        passwordCipher,
      }));
      return true;
    });
    if (!results.persistenceSeed) throw new Error("desktop persistence bridge was unavailable");

    await page.evaluate(() => {
      window.desktopApp?.reportNetworkDiagnostic?.({
        timestamp: Date.now(),
        event: "electron-qa",
        state: "connected",
        attempt: 0,
        roomCode: "QA-ROOM",
      });
    });

    await currentPage.evaluate(() => window.desktopApp?.quit?.());
    await new Promise((resolve) => {
      const timer = setTimeout(resolve, 4_000);
      app.once("exit", () => {
        clearTimeout(timer);
        resolve();
      });
    });
    await browser.close().catch(() => undefined);
    browser = undefined;
    await stop(app);
    app = undefined;

    const gracefulRestartAt = Date.now();
    app = launch(9322, { MAOYI_HOT_UPDATE_BASE_URL: "http://127.0.0.1:9" });
    browser = await connect(9322);
    currentPage = await waitForPage(browser, "閭鐧诲綍");
    results.gracefulRestartMs = Date.now() - gracefulRestartAt;
    await currentPage.waitForFunction(() => {
      const password = document.querySelector("input[type='password']");
      return password && password.value === "qa-password-159";
    }, null, { timeout: 5_000 });
    results.gracefulPersistence = true;

    const second = spawn(exe, [], {
      cwd: path.dirname(exe),
      windowsHide: true,
      stdio: "ignore",
      env: { ...process.env, MAOYI_USER_DATA_DIR: qaUserData },
    });
    const secondExitCode = await new Promise((resolve) => {
      const timer = setTimeout(() => resolve("timeout"), 4_000);
      second.once("exit", (code) => {
        clearTimeout(timer);
        resolve(code);
      });
    });
    results.secondInstanceExitCode = secondExitCode;
    if (secondExitCode === "timeout") second.kill();

    const cdp = await currentPage.context().newCDPSession(currentPage);
    const mainLogPath = path.join(logs, "main.log");
    const recoveryLoadedBefore = fs.existsSync(mainLogPath)
      ? fs.readFileSync(mainLogPath, "utf8").split("Startup recovery screen loaded").length - 1
      : 0;
    await cdp.send("Page.crash").catch(() => undefined);
    await new Promise((resolve) => setTimeout(resolve, 3_000));
    const recoveryLoadedAfter = fs.existsSync(mainLogPath)
      ? fs.readFileSync(mainLogPath, "utf8").split("Startup recovery screen loaded").length - 1
      : 0;
    results.rendererCrashRecovery = recoveryLoadedAfter === recoveryLoadedBefore + 1;
    if (!results.rendererCrashRecovery) throw new Error("renderer recovery screen did not load exactly once");
    await browser.close().catch(() => undefined);
    browser = undefined;
    await stop(app);
    app = undefined;

    const restartAt = Date.now();
    app = launch(9322, { MAOYI_HOT_UPDATE_BASE_URL: "http://127.0.0.1:9" });
    browser = await connect(9322);
    await waitForPage(browser, "邮箱登录");
    results.restartAfterProcessExitMs = Date.now() - restartAt;
    const restartedPage = browser.contexts().flatMap((context) => context.pages())[0];
    if (!restartedPage) throw new Error("restarted Electron page was unavailable");
    await restartedPage.waitForFunction(() => {
      const password = document.querySelector("input[type='password']");
      return password && password.value === "qa-password-159";
    }, null, { timeout: 5_000 });
    results.persistenceRestart = await restartedPage.evaluate(() => {
      const settings = JSON.parse(window.desktopApp?.storageGet?.("maoyisha.settings") || "{}");
      const remembered = JSON.parse(window.desktopApp?.storageGet?.("maoyisha.rememberCredentials") || "{}");
      return {
        cursorTheme: settings.cursorTheme,
        cursorSize: settings.cursorSize,
        cursorTrail: settings.cursorTrail,
        email: remembered.email,
        password: document.querySelector("input[type='password']")?.value,
      };
    });
    if (
      results.persistenceRestart.cursorTheme !== "luoxiaohei" ||
      results.persistenceRestart.cursorSize !== 1.35 ||
      results.persistenceRestart.cursorTrail !== "sakura" ||
      results.persistenceRestart.email !== "qa159@example.com" ||
      results.persistenceRestart.password !== "qa-password-159"
    ) {
      throw new Error(`desktop persistence restart mismatch: ${JSON.stringify(results.persistenceRestart)}`);
    }
    results.networkLogExists = fs.existsSync(path.join(logs, "network.log"));
    results.mainLogExists = fs.existsSync(path.join(logs, "main.log"));
    console.log(JSON.stringify({ ok: true, logs, results }, null, 2));
  } finally {
    await browser?.close().catch(() => undefined);
    await stop(app);
  }
})().catch((error) => {
  console.error(error);
  process.exit(1);
});
