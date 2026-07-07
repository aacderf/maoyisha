# 茂一杀 1.5.3 Windows 整包

## 本次修复

- 角色 hover 详情恢复装备/判定文字栏：武器、防具、进攻马、防御马、判定区可直接看见。
- hover 面板继续保留技能说明，去掉重复的阵营/装备拼接长句，避免技能正文被挤掉。
- 大厅恢复固定一屏场景式主界面，并减弱暗罩；模式入口增加金属底板、描边和层次。
- 本轮只更新 Windows 电脑版；未构建 Android/APK。

## 验证结果

- `npm run typecheck`：通过
- `npm test -w @cardgame/web -- --run`：21 项通过
- `npm run qa:desktop`：通过，大厅 1120×720 / 1360×860 / 1920×1080 可用
- `npm run desktop:dist`：通过
- `npm run release:offline-update -- --minimum 1.3 --to 1.5.3`：通过
- `npm run test:offline-updater`：通过
- `npm run qa:electron`：通过，离线冷启动 3295ms，崩溃恢复页可用，日志生成正常

## 交付文件

- `D:\AI\茂一杀-1.5.3-Windows-x64.zip`
- `D:\AI\茂一杀-1.5.3-Windows-x64\茂一杀.exe`
- `D:\AI\茂一杀累积更新-1.3-to-1.5.3-Windows-x64.zip`
- `D:\AI\SHA256SUMS-茂一杀-1.5.3.txt`

## SHA-256

```text
734705294ad7f0f68d592d6c6fc3c56a0694a92bd0c736af7e01ce19b5b93d47  茂一杀-1.5.3-Windows-x64.zip
75b6effef1886067efb4e8ffda50ee2ff92db387e3c9d95f3ae675284c7bc39b  茂一杀累积更新-1.3-to-1.5.3-Windows-x64.zip
```

## 用户说明

- 完整包：解压后运行第一层 `茂一杀.exe`，不要只发 EXE。
- 离线更新包：关闭游戏后运行 `茂一杀更新器.exe`，选择旧游戏目录升级。
