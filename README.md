# 远泽音乐播放器 (YZMusic)

一个基于 **Electron + Vue 3 (Vite)** 的桌面音乐播放器。

> **本项目仅是一个播放引擎。** 软件本身不预先集成任何在线音乐平台、不内置任何平台的搜索/歌词/URL 接口，也不附带任何版权资源。所有在线能力（搜索、歌词、专辑、艺术家、歌曲 URL）均通过用户手动导入的 **lxmusic 风格自定义源脚本** 提供；未导入脚本时只能使用本地音乐功能。`sample-sources/` 下的示例脚本仅用于演示协议，不代表应用内置支持。

## 功能

- 现代深色风格 UI (Spotify 风格三栏布局，底栏常驻)
- 在线搜索、歌词、专辑、艺术家、歌曲 URL 解析（全部依赖用户导入的自定义源脚本）
- 兼容 lxmusic 桌面端自定义源协议，脚本运行在主进程沙箱中，可绕过浏览器 CORS
- 本地音乐文件夹递归扫描 (支持 mp3 / flac / wav / m4a / ogg / aac / opus / wma)
- 自动解析本地音频元数据 (标题/艺术家/专辑/封面/时长)
- LRC 歌词解析与同步高亮显示
- 收藏夹 (本地持久化，底栏支持一键收藏)
- 播放列表 / 播放队列
- 三种播放模式：列表循环 / 单曲循环 / 随机
- 进度条拖动、音量调节
- 上一首 / 下一首 / 播放暂停
- 列表悬停封面显示播放图标，单击直接播放

## 技术栈

- Electron 28
- Vue 3 + `<script setup>` 单文件组件 (SFC)
- Vite 5 (`@vitejs/plugin-vue` + `vite-plugin-electron`) 一体化打包
- music-metadata (本地音频元数据解析)
- 自定义 `localfile://` Electron 协议
- 原生 HTML5 `<audio>`

## 快速开始

### 1. 安装依赖

```bash
cd yzmusic
npm install
```

### 2. 开发模式

```bash
npm run dev
```

`vite-plugin-electron` 会自动启动 Vite 开发服务器、编译主进程/预加载脚本到 `dist-electron/`，
然后启动 Electron 并加载 `http://localhost:5173`，支持 HMR 热更新。

### 3. 打包

```bash
npm run build           # 打包当前平台
npm run build:mac       # macOS
npm run build:win       # Windows
npm run build:linux     # Linux
npm run build:dir       # 仅打包目录 (调试用，不生成安装包)
```

打包流程：

1. `vite build` 把渲染进程构建到 `dist/`，主进程和 preload 构建到 `dist-electron/`
2. `electron-builder` 把上述两个目录连同 `package.json` 打包成可执行程序到 `release/`

## 使用说明

| 操作 | 说明 |
|------|------|
| 单击列表中的封面 | 立即播放该曲 |
| 双击列表行 | 立即播放该曲 |
| ♡ / ♥ | 添加 / 取消收藏 |
| 底栏左侧封面或标题 | 点击展开全屏歌词 |
| 底栏 ♡ 按钮 | 收藏当前曲目 |
| 模式按钮 | 列表循环 ⇄ 单曲循环 ⇄ 随机 |
| 进度条 | 点击任意位置跳转 |
| 设置 → 本地音乐 | 选择/重新扫描本地音乐文件夹 |
| 设置 → 下载 | 修改默认下载目录 |
| 设置 → 自定义源 | 导入 / 启用 lxmusic 格式脚本，所有在线能力由脚本提供 |
| 设置 → 数据管理 | 清空收藏、清空播放队列 |

数据 (收藏、本地音乐路径、下载目录、音量、播放模式、已安装的自定义源) 自动保存在 Electron 的 `userData` 目录下的 `player-store.json`。

## 项目结构

```
yzmusic/
├── package.json
├── vite.config.js               # Vite + electron 插件配置
├── index.html                   # Vite 入口，挂载 #app
├── electron/
│   ├── main.js                  # Electron 主进程 (IPC、文件扫描、协议注册、HTTP 代理)
│   ├── customSource.js          # lxmusic 自定义源脚本的沙箱运行时
│   └── preload.js               # 预加载脚本 (向渲染进程暴露 window.musicAPI)
└── src/
    ├── main.js                  # Vue 入口
    ├── App.vue                  # 根组件 (Sidebar + Main + PlayerBar + LyricsOverlay)
    ├── style.css                # 全局基础样式 + CSS Token
    ├── api/
    │   └── fallback.js          # 跨源兜底：本源无法播放时用其他已启用源搜相同歌曲
    ├── sources/
    │   └── customSourceClient.js # 渲染层 → 主进程自定义源的薄封装（搜索/歌词/专辑/艺人/URL）
    ├── composables/
    │   ├── useCustomSources.js  # 单例：lxmusic 自定义源管理
    │   ├── useDownloads.js      # 单例：下载目录与任务
    │   ├── useFavorites.js      # 单例：收藏管理 + 持久化
    │   ├── useLocalMusic.js     # 单例：本地文件夹扫描
    │   └── usePlayer.js         # 单例：全局 Audio + 播放队列 + 歌词高亮
    ├── utils/
    │   ├── format.js            # formatTime / 默认封面 (SVG dataURL)
    │   └── lrc.js               # LRC 文本解析
    ├── components/
    │   ├── Sidebar.vue          # 左侧导航
    │   ├── PlayerBar.vue        # 常驻底栏 (封面/控件/进度/音量/收藏)
    │   ├── LyricsOverlay.vue    # 全屏歌词
    │   └── TrackList.vue        # 通用曲目列表 (复用于 search/local/fav/queue)
    └── views/
        ├── SearchView.vue       # 在线搜索
        ├── AlbumView.vue        # 专辑详情
        ├── ArtistView.vue       # 艺术家详情
        ├── LocalView.vue        # 本地音乐
        ├── FavoritesView.vue    # 我的收藏
        ├── QueueView.vue        # 播放列表
        └── SettingsView.vue     # 设置 (本地音乐 / 下载 / 自定义源 / 数据管理 / 关于)
```

## 注意事项

- 应用本体不提供任何在线音源。首次使用请在「设置 → 自定义源」导入 lxmusic 格式脚本后才能使用搜索/歌词/URL 解析等在线能力。
- 自定义源脚本运行在主进程沙箱中并拥有网络权限，**仅导入你信任的脚本**。
- 若脚本返回的是试听片段或不可播放资源，播放器会自动尝试用其他已启用源的同名同艺术家歌曲兜底；没有命中时会提示「暂无可播放资源」。
- 默认 CSP 允许 `https:` `http:` `localfile:` 等多种 source，便于演示；如果用于生产请按需收紧。
- 本项目仅供学习与个人使用，请尊重版权。使用者对自行导入的脚本与由此产生的一切行为负责。

## License

本项目采用 [MIT License](LICENSE) 开源，Copyright (c) 2026。详情见仓库根目录的 [LICENSE](LICENSE) 文件。
