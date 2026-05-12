import * as THREE from 'three';
import type { VisualPreset } from '../VisualPreset';
import type { ParamSchema } from '../ParamSchema';
import type { AudioFeatures } from '../../audio/types';
import type { ThreeContext } from '../../render/ThreeContext';
import {
  type GradientValue,
  defaultGradient,
  gradientFromPreset,
  createGradientLUT,
  bakeGradientToLUT,
  gradientChanged,
} from '../GradientPresets';

/**
 * Drifting Spirits · 飘散灵气
 *
 * ★ 坐标系 ★
 *   vertex shader 直接 `gl_Position = vec4(pos.xy, 0, 1)` 用 NDC 坐标，
 *   y=-1 是屏幕真正底部，y=1 是顶部。粒子从底部 spawn 升起、飘过整屏到顶部消失。
 *
 * ★ Blending（NormalBlending）★
 *   AdditiveBlending 在浅色背景下完全不可见（src+bg 钳到 1）；NormalBlending
 *   配非 premultiplied alpha 让任何背景色都能正确混合显示粒子色。
 *
 * ★ 渐变色 = 主题色（不是滤镜）★
 *   旧版：每个粒子 spawn 时随机取 gradient 上某个 t，整片粒子是 gradient 上点
 *         的离散随机采样 → 看起来像"杂色喷雾"，换 gradient 像加了一层滤镜。
 *   新版：gradient 的 t 由粒子在屏幕上的 **y 位置** 决定（底=暗端、顶=亮端），
 *         每个粒子只做 ±15% 微抖动。这样整片粒子云从下到上呈现 gradient 的
 *         完整色相过渡。切换 gradient = 切换"主题"，整片云的色调一起改变。
 *         单个粒子从底部出生到顶部消失，自身颜色也沿 gradient 变化。
 *
 * 适合：钢琴、Ambient、Lofi、新世纪、电影配乐、慢节奏电子。
 */

const schema: ParamSchema = {
  particleCount: {
    type: 'int',
    label: '粒子池大小',
    min: 256,
    max: 4096,
    step: 128,
    structural: true,
    // 1500 + 中等 alpha：屏幕能有"灵气云" 但叠加不爆白
    default: 1500,
  },
  particleSize: {
    type: 'float',
    label: '粒子大小',
    min: 2,
    max: 50,
    step: 0.5,
    // NDC 坐标系下 PointSize 是像素值。22 + uPixelRatio 后 ≈ 44px gaussian 圆点
    default: 22,
  },
  beatBurst: {
    type: 'int',
    label: '节拍喷发数',
    min: 0,
    max: 80,
    step: 1,
    // 每拍 25 个粒子 × 寿命 5s ≈ 节拍峰值上的 125 同时粒子
    default: 25,
  },
  beatThreshold: {
    type: 'float',
    label: '节拍触发阈值（RMS）',
    min: 0,
    max: 0.6,
    step: 0.01,
    // 0.05 比较宽松，更多节拍能触发
    default: 0.05,
  },
  ambientRate: {
    type: 'float',
    label: '持续喷发速率',
    min: 0,
    max: 50,
    step: 0.5,
    // 12 × RMS 0.15 ≈ 1.8/秒 ambient，加节拍 50/秒峰值 → 整体能看见
    default: 12,
  },
  riseSpeed: {
    type: 'float',
    label: '上升速度',
    min: 0.1,
    max: 1.5,
    step: 0.01,
    // NDC y 方向每秒移动量。0.45 = 约 4.5s 飞过屏幕 (-1 → +1)
    default: 0.45,
  },
  drift: {
    type: 'float',
    label: '左右漂移',
    min: 0,
    max: 0.8,
    step: 0.005,
    default: 0.15,
  },
  lifetime: {
    type: 'float',
    label: '寿命（秒）',
    min: 2,
    max: 12,
    step: 0.1,
    default: 5,
  },
  spawnSpread: {
    type: 'float',
    label: '底部出生宽度',
    min: 0.1,
    max: 1,
    step: 0.01,
    default: 0.95,
  },
  alphaScale: {
    type: 'float',
    label: '不透明度',
    min: 0.1,
    max: 1.5,
    step: 0.01,
    // 0.85 × shader 单粒子上限 0.65 = 峰值 ~0.55。NormalBlending 下这个值
    // 让粒子是半透明、能看到层次叠加，但每个粒子轮廓清晰。
    default: 0.85,
  },
  bassPush: {
    type: 'float',
    label: 'Bass 加速',
    min: 0,
    max: 2.5,
    step: 0.01,
    default: 0.6,
  },
  gradient: {
    type: 'gradient',
    label: '渐变色',
    default: gradientFromPreset('sakura-mist', 0),
  },
};

