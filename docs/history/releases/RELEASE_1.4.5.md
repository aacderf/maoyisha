# 茂一杀 1.4.5 发布说明

## 给用户的更新说明

本次更新重点修复多人对局观感、鼠标/键盘操作和重连诊断：

- 8 人局座位重新排布，右侧玩家和本方角色牌不再互相压叠。
- 玩家牌框与手牌继续优化，姓名、身份、血量、手牌数和装备信息更集中易读。
- 鼠标悬停角色时，详情面板会显示在反侧，并且不再影响鼠标感应。
- Windows 端新增键盘操作：
  - `Q/E` 切换手牌。
  - `A/D` 切换目标。
  - `Enter/Space` 确认。
  - `Esc` 取消或放弃响应。
  - `F` 结束回合。
  - `R` 手动重连。
  - `M` 打开菜单。
- 设置中新增“键位”页，可自定义键位和恢复默认。
- Windows 本机可选择加密记住邮箱和密码；Android/浏览器不会保存密码。
- 断线/重连诊断新增成功次数、失败次数、成功率和平均耗时。

## 交付文件

- Windows：`D:\AI\卡牌游戏\release\distribution\茂一杀-1.4.5-Windows-x64.zip`
- Android：`D:\AI\卡牌游戏\release\distribution\茂一杀-1.4.5.apk`
- SHA：`D:\AI\卡牌游戏\release\distribution\SHA256SUMS.txt`
- 七牛清单：`D:\AI\卡牌游戏\QINIU_UPLOAD_1.4.5.md`

## SHA-256

```text
03b4071ab6db63e3ccd7f5e5612166ac1f221367f456771f6e354a28debccf23  茂一杀-1.4.5-Windows-x64.zip
bb81e70e13b635406fa9605f1a028f59d7a17d5cf88f74fb4ab5c3e96bbd0466  茂一杀-1.4.5.apk
```

## 验证结果

- `npm run typecheck`：通过。
- `npm test`：88 项通过。
- `npm run build`：通过。
- `npm run qa:desktop`：通过。
  - 大厅 1120×720、1360×860、1920×1080 无页面滚动条。
  - 4/6/8 人对局顶部玩家完整可见。
  - 8 人局右侧座位无明显压叠。
- `npm run qa:electron`：通过。
  - 离线冷启动 2379ms。
  - 第二实例退出码 0。
  - 渲染崩溃恢复页通过。
  - 进程退出后重启 2163ms。
  - `main.log` 与 `network.log` 均生成。
- `npm run test:photon-reconnect`：通过。
- `npm run desktop:dist`：通过。
- `npm run android:apk`：通过。
- `apksigner verify --verbose --print-certs`：通过，v2 scheme 为 true。
- `npm run prepare:qiniu`：通过，差异资产 31 个。
- `npm run release:package`：通过。

## 已知限制

- 本机 PATH 中没有 `adb`，未完成 Android 实体机安装和真实触控验收。
- 未做长时间公网多人断联概率统计；1.4.5 已内置本机重连指标，后续可收集真实玩家日志。
- Vite 仍提示主包和 Agora 分包超过 500KB；后续应继续拆分 `App.tsx`。
