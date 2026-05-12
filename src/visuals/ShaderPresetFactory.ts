import * as THREE from 'three';
import type { VisualPreset } from './VisualPreset';
import type { ParamSchema } from './ParamSchema';
import type { AudioFeatures } from '../audio/types';
import type { ThreeContext } from '../render/ThreeContext';
import {
  type GradientValue,
  defaultGradient,
  createGradientLUT,
  bakeGradientToLUT,
  gradientChanged,
} from './GradientPresets';

/**
 * ShaderToy 风格的 fullscreen quad 预设工厂。
 *
 * 用户提供片元着色器（GLSL ES 1.00），可使用 ShaderToy 兼容名（iTime 等）
 * 或本项目原生名（uTime 等），由统一的 header 注入。
 *
 * 自动注入的 uniform：
 *   uTime / iTime           (float)  音频开始至今的时间
 *   uResolution / iResolution (vec2) 画布像素尺寸
 *   uAspect                 (float) 宽高比
 *   uFftTex / iChannel0     (sampler2D) 256-bin 对数频谱 LUT
 *   uRms                    (float) RMS 0..~1
 *   uBeatEnv                (float) 节拍包络 0..1，节拍上跳到 1 后衰减
 *   uBass / uMid / uHigh    (float) 频段能量 0..1
 *   uCentroid               (float) 谱质心 0..1
 *   uColorA/B/C             (vec3)  调色三色
 *
 * 用户自定义参数通过 paramSchema 暴露，并通过 uniformsFromParams 注入。
 */

export interface ShaderPresetConfig {
  id: string;
  name: string;
  category?: VisualPreset['category'];
  /** 用户自定义参数 schema；颜色三色 hueA/hueB/hueC 默认会加入。 */
  paramSchema?: ParamSchema;
  /** 由 params 派发到 uniform 值（除标准 uniform 外）。 */
  uniformsFromParams?: (
    params: Record<string, unknown>
  ) => Record<string, unknown>;
  /** 额外 uniform 声明（初始值）；建议用 uTimeMul / uIntensity 等。 */
  extraUniforms?: () => Record<string, { value: unknown }>;
  /** ShaderToy 风格主函数；若设了 fragmentShader 则忽略此项。 */
  mainImage?: string;
  /** 完整片元着色器（含 main()），如果设置则覆盖 mainImage 模式。 */
  fragmentShader?: string;
  /** 节拍包络衰减率（每秒减去多少），默认 1.6。 */
  beatDecay?: number;
}

const VERT = /* glsl */ `
varying vec2 vUv;
void main() {
  vUv = uv;
  gl_Position = vec4(position.xy, 0.0, 1.0);
}
`;

/**
 * 共用 header，提供 ShaderToy 兼容 alias 与音频 utility。
 */
const HEADER = /* glsl */ `
precision highp float;

varying vec2 vUv;

uniform float uTime;
uniform vec2  uResolution;
uniform float uAspect;
uniform sampler2D uFftTex;

uniform float uRms;
uniform float uBeatEnv;
uniform float uBass;
uniform float uMid;
uniform float uHigh;
uniform float uCentroid;

uniform vec3 uColorA;
uniform vec3 uColorB;
uniform vec3 uColorC;

/* 渐变色 LUT：64×1 RGBA8 纹理，t∈[0,1] 在 stops 上插值的预烧版本。
 * 用 gradient(t) 直接取颜色，比传统的 mix(uColorA, uColorB, t) 更柔顺，
 * 还能用 N-stop 彩虹/多色风格。
 */
uniform sampler2D uGradientTex;
vec3 gradient(float t) {
  return texture2D(uGradientTex, vec2(clamp(t, 0.0, 1.0), 0.5)).rgb;
}

#define iTime uTime
#define iResolution vec3(uResolution, 1.0)
#define iChannel0 uFftTex

float audioFft(float x) {
  return texture2D(uFftTex, vec2(clamp(x, 0.0, 1.0), 0.5)).r;
}
`;

const MAIN_WRAPPER = /* glsl */ `
void main() {
  vec2 fragCoord = vUv * uResolution;
  vec4 col = vec4(0.0);
  mainImage(col, fragCoord);
  gl_FragColor = col;
}
`;

