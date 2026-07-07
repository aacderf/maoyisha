# 茂一杀热更新与七牛云发布说明

## 结论

七牛云不需要上传 EXE，也不建议上传 EXE。

EXE 是主程序，只在你重新改 Electron、CloudBase、Photon、热更代码这些“程序本体”时重新打包发给玩家。七牛云只放热更新资源：

```text
version.json
version.sig
assets/
```

玩家拿到一次支持热更新的新版 EXE 后，之后打开游戏会自动从七牛云检查这些资源。

## 七牛测试域名

七牛测试域名通常只支持 HTTP，不支持 HTTPS。本项目已按 HTTP 测试域名配置：

```js
const REMOTE_BASE_URL = "http://tgme05dcw.hn-bkt.clouddn.com";
```

公开空间下载路径规则是：

```text
http://你的域名/对象key
```

所以如果对象 key 是 `version.json`，浏览器访问地址就是：

```text
http://tgme05dcw.hn-bkt.clouddn.com/version.json
```

如果这里显示 `{"error":"Document not found"}`，说明七牛 bucket 里没有 key 为 `version.json` 的文件，或者你把它上传到了某个子文件夹里。

## 本地生成七牛上传包

在项目根目录运行：

```powershell
cd /d D:\AI\卡牌游戏
npm run prepare:qiniu
```

生成目录：

```text
D:\AI\卡牌游戏\release\qiniu-hot-update
```

这个目录就是专门给七牛上传用的。不要上传 EXE。

## 七牛应该上传什么

上传 `D:\AI\卡牌游戏\release\qiniu-hot-update` 里面的内容，并保持路径不变：

```text
version.json
version.sig
assets/config/app-content.json
assets/config/cards.json
assets/config/characters.json
assets/config/werewolf-roles.json
assets/config/werewolf-presets.json
assets/logic/rules.bundle.js
assets/logic/shared/...
assets/ui/...
assets/audio/...
```

七牛里的 key 必须这样：

```text
version.json
version.sig
assets/config/app-content.json
assets/logic/rules.bundle.js
```

不要变成：

```text
qiniu-hot-update/version.json
release/qiniu-hot-update/version.json
assets/assets/config/app-content.json
```

## 上传顺序

1. 先上传 `assets/` 里的所有变更文件。
2. 最后上传 `version.json`。
3. 最后上传 `version.sig`。
4. 浏览器验证下面两个地址能打开：

```text
http://tgme05dcw.hn-bkt.clouddn.com/version.json
http://tgme05dcw.hn-bkt.clouddn.com/version.sig
```

如果使用 CDN 缓存，上传后刷新 `version.json`、`version.sig` 和本次改过的资源文件。

## 什么时候要重新发 EXE

这些情况要重新打包 EXE 发给玩家：

- 改了 `apps/desktop/main.cjs`
- 改了 CloudBase 登录代码
- 改了 Photon 连接代码
- 改了热更新代码
- 改了 Electron 打包配置
- 改了前端主程序结构
- 首次加入狼人杀状态机、Photon 私有事件或狼队语音频道

这些情况只需要七牛热更新：

- 加新角色
- 改角色技能
- 改牌局规则
- 改锦囊、装备、判定逻辑
- 改版本公告
- 改图片、音效、背景音乐
- 改 UI 皮肤资源
- 在现有狼人杀状态机范围内调整角色说明、板型和规则包

## Windows 打包命令

```powershell
cd /d D:\AI\卡牌游戏
npm test
npm run typecheck
npm run desktop:dist
```

打包后的玩家目录结构应该是：

```text
茂一杀.exe
assets/
version.json
version.sig
```

## 注意

- `hot_update_private_key.pem` 是本机私钥，不上传七牛，不发给玩家。
- `version.sig` 必须由 `npm run build:manifest` 或 `build_manifest.py` 生成。
- 七牛测试域名会过期，正式发布建议绑定自己的域名。
- 七牛热更新不能替代 EXE 分发；它只更新资源和外置规则包。
