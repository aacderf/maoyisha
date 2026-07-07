# 茂一杀 1.4.5 七牛上传清单

## 重要边界

- 七牛只更新资源和配置：`assets/`、`assets/config/app-content.json`、`version.json`、`version.sig`。
- 七牛不能更新 React/CSS/Electron/Android 代码。
- 1.4.5 的 UI、键盘、设置、密码保存和诊断改动必须通过完整 Windows ZIP 和 APK 发给用户。
- 不要上传 EXE、APK、私钥或签名密码到七牛。

## 本地差异目录

- 差异目录：`D:\AI\卡牌游戏\release\qiniu-hot-update`
- 自动清单：`D:\AI\卡牌游戏\release\qiniu-hot-update\qiniu-upload-list-1.4.5.txt`
- 远端基线：`1.4 / 2026-06-22T09:37:46.054Z`
- 差异资产：31 个；加上 `version.json`、`version.sig`，共 33 项。

## 上传顺序

1. 上传 `release\qiniu-hot-update\assets\...` 中的差异资产。
2. 上传 `release\qiniu-hot-update\assets\config\app-content.json`。
3. 上传 `release\qiniu-hot-update\version.json`。
4. 最后上传 `release\qiniu-hot-update\version.sig`。
5. 刷新下方所有对象的 CDN 缓存。

## 对象清单

```text
assets/ui/cards/guohe.jpg
assets/ui/cards/jiu.jpg
assets/ui/cards/juedou.jpg
assets/ui/cards/nanman.jpg
assets/ui/cards/sha.jpg
assets/ui/cards/shan.jpg
assets/ui/cards/shunshou.jpg
assets/ui/cards/tao.jpg
assets/ui/cards/taoyuan.jpg
assets/ui/cards/wanjian.jpg
assets/ui/cards/wuxie.jpg
assets/ui/cards/wuzhong.jpg
assets/ui/characters/builtin-bao-taihou.jpg
assets/ui/characters/builtin-deng-gou.jpg
assets/ui/characters/builtin-dorm-supervisor.jpg
assets/ui/characters/builtin-gay-guan.jpg
assets/ui/characters/builtin-haijie-dashen.jpg
assets/ui/characters/builtin-hong-xiliang.jpg
assets/ui/characters/builtin-huang-daxian.jpg
assets/ui/characters/builtin-ju-hui.jpg
assets/ui/characters/builtin-medic.jpg
assets/ui/characters/builtin-sanshui-xiansheng.jpg
assets/ui/characters/builtin-shen-zhuxi.jpg
assets/ui/characters/builtin-tianzhi-jiaozi-shen-laoban.jpg
assets/ui/characters/builtin-vanguard.jpg
assets/ui/characters/builtin-warden.jpg
assets/ui/characters/builtin-wu-mao.jpg
assets/ui/characters/builtin-yan-laoban.jpg
assets/ui/characters/builtin-yangzhi-tao.jpg
assets/ui/lobby/lobby-bg-ink-copper.jpg
assets/config/app-content.json
version.json
version.sig
```

## 给用户的文件

- `D:\AI\卡牌游戏\release\distribution\茂一杀-1.4.5-Windows-x64.zip`
- `D:\AI\卡牌游戏\release\distribution\茂一杀-1.4.5.apk`
- `D:\AI\卡牌游戏\release\distribution\SHA256SUMS.txt`
- `D:\AI\卡牌游戏\RELEASE_1.4.5.md`

## SHA-256

```text
03b4071ab6db63e3ccd7f5e5612166ac1f221367f456771f6e354a28debccf23  茂一杀-1.4.5-Windows-x64.zip
bb81e70e13b635406fa9605f1a028f59d7a17d5cf88f74fb4ab5c3e96bbd0466  茂一杀-1.4.5.apk
```
