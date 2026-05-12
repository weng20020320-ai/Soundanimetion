import * as THREE from 'three';
import { GPUComputationRenderer } from 'three/examples/jsm/misc/GPUComputationRenderer.js';
import type { Variable } from 'three/examples/jsm/misc/GPUComputationRenderer.js';
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

/* eslint-disable @typescript-eslint/no-explicit-any */

/* 旧版（用户反馈"灯泡发亮、没有粒子云氛围"）问题分析：
 *  - 默认 textureSize=512 → 26 万粒子，alpha 上限 0.55 在 AdditiveBlending 下
 *    数百粒子叠加到中心区直接饱和成白。即使把 alpha 调到 0.55 也救不回来。
 *  - centerPull=0.5 强行把粒子收到中心 → 中心密度尖峰。
 *  - bassKick=1.2 + 节拍冲击 ×6.0 → bass 一来粒子全部"扑"到中心，然后阻力又
 *    立刻把它们停下，看起来就是 bass 一来"爆一下亮点"再消失。
 *
 * 这一轮修复：
 *  1. textureSize 默认 256 → 6.5 万粒子（叠加密度降 4 倍）
 *  2. alpha 上限 0.55 → 0.28（单粒子贡献缩小一半多）
 *  3. centerPull 0.5 → 0.18（粒子更自由地飘）
 *  4. bassKick 1.2 → 0.6（轻推不爆）
 *  5. 节拍冲击 ×6.0 → ×3.0（拍后扰动减半）
 *  6. 颜色逻辑：删除 hueA/B/C，引入 gradient — 粒子速度映射到 gradient(t)。
 *     默认 gradient "twilight-blue"（深蓝→蓝紫），冷色调更易出"粒子云"质感。
 */

const schema: ParamSchema = {
  textureSize: {
    type: 'select',
    label: '粒子规模',
    structural: true,
    default: 256,
    options: [
      { label: '低 65 k (256²)', value: 256 },
      { label: '中 262 k (512²)', value: 512 },
      { label: '高 1 M (1024²)', value: 1024 },
    ],
  },
  pointSize: {
    type: 'float',
    label: '点大小',
    min: 0.5,
    max: 6,
    step: 0.1,
    default: 1.4,
  },
  drag: {
    type: 'float',
    label: '阻力',
    min: 0.5,
    max: 3,
    step: 0.01,
    default: 0.9,
  },
  centerPull: {
    type: 'float',
    label: '向心力',
    min: 0,
    max: 4,
    step: 0.01,
    default: 0.18,
  },
  bassKick: {
    type: 'float',
    label: 'Bass 推力',
    min: 0,
    max: 6,
    step: 0.01,
    default: 0.6,
  },
  swirl: {
    type: 'float',
    label: '旋涡',
    min: 0,
    max: 4,
    step: 0.01,
    default: 1.6,
  },
  beatSpawn: {
    type: 'float',
    label: '节拍重生',
    min: 0,
    max: 1,
    step: 0.01,
    default: 0.15,
  },
  fieldScale: {
    type: 'float',
    label: '场尺度',
    min: 1,
    max: 8,
    step: 0.05,
    default: 4,
  },
  alphaScale: {
    type: 'float',
    label: '不透明度',
    min: 0.1,
    max: 2,
    step: 0.01,
    // 让用户最后能再压一档亮度，video export 时如果觉得还过曝可继续调小
    default: 1.0,
  },
  gradient: {
    type: 'gradient',
    label: '渐变色',
    // twilight-blue：深蓝→中蓝紫，雾感强、不刺眼，符合"粒子云氛围"
    default: gradientFromPreset('twilight-blue', 0),
  },
};

