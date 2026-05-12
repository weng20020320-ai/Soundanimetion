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

const schema: ParamSchema = {
  speed: {
    type: 'float',
    label: '流动速度',
    min: 0.05,
    max: 3,
    step: 0.01,
    default: 0.6,
  },
  scale: {
    type: 'float',
    label: '噪声尺度',
    min: 0.5,
    max: 6,
    step: 0.05,
    default: 2.2,
  },
  warp: {
    type: 'float',
    label: '扭曲强度',
    min: 0,
    max: 4,
    step: 0.05,
    default: 1.4,
  },
  fftDrive: {
    type: 'float',
    label: '频谱驱动',
    min: 0,
    max: 4,
    step: 0.05,
    default: 1.6,
  },
  beatGlow: {
    type: 'float',
    label: '节拍辉光',
    min: 0,
    max: 2,
    step: 0.05,
    default: 0.8,
  },
  gradient: {
    type: 'gradient',
    label: '渐变色',
    // 极光：青→紫，配合"流体"的流动感
    default: gradientFromPreset('aurora', 0),
  },
  vignette: {
    type: 'float',
    label: '暗角',
    min: 0,
    max: 1,
    step: 0.01,
    default: 0.35,
  },
};

const VERT = `
varying vec2 vUv;
void main() {
  vUv = uv;
  gl_Position = vec4(position.xy, 0.0, 1.0);
}
`;

const FRAG = `
precision highp float;

varying vec2 vUv;

uniform float uTime;
uniform float uSpeed;
uniform float uScale;
uniform float uWarp;
uniform float uFftDrive;
uniform float uBeatGlow;
uniform float uBeatEnvelope;
uniform float uRms;
uniform float uBassN;
uniform float uMidN;
uniform float uHighN;
uniform float uVignette;
uniform float uAspect;
uniform sampler2D uFftTex;
uniform sampler2D uGradientTex;

vec3 gradient(float t) {
  return texture2D(uGradientTex, vec2(clamp(t, 0.0, 1.0), 0.5)).rgb;
}

// hash & 2D simplex-ish noise
vec2 hash2(vec2 p) {
  p = vec2(dot(p, vec2(127.1, 311.7)), dot(p, vec2(269.5, 183.3)));
  return -1.0 + 2.0 * fract(sin(p) * 43758.5453);
}

float noise(vec2 p) {
  const float K1 = 0.366025404;
  const float K2 = 0.211324865;
  vec2 i = floor(p + (p.x + p.y) * K1);
  vec2 a = p - i + (i.x + i.y) * K2;
  vec2 o = (a.x > a.y) ? vec2(1.0, 0.0) : vec2(0.0, 1.0);
  vec2 b = a - o + K2;
  vec2 c = a - 1.0 + 2.0 * K2;
  vec3 h = max(0.5 - vec3(dot(a, a), dot(b, b), dot(c, c)), 0.0);
  vec3 n = h * h * h * h * vec3(dot(a, hash2(i)), dot(b, hash2(i + o)), dot(c, hash2(i + 1.0)));
  return dot(n, vec3(70.0));
}

float fbm(vec2 p) {
  float v = 0.0;
  float a = 0.5;
  mat2 r = mat2(0.8, -0.6, 0.6, 0.8);
  for (int i = 0; i < 5; i++) {
    v += a * noise(p);
    p = r * p * 2.0;
    a *= 0.5;
  }
  return v;
}

void main() {
  vec2 uv = vUv;
  vec2 p = (uv - 0.5);
  p.x *= uAspect;

  // 频谱采样：把频段映射到屏幕水平位置
  float fftHere = texture2D(uFftTex, vec2(uv.x, 0.5)).r;

  float t = uTime * uSpeed;
  vec2 q = p * uScale;

  // 频谱驱动 warp
  vec2 warp = vec2(
    fbm(q + vec2(0.0, t)),
    fbm(q + vec2(t, 0.0))
  );
  q += warp * (uWarp + uFftDrive * fftHere);

  float n = fbm(q + t * 0.4);
  float n2 = fbm(q * 1.6 - t * 0.3);

  // n + n2 + bass 组合成 gradient 采样位置
  //   - n 主轴提供"流体的明暗起伏"
  //   - n2 + bass 让低频强时整片色彩往 gradient 终点偏移
  float m = smoothstep(-0.6, 0.6, n);
  float gt = clamp(m * 0.7 + smoothstep(0.2, 0.9, n2 + uBassN * 0.3) * 0.3, 0.0, 1.0);
  vec3 base = gradient(gt);

  // 节拍辉光：屏幕中心向外的圆环，颜色取 gradient 亮端
  float radial = length(p);
  float beatRing = exp(-pow(radial - uBeatEnvelope * 0.6, 2.0) * 18.0);
  base += gradient(0.95) * beatRing * uBeatGlow * uBeatEnvelope;

  // 整体亮度跟 RMS
  base *= 0.65 + uRms * 1.6 + uMidN * 0.4 + uHighN * 0.25;

  // 暗角
  float vig = smoothstep(0.95, 0.4, length(uv - 0.5));
  base *= mix(1.0, vig, uVignette);

  gl_FragColor = vec4(base, 1.0);
}
`;