export function createShaderPreset(config: ShaderPresetConfig): VisualPreset {
  const userSchema: ParamSchema = config.paramSchema ?? {};
  // 默认 hue 三色（如果用户没自定义）
  const colorDefaults: ParamSchema = {
    hueA: { type: 'color', label: '颜色 A', default: '#3a5cff' },
    hueB: { type: 'color', label: '颜色 B', default: '#ff3aa6' },
    hueC: { type: 'color', label: '颜色 C', default: '#ffd66b' },
  };
  const schema: ParamSchema = {
    ...userSchema,
    ...(userSchema.hueA ? {} : { hueA: colorDefaults.hueA }),
    ...(userSchema.hueB ? {} : { hueB: colorDefaults.hueB }),
    ...(userSchema.hueC ? {} : { hueC: colorDefaults.hueC }),
  };

  const fragSource = config.fragmentShader
    ? config.fragmentShader
    : `${HEADER}\n${config.mainImage ?? ''}\n${MAIN_WRAPPER}`;

  let mesh: THREE.Mesh | null = null;
  let geometry: THREE.PlaneGeometry | null = null;
  let material: THREE.ShaderMaterial | null = null;
  let fftTex: THREE.DataTexture | null = null;
  let fftBuffer: Uint8Array<ArrayBuffer> | null = null;
  let gradientTex: THREE.DataTexture | null = null;
  let gradientBuffer: Uint8Array<ArrayBuffer> | null = null;
  // 记录上一次烧进 LUT 的 gradient，避免每帧重烧
  let lastGradient: GradientValue | null = null;
  let ctxRef: ThreeContext | null = null;
  let timeAcc = 0;
  let beatEnv = 0;
  const tmpColor = new THREE.Color();
  const beatDecay = config.beatDecay ?? 1.6;

  // schema 里是否声明了 type:'gradient' 的参数；声明了才走 gradient 路径
  const gradientParamKey = Object.entries(schema).find(
    ([, def]) => def.type === 'gradient'
  )?.[0];

  return {
    id: config.id,
    name: config.name,
    category: config.category ?? 'shader',
    paramSchema: schema,

    init(ctx: ThreeContext) {
      ctxRef = ctx;
      timeAcc = 0;
      beatEnv = 0;

      const N = 256;
      fftBuffer = new Uint8Array(N) as Uint8Array<ArrayBuffer>;
      fftTex = new THREE.DataTexture(
        fftBuffer,
        N,
        1,
        THREE.RedFormat,
        THREE.UnsignedByteType
      );
      fftTex.minFilter = THREE.LinearFilter;
      fftTex.magFilter = THREE.LinearFilter;
      fftTex.wrapS = THREE.ClampToEdgeWrapping;
      fftTex.wrapT = THREE.ClampToEdgeWrapping;
      fftTex.needsUpdate = true;

      // 创建 gradient LUT 纹理；即使该 preset 没用 gradient 参数也建一个
      // 默认渐变（midnight-violet），这样 shader 里 gradient(t) 永远能用
      const { buffer: gBuf, texture: gTex } = createGradientLUT();
      gradientBuffer = gBuf;
      gradientTex = gTex;
      const initialGradient = defaultGradient();
      bakeGradientToLUT(initialGradient, gBuf, gTex);
      lastGradient = initialGradient;

      const baseUniforms: Record<string, { value: unknown }> = {
        uTime: { value: 0 },
        uResolution: { value: new THREE.Vector2(ctx.width, ctx.height) },
        uAspect: { value: ctx.width / Math.max(1, ctx.height) },
        uFftTex: { value: fftTex },
        uGradientTex: { value: gTex },
        uRms: { value: 0 },
        uBeatEnv: { value: 0 },
        uBass: { value: 0 },
        uMid: { value: 0 },
        uHigh: { value: 0 },
        uCentroid: { value: 0 },
        uColorA: { value: new THREE.Color('#3a5cff') },
        uColorB: { value: new THREE.Color('#ff3aa6') },
        uColorC: { value: new THREE.Color('#ffd66b') },
      };

      const extras = config.extraUniforms?.() ?? {};
      const uniforms: Record<string, { value: unknown }> = {
        ...baseUniforms,
        ...extras,
      };

      material = new THREE.ShaderMaterial({
        uniforms: uniforms as never,
        vertexShader: VERT,
        fragmentShader: fragSource,
        depthTest: false,
        depthWrite: false,
      });
      geometry = new THREE.PlaneGeometry(2, 2);
      mesh = new THREE.Mesh(geometry, material);
      mesh.frustumCulled = false;
      ctx.presetGroup.add(mesh);
    },

    update(features: AudioFeatures, params, dt) {
      if (!material || !fftBuffer || !fftTex || !ctxRef) return;

      timeAcc += dt;
      if (features.beat) beatEnv = 1;
      beatEnv = Math.max(0, beatEnv - dt * beatDecay);

      const u = material.uniforms;

      // 标准 uniform
      u.uTime.value = timeAcc;
      (u.uResolution.value as THREE.Vector2).set(ctxRef.width, ctxRef.height);
      u.uAspect.value = ctxRef.width / Math.max(1, ctxRef.height);
      u.uRms.value = features.rms;
      u.uBeatEnv.value = beatEnv;
      u.uBass.value = features.bands.bass;
      u.uMid.value = features.bands.mid;
      u.uHigh.value = features.bands.high;
      u.uCentroid.value = Math.min(1, (features.spectralCentroid || 0) / 8000);

      // 颜色
      if (params.hueA) {
        tmpColor.set(params.hueA as string);
        (u.uColorA.value as THREE.Color).copy(tmpColor);
      }
      if (params.hueB) {
        tmpColor.set(params.hueB as string);
        (u.uColorB.value as THREE.Color).copy(tmpColor);
      }
      if (params.hueC) {
        tmpColor.set(params.hueC as string);
        (u.uColorC.value as THREE.Color).copy(tmpColor);
      }

      // 渐变色：仅在 schema 里有 gradient 参数 + 参数变化时重烧 LUT
      if (gradientParamKey && gradientBuffer && gradientTex) {
        const g = params[gradientParamKey] as GradientValue | undefined;
        if (g && gradientChanged(lastGradient, g)) {
          bakeGradientToLUT(g, gradientBuffer, gradientTex);
          lastGradient = {
            presetId: g.presetId,
            stops: g.stops.map((s) => ({ ...s })),
            rotation: g.rotation,
          };
        }
      }

      // 用户自定义
      const extra = config.uniformsFromParams?.(params) ?? {};
      for (const [k, v] of Object.entries(extra)) {
        if (u[k]) u[k].value = v as never;
      }

      // FFT → 1D 对数 LUT
      const fft = features.fft;
      const N = fftBuffer.length;
      const M = fft.length;
      const minBin = 1;
      const maxBin = Math.min(M - 1, Math.floor(M * 0.6));
      const logMin = Math.log(minBin);
      const logMax = Math.log(maxBin);
      for (let i = 0; i < N; i++) {
        const t = i / (N - 1);
        const lo = Math.floor(Math.exp(logMin + (logMax - logMin) * t));
        const hi = Math.floor(
          Math.exp(logMin + (logMax - logMin) * Math.min(1, t + 1 / N))
        );
        let s = 0;
        let c = 0;
        for (let k = lo; k <= Math.max(lo, hi); k++) {
          s += fft[k];
          c++;
        }
        const v = c > 0 ? s / c : 0;
        fftBuffer[i] = Math.min(255, Math.max(0, Math.floor(v * 255)));
      }
      fftTex.needsUpdate = true;
    },

    dispose(ctx) {
      if (mesh) ctx.presetGroup.remove(mesh);
      geometry?.dispose();
      material?.dispose();
      fftTex?.dispose();
      gradientTex?.dispose();
      mesh = null;
      geometry = null;
      material = null;
      fftTex = null;
      fftBuffer = null;
      gradientTex = null;
      gradientBuffer = null;
      lastGradient = null;
      ctxRef = null;
    },
  };
}
