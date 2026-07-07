# 七牛上传清单 1.4.3

## 结论

七牛只上传热更新资源，不能上传 React/CSS/Electron/Android 代码。1.4.3 的 UI 返工属于代码改动，所以必须同时把完整 Windows ZIP 和签名 APK 发给用户。

## 本次七牛差异

- 远端基线：`1.4 / 2026-06-22T09:37:46.054Z`
- 差异资产：31 个
- 七牛目录：`D:\AI\卡牌游戏\release\qiniu-hot-update`
- 自动清单：`D:\AI\卡牌游戏\release\qiniu-hot-update\qiniu-upload-list-1.4.3.txt`

## 上传顺序

先上传以下 assets 文件：

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
```

然后上传：

```text
assets/config/app-content.json
version.json
version.sig
```

`version.sig` 必须最后上传。

## CDN 刷新

上传后刷新上述所有对象的 CDN 缓存，至少包括：

- `assets/config/app-content.json`
- `assets/ui/lobby/lobby-bg-ink-copper.jpg`
- `version.json`
- `version.sig`
- 本清单列出的所有 cards/characters 图片。

## 不要上传

- 不要上传 EXE。
- 不要上传 APK。
- 不要上传 Android keystore、签名密码、CloudBase 密钥、Agora Certificate。
- 不要指望七牛修复大厅/对局 UI 代码；代码变更只能通过完整客户端包生效。
