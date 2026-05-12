import type {
  ExportFormat,
  ExportQuality,
  VideoEncoder,
} from '../../electron/preload';

export interface SizeEstimate {
  /** 视频体积 MB */
  videoMB: number;
  /** 音频体积 MB（可能为 0） */
  audioMB: number;
  /** 合计 MB */
  totalMB: number;
  /** 平均码率 Mbps（视频部分，便于对比） */
  videoMbps: number;
  /** 估算粗略度（"≈" 程度），给 UI 标注 ±30% / ±50% 之类 */
  uncertaintyPct: number;
  /** 是否含音频部分（用于 UI 决定显示 "video + audio" 还是只 "video"） */
  hasAudio: boolean;
}

/**
 * MB → 人类可读字符串（"32.40 MB" / "1.20 GB"）。
 * 与 locale 无关；i18n 文案里直接调用，避免每个 locale 重复实现。
 */
export function formatMB(mb: number): string {
  if (mb >= 1024) return `${(mb / 1024).toFixed(2)} GB`;
  if (mb >= 100) return `${mb.toFixed(0)} MB`;
  if (mb >= 10) return `${mb.toFixed(1)} MB`;
  return `${mb.toFixed(2)} MB`;
}

/**
 * 1080p / 30fps 时各编码器 / 各档位的"基准 bps"。
 * 数据来源：x264/NVENC/AMF 在合成动画类内容上的统计 + 这个项目的频谱可视化实测修正。
 *
 * 频谱柱体类（高对比锐利边缘）会比"普通视频"贵 1.2-1.5×；
 * 模糊渐变类（gpu-particles / shader-flow）反而更便宜（× 0.7-0.9）。
 * 这里取中间值，UI 上会标注 ±30% 不确定度。
 */
const BASE_BPS_1080P30: Partial<
  Record<VideoEncoder, Record<ExportQuality, number>>
> = {
  libx264: {
    draft: 4_000_000,
    standard: 7_000_000,
    high: 15_000_000,
    best: 30_000_000,
  },
  h264_nvenc: {
    draft: 5_000_000,
    standard: 8_000_000,
    high: 17_000_000,
    best: 32_000_000,
  },
  hevc_nvenc: {
    draft: 3_500_000,
    standard: 5_500_000,
    high: 12_000_000,
    best: 22_000_000,
  },
  h264_amf: {
    draft: 5_000_000,
    standard: 9_000_000,
    high: 18_000_000,
    best: 33_000_000,
  },
  hevc_amf: {
    draft: 3_500_000,
    standard: 6_000_000,
    high: 12_500_000,
    best: 23_000_000,
  },
  h264_qsv: {
    draft: 5_000_000,
    standard: 8_000_000,
    high: 17_000_000,
    best: 30_000_000,
  },
  hevc_qsv: {
    draft: 3_500_000,
    standard: 5_500_000,
    high: 12_000_000,
    best: 21_000_000,
  },
};

/**
 * ProRes 4444 的码率几乎是恒定的（intra-frame，每帧独立），
 * 1080p ≈ 700 Mbps（high 档），qscale 影响约 ±20%。
 */
function proresBps(width: number, height: number, fps: number, quality: ExportQuality): number {
  // 经验值：1080p30 high ≈ 700 Mbps
  const base = 700_000_000;
  const pixelScale = (width * height) / (1920 * 1080);
  const fpsScale = fps / 30;
  const qScale: Record<ExportQuality, number> = {
    draft: 0.7,
    standard: 0.85,
    high: 1.0,
    best: 1.4,
  };
  return base * pixelScale * fpsScale * qScale[quality];
}

export function estimateExportSize(opts: {
  format: ExportFormat;
  width: number;
  height: number;
  fps: number;
  durationSec: number;
  encoder: VideoEncoder;
  quality: ExportQuality;
  hasAudio: boolean;
  /** AAC 比特率，默认 320kbps（与 ffmpeg-args.ts 默认一致） */
  audioKbps?: number;
}): SizeEstimate {
  const {
    format,
    width,
    height,
    fps,
    durationSec,
    encoder,
    quality,
    hasAudio,
    audioKbps = 320,
  } = opts;

  let videoBytes = 0;
  let videoMbps = 0;
  let uncertaintyPct = 30;

  if (format === 'pngseq') {
    // PNG 大小受图像复杂度影响很大；这里按经验值 1080p RGBA ≈ 1.5 MB 估算，并按像素数缩放
    const perFrameMB = ((width * height) / (1920 * 1080)) * 1.5;
    videoBytes = perFrameMB * 1024 * 1024 * fps * durationSec;
    videoMbps = (videoBytes * 8) / durationSec / 1_000_000;
    uncertaintyPct = 50; // PNG 大小波动很大
  } else if (format === 'prores4444') {
    const bps = proresBps(width, height, fps, quality);
    videoBytes = (bps * durationSec) / 8;
    videoMbps = bps / 1_000_000;
    uncertaintyPct = 15; // intra-frame，估算很稳
  } else {
    // mp4 (H.264/HEVC)
    const baseTable = BASE_BPS_1080P30[encoder] ?? BASE_BPS_1080P30.libx264!;
    let bps = baseTable[quality];
    // 分辨率缩放（按像素数）
    bps *= (width * height) / (1920 * 1080);
    // FPS 缩放（线性但有 0.85 折扣，因为帧间预测随 fps 提高更有效）
    bps *= (fps / 30) * 0.85;
    videoBytes = (bps * durationSec) / 8;
    videoMbps = bps / 1_000_000;
    uncertaintyPct = 35; // 不同内容差异大
  }

  const videoMB = videoBytes / 1024 / 1024;
  const audioMB = hasAudio ? (audioKbps * 1000 * durationSec) / 8 / 1024 / 1024 : 0;
  const totalMB = videoMB + audioMB;

  return {
    videoMB,
    audioMB,
    totalMB,
    videoMbps,
    uncertaintyPct,
    // > 0.05 MB ≈ "音频不可忽略"。低于这个值（极短片段）就不在 UI 上单列音频体积
    hasAudio: audioMB > 0.05,
  };
}
