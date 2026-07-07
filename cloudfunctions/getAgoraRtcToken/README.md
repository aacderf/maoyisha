# getAgoraRtcToken

CloudBase 云函数，为已登录玩家签发短期声网 RTC Token。

部署后在云函数环境变量中配置：

- `AGORA_APP_ID`
- `AGORA_APP_CERTIFICATE`

App Certificate 只能配置在云函数环境变量，禁止写入客户端、七牛资源或日志。

请求参数：

- `roomCode`：Photon 房间号。
- `voiceScope`：`public` 为白天公共语音，`wolves` 为狼人夜间语音。

加入狼人杀模式后必须重新部署该云函数，否则旧函数不会识别狼队频道。
