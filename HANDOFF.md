# 茂一杀交接摘要

## 当前状态

- 项目目录：`D:\AI\卡牌游戏`
- 当前版本：`1.5.10`
- 本轮范围：双风格战斗特效、出牌拖尾、光标扩展、练习场人机先手修复、Windows 完整包与累积更新包。
- 未改动：Photon 协议、CloudBase 环境、Android。
- Photon 协议仍为：`1.4-werewolf-2`
- 当前目录不是 Git 仓库，不能依赖 Git 回滚。

## 2026-07-07 1.5.10 交付记录

- 新增 `battleVfxStyle` 设置：`guofeng` / `anime`，大厅设置和局内设置均可切换。
- 战斗特效清单改为双风格 manifest；国风版叠加金色笔触、墨迹、冲击光和毒雾调色，动画版保留上一版清透 Effekseer 序列帧。
- 新增 `CardFlightLayer`，出牌时按 `lastCardVoice` 的出牌人和目标生成卡牌飞向牌桌、拖尾、残影和落点反馈。
- 光标新增 Silver Wolf、流萤、普通指针 V1.5，设置项继续支持 60%–160% 大小与粒子/樱花/关闭拖尾。
- 练习场启动时先调用 `runPracticeAi`，避免人机先手导致玩家无法操作。
- 已验证：`npm run typecheck`、`npm test`、`npm run qa:desktop`、`npm run qa:vfx`、`npm run qa:cursor`。
- 截图目录：`tmp/battle-vfx-qa/`、`tmp/cursor-qa/`、`tmp/desktop-qa/`。

## 本轮 UI 修复

- 角色牌固定宽高，hover、当前行动者、目标、拖拽经过均不改变尺寸、坐标或缩放。
- 目标选择统一为点击角色牌。
- 被选目标只显示整张角色牌绿色外沿氛围光。
- 当前行动者保留金色整卡外光，避免和目标绿光混用。
- 隐藏桌面端旧目标连线、小绿圈和 `targeting-beam`。
- 血条改为角色牌顶部横向小心形点。
- 角色名和玩家昵称移到角色牌左侧外部，两列竖排显示。
- 角色图扩大为卡面主体。
- 阵营、身份、手牌数缩小；身份颜色按主公、忠臣、反贼、内奸、未知及双队区分。
- 装备/标记槽只显示底部小图标，避免文字挤出卡面。
- 恢复电脑版 `enableDragPlay=true` 时的 HTML5 `draggable=true` 入口。
- 清理 `styles.css` 旧版重复覆盖块，只保留当前电脑版最终样式块。
- 修复 `gamePieces.tsx` 阶段、花色、阵营、响应、卡牌类型、按钮文字乱码。

## 本轮打包与整理

- 已运行：`npm run desktop:dist`
- Windows 完整包目录：`D:\AI\卡牌游戏\交付\1.5.3\茂一杀-1.5.3-Windows-x64`
- Windows ZIP：`D:\AI\卡牌游戏\交付\1.5.3\茂一杀-1.5.3-Windows-x64.zip`
- SHA-256：`D:\AI\卡牌游戏\交付\1.5.3\SHA256SUMS-茂一杀-1.5.3.txt`
- 同步副本：`D:\AI\卡牌游戏\release\distribution`
- ZIP 根目录已确认包含：`茂一杀.exe`

## 已清理内容

- 删除旧交付目录：`交付\1.5.0`
- 删除旧发布说明：`RELEASE_1.4.8.md`、`RELEASE_1.4.9.md`、`RELEASE_1.5.0.md`、`RELEASE_1.5.2.md`
- 删除旧 distribution 产物：1.5.2 ZIP、APK、离线更新包、校验文件。
- 删除旧离线更新目录：`release\offline-update`
- 删除旧 Android APK：`release\android\茂一杀-1.5.2.apk`
- 删除旧临时目录：`tmp`
- 删除旧 baseline：1.4.8、1.4.9、1.5.0、1.5.2
- 保留当前 baseline：`release\baselines\1.5.3\manifest.json`

