import { join } from 'node:path';
import type {
  FFmpegStartOptions,
  ExportQuality,
  VideoEncoder,
} from '../preload.js';

const DEFAULT_QUALITY: ExportQuality = 'standard';

/**
 * 给 H.264 软件编码器（libx264）按质量档位映射 preset+crf。
 *
 * 对所有档位都加 `-tune animation`：告诉 x264 "这是动画/合成画面"，
 * 它会用更激进的运动补偿和帧间预测，对纯 2D 频谱柱体类内容
 * 减体积 10-20% 而画质不变。频谱可视化 100% 算合成画面，无副作用。
 */
function libx264QualityArgs(q: ExportQuality): string[] {
  const tune = ['-tune', 'animation'];
  switch (q) {
    case 'draft':
      return ['-preset', 'ultrafast', '-crf', '23', ...tune];
    case 'standard':
      return ['-preset', 'fast', '-crf', '20', ...tune];
    case 'high':
      return ['-preset', 'medium', '-crf', '17', ...tune];
    case 'best':
      return ['-preset', 'slow', '-crf', '14', ...tune];
  }
}

/**
 * NVIDIA NVENC：基于 cq + preset p1..p7
 */
function nvencQualityArgs(q: ExportQuality, codec: 'h264' | 'hevc'): string[] {
  const presetCq: Record<ExportQuality, [string, string]> = {
    draft: ['p1', '28'],
    standard: ['p3', '23'],
    high: ['p4', '19'],
    best: ['p7', '16'],
  };
  const [preset, cq] = presetCq[q];
  void codec;
  return ['-preset', preset, '-tune', 'hq', '-rc', 'vbr', '-cq', cq, '-b:v', '0'];
}

/**
 * AMD AMF：basic params
 */
function amfQualityArgs(q: ExportQuality): string[] {
  const qpMap: Record<ExportQuality, string> = {
    draft: '28',
    standard: '24',
    high: '20',
    best: '16',
  };
  return [
    '-quality',
    'quality',
    '-rc',
    'cqp',
    '-qp_i',
    qpMap[q],
    '-qp_p',
    qpMap[q],
  ];
}

/**
 * Intel Quick Sync Video
 */
function qsvQualityArgs(q: ExportQuality): string[] {
  const gqMap: Record<ExportQuality, string> = {
    draft: '28',
    standard: '24',
    high: '20',
    best: '16',
  };
  return ['-preset', 'medium', '-global_quality', gqMap[q]];
}

function isHwH264(enc: VideoEncoder): boolean {
  return enc === 'h264_nvenc' || enc === 'h264_amf' || enc === 'h264_qsv';
}
function isHwHevc(enc: VideoEncoder): boolean {
  return enc === 'hevc_nvenc' || enc === 'hevc_amf' || enc === 'hevc_qsv';
}

function videoEncoderArgs(
  encoder: VideoEncoder,
  quality: ExportQuality
): string[] {
  switch (encoder) {
    case 'libx264':
      return ['-c:v', 'libx264', '-pix_fmt', 'yuv420p', ...libx264QualityArgs(quality)];
    case 'h264_nvenc':
      return [
        '-c:v',
        'h264_nvenc',
        '-pix_fmt',
        'yuv420p',
        ...nvencQualityArgs(quality, 'h264'),
      ];
    case 'hevc_nvenc':
      return [
        '-c:v',
        'hevc_nvenc',
        '-pix_fmt',
        'yuv420p',
        ...nvencQualityArgs(quality, 'hevc'),
      ];
    case 'h264_amf':
      return ['-c:v', 'h264_amf', '-pix_fmt', 'yuv420p', ...amfQualityArgs(quality)];
    case 'hevc_amf':
      return ['-c:v', 'hevc_amf', '-pix_fmt', 'yuv420p', ...amfQualityArgs(quality)];
    case 'h264_qsv':
      return ['-c:v', 'h264_qsv', '-pix_fmt', 'yuv420p', ...qsvQualityArgs(quality)];
    case 'hevc_qsv':
      return ['-c:v', 'hevc_qsv', '-pix_fmt', 'yuv420p', ...qsvQualityArgs(quality)];
  }
}

export function buildFFmpegArgs(opts: FFmpegStartOptions): string[] {
  const {
    format,
    width,
    height,
    fps,
    outputPath,
    audioPath,
    audioStartSec,
    audioDurationSec,
    flipY = true,
    quality = DEFAULT_QUALITY,
    encoder = 'libx264',
  } = opts;

  // 视频原始流（来自 stdin）
  const videoInputArgs = [
    '-y',
    '-f',
    'rawvideo',
    '-pix_fmt',
    'rgba',
    '-s',
    `${width}x${height}`,
    '-r',
    String(fps),
    '-i',
    'pipe:0',
  ];

  // 音频输入：可剪辑
  const audioInputArgs: string[] = [];
  if (audioPath && format !== 'pngseq') {
    if (typeof audioStartSec === 'number' && audioStartSec > 0) {
      audioInputArgs.push('-ss', audioStartSec.toFixed(3));
    }
    if (typeof audioDurationSec === 'number' && audioDurationSec > 0) {
      audioInputArgs.push('-t', audioDurationSec.toFixed(3));
    }
    audioInputArgs.push('-i', audioPath);
  }

  const hasAudio = audioInputArgs.length > 0;
  const vfArgs = flipY ? ['-vf', 'vflip'] : [];

  switch (format) {
    case 'mp4': {
      const safeEncoder: VideoEncoder = isHwHevc(encoder) || isHwH264(encoder) || encoder === 'libx264'
        ? encoder
        : 'libx264';
      const venc = videoEncoderArgs(safeEncoder, quality);
      return [
        ...videoInputArgs,
        ...audioInputArgs,
        ...vfArgs,
        ...venc,
        '-movflags',
        '+faststart',
        ...(hasAudio
          ? [
              '-c:a',
              'aac',
              '-b:a',
              '320k',
              '-shortest',
              '-map',
              '0:v:0',
              '-map',
              '1:a:0',
            ]
          : ['-an']),
        outputPath,
      ];
    }

    case 'prores4444': {
      const proresQscale: Record<ExportQuality, string> = {
        draft: '13',
        standard: '11',
        high: '9',
        best: '5',
      };
      return [
        ...videoInputArgs,
        ...audioInputArgs,
        ...vfArgs,
        '-c:v',
        'prores_ks',
        '-profile:v',
        '4444',
        '-pix_fmt',
        'yuva444p10le',
        '-qscale:v',
        proresQscale[quality],
        '-vendor',
        'apl0',
        ...(hasAudio
          ? [
              '-c:a',
              'pcm_s16le',
              '-shortest',
              '-map',
              '0:v:0',
              '-map',
              '1:a:0',
            ]
          : ['-an']),
        outputPath,
      ];
    }

    case 'pngseq':
      return [
        ...videoInputArgs,
        ...vfArgs,
        '-pix_fmt',
        'rgba',
        '-compression_level',
        '6',
        join(outputPath, 'frame_%06d.png'),
      ];
  }
}
