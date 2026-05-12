import type { Dictionary } from '../types';

export const zhCN: Dictionary = {
  language: {
    label: '语言',
  },

  topbar: {
    brand: 'Audio Visualizer',
    loadAudio: '加载文件',
    loadingAudio: '加载中…',
    notLoadedHint: '未加载（点击「加载文件」选择 mp3/wav/flac/mp4 等，或直接拖入窗口）',
    sourceTypeAudio: '音频',
    sourceTypeVideo: '视频',
    presetLabel: '预设',
    exportVideo: '导出视频…',
    snapshot: '快照',
    snapshotTitle: '保存当前画面为 PNG',
    snapshotSaved: (path) => `快照已保存：\n${path}\n\n是否在资源管理器中显示？`,
  },

  errors: {
    needAudioFirst: '请先加载音频或视频',
    presetSwitchFailed: (msg) => `切换预设失败：${msg}`,
    audioLoadFailed: (msg) => `加载失败：${msg}`,
    snapshotFailed: (msg) => `快照失败：${msg}`,
    exportFailed: (msg) => `导出失败：${msg}`,
    timelineMissing: '未能生成 FeatureTimeline',
    unsupportedDrop: (name) =>
      `不支持的文件：${name}（仅支持音频 mp3/wav/flac… 与视频 mp4/mov/webm…）`,
  },

  playback: {
    play: '▶ 播放',
    pause: '⏸ 暂停',
    volume: '音量',
  },

  exportDialog: {
    title: '导出视频',
    formatLabel: '输出格式',
    formatMp4: 'MP4 (H.264) — 纯色背景，体积小，通用',
    formatProRes: 'ProRes 4444 (.mov) — 含 alpha，Adobe 黄金标准',
    formatPngSeq: 'PNG 序列 — 含 alpha，AE 友好',
    pngSeqHint:
      '将在所选文件夹下生成 frame_000001.png … 序列。音频不打包，请在 AE 中单独导入。',

    encoderLabel: '编码器',
    encoderRecommended: ' · 推荐',
    encoderHint:
      '硬件编码器在 GPU 上运行，4K 速度可达软件编码 5–10 倍，画质略低于 libx264 的同等档位。',
    encoderName: (encoder) => {
      switch (encoder) {
        case 'libx264':
          return 'libx264 (软件 H.264)';
        case 'h264_nvenc':
          return 'NVENC H.264 (NVIDIA GPU)';
        case 'hevc_nvenc':
          return 'NVENC H.265 (NVIDIA GPU)';
        case 'h264_amf':
          return 'AMF H.264 (AMD GPU)';
        case 'hevc_amf':
          return 'AMF H.265 (AMD GPU)';
        case 'h264_qsv':
          return 'QSV H.264 (Intel)';
        case 'hevc_qsv':
          return 'QSV H.265 (Intel)';
        default:
          return encoder;
      }
    },

    qualityLabel: '质量',
    qualityDraft: '草稿',
    qualityStandard: '标准',
    qualityHigh: '高质量',
    qualityBest: '极致',
    qualityDraftHint: '极快 · 体积小（CRF 23）',
    qualityStandardHint: '快 · 体积适中 · 推荐（CRF 20，1080p60 20s ≈ 25 MB）',
    qualityHighHint: '中速 · 接近无损（CRF 17，体积 ~3×）',
    qualityBestHint: '慢 · 视觉无损（CRF 14，体积 ~6×）',

    profileLabel: '画质档（GPU 路径）',
    profileAuto: '自动',
    profileFast: '极速',
    profileBalanced: '平衡',
    profileUltra: '极致',
    profileAutoHint: '按检测到的 GPU 选 — 推荐',
    profileFastHint: '禁用 PBO，兼容性最好（弱 GPU 必选）',
    profileBalancedHint: 'PBO 2 槽 + composer 1×（中端 GPU）',
    profileUltraHint: 'PBO 3 槽（强 GPU 才稳）',
    detectedGpu: (label) => `检测到的 GPU：${label}`,
    detectingGpu: '正在检测 GPU…',
    actualPath: (desc) => `实际路径：${desc}`,
    profileNote:
      '注意：「画质档」只决定 GPU 内部的执行路径，不影响最终输出像素和颜色质量。导出失败时把这一档调到「极速」即可。',

    pipelineDescFast: '极速：禁用 PBO + composer 1×（兼容性最好）',
    pipelineDescBalanced: '平衡：PBO 2 槽 + composer 1×',
    pipelineDescUltra: '极致：PBO 3 槽 + composer 1×',

    resolutionLabel: '分辨率',
    resolutionCustom: '自定义',
    resolutionEvenHint: '（H.264 要求宽高为偶数）',

    fpsLabel: '帧率',
    timeRangeLabel: '时间范围（秒）',
    timeRangeSummary: (durSec, frames) => `共 ${durSec.toFixed(2)} s · ${frames} 帧`,

    backgroundLabel: '背景',
    transparentLabel: '透明（含 alpha 通道）',
    transparentNotSupported:
      'MP4 (H.264) 不支持 alpha；如需透明请选 ProRes 4444 或 PNG 序列。',

    audioInfo: (name, mb) => `音频：${name} · 单帧像素 ≈${mb.toFixed(2)} MB`,
    audioNotLoaded: '未加载',

    sizeEstimateLabel: '预估文件大小',
    sizeEstimateValue: ({ totalMB, videoMB, audioMB, uncertaintyPct, hasAudio }) => {
      const total = formatMBZh(totalMB);
      const v = formatMBZh(videoMB);
      if (hasAudio) {
        const a = formatMBZh(audioMB);
        return `约 ${total}（视频 ${v} + 音频 ${a}，± ${uncertaintyPct}%）`;
      }
      return `约 ${total}（± ${uncertaintyPct}%）`;
    },
    encoderAutoMatched: (label) => `自动选择：${label}（已检测到匹配显卡）`,
    encoderCpuFallback: '自动选择：CPU 软件编码（未检测到可用的硬件编码器）',
    encoderDetecting: '正在检测 GPU…',
    advancedToggle: '高级（编码器 / 渲染管线）',

    cancel: '取消',
    confirm: '选择保存位置并导出',
  },

  exportProgress: {
    titleAnalyzing: '分析音频…',
    titleRendering: '渲染中…',
    analyzingFeatures: '解析音频特征…',
    detectingBpm: '检测 BPM…',
    renderingFrames: '渲染帧到 ffmpeg…',
    waitingFfmpeg: '等 ffmpeg 编码落盘…',
    frameStats: (frame, total, fps, eta, inFlight) => {
      const parts = [`帧 ${frame} / ${total}`];
      if (fps !== null && fps > 0) parts.push(`${fps.toFixed(1)} fps`);
      if (eta !== null && eta > 0) parts.push(`剩余约 ${formatEtaZh(eta)}`);
      if (inFlight !== null) parts.push(`在途 ${inFlight} 帧`);
      return parts.join(' · ');
    },
    waitingFfmpegHint:
      '渲染管道已被填满，正在等 ffmpeg 端把帧编码落盘。\n常见原因：编码器首帧 init 慢 / CPU 编码档位太高 / 写盘卡。\n如长时间无变化请检查下方 ffmpeg 日志。',
    ffmpegLogPrefix: '[ffmpeg]',
    encoderFallback: (from, to) =>
      `检测到硬件编码器 ${from} 启动失败，已自动切回 ${to}（CPU 软编）继续导出。\n这通常是显卡驱动版本过旧或编码器未授权造成的，画质不会受影响。`,
    completed: (path) => `导出完成：\n${path}\n\n是否在资源管理器中显示？`,
    cancel: '取消',
  },

  background: {
    label: '背景',
    transparentLabel: '透明',
    transparentHint:
      '透明背景仅在 ProRes 4444 / PNG 序列导出时保留 alpha；MP4 始终使用纯色背景。',
  },

  presetIO: {
    label: '参数预设',
    exportJson: '导出 .json',
    importJson: '导入 .json',
    invalidFile: '文件格式不对',
    parseFailed: (msg) => `参数文件解析失败：${msg}`,
  },

  parameterPanel: {
    paneTitle: '参数',
  },

  presetSelector: {
    entry: (name, category) => `${name}（${category}）`,
    musicTagsLabel: '适合',
    allMoods: '全部',
    empty: '没有匹配的预设',
  },

  presetCategories: {
    spectrum: '频谱',
    particles: '粒子',
    shader: '着色器',
  },

  presetMoods: {
    energetic: '高能',
    ambient: '氛围',
    abstract: '抽象',
    minimal: '极简',
    retro: '复古',
    organic: '有机',
  },

  musicTags: {
    electronic: '电子',
    pop: '流行',
    hiphop: '嘻哈',
    rock: '摇滚',
    jazz: '爵士',
    classical: '古典',
    piano: '钢琴',
    lofi: 'Lo-fi',
    ambient: '环境',
    chillout: 'Chillout',
    techno: 'Techno',
    house: 'House',
    synthwave: 'Synthwave',
    vaporwave: 'Vaporwave',
    experimental: '实验',
    'dark-ambient': '暗黑环境',
    drone: 'Drone',
    'post-rock': '后摇',
    dnb: 'D&B',
    dubstep: 'Dubstep',
    cinematic: '配乐',
    psychedelic: '迷幻',
    '8bit': '8-bit',
  },

  presetNames: {
    'spectrum-bars': '镜像频谱条',
    'radial-spectrum': '圆环频谱',
    'area-spectrum': '填充频谱区域',
    'wave-line': '流光波形线',
    'circle-burst': '节拍冲击环',
    'particles-burst': '节拍粒子爆发',
    'gpu-particles': 'GPU 粒子场（百万级）',
    'shader-flow': '频谱流体',
    'st-wormhole': '虫洞 · 频谱驱动',
    'st-plasma': 'Plasma · 节拍脉冲',
    'st-neon-grid': 'Neon Grid · 80s',
    'st-mercury': '液态金属',
    'st-kaleido': '万花筒 · 频谱',
    'inversion': '反相栅格',
    'piano-rain': '下落音符 · Piano Rain',
    'drifting-spirits': '飘散灵气 · Drifting Spirits',
  },

  presetDescriptions: {
    'spectrum-bars': '镜像式频谱柱，最经典的音乐可视化呈现',
    'radial-spectrum': '圆环周围排布频谱条，节奏对称感强',
    'area-spectrum': '频谱填充为渐变区域，温和如波涛',
    'wave-line': '时域波形拉成流光线条，简约抽象',
    'circle-burst': '节拍触发的同心圆冲击波，冲击力强',
    'particles-burst': '节拍触发的粒子烟花，每个鼓点一朵花',
    'gpu-particles': '百万级粒子在流场中翻涌如星云',
    'shader-flow': '频谱驱动的流体扭曲,像液体在呼吸',
    'st-wormhole': '沿着虫洞前进，镜头跟随节拍俯冲',
    'st-plasma': '经典 Plasma 效果叠加节拍脉冲',
    'st-neon-grid': '80 年代复古赛博朋克网格线',
    'st-mercury': '液态金属表面的反射与流动',
    'st-kaleido': '频谱驱动的万花筒图案',
    'inversion': '黑白二值数学栅格，每次节拍整片翻转',
    'piano-rain': '极简下落音符 · 音符带尾迹下落，撞判定线爆闪；渐变色只染音符，背景默认纯黑（星空/水面可选开启）',
    'drifting-spirits': '节拍触发的发光粒子从底部缓缓上飘，像萤火虫升起',
  },

  // zh-CN 的 label 已经在每个预设源码里写好了，留空走 fallback。
  presetParamLabels: {},
  presetParamOptions: {},

  postFX: {
    enabled: '启用后处理',
    bloom: '◆ Bloom',
    bloomStrength: ' 强度',
    bloomRadius: ' 半径',
    bloomThreshold: ' 阈值',
    bloomBeatBoost: ' 节拍增益',
    chromatic: '◆ 色散',
    chromaticOffset: ' 偏移',
    chromaticBeatBoost: ' 节拍增益',
    glitch: '◆ 节拍故障',
    glitchIntensity: ' 强度',
    grain: '◆ 颗粒',
    grainIntensity: ' 强度',
    vignette: '◆ 暗角',
    vignetteAmount: ' 强度',
    vignetteSoftness: ' 柔和',
  },

  gradient: {
    custom: '自定义',
    advanced: '高级',
    collapse: '收起',
    start: '起点',
    middle: '中间',
    end: '终点',
    addMiddle: '添加中间色',
    removeMiddle: '移除',
    angle: (deg) => `角度 ${Math.round(deg)}°`,
    horizontalTitle: '水平',
    verticalTitle: '垂直',
    reset: '重置',
    groups: {
      mist: '雾系',
      neon: '霓虹',
      auroraOcean: '极光海洋',
      warm: '暖色',
      mono: '单色',
      rainbow: '彩虹',
    },
    presets: {
      'midnight-violet': '午夜紫',
      'haze-violet': '雾紫',
      'silver-mist': '银雾',
      charcoal: '深炭',
      'twilight-blue': '黎明蓝',
      'sakura-mist': '樱雾',
      cyberpunk: '赛博朋克',
      'neon-rose': '霓虹玫瑰',
      synthwave: '蒸汽波',
      miami: '迈阿密',
      'electric-violet': '电紫',
      'acid-lime': '酸橙',
      aurora: '极光',
      'ocean-dive': '深海',
      'mint-flow': '薄荷',
      glacier: '冰川',
      emerald: '翡翠',
      sunset: '日落',
      fire: '烈焰',
      'rose-gold': '玫瑰金',
      peach: '蜜桃',
      'amber-glow': '琥珀',
      monochrome: '黑白',
      moonlight: '月光',
      'gold-bar': '金条',
      'pure-white': '纯白',
      'pure-cyan': '纯青',
      rainbow: '彩虹',
      tropical: '热带',
      vinyl: '黑胶',
    },
  },

  fileDialog: {
    openTitle: '选择音频或视频文件',
    audioFilter: '音频',
    videoFilter: '视频',
    mediaFilter: '音频 / 视频',
    allFilesFilter: '所有文件',
    saveExportTitle: '导出到...',
    pngSeqDirTitle: '选择 PNG 序列输出文件夹',
    pngSeqFilterName: 'PNG 序列文件夹（输入文件夹名）',
    mp4FilterName: 'MP4 视频',
    proResFilterName: 'QuickTime ProRes 4444',
    snapshotTitle: '保存快照',
    snapshotFilterName: 'PNG 图像',
  },
};

function formatEtaZh(sec: number): string {
  if (sec < 60) return `${sec.toFixed(0)}s`;
  const m = Math.floor(sec / 60);
  const s = Math.floor(sec % 60);
  return `${m}m${String(s).padStart(2, '0')}s`;
}

function formatMBZh(mb: number): string {
  if (mb >= 1024) return `${(mb / 1024).toFixed(2)} GB`;
  if (mb >= 100) return `${mb.toFixed(0)} MB`;
  if (mb >= 10) return `${mb.toFixed(1)} MB`;
  return `${mb.toFixed(2)} MB`;
}
