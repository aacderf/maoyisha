const fs = require("node:fs");
const http = require("node:http");
const path = require("node:path");
const { spawnSync } = require("node:child_process");
const { chromium } = require("playwright");

const root = path.resolve(__dirname, "..");
const outputDir = path.join(root, "tmp", "desktop-qa");
const qaDistDir = path.join(root, "tmp", "desktop-qa-web");
const ownsServer = !process.env.QA_URL;
let qaUrl = process.env.QA_URL || "";
const viewports = [
  { name: "1120x720", width: 1120, height: 720 },
  { name: "1360x860", width: 1360, height: 860 },
  { name: "1920x1080", width: 1920, height: 1080 },
];
const gameCases = [
  { viewport: viewports[0], players: 4 },
  { viewport: viewports[1], players: 6 },
  { viewport: viewports[2], players: 8 },
];

function runCommand(command, args, options = {}) {
  const result = spawnSync(command, args, {
    cwd: options.cwd || root,
    env: { ...process.env, ...(options.env || {}) },
    stdio: "inherit",
  });
  if (result.status !== 0) {
    throw new Error(`${command} ${args.join(" ")} failed with exit code ${result.status}`);
  }
}

function buildQaDist() {
  fs.rmSync(qaDistDir, { recursive: true, force: true });
  if (process.platform === "win32") {
    runCommand("cmd.exe", ["/d", "/s", "/c", "npm", "run", "build", "-w", "@cardgame/shared"]);
    runCommand("cmd.exe", ["/d", "/s", "/c", "npx", "vite", "build", "--outDir", "../../tmp/desktop-qa-web", "--emptyOutDir"], {
      cwd: path.join(root, "apps", "web"),
      env: { VITE_MAOYI_VISUAL_QA: "1" },
    });
    return;
  }
  runCommand("npm", ["run", "build", "-w", "@cardgame/shared"]);
  runCommand("npx", ["vite", "build", "--outDir", "../../tmp/desktop-qa-web", "--emptyOutDir"], {
    cwd: path.join(root, "apps", "web"),
    env: { VITE_MAOYI_VISUAL_QA: "1" },
  });
}

function contentType(filePath) {
  const ext = path.extname(filePath).toLowerCase();
  if (ext === ".html") return "text/html; charset=utf-8";
  if (ext === ".js" || ext === ".mjs") return "text/javascript; charset=utf-8";
  if (ext === ".css") return "text/css; charset=utf-8";
  if (ext === ".json") return "application/json; charset=utf-8";
  if (ext === ".png") return "image/png";
  if (ext === ".jpg" || ext === ".jpeg") return "image/jpeg";
  if (ext === ".svg") return "image/svg+xml";
  return "application/octet-stream";
}

function fileForRequest(rawUrl) {
  const url = new URL(rawUrl || "/", "http://127.0.0.1");
  const pathname = decodeURIComponent(url.pathname);
  const roots = pathname.startsWith("/assets/")
    ? [root]
    : pathname === "/version.json" || pathname === "/version.sig"
      ? [root]
      : [qaDistDir];
  for (const base of roots) {
    const candidate = path.resolve(base, `.${pathname}`);
    if (candidate.startsWith(base) && fs.existsSync(candidate) && fs.statSync(candidate).isFile()) return candidate;
  }
  return path.join(qaDistDir, "index.html");
}

function startStaticServer() {
  const server = http.createServer((request, response) => {
    const filePath = fileForRequest(request.url);
    response.writeHead(200, { "Content-Type": contentType(filePath) });
    fs.createReadStream(filePath).pipe(response);
  });
  return new Promise((resolve, reject) => {
    server.once("error", reject);
    server.listen(0, "127.0.0.1", () => {
      const address = server.address();
      if (!address || typeof address === "string") {
        reject(new Error("Could not start QA static server."));
        return;
      }
      qaUrl = `http://127.0.0.1:${address.port}`;
      resolve(server);
    });
  });
}

async function newQaPage(browser, viewport, players) {
  const page = await browser.newPage({ viewport });
  await page.addInitScript((playerCount) => {
    localStorage.setItem(
      "maoyisha.settings",
      JSON.stringify({
        defaultMaxPlayers: playerCount,
        tableBackgroundId: "classic",
        battleHudCompact: true,
        compactHandZone: true,
        transparentHandZone: true,
        compactLobbyTools: true,
        handCardScale: 1,
        effectIntensity: "normal",
      })
    );
  }, players);
  return page;
}

async function captureLobby(browser, viewport) {
  const page = await newQaPage(browser, viewport, 4);
  const errors = [];
  page.on("console", (message) => {
    if (message.type() === "error") errors.push(message.text());
  });
  page.on("pageerror", (error) => errors.push(error.message));
  await page.goto(`${qaUrl}/?maoyiVisualQa=1`, { waitUntil: "networkidle" });
  await page.waitForSelector(".lobby-main-menu", { timeout: 20000 });
  const metrics = await page.evaluate(() => {
    const lobby = document.querySelector(".lobby-main-menu")?.getBoundingClientRect().toJSON();
    const topbar = document.querySelector(".topbar")?.getBoundingClientRect().toJSON();
    const scrollingElement = document.scrollingElement ?? document.documentElement;
    return {
      width: document.documentElement.scrollWidth,
      height: scrollingElement.scrollHeight,
      viewportWidth: document.documentElement.clientWidth,
      viewportHeight: document.documentElement.clientHeight,
      bodyOverflowY: getComputedStyle(document.body).overflowY,
      appOverflowY: getComputedStyle(document.querySelector(".app-shell")).overflowY,
      lobby,
      topbar,
      hasPageScroll: scrollingElement.scrollHeight > window.innerHeight + 2,
    };
  });
  const screenshot = path.join(outputDir, `${viewport.name}-lobby.png`);
  await page.screenshot({ path: screenshot, fullPage: false });
  await page.close();
  return { kind: "lobby", viewport, metrics, errors, screenshot };
}

