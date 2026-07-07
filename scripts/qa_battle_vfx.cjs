const fs = require("node:fs");
const http = require("node:http");
const path = require("node:path");
const { chromium } = require("playwright");

const root = path.resolve(__dirname, "..");
const qaDistDir = path.join(root, "tmp", "desktop-qa-web");
const outputDir = path.join(root, "tmp", "battle-vfx-qa");

function contentType(filePath) {
  const ext = path.extname(filePath).toLowerCase();
  if (ext === ".html") return "text/html; charset=utf-8";
  if (ext === ".js" || ext === ".mjs") return "text/javascript; charset=utf-8";
  if (ext === ".css") return "text/css; charset=utf-8";
  if (ext === ".json") return "application/json; charset=utf-8";
  if (ext === ".png") return "image/png";
  if (ext === ".jpg" || ext === ".jpeg") return "image/jpeg";
  if (ext === ".cur" || ext === ".ani") return "application/octet-stream";
  return "application/octet-stream";
}

function fileForRequest(rawUrl) {
  const url = new URL(rawUrl || "/", "http://127.0.0.1");
  const pathname = decodeURIComponent(url.pathname);
  const roots = pathname.startsWith("/assets/") ? [root] : [qaDistDir];
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
      if (!address || typeof address === "string") return reject(new Error("Could not start VFX QA server."));
      resolve({ server, url: `http://127.0.0.1:${address.port}` });
    });
  });
}

async function openBattleSettings(page) {
  await page.locator(".battle-menu").evaluate((element) => {
    element.open = true;
  });
  await page.locator(".battle-menu div button").nth(1).click();
  await page.waitForSelector(".battle-settings-panel", { timeout: 5000 });
}

async function closeBattleSettings(page) {
  await page.locator(".battle-settings-panel .section-title button").click();
  await page.locator(".battle-menu").evaluate((element) => {
    element.open = false;
  });
}

async function setBattleVfxStyle(page, style) {
  await openBattleSettings(page);
  await page.locator(".battle-settings-panel [data-vfx-style-select]").selectOption(style);
  await closeBattleSettings(page);
  await page.waitForTimeout(120);
}

async function triggerPreview(page, index) {
  await openBattleSettings(page);
  await page.locator(".vfx-test-panel button").nth(index).click();
  await closeBattleSettings(page);
}

async function tryCaptureCardFlight(page) {
  await openBattleSettings(page);
  const buttons = page.locator(".vfx-test-panel button");
  await buttons.last().click();
  await closeBattleSettings(page);
  await page.waitForSelector(".card-flight-actor", { timeout: 2500 });
  await page.waitForTimeout(120);
  await page.screenshot({ path: path.join(outputDir, "card-flight-trail.png") });
  await page.waitForTimeout(850);
  return true;
}

async function verifyPointerCardDrag(page) {
  await page.evaluate(() => {
    window.__maoyiDragStartCount = 0;
    document.addEventListener("dragstart", () => {
      window.__maoyiDragStartCount += 1;
    }, { capture: true });
  });
  const card = page.locator(".sg-hand-list .play-card").first();
  await card.waitFor({ timeout: 5000 });
  const box = await card.boundingBox();
  if (!box) throw new Error("Pointer drag QA: hand card missing.");
  const transforms = [];
  const ghostCounts = [];
  await page.mouse.move(box.x + box.width / 2, box.y + box.height / 2);
  await page.mouse.down();
  for (let step = 0; step < 16; step += 1) {
    await page.mouse.move(box.x + box.width / 2 + step * 15, box.y + box.height / 2 - step * 10, { steps: 2 });
    await page.waitForTimeout(125);
    const metric = await page.evaluate(() => ({
      transform: document.querySelector(".custom-cursor-image")?.style.transform || "",
      ghosts: document.querySelectorAll(".card-drag-ghost").length,
    }));
    transforms.push(metric.transform);
    ghostCounts.push(metric.ghosts);
  }
  await page.screenshot({ path: path.join(outputDir, "pointer-card-drag-cursor.png") });
  await page.mouse.up();
  await page.waitForTimeout(160);
  const result = await page.evaluate(() => ({
    dragStartCount: window.__maoyiDragStartCount || 0,
    nativeCursor: getComputedStyle(document.documentElement).cursor,
  }));
  const movedTransforms = new Set(transforms.filter(Boolean));
  if (result.dragStartCount !== 0) throw new Error(`Pointer drag QA: native dragstart fired ${result.dragStartCount} time(s).`);
  if (!ghostCounts.some((count) => count > 0)) throw new Error("Pointer drag QA: drag ghost was not visible.");
  if (movedTransforms.size < 2) throw new Error("Pointer drag QA: custom cursor transform did not update during drag.");
}

