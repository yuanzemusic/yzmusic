# Changelog

本项目所有显著变更都会记录在此文件中。版本号遵循 [语义化版本](https://semver.org/lang/zh-CN/) 规范。

## [1.1.0] - 2026-04-25

本次版本的代码功能与 1.0.0 保持一致，主要补齐了发布与分发链路：从此版本起在 GitHub Actions 上自动构建 macOS / Windows / Linux 三平台安装包，并随 tag 一起发布到 Releases。

### 新增

- **跨平台 CI 构建**：新增 `.github/workflows/build.yml`，对 `main` 分支推送、PR、`v*` tag 推送和手动触发都会在 macOS / Windows / Ubuntu runner 上运行构建。
- **macOS 双架构产物**：electron-builder 的 mac target 同时输出 `arm64` 与 `x64` 两个独立 DMG，分别覆盖 Apple Silicon 与 Intel Mac。
- **自动发布 Release**：推送 `v*` tag 时由 `softprops/action-gh-release` 创建 GitHub Release 并上传所有平台的产物（`.dmg` / `.exe` / `.AppImage`）。

### 修复

- CI 中 electron-builder 与 `action-gh-release` 重复尝试创建 Release 引发 403 的问题：在构建步骤显式传 `--publish never`，并为 workflow 配置 `contents: write` 权限，由 `action-gh-release` 单独负责发布。
- macOS 构建固定到 `macos-latest`（实际为 Apple Silicon runner），避免使用 Intel runner 时 arm64 dmg 缺失。

### 产物

| 平台 | 文件 |
|------|------|
| macOS (Apple Silicon) | `YZMusic-1.1.0-arm64.dmg` |
| macOS (Intel) | `YZMusic-1.1.0.dmg` |
| Windows | `YZMusic.Setup.1.1.0.exe` |
| Linux | `YZMusic-1.1.0.AppImage` |

> 应用本体不内置任何在线音源，首次使用需在「设置 → 自定义源」导入 lxmusic 格式脚本，详见 [README](README.md)。

## [1.0.0] - 初始版本

首个公开版本，奠定播放引擎的全部核心能力。

### 主要功能

- **桌面播放引擎**：Electron 28 + Vue 3 + Vite 5，Spotify 风格三栏布局 + 常驻底栏 + 全屏歌词遮罩。
- **本地音乐**：递归扫描指定文件夹，支持 mp3 / flac / wav / m4a / ogg / aac / opus / wma；自动解析标题 / 艺术家 / 专辑 / 封面 / 时长。
- **自定义源（lxmusic 协议）**：脚本运行在主进程沙箱内，可绕过浏览器 CORS，提供搜索 / 歌词 / 专辑 / 艺术家 / 歌曲 URL；支持启用、禁用与**重载**已安装的源（远端 URL 或本地文件源都可重新拉取）。
- **跨源兜底**：本源返回不可播放资源时，自动用其他已启用源搜索同名同艺术家歌曲。
- **播放控制**：列表循环 / 单曲循环 / 随机三种模式；上下首、暂停、进度拖动、音量调节。
- **收藏与队列**：收藏夹本地持久化，底栏一键收藏；播放列表 / 播放队列视图。
- **LRC 歌词**：解析与同步高亮，底栏点击展开全屏歌词。
- **数据持久化**：收藏、本地音乐路径、下载目录、音量、播放模式、已安装源全部存放在 Electron `userData` 目录下的 `player-store.json`。

[1.1.0]: https://github.com/yuanzemusic/yzmusic/releases/tag/v1.1.0
[1.0.0]: https://github.com/yuanzemusic/yzmusic/releases/tag/v1.0.0
