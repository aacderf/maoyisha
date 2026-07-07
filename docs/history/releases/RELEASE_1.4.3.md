# 茂一杀 1.4.3 发布说明

## 本次更新

- 大厅重做为固定一屏游戏主菜单，取消整页滚动和网页式大字 Hero。
- 新增原创墨黑铜金大厅背景：`assets/ui/lobby/lobby-bg-ink-copper.jpg`。
- 模式入口改为图标牌匾：茂一杀、狼人杀、练习场、重回上局。
- 房间列表、公告、建房、加入、账号和工具进入弹层/抽屉。
- 对局顶部 HUD 压缩到 52px，并修复顶部玩家被遮挡问题。
- 手牌区缩小，桌面实测 158–186px。
- 设置面板补齐画面、对局、音频、联机、热更新、账号/诊断分组。

## 版本

- App：`1.4.3`
- Android `versionCode`：`14005`
- Android `versionName`：`1.4.3`
- Photon 协议：`1.4-werewolf-2`（未变）
- 热更新 manifest 生成时间：`2026-06-30T09:22:53.990Z`

## 给用户的文件

必须给完整文件，不要只发 EXE：

- `D:\AI\卡牌游戏\release\distribution\茂一杀-1.4.3-Windows-x64.zip`
- `D:\AI\卡牌游戏\release\distribution\茂一杀-1.4.3.apk`
- `D:\AI\卡牌游戏\release\distribution\SHA256SUMS.txt`

## SHA-256

```text
32e655614ff0c0223c82ecf94588443344ee7dea3980bd1636eaed1314dfc01e  茂一杀-1.4.3-Windows-x64.zip
046ad7bb09f78f3df4796356ee61bbf725f1cb1f1d894016d89b9f4bfadbcfe6  茂一杀-1.4.3.apk
```

## 已执行验证

- `npm run typecheck`：通过。
- `npm test`：83 项通过。
- `npm run build`：通过。
- `npm run qa:desktop`：通过。
  - 1120×720、1360×860、1920×1080 大厅无滚动条。
  - 4/6/8 人标准练习局顶部玩家完整可见。
  - 手牌区高度 158.39px、186px、186px。
- `npm run qa:electron`：通过，离线冷启动 1937ms，第二实例退出码 0，渲染崩溃恢复页和日志生成通过。
- `npm run desktop:dist`：通过。
- `npm run android:apk`：通过。
- APK 签名验证：`apksigner` v2 scheme true。
- `npm run prepare:qiniu`：通过。
- `npm run release:package`：通过。

## 未完成验收

- 当前本机未找到 `adb`，Android 实体机安装、16:9/20:9 真实触控检查未完成。

## 给玩家的简短更新文案

1.4.3 主要重做大厅和对局可视区：大厅改为固定一屏主菜单，新增墨黑铜金场景背景；对局顶部玩家不再被 HUD 遮挡，手牌区更紧凑；设置面板新增画面、对局、音频、联机、热更新和诊断分组。
