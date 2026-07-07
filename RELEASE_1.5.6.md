# 茂一杀 1.5.6 Windows 发布说明

## 本次修复

- 修复创建房间时 Photon 正常切换到 GameServer 被 UI 误判为“离线”的问题。
- 新增真实 Photon 建房脚本 `npm run test:photon-create`，覆盖 `JoinedLobby -> ConnectingToGameserver -> Joined` 建房流程。
- 保留并验证双客户端 Rejoin 流程，避免重连状态卡死。
- 对局特效升级为多层表现：飞牌、刀光、火焰、雷纹、青玉治疗、无懈封印、阶段牌匾、击败印章。
- 特效层保持 `pointer-events:none`，不阻挡点击、拖拽和目标选择。

## 交付文件

- `D:\AI\卡牌游戏\交付\1.5.6\茂一杀-1.5.6-Windows-x64.zip`
- `D:\AI\卡牌游戏\交付\1.5.6\茂一杀累积更新-1.3-to-1.5.6-Windows-x64.zip`
- `D:\AI\卡牌游戏\交付\1.5.6\SHA256SUMS-茂一杀-1.5.6.txt`
- 电脑版解压副本：`D:\AI\卡牌游戏电脑版\茂一杀.exe`

## SHA-256

```text
a30743b700ba1936fc8331ddf14effa4791bb61ad20ed21d528b439f98facb59  茂一杀-1.5.6-Windows-x64.zip
cb15d219de21afdf70de5966950f9ab8f27b4742bd1292c5a00956965b707867  茂一杀累积更新-1.3-to-1.5.6-Windows-x64.zip
```

## 验证结果

- `npm run typecheck`：通过。
- `npm test`：共享包 67 项、Web 23 项通过。
- `npm run test:photon-create`：通过，真实 Photon 建房成功。
- `npm run test:photon-reconnect`：通过，双客户端 Rejoin 成功。
- `npm run qa:desktop`：通过，1120×720、1360×860、1920×1080 大厅/对局检查无错误。
- `npm run qa:electron`：通过，离线冷启动 2050ms，第二实例、崩溃恢复、日志生成通过。
- `npm run desktop:dist`：通过。
- `npm run release:package`：通过。
- `npm run release:offline-update -- --minimum 1.3 --to 1.5.6`：通过。
- `npm run test:offline-updater`：通过。

## 注意

- 本轮只构建 Windows/电脑版，未构建 Android/APK。
- 不修改卡牌规则、Photon 协议版本、CloudBase 数据结构。