/* ----------------------------------------------------------- */
/* Shader：NDC 直出，每个粒子 = 1 个 Point
 *
 *   ★ Blending 选择 ★
 *     旧版用 AdditiveBlending：在浅色 / 白色背景下完全不可见（src+bg 钳到 1），
 *     在黑底下大量叠加变成"糊雾"，粒子轮廓消失。
 *     新版用 NormalBlending + 非 premultiplied alpha：任何背景颜色下粒子都
 *     直接可见，且不会无限叠加爆白；同时配合更高单粒子 alpha 让单个粒子清晰。
 *
 *   ★ 粒子轮廓 ★
 *     收紧高斯衰减常数（16 → 28）让粒子边缘衰减更陡，看起来像"颗粒"而不是
 *     "软雾点"。粒子半径用 gl_PointSize 控制（NDC 下与距离无关）。
 * ----------------------------------------------------------- */

const VERT = /* glsl */ `
attribute float aLife;
attribute float aHueT;       // 现在仅作 ±15% 微抖动，避免整列粒子完全同色
attribute float aSize;

uniform float uPointSize;
uniform float uPixelRatio;
uniform float uAlphaScale;
uniform sampler2D uGradientTex;

varying vec3 vColor;
varying float vAlpha;

vec3 gradient(float t) {
  return texture2D(uGradientTex, vec2(clamp(t, 0.0, 1.0), 0.5)).rgb;
}

void main() {
  // position.xy 直接当 NDC，y=-1 是屏幕底部, +1 是顶部
  gl_Position = vec4(position.xy, 0.0, 1.0);

  // ★ 主题色：gradient 的 t 由屏幕 y 位置决定 ★
  // 整片粒子云呈现 gradient 的纵向渐变（底=暗端、顶=亮端），换 gradient
  // 就是替换整张图的"主题"。单个粒子从底飘到顶时颜色沿 gradient 变化。
  float yT = clamp(position.y * 0.5 + 0.5, 0.0, 1.0);
  // 重映射到 [0.08, 0.96]，避开 gradient 极端的纯黑/纯白（视觉太硬）
  float t = mix(0.08, 0.96, yT);
  // 每粒子 ±0.13 抖动：避免严格水平色带，让画面有"颗粒呼吸感"
  t = clamp(t + (aHueT - 0.5) * 0.26, 0.0, 1.0);
  vColor = gradient(t);

  // alpha 曲线：淡入 (0-0.12) → 维持 (0.12-0.65) → 淡出 (0.65-1.0)
  float a;
  if (aLife < 0.12) {
    a = aLife / 0.12;
  } else if (aLife < 0.65) {
    a = 1.0;
  } else {
    a = 1.0 - (aLife - 0.65) / 0.35;
  }
  a = clamp(a, 0.0, 1.0);

  // ★ 单粒子峰值 0.92 × uAlphaScale ★
  //   旧 0.65：在白色背景 + Bloom 漂白后，粒子色被洗淡到看不见。
  //   新 0.92：中心粒子在白底上几乎完全覆盖背景，呈现 gradient 的纯色调；
  //   在黑底上配合软边晕仍显柔和。
  vAlpha = a * 0.92 * uAlphaScale;

  float sizeMul = mix(0.7, 1.25, smoothstep(0.0, 0.35, aLife) -
                                 smoothstep(0.7, 1.0, aLife));
  gl_PointSize = uPointSize * aSize * sizeMul * uPixelRatio;
}
`;

const FRAG = /* glsl */ `
varying vec3 vColor;
varying float vAlpha;

void main() {
  vec2 d = gl_PointCoord - 0.5;
  float r2 = dot(d, d);
  if (r2 > 0.25) discard;
  // 衰减更陡：粒子中心实、边缘短软晕。这是"颗粒感"的关键。
  float a = exp(-r2 * 28.0) * vAlpha;
  // 非 premultiplied alpha，配合 NormalBlending 才是正确的颜色公式
  gl_FragColor = vec4(vColor, a);
}
`;

interface PresetState {
  ctx: ThreeContext | null;
  group: THREE.Group | null;
  points: THREE.Points | null;
  geometry: THREE.BufferGeometry | null;
  material: THREE.ShaderMaterial | null;
  positions: Float32Array | null;     // (x, y, z) × N
  velocities: Float32Array | null;    // (vx, vy, _, _) × N
  lifeNorm: Float32Array | null;      // 0..1 (>=1 已死)
  lifeTotal: Float32Array | null;
  hueT: Float32Array | null;
  sizeFactor: Float32Array | null;
  phase: Float32Array | null;
  cursor: number;
  ambientAccum: number;
  gradientTex: THREE.DataTexture | null;
  gradientBuffer: Uint8Array<ArrayBuffer> | null;
  lastGradient: GradientValue | null;
  time: number;
}

