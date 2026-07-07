# 茂一杀日常更新指南

平时只改下面这些入口，避免在大组件里到处找常量。

## 版本、公告、云配置

- `apps/web/src/config/appConfig.ts`
  - `APP_VERSION`：大厅显示版本。
  - `ANNOUNCEMENT_BY_VERSION`：大厅左下角公告标题和更新内容。
  - `CLOUDBASE_ENV_ID`：CloudBase 环境 ID。
  - `CLOUDBASE_REGION`：CloudBase 地域，当前为 `ap-shanghai`。
  - `CLOUDBASE_ACCESS_KEY`：CloudBase 控制台“前端框架 / React(Vite)”生成的匿名访问令牌。
  - `PHOTON_APP_ID`、`PHOTON_REGION`、`PROTOCOL_VERSION`：Photon 连接和房间协议。
  - `ADMIN_EMAIL`：管理员账号邮箱。

也可以在 `apps/web/.env` 写入下面三项，优先级高于默认值：

```env
VITE_CLOUDBASE_ENV_ID=card-game-auth-d1gesqyiz6c7e59bd
VITE_CLOUDBASE_REGION=ap-shanghai
VITE_CLOUDBASE_ACCESS_KEY=控制台生成的匿名访问令牌
```

不要把后端框架截图里的 `secretId/secretKey` 放进客户端；本项目只使用前端匿名访问令牌。

版本号如果变更，还需要同步 `package.json`、`apps/web/package.json`、`packages/shared/package.json` 的 semver 版本。

## 大厅和本地 UI 默认值

- `apps/web/src/config/uiConfig.ts`
  - `DEFAULT_SETTINGS`：默认人数、倒计时、音量、手牌大小、拖拽开关。
  - `CORE_CARD_NAMES`：大厅规则概览里展示的核心卡牌。
  - `QUICK_CHAT_MESSAGES`：局内聊天快捷文字。
  - 本地存储 key：记住密码、设置。

## 角色

- `packages/shared/src/characters.ts`
  - 所有内置角色集中在 `BUILT_IN_CHARACTERS`。
  - 新增角色时固定新增：`id`、名称、阵营、体力、标签、技能文本。
  - 角色具体技能结算仍在 `packages/shared/src/rules.ts` 中实现，并在 `rules.test.ts` 加测试。

## 卡牌和牌堆

- `packages/shared/src/game-data/cards.ts`
  - `cardDef`：卡牌名称、类别、目标需求、伤害、距离、装备槽。
  - `EQUIPMENT_VARIANTS`：武器、防具、马具名称和参数。
  - `createStarterDeck`：初始牌堆数量、花色、点数。

## 音频和素材

- `apps/web/src/lib/audioAssets.ts`
  - 背景音乐、卡牌语音、音效、播报资源映射。
- `apps/web/src/assets`
  - UI、卡面、背景、音乐、音效素材。

## 验证命令

```powershell
npm run typecheck
npm test
npm run desktop:dist
```
