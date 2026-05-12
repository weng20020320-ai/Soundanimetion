import * as THREE from 'three';
import type { VisualPreset } from '../VisualPreset';
import type { ParamSchema } from '../ParamSchema';
import type { AudioFeatures } from '../../audio/types';
import type { ThreeContext } from '../../render/ThreeContext';
import {
  type GradientValue,
  defaultGradient,
  gradientFromPreset,
  sampleGradient,
} from '../GradientPresets';

/* 用户反馈："没有爆发的感觉只有灯泡在发亮"。
 *
 * 原因：
 *  - drag=0.85，每帧速度乘 0.85，1s 后速度衰减到 ~0.0002 → 粒子飞不出多远
 *  - gravity=0.6 朝中心 → 已经慢下来的粒子被拉回，堆在中心
 *  - 中心 spawn 范围 0.2 + AdditiveBlending + 大粒子 size 8 → 中心持续亮斑
 *  - 单粒子 alpha 上限 1.0（smoothstep(0.5, 0, r) * vLife），叠加爆白
 *
 * 修复：
 *  1. drag 0.85 → 0.96（粒子能飞远，有真正"飞溅"轨迹）
 *  2. gravity 0.6 → 0.0（默认不回拉，让爆炸是单向的）
 *  3. burstStrength 3.5 → 6.0（飞得快、飞得远）
 *  4. spawn 中心范围 0.2 → 0.04（spawn 点更"针尖"）
 *  5. particleSize 8 → 5（核心更小）
 *  6. alpha 公式：smoothstep(0.5, 0, r)*vLife → smoothstep(0.5, 0.1, r)*vLife*0.5
 *     单粒子最大 alpha 从 1.0 → 0.5
 *  7. lifetime 2.5 → 1.4（更快消失，避免长尾堆积）
 *  8. spawn 数量：beat N*0.06 → N*0.035, sustained RMS*80 → RMS*25
 *  9. 颜色：删除 hueBase/hueShift，引入 gradient
 *     - spawn 时按"谱质心 + 随机 0..1"采样 gradient
 *     - 默认 sunset（暖色），符合"爆发/烟花"的火热感
 */

const schema: ParamSchema = {
  particleCount: {
    type: 'int',
    label: '粒子数',
    min: 1024,
    max: 65536,
    step: 1024,
    default: 16384,
    structural: true,
  },
  particleSize: {
    type: 'float',
    label: '粒子大小',
    min: 1,
    max: 30,
    step: 0.5,
    default: 5,
  },
  burstStrength: {
    type: 'float',
    label: '爆发强度',
    min: 0.5,
    max: 12,
    step: 0.1,
    default: 6.0,
  },
  gravity: {
    type: 'float',
    label: '重力（向中心）',
    min: 0,
    max: 4,
    step: 0.05,
    default: 0.0,
  },
  drag: {
    type: 'float',
    label: '阻尼',
    min: 0,
    max: 0.999,
    step: 0.001,
    default: 0.96,
  },
  lifetime: {
    type: 'float',
    label: '寿命（秒）',
    min: 0.5,
    max: 6,
    step: 0.1,
    default: 1.4,
  },
  rotationSpeed: {
    type: 'float',
    label: '整体旋转',
    min: -1,
    max: 1,
    step: 0.01,
    default: 0.08,
  },
  alphaScale: {
    type: 'float',
    label: '不透明度',
    min: 0.1,
    max: 2,
    step: 0.01,
    default: 1.0,
  },
  gradient: {
    type: 'gradient',
    label: '渐变色',
    default: gradientFromPreset('sunset', 0),
  },
};

const VERT = `
attribute float aLife;
attribute vec3 aColor;
uniform float uSize;
varying vec3 vColor;
varying float vLife;
void main() {
  vColor = aColor;
  vLife = aLife;
  vec4 mv = modelViewMatrix * vec4(position, 1.0);
  gl_Position = projectionMatrix * mv;
  // 寿命越接近 0，粒子尺寸越小 → 让消失阶段是"缩小+变暗"双重淡出
  float scale = mix(0.3, 1.2, aLife);
  gl_PointSize = uSize * scale * (300.0 / -mv.z);
}
`;

