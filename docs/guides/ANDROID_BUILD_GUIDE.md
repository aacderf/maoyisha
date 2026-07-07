# 茂一杀 Android 构建说明

## 当前发布配置

- 应用 ID：`com.hl.cardarena`
- 显示版本：`1.4.0`
- 内部版本号：`14002`
- 屏幕方向：强制横屏
- 签名配置：`D:\Keys\maoyisha-android-signing.json`
- 正式密钥：`D:\Keys\maoyisha-android-release.jks`

请备份以上两个签名文件。以后所有 Android 版本必须继续使用同一密钥，否则不能覆盖安装。

## 构建单一 APK

```powershell
cd D:\AI\卡牌游戏
npm run android:apk
```

脚本会清理旧发布文件，并只输出：

```text
D:\AI\卡牌游戏\release\android\茂一杀-1.4.0.apk
```

## 安装

第一次切换到正式签名版时，需要先卸载旧 Debug 版和桌面上另外两个旧测试应用。之后安装：

```powershell
D:\Android\Sdk\platform-tools\adb.exe install -r "D:\AI\卡牌游戏\release\android\茂一杀-1.4.0.apk"
```

后续版本只要包名和签名不变，就可以直接覆盖升级。

## 七牛热更新

纯 Android 界面、权限、原生插件或底层代码变化，需要重新发送 APK，不需要为这次移动端布局改动单独覆盖七牛资源。

角色、规则、公告、图片、音乐等外置内容更新时运行：

```powershell
npm run prepare:qiniu
```

上传 `release\qiniu-hot-update` 内的内容。先上传 `assets\`，最后上传 `version.json` 和 `version.sig`。七牛云不需要上传 APK。
