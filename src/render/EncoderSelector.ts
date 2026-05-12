import type { GpuInfo } from './GpuTier';
import type {
  HardwareEncodersInfo,
  VideoEncoder,
} from '../../electron/preload';

/**
 * 根据"用户实际显卡 (gpuInfo) + ffmpeg 二进制支持的编码器 (hwEncoders.available)"
 * 取交集，给出最合理的默认编码器。
 *
 * 历史教训：之前默认逻辑是 `hwEncoders.available.find(startsWith('h264_'))`，
 * 但 ffmpeg-static 同时编了 nvenc/amf/qsv 三套 → A 卡/I 卡机器永远默认到 NVENC，
 * 导致这些用户每次都要手动切换，且初学者会以为"导出失败 = 程序坏了"。
 *
 * vendor 字符串 来自 WebGL_debug_renderer_info；在 笔电 + iGPU + dGPU 共存时，
 * 浏览器会按系统配置选某一块 GPU。这里只做"猜默认"，真正失败要靠
 * encoder-fallback 机制（spawn 后立刻 close → 自动改用 libx264 重试）。
 */
export function pickDefaultEncoder(
  gpu: GpuInfo | null,
  hw: HardwareEncodersInfo | null
): VideoEncoder {
  const av = hw?.available ?? [];
  const v = (gpu?.vendor ?? '').toLowerCase();
  const r = (gpu?.renderer ?? '').toLowerCase();

  const isNvidia = v.includes('nvidia') || r.includes('nvidia') || r.includes('geforce') || r.includes('rtx') || r.includes('gtx');
  const isAmd =
    v.includes('amd') ||
    v.includes('ati') ||
    r.includes('radeon') ||
    r.includes('amd') ||
    r.includes('ryzen');
  const isIntel =
    v.includes('intel') ||
    r.includes('intel') ||
    r.includes('iris') ||
    r.includes('uhd graphics') ||
    r.includes('hd graphics') ||
    r.includes('arc');

  if (isNvidia && av.includes('h264_nvenc')) return 'h264_nvenc';
  if (isAmd && av.includes('h264_amf')) return 'h264_amf';
  if (isIntel && av.includes('h264_qsv')) return 'h264_qsv';

  // 没匹配到 / 软件渲染：CPU 软编（永远能跑）
  return 'libx264';
}

/**
 * 用于 UI 显示"为什么默认选了这个编码器"。
 *
 * 返回结构化数据（不含语言文案），由 i18n 层渲染最终字符串：
 *  - kind=detecting   → "正在检测 GPU…"
 *  - kind=cpu         → "使用 CPU 软件编码（GPU 无可用硬件编码器）"
 *  - kind=auto-matched → "${gpuLabel}（已检测到匹配显卡）"
 *
 * 之前这里返中文硬编码字符串，导致英文 / 日文界面里夹一句中文。
 */
export type EncoderChoiceReason =
  | { kind: 'detecting'; isHardware: false }
  | { kind: 'cpu'; isHardware: false }
  | { kind: 'auto-matched'; isHardware: true; gpuLabel: string };

export function describeEncoderChoice(
  picked: VideoEncoder,
  gpu: GpuInfo | null
): EncoderChoiceReason {
  if (picked === 'libx264') {
    if (!gpu) return { kind: 'detecting', isHardware: false };
    return { kind: 'cpu', isHardware: false };
  }
  const hwLabel: Record<string, string> = {
    h264_nvenc: 'NVIDIA NVENC',
    hevc_nvenc: 'NVIDIA NVENC (HEVC)',
    h264_amf: 'AMD AMF',
    hevc_amf: 'AMD AMF (HEVC)',
    h264_qsv: 'Intel Quick Sync',
    hevc_qsv: 'Intel Quick Sync (HEVC)',
  };
  return {
    kind: 'auto-matched',
    isHardware: true,
    gpuLabel: hwLabel[picked] ?? picked,
  };
}