(async () => {
  if (!fs.existsSync(path.join(qaDistDir, "index.html"))) {
    throw new Error("Run npm run qa:desktop before npm run qa:vfx.");
  }
  fs.rmSync(outputDir, { recursive: true, force: true });
  fs.mkdirSync(outputDir, { recursive: true });

  const { server, url } = await startStaticServer();
  const executablePath = [
    "C:\\Program Files (x86)\\Microsoft\\Edge\\Application\\msedge.exe",
    "C:\\Program Files\\Microsoft\\Edge\\Application\\msedge.exe",
  ].find(fs.existsSync);
  const browser = await chromium.launch({
    headless: true,
    executablePath,
    args: [
      "--disable-gpu",
      "--disable-gpu-compositing",
      "--disable-accelerated-2d-canvas",
      "--disable-features=CanvasOopRasterization,UseSkiaRenderer",
    ],
  });
  const errors = [];

  try {
    const page = await browser.newPage({ viewport: { width: 1360, height: 860 } });
    page.on("console", (message) => {
      if (message.type() === "error") errors.push(message.text());
    });
    page.on("pageerror", (error) => errors.push(error.message));
    await page.addInitScript(() => {
      localStorage.setItem(
        "maoyisha.settings",
        JSON.stringify({
          defaultMaxPlayers: 6,
          tableBackgroundId: "classic",
          battleHudCompact: true,
          compactHandZone: true,
          transparentHandZone: true,
          handCardScale: 1,
          effectIntensity: "high",
          battleVfxStyle: "guofeng",
          customCursorEnabled: true,
          cursorTheme: "silksong",
          cursorSize: 1,
          cursorTrail: "particle",
          clickEffectsEnabled: true,
          enableDragPlay: true,
          enableHandSort: true,
        })
      );
    });
    await page.goto(`${url}/?maoyiVisualQa=1`, { waitUntil: "networkidle" });
    await page.waitForSelector(".lobby-main-menu", { timeout: 20000 });
    await page.locator(".lobby-mode-card").nth(2).click();
    await page.waitForSelector(".practice-board", { timeout: 10000 });
    await page.locator(".practice-board input[type='number']").fill("6");
    await page.locator(".practice-board .character-choice").first().click();
    await page.locator(".practice-board .room-code-grid button").click();
    await page.waitForSelector(".sg-game-layout", { timeout: 10000 });
    await page.waitForSelector(".battle-vfx-canvas", { timeout: 10000 });
    await verifyPointerCardDrag(page);

    const variants = ["slash", "fire", "thunder", "heal", "negate", "poison", "phase", "defeat"];
    for (const style of ["guofeng", "anime"]) {
      await setBattleVfxStyle(page, style);
      for (let index = 0; index < variants.length; index += 1) {
        await triggerPreview(page, index);
        await page.waitForTimeout(180);
        await page.screenshot({ path: path.join(outputDir, `${style}-${index + 1}-${variants[index]}.png`) });
        await page.waitForTimeout(720);
      }
    }

    await setBattleVfxStyle(page, "guofeng");
    const capturedFlight = await tryCaptureCardFlight(page);
    if (!capturedFlight) errors.push("Could not capture card flight trail: no playable card/action button.");

    await page.mouse.click(680, 430);
    await page.waitForTimeout(100);
    await page.screenshot({ path: path.join(outputDir, "click-feedback.png") });
    await page.close();
  } finally {
    await browser.close();
    server.close();
  }

  if (errors.length > 0) throw new Error(`VFX QA browser errors:\n${errors.join("\n")}`);
  console.log(JSON.stringify({ outputDir, screenshots: fs.readdirSync(outputDir) }, null, 2));
})().catch((error) => {
  console.error(error);
  process.exit(1);
});