interface PresetState {
  ctx: ThreeContext | null;
  mesh: THREE.Mesh | null;
  geometry: THREE.PlaneGeometry | null;
  material: THREE.ShaderMaterial | null;
  fftTex: THREE.DataTexture | null;
  fftBuffer: Uint8Array<ArrayBuffer> | null;
  gradientTex: THREE.DataTexture | null;
  gradientBuffer: Uint8Array<ArrayBuffer> | null;
  lastGradient: GradientValue | null;
  beatEnv: number;
  time: number;
}

export function createShaderFlowPreset(): VisualPreset {
  const state: PresetState = {
    ctx: null,
    mesh: null,
    geometry: null,
    material: null,
    fftTex: null,
    fftBuffer: null,
    gradientTex: null,
    gradientBuffer: null,
    lastGradient: null,
    beatEnv: 0,
    time: 0,
  };

  return {
    id: 'shader-flow',
    name: '频谱流体（Shader）',
    category: 'shader',
    paramSchema: schema,

    init(ctx: ThreeContext, params) {
      state.ctx = ctx;
      const fftSize = 256;
      const buf = new Uint8Array(fftSize) as Uint8Array<ArrayBuffer>;
      const tex = new THREE.DataTexture(
        buf,
        fftSize,
        1,
        THREE.RedFormat,
        THREE.UnsignedByteType
      );
      tex.minFilter = THREE.LinearFilter;
      tex.magFilter = THREE.LinearFilter;
      tex.wrapS = THREE.ClampToEdgeWrapping;
      tex.wrapT = THREE.ClampToEdgeWrapping;
      tex.needsUpdate = true;

      const { buffer: gBuf, texture: gTex } = createGradientLUT();
      state.gradientBuffer = gBuf;
      state.gradientTex = gTex;
      const initialGradient =
        (params.gradient as GradientValue | undefined) ?? defaultGradient();
      bakeGradientToLUT(initialGradient, gBuf, gTex);
      state.lastGradient = initialGradient;

      const material = new THREE.ShaderMaterial({
        uniforms: {
          uTime: { value: 0 },
          uSpeed: { value: 0.6 },
          uScale: { value: 2.2 },
          uWarp: { value: 1.4 },
          uFftDrive: { value: 1.6 },
          uBeatGlow: { value: 0.8 },
          uBeatEnvelope: { value: 0 },
          uRms: { value: 0 },
          uBassN: { value: 0 },
          uMidN: { value: 0 },
          uHighN: { value: 0 },
          uVignette: { value: 0.35 },
          uAspect: { value: ctx.width / Math.max(1, ctx.height) },
          uFftTex: { value: tex },
          uGradientTex: { value: gTex },
        },
        vertexShader: VERT,
        fragmentShader: FRAG,
        depthTest: false,
        depthWrite: false,
      });

      const geometry = new THREE.PlaneGeometry(2, 2);
      const mesh = new THREE.Mesh(geometry, material);
      mesh.frustumCulled = false;
      ctx.presetGroup.add(mesh);

      state.mesh = mesh;
      state.geometry = geometry;
      state.material = material;
      state.fftTex = tex;
      state.fftBuffer = buf;
    },

    update(features: AudioFeatures, params, dt) {
      if (!state.material || !state.fftBuffer || !state.fftTex) return;

      state.time += dt;
      if (features.beat) state.beatEnv = 1;
      state.beatEnv = Math.max(0, state.beatEnv - dt * 1.6);

      const u = state.material.uniforms;
      u.uTime.value = state.time;
      u.uSpeed.value = params.speed as number;
      u.uScale.value = params.scale as number;
      u.uWarp.value = params.warp as number;
      u.uFftDrive.value = params.fftDrive as number;
      u.uBeatGlow.value = params.beatGlow as number;
      u.uBeatEnvelope.value = state.beatEnv;
      u.uRms.value = features.rms;
      u.uBassN.value = features.bands.bass;
      u.uMidN.value = features.bands.mid;
      u.uHighN.value = features.bands.high;
      u.uVignette.value = params.vignette as number;
      if (state.ctx) {
        u.uAspect.value = state.ctx.width / Math.max(1, state.ctx.height);
      }

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

      const fft = features.fft;
      const buf = state.fftBuffer;
      const N = buf.length;
      const M = fft.length;
      // log 频率分箱再下采样到 N
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
        buf[i] = Math.min(255, Math.max(0, Math.floor(v * 255)));
      }
      state.fftTex.needsUpdate = true;
    },

    dispose(ctx) {
      if (state.mesh) ctx.presetGroup.remove(state.mesh);
      state.geometry?.dispose();
      state.material?.dispose();
      state.fftTex?.dispose();
      state.gradientTex?.dispose();
      state.mesh = null;
      state.geometry = null;
      state.material = null;
      state.fftTex = null;
      state.fftBuffer = null;
      state.gradientTex = null;
      state.gradientBuffer = null;
      state.lastGradient = null;
      state.ctx = null;
    },
  };
}
