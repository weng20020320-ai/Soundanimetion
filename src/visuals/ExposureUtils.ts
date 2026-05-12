import type * as THREE from 'three';
import type { ParamSchema } from './ParamSchema';

/**
 * 共享的"发光 / 曝光"控制参数。
 *
 * 解决的问题：渐变里高饱和的 stop（如 #00F5D4）经过 baseLightness×energyBoost
 * 放大后会冲到 1.0 以上，被 PostFX 的 UnrealBloomPass（threshold=0.6）抽出来
 * 做大半径模糊；而低能量柱子刚好踩在 threshold 边缘——画面里就会出现"一半雾光、
 * 一半实心条"的违和切换。
 *
 * 这里的 4 个参数让用户可以独立控制：
 * - exposure  : 整体亮度倍率（线性缩放）
 * - glowFloor : 低能量柱子的最低亮度地板，让它也能进 bloom 通道
 * - glowBias  : 在最终颜色上叠加的常数，整条频谱抬高到统一发光的水平
 * - softClip  : >1.0 之后用什么曲线收敛（线性 / 柔和 / 电影）
 */
export const EXPOSURE_SCHEMA: ParamSchema = {
  exposure: {
    type: 'float',
    label: '曝光倍率',
    min: 0.3,
    max: 2.5,
    step: 0.01,
    default: 0.85,
  },
  glowFloor: {
    type: 'float',
    label: '发光地板',
    min: 0,
    max: 1,
    step: 0.01,
    default: 0.5,
  },
  glowBias: {
    type: 'float',
    label: '发光偏置',
    min: 0,
    max: 0.6,
    step: 0.01,
    default: 0.15,
  },
  softClip: {
    type: 'select',
    label: '过曝曲线',
    default: 'soft',
    options: [
      { label: '线性（不裁切）', value: 'linear' },
      { label: '柔和（推荐）', value: 'soft' },
      { label: '电影（ACES）', value: 'film' },
    ],
  },
};

export type SoftClipMode = 'linear' | 'soft' | 'film';

export interface ExposureParams {
  /** 现有的"亮度基线"，0~1，能量为 0 时的亮度。 */
  baseLightness: number;
  /** 现有的"能量亮度增益"，能量驱动的额外亮度。 */
  energyBoost: number;
  /** 整体曝光倍率。 */
  exposure: number;
  /** 低能量地板：保证最低亮度不低于这个值（防止低能量柱子完全黯淡）。 */
  glowFloor: number;
  /** 加性偏置：直接 + 到最终颜色，把整条频谱抬到 bloom threshold 之上。 */
  glowBias: number;
  /** 高于 1.0 时的收敛曲线。 */
  softClip: SoftClipMode;
}

const _SOFT_KNEE = 0.8;

/** 软膝裁切：c < 0.8 透传；c >= 0.8 平滑收敛到 1.0。 */
function softKnee(c: number): number {
  if (c <= _SOFT_KNEE) return c;
  const excess = c - _SOFT_KNEE;
  const range = 1 - _SOFT_KNEE;
  return _SOFT_KNEE + range * (excess / (excess + range));
}

/** 简化的 ACES filmic（Krzysztof Narkowicz 版本）。 */
function aces(x: number): number {
  const a = 2.51,
    b = 0.03,
    c = 2.43,
    d = 0.59,
    e = 0.14;
  const v = (x * (a * x + b)) / (x * (c * x + d) + e);
  if (v < 0) return 0;
  if (v > 1) return 1;
  return v;
}

/**
 * 应用整套曝光管线：渐变颜色 + 能量 + 一组参数 → 写入到 out 三个分量。
 *
 * 注意 `out` 是一个 length>=3 的 Float32Array 切片以及起始 offset，避免分配。
 */
export function applyExposure(
  gradient: THREE.Color,
  energy: number,
  params: ExposureParams,
  out: Float32Array,
  offset: number
): void {
  const e = energy < 0 ? 0 : energy > 1 ? 1 : energy;
  let brightness = params.baseLightness + e * params.energyBoost;
  if (brightness < params.glowFloor) brightness = params.glowFloor;
  const gain = brightness * 2 * params.exposure;

  let r = gradient.r * gain + params.glowBias;
  let g = gradient.g * gain + params.glowBias;
  let b = gradient.b * gain + params.glowBias;

  switch (params.softClip) {
    case 'linear':
      // 不裁切，让 HDR 值进入 bloom 通道
      break;
    case 'soft':
      r = softKnee(r);
      g = softKnee(g);
      b = softKnee(b);
      break;
    case 'film':
      r = aces(r);
      g = aces(g);
      b = aces(b);
      break;
  }

  out[offset + 0] = r < 0 ? 0 : r;
  out[offset + 1] = g < 0 ? 0 : g;
  out[offset + 2] = b < 0 ? 0 : b;
}

/** 从 Tweakpane 给到的 params 对象里抽出曝光相关的子集。 */
export function extractExposureParams(
  params: Record<string, unknown>
): ExposureParams {
  return {
    baseLightness: (params.baseLightness as number) ?? 0.55,
    energyBoost: (params.energyBoost as number) ?? 0.45,
    exposure: (params.exposure as number) ?? 0.85,
    glowFloor: (params.glowFloor as number) ?? 0.5,
    glowBias: (params.glowBias as number) ?? 0.15,
    softClip: (params.softClip as SoftClipMode) ?? 'soft',
  };
}