const VELOCITY_FRAG = /* glsl */ `
uniform float uDt;
uniform float uTime;
uniform float uDrag;
uniform float uCenterPull;
uniform float uBassKick;
uniform float uSwirl;
uniform float uFieldScale;
uniform float uBass;
uniform float uMid;
uniform float uHigh;
uniform float uRms;
uniform float uBeatEnv;

vec3 hash3(vec3 p) {
  p = vec3(dot(p, vec3(127.1, 311.7, 74.7)),
           dot(p, vec3(269.5, 183.3, 246.1)),
           dot(p, vec3(113.5, 271.9, 124.6)));
  return -1.0 + 2.0 * fract(sin(p) * 43758.5453);
}

float n3(vec3 p) {
  vec3 i = floor(p);
  vec3 f = fract(p);
  vec3 u = f * f * (3.0 - 2.0 * f);
  return mix(
    mix(
      mix(dot(hash3(i + vec3(0,0,0)), f - vec3(0,0,0)),
          dot(hash3(i + vec3(1,0,0)), f - vec3(1,0,0)), u.x),
      mix(dot(hash3(i + vec3(0,1,0)), f - vec3(0,1,0)),
          dot(hash3(i + vec3(1,1,0)), f - vec3(1,1,0)), u.x),
      u.y),
    mix(
      mix(dot(hash3(i + vec3(0,0,1)), f - vec3(0,0,1)),
          dot(hash3(i + vec3(1,0,1)), f - vec3(1,0,1)), u.x),
      mix(dot(hash3(i + vec3(0,1,1)), f - vec3(0,1,1)),
          dot(hash3(i + vec3(1,1,1)), f - vec3(1,1,1)), u.x),
      u.y),
    u.z);
}

vec3 curl(vec3 p) {
  float e = 0.1;
  vec3 dx = vec3(e, 0.0, 0.0);
  vec3 dy = vec3(0.0, e, 0.0);
  vec3 dz = vec3(0.0, 0.0, e);
  float pz = n3(p + dz) - n3(p - dz);
  float py = n3(p + dy) - n3(p - dy);
  float px = n3(p + dx) - n3(p - dx);
  return vec3(pz - py, px - pz, py - px) / (2.0 * e);
}

void main() {
  vec2 uv = gl_FragCoord.xy / resolution.xy;
  vec4 pos = texture2D(texturePosition, uv);
  vec4 vel = texture2D(textureVelocity, uv);

  vec3 p = pos.xyz;
  vec3 v = vel.xyz;

  // 旋涡 + 噪声场（curl noise）
  vec3 fp = p / uFieldScale + vec3(0.0, 0.0, uTime * 0.2);
  vec3 c = curl(fp);
  v += c * (uSwirl + uMid * 1.5) * uDt;

  // 中心引力
  vec3 toCenter = -p;
  v += toCenter * uCenterPull * 0.4 * uDt;

  // Bass 径向推力
  float r = length(p) + 0.01;
  v += (p / r) * uBass * uBassKick * 0.5 * uDt;

  // 节拍冲击：随机扰动（旧 ×6.0 → ×3.0，避免 bass 一来全屏爆点）
  v += hash3(p + uTime) * uBeatEnv * (1.0 + uRms) * uDt * 3.0;

  // 阻力
  v *= exp(-uDt * uDrag);

  // 速度限幅
  float vmag = length(v);
  if (vmag > 8.0) v = v * (8.0 / vmag);

  gl_FragColor = vec4(v, vel.w + uDt);
}
`;

const POSITION_FRAG = /* glsl */ `
uniform float uDt;
uniform float uTime;
uniform float uBeatSpawn;
uniform float uBeatEnv;

float hash(vec2 p) {
  return fract(sin(dot(p, vec2(127.1, 311.7))) * 43758.5453);
}
vec3 hash3(vec3 p) {
  p = vec3(dot(p, vec3(127.1, 311.7, 74.7)),
           dot(p, vec3(269.5, 183.3, 246.1)),
           dot(p, vec3(113.5, 271.9, 124.6)));
  return -1.0 + 2.0 * fract(sin(p) * 43758.5453);
}

void main() {
  vec2 uv = gl_FragCoord.xy / resolution.xy;
  vec4 pos = texture2D(texturePosition, uv);
  vec4 vel = texture2D(textureVelocity, uv);

  vec3 p = pos.xyz + vel.xyz * uDt;
  float life = pos.w + uDt;

  // 节拍：随机重生一部分粒子到中心附近
  float r = hash(uv + uTime);
  if (r < uBeatSpawn * uBeatEnv * 0.04) {
    p = hash3(vec3(uv * 100.0, uTime)) * 0.6;
    life = 0.0;
  }

  // 越界回收
  if (length(p) > 6.0) {
    p = hash3(vec3(uv * 100.0, uTime)) * 0.5;
    life = 0.0;
  }

  gl_FragColor = vec4(p, life);
}
`;

