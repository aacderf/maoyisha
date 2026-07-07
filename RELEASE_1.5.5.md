# 茂一杀 1.5.5 Windows 发布说明

## 更新内容

- 修复 Photon 重连卡死：重连流程增加 9 秒 watchdog，并区分网络错误与普通操作错误。
- 修复狼人杀房间残留：房主退出未开始房间时会隐藏并标记结束；主动离开后迟到回调不会重新拉回旧房间。
- 加入房间弹窗新增公开房间列表，可直接查看并加入当前可加入房间。
- 设置中新增特效测试入口，可预览杀、火杀、雷杀、桃、无懈、阶段、击败。
- 特效层不再阻挡鼠标点击和手牌拖拽。

## 给用户的文件

- `茂一杀-1.5.5-Windows-x64.zip`
- `茂一杀累积更新-1.3-to-1.5.5-Windows-x64.zip`
- `SHA256SUMS-茂一杀-1.5.5.txt`

## SHA-256

```text
e6026b8a27e5e7cdb59861a5457a5bb8a8bdc76291dc1e235a293b5ab0200713  茂一杀-1.5.5-Windows-x64.zip
7141b174bf276055ddc313086f7510099b653988e93d7c800821a46753925454  茂一杀累积更新-1.3-to-1.5.5-Windows-x64.zip
```

## 七牛上传

七牛只上传热更新资源，不上传 EXE、ZIP、更新器、APK、私钥或签名密码。

上传顺序：

1. `assets/` 中变化文件。
2. `assets/config/app-content.json`。
3. `version.json`。
4. `version.sig`。
5. 刷新上述对象 CDN 缓存。

## 验证记录

- `npm run typecheck`：通过。
- `npm test -w @cardgame/web`：23 项通过。
- `npm run build -w @cardgame/web`：通过。
- `npm run qa:desktop`：通过。
- `npm run test:photon-reconnect`：通过。
- `npm run desktop:dist`：通过。
- `npm run qa:electron`：通过。
- `npm run release:offline-update -- --minimum 1.3 --to 1.5.5`：通过。
- `npm run test:offline-updater`：通过。

## 说明

- 本轮只发布 Windows/电脑版。
- Android/APK 未构建。
- 未修改规则、Photon 协议版本、CloudBase 数据结构。
