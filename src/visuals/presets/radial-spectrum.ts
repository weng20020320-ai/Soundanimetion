import * as THREE from 'three';
import type { VisualPreset } from '../VisualPreset';
import type { ParamSchema } from '../ParamSchema';
import type { AudioFeatures } from '../../audio/types';
import type { ThreeContext } from '../../render/ThreeContext';
import {
  defaultGradient,
  sampleGradient,
  type GradientValue,
} from '../GradientPresets';
import {
  EXPOSURE_SCHEMA,
  applyExposure,
  extractExposureParams,
} from '../ExposureUtils';

/**
 * 圆环频谱（Specterr 经典款）：N 根柱子等距分布在圆周上，
 * 高度由对应频段能量驱动，向外辐射。中心可放音频封面（占位）。
 */

const schema: ParamSchema = {
  barCount: {
    type: 'int',
    label: '柱体数量',
    min: 24,
    max: 256,
    step: 2,
    default: 96,
    structural: true,
  },
  innerRadius: {
    type: 'float',
    label: '内径',
    min: 0.5,
    max: 5,
    step: 0.05,
    default: 2.0,
  },
  lengthScale: {
    type: 'float',
    label: '长度系数',
    min: 0.2,
    max: 6,
    step: 0.05,
    default: 1.6,
  },
  barWidth: {
    type: 'float',
    label: '柱宽',
    min: 0.2,
    max: 1.0,
    step: 0.01,
    default: 0.55,
  },
  smoothing: {
    type: 'float',
    label: '平滑',
    min: 0,
    max: 0.95,
    step: 0.01,
    default: 0.55,
  },
  rotationSpeed: {
    type: 'float',
    label: '旋转速度',
    min: -1,
    max: 1,
    step: 0.01,
    default: 0.05,
  },
  beatPunch: {
    type: 'float',
    label: '节拍冲击',
    min: 0,
    max: 2,
    step: 0.05,
    default: 0.7,
  },
  gradient: {
    type: 'gradient',
    label: '柱体渐变',
    default: defaultGradient(),
  },
  colorMode: {
    type: 'select',
    label: '渐变映射',
    default: 'angle',
    options: [
      { label: '按角度（一周）', value: 'angle' },
      { label: '按频率（低→高）', value: 'frequency' },
      { label: '按能量', value: 'energy' },
    ],
  },
  baseLightness: {
    type: 'float',
    label: '亮度基线',
    min: 0,
    max: 1,
    step: 0.01,
    default: 0.55,
  },
  energyBoost: {
    type: 'float',
    label: '能量增益',
    min: 0,
    max: 1.5,
    step: 0.01,
    default: 0.45,
  },
  ...EXPOSURE_SCHEMA,
  mirror: {
    type: 'bool',
    label: '左右镜像',
    default: true,
  },
  innerRing: {
    type: 'bool',
    label: '显示内圆环',
    default: true,
  },
};

interface PresetState {
  group: THREE.Group | null;
  bars: THREE.InstancedMesh | null;
  ring: THREE.Mesh | null;
  ringMat: THREE.MeshBasicMaterial | null;
  geometry: THREE.PlaneGeometry | null;
  material: THREE.MeshBasicMaterial | null;
  smoothed: Float32Array;
  punchEnvelope: number;
  rotation: number;
}

