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

const schema: ParamSchema = {
  barCount: {
    type: 'int',
    label: '频段数量',
    min: 16,
    max: 256,
    step: 1,
    default: 64,
    structural: true,
  },
  barWidth: {
    type: 'float',
    label: '柱宽比例',
    min: 0.2,
    max: 1.0,
    step: 0.01,
    default: 0.72,
  },
  heightScale: {
    type: 'float',
    label: '高度系数',
    min: 0.5,
    max: 8,
    step: 0.1,
    default: 3.2,
  },
  smoothing: {
    type: 'float',
    label: '平滑系数',
    min: 0,
    max: 0.95,
    step: 0.01,
    default: 0.55,
  },
  gradient: {
    type: 'gradient',
    label: '柱体渐变',
    default: defaultGradient(),
  },
  colorMode: {
    type: 'select',
    label: '渐变映射',
    default: 'position',
    options: [
      { label: '按位置（左→右）', value: 'position' },
      { label: '按能量（强度）', value: 'energy' },
      { label: '按频率（低→高）', value: 'frequency' },
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
    label: '能量亮度增益',
    min: 0,
    max: 1.5,
    step: 0.01,
    default: 0.45,
  },
  ...EXPOSURE_SCHEMA,
  beatPunch: {
    type: 'float',
    label: '节拍冲击',
    min: 0,
    max: 2,
    step: 0.05,
    default: 0.6,
  },
  mirror: {
    type: 'bool',
    label: '镜像左右',
    default: true,
  },
  cornerRadius: {
    type: 'float',
    label: '圆角（顶部）',
    min: 0,
    max: 1,
    step: 0.05,
    default: 0.3,
  },
};

interface PresetState {
  bars: THREE.InstancedMesh | null;
  barColors: Float32Array;
  smoothed: Float32Array;
  punchEnvelope: number;
  dummy: THREE.Object3D;
  geometry: THREE.BufferGeometry | null;
  material: THREE.MeshBasicMaterial | null;
}

/**
 * 构造一个「顶部带圆角、底部矩形」的柱体几何，单位高度=1，单位宽度=1。
 * radius 是圆角半径，相对于柱宽（0..0.5）。
 */
function makeBarGeometry(radius: number): THREE.BufferGeometry {
  const r = Math.max(0, Math.min(0.5, radius));
  if (r < 1e-3) {
    const g = new THREE.PlaneGeometry(1, 1);
    g.translate(0, 0.5, 0);
    return g;
  }
  // 用一个 Shape 做扁平 2D 圆角矩形（顶圆角，底直角），再 ExtrudeGeometry 出一点厚度
  const shape = new THREE.Shape();
  const halfW = 0.5;
  shape.moveTo(-halfW, 0);
  shape.lineTo(halfW, 0);
  shape.lineTo(halfW, 1 - r);
  shape.quadraticCurveTo(halfW, 1, halfW - r, 1);
  shape.lineTo(-halfW + r, 1);
  shape.quadraticCurveTo(-halfW, 1, -halfW, 1 - r);
  shape.lineTo(-halfW, 0);
  const g = new THREE.ShapeGeometry(shape);
  return g;
}

export function createSpectrumBarsPreset(): VisualPreset {
  const state: PresetState = {
    bars: null,
    barColors: new Float32Array(0),
    smoothed: new Float32Array(0),
    punchEnvelope: 0,
    dummy: new THREE.Object3D(),
    geometry: null,
    material: null,
  };

  let lastBarCount = 0;
  let lastCornerRadius = -1;
  const tmpColor = new THREE.Color();

  function rebuild(ctx: ThreeContext, count: number, cornerRadius: number) {
    if (state.bars) {
      ctx.presetGroup.remove(state.bars);
      state.bars.dispose();
      state.geometry?.dispose();
      state.material?.dispose();
    }
    state.geometry = makeBarGeometry(cornerRadius * 0.5);
    // 注意：InstancedMesh 通过 instanceColor 上色，不要打开 vertexColors，
    // 否则 shader 里 USE_COLOR 路径会把不存在的 `color` attribute 当成 (0,0,0) 全乘黑。
    state.material = new THREE.MeshBasicMaterial({
      transparent: true,
      opacity: 1,
      side: THREE.DoubleSide,
    });
    const mesh = new THREE.InstancedMesh(state.geometry, state.material, count);
    mesh.instanceColor = new THREE.InstancedBufferAttribute(
      new Float32Array(count * 3),
      3
    );
    mesh.frustumCulled = false;
    state.bars = mesh;
    state.barColors = new Float32Array(count * 3);
    state.smoothed = new Float32Array(count);
    ctx.presetGroup.add(mesh);
    lastBarCount = count;
    lastCornerRadius = cornerRadius;
  }

  return {
    id: 'spectrum-bars',
    name: '镜像频谱条',
    category: 'spectrum',
    paramSchema: schema,

    init(ctx, params) {
      const count = (params.barCount as number) ?? 64;
      const cr = (params.cornerRadius as number) ?? 0.3;
      rebuild(ctx, count, cr);
    },

    update(features: AudioFeatures, params, _dt) {
      if (!state.bars) return;

      const N = state.bars.count;
      const widthRatio = params.barWidth as number;
      const heightScale = params.heightScale as number;
      const smoothing = params.smoothing as number;
      const beatPunch = params.beatPunch as number;
      const mirror = params.mirror as boolean;
      const gradient = params.gradient as GradientValue;
      const colorMode =
        (params.colorMode as 'position' | 'energy' | 'frequency') ?? 'position';
      const exposureParams = extractExposureParams(params);
      const cornerRadius = (params.cornerRadius as number) ?? 0.3;

      // 圆角是非结构性参数，但需要重建几何 — 仅在变化时重建
      if (Math.abs(cornerRadius - lastCornerRadius) > 1e-3) {
        // dispose 旧几何，换新的
        const ctx = state.bars.parent?.parent as ThreeContext | undefined;
        // 上面拿不到 ctx；改用 instanceMesh 的 geometry 直接换
        const newGeo = makeBarGeometry(cornerRadius * 0.5);
        state.bars.geometry.dispose();
        state.bars.geometry = newGeo;
        state.geometry = newGeo;
        lastCornerRadius = cornerRadius;
        void ctx;
      }

      if (features.beat) state.punchEnvelope = 1;
      state.punchEnvelope *= 0.88;

      const fft = features.fft;
      const fftLen = fft.length;
      const halfBars = mirror ? Math.ceil(N / 2) : N;

      const minBin = 1;
      const maxBin = Math.min(fftLen - 1, Math.floor(fftLen * 0.55));
      const logMin = Math.log(minBin);
      const logMax = Math.log(maxBin);

      const totalWidth = 12;
      const barFullWidth = totalWidth / N;
      const barW = barFullWidth * widthRatio;
      const xOrigin = -totalWidth / 2 + barFullWidth / 2;

      const inst = state.bars;

      for (let i = 0; i < N; i++) {
        let srcIndex: number;
        if (mirror) {
          const half = Math.floor(N / 2);
          srcIndex = i < half ? half - 1 - i : i - half;
        } else {
          srcIndex = i;
        }
        const tFreq = halfBars > 1 ? srcIndex / (halfBars - 1) : 0;
        const lo = Math.floor(Math.exp(logMin + (logMax - logMin) * tFreq));
        const hi = Math.floor(
          Math.exp(
            logMin + (logMax - logMin) * Math.min(1, tFreq + 1 / halfBars)
          )
        );
        let sum = 0;
        let cnt = 0;
        for (let k = lo; k <= Math.max(lo, hi); k++) {
          sum += fft[k];
          cnt++;
        }
        const raw = cnt > 0 ? sum / cnt : 0;
        const target =
          raw * heightScale * (1 + state.punchEnvelope * beatPunch);
        const prev = state.smoothed[i] || 0;
        const next = prev * smoothing + target * (1 - smoothing);
        state.smoothed[i] = next;

        const h = Math.max(0.02, next);
        const x = xOrigin + i * barFullWidth;

        state.dummy.position.set(x, -2, 0);
        state.dummy.scale.set(barW, h, 1);
        state.dummy.updateMatrix();
        inst.setMatrixAt(i, state.dummy.matrix);

        // 渐变映射方向
        let tColor: number;
        if (colorMode === 'position') {
          tColor = N > 1 ? i / (N - 1) : 0;
        } else if (colorMode === 'frequency') {
          tColor = tFreq;
        } else {
          // energy
          tColor = Math.min(1, next / Math.max(0.01, heightScale));
        }
        sampleGradient(gradient, tColor, tmpColor);
        const energy = Math.min(1, next / Math.max(0.01, heightScale));
        applyExposure(tmpColor, energy, exposureParams, state.barColors, i * 3);
      }

      inst.instanceMatrix.needsUpdate = true;
      if (inst.instanceColor) {
        (inst.instanceColor.array as Float32Array).set(state.barColors);
        inst.instanceColor.needsUpdate = true;
      }
    },

    dispose(ctx) {
      if (state.bars) {
        ctx.presetGroup.remove(state.bars);
        state.bars.dispose();
      }
      state.geometry?.dispose();
      state.material?.dispose();
      state.bars = null;
      state.geometry = null;
      state.material = null;
    },
  };
}
