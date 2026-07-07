# 茂一杀 1.4.6 发布说明

## 本次重点

- 交付目录整理：Windows ZIP 解压后第一层直接包含 `茂一杀.exe`，不再把旧安装器、源码、临时目录和中间产物塞给玩家。
- 新增离线更新器：你可以把 `茂一杀离线更新-<旧版本>-to-<新版本>-Windows-x64.zip` 发给玩家，玩家无需联网即可更新本地游戏目录。
- 新增更新备份与回滚：更新器替换文件前会备份到 `.maoyisha-backup/`，失败时自动回滚。
- 对局 UI 再修：角色图更大，姓名/体力/手牌数分层显示；手牌改成纸牌式布局，选中操作按钮浮出，不再压住牌面。
- Android 版本升级到 `versionName 1.4.6`、`versionCode 14008`。

## 给玩家的文件

- 完整 Windows 包：`release/distribution/茂一杀-1.4.6-Windows-x64.zip`
- Android 安装包：`release/distribution/茂一杀-1.4.6.apk`
- 离线更新包：
  - `release/distribution/茂一杀离线更新-1.4-to-1.4.6-Windows-x64.zip`
  - `release/distribution/茂一杀离线更新-1.3-to-1.4.6-Windows-x64.zip`
- 校验文件：`release/distribution/SHA256SUMS.txt`

已额外复制到 `D:\AI` 一级，方便直接发给用户：

- `D:\AI\茂一杀-1.4.6-Windows-x64\茂一杀.exe`
- `D:\AI\茂一杀-1.4.6-Windows-x64.zip`
- `D:\AI\茂一杀-1.4.6.apk`
- `D:\AI\茂一杀离线更新-1.4-to-1.4.6-Windows-x64.zip`
- `D:\AI\茂一杀离线更新-1.3-to-1.4.6-Windows-x64.zip`
- `D:\AI\SHA256SUMS-茂一杀-1.4.6.txt`

## 玩家使用方法

### 完整包

1. 解压 `茂一杀-1.4.6-Windows-x64.zip`。
2. 直接运行解压目录第一层的 `茂一杀.exe`。
3. 不要只复制 EXE；`resources/`、`assets/`、`version.json`、`version.sig` 必须同目录保留。

### 离线更新包

1. 完全关闭茂一杀。
2. 解压离线更新包。
3. 运行 `茂一杀更新器.exe`。
4. 选择旧版茂一杀目录，也就是包含 `茂一杀.exe` 和 `version.json` 的目录。
5. 点击“开始更新”。

## 七牛云说明

- 七牛仍只上传 `assets/`、`version.json`、`version.sig` 这类资源热更新文件。
- 不向七牛上传 EXE、APK、私钥、签名密码或离线更新器。
- 如果本次改动包含 Electron、React/CSS、登录、Photon、更新器、主程序结构，必须发完整 Windows ZIP 或离线更新包。

## 本轮验证

- `npm run typecheck`：通过。
- `npm test`：88 项通过。
- `npm run build`：通过。
- `npm run qa:desktop`：通过，1120×720、1360×860、1920×1080 大厅无滚动条，4/6/8 人局无顶部遮挡，手牌区未超高。
- `npm run qa:electron`：通过；离线冷启动 2115ms，第二实例退出码 0，渲染崩溃恢复页通过，日志生成正常。
- `npm run desktop:dist`：通过。
- `npm run android:apk`：通过。
- `apksigner verify --verbose --print-certs`：通过，v2 scheme true。
- `npm run release:package`：通过。
- `npm run release:offline-update -- --from 1.4 --to 1.4.6 --from-dir "D:\AI\成品\卡牌游戏\release\win-unpacked"`：通过。
- `npm run release:offline-update -- --from 1.3 --to 1.4.6`：通过。
- `MAOYI_UPDATER_TEST_FROM=1.3 npm run test:offline-updater`：通过。
- `MAOYI_UPDATER_TEST_FROM=1.4 npm run test:offline-updater`：通过。
- 真实旧包更新测试：复制 `D:\AI\成品\卡牌游戏\release\win-unpacked` 后用 `1.4 -> 1.4.6` 更新器升级，通过；升级后 5499 个文件 SHA-256 与当前基线一致。

## SHA-256

```text
ebf2f2019f8e8798d62ce2a06bfea3bdcfe6f62a8505fa39513df159d30366fa  茂一杀-1.4.6-Windows-x64.zip
f086f5be965d1fe5b8ea079a9a38e41a3b28f665bd4c317fb0be52bc82336383  茂一杀-1.4.6.apk
eea8dc97e3fd52f0b2502b7da49c07adc1f39d25a12110e9405eb1f64e4bc174  茂一杀离线更新-1.4-to-1.4.6-Windows-x64.zip
170be73a1380ae2619e097269e35dd84a92a294887a4f39d1ea83253aed81b7f  茂一杀离线更新-1.3-to-1.4.6-Windows-x64.zip
```