async function captureGame(browser, viewport, players) {
  const page = await newQaPage(browser, viewport, players);
  const errors = [];
  page.on("console", (message) => {
    if (message.type() === "error") errors.push(message.text());
  });
  page.on("pageerror", (error) => errors.push(error.message));
  await page.goto(`${qaUrl}/?maoyiVisualQa=1`, { waitUntil: "networkidle" });
  await page.waitForSelector(".lobby-main-menu", { timeout: 20000 });
  await page.locator(".lobby-mode-card").filter({ hasText: "练习场" }).click();
  await page.waitForSelector(".practice-board", { timeout: 10000 });
  await page.locator(".practice-board input[type='number']").fill(String(players));
  await page.locator(".practice-board button").filter({ hasText: "开始练习" }).click();
  await page.waitForSelector(".sg-game-layout", { timeout: 10000 });
  await page.mouse.move(Math.round(viewport.width / 2), Math.round(viewport.height / 2));
  await page.waitForTimeout(80);
  const metrics = await page.evaluate(() => {
    const rectOf = (selector) => document.querySelector(selector)?.getBoundingClientRect().toJSON();
    const hud = document.querySelector(".battle-hud-strip")?.getBoundingClientRect();
    const hand = document.querySelector(".sg-hand-zone")?.getBoundingClientRect();
    const playerCards = [...document.querySelectorAll(".sg-player-card")].map((node) => {
      const rect = node.getBoundingClientRect();
      return {
        text: node.textContent?.replace(/\s+/g, " ").trim().slice(0, 60),
        top: rect.top,
        left: rect.left,
        width: rect.width,
        height: rect.height,
        bottom: rect.bottom,
        self: node.classList.contains("self"),
      };
    });
    const hudBottom = hud ? hud.bottom : 0;
    const hiddenTopPlayers = playerCards.filter(
      (card) =>
        !card.self &&
        card.top < window.innerHeight * 0.42 &&
        (card.height < 72 || card.top < hudBottom + 6)
    );
    return {
      width: document.documentElement.scrollWidth,
      height: document.documentElement.scrollHeight,
      viewportWidth: document.documentElement.clientWidth,
      viewportHeight: document.documentElement.clientHeight,
      layout: rectOf(".sg-game-layout"),
      hud: hud?.toJSON(),
      hand: hand?.toJSON(),
      playerCards,
      playerCount: playerCards.length,
      hiddenTopPlayers,
      handTooTall: hand ? hand.height > 190 : true,
    };
  });
  const screenshot = path.join(outputDir, `${viewport.name}-game-${players}p.png`);
  await page.screenshot({ path: screenshot, fullPage: false });
  await page.close();
  return { kind: "game", viewport, players, metrics, errors, screenshot };
}

(async () => {
  fs.rmSync(outputDir, { recursive: true, force: true });
  fs.mkdirSync(outputDir, { recursive: true });

  if (ownsServer) buildQaDist();
  const server = ownsServer ? await startStaticServer() : undefined;
  try {
    const executablePath = [
      "C:\\Program Files (x86)\\Microsoft\\Edge\\Application\\msedge.exe",
      "C:\\Program Files\\Microsoft\\Edge\\Application\\msedge.exe",
    ].find(fs.existsSync);
    const browser = await chromium.launch({ headless: true, executablePath });
    const results = [];
    for (const viewport of viewports) {
      results.push(await captureLobby(browser, viewport));
    }
    for (const item of gameCases) {
      results.push(await captureGame(browser, item.viewport, item.players));
    }
    await browser.close();

    const failures = [];
    for (const result of results) {
      if (result.kind === "lobby" && result.metrics.hasPageScroll) {
        failures.push(`${result.viewport.name} lobby has page scroll`);
      }
      if (result.kind === "game") {
        if (result.metrics.playerCount !== result.players) {
          failures.push(`${result.viewport.name} ${result.players}p expected ${result.players} players, saw ${result.metrics.playerCount}`);
        }
        if (result.metrics.handTooTall) {
          failures.push(`${result.viewport.name} ${result.players}p hand zone too tall`);
        }
        if (result.metrics.hiddenTopPlayers.length > 0) {
          failures.push(`${result.viewport.name} ${result.players}p top player overlaps HUD`);
        }
      }
    }
    fs.writeFileSync(path.join(outputDir, "results.json"), JSON.stringify(results, null, 2));
    console.log(JSON.stringify(results, null, 2));
    if (failures.length > 0) {
      console.error(`QA layout failures:\n${failures.join("\n")}`);
      process.exit(1);
    }
  } finally {
    if (server) server.close();
  }
})().catch((error) => {
  console.error(error);
  process.exit(1);
});
