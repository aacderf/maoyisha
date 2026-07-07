# 茂一杀 1.4.1 发布说明

## 七牛云需要更新

上传目录：`D:\AI\卡牌游戏\release\qiniu-hot-update`

严格按以下顺序覆盖同名对象：

1. 上传差异清单中的 29 张 `assets/ui/cards/`、`assets/ui/characters/` 图片。
2. 上传 `assets/config/app-content.json`。
3. 上传 `version.json`。
4. 最后上传 `version.sig`。
5. 在七牛 CDN 刷新上述 32 个对象缓存。

逐项对象名见 `release\qiniu-hot-update\qiniu-upload-list-1.4.1.txt`。不要上传 EXE、APK、私钥、密钥库或签名密码。Photon、React、CSS 和 Electron 代码不能通过七牛热更新。

## 给用户的文件

- Windows：`release\distribution\茂一杀-1.4.1-Windows-x64.zip`
  - 必须发送整个 ZIP，用户解压后运行 `茂一杀.exe`，不能只发送 EXE。
  - SHA-256：`b3ee59255ba5b1533cece30a246eafa8b7e6308d7fa2ba18d0257d361b7a78dc`
- Android：`release\distribution\茂一杀-1.4.1.apk`
  - SHA-256：`d26e13ea187286afd80f18c6a94fbb948bab9a5eb584bd9239e1a934f2155c54`
- 校验文件：`release\distribution\SHA256SUMS.txt`

## 可直接发给用户

> 茂一杀 1.4.1 已发布：修复异常退出、断网和同账号重启后的对局恢复；断线座位保留 120 秒；恢复原座位和最新牌桌快照；新增明确的连接错误提示与网络诊断；重连期间会锁定出牌、响应、技能和结束回合操作。Windows 用户请下载完整 ZIP 并全部解压后运行，Android 用户直接安装签名 APK。

## 发布后检查

1. 访问七牛 `version.json`，确认 `appVersion` 为 `1.4.1`，`protocolVersion` 仍为 `1.4-werewolf-2`。
2. 用无缓存请求检查 `assets/config/app-content.json` 的公告版本为 `1.4.1`。
3. 新旧 Windows 客户端各启动一次，确认热更新签名校验无错误。
4. Android 实机覆盖安装并检查横屏触控；当前机器没有 ADB 设备，此项尚未完成。
