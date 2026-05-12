import * as THREE from 'three';

/**
 * 渐变值通用数据结构。
 *
 * 设计目标：
 *  1) 对色彩不敏感的人能直接挑预设；
 *  2) 想微调时只调起/中/终三个色（同时支持 N 个 stop 用于复杂的彩虹类）；
 *  3) 所有预设都做过对比度/视频审美调校。
 */
export interface GradientStop {
  color: string;
  /** 0..1，单调递增 */
  t: number;
}

export interface GradientValue {
  /** 来自预设库时的 ID（仅作为书签，渲染仍走 stops） */
  presetId?: string;
  /** 至少 2 个 stop */
  stops: GradientStop[];
  /** 旋转角度（度，0=水平，90=垂直）。仅对 2D 视觉有意义。 */
  rotation: number;
}

export interface GradientPresetMeta {
  id: string;
  name: string;
  /** UI 缩略图 / 子分组 */
  group: '雾系' | '霓虹' | '极光海洋' | '暖色' | '单色' | '彩虹';
  stops: GradientStop[];
}

/**
 * 经过设计调色的渐变库，覆盖音乐视频常见审美。
 *
 * 雾系/单色：用户给的截图里那种夜色雾紫，黑底视频特别耐看，混 PostFX bloom 出来不刺眼。
 * 霓虹/赛博：高饱和、互补色，适合 EDM/电子。
 * 极光海洋：冷色，宽频谱，做环境音/钢琴/Lofi 没问题。
 * 暖色：日落/烈焰，适合 Pop / Hip-hop / 拉丁。
 * 彩虹：rainbow 是兜底，频段差异最强。
 */
