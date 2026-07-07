const fs = require("node:fs");
const path = require("node:path");
const { chromium } = require("playwright");

const root = path.resolve(__dirname, "..");
const outputDir = path.join(root, "tmp", "android-surfaces");
const packageVersion = JSON.parse(fs.readFileSync(path.join(root, "package.json"), "utf8")).version;
const css = fs.readFileSync(path.join(root, "apps", "web", "src", "styles.css"), "utf8");
const dataUrl = (relativePath, mimeType) =>
  `data:${mimeType};base64,${fs.readFileSync(path.join(root, relativePath)).toString("base64")}`;
const tableBackground = dataUrl("assets/ui/table-bg-jade-arena.png", "image/png");
const cardImages = Object.fromEntries(
  ["sha", "shan", "tao", "guohe", "wuxie"].map((key) => [
    key,
    dataUrl(`assets/ui/cards/${key}.jpg`, "image/jpeg"),
  ]),
);
const portraits = {
  "严老板": dataUrl("assets/ui/characters/builtin-yan-laoban.jpg", "image/jpeg"),
  "沈主席": dataUrl("assets/ui/characters/builtin-shen-zhuxi.jpg", "image/jpeg"),
  "黄大仙": dataUrl("assets/ui/characters/builtin-huang-daxian.jpg", "image/jpeg"),
  "三水先生": dataUrl("assets/ui/characters/builtin-sanshui-xiansheng.jpg", "image/jpeg"),
};
const viewports = [
  { name: "800x360", width: 800, height: 360 },
  { name: "1280x720", width: 1280, height: 720 },
  { name: "1600x720", width: 1600, height: 720 },
];

function shell(content, inGame = false) {
  return `<!doctype html><html class="native-android native-compact"><head><meta charset="utf-8"><style>${css}
  .app-shell{--table-bg-url:url("${tableBackground}")}</style></head>
  <body><div id="root"><main class="app-shell ${inGame ? "in-game" : ""}">
  ${inGame ? "" : `<header class="topbar"><h1>茂一杀 <small>v${packageVersion}</small></h1><nav class="mobile-top-actions"><span class="status-pill">Photon 中国区已连接</span><button>退出</button></nav></header>`}
  ${content}</main></div></body></html>`;
}

function lobbyHtml() {
  return shell(`<section class="mobile-lobby">
    <div class="mobile-lobby-status"><button><span class="avatar">测</span><span><strong>测试玩家</strong><small>Photon 已连接</small></span></button><span class="mini-status online">可联机</span></div>
    <div class="mobile-lobby-hero"><div><p>选择玩法</p><h2>今天想玩哪一局？</h2></div><div class="mobile-mode-grid">
      <button class="primary"><b>战</b><strong>联机牌局</strong><span>2-8 人实时对战</span></button>
      <button><b>练</b><strong>练习场</strong><span>单机人机对战</span></button>
      <button><b>狼</b><strong>狼人杀</strong><span>5-8 人语音局</span></button>
      <button><b>回</b><strong>重回上局</strong><span>ROOM-1001</span></button>
    </div></div>
    <div class="mobile-lobby-dock"><button>创建</button><button>加入</button><button>房间</button><button>更多</button></div>
  </section>`);
}

function player(name, x, y, current = false, self = false) {
  return `<article class="player-plate sg-player-card ${current ? "current" : ""} ${self ? "self" : ""}" style="--seat-x:${x}%;--seat-y:${y}%">
    <span class="faction-ribbon faction-shu">学生</span><span class="identity-ribbon identity-hidden">身份未明</span>
    <div class="portrait sg-portrait"><img src="${portraits[name]}" alt=""></div><div class="seat-info"><strong>${name}</strong><span>测试玩家</span></div>
    <div class="health normal"><div class="health-pips"><span class="hp-icon full"></span><span class="hp-icon full"></span><span class="hp-icon full"></span><b>3/3</b></div></div>
    <div class="seat-badges"><small>手牌 4</small></div>${current ? `<b class="turn-mark">行动中</b>` : ""}
  </article>`;
}