## 验证结果

- `npm run desktop:dist`：通过。
- 生产构建：通过。
- Electron `win-unpacked`：已生成。
- ZIP 根目录：已确认有 `茂一杀.exe`。
- 旧版本残留扫描：`old-version-hits=0`。
- SHA 文件已改为 UTF-8，中文文件名正常显示。

## 本轮未做

- 未构建 APK。
- 未生成离线更新器。
- 未修改联机重连逻辑。
- 未改规则平衡。

## 2026-07-03 1.5.3 Windows 整包交付记录

- 已完成电脑版标准对局修复后打包，未重新构建 Android/APK。
- 验证：`npm run typecheck` 通过；`npm test -w @cardgame/web -- --run` 21 项通过；`npm run qa:desktop` 通过 1120×720、1360×860、1920×1080 桌面截图检查。
- 交互专项：点击角色牌可选目标；目标使用整卡绿色外沿光；手牌可拖到中心向当前目标出牌；自己角色牌 hover 不带动角色牌或手牌位移；战况不遮挡菜单。
- Windows 整包：`release/distribution/茂一杀-1.5.3-Windows-x64.zip`，解压第一层包含 `茂一杀.exe`、`assets/`、`resources/`、`version.json`、`version.sig`。
- 累积更新包：`release/distribution/茂一杀累积更新-1.3-to-1.5.3-Windows-x64.zip`，最低基准 1.3，按 SHA-256 补齐缺失/不一致文件。
- 交付归档：`交付/1.5.3/`；同时复制到 `D:\AI` 方便直接发送。
- 剩余说明：本轮只处理 Windows 电脑版；Android 包未更新。

## 1.5.3 Windows 整包修复记录（2026-07-03 22:34:05）

- 修复角色 hover 详情面板：移除重复装备/状态区，保留基础信息、kg 标记和技能全文。
- 恢复桌面大厅为固定一屏场景式主界面，隐藏外层裸顶栏和重复快捷入口。
- 生成 Windows 完整包与 1.3 起累积离线更新包；本轮未构建 Android。
- 验证：typecheck、Web 21 项单测、Web build、qa:desktop、desktop:dist、offline updater smoke、qa:electron 均通过。
- 交付：D:\AI\茂一杀-1.5.3-Windows-x64.zip；D:\AI\-1.3-to-1.5.3-Windows-x64.zip。

## 1.5.3 Windows 整包最终校正（2026-07-03 22:49:16）

- 已重新生成有效完整 Windows ZIP，大小约 216.37 MB；解压第一层包含 ${app}.exe。
- 已复制累积离线更新包：D:\AI\茂一杀累积更新-1.3-to-1.5.3-Windows-x64.zip。
- 已重写 SHA256SUMS，包含完整 ZIP 与累积更新 ZIP。

## 1.5.3 Windows 整包最终更新（2026-07-04 10:52）

- 角色 hover 详情恢复装备/判定文字栏：武器、防具、进攻马、防御马、判定区可直接查看。
- hover 面板保留技能全文，去掉重复阵营/装备长句，避免技能正文被挤压。
- 大厅固定一屏主界面继续保留；减弱暗罩，模式入口增加金属底板、描边和层次。
- 已重新构建 Windows 桌面包：`npm run desktop:dist` 通过。
- 已重新生成累积离线更新包：`npm run release:offline-update -- --minimum 1.3 --to 1.5.3` 通过。
- 已验证：`npm run test:offline-updater` 通过；`npm run qa:electron` 通过，离线冷启动 3295ms，崩溃恢复页可用，日志生成正常。
- 当前交付文件：
  - `D:\AI\茂一杀-1.5.3-Windows-x64.zip`
  - `D:\AI\茂一杀-1.5.3-Windows-x64\茂一杀.exe`
  - `D:\AI\茂一杀累积更新-1.3-to-1.5.3-Windows-x64.zip`
  - `D:\AI\SHA256SUMS-茂一杀-1.5.3.txt`