const FRAG = `
varying vec3 vColor;
varying float vLife;
uniform float uAlphaScale;
void main() {
  vec2 uv = gl_PointCoord - 0.5;
  float r = length(uv);
  if (r > 0.5) discard;
  // 旧 smoothstep(0.5, 0, r)*vLife → 中心 alpha=vLife，新粒子 alpha=1.0
  // 新 smoothstep(0.5, 0.1, r)*vLife*0.5 → 中心 alpha=0.5*vLife，最高 0.5
  // 这是核心修复：单粒子上限 0.5，靠数量叠加自然形成"爆发的发光感"而不是"灯泡"
  float alpha = smoothstep(0.5, 0.1, r) * vLife * 0.5 * uAlphaScale;
  gl_FragColor = vec4(vColor, alpha);
}
`;

interface PresetState {
  points: THREE.Points | null;
  geometry: THREE.BufferGeometry | null;
  material: THREE.ShaderMaterial | null;
  positions: Float32Array | null;
  velocities: Float32Array | null;
  life: Float32Array | null;
  colors: Float32Array | null;
  cursor: number;
  group: THREE.Group | null;
  rotationY: number;
}

export function createParticlesBurstPreset(): VisualPreset {
  const state: PresetState = {
    points: null,
    geometry: null,
    material: null,
    positions: null,
    velocities: null,
    life: null,
    colors: null,
    cursor: 0,
    group: null,
    rotationY: 0,
  };

  let lastCount = 0;
  const tmpColor = new THREE.Color();

  function build(ctx: ThreeContext, count: number) {
    teardown(ctx);
    const positions = new Float32Array(count * 3);
    const velocities = new Float32Array(count * 3);
    const life = new Float32Array(count);
    const colors = new Float32Array(count * 3);

    const geometry = new THREE.BufferGeometry();
    geometry.setAttribute('position', new THREE.BufferAttribute(positions, 3));
    geometry.setAttribute('aLife', new THREE.BufferAttribute(life, 1));
    geometry.setAttribute('aColor', new THREE.BufferAttribute(colors, 3));

    const material = new THREE.ShaderMaterial({
      uniforms: {
        uSize: { value: 5 },
        uAlphaScale: { value: 1.0 },
      },
      vertexShader: VERT,
      fragmentShader: FRAG,
      transparent: true,
      depthWrite: false,
      blending: THREE.AdditiveBlending,
    });

    const points = new THREE.Points(geometry, material);
    points.frustumCulled = false;
    const group = new THREE.Group();
    group.add(points);
    ctx.presetGroup.add(group);

    state.geometry = geometry;
    state.material = material;
    state.points = points;
    state.positions = positions;
    state.velocities = velocities;
    state.life = life;
    state.colors = colors;
    state.cursor = 0;
    state.group = group;
    lastCount = count;
  }

  function teardown(ctx: ThreeContext) {
    if (state.group) {
      ctx.presetGroup.remove(state.group);
    }
    state.geometry?.dispose();
    state.material?.dispose();
    state.points = null;
    state.geometry = null;
    state.material = null;
    state.positions = null;
    state.velocities = null;
    state.life = null;
    state.colors = null;
    state.group = null;
  }

  function spawn(
    n: number,
    burstStrength: number,
    centroidNorm: number,
    gradient: GradientValue
  ) {
    const positions = state.positions!;
    const velocities = state.velocities!;
    const life = state.life!;
    const colors = state.colors!;
    const total = life.length;

    for (let i = 0; i < n; i++) {
      const idx = state.cursor;
      state.cursor = (state.cursor + 1) % total;

      // spawn 中心范围 0.2 → 0.04，让 spawn 点更接近"针尖"
      positions[idx * 3 + 0] = (Math.random() - 0.5) * 0.04;
      positions[idx * 3 + 1] = (Math.random() - 0.5) * 0.04;
      positions[idx * 3 + 2] = (Math.random() - 0.5) * 0.04;

      const theta = Math.random() * Math.PI * 2;
      const phi = Math.acos(2 * Math.random() - 1);
      const speed = burstStrength * (0.4 + Math.random() * 0.9);
      velocities[idx * 3 + 0] = Math.sin(phi) * Math.cos(theta) * speed;
      velocities[idx * 3 + 1] = Math.cos(phi) * speed;
      velocities[idx * 3 + 2] = Math.sin(phi) * Math.sin(theta) * speed;

      life[idx] = 1;

      // gradient 采样位置：谱质心做主轴 + 随机 0..1 范围里 ±0.2 抖动
      // → 同一拍内的粒子色彩有微妙差异，看起来是"爆出来一团彩色"而不是"全是单色"
      const t = Math.max(
        0,
        Math.min(1, centroidNorm * 0.7 + 0.15 + (Math.random() - 0.5) * 0.4)
      );
      sampleGradient(gradient, t, tmpColor);
      colors[idx * 3 + 0] = tmpColor.r;
      colors[idx * 3 + 1] = tmpColor.g;
      colors[idx * 3 + 2] = tmpColor.b;
    }
  }

  return {
    id: 'particles-burst',
    name: '节拍粒子爆发',
    category: 'particles',
    paramSchema: schema,

    init(ctx, params) {
      build(ctx, params.particleCount as number);
    },

    update(features: AudioFeatures, params, dt) {
      if (!state.points) return;
      // particleCount 是结构性参数，外层在变化时会触发预设 reinit
      void lastCount;

      const size = params.particleSize as number;
      const burstStrength = params.burstStrength as number;
      const gravity = params.gravity as number;
      const drag = params.drag as number;
      const lifetime = params.lifetime as number;
      const rotationSpeed = params.rotationSpeed as number;
      const gradient =
        (params.gradient as GradientValue | undefined) ?? defaultGradient();
      const alphaScale = (params.alphaScale as number) ?? 1.0;

      state.material!.uniforms.uSize.value = size;
      state.material!.uniforms.uAlphaScale.value = alphaScale;

      // 谱质心归一化（典型范围 0..8000Hz）
      const centroidNorm = Math.min(1, features.spectralCentroid / 8000);

      // beat / 持续 RMS 触发粒子
      if (features.beat) {
        const N = state.life!.length;
        // beat spawn 数量：旧 N*0.06 → 新 N*0.035（减半再多一点）
        const burst = Math.floor(N * 0.035);
        spawn(burst, burstStrength * 1.5, centroidNorm, gradient);
      }
      // 持续低强度喷射，跟随 RMS：旧 RMS*80 → 新 RMS*25（约 3 分之 1）
      const sustained = Math.floor(features.rms * 25);
      if (sustained > 0) {
        spawn(sustained, burstStrength * 0.4, centroidNorm, gradient);
      }

      const positions = state.positions!;
      const velocities = state.velocities!;
      const life = state.life!;
      const total = life.length;
      const decayPerSec = 1 / Math.max(0.1, lifetime);
      const dragPow = Math.pow(drag, dt * 60);

      for (let i = 0; i < total; i++) {
        if (life[i] <= 0) continue;
        const ix = i * 3;
        const px = positions[ix];
        const py = positions[ix + 1];
        const pz = positions[ix + 2];
        const dist = Math.sqrt(px * px + py * py + pz * pz) + 1e-4;
        // 朝向中心的轻微吸引
        const ax = -gravity * (px / dist);
        const ay = -gravity * (py / dist);
        const az = -gravity * (pz / dist);

        velocities[ix] = velocities[ix] * dragPow + ax * dt;
        velocities[ix + 1] = velocities[ix + 1] * dragPow + ay * dt;
        velocities[ix + 2] = velocities[ix + 2] * dragPow + az * dt;

        positions[ix] += velocities[ix] * dt;
        positions[ix + 1] += velocities[ix + 1] * dt;
        positions[ix + 2] += velocities[ix + 2] * dt;

        life[i] = Math.max(0, life[i] - decayPerSec * dt);
      }

      state.geometry!.attributes.position.needsUpdate = true;
      state.geometry!.attributes.aLife.needsUpdate = true;
      state.geometry!.attributes.aColor.needsUpdate = true;

      state.rotationY += rotationSpeed * dt;
      if (state.group) state.group.rotation.y = state.rotationY;
    },

    dispose(ctx) {
      teardown(ctx);
    },
  };
}
