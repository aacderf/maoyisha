# 茂一杀 1.5.7 发布说明

## 本轮修复

- 修复创建房间、退出房间、重回上局时 Photon 切换 Master/GameServer 被误判为断线的问题。
- 离开房间、进房、恢复房间进入受控状态；这些状态下的临时 `Connecting/Disconnecting/JoinedLobby` 不再触发错误重连。
- 真实 Photon 专项脚本验证：建房、断线恢复均返回 `ok: true`。
- 大厅左侧加入本地循环视频框，自动播放、静音、循环，设置里可关闭“大 厅循环视频”。
- 大厅大标题收纳为小标题，红框区域留给视频，背景不做全局虚化。
- Electron 本地资源服务器补充 `.mp4` MIME，保证 Windows 包内视频按 `video/mp4` 播放。

## 验证

- `npm run typecheck`：通过。
- `npm test`：共享包 67 项、Web 23 项，通过。
- `npm run build`：通过。
- `npm run test:photon-reconnect`：通过。
- `npm run test:photon-create`：通过。
- `npm run qa:desktop`：通过，1120×720、1360×860、1920×1080 无页面滚动，对局手牌/角色区检测通过。
- `npm run qa:electron`：通过，离线冷启动、第二实例、崩溃恢复、日志生成通过。
- `npm run desktop:dist`：通过。
- `npm run release:package`：通过。
- `npm run release:offline-update -- --minimum 1.3 --to 1.5.7`：通过。
- `npm run test:offline-updater`：通过。

## 交付文件

- `交付/1.5.7/茂一杀-1.5.7-Windows-x64.zip`
- `交付/1.5.7/茂一杀累积更新-1.3-to-1.5.7-Windows-x64.zip`
- `交付/1.5.7/SHA256SUMS-茂一杀-1.5.7.txt`
- `交付/1.5.7/RELEASE_1.5.7.md`

## 七牛

七牛只上传资源热更新相关文件，不上传 EXE、ZIP、私钥或签名密码：

1. `assets/` 差异文件，包含 `assets/ui/lobby/lobby-loop.mp4`。
2. `assets/config/app-content.json`。
3. `version.json`。
4. `version.sig`。
5. 上传后刷新以上对象 CDN 缓存。