- SHA-256：
  - `734705294ad7f0f68d592d6c6fc3c56a0694a92bd0c736af7e01ce19b5b93d47  茂一杀-1.5.3-Windows-x64.zip`
  - `75b6effef1886067efb4e8ffda50ee2ff92db387e3c9d95f3ae675284c7bc39b  茂一杀累积更新-1.3-to-1.5.3-Windows-x64.zip`
- 本轮只做 Windows；未构建 Android/APK。

## 1.5.4 Windows 战斗特效整包（2026-07-04 19:50）

- 重做对局表现层特效：出牌飞牌、刀光/火焰/雷纹、治疗光晕、无懈封印、阶段牌匾、落败印章。
- `effectIntensity` 已支持 `off / low / normal / high`；关闭时不派生本地特效事件。
- 保持 `GameState`、`GameAction`、Photon 协议 `1.4-werewolf-2`、CloudBase 数据不变。
- 版本升到 `1.5.4`；本轮只构建 Windows，未构建 Android/APK。
- 验证通过：
  - `npm run typecheck`
  - `npm test -w @cardgame/web`：22 项通过
  - `npm test`：89 项通过
  - `npm run build`
  - `npm run qa:desktop`
  - `npm run qa:electron`
  - `npm run desktop:dist`
  - `npm run release:offline-update -- --minimum 1.3 --to 1.5.4`
  - `npm run test:offline-updater`
- 交付目录已整理为：`D:\AI\卡牌游戏\交付\1.5.4`
- Windows 完整包：`D:\AI\卡牌游戏\交付\1.5.4\茂一杀-1.5.4-Windows-x64.zip`
- 累积更新包：`D:\AI\卡牌游戏\交付\1.5.4\茂一杀累积更新-1.3-to-1.5.4-Windows-x64.zip`
- SHA 文件：`D:\AI\卡牌游戏\交付\1.5.4\SHA256SUMS-茂一杀-1.5.4.txt`
- 电脑版解压副本：`D:\AI\卡牌游戏电脑版\茂一杀.exe`
- 已清理：`D:\AI` 顶层无散落茂一杀包；`交付` 只保留 `1.5.4`；`release` 旧 1.5.3 分发、离线更新、baseline 已删除。

## 1.5.5 Windows 联机重连与房间修复整包（2026-07-05 03:21）

- 版本升到 `1.5.5`；本轮只构建 Windows/电脑版，未构建 Android/APK。
- Photon 重连：
  - `reconnectAndRejoin()` 增加 9 秒 watchdog，超时会断开并进入下一轮退避重试。
  - `onError` 只对网络/连接类错误和房间 Join/Rejoin 错误触发重连；普通操作错误不再卡进重连态。
  - 保留 32746 / 32749 / 32748 / 32758 分流语义。
- 狼人杀房间：
  - 主动离开进入离开代际状态，迟到的房间/狼人杀回调不会把界面拉回旧房间。
  - 房主离开未开始狼人杀等待房时，会先隐藏房间、关闭加入并标记 `finished`。
  - 创建/加入不匹配房间时按主动离开处理，清理本地恢复态。
- 加入房间：
  - 大厅“加入”面板直接展示当前可加入公开房间。
  - 房间列表过滤空房、不可见、不可加入、已结束、协议/逻辑版本不匹配房间。
- 对局特效：
  - `effectIntensity` 默认仍为 `normal`。
  - 设置面板新增“播放特效测试”：杀、火杀、雷杀、桃、无懈、阶段、击败。
  - 特效层强制 `pointer-events:none`，不阻挡点击和拖拽。
