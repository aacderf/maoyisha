# 茂一杀 1.4.2 发布说明

## 七牛云需要更新

上传目录：`D:\AI\卡牌游戏\release\qiniu-hot-update`

严格按以下顺序覆盖同名对象：

1. 上传差异清单中的 `assets/` 文件。
2. 上传 `assets/config/app-content.json`。
3. 上传 `version.json`。
4. 最后上传 `version.sig`。
5. 刷新清单中全部 32 个对象的 CDN 缓存。

逐项对象名见 `release\qiniu-hot-update\qiniu-upload-list-1.4.2.txt`。不要上传 EXE、APK、私钥、密钥库或签名密码。七牛不能更新 React、CSS、Electron 或 Photon 代码，所以本次 UI 重做必须通过完整客户端包交付给用户。

## 给用户的文件

- Windows：`release\distribution\茂一杀-1.4.2-Windows-x64.zip`
  - 必须发送整个 ZIP，用户解压后运行 `茂一杀.exe`，不能只发送 EXE。
  - SHA-256：`fa86aa2cdb4eb7650d51009337797ef24b495b0a016bc455421915946e9c3ae4`
- Android：`release\distribution\茂一杀-1.4.2.apk`
  - SHA-256：`9baa072b860c599739d9fe2b5c6343f4593c41c0b442b1ff29b0f2c86d1ba87e`
- 校验文件：`release\distribution\SHA256SUMS.txt`

## 可直接发给用户

> 茂一杀 1.4.2 已发布：大厅和对局 UI 已重做为柔和黑金青玉风格，全部内置角色立绘已替换为统一原创卡牌风格；手牌、目标、响应和当前行动者状态更清楚。Windows 用户请下载完整 ZIP 并全部解压后运行，Android 用户直接安装签名 APK。

## 发布后检查

1. 访问七牛 `version.json`，确认 `appVersion` 为 `1.4.2`，`protocolVersion` 仍为 `1.4-werewolf-2`。
2. 用无缓存请求检查 `assets/config/app-content.json` 的公告版本为 `1.4.2`。
3. 新旧 Windows 客户端各启动一次，确认热更新签名校验无错误。
4. Android 实机覆盖安装并检查横屏触控；当前机器没有 ADB 设备，此项尚未完成。
