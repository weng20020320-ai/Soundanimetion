/**
 * 三语字典类型。所有 locale 文件都要严格满足同样的 shape，
 * 任何漏翻一律编译期报错。
 *
 * 设计原则：
 *  - 静态字符串：直接写值
 *  - 带变量的字符串：写成函数（避免学一套 ICU/MessageFormat 语法）
 *  - 一处 UI = 一个 key，方便后续移动 / 删除时全局检索
 */
export type Locale = 'zh-CN' | 'ja-JP' | 'en-US';

export const LOCALES: { id: Locale; nativeLabel: string }[] = [
  { id: 'zh-CN', nativeLabel: '简体中文' },
  { id: 'ja-JP', nativeLabel: '日本語' },
  { id: 'en-US', nativeLabel: 'English' },
];

export interface Dictionary {
  language: {
    /** "语言" / "Language" / "言語" — 下拉选择器旁边的标签。 */
    label: string;
  };

  topbar: {
    brand: string;
    loadAudio: string;
    loadingAudio: string;
    /** 顶栏中部"未加载"提示，括号里举音频/视频扩展名。 */
    notLoadedHint: string;
    /** 加载完毕后顶栏中部展示文件名 + （视频/音频）标签。 */
    sourceTypeAudio: string;
    sourceTypeVideo: string;
    presetLabel: string;
    exportVideo: string;
    snapshot: string;
    /** "保存当前画面为 PNG…" — 按钮 title 提示 */
    snapshotTitle: string;
    /** 快照保存成功的 confirm 提示。 */
    snapshotSaved: (path: string) => string;
  };

  errors: {
    needAudioFirst: string;
    presetSwitchFailed: (msg: string) => string;
    audioLoadFailed: (msg: string) => string;
    snapshotFailed: (msg: string) => string;
    exportFailed: (msg: string) => string;
    timelineMissing: string;
    unsupportedDrop: (name: string) => string;
  };

  playback: {
    play: string;
    pause: string;
    volume: string;
  };

  exportDialog: {
    title: string;
    formatLabel: string;
    formatMp4: string;
    formatProRes: string;
    formatPngSeq: string;
    pngSeqHint: string;

    encoderLabel: string;
    encoderRecommended: string;
    encoderHint: string;
    encoderName: (encoder: string) => string;

    qualityLabel: string;
    qualityDraft: string;
    qualityStandard: string;
    qualityHigh: string;
    qualityBest: string;
    qualityDraftHint: string;
    qualityStandardHint: string;
    qualityHighHint: string;
    qualityBestHint: string;

    profileLabel: string;
    profileAuto: string;
    profileFast: string;
    profileBalanced: string;
    profileUltra: string;
    profileAutoHint: string;
    profileFastHint: string;
    profileBalancedHint: string;
    profileUltraHint: string;
    detectedGpu: (label: string) => string;
    detectingGpu: string;
    actualPath: (desc: string) => string;
    profileNote: string;

    pipelineDescFast: string;
    pipelineDescBalanced: string;
    pipelineDescUltra: string;

    resolutionLabel: string;
    resolutionCustom: string;
    resolutionEvenHint: string;

    fpsLabel: string;
    timeRangeLabel: string;
    timeRangeSummary: (durSec: number, frames: number) => string;

    backgroundLabel: string;
    transparentLabel: string;
    transparentNotSupported: string;

    audioInfo: (name: string, mbPerFrame: number) => string;
    audioNotLoaded: string;

    sizeEstimateLabel: string;
    /**
     * 体积预估字符串（本地化格式化）。MB/GB 单位由 locale 决定。
     * 例：约 32 MB（视频 30 MB + 音频 2 MB，± 35%）
     */
    sizeEstimateValue: (args: {
      totalMB: number;
      videoMB: number;
      audioMB: number;
      uncertaintyPct: number;
      hasAudio: boolean;
    }) => string;
    /** 编码器自动选择 — 已匹配显卡。例：NVIDIA NVENC（已检测到匹配显卡） */
    encoderAutoMatched: (encoderLabel: string) => string;
    /** 编码器自动选择 — 没有可用硬编。例：使用 CPU 软件编码（GPU 无可用硬件编码器） */
    encoderCpuFallback: string;
    /** 编码器自动选择 — 还没拿到 GPU 信息。例：正在检测 GPU… */
    encoderDetecting: string;
    /** 高级折叠区标题。例：高级（编码器 / 渲染管线） */
    advancedToggle: string;

    cancel: string;
    confirm: string;
  };

  exportProgress: {
    titleAnalyzing: string;
    titleRendering: string;
    analyzingFeatures: string;
    detectingBpm: string;
    renderingFrames: string;
    waitingFfmpeg: string;
    /** 详细帧统计：'帧 N / M · X fps · 剩余约 Y · 在途 Z 帧' */
    frameStats: (
      frame: number,
      totalFrames: number,
      fps: number | null,
      etaSec: number | null,
      inFlight: number | null
    ) => string;
    waitingFfmpegHint: string;
    /** 最近一行 ffmpeg 日志的前缀。 */
    ffmpegLogPrefix: string;
    /** 编码器自动回退提示：硬编（如 NVENC）启动失败 → 已自动切回 libx264。 */
    encoderFallback: (from: string, to: string) => string;

    /** 完成后弹 confirm() 用：导出完成 + 是否在资源管理器中显示。 */
    completed: (path: string) => string;
    cancel: string;
  };

