# 茂一杀代码地图

## 常改内容

- `apps/web/src/config/appConfig.ts`：版本、公告、CloudBase、Photon、热更地址。
- `apps/web/src/config/uiConfig.ts`：默认 UI、聊天、牌桌背景和本地设置。
- `packages/shared/src/characters.ts`：角色资料与技能说明。
- `packages/shared/src/game-data/cards.ts`：牌表、花色点数、装备和牌堆比例。
- `packages/shared/src/rules.ts`：一致性规则、阶段、锦囊、装备和角色技能。
- `assets/config`、`assets/logic`：七牛热更输出，不要直接手改生成文件。

## 网络与语音

- `apps/web/src/lib/photonGame.ts`：Photon 房间、离房幂等、断线重连和快照恢复。
- `apps/web/src/lib/agoraVoice.ts`：声网加入、麦克风、Token 续期和语音重连。
- `apps/web/src/lib/cloudbaseAuth.ts`：CloudBase 登录、注册和用户资料。

## 界面

- `apps/web/src/App.tsx`：应用路由和页面组合。
- `apps/web/src/components/gamePieces.tsx`：角色牌、手牌和牌桌组件。
- `apps/web/src/styles.css`：大厅、牌桌、抽屉和响应式布局。

## 关键约束

- 真人玩家的“可以/选择”技能必须进入明确选择状态；超时默认放弃。
- 锁定技和明确被动技才允许自动执行。
- Photon 只同步动作和快照；规则必须由 `packages/shared` 统一计算。
- Agora App Certificate 只能存在于云函数环境变量，不能进入客户端或热更包。
- 外置资源路径统一以 `./assets/` 为根，热更失败必须回退到本地资源。