export function createDriftingSpiritsPreset(): VisualPreset {
  const state: PresetState = {
    ctx: null,
    group: null,
    points: null,
    geometry: null,
    material: null,
    positions: null,
    velocities: null,
    lifeNorm: null,
    lifeTotal: null,
    hueT: null,
    sizeFactor: null,
    phase: null,
    cursor: 0,
    ambientAccum: 0,
    gradientTex: null,
    gradientBuffer: null,
    lastGradient: null,
    time: 0,
  };

  function teardown(ctx: ThreeContext) {
    if (state.group) ctx.presetGroup.remove(state.group);
    state.geometry?.dispose();
    state.material?.dispose();
    state.gradientTex?.dispose();
    state.points = null;
    state.geometry = null;
    state.material = null;
    state.group = null;
    state.gradientTex = null;
    state.gradientBuffer = null;
    state.lastGradient = null;
  }

  function build(ctx: ThreeContext, count: number, gradient: GradientValue) {
    teardown(ctx);

    const positions = new Float32Array(count * 3);
    const lifeNorm = new Float32Array(count);
    const lifeTotal = new Float32Array(count);
    const velocities = new Float32Array(count * 4);
    const hueT = new Float32Array(count);
    const sizeFactor = new Float32Array(count);
    const phase = new Float32Array(count);

    // 全部初始化为"已死"（lifeNorm = 2 → alpha=0），位置 y=-2 远离屏幕
    for (let i = 0; i < count; i++) {
      lifeNorm[i] = 2;
      sizeFactor[i] = 1;
      positions[i * 3 + 1] = -2;
    }

    const geometry = new THREE.BufferGeometry();
    geometry.setAttribute('position', new THREE.BufferAttribute(positions, 3));
    geometry.setAttribute('aLife', new THREE.BufferAttribute(lifeNorm, 1));
    geometry.setAttribute('aHueT', new THREE.BufferAttribute(hueT, 1));
    geometry.setAttribute('aSize', new THREE.BufferAttribute(sizeFactor, 1));

    const { buffer: gBuf, texture: gTex } = createGradientLUT();
    bakeGradientToLUT(gradient, gBuf, gTex);
    state.gradientBuffer = gBuf;
    state.gradientTex = gTex;
    state.lastGradient = gradient;

    const material = new THREE.ShaderMaterial({
      uniforms: {
        uPointSize: { value: 22 },
        uPixelRatio: { value: ctx.renderer.getPixelRatio() },
        uAlphaScale: { value: 0.85 },
        uGradientTex: { value: gTex },
      },
      vertexShader: VERT,
      fragmentShader: FRAG,
      transparent: true,
      depthWrite: false,
      depthTest: false,
      // NormalBlending：任何背景下粒子色都直接可见，不会无限叠加爆白
      blending: THREE.NormalBlending,
    });

    const points = new THREE.Points(geometry, material);
    points.frustumCulled = false;
    const group = new THREE.Group();
    group.add(points);
    ctx.presetGroup.add(group);

    state.geometry = geometry;
    state.material = material;
    state.points = points;
    state.group = group;
    state.positions = positions;
    state.velocities = velocities;
    state.lifeNorm = lifeNorm;
    state.lifeTotal = lifeTotal;
    state.hueT = hueT;
    state.sizeFactor = sizeFactor;
    state.phase = phase;
    state.cursor = 0;
  }

  /** Spawn n 个粒子。NDC 坐标系：x ∈ [-1,1], y ∈ [-1,1]。粒子从 y≈-1 出生。 */
  function spawn(
    n: number,
    spawnSpread: number,
    lifetime: number,
    riseSpeed: number
  ) {
    const positions = state.positions!;
    const velocities = state.velocities!;
    const lifeNorm = state.lifeNorm!;
    const lifeTotal = state.lifeTotal!;
    const hueT = state.hueT!;
    const sizeFactor = state.sizeFactor!;
    const phase = state.phase!;
    const total = lifeNorm.length;

    for (let i = 0; i < n; i++) {
      const idx = state.cursor;
      state.cursor = (state.cursor + 1) % total;

      // NDC 坐标：x 随机散布，y 在屏幕底部 (-1.05 ~ -0.95)，z=0
      positions[idx * 3 + 0] = (Math.random() * 2 - 1) * spawnSpread;
      positions[idx * 3 + 1] = -1.05 + Math.random() * 0.1;
      positions[idx * 3 + 2] = 0;

      // 速度：主要向上（vy 正），微小水平速度
      const vyBase = riseSpeed * (0.7 + Math.random() * 0.6);
      const vxBase = (Math.random() - 0.5) * 0.03;
      velocities[idx * 4 + 0] = vxBase;
      velocities[idx * 4 + 1] = vyBase;
      velocities[idx * 4 + 2] = 0;
      velocities[idx * 4 + 3] = 0;

      lifeTotal[idx] = lifetime * (0.8 + Math.random() * 0.4);
      lifeNorm[idx] = 0;

      // ★ 主题色重设计 ★
      //   gradient 的 t 现在由 vertex shader 根据屏幕 y 位置决定（底→暗端、
      //   顶→亮端）。aHueT 只是给每个粒子一个 ±0.13 的微抖动种子，避免完全
      //   严格的"水平色带"。所以这里只需要一个均匀随机数，不需要音频驱动。
      hueT[idx] = Math.random();

      // 大小：60%-140% 分布
      sizeFactor[idx] = 0.6 + Math.random() * 0.8;

      phase[idx] = Math.random() * Math.PI * 2;
    }
  }

  return {
    id: 'drifting-spirits',
    name: '飘散灵气 · Drifting Spirits',
    category: 'particles',
    paramSchema: schema,

    init(ctx, params) {
      state.ctx = ctx;
      const count = params.particleCount as number;
      const gradient =
        (params.gradient as GradientValue | undefined) ?? defaultGradient();
      build(ctx, count, gradient);
      state.time = 0;
      state.ambientAccum = 0;
    },

    update(features: AudioFeatures, params, dt) {
      const {
        positions,
        velocities,
        lifeNorm,
        lifeTotal,
        material,
        geometry,
        hueT,
        phase,
        ctx,
      } = state;
      if (
        !positions ||
        !velocities ||
        !lifeNorm ||
        !lifeTotal ||
        !material ||
        !geometry ||
        !hueT ||
        !phase
      )
        return;

      state.time += dt;

      const spawnSpread = params.spawnSpread as number;
      const beatBurst = params.beatBurst as number;
      const beatThreshold = params.beatThreshold as number;
      const ambientRate = params.ambientRate as number;
      const riseSpeed = params.riseSpeed as number;
      const drift = params.drift as number;
      const lifetime = params.lifetime as number;
      const bassPush = params.bassPush as number;
      const pointSize = params.particleSize as number;
      const alphaScale = params.alphaScale as number;

      material.uniforms.uPointSize.value = pointSize;
      material.uniforms.uAlphaScale.value = alphaScale;
      if (ctx) material.uniforms.uPixelRatio.value = ctx.renderer.getPixelRatio();

      // gradient 变化时重烧 LUT
      const g = params.gradient as GradientValue | undefined;
      if (g && state.gradientBuffer && state.gradientTex) {
        if (gradientChanged(state.lastGradient, g)) {
          bakeGradientToLUT(g, state.gradientBuffer, state.gradientTex);
          state.lastGradient = {
            presetId: g.presetId,
            stops: g.stops.map((s) => ({ ...s })),
            rotation: g.rotation,
          };
        }
      }

      // 节拍喷发
      if (features.beat && features.rms >= beatThreshold && beatBurst > 0) {
        spawn(beatBurst, spawnSpread, lifetime, riseSpeed);
      }

      // 持续 ambient
      state.ambientAccum += ambientRate * features.rms * dt;
      const ambientN = Math.floor(state.ambientAccum);
      if (ambientN > 0) {
        state.ambientAccum -= ambientN;
        spawn(ambientN, spawnSpread, lifetime, riseSpeed * 0.75);
      }

      // —— 更新所有活粒子 ——
      const total = lifeNorm.length;
      const bassAcc = features.bands.bass * bassPush;
      for (let i = 0; i < total; i++) {
        if (lifeNorm[i] >= 1) continue;
        const ix = i * 3;
        const vi = i * 4;

        // bass 加速：所有活粒子 vy 增加
        velocities[vi + 1] += bassAcc * dt;

        // 水平：基础速度 vx + sin 摆动
        const phaseT = state.time * 0.9 + phase[i];
        const driftX = Math.sin(phaseT) * drift * dt;
        positions[ix] += velocities[vi] * dt + driftX;

        // 垂直：向上飞
        positions[ix + 1] += velocities[vi + 1] * dt;

        // 寿命：lifeNorm += dt / lifeTotal
        lifeNorm[i] += dt / Math.max(0.1, lifeTotal[i]);

        // 超出屏幕顶部就让它死（节省 alpha 计算）
        if (positions[ix + 1] > 1.2 && lifeNorm[i] < 1) {
          lifeNorm[i] = 1;
        }
      }

      geometry.attributes.position.needsUpdate = true;
      geometry.attributes.aLife.needsUpdate = true;
      geometry.attributes.aHueT.needsUpdate = true;
      geometry.attributes.aSize.needsUpdate = true;
    },

    dispose(ctx) {
      teardown(ctx);
      state.ctx = null;
    },
  };
}