const RENDER_VERT = /* glsl */ `
uniform sampler2D texturePosition;
uniform sampler2D textureVelocity;
uniform sampler2D uGradientTex;
uniform float uPointSize;
uniform float uPixelRatio;
uniform float uHigh;
uniform float uRms;
uniform float uAlphaScale;

varying vec3 vColor;
varying float vAlpha;

vec3 gradientSample(float t) {
  return texture2D(uGradientTex, vec2(clamp(t, 0.0, 1.0), 0.5)).rgb;
}

void main() {
  vec4 pos = texture2D(texturePosition, position.xy);
  vec4 vel = texture2D(textureVelocity, position.xy);
  vec4 mv = modelViewMatrix * vec4(pos.xyz, 1.0);

  // 颜色：粒子速度映射到 gradient(t)。
  //  - 慢粒子（速度≈0）→ gradient 起点（暗端，背景色调）
  //  - 中速粒子        → gradient 中段
  //  - 快粒子          → gradient 终点（亮端，强调色）
  // 高频时把所有粒子整体往 gradient 终点偏移一点，让"高音段"画面偏亮但不爆
  float speed = length(vel.xyz);
  float t = clamp(speed * 0.5 + uHigh * 0.15 + uRms * 0.10, 0.0, 1.0);
  vColor = gradientSample(t);

  float dist = length(mv.xyz);
  // 旧 [0.25, 0.55] → 新 [0.10, 0.28]，单粒子贡献再减半，更需要靠"叠加"形成云
  vAlpha = clamp(0.10 + speed * 0.04, 0.10, 0.28) * uAlphaScale;

  gl_PointSize = uPointSize * uPixelRatio * (300.0 / max(0.1, dist));
  gl_Position = projectionMatrix * mv;
}
`;

const RENDER_FRAG = /* glsl */ `
varying vec3 vColor;
varying float vAlpha;

void main() {
  vec2 d = gl_PointCoord - 0.5;
  float r2 = dot(d, d);
  if (r2 > 0.25) discard;
  // exp(-r2 * 22)：比旧 28 稍微宽一点的软晕（核心 alpha 收紧后需要更长的拖尾
  // 才能形成"云"的视觉感）
  float a = exp(-r2 * 22.0) * vAlpha;
  gl_FragColor = vec4(vColor * a, a);
}
`;

interface PresetState {
  ctx: ThreeContext | null;
  gpuc: GPUComputationRenderer | null;
  positionVar: Variable | null;
  velocityVar: Variable | null;
  textureSize: number;
  geometry: THREE.BufferGeometry | null;
  material: THREE.ShaderMaterial | null;
  points: THREE.Points | null;
  beatEnv: number;
  time: number;
  gradientTex: THREE.DataTexture | null;
  gradientBuffer: Uint8Array<ArrayBuffer> | null;
  lastGradient: GradientValue | null;
}

function createInitialPositionTexture(
  size: number,
  out: Float32Array<ArrayBuffer>
): void {
  for (let i = 0; i < size * size; i++) {
    const r = 0.6 * Math.cbrt(Math.random());
    const theta = Math.random() * Math.PI * 2;
    const phi = Math.acos(2 * Math.random() - 1);
    out[i * 4 + 0] = r * Math.sin(phi) * Math.cos(theta);
    out[i * 4 + 1] = r * Math.sin(phi) * Math.sin(theta);
    out[i * 4 + 2] = r * Math.cos(phi);
    out[i * 4 + 3] = 0;
  }
}

