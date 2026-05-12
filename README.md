# Audio Visualizer

> 本地音频可视化桌面应用：实时流畅预览 + 高质量离线渲染，导出 Adobe 友好的 MP4 / ProRes 4444 / PNG 序列。

## 设计理念

**双时间源解耦**：同一套视觉代码同时驱动两条管线。

- 预览模式：Web Audio API 实时播放 → AnalyserNode + Meyda 取实时特征 → Three.js 60 fps 上屏
- 渲染模式：整轨 AudioBuffer 离线分析 → FeatureTimeline 按帧索引 → 任意分辨率离屏渲染 → readPixels → IPC → ffmpeg

切换预设、改参数、改背景色，所有逻辑写一次，预览渲染共享。

## 功能

- 三类示例预设（可切换、参数可调，参数面板由 schema 自动生成）
  - `spectrum-bars`：镜像对数频段条
  - `particles-burst`：节拍触发的 GPU 粒子
  - `shader-flow`：频谱驱动的 GLSL 流体抽象
- 背景色与透明开关：含 alpha 时直接保留 alpha 通道，纯色时可在 Premiere 里抠绿幕
- 三种导出格式
  - **MP4 (H.264)** — `libx264 + crf 16`，纯色背景，体积小、通用
  - **ProRes 4444 (.mov)** — `prores_ks profile 4444 + yuva444p10le`，含 alpha，Adobe 黄金标准
  - **PNG 序列** — `frame_000001.png`，含 alpha，After Effects 友好
- 自动 mux 原音轨（PNG 序列除外，请在 AE 中单独导入音频）
- 任意分辨率（720p / 1080p / 1440p / 4K / 自定义）+ 24/30/60 fps
- 时间范围裁剪（导出片段而非整曲）
- 实时波形（wavesurfer.js）与可拖动进度
- 参数预设以 JSON 导入导出

## 快速开始

依赖：Node.js ≥ 22.12 或 ≥ 20.19。

```bash
npm install
npm run dev      # 开发模式（HMR）
npm run build    # 仅构建
npm run package:win   # 打包成 Windows .exe (NSIS 安装器)
```

> 第一次 `npm install` 后如果 Electron 二进制没自动下载，手动跑 `node node_modules/electron/install.js`。

## 项目结构

```
audio-visualizer/
├── electron/
│   ├── main.ts                      # 主进程 / 窗口
│   ├── preload.ts                   # contextBridge → window.api
│   └── services/
│       ├── ipc-handlers.ts          # 所有 IPC 通道注册
│       ├── file-service.ts          # open/save dialog
│       ├── ffmpeg-service.ts        # spawn ffmpeg、stdin pipe RGBA 帧
│       ├── ffmpeg-args.ts           # 三种格式的 ffmpeg 参数模板
│       └── ffmpeg-locator.ts        # ffmpeg-static 路径解析（含 asar 处理）
├── src/
│   ├── audio/
│   │   ├── AudioEngine.ts           # HTMLAudioElement + AudioContext 播放管线
│   │   ├── RealtimeFeatureExtractor.ts  # AnalyserNode + Meyda → AudioFeatures
│   │   ├── OfflineAnalyzer.ts       # 整轨预分析（FFT/Flux/RMS + BPM）
│   │   ├── FeatureTimeline.ts       # at(time) 索引接口
│   │   └── types.ts                 # AudioFeatures 类型
│   ├── visuals/
│   │   ├── VisualPreset.ts          # 抽象接口
│   │   ├── ParamSchema.ts           # 声明式参数定义
│   │   ├── PresetRegistry.ts        # 预设注册中心
│   │   └── presets/
│   │       ├── spectrum-bars.ts
│   │       ├── particles-burst.ts
│   │       └── shader-flow.ts
│   ├── render/
│   │   ├── ThreeContext.ts          # 共享 Three.js 上下文
│   │   ├── PreviewRenderer.ts       # rAF 循环
│   │   └── OfflineRenderer.ts       # 逐帧 readPixels → IPC → ffmpeg
│   ├── store/app-store.ts           # zustand 状态
│   ├── ui/
│   │   ├── ParameterPanel.tsx       # Tweakpane 自动 UI
│   │   ├── PresetSelector.tsx
│   │   ├── BackgroundPicker.tsx
│   │   ├── PresetIO.tsx             # 参数 JSON 导入导出
│   │   ├── WaveformBar.tsx          # wavesurfer.js
│   │   ├── ExportDialog.tsx
│   │   └── ExportProgress.tsx
│   ├── App.tsx
│   ├── main.tsx
│   ├── index.html
│   ├── index.css
│   └── types.ts
├── electron.vite.config.ts
├── tsconfig.json (+ tsconfig.web/node.json)
└── package.json
```

## 添加一个新预设

1. 新建 `src/visuals/presets/your-preset.ts`，导出 `createYourPreset(): VisualPreset`。
2. 实现 `paramSchema`（声明式：float/int/bool/color/select；带 `structural: true` 的参数变化时会触发预设 reinit）。
3. 实现 `init(ctx)` / `update(features, params, dt)` / `dispose(ctx)`。
4. 在 `PresetRegistry.ts` 的 `factories` 与 `metaList` 注册。

UI 参数面板会从 schema 自动生成，无需写一行 UI 代码。

## Adobe 工作流建议

| 格式 | 是否含 alpha | 推荐用途 |
|------|-------------|----------|
| MP4 (H.264) | 否（纯色） | 直接给 Premiere/YouTube；如需"透明"，选纯色背景（绿/品红）后在 PR 用 Ultra Key 抠像 |
| ProRes 4444 | 是 | 拖入 Premiere 或 After Effects 即识别 alpha，是最方便的选项 |
| PNG 序列 | 是 | 终极质量；AE 中"作为图像序列"导入；音频另存 .wav 单独拖入时间轴 |

## 故障排除

- **黑屏 / 没有可视化**：先点"加载音频"，浏览器 AudioContext 在第一次用户交互前是 suspended 状态。
- **导出后透明背景没生效**：MP4 (H.264) 不支持 alpha；想要透明请选 ProRes 4444 或 PNG 序列。
- **ffmpeg 报错**：DevTools 控制台会有 `[ffmpeg] ...` 日志（IPC 通道 `ffmpeg:log`），把详细错误粘贴出来。
- **打包后启动找不到 ffmpeg**：检查 `release/win-unpacked/resources/app.asar.unpacked/node_modules/ffmpeg-static/ffmpeg.exe` 是否存在。

## 技术栈

Electron 42 · Vite 7 · React 19 · TypeScript 5.9 · Three.js 0.184 · Meyda 5 · web-audio-beat-detector 8 · Tweakpane 4 · wavesurfer.js 7 · zustand 5 · ffmpeg-static 5 (ffmpeg 6.1)
