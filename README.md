# 茂一杀

茂一杀是一个 Electron/Android 跨平台卡牌游戏：CloudBase 负责账号、卡牌收发和声网 RTC Token，Photon Cloud 负责跨城市房间、聊天、礼物和对局同步，前端使用 React + Vite。

## 本机运行

```powershell
npm install
npm run dev
```

- Web dev: `http://localhost:5173`
- 不需要启动自建账号服务器。
- CloudBase 免费体验版如限制 Web 安全来源，请优先用 localhost 运行。

CloudBase 前端参数放在 `apps/web/.env`，可参考 `apps/web/.env.example`：

```env
VITE_CLOUDBASE_ENV_ID=card-game-auth-d1gesqyiz6c7e59bd
VITE_CLOUDBASE_REGION=ap-shanghai
VITE_CLOUDBASE_ACCESS_KEY=控制台生成的匿名访问令牌
```

`VITE_CLOUDBASE_ACCESS_KEY` 是 CloudBase 控制台“前端框架 / React(Vite)”接入指引里的匿名访问令牌，不是后端 `secretId/secretKey`。

## EXE 运行

免安装版位置：

```text
D:\AI\卡牌游戏\release\win-unpacked\茂一杀.exe
```

EXE 不启动本机服务；账号走 CloudBase，联机牌局走 Photon Cloud。

## Android APK

Android 端使用 Capacitor 8 封装，和 PC 共用 CloudBase、Photon、Agora 与规则版本。

```powershell
npm run android:apk
```

输出：

```text
D:\AI\卡牌游戏\release\android\茂一杀-1.4.0.apk
```

完整构建、签名和安装说明见 `ANDROID_BUILD_GUIDE.md`。

## 当前能力

- 邮箱注册、邮箱密码登录、忘记密码邮件。
- 只记住邮箱，不在本地保存密码。
- 昵称读取 CloudBase 用户资料；缺失时使用邮箱前缀兜底。
- Photon Cloud 创建房间、输入房间号加入房间。
- 2-8 人准备/开局，支持练习场、2V2、身份局、聊天、礼物、卡牌收发。
- 独立 5-8 人狼人杀模式：警长竞选、夜间行动、发言、放逐、屠边胜利、掉线恢复。
- 狼人杀白天公共语音，夜间狼人私密语音；身份信息不写入 Photon 公共房间属性。
- 使用本地内置角色和本地规则数据。

## 平时更新入口

常改内容已集中到固定文件，见 `UPDATE_GUIDE.md`。

- 版本、公告、CloudBase、Photon：`apps/web/src/config/appConfig.ts`
- CloudBase 本地环境变量模板：`apps/web/.env.example`
- 声网语音云函数部署：`AGORA_VOICE_SETUP.md`
- 默认设置、快捷聊天、核心卡名：`apps/web/src/config/uiConfig.ts`
- 角色：`packages/shared/src/characters.ts`
- 卡牌、装备、牌堆：`packages/shared/src/game-data/cards.ts`
- 狼人杀状态机、角色和板型：`packages/shared/src/werewolf.ts`
- 音频素材映射：`apps/web/src/lib/audioAssets.ts`

## 验证

```powershell
npm run typecheck
npm test
npm run desktop:dist
npm run android:apk
```

## Hot Update

热更新入口见 [HOT_UPDATE_GUIDE.md](D:/AI/卡牌游戏/HOT_UPDATE_GUIDE.md)。

常规内容更新：

```powershell
npm run build:rules-hotfix
node scripts/build_manifest.cjs
```

上传到七牛时保持路径不变：`assets/`、`version.json`、`version.sig`。玩家只要安装一次支持热更的新版 EXE，之后启动游戏会自动检查并更新。