function createInitialVelocityTexture(
  size: number,
  out: Float32Array<ArrayBuffer>
): void {
  for (let i = 0; i < size * size; i++) {
    out[i * 4 + 0] = (Math.random() - 0.5) * 0.2;
    out[i * 4 + 1] = (Math.random() - 0.5) * 0.2;
    out[i * 4 + 2] = (Math.random() - 0.5) * 0.2;
    out[i * 4 + 3] = 0;
  }
}

export function createGPUParticlesPreset(): VisualPreset {
  const state: PresetState = {
    ctx: null,
    gpuc: null,
    positionVar: null,
    velocityVar: null,
    textureSize: 256,
    geometry: null,
    material: null,
    points: null,
    beatEnv: 0,
    time: 0,
    gradientTex: null,
    gradientBuffer: null,
    lastGradient: null,
  };

  return {
    id: 'gpu-particles',
    name: 'GPU 粒子场（百万级）',
    category: 'particles',
    paramSchema: schema,

    init(ctx: ThreeContext, params) {
      state.ctx = ctx;
      const size = Number(params.textureSize ?? 256);
      state.textureSize = size;

      const { buffer: gBuf, texture: gTex } = createGradientLUT();
      state.gradientBuffer = gBuf;
      state.gradientTex = gTex;
      const initialGradient =
        (params.gradient as GradientValue | undefined) ?? defaultGradient();
      bakeGradientToLUT(initialGradient, gBuf, gTex);
      state.lastGradient = initialGradient;

      if (!ctx.isWebGL2()) {
        console.warn('[gpu-particles] 需要 WebGL2，已退化到默认行为');
      }

      const gpuc = new GPUComputationRenderer(size, size, ctx.renderer);
      const posTex = gpuc.createTexture();
      const velTex = gpuc.createTexture();
      createInitialPositionTexture(size, posTex.image.data as Float32Array<ArrayBuffer>);
      createInitialVelocityTexture(size, velTex.image.data as Float32Array<ArrayBuffer>);

      const positionVar = gpuc.addVariable(
        'texturePosition',
        POSITION_FRAG,
        posTex
      );
      const velocityVar = gpuc.addVariable(
        'textureVelocity',
        VELOCITY_FRAG,
        velTex
      );
      gpuc.setVariableDependencies(positionVar, [positionVar, velocityVar]);
      gpuc.setVariableDependencies(velocityVar, [positionVar, velocityVar]);

      const velUniforms = (velocityVar.material as THREE.ShaderMaterial).uniforms;
      velUniforms.uDt = { value: 1 / 60 };
      velUniforms.uTime = { value: 0 };
      velUniforms.uDrag = { value: 0.9 };
      velUniforms.uCenterPull = { value: 0.18 };
      velUniforms.uBassKick = { value: 0.6 };
      velUniforms.uSwirl = { value: 1.6 };
      velUniforms.uFieldScale = { value: 4 };
      velUniforms.uBass = { value: 0 };
      velUniforms.uMid = { value: 0 };
      velUniforms.uHigh = { value: 0 };
      velUniforms.uRms = { value: 0 };
      velUniforms.uBeatEnv = { value: 0 };

      const posUniforms = (positionVar.material as THREE.ShaderMaterial).uniforms;
      posUniforms.uDt = { value: 1 / 60 };
      posUniforms.uTime = { value: 0 };
      posUniforms.uBeatSpawn = { value: 0.15 };
      posUniforms.uBeatEnv = { value: 0 };

      const initError = gpuc.init();
      if (initError !== null) {
        console.error('[gpu-particles] GPUComputationRenderer init 失败：', initError);
      }

      // 粒子几何：UV 网格
      const positions = new Float32Array(size * size * 3);
      let i = 0;
      for (let y = 0; y < size; y++) {
        for (let x = 0; x < size; x++) {
          positions[i++] = (x + 0.5) / size;
          positions[i++] = (y + 0.5) / size;
          positions[i++] = 0;
        }
      }
      const geometry = new THREE.BufferGeometry();
      geometry.setAttribute('position', new THREE.BufferAttribute(positions, 3));
      geometry.boundingSphere = new THREE.Sphere(new THREE.Vector3(), 8);

      const material = new THREE.ShaderMaterial({
        uniforms: {
          texturePosition: { value: null },
          textureVelocity: { value: null },
          uGradientTex: { value: state.gradientTex },
          uPointSize: { value: 1.4 },
          uPixelRatio: { value: ctx.renderer.getPixelRatio() },
          uHigh: { value: 0 },
          uRms: { value: 0 },
          uAlphaScale: { value: 1.0 },
        },
        vertexShader: RENDER_VERT,
        fragmentShader: RENDER_FRAG,
        transparent: true,
        depthWrite: false,
        blending: THREE.AdditiveBlending,
      });

      const points = new THREE.Points(geometry, material);
      points.frustumCulled = false;
      ctx.presetGroup.add(points);

      state.gpuc = gpuc;
      state.positionVar = positionVar;
      state.velocityVar = velocityVar;
      state.geometry = geometry;
      state.material = material;
      state.points = points;
      state.beatEnv = 0;
      state.time = 0;
    },

    update(features: AudioFeatures, params, dt) {
      const { gpuc, positionVar, velocityVar, material, ctx } = state;
      if (!gpuc || !positionVar || !velocityVar || !material) return;

      state.time += dt;
      if (features.beat) state.beatEnv = 1;
      state.beatEnv = Math.max(0, state.beatEnv - dt * 1.6);

      const stepDt = Math.min(0.05, Math.max(0.001, dt));

      const velU = (velocityVar.material as THREE.ShaderMaterial).uniforms;
      velU.uDt.value = stepDt;
      velU.uTime.value = state.time;
      velU.uDrag.value = params.drag as number;
      velU.uCenterPull.value = params.centerPull as number;
      velU.uBassKick.value = params.bassKick as number;
      velU.uSwirl.value = params.swirl as number;
      velU.uFieldScale.value = params.fieldScale as number;
      velU.uBass.value = features.bands.bass;
      velU.uMid.value = features.bands.mid;
      velU.uHigh.value = features.bands.high;
      velU.uRms.value = features.rms;
      velU.uBeatEnv.value = state.beatEnv;

      const posU = (positionVar.material as THREE.ShaderMaterial).uniforms;
      posU.uDt.value = stepDt;
      posU.uTime.value = state.time;
      posU.uBeatSpawn.value = params.beatSpawn as number;
      posU.uBeatEnv.value = state.beatEnv;

      gpuc.compute();

      const u = material.uniforms;
      u.texturePosition.value = (
        gpuc.getCurrentRenderTarget(positionVar) as THREE.WebGLRenderTarget
      ).texture;
      u.textureVelocity.value = (
        gpuc.getCurrentRenderTarget(velocityVar) as THREE.WebGLRenderTarget
      ).texture;
      u.uPointSize.value = params.pointSize as number;
      if (ctx) u.uPixelRatio.value = ctx.renderer.getPixelRatio();
      u.uHigh.value = features.bands.high;
      u.uRms.value = features.rms;
      u.uAlphaScale.value = (params.alphaScale as number) ?? 1.0;

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
    },

    dispose(ctx) {
      if (state.points) ctx.presetGroup.remove(state.points);
      state.geometry?.dispose();
      state.material?.dispose();
      state.gpuc?.dispose();
      state.gradientTex?.dispose();
      state.points = null;
      state.geometry = null;
      state.material = null;
      state.gpuc = null;
      state.positionVar = null;
      state.velocityVar = null;
      state.gradientTex = null;
      state.gradientBuffer = null;
      state.lastGradient = null;
      state.ctx = null;
    },
  };
}