  background: {
    label: string;
    transparentLabel: string;
    transparentHint: string;
  };

  presetIO: {
    label: string;
    exportJson: string;
    importJson: string;
    invalidFile: string;
    parseFailed: (msg: string) => string;
  };

  parameterPanel: {
    paneTitle: string;
  };

  presetSelector: {
    /** 预设条目格式："镜像频谱条（频谱）" / "Mirror Spectrum Bars (Spectrum)" */
    entry: (name: string, category: string) => string;
    /** 卡片式面板里 mood 分组的小副标题前缀，例："适合：" */
    musicTagsLabel: string;
    /** "全部" 标签 — mood 切换栏第一项 */
    allMoods: string;
    /** 没有任何 preset 命中筛选时的占位 */
    empty: string;
  };

  presetCategories: {
    spectrum: string;
    particles: string;
    shader: string;
  };

  /**
   * 按"氛围"维度的分类。和 presetCategories（按技术分类）正交：
   * 一个 preset 既属于一个 category，也属于一个 mood，UI 默认按 mood 分组展示。
   */
  presetMoods: {
    energetic: string;
    ambient: string;
    abstract: string;
    minimal: string;
    retro: string;
    organic: string;
  };

  /**
   * 音乐类型标签字典。preset 在 PresetMeta.musicTags 里引用 key，
   * UI 渲染时通过这张表本地化。
   */
  musicTags: {
    electronic: string;
    pop: string;
    hiphop: string;
    rock: string;
    jazz: string;
    classical: string;
    piano: string;
    lofi: string;
    ambient: string;
    chillout: string;
    techno: string;
    house: string;
    synthwave: string;
    vaporwave: string;
    experimental: string;
    'dark-ambient': string;
    drone: string;
    'post-rock': string;
    dnb: string;
    dubstep: string;
    cinematic: string;
    psychedelic: string;
    '8bit': string;
  };

  presetNames: Record<string, string>;

  /** 每个 preset 的一句话风格描述。key 与 PresetMeta.id 对齐。 */
  presetDescriptions: Record<string, string>;

  /**
   * 预设参数面板的 label 覆盖。
   * 取查表 t.presetParamLabels[presetId]?.[paramKey]，若未命中则回退到
   * `def.label`（也就是预设源码里写的中文 label）。
   *
   * zh-CN 留空即可；ja-JP / en-US 填齐每个预设需要展示的 key。
   */
  presetParamLabels: Record<string, Record<string, string>>;

  /**
   * select 类型参数的选项 label 翻译。结构：
   *   t.presetParamOptions[presetId]?.[paramKey]?.[String(optionValue)] ?? optionLabelInline
   */
  presetParamOptions: Record<
    string,
    Record<string, Record<string, string>>
  >;

  postFX: {
    enabled: string;
    bloom: string;
    bloomStrength: string;
    bloomRadius: string;
    bloomThreshold: string;
    bloomBeatBoost: string;
    chromatic: string;
    chromaticOffset: string;
    chromaticBeatBoost: string;
    glitch: string;
    glitchIntensity: string;
    grain: string;
    grainIntensity: string;
    vignette: string;
    vignetteAmount: string;
    vignetteSoftness: string;
  };

  gradient: {
    custom: string;
    advanced: string;
    collapse: string;
    start: string;
    middle: string;
    end: string;
    addMiddle: string;
    removeMiddle: string;
    angle: (deg: number) => string;
    horizontalTitle: string;
    verticalTitle: string;
    reset: string;
    groups: {
      mist: string;
      neon: string;
      auroraOcean: string;
      warm: string;
      mono: string;
      rainbow: string;
    };
    /**
     * 渐变预设名翻译。key = GRADIENT_PRESETS[i].id；
     * 缺省键回退到 GRADIENT_PRESETS 里写死的中文 name。
     */
    presets: Record<string, string>;
  };

  fileDialog: {
    openTitle: string;
    audioFilter: string;
    videoFilter: string;
    mediaFilter: string;
    allFilesFilter: string;
    saveExportTitle: string;
    pngSeqDirTitle: string;
    pngSeqFilterName: string;
    mp4FilterName: string;
    proResFilterName: string;
    snapshotTitle: string;
    snapshotFilterName: string;
  };

  /**
   * Web 试玩版专用文案。桌面版不会展示这些，但字典里仍然必须有，
   * 让 TypeScript 严格检查三种语言全部翻译。
   */
  webDemo: {
    /** 顶部 banner 文字 */
    bannerText: string;
    /** Banner 上的 CTA 链接文字 */
    bannerCta: string;
    /** 点导出按钮时跳下载页前的 confirm() 提示 */
    exportCtaConfirm: string;
    /** 顶栏导出按钮在 web 上显示的替代文字 */
    exportButtonAlt: string;
  };
}
