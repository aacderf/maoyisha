# 声网局内语音部署

## 1. 部署 CloudBase 云函数

在 CloudBase 控制台新建 Node.js 云函数，函数名必须为：

```text
getAgoraRtcToken
```

上传目录：

```text
cloudfunctions/getAgoraRtcToken
```

函数安装依赖后再发布。建议超时设置为 10 秒，公网访问不需要单独开启，客户端通过 CloudBase SDK 调用。

## 2. 配置云函数环境变量

只在 CloudBase 云函数环境变量中填写：

```text
AGORA_APP_ID=声网项目 App ID
AGORA_APP_CERTIFICATE=声网项目 Primary Certificate
```

不要把这两个值写入 `apps/web/.env`、源码、七牛云或聊天记录。修改环境变量后重新部署函数。

## 3. 发布客户端

本次增加了声网 Web SDK、局内控件和 Electron 麦克风权限处理，必须重新发布 EXE：

```powershell
cd /d D:\AI\卡牌游戏
npm run desktop:dist
```

七牛云只需继续上传热更新资源；语音 SDK 和权限代码不能仅靠七牛热更替换。

## 4. 验证

1. 两个账号进入同一个 Photon 房间并开始对局。
2. 两端应显示小麦克风图标，初始均为关闭。
3. 一端打开麦克风并允许系统权限，另一端应听到声音。
4. 调整“实时语音音量”，远端声音应同步变化。
5. 云函数未部署或环境变量错误时，牌局仍可继续，仅语音显示连接异常。
