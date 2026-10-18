# 全屏歌词 · Apple Music for Android

安卓版 Apple Music 没有全屏歌词。这个小应用读取 Apple Music 当前正在播放的歌曲和进度，
自动下载同步歌词，用接近 iOS 的样式全屏滚动显示。

## 功能

- 自动识别 Apple Music 正在播放的歌曲（其他播放器也能用，Apple Music 优先）
- 同步滚动的逐行歌词：当前行高亮放大，其余行变暗，带错落的“波浪”滚动
- 中文歌自动带翻译（网易云有翻译时显示在原文下方）
- 点任意一行跳转到那里播放；上下拖动可以浏览，3 秒后自动回到当前行
- 点空白处呼出 上一首 / 播放暂停 / 下一首
- 模糊、缓慢旋转的专辑封面背景，常亮屏幕，沉浸式全屏，支持横屏
- 歌词缓存在本地，同一首歌第二次打开不再联网

歌词来源：[LRCLIB](https://lrclib.net)（英文歌为主）→ 网易云音乐（中文歌为主）。
优先使用带时间轴的同步歌词，找不到时显示不滚动的纯文本歌词。

## 安装

1. 打开本仓库的 **Releases** 页面，下载最新的 `FullscreenLyrics.apk`
   （或在 Actions → “Build lyrics APK” 里下载构建产物）。
2. 在手机上安装，系统提示时允许“安装未知应用”。
3. 打开应用 → 点 **开启通知使用权** → 找到“全屏歌词”打开开关。
   - **安卓 13 及以上**：直接安装的 APK，这个开关可能是灰的并提示“受限设置”。
     这时回到应用，点 **打开应用信息** → 右上角 **⋮** → **允许受限制的设置**，再去开启即可。
4. 在 Apple Music 里播放歌曲，回到“全屏歌词”。

> 为什么要通知使用权？安卓只把其他应用的“媒体会话”（歌名、进度、播放控制）开放给拥有这项权限的应用。
> 本应用只读取媒体会话，不读取、不保存、不上传任何通知内容；联网只用于查询歌词。

## 自己构建

需要 JDK 17 和 Android SDK（API 35）。用 Android Studio 打开 `apple-music-lyrics` 目录，或：

```bash
cd apple-music-lyrics
./gradlew assembleRelease
# 产物：app/build/outputs/apk/release/app-release.apk
```

推送到 GitHub 后，`.github/workflows/android-lyrics.yml` 会自动构建 APK 并发布为 pre-release。

`keystore/debug.keystore` 是公开的调试签名（密码 `android`），只是为了让每次 CI 构建都能覆盖安装，
**不要**拿它发布到应用商店。

## 代码结构

| 文件 | 作用 |
| --- | --- |
| `MainActivity.java` | 界面、媒体会话连接、播放进度时钟 |
| `LyricsView.java` | 自绘的全屏歌词视图（高亮、波浪滚动、拖动、点按跳转） |
| `LyricsRepository.java` | 歌词搜索（LRCLIB、网易云）与本地缓存 |
| `LrcParser.java` | LRC 解析、翻译合并 |
| `MediaListener.java` | 空的通知监听服务，用来获得读取媒体会话的权限 |

纯 Java + 安卓系统 API，没有第三方依赖，最低支持安卓 9。

## 已知限制

- 歌词是按歌名/歌手/时长从第三方库匹配的，冷门歌曲可能找不到或对不上版本。
- LRC 只有逐行时间，没有 iOS 那种逐字高亮。
- 网易云接口是非官方的，未来可能变动；失效时仍会使用 LRCLIB。
