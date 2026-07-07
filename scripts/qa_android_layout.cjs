const fs = require("node:fs");
const path = require("node:path");
const { chromium } = require("playwright");

const root = path.resolve(__dirname, "..");
const outputDir = path.join(root, "tmp", "android-qa");
const qaUrl = process.env.QA_URL || "http://127.0.0.1:4176";
const viewports = [
  { name: "800x360", width: 800, height: 360 },
  { name: "915x412", width: 915, height: 412 },
  { name: "1280x720", width: 1280, height: 720 },
  { name: "1600x720", width: 1600, height: 720 },
  { name: "1920x1080", width: 1920, height: 1080 },
  { name: "2400x1080", width: 2400, height: 1080 },
];

(async () => {
  fs.rmSync(outputDir, { recursive: true, force: true });
  fs.mkdirSync(outputDir, { recursive: true });
  const edgePath = [
    "C:\\Program Files (x86)\\Microsoft\\Edge\\Application\\msedge.exe",
    "C:\\Program Files\\Microsoft\\Edge\\Application\\msedge.exe",
  ].find(fs.existsSync);
  const browser = await chromium.launch({
    headless: true,
    executablePath: edgePath,
  });
  const results = [];

  for (const viewport of viewports) {
    const page = await browser.newPage({ viewport });
    await page.goto(qaUrl, { waitUntil: "networkidle" });
    await page.evaluate(({ width, height }) => {
      const root = document.documentElement;
      root.classList.add("native-android");
      root.classList.toggle("native-compact", height <= 720 || width <= 1280);
      root.classList.toggle("native-wide", width / height >= 2.15);
      root.style.setProperty("--app-width", `${width}px`);
      root.style.setProperty("--app-height", `${height}px`);
      root.style.setProperty("--safe-area-inset-left", "22px");
      root.style.setProperty("--safe-area-inset-right", "22px");
      root.style.setProperty("--safe-area-inset-top", "0px");
      root.style.setProperty("--safe-area-inset-bottom", "0px");
    }, viewport);
    await page.waitForTimeout(500);

    const metrics = await page.evaluate(() => {
      const app = document.querySelector(".app-shell");
      const card = document.querySelector(".login-card");
      return {
        documentClientHeight: document.documentElement.clientHeight,
        documentScrollHeight: document.documentElement.scrollHeight,
        bodyClientHeight: document.body.clientHeight,
        bodyScrollHeight: document.body.scrollHeight,
        appRect: app?.getBoundingClientRect().toJSON(),
        cardRect: card?.getBoundingClientRect().toJSON(),
        bodyOverflow: getComputedStyle(document.body).overflow,
      };
    });
    const screenshot = path.join(outputDir, `${viewport.name}.png`);
    await page.screenshot({ path: screenshot });
    results.push({ viewport, screenshot, metrics });
    await page.close();
  }

  await browser.close();
  fs.writeFileSync(
    path.join(outputDir, "results.json"),
    JSON.stringify(results, null, 2)
  );
  console.log(JSON.stringify(results, null, 2));
})().catch((error) => {
  console.error(error);
  process.exit(1);
});
