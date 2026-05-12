# Wavelet

[![Latest Release](https://img.shields.io/github/v/release/weng20020320-ai/Soundanimetion?label=release&color=4c6ef5)](https://github.com/weng20020320-ai/Soundanimetion/releases/latest)
[![License: MIT](https://img.shields.io/badge/license-MIT-blue.svg)](LICENSE)

> A local audio visualizer for desktop. Real-time preview, offline rendering, Adobe-friendly export.
> 本地音频可视化桌面应用 · 实时预览 · 离线渲染 · 兼容 Adobe 工作流

![cover](docs/screenshots/cover.png)

---

## English

### What it is

Wavelet turns audio (or the audio track of a video) into a moving image. Two pipelines share the same preset code:

- **Preview pipeline** — Web Audio + Meyda → real-time feature extraction → Three.js at 60 fps.
- **Render pipeline** — full-track offline analysis → frame-indexed feature timeline → offscreen rendering at any resolution → readPixels → IPC → ffmpeg.

Switch a preset, change a parameter, swap the background — the logic is written once and both pipelines respect it.

### Features

- 15 presets across four moods: energetic / ambient / abstract / minimal, plus retro and organic touches.
- Background colour and transparency. Pure-colour backgrounds can be keyed out in Premiere.
- Three export formats:
  - **MP4 (H.264)** — `libx264 + crf 16`, small file, no alpha.
  - **ProRes 4444 (.mov)** — `prores_ks 4444 + yuva444p10le`, alpha-aware. The Adobe golden standard.
  - **PNG sequence** — `frame_000001.png`, alpha-aware. Friendly to After Effects.
- Source audio is automatically muxed back in (PNG sequence excluded; import the audio separately in AE).
- Arbitrary resolution (720p / 1080p / 1440p / 4K / custom) at 24 / 30 / 60 fps.
- Time-range trimming.
- Real-time waveform (wavesurfer.js) with draggable seek.
- Parameter presets export / import as JSON.
- Hardware encoder probing: `h264_nvenc` (NVIDIA), `h264_qsv` (Intel), `h264_amf` (AMD), with software fallback.
- GPU tier detection — quality profile auto-selects between *fast / balanced / ultra* based on the host GPU.

### Quick start

Requires Node.js ≥ 22.12 or ≥ 20.19.

```bash
npm install

# Desktop (Electron, full feature set)
npm run dev            # development mode (HMR)
npm run build          # build only
npm run package:win    # produce Windows installer + portable .exe
npm run package:mac    # produce macOS dmg (must run on macOS)

# Web demo (preview only, no video export)
npm run dev:web        # dev server on http://127.0.0.1:5174
npm run build:web      # build to web/dist/ (consumed by Vercel)
npm run preview:web    # serve the built bundle locally
```

> If Electron's binary fails to download on first install, run `node node_modules/electron/install.js` once.

### Downloads

Pre-built installers are published on [GitHub Releases](https://github.com/weng20020320-ai/Soundanimetion/releases/latest):

- **Windows** — `wavelet-win-x64-setup.exe` (NSIS installer) or `wavelet-win-x64-portable.exe`
- **macOS** — `wavelet-mac-x64.dmg` / `wavelet-mac-arm64.dmg`

> Release artifact filenames intentionally omit the version number so that `releases/latest/download/<filename>` stays a stable URL across versions. The current version is exposed in the app itself and in `apparatus.json`.

> macOS builds are not code-signed. The first launch may require right-click → Open to bypass Gatekeeper.

### Tech stack

Electron 42 · Vite 7 · React 19 · TypeScript 5.9 · Three.js 0.184 · Meyda 5 · web-audio-beat-detector 8 · Tweakpane 4 · wavesurfer.js 7 · zustand 5 · ffmpeg-static 5 (ffmpeg 6.1)

### Adobe workflow notes

| Format | Alpha | Recommended use |
|---|---|---|
| MP4 (H.264) | no | Premiere / YouTube. For "transparency", pick a solid colour background and use Ultra Key in PR. |
| ProRes 4444 | yes | Drop into Premiere or After Effects — alpha is recognised automatically. |
| PNG sequence | yes | Maximum quality. In AE, import as image sequence; bring in audio separately. |

### License

MIT — see [LICENSE](LICENSE).

---

## 中文

### 是什么

Wavelet 是一个本地音频可视化桌面应用。把音频（或视频里的音轨）变成会跟着节奏动的画面。设计上有两条管线共用同一套预设代码：

- **预览管线**：Web Audio + Meyda → 实时特征 → Three.js 60 fps 上屏
- **渲染管线**：整轨离线分析 → 按帧索引的特征时间线 → 任意分辨率离屏渲染 → readPixels → IPC → ffmpeg

切换预设、改参数、改背景色，逻辑只写一次，两条管线同时生效。

### 功能

- 15 个预设，按"氛围"分四组：高能 / 氛围沉浸 / 抽象艺术 / 极简，外加复古和有机风格的零星补充
- 背景色与透明开关。纯色背景可在 Premiere 用 Ultra Key 抠像
- 三种导出格式：
  - **MP4 (H.264)** — `libx264 + crf 16`，体积小，无 alpha
  - **ProRes 4444 (.mov)** — `prores_ks 4444 + yuva444p10le`，含 alpha，Adobe 黄金标准
  - **PNG 序列** — `frame_000001.png`，含 alpha，After Effects 友好
- 自动 mux 原音轨（PNG 序列除外，请在 AE 中单独导入音频）
- 任意分辨率（720p / 1080p / 1440p / 4K / 自定义）+ 24/30/60 fps
- 时间范围裁剪
- 实时波形（wavesurfer.js）+ 可拖动进度
- 参数预设以 JSON 导入导出
- 硬件编码器探测：`h264_nvenc` / `h264_qsv` / `h264_amf`，失败自动回退到软件编码
- GPU 等级自动检测，画质档在 *极速 / 平衡 / 极致* 之间自动选择

### 快速开始

依赖 Node.js ≥ 22.12 或 ≥ 20.19。

```bash
npm install

# 桌面版（Electron，完整功能）
npm run dev            # 开发模式（HMR）
npm run build          # 仅构建
npm run package:win    # 打包 Windows 安装器 + portable .exe
npm run package:mac    # 打包 macOS dmg（必须在 macOS 上跑）

# Web demo（仅预览试玩，不支持视频导出）
npm run dev:web        # 浏览器开发服务器 http://127.0.0.1:5174
npm run build:web      # 构建到 web/dist/（Vercel 部署用）
npm run preview:web    # 本地预览构建产物
```

> 第一次 `npm install` 后如果 Electron 二进制没自动下载，手动跑 `node node_modules/electron/install.js`。
>
> Windows 用户可直接双击根目录的 `サウンド可視化.bat` 启动开发，或 `打包发布.bat` 一键打包。

### 桌面版 vs Web demo

| 功能 | Desktop | Web demo |
|---|---|---|
| 加载音频 / 视频 | 文件对话框 + 拖拽 | 文件选择器 + 拖拽（File API） |
| 实时预览（15 个预设 / Three.js / PostFX） | ✓ | ✓ |
| 参数面板 / 渐变 / 曝光 / 后期 | ✓ | ✓ |
| 截图保存 PNG | 弹原生「另存为」对话框 | 浏览器自动下载 |
| **离线渲染 MP4 / ProRes / PNG 序列** | ✓ | ✗（点导出 → 跳下载桌面版页） |

Web 版的目的是「让人在浏览器里 5 秒就看到效果」；真正想出片请下载桌面版。

### 下载

预编译的安装包发布在 [GitHub Releases](https://github.com/weng20020320-ai/Soundanimetion/releases/latest)：

- **Windows** — `wavelet-win-x64-setup.exe`（NSIS 安装器）或 `wavelet-win-x64-portable.exe`
- **macOS** — `wavelet-mac-x64.dmg` / `wavelet-mac-arm64.dmg`

> 发布产物文件名不带版本号，这样 `releases/latest/download/<filename>` 在每次发版后仍然是稳定的 URL。版本号本身由应用内部和 `apparatus.json` 展示。

> macOS 版本未签名，首次启动需要在访达里右键 → 打开来绕过 Gatekeeper。

### 项目结构

```
Soundanimetion/
├── electron/                       # 主进程 / preload / IPC / ffmpeg
│   ├── main.ts
│   ├── preload.ts
│   └── services/
│       ├── ipc-handlers.ts
│       ├── file-service.ts
│       ├── ffmpeg-service.ts
│       ├── ffmpeg-args.ts
│       ├── ffmpeg-locator.ts
│       └── i18n-main.ts
├── src/
│   ├── audio/                      # AudioEngine / RealtimeFeatureExtractor / OfflineAnalyzer / FeatureTimeline
│   ├── visuals/                    # 预设系统、渐变库、曝光控制
│   │   └── presets/                # 15 个预设
│   ├── render/                     # ThreeContext / PreviewRenderer / OfflineRenderer / PostFXChain / PBOReader / FrameTransport / GpuTier
│   ├── ui/                         # React 组件 + Tweakpane 参数面板
│   ├── i18n/                       # zh-CN / en-US / ja-JP
│   ├── store/app-store.ts          # zustand
│   └── App.tsx
├── scripts/                        # 打包清理 / banner / IPC 诊断脚本
├── docs/screenshots/               # 主页用截图素材
├── apparatus.json                  # clearmika.com 接入元数据
└── .github/workflows/release.yml   # tag 推送自动打包
```

更详细的开发流水帐和踩坑记录，见 [`CHANGELOG.md`](CHANGELOG.md)。

### 添加一个新预设

1. 新建 `src/visuals/presets/your-preset.ts`，导出 `createYourPreset(): VisualPreset`
2. 实现 `paramSchema`（声明式：float / int / bool / color / gradient / select；带 `structural: true` 的参数变化会触发预设 reinit）
3. 实现 `init(ctx)` / `update(features, params, dt)` / `dispose(ctx)`
4. 在 `src/visuals/PresetRegistry.ts` 的 `factories` 和 `metaList` 里注册

UI 参数面板会从 schema 自动生成，无需写一行 UI 代码。

### 故障排除

- **黑屏 / 没有可视化**：先点"加载音频"，浏览器 AudioContext 在第一次用户交互前是 suspended 状态
- **导出后透明背景没生效**：MP4 (H.264) 不支持 alpha；想要透明请选 ProRes 4444 或 PNG 序列
- **ffmpeg 报错**：DevTools 控制台会有 `[ffmpeg] ...` 日志（IPC 通道 `ffmpeg:log`），打包版的完整日志在 `%APPDATA%/Wavelet/exports/*.log`
- **打包后启动找不到 ffmpeg**：检查 `release/win-unpacked/resources/app.asar.unpacked/node_modules/ffmpeg-static/ffmpeg.exe` 是否存在

### 发布流程

打 tag 即可触发 GitHub Actions 自动构建：

```bash
git tag v0.2.2
git push origin v0.2.2
```

Workflow 会自动跑 Windows 和 macOS 两个 runner，把 `.exe` / `.dmg` 上传到对应 Release。

### License

MIT — 见 [LICENSE](LICENSE)。