function card(name, rank) {
  const key = { "杀": "sha", "闪": "shan", "桃": "tao", "过河拆桥": "guohe", "无懈可击": "wuxie" }[name];
  return `<article class="play-card basic ${key} has-card-art actionable"><img class="card-artwork" src="${cardImages[key]}" alt=""><span class="card-corner">♠ ${rank}</span><strong>${name}</strong><span>基本</span></article>`;
}

function battleHtml() {
  return shell(`<section class="game-layout sg-game-layout transparent-hand log-collapsed">
    <div class="mobile-battle-hud"><div class="mobile-turn-summary"><strong>测试玩家</strong><span>第 1 回合 · 出牌阶段</span><small>请选择手牌和目标</small></div><div class="turn-timer"><span>48</span><small>出牌</small></div><button class="mobile-phase-button">结束出牌</button></div>
    <nav class="mobile-battle-dock"><button>麦<span>语音</span></button><button>单<span>菜单</span></button></nav>
    <div class="battlefield sg-battlefield"><div class="seat-ring">
      ${player("严老板", 84, 72, true, true)}${player("沈主席", 15, 50)}${player("黄大仙", 57, 28)}${player("三水先生", 80, 39)}
    </div><div class="center-field sg-center-field"><div class="table-medallion"><p>牌堆 52 · 弃牌 6</p></div><div class="played-card-stack empty"><span>等待出牌</span></div><div class="target-strip"><span>当前目标</span><select><option>沈主席</option></select></div></div></div>
    <div class="hand-zone sg-hand-zone"><div class="hand-meta"><div><h3>你的手牌</h3><p class="muted">体力 3/3，弃牌上限 3</p></div><div class="discard-drop">弃牌区 · 6</div></div><div class="hand-list sg-hand-list">
      ${card("杀", 7)}${card("闪", 2)}${card("桃", 9)}${card("过河拆桥", 5)}${card("无懈可击", 12)}
    </div></div>
  </section>`, true);
}

(async () => {
  fs.rmSync(outputDir, { recursive: true, force: true });
  fs.mkdirSync(outputDir, { recursive: true });
  const edgePath = [
    "C:\\Program Files (x86)\\Microsoft\\Edge\\Application\\msedge.exe",
    "C:\\Program Files\\Microsoft\\Edge\\Application\\msedge.exe",
  ].find(fs.existsSync);
  const browser = await chromium.launch({ headless: true, executablePath: edgePath });
  const results = [];

  for (const viewport of viewports) {
    for (const surface of ["lobby", "battle"]) {
      const page = await browser.newPage({ viewport });
      await page.setContent(surface === "lobby" ? lobbyHtml() : battleHtml(), { waitUntil: "load" });
      await page.evaluate(({ width, height, tableBackground }) => {
        const root = document.documentElement;
        const shell = document.querySelector(".app-shell");
        root.classList.toggle("native-compact", height <= 720 || width <= 1280);
        root.classList.toggle("native-wide", width / height >= 2.15);
        root.style.setProperty("--app-width", `${width}px`);
        root.style.setProperty("--app-height", `${height}px`);
        root.style.setProperty("--safe-area-inset-left", "22px");
        root.style.setProperty("--safe-area-inset-right", "22px");
        root.style.setProperty("--safe-area-inset-top", "0px");
        root.style.setProperty("--safe-area-inset-bottom", "0px");
        shell?.style.setProperty("--table-bg-url", `url("${tableBackground}")`);
      }, { ...viewport, tableBackground });
      const metrics = await page.evaluate(() => ({
        documentHeight: document.documentElement.scrollHeight,
        viewportHeight: document.documentElement.clientHeight,
        documentWidth: document.documentElement.scrollWidth,
        viewportWidth: document.documentElement.clientWidth,
        cardArtworkLoaded: (() => {
          const card = document.querySelector(".play-card");
          if (!card) return null;
          return getComputedStyle(card, "::before").backgroundImage !== "none";
        })(),
      }));
      const screenshot = path.join(outputDir, `${surface}-${viewport.name}.png`);
      await page.screenshot({ path: screenshot });
      results.push({ surface, viewport, metrics, screenshot });
      await page.close();
    }
  }

  await browser.close();
  fs.writeFileSync(path.join(outputDir, "results.json"), JSON.stringify(results, null, 2));
  console.log(JSON.stringify(results, null, 2));
})().catch((error) => {
  console.error(error);
  process.exit(1);
});
