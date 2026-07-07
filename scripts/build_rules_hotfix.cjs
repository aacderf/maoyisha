const fs = require("node:fs");
const path = require("node:path");
const { pathToFileURL } = require("node:url");

const root = path.resolve(__dirname, "..");
const sharedDist = path.join(root, "packages", "shared", "dist");
const logicRoot = path.join(root, "assets", "logic");
const sharedOut = path.join(logicRoot, "shared");
const configRoot = path.join(root, "assets", "config");

function rmrf(target) {
  fs.rmSync(target, { recursive: true, force: true });
}

function copyDir(from, to) {
  fs.mkdirSync(to, { recursive: true });
  for (const entry of fs.readdirSync(from, { withFileTypes: true })) {
    const source = path.join(from, entry.name);
    const target = path.join(to, entry.name);
    if (entry.isDirectory()) {
      copyDir(source, target);
    } else if (entry.isFile()) {
      fs.copyFileSync(source, target);
    }
  }
}

async function main() {
  if (!fs.existsSync(path.join(sharedDist, "index.js"))) {
    throw new Error("packages/shared/dist/index.js not found. Run npm run build -w @cardgame/shared first.");
  }

  fs.mkdirSync(logicRoot, { recursive: true });
  fs.mkdirSync(configRoot, { recursive: true });
  rmrf(sharedOut);
  copyDir(sharedDist, sharedOut);

  fs.writeFileSync(
    path.join(logicRoot, "rules.bundle.js"),
    [
      'export * from "./shared/index.js";',
      'export const HOT_RULES_BUNDLE = true;',
      "",
    ].join("\n"),
    "utf8"
  );

  const moduleUrl = `${pathToFileURL(path.join(sharedDist, "index.js")).href}?t=${Date.now()}`;
  const rules = await import(moduleUrl);
  const characters = rules.BUILT_IN_CHARACTERS ?? [];
  const cards = typeof rules.getGameCardCatalog === "function" ? rules.getGameCardCatalog() : [];
  const werewolfRoles = rules.WEREWOLF_ROLE_DEFINITIONS ?? [];
  const werewolfPresets = rules.WEREWOLF_PRESETS ?? [];

  fs.writeFileSync(path.join(configRoot, "characters.json"), `${JSON.stringify(characters, null, 2)}\n`, "utf8");
  fs.writeFileSync(path.join(configRoot, "cards.json"), `${JSON.stringify(cards, null, 2)}\n`, "utf8");
  fs.writeFileSync(path.join(configRoot, "werewolf-roles.json"), `${JSON.stringify(werewolfRoles, null, 2)}\n`, "utf8");
  fs.writeFileSync(path.join(configRoot, "werewolf-presets.json"), `${JSON.stringify(werewolfPresets, null, 2)}\n`, "utf8");

  const appContentPath = path.join(configRoot, "app-content.json");
  if (!fs.existsSync(appContentPath)) {
    fs.writeFileSync(
      appContentPath,
      `${JSON.stringify(
        {
          appVersion: "1.4",
          announcementVersion: "1.4",
          logicVersion: "1.4",
          protocolVersion: "1.4",
          announcementTitle: "1.4 更新公告",
          announcementItems: ["资源热更新准备完成", "角色、卡牌、规则包可通过七牛云下发"],
        },
        null,
        2
      )}\n`,
      "utf8"
    );
  }

  console.log("Rules hotfix bundle generated:");
  console.log(" - assets/logic/rules.bundle.js");
  console.log(" - assets/config/characters.json");
  console.log(" - assets/config/cards.json");
  console.log(" - assets/config/werewolf-roles.json");
  console.log(" - assets/config/werewolf-presets.json");
}

main().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});
