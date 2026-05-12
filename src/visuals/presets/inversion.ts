import type { VisualPreset } from '../VisualPreset';
import type { ParamSchema } from '../ParamSchema';
import { createShaderPreset } from '../ShaderPresetFactory';
import { gradientFromPreset } from '../GradientPresets';

/**
 * Inversion · 反相栅格
 *
 * 灵感来自 MilkDrop "Phat - Inversion 1"：
 *   黑白二值数学栅格 → 每个节拍整片翻转一次。
 *
 * 设计意图：
 *   - **极简**：渐变色控制底/顶两端，节拍时整片翻转
 *   - **节奏锐利**：靠"翻转"传达节拍，不是靠"亮度脉冲"
 *   - **数学美感**：栅格随谱质心缓慢旋转，bass 命中时密度变高
 *
 * 旧版问题修复：
 *   1. 节拍翻转阈值默认 0.7 + beatDecay 1.2 → 流行歌每拍 0.5s 时
 *      几乎全程处于 invert 状态 → 全屏白底。现在阈值 0.4 + beatDecay 2.0
 *      让翻转只持续 ~0.25s。
 *   2. 旧 shader 把 threshold 0.32 硬编码 → 翻转后 ~60% 白屏。
 *      新版用户可调 fillRatio（默认 0.35），让"安静态"是 ~50% 暗主体，
 *      翻转态是 ~50% 亮主体，黑白比例平衡。
 *   3. 前景色从纯白 #ffffff 改成 gradient 渐变控制，默认 monochrome 维持
 *      黑白二值风但避开 Bloom threshold 0.6 的过曝问题。
 *
 * 适合：minimal techno / Steve Reich 风的极简古典 / 实验电子
 */

const schema: ParamSchema = {
  cellSize: {
    type: 'float',
    label: '栅格大小',
    min: 0.01,
    max: 0.2,
    step: 0.005,
    default: 0.06,
  },
  shape: {
    type: 'select',
    label: '形状',
    default: 0,
    options: [
      { label: '方块', value: 0 },
      { label: '三角', value: 1 },
      { label: '圆点', value: 2 },
      { label: '十字', value: 3 },
    ],
  },
  fillRatio: {
    type: 'float',
    label: '图形占比',
    min: 0.1,
    max: 0.48,
    step: 0.01,
    // 0.35 → 图形大约占 cell 的 35%。
    // 翻转后图形/背景比例 ~65%/35%，比旧版 ~60% 白屏更平衡。
    default: 0.35,
  },
  rotateSpeed: {
    type: 'float',
    label: '旋转速度',
    min: -2,
    max: 2,
    step: 0.01,
    default: 0.15,
  },
  beatInvert: {
    type: 'float',
    label: '节拍翻转强度',
    min: 0,
    max: 1,
    step: 0.01,
    // 旧默认 0.7 → 阈值 0.3 → 大部分时间都在 invert。
    // 新默认 0.4 → 阈值 0.6 → 节拍后 ~0.25s 翻转，平时维持原状。
    default: 0.4,
  },
  bassDensity: {
    type: 'float',
    label: 'Bass 密度调制',
    min: 0,
    max: 2,
    step: 0.01,
    default: 0.6,
  },
  contrast: {
    type: 'float',
    label: '边缘硬度',
    min: 4,
    max: 60,
    step: 1,
    default: 24,
  },
  gradient: {
    type: 'gradient',
    label: '渐变色',
    // 默认 monochrome 还原 MilkDrop Inversion 的黑白二值美学
    default: gradientFromPreset('monochrome', 0),
  },
  accentBoost: {
    type: 'float',
    label: '节拍辅色强度',
    min: 0,
    max: 1,
    step: 0.01,
    default: 0.5,
  },
};

const MAIN_IMAGE = /* glsl */ `
uniform float uCellSize;
uniform float uShape;
uniform float uFillRatio;
uniform float uRotateSpeed;
uniform float uBeatInvert;
uniform float uBassDensity;
uniform float uContrast;
uniform float uAccentBoost;

float hash21(vec2 p) {
  return fract(sin(dot(p, vec2(127.1, 311.7))) * 43758.5453);
}

void mainImage(out vec4 fragColor, in vec2 fragCoord) {
  vec2 uv = fragCoord / iResolution.xy - 0.5;
  uv.x *= uAspect;

  // 整体旋转：时间 + 谱质心微扰
  float ang = uTime * uRotateSpeed + uCentroid * 1.2;
  float c = cos(ang);
  float s = sin(ang);
  uv = mat2(c, -s, s, c) * uv;

  // 栅格密度：bass 强时网格更密
  float cell = uCellSize / max(0.1, 1.0 + clamp(uBass, 0.0, 1.0) * uBassDensity);
  vec2 g = uv / cell;
  vec2 fid = floor(g);
  vec2 fp = fract(g) - 0.5;

  // 形状的 SDF
  float d;
  if (uShape < 0.5) {
    d = max(abs(fp.x), abs(fp.y));
  } else if (uShape < 1.5) {
    // 三角：等腰朝上
    d = max(abs(fp.x) * 1.15 + fp.y * 0.6, -fp.y - 0.32);
  } else if (uShape < 2.5) {
    d = length(fp);
  } else {
    // 十字：取两条带的并集（取较小值）
    d = min(abs(fp.x), abs(fp.y)) + 0.08;
  }

  // 二值化：threshold 由 uFillRatio 控制，0.5 表示半半，越小图形越小
  float threshold = uFillRatio;
  float edge = 0.5 / max(1.0, uContrast);
  float v = 1.0 - smoothstep(threshold - edge, threshold + edge, d);

  // 节拍翻转：beatEnv 高于阈值时整片二值互换
  float invert = step(1.0 - uBeatInvert, uBeatEnv);
  v = mix(v, 1.0 - v, invert);

  // 渐变色采样：
  //  - 背景色 = gradient(0.0)，前景色 = gradient(1.0)
  //  - 节拍时约 3% 的 cell 取 gradient 中段做"辅色点缀"
  vec3 bg = gradient(0.0);
  vec3 fg = gradient(1.0);
  float h = hash21(fid + 0.5);
  float accent = step(0.97, h) * uBeatEnv * uAccentBoost;
  vec3 accentColor = gradient(0.5);
  vec3 fgFinal = mix(fg, accentColor, accent);

  vec3 col = mix(bg, fgFinal, v);
  fragColor = vec4(col, 1.0);
}
`;

export function createInversionPreset(): VisualPreset {
  return createShaderPreset({
    id: 'inversion',
    name: '反相栅格',
    paramSchema: schema,
    uniformsFromParams: (p) => ({
      uCellSize: p.cellSize as number,
      uShape: p.shape as number,
      uFillRatio: p.fillRatio as number,
      uRotateSpeed: p.rotateSpeed as number,
      uBeatInvert: p.beatInvert as number,
      uBassDensity: p.bassDensity as number,
      uContrast: p.contrast as number,
      uAccentBoost: p.accentBoost as number,
    }),
    extraUniforms: () => ({
      uCellSize: { value: 0.06 },
      uShape: { value: 0 },
      uFillRatio: { value: 0.35 },
      uRotateSpeed: { value: 0.15 },
      uBeatInvert: { value: 0.4 },
      uBassDensity: { value: 0.6 },
      uContrast: { value: 24 },
      uAccentBoost: { value: 0.5 },
    }),
    mainImage: MAIN_IMAGE,
    // 旧值 1.2 → 衰减 ~0.6s。新值 2.4 → 翻转持续 ~0.25s 而不是糊一整拍
    beatDecay: 2.4,
  });
}
