const fs = require("node:fs");
const http = require("node:http");
const path = require("node:path");
const { chromium } = require("playwright");

const root = path.resolve(__dirname, "..");
const qaDistDir = path.join(root, "tmp", "desktop-qa-web");
const outputDir = path.join(root, "tmp", "cursor-qa");
const cases = [
  { name: "silksong-60-particle", theme: "silksong", size: 0.6, trail: "particle" },
  { name: "silksong-100-off", theme: "silksong", size: 1, trail: "off" },
  { name: "silksong-160-sakura", theme: "silksong", size: 1.6, trail: "sakura" },
  { name: "luoxiaohei-100-particle", theme: "luoxiaohei", size: 1, trail: "particle" },
  { name: "luoxiaohei-100-sakura", theme: "luoxiaohei", size: 1, trail: "sakura" },
  { name: "silverwolf-100-particle", theme: "silverwolf", size: 1, trail: "particle" },
  { name: "firefly-100-sakura", theme: "firefly", size: 1, trail: "sakura" },
  { name: "classicPointer-100-off", theme: "classicPointer", size: 1, trail: "off" },
];

function contentType(filePath) {
  const ext = path.extname(filePath).toLowerCase();
  if (ext === ".html") return "text/html; charset=utf-8";
  if (ext === ".js" || ext === ".mjs") return "text/javascript; charset=utf-8";
  if (ext === ".css") return "text/css; charset=utf-8";
  if (ext === ".json") return "application/json; charset=utf-8";
  if (ext === ".png") return "image/png";
  if (ext === ".jpg" || ext === ".jpeg") return "image/jpeg";
  return "application/octet-stream";
}

function fileForRequest(rawUrl) {
  const url = new URL(rawUrl || "/", "http://127.0.0.1");
  const pathname = decodeURIComponent(url.pathname);
  const base = pathname.startsWith("/assets/") ? root : qaDistDir;
  const candidate = path.resolve(base, `.${pathname}`);
  if (candidate.startsWith(base) && fs.existsSync(candidate) && fs.statSync(candidate).isFile()) {
    return candidate;
  }
  return path.join(qaDistDir, "index.html");
}

(async () => {
  if (!fs.existsSync(path.join(qaDistDir, "index.html"))) {
    throw new Error("Run npm run qa:desktop before npm run qa:cursor.");
  }
  fs.rmSync(outputDir, { recursive: true, force: true });
  fs.mkdirSync(outputDir, { recursive: true });
  const server = http.createServer((request, response) => {
    const filePath = fileForRequest(request.url);
    response.writeHead(200, { "Content-Type": contentType(filePath) });
    fs.createReadStream(filePath).pipe(response);
  });
  await new Promise((resolve) => server.listen(0, "127.0.0.1", resolve));
  const address = server.address();
  const browser = await chromium.launch({ headless: true });
  const results = [];
  try {
    for (const item of cases) {
      const page = await browser.newPage({ viewport: { width: 1360, height: 860 } });
      const errors = [];
      page.on("pageerror", (error) => errors.push(error.message));
      await page.addInitScript((settings) => {
        localStorage.setItem(
          "maoyisha.settings",
          JSON.stringify({
            defaultMaxPlayers: 4,
            tableBackgroundId: "classic",
            effectIntensity: "normal",
            battleVfxStyle: "guofeng",
            customCursorEnabled: true,
            cursorTheme: settings.theme,
            cursorSize: settings.size,
            cursorTrail: settings.trail,
          })
        );
      }, item);
      await page.goto(`http://127.0.0.1:${address.port}/?maoyiVisualQa=1`, { waitUntil: "networkidle" });
      await page.waitForSelector(".lobby-bottom-nav");
      const cardButton = page.locator(".lobby-bottom-nav button").nth(3);
      const noticeButton = page.locator(".lobby-bottom-nav button").nth(4);
      for (const point of [
        await cardButton.boundingBox(),
        await noticeButton.boundingBox(),
      ]) {
        if (!point) throw new Error(`${item.name}: lobby bottom button is missing`);
        await page.mouse.move(point.x + point.width / 2, point.y + point.height / 2, { steps: 8 });
      }
      await page.waitForTimeout(item.theme === "luoxiaohei" ? 160 : 80);
      const metrics = await page.evaluate(() => {
        const layer = document.querySelector(".custom-cursor-layer");
        const image = document.querySelector(".custom-cursor-image");
        return {
          visible: layer?.classList.contains("is-visible"),
          image: image?.getAttribute("src"),
          width: image?.getAttribute("width"),
          rootCursor: getComputedStyle(document.documentElement).cursor,
          cardCursor: getComputedStyle(document.querySelector(".lobby-bottom-nav button:nth-child(4)")).cursor,
          noticeCursor: getComputedStyle(document.querySelector(".lobby-bottom-nav button:nth-child(5)")).cursor,
          trailCount: document.querySelectorAll(".custom-cursor-trail-particle").length,
        };
      });
      if (!metrics.visible) throw new Error(`${item.name}: custom cursor is not visible`);
      if (!metrics.image?.includes(item.theme)) throw new Error(`${item.name}: wrong cursor image ${metrics.image}`);
      if (metrics.cardCursor !== "none" || metrics.noticeCursor !== "none") {
        throw new Error(`${item.name}: native cursor leaked over bottom navigation`);
      }
      if (item.trail !== "off" && metrics.trailCount < 1) {
        throw new Error(`${item.name}: trail particles were not created`);
      }
      await page.screenshot({ path: path.join(outputDir, `${item.name}.png`) });
      results.push({ ...item, metrics, errors });
      await page.close();
    }
  } finally {
    await browser.close();
    server.close();
  }
  fs.writeFileSync(path.join(outputDir, "results.json"), `${JSON.stringify(results, null, 2)}\n`);
  console.log(JSON.stringify({ outputDir, results }, null, 2));
})().catch((error) => {
  console.error(error);
  process.exit(1);
});