- 验证通过：
  - `npm run typecheck`
  - `npm test -w @cardgame/web`：23 项通过
  - `npm run build -w @cardgame/web`
  - `npm run qa:desktop`
  - `npm run test:photon-reconnect`
  - `npm run desktop:dist`
  - `npm run qa:electron`：离线冷启动 2098ms，第二实例、崩溃恢复页、日志生成通过
  - `npm run release:offline-update -- --minimum 1.3 --to 1.5.5`
  - `npm run test:offline-updater`
- 交付目录：`D:\AI\卡牌游戏\交付\1.5.5`
- 已清理旧交付目录：`D:\AI\卡牌游戏\交付\1.5.4`
- Windows 完整包：`D:\AI\卡牌游戏\交付\1.5.5\茂一杀-1.5.5-Windows-x64.zip`
- 累积更新包：`D:\AI\卡牌游戏\交付\1.5.5\茂一杀累积更新-1.3-to-1.5.5-Windows-x64.zip`
- SHA 文件：`D:\AI\卡牌游戏\交付\1.5.5\SHA256SUMS-茂一杀-1.5.5.txt`
- 电脑版解压副本：`D:\AI\卡牌游戏电脑版\茂一杀.exe`
- SHA-256：
  - `e6026b8a27e5e7cdb59861a5457a5bb8a8bdc76291dc1e235a293b5ab0200713  茂一杀-1.5.5-Windows-x64.zip`
  - `7141b174bf276055ddc313086f7510099b653988e93d7c800821a46753925454  茂一杀累积更新-1.3-to-1.5.5-Windows-x64.zip`

## 1.5.6 Windows 建房在线状态与战斗特效整包（2026-07-05 13:16）

- 版本升到 `1.5.6`；本轮只构建 Windows/电脑版，未构建 Android/APK。
- Photon 建房修复：
  - 确认创建房间时会出现 `ConnectingToGameserver`、短暂 `Disconnected`、再 `Joined` 的正常切服流程。
  - `onStateChange` 对预期房间切服状态不再发出 `ready:false / offline`，避免“一创建房间立刻离线”。
  - 新增 `roomSwitchInProgress` 与 `isExpectedRoomSwitchState()`，只在建房/加房/重连切服期间宽容中间态，真实错误仍走原重连/错误流程。
  - 新增真实 Photon 建房脚本：`npm run test:photon-create`。
- 重连验证：
  - `npm run test:photon-reconnect` 通过，双客户端断开后 Rejoin 成功。
  - 保留 1.5.5 的 watchdog 与 Join/Rejoin 错误分流。
- 对局特效：
  - `BattleEffectsLayer` 增加飞牌光晕、牌符、粒子、目标局部命中特效。
  - CSS 升级为多层刀光、火焰、雷纹、青玉治疗、无懈封印、阶段/击败表现。
  - 特效层继续 `pointer-events:none`，不阻挡点击、拖拽和出牌。
- 验证通过：
  - `npm run typecheck`
  - `npm test`：共享包 67 项、Web 23 项通过
  - `npm run test:photon-create`
  - `npm run test:photon-reconnect`
  - `npm run qa:desktop`
  - `npm run qa:electron`：离线冷启动 2050ms，第二实例、崩溃恢复页、日志生成通过
  - `npm run desktop:dist`
  - `npm run release:package`
  - `npm run release:offline-update -- --minimum 1.3 --to 1.5.6`
  - `npm run test:offline-updater`
