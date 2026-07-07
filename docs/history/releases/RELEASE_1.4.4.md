# 茂一杀 1.4.4 发布说明

## 给用户的文件

必须给完整文件，不能只发 EXE：

- `D:\AI\卡牌游戏\release\distribution\茂一杀-1.4.4-Windows-x64.zip`
- `D:\AI\卡牌游戏\release\distribution\茂一杀-1.4.4.apk`
- `D:\AI\卡牌游戏\release\distribution\SHA256SUMS.txt`

SHA-256：

```text
99e4cd7397da73ceeb8e8586d9a2211d6d564de25040a87335614daba58384bf  茂一杀-1.4.4-Windows-x64.zip
1029c54187d2c03a2e3b0d1c6300903951c0e8079e685e4462393106759adcb5  茂一杀-1.4.4.apk
```

## 用户更新文案

> 茂一杀 1.4.4 已发布：本次重点重做对局视觉和特效。出牌改为纸牌飞向牌桌中心，杀、火杀、雷杀、桃/酒、锦囊、无懈、阶段切换和落败都有新的局部演出；手牌改成纸牌式窄长卡，玩家牌框改为竖向角色牌，大厅图标也改为棱形/斜切牌匾。修复多处中文乱码。Photon 协议未变，旧房间/账号数据保持兼容。

## 七牛需要更新什么

七牛只上传热更新资源，不上传 EXE/APK/私钥/签名密码。

上传目录：

```text
D:\AI\卡牌游戏\release\qiniu-hot-update
```

上传顺序：

1. 先上传清单中的 `assets/` 文件。
2. 再上传 `assets/config/app-content.json`。
3. 再上传 `version.json`。
4. 最后上传 `version.sig`。
5. 刷新以上对象的 CDN 缓存。

详细清单见：

```text
D:\AI\卡牌游戏\QINIU_UPLOAD_1.4.4.md
D:\AI\卡牌游戏\release\qiniu-hot-update\qiniu-upload-list-1.4.4.txt
```

## 验证结果

- `npm run typecheck`：通过。
- `npm test`：84 项通过（shared 67，web 17）。
- `npm run build`：通过。
- `npm run qa:desktop`：通过，1120×720、1360×860、1920×1080 大厅无滚动条；4/6/8 人局顶部玩家完整。
- `npm run qa:electron`：通过，离线冷启动约 2.1 秒，二开、崩溃恢复、日志生成正常。
- `npm run desktop:dist`：通过。
- `npm run android:apk`：通过。
- `apksigner verify --verbose --print-certs`：通过，v2 scheme 为 true。
- `npm run prepare:qiniu`：通过，差异资产 31 个。
- `npm run release:package`：通过。

## 已知限制

- 本机未找到 `adb`，Android 实体机触控验收未完成。
- Vite 仍提示主包和 Agora 分包超过 500KB。
- Gradle 8.14.3 仍有弃用配置提示。