export const GRADIENT_PRESETS: GradientPresetMeta[] = [
  // ── 雾系（用户截图风格） ───────────────────────────────────────────
  { id: 'midnight-violet', name: '午夜紫', group: '雾系',
    stops: [{ color: '#1e202c', t: 0 }, { color: '#60519b', t: 1 }] },
  { id: 'haze-violet',     name: '雾紫',   group: '雾系',
    stops: [{ color: '#60519b', t: 0 }, { color: '#31323e', t: 1 }] },
  { id: 'silver-mist',     name: '银雾',   group: '雾系',
    stops: [{ color: '#31323e', t: 0 }, { color: '#bfc0d1', t: 1 }] },
  { id: 'charcoal',        name: '深炭',   group: '雾系',
    stops: [{ color: '#1e202c', t: 0 }, { color: '#31323e', t: 1 }] },
  { id: 'twilight-blue',   name: '黎明蓝', group: '雾系',
    stops: [{ color: '#1a2540', t: 0 }, { color: '#5e7cb3', t: 1 }] },
  { id: 'sakura-mist',     name: '樱雾',   group: '雾系',
    stops: [{ color: '#3a2a3f', t: 0 }, { color: '#e6a4b4', t: 1 }] },

  // ── 霓虹 / 赛博 ────────────────────────────────────────────────────
  { id: 'cyberpunk',  name: '赛博朋克', group: '霓虹',
    stops: [{ color: '#ff006e', t: 0 }, { color: '#3a86ff', t: 1 }] },
  { id: 'neon-rose',  name: '霓虹玫瑰', group: '霓虹',
    stops: [{ color: '#ff0080', t: 0 }, { color: '#7928ca', t: 1 }] },
  { id: 'synthwave',  name: '蒸汽波',   group: '霓虹',
    stops: [{ color: '#fc466b', t: 0 }, { color: '#3f5efb', t: 1 }] },
  { id: 'miami',      name: '迈阿密',   group: '霓虹',
    stops: [{ color: '#0acffe', t: 0 }, { color: '#495aff', t: 1 }] },
  { id: 'electric-violet', name: '电紫', group: '霓虹',
    stops: [{ color: '#4f00bc', t: 0 }, { color: '#29abe2', t: 1 }] },
  { id: 'acid-lime',  name: '酸橙',     group: '霓虹',
    stops: [{ color: '#39ff14', t: 0 }, { color: '#00b4d8', t: 1 }] },

  // ── 极光 / 海洋 ────────────────────────────────────────────────────
  { id: 'aurora',     name: '极光',     group: '极光海洋',
    stops: [{ color: '#00d4ff', t: 0 }, { color: '#7b2cbf', t: 1 }] },
  { id: 'ocean-dive', name: '深海',     group: '极光海洋',
    stops: [{ color: '#0077b6', t: 0 }, { color: '#00f5d4', t: 1 }] },
  { id: 'mint-flow',  name: '薄荷',     group: '极光海洋',
    stops: [{ color: '#06ffa5', t: 0 }, { color: '#0096c7', t: 1 }] },
  { id: 'glacier',    name: '冰川',     group: '极光海洋',
    stops: [{ color: '#a8edea', t: 0 }, { color: '#5b86e5', t: 1 }] },
  { id: 'emerald',    name: '翡翠',     group: '极光海洋',
    stops: [{ color: '#0f4c4a', t: 0 }, { color: '#16f4d0', t: 1 }] },

  // ── 暖色 ──────────────────────────────────────────────────────────
  { id: 'sunset',     name: '日落',     group: '暖色',
    stops: [{ color: '#ff6b6b', t: 0 }, { color: '#feca57', t: 1 }] },
  { id: 'fire',       name: '烈焰',     group: '暖色',
    stops: [{ color: '#fb5607', t: 0 }, { color: '#ffbe0b', t: 1 }] },
  { id: 'rose-gold',  name: '玫瑰金',   group: '暖色',
    stops: [{ color: '#f72585', t: 0 }, { color: '#ffbe0b', t: 1 }] },
  { id: 'peach',      name: '蜜桃',     group: '暖色',
    stops: [{ color: '#ffafbd', t: 0 }, { color: '#ffc3a0', t: 1 }] },
  { id: 'amber-glow', name: '琥珀',     group: '暖色',
    stops: [{ color: '#3a1c0c', t: 0 }, { color: '#ffaa33', t: 1 }] },

  // ── 单色 / 双色 ────────────────────────────────────────────────────
  { id: 'monochrome', name: '黑白',     group: '单色',
    stops: [{ color: '#000000', t: 0 }, { color: '#ffffff', t: 1 }] },
  { id: 'moonlight',  name: '月光',     group: '单色',
    stops: [{ color: '#bdc3c7', t: 0 }, { color: '#2c3e50', t: 1 }] },
  { id: 'gold-bar',   name: '金条',     group: '单色',
    stops: [{ color: '#3a2a0a', t: 0 }, { color: '#ffd166', t: 1 }] },
  { id: 'pure-white', name: '纯白',     group: '单色',
    stops: [{ color: '#ffffff', t: 0 }, { color: '#ffffff', t: 1 }] },
  { id: 'pure-cyan',  name: '纯青',     group: '单色',
    stops: [{ color: '#00ffd5', t: 0 }, { color: '#00ffd5', t: 1 }] },

  // ── 彩虹 / 多色 ───────────────────────────────────────────────────
  { id: 'rainbow', name: '彩虹', group: '彩虹', stops: [
    { color: '#ff006e', t: 0 },
    { color: '#ffbe0b', t: 0.33 },
    { color: '#06ffa5', t: 0.66 },
    { color: '#3a86ff', t: 1 },
  ]},
  { id: 'tropical', name: '热带', group: '彩虹', stops: [
    { color: '#43e97b', t: 0 },
    { color: '#38f9d7', t: 0.5 },
    { color: '#3a86ff', t: 1 },
  ]},
  { id: 'vinyl', name: '黑胶', group: '彩虹', stops: [
    { color: '#0d1b2a', t: 0 },
    { color: '#e63946', t: 0.5 },
    { color: '#f1faee', t: 1 },
  ]},
];

const tmpA = new THREE.Color();
const tmpB = new THREE.Color();

/**
 * 在 t∈[0,1] 处采样渐变色。stops 必须按 t 升序排列。
 */
export function sampleGradient(
  g: GradientValue,
  t: number,
  out?: THREE.Color
): THREE.Color {
  const target = out ?? new THREE.Color();
  const stops = g.stops;
  if (!stops || stops.length === 0) {
    target.setRGB(1, 1, 1);
    return target;
  }
  if (stops.length === 1) {
    target.set(stops[0].color);
    return target;
  }
  const tt = Math.max(0, Math.min(1, t));
  // 找到 tt 落在哪两个 stop 之间
  let lo = 0;
  for (let i = 0; i < stops.length - 1; i++) {
    if (tt >= stops[i].t && tt <= stops[i + 1].t) {
      lo = i;
      break;
    }
  }
  if (tt > stops[stops.length - 1].t) lo = stops.length - 2;
  const a = stops[lo];
  const b = stops[lo + 1];
  const span = Math.max(1e-6, b.t - a.t);
  const k = (tt - a.t) / span;
  tmpA.set(a.color);
  tmpB.set(b.color);
  target.copy(tmpA).lerp(tmpB, k);
  return target;
}