- 交付目录：`D:\AI\卡牌游戏\交付\1.5.6`
- 已清理旧交付目录：`D:\AI\卡牌游戏\交付\1.5.5`
- Windows 完整包：`D:\AI\卡牌游戏\交付\1.5.6\茂一杀-1.5.6-Windows-x64.zip`
- 累积更新包：`D:\AI\卡牌游戏\交付\1.5.6\茂一杀累积更新-1.3-to-1.5.6-Windows-x64.zip`
- SHA 文件：`D:\AI\卡牌游戏\交付\1.5.6\SHA256SUMS-茂一杀-1.5.6.txt`
- 电脑版解压副本：`D:\AI\卡牌游戏电脑版\茂一杀.exe`
- SHA-256：
  - `a30743b700ba1936fc8331ddf14effa4791bb61ad20ed21d528b439f98facb59  茂一杀-1.5.6-Windows-x64.zip`
  - `cb15d219de21afdf70de5966950f9ab8f27b4742bd1292c5a00956965b707867  茂一杀累积更新-1.3-to-1.5.6-Windows-x64.zip`

## 1.5.7 Windows 房间切换重连与大厅视频整包（2026-07-05）

- 版本升到 `1.5.7`；本轮只构建 Windows/电脑版，未构建 Android/APK。
- Photon 房间生命周期修复：
  - 创建房间、退出房间、重回上局期间的受控切服状态不再被误判为断线。
  - `leaveRoom` 清理旧恢复目标和迟到回调，回大厅时显示连接中/已连接状态，不再进入无意义重连。
  - 进房/恢复期间统一使用受控状态提示；真实错误仍走原 Join/Rejoin 分流和 watchdog。
- 大厅视频：
  - 新增 `assets/ui/lobby/lobby-loop.mp4`，大厅左侧圆角视频框自动静音循环播放。
  - 大标题收纳为小标题，原红框区域让给视频。
  - 设置面板新增“大 厅循环视频”开关；减少动画模式下自动降级为静态图。
  - Electron 本地服务器补充 `.mp4` MIME。
- 验证通过：
  - `npm run typecheck`
  - `npm test`：共享包 67 项、Web 23 项通过
  - `npm run build`
  - `npm run test:photon-reconnect`
  - `npm run test:photon-create`
  - `npm run qa:desktop`
  - `npm run qa:electron`：离线冷启动 3117ms，第二实例、崩溃恢复页、日志生成通过
  - `npm run desktop:dist`
  - `npm run release:package`
  - `npm run release:offline-update -- --minimum 1.3 --to 1.5.7`
  - `npm run test:offline-updater`
- 交付目录：`D:\AI\卡牌游戏\交付\1.5.7`
- 已清理旧交付目录：`D:\AI\卡牌游戏\交付\1.5.6`
- Windows 完整包：`D:\AI\卡牌游戏\交付\1.5.7\茂一杀-1.5.7-Windows-x64.zip`
- 累积更新包：`D:\AI\卡牌游戏\交付\1.5.7\茂一杀累积更新-1.3-to-1.5.7-Windows-x64.zip`
- SHA 文件：`D:\AI\卡牌游戏\交付\1.5.7\SHA256SUMS-茂一杀-1.5.7.txt`
- 电脑版解压副本：`D:\AI\卡牌游戏电脑版\茂一杀.exe`

## 1.5.7 追加角色与大厅视频开关修复（2026-07-05）

- 新增角色：土豆、cjj、杨嗨厌，角色图来自 `D:\AI\生图` 并复制到 `assets/ui/characters/`。
- 规则已接入：土豆“生根/发芽”、cjj“试管/粉笔”、杨嗨厌“笑里藏刀/巧舌如簧”。
- 前端已接入技能按钮、标记显示和练习场 AI pending 处理。
- 修复设置关闭“大 厅循环视频”后仍保留视频框的问题：关闭时不再渲染视频框。
- 验证通过：
  - `npm run typecheck`
  - `npm test`：共享包 70 项、Web 23 项通过
  - `npm run build`

## 1.5.7 追加角色后重新整包（2026-07-06）

- 已重新构建 Windows/电脑版整包，包含土豆、cjj、杨嗨厌与大厅循环视频开关修复。
- 验证通过：
  - `npm run build`
  - `npm run desktop:dist`
  - `npm run release:package`
  - `npm run release:offline-update -- --minimum 1.3 --to 1.5.7`
  - `npm run test:offline-updater`
  - `npm test`：共享包 70 项、Web 23 项通过
  - `npm run typecheck`
