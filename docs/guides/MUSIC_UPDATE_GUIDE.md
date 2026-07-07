# 茂一杀音乐热更新说明

## 第一次启用

本次已经把音乐列表改成读取外置配置：

```text
assets/config/audio.json
```

以后游戏启动后会读取这个文件里的 `bgm` 列表，设置页、大厅和局内音乐播放器都会同步显示。

## 本地添加新歌

1. 把歌曲复制到：

```text
D:\AI\卡牌游戏\assets\audio\bgm
```

2. 建议文件名只用英文、数字、短横线，例如：

```text
my-new-song.mp3
```

3. 打开并修改：

```text
D:\AI\卡牌游戏\assets\config\audio.json
```

4. 在 `bgm` 数组末尾新增一项：

```json
{
  "id": "my-new-song",
  "label": "显示给玩家看的歌名",
  "scene": "any",
  "src": "bgm/my-new-song.mp3"
}
```

`scene` 可选：

```text
lobby   只在大厅优先显示
battle  只在局内优先显示
any     大厅和局内都显示
```

## 生成七牛热更包

运行：

```powershell
cd /d D:\AI\卡牌游戏
npm run prepare:qiniu
```

生成目录：

```text
D:\AI\卡牌游戏\release\qiniu-hot-update
```

## 七牛云最小上传清单

如果只是新增歌曲，只上传这些文件即可：

```text
assets/config/audio.json
assets/audio/bgm/你的新歌.mp3
version.json
version.sig
```

上传顺序：

```text
1. 先上传 assets/config/audio.json
2. 再上传 assets/audio/bgm/你的新歌.mp3
3. 最后上传 version.json
4. 最后上传 version.sig
```

注意：对象 key 必须保持一致，不能多一层文件夹。

正确：

```text
assets/config/audio.json
assets/audio/bgm/my-new-song.mp3
version.json
version.sig
```

错误：

```text
qiniu-hot-update/assets/config/audio.json
release/qiniu-hot-update/version.json
assets/assets/audio/bgm/my-new-song.mp3
```

## 什么时候需要重新发 EXE

只加歌、删歌、改歌名：不需要重新发 EXE，只走七牛热更。

这次因为代码刚改成“音乐列表热更配置”，所以需要给玩家发一次新版主程序。之后再加歌就不需要发 EXE。