export function gradientPresetById(id: string): GradientPresetMeta | undefined {
  return GRADIENT_PRESETS.find((p) => p.id === id);
}

export function gradientFromPreset(id: string, rotation = 0): GradientValue {
  const p = gradientPresetById(id);
  const stops = p ? p.stops.map((s) => ({ ...s })) : [
    { color: '#3a86ff', t: 0 },
    { color: '#ff006e', t: 1 },
  ];
  return { presetId: p?.id, stops, rotation };
}

export function defaultGradient(): GradientValue {
  return gradientFromPreset('midnight-violet', 0);
}

/**
 * 把 GradientValue 渲染成 CSS linear-gradient(...) 字符串，给预览用。
 */
export function gradientToCss(g: GradientValue): string {
  const stops = g.stops
    .map((s) => `${s.color} ${(s.t * 100).toFixed(1)}%`)
    .join(', ');
  return `linear-gradient(${g.rotation}deg, ${stops})`;
}

/**
 * 深拷贝。
 */
export function cloneGradient(g: GradientValue): GradientValue {
  return {
    presetId: g.presetId,
    stops: g.stops.map((s) => ({ ...s })),
    rotation: g.rotation,
  };
}

/* ------------------------------------------------------------------ */
/* Gradient → 1D LUT 纹理：让 fragment shader 能调用 `gradient(float t)`。
 *
 * 用法：
 *   const { buffer, texture } = createGradientLUT();
 *   bakeGradientToLUT(gradient, buffer, texture);
 *   material.uniforms.uGradientTex.value = texture;
 *
 * 64×1 RGBA8 已经足够平滑（线性插值 64 段对人眼不可分辨）。
 * UnsignedByte：色彩管线本来就 8-bit 输出，没必要 HalfFloat。
 * sRGB colorSpace：让 three.js 在采样时做 sRGB→linear 解码，
 * 后端再做 linear→sRGB，色彩还原与 GradientPicker 预览条一致。
 * ------------------------------------------------------------------ */

export const GRADIENT_LUT_SIZE = 64;

export function createGradientLUT(): {
  buffer: Uint8Array<ArrayBuffer>;
  texture: THREE.DataTexture;
} {
  const buffer = new Uint8Array(
    GRADIENT_LUT_SIZE * 4
  ) as Uint8Array<ArrayBuffer>;
  const texture = new THREE.DataTexture(
    buffer,
    GRADIENT_LUT_SIZE,
    1,
    THREE.RGBAFormat,
    THREE.UnsignedByteType
  );
  texture.minFilter = THREE.LinearFilter;
  texture.magFilter = THREE.LinearFilter;
  texture.wrapS = THREE.ClampToEdgeWrapping;
  texture.wrapT = THREE.ClampToEdgeWrapping;
  texture.colorSpace = THREE.SRGBColorSpace;
  texture.needsUpdate = true;
  return { buffer, texture };
}

const _lutSampleColor = new THREE.Color();
export function bakeGradientToLUT(
  g: GradientValue,
  buffer: Uint8Array<ArrayBuffer>,
  texture: THREE.DataTexture
): void {
  for (let i = 0; i < GRADIENT_LUT_SIZE; i++) {
    const t = i / (GRADIENT_LUT_SIZE - 1);
    sampleGradient(g, t, _lutSampleColor);
    buffer[i * 4 + 0] = Math.round(_lutSampleColor.r * 255);
    buffer[i * 4 + 1] = Math.round(_lutSampleColor.g * 255);
    buffer[i * 4 + 2] = Math.round(_lutSampleColor.b * 255);
    buffer[i * 4 + 3] = 255;
  }
  texture.needsUpdate = true;
}

/**
 * 比较两个 GradientValue 是否需要重新烧 LUT。
 * 用 stops 的 color/t 序列比较 — reference equality 不靠谱（用户每次拖滑块都新建 obj）。
 */
export function gradientChanged(
  a: GradientValue | null,
  b: GradientValue
): boolean {
  if (!a || a.stops.length !== b.stops.length) return true;
  for (let i = 0; i < a.stops.length; i++) {
    if (a.stops[i].color !== b.stops[i].color) return true;
    if (a.stops[i].t !== b.stops[i].t) return true;
  }
  return false;
}