- 交付目录：`D:\AI\卡牌游戏\交付\1.5.7`
- Windows 完整包：`D:\AI\卡牌游戏\交付\1.5.7\茂一杀-1.5.7-Windows-x64.zip`
- 累积更新包：`D:\AI\卡牌游戏\交付\1.5.7\茂一杀累积更新-1.3-to-1.5.7-Windows-x64.zip`
- SHA 文件：`D:\AI\卡牌游戏\交付\1.5.7\SHA256SUMS-茂一杀-1.5.7.txt`
- 电脑版解压副本：`D:\AI\卡牌游戏电脑版\茂一杀.exe`
- SHA-256：
  - `2eeafb96bb0d619900499427f8d870c6fd00456d7ab93736917fc4f672990ca1  茂一杀-1.5.7-Windows-x64.zip`
  - `7cbb14c64f8ab8623e7fac3b08c84cabb0a6739c7884b5c24d1d39ee99798539  茂一杀累积更新-1.3-to-1.5.7-Windows-x64.zip`
## 1.5.8 牌桌特效与交互优化（2026-07-06）

- 统一短促国风牌桌特效：出牌、命中、火/雷/回复/无懈、毒、阶段、阵亡、点击反馈。
- 修复 cjj「试管」选牌/选目标确认流程与毒标记提示。
- 修复武将悬停面板残留，调整 4/6/8 人身份、名字及座位布局。
- 加入大黄蜂/罗小黑两套桌面光标与设置开关。
- 新增 `npm run qa:vfx` 特效截图回归。
- CraftPix 仅作视觉参考，未打包其登录下载素材。
- `typecheck`、94 项测试、桌面布局、VFX 截图、Electron 冷启动和累积更新回归均通过。
- 交付目录：`D:\AI\卡牌游戏\交付\1.5.8`
- SHA-256：
  - `d0cf0ef116515704060fae442f936bbb1eac83b31630cd24d6c92764b6232e75  茂一杀-1.5.8-Windows-x64.zip`
  - `cb94cc66f7fa3149bdae73935e09caf304915aa33efbbe8095d57db630260cec  茂一杀累积更新-1.3-to-1.5.8-Windows-x64.zip`

## 1.5.9 开源特效、光标与持久化修复（2026-07-06）

- 删除 Pixi `Graphics` 手绘牌桌特效，改用 Effekseer 官方 CC0 的 256×256、30fps、24 帧图集。
- `BattleVfxCanvas` 改为 Pixi `AnimatedSprite`，素材失败时保留文字/数值反馈，并限制最多 4 个并发特效。
- 罗小黑 ANI 解析为 18 帧 PNG；新增 DOM 光标层、60%–160% 大小和粒子/樱花/关闭跟随设置。
- 全窗口隐藏原生光标，已验证大厅底栏“卡牌”“公告”及 SVG 区域不会恢复系统光标。
- Electron 新增 `userData/persistent-storage.json` 桥接，设置、最近房间和 UI 状态不再受随机本地端口影响。
- 记住密码继续使用 Windows `safeStorage` 密文，重启后只填入密码，不自动登录。
- 验证通过：`typecheck`、99 项测试、桌面布局、VFX 截图、光标截图、Electron 冷启动/重启、累积更新。
- 交付目录：`D:\AI\卡牌游戏\交付\1.5.9`
- SHA-256：
  - `686df1e299b6185bdc3b42e5c22ed69196b95ff90ea70366097e7474cb9edee6  茂一杀-1.5.9-Windows-x64.zip`
  - `16c5573117d1abd8fc79181879fc2ba983e69abde6fee5802ee6588189b86119  茂一杀累积更新-1.3-to-1.5.9-Windows-x64.zip`
