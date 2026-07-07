const fs = require("node:fs");
const http = require("node:http");
const path = require("node:path");
const { chromium } = require("playwright");

const repoRoot = path.resolve(__dirname, "..");
const sourceRoot = process.env.MAOYI_EFFEKSEER_SOURCE_ROOT;
const runtimeRoot = process.env.MAOYI_EFFEKSEER_RUNTIME_ROOT;
const outputRoot = process.env.MAOYI_EFFEKSEER_FRAME_ROOT || path.join(repoRoot, "tmp", "effekseer-frames");
if (!sourceRoot || !runtimeRoot) {
  throw new Error("Set MAOYI_EFFEKSEER_SOURCE_ROOT and MAOYI_EFFEKSEER_RUNTIME_ROOT");
}

const stagingRoot = path.join(repoRoot, "tmp", "effekseer-renderer");
fs.rmSync(stagingRoot, { recursive: true, force: true });
fs.mkdirSync(stagingRoot, { recursive: true });
fs.copyFileSync(path.join(runtimeRoot, "effekseer.js"), path.join(stagingRoot, "effekseer.js"));
fs.copyFileSync(path.join(runtimeRoot, "effekseer.wasm"), path.join(stagingRoot, "effekseer.wasm"));
fs.cpSync(sourceRoot, path.join(stagingRoot, "effects"), { recursive: true });

const effects = [
  { id: "slash", file: "effects/SlashSample/05_02_Sample/effect.efk", scale: 1.45 },
  { id: "fire", file: "effects/NextSoft01/NextSoft01/MagicFire1.efk", scale: 1.8 },
  { id: "thunder", file: "effects/NextSoft01/NextSoft01/MagicThunder.efk", scale: 1.8 },
  { id: "heal", file: "effects/NextSoft01/NextSoft01/MagicHeal1.efk", scale: 1.55 },
  { id: "shield", file: "effects/NextSoft01/NextSoft01/MagicShield.efk", scale: 1.7 },
  { id: "buff", file: "effects/NextSoft01/NextSoft01/PowerUp.efk", scale: 1.7 },
  { id: "trick", file: "effects/MAGICALxSPIRAL/MAGICALxSPIRAL/MagicArea.efk", scale: 1.25 },
  { id: "impact", file: "effects/MAGICALxSPIRAL/MAGICALxSPIRAL/Attack_Impact.efk", scale: 1.3 },
  { id: "defeat", file: "effects/MAGICALxSPIRAL/MAGICALxSPIRAL/Breakdown.efk", scale: 1.25 },
  { id: "poison", file: "effects/tktk01/tktk01/Dark1.efk", scale: 1.35 },
];

const html = `<!doctype html>
<html><head><meta charset="utf-8"><style>
html,body{margin:0;width:256px;height:256px;overflow:hidden;background:transparent}
canvas{display:block;width:256px;height:256px;background:transparent}
</style></head><body><canvas id="canvas" width="256" height="256"></canvas>
<script src="/effekseer.js"></script><script>
const params = new URLSearchParams(location.search);
const canvas = document.querySelector("canvas");
const gl = canvas.getContext("webgl2", {
  alpha: true, antialias: true, premultipliedAlpha: false, preserveDrawingBuffer: true
}) || canvas.getContext("webgl", {
  alpha: true, antialias: true, premultipliedAlpha: false, preserveDrawingBuffer: true
});
window.__ready = false;
window.__error = "";
let context;
let effect;
let handle;
effekseer.initRuntime("/effekseer.wasm", () => {
  context = effekseer.createContext();
  context.init(gl);
  context.setRestorationOfStatesFlag(false);
  context.setProjectionPerspective(30, 1, 1, 1000);
  context.setCameraLookAt(20, 20, 20, 0, 0, 0, 0, 1, 0);
  effect = context.loadEffect(
    "/" + params.get("effect"),
    Number(params.get("scale") || 1),
    () => {
      handle = context.play(effect, 0, 0, 0);
      window.__ready = true;
    },
    (message, url) => { window.__error = message + " " + url; }
  );
}, () => { window.__error = "Effekseer runtime failed to initialize"; });
window.renderNext = (deltaFrames) => {
  gl.bindFramebuffer(gl.FRAMEBUFFER, null);
  gl.viewport(0, 0, 256, 256);
  gl.clearColor(0, 0, 0, 0);
  gl.clear(gl.COLOR_BUFFER_BIT | gl.DEPTH_BUFFER_BIT);
  context.update(deltaFrames);
  context.draw();
  gl.finish();
};
</script></body></html>`;

function contentType(filePath) {
  if (filePath.endsWith(".html")) return "text/html; charset=utf-8";
  if (filePath.endsWith(".js")) return "text/javascript; charset=utf-8";
  if (filePath.endsWith(".wasm")) return "application/wasm";
  if (filePath.endsWith(".png")) return "image/png";
  if (filePath.endsWith(".efk")) return "application/octet-stream";
  return "application/octet-stream";
}

const server = http.createServer((request, response) => {
  const url = new URL(request.url, "http://127.0.0.1");
  if (url.pathname === "/") {
    response.writeHead(200, { "Content-Type": "text/html; charset=utf-8" });
    response.end(html);
    return;
  }
  const relative = decodeURIComponent(url.pathname).replace(/^[/\\]+/, "");
  const target = path.resolve(stagingRoot, relative);
  if (!target.startsWith(stagingRoot + path.sep) || !fs.existsSync(target) || !fs.statSync(target).isFile()) {
    response.writeHead(404);
    response.end("Not found");
    return;
  }
  response.writeHead(200, {
    "Content-Type": contentType(target),
    "Access-Control-Allow-Origin": "*",
    "Cache-Control": "no-store",
  });
  fs.createReadStream(target).pipe(response);
});

(async () => {
  await new Promise((resolve) => server.listen(0, "127.0.0.1", resolve));
  const address = server.address();
  const browser = await chromium.launch({ headless: true });
  try {
    fs.rmSync(outputRoot, { recursive: true, force: true });
    fs.mkdirSync(outputRoot, { recursive: true });
    for (const config of effects) {
      const page = await browser.newPage({ viewport: { width: 256, height: 256 } });
      const errors = [];
      page.on("console", (message) => {
        if (message.type() === "error") errors.push(message.text());
      });
      await page.goto(
        `http://127.0.0.1:${address.port}/?effect=${encodeURIComponent(config.file)}&scale=${config.scale}`
      );
      await page.waitForFunction(() => window.__ready || window.__error, null, { timeout: 20_000 });
      const loadError = await page.evaluate(() => window.__error);
      if (loadError) throw new Error(`${config.id}: ${loadError}`);
      const effectOutput = path.join(outputRoot, config.id);
      fs.mkdirSync(effectOutput, { recursive: true });
      for (let frame = 0; frame < 24; frame += 1) {
        await page.evaluate(() => window.renderNext(2));
        await page.screenshot({
          path: path.join(effectOutput, `frame-${String(frame).padStart(2, "0")}.png`),
          omitBackground: true,
          clip: { x: 0, y: 0, width: 256, height: 256 },
        });
      }
      if (errors.length) console.warn(config.id, errors.join("\n"));
      console.log(`Rendered ${config.id}`);
      await page.close();
    }
  } finally {
    await browser.close();
    server.close();
  }
})().catch((error) => {
  console.error(error);
  server.close();
  process.exitCode = 1;
});