export function createRadialSpectrumPreset(): VisualPreset {
  const state: PresetState = {
    group: null,
    bars: null,
    ring: null,
    ringMat: null,
    geometry: null,
    material: null,
    smoothed: new Float32Array(0),
    punchEnvelope: 0,
    rotation: 0,
  };
  const dummy = new THREE.Object3D();
  const tmpColor = new THREE.Color();

  function rebuild(ctx: ThreeContext, count: number) {
    if (state.group) {
      ctx.presetGroup.remove(state.group);
      state.bars?.dispose();
      state.geometry?.dispose();
      state.material?.dispose();
      state.ring && state.ring.geometry.dispose();
      state.ringMat?.dispose();
    }
    const group = new THREE.Group();

    state.geometry = new THREE.PlaneGeometry(1, 1);
    state.geometry.translate(0, 0.5, 0); // 锚点放底部
    // 同 spectrum-bars：InstancedMesh 只用 instanceColor，不要打开 vertexColors。
    state.material = new THREE.MeshBasicMaterial({
      transparent: true,
      side: THREE.DoubleSide,
    });
    const mesh = new THREE.InstancedMesh(state.geometry, state.material, count);
    mesh.instanceColor = new THREE.InstancedBufferAttribute(
      new Float32Array(count * 3),
      3
    );
    mesh.frustumCulled = false;
    state.bars = mesh;

    const ringGeo = new THREE.RingGeometry(1, 1.06, 128);
    state.ringMat = new THREE.MeshBasicMaterial({
      color: 0xffffff,
      transparent: true,
      opacity: 0.5,
    });
    state.ring = new THREE.Mesh(ringGeo, state.ringMat);

    group.add(mesh);
    group.add(state.ring);
    ctx.presetGroup.add(group);
    state.group = group;
    state.smoothed = new Float32Array(count);
  }

  return {
    id: 'radial-spectrum',
    name: '圆环频谱',
    category: 'spectrum',
    paramSchema: schema,

    init(ctx, params) {
      rebuild(ctx, (params.barCount as number) ?? 96);
    },

    update(features: AudioFeatures, params, dt) {
      if (!state.bars || !state.group) return;

      const N = state.bars.count;
      const innerRadius = params.innerRadius as number;
      const lengthScale = params.lengthScale as number;
      const barWidth = params.barWidth as number;
      const smoothing = params.smoothing as number;
      const rotationSpeed = params.rotationSpeed as number;
      const beatPunch = params.beatPunch as number;
      const gradient = params.gradient as GradientValue;
      const colorMode =
        (params.colorMode as 'angle' | 'frequency' | 'energy') ?? 'angle';
      const exposureParams = extractExposureParams(params);
      const mirror = params.mirror as boolean;
      const innerRing = params.innerRing as boolean;

      if (features.beat) state.punchEnvelope = 1;
      state.punchEnvelope *= 0.88;

      state.rotation += rotationSpeed * dt;
      state.group.rotation.z = state.rotation;

      const fft = features.fft;
      const fftLen = fft.length;
      const half = mirror ? Math.ceil(N / 2) : N;
      const minBin = 1;
      const maxBin = Math.min(fftLen - 1, Math.floor(fftLen * 0.55));
      const logMin = Math.log(minBin);
      const logMax = Math.log(maxBin);

      const angleStep = (Math.PI * 2) / N;
      const arcW = (innerRadius * 2 * Math.sin(angleStep / 2)) * barWidth;

      for (let i = 0; i < N; i++) {
        let srcIndex: number;
        if (mirror) {
          const halfN = Math.floor(N / 2);
          if (i < halfN) {
            srcIndex = halfN - 1 - i;
          } else {
            srcIndex = i - halfN;
          }
        } else {
          srcIndex = i;
        }
        const tFreq = half > 1 ? srcIndex / (half - 1) : 0;
        const lo = Math.floor(Math.exp(logMin + (logMax - logMin) * tFreq));
        const hi = Math.floor(
          Math.exp(logMin + (logMax - logMin) * Math.min(1, tFreq + 1 / half))
        );
        let sum = 0;
        let cnt = 0;
        for (let k = lo; k <= Math.max(lo, hi); k++) {
          sum += fft[k];
          cnt++;
        }
        const raw = cnt > 0 ? sum / cnt : 0;
        const target =
          raw * lengthScale * (1 + state.punchEnvelope * beatPunch);
        const prev = state.smoothed[i] || 0;
        const next = prev * smoothing + target * (1 - smoothing);
        state.smoothed[i] = next;

        const len = Math.max(0.02, next);
        // i=0 在正上方，顺时针：使用 -π/2 - i*step
        const angle = -Math.PI / 2 + i * angleStep;
        const cx = Math.cos(angle) * innerRadius;
        const cy = Math.sin(angle) * innerRadius;

        dummy.position.set(cx, cy, 0);
        dummy.rotation.set(0, 0, angle - Math.PI / 2);
        dummy.scale.set(arcW, len, 1);
        dummy.updateMatrix();
        state.bars.setMatrixAt(i, dummy.matrix);

        // 着色
        let tColor: number;
        if (colorMode === 'angle') {
          tColor = N > 1 ? i / (N - 1) : 0;
        } else if (colorMode === 'frequency') {
          tColor = tFreq;
        } else {
          tColor = Math.min(1, next / Math.max(0.01, lengthScale));
        }
        sampleGradient(gradient, tColor, tmpColor);
        const energy = Math.min(1, next / Math.max(0.01, lengthScale));
        applyExposure(
          tmpColor,
          energy,
          exposureParams,
          state.bars.instanceColor!.array as Float32Array,
          i * 3
        );
      }

      state.bars.instanceMatrix.needsUpdate = true;
      state.bars.instanceColor!.needsUpdate = true;

      // 内圆环
      if (state.ring && state.ringMat) {
        state.ring.visible = innerRing;
        state.ring.scale.setScalar(innerRadius);
        state.ringMat.opacity = 0.35 + state.punchEnvelope * 0.4;
      }
    },

    dispose(ctx) {
      if (state.group) ctx.presetGroup.remove(state.group);
      state.bars?.dispose();
      state.geometry?.dispose();
      state.material?.dispose();
      state.ring && state.ring.geometry.dispose();
      state.ringMat?.dispose();
      state.group = null;
      state.bars = null;
      state.ring = null;
      state.ringMat = null;
      state.geometry = null;
      state.material = null;
    },
  };
}
