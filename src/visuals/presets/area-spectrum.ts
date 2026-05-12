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

/**
 * 填充频谱区域：把 N 个频段的能量当作高度，连成多边形填充，
 * 顶部边缘有一条高亮 stroke。整体走垂直渐变（强能量区更亮）。
 *
 * 这是一种类似 Adobe Audition / Spotify Canvas 的视觉，做 Lofi、播客、慢节奏 MV 都很合适。
 */

const schema: ParamSchema = {
  resolution: {
    type: 'int',
    label: '采样精度',
    min: 64,
    max: 512,
    step: 32,
    default: 192,
    structural: true,
  },
  width: {
    type: 'float',
    label: '画布宽度',
    min: 4,
    max: 24,
    step: 0.5,
    default: 14,
  },
  heightScale: {
    type: 'float',
    label: '高度系数',
    min: 0.5,
    max: 6,
    step: 0.05,
    default: 2.4,
  },
  smoothing: {
    type: 'float',
    label: '时间平滑',
    min: 0,
    max: 0.95,
    step: 0.01,
    default: 0.6,
  },
  spatialSmoothing: {
    type: 'int',
    label: '空间平滑（邻接）',
    min: 0,
    max: 8,
    step: 1,
    default: 2,
  },
  baseY: {
    type: 'float',
    label: '基线 Y',
    min: -4,
    max: 0,
    step: 0.05,
    default: -2.5,
  },
  fillAlpha: {
    type: 'float',
    label: '填充透明度',
    min: 0.1,
    max: 1.0,
    step: 0.01,
    default: 0.85,
  },
  edgeIntensity: {
    type: 'float',
    label: '顶边缘强度',
    min: 0,
    max: 2,
    step: 0.05,
    default: 1.0,
  },
  beatPunch: {
    type: 'float',
    label: '节拍冲击',
    min: 0,
    max: 2,
    step: 0.05,
    default: 0.4,
  },
  mirror: {
    type: 'bool',
    label: '左右镜像',
    default: true,
  },
  gradient: {
    type: 'gradient',
    label: '填充渐变',
    default: defaultGradient(),
  },
  edgeColorMode: {
    type: 'select',
    label: '顶边缘颜色',
    default: 'gradient-end',
    options: [
      { label: '渐变末端', value: 'gradient-end' },
      { label: '白色发光', value: 'white' },
      { label: '随频段', value: 'per-bin' },
    ],
  },
};

interface PresetState {
  group: THREE.Group | null;
  fillMesh: THREE.Mesh | null;
  fillGeo: THREE.BufferGeometry | null;
  fillMat: THREE.MeshBasicMaterial | null;
  edgeLine: THREE.Line | null;
  edgeGeo: THREE.BufferGeometry | null;
  edgeMat: THREE.LineBasicMaterial | null;
  smoothed: Float32Array;
  punchEnvelope: number;
  positions: Float32Array | null;
  colors: Float32Array | null;
  edgePositions: Float32Array | null;
  edgeColors: Float32Array | null;
}

export function createAreaSpectrumPreset(): VisualPreset {
  const state: PresetState = {
    group: null,
    fillMesh: null,
    fillGeo: null,
    fillMat: null,
    edgeLine: null,
    edgeGeo: null,
    edgeMat: null,
    smoothed: new Float32Array(0),
    punchEnvelope: 0,
    positions: null,
    colors: null,
    edgePositions: null,
    edgeColors: null,
  };
  const tmpColor = new THREE.Color();

  function rebuild(ctx: ThreeContext, n: number) {
    if (state.group) {
      ctx.presetGroup.remove(state.group);
      state.fillGeo?.dispose();
      state.fillMat?.dispose();
      state.edgeGeo?.dispose();
      state.edgeMat?.dispose();
    }
    const group = new THREE.Group();

    // 三角带：每两列共用顶部一对(top1, top2) + 底部一对(bot1, bot2)
    // 这里直接用 indexed BufferGeometry：N 列，2N 顶点（顶+底），(N-1)*2 个三角形
    const positions = new Float32Array(n * 2 * 3); // top + bottom
    const colors = new Float32Array(n * 2 * 3);
    const indices: number[] = [];
    for (let i = 0; i < n - 1; i++) {
      const top0 = i * 2 + 0;
      const bot0 = i * 2 + 1;
      const top1 = (i + 1) * 2 + 0;
      const bot1 = (i + 1) * 2 + 1;
      indices.push(top0, bot0, top1);
      indices.push(top1, bot0, bot1);
    }
    const fillGeo = new THREE.BufferGeometry();
    fillGeo.setAttribute('position', new THREE.BufferAttribute(positions, 3));
    fillGeo.setAttribute('color', new THREE.BufferAttribute(colors, 3));
    fillGeo.setIndex(indices);
    const fillMat = new THREE.MeshBasicMaterial({
      vertexColors: true,
      transparent: true,
      opacity: 1,
      depthTest: false,
      depthWrite: false,
      side: THREE.DoubleSide,
    });
    const fillMesh = new THREE.Mesh(fillGeo, fillMat);
    fillMesh.frustumCulled = false;
    group.add(fillMesh);

    // 顶部 stroke
    const edgePositions = new Float32Array(n * 3);
    const edgeColors = new Float32Array(n * 3);
    const edgeGeo = new THREE.BufferGeometry();
    edgeGeo.setAttribute(
      'position',
      new THREE.BufferAttribute(edgePositions, 3)
    );
    edgeGeo.setAttribute('color', new THREE.BufferAttribute(edgeColors, 3));
    const edgeMat = new THREE.LineBasicMaterial({
      vertexColors: true,
      transparent: true,
      opacity: 1,
      depthTest: false,
      depthWrite: false,
    });
    const edgeLine = new THREE.Line(edgeGeo, edgeMat);
    edgeLine.frustumCulled = false;
    group.add(edgeLine);

    ctx.presetGroup.add(group);

    state.group = group;
    state.fillMesh = fillMesh;
    state.fillGeo = fillGeo;
    state.fillMat = fillMat;
    state.edgeLine = edgeLine;
    state.edgeGeo = edgeGeo;
    state.edgeMat = edgeMat;
    state.smoothed = new Float32Array(n);
    state.positions = positions;
    state.colors = colors;
    state.edgePositions = edgePositions;
    state.edgeColors = edgeColors;
  }

  return {
    id: 'area-spectrum',
    name: '填充频谱区域',
    category: 'spectrum',
    paramSchema: schema,

    init(ctx, params) {
      rebuild(ctx, (params.resolution as number) ?? 192);
    },

    update(features: AudioFeatures, params, _dt) {
      if (
        !state.fillGeo ||
        !state.edgeGeo ||
        !state.positions ||
        !state.colors ||
        !state.edgePositions ||
        !state.edgeColors ||
        !state.fillMat
      )
        return;

      const N = state.smoothed.length;
      const totalWidth = params.width as number;
      const heightScale = params.heightScale as number;
      const smoothing = params.smoothing as number;
      const spatialSmoothing = (params.spatialSmoothing as number) | 0;
      const baseY = params.baseY as number;
      const fillAlpha = params.fillAlpha as number;
      const edgeIntensity = params.edgeIntensity as number;
      const beatPunch = params.beatPunch as number;
      const mirror = params.mirror as boolean;
      const gradient = params.gradient as GradientValue;
      const edgeColorMode = params.edgeColorMode as
        | 'gradient-end'
        | 'white'
        | 'per-bin';

      if (features.beat) state.punchEnvelope = 1;
      state.punchEnvelope *= 0.88;

      const fft = features.fft;
      const fftLen = fft.length;
      const halfBars = mirror ? Math.ceil(N / 2) : N;
      const minBin = 1;
      const maxBin = Math.min(fftLen - 1, Math.floor(fftLen * 0.55));
      const logMin = Math.log(minBin);
      const logMax = Math.log(maxBin);

      // 1) 算每个采样的目标高度
      const heights = state.smoothed; // 复用：先写 smoothed 即时值
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
        const prev = heights[i] || 0;
        heights[i] = prev * smoothing + target * (1 - smoothing);
      }

      // 2) 空间平滑（盒滤波）
      if (spatialSmoothing > 0) {
        const tmp = new Float32Array(N);
        const w = spatialSmoothing;
        for (let i = 0; i < N; i++) {
          let s = 0;
          let c = 0;
          for (let j = i - w; j <= i + w; j++) {
            if (j >= 0 && j < N) {
              s += heights[j];
              c++;
            }
          }
          tmp[i] = s / Math.max(1, c);
        }
        heights.set(tmp);
      }

      // 3) 写入 mesh 顶点
      const xL = -totalWidth / 2;
      const dx = N > 1 ? totalWidth / (N - 1) : 0;
      const positions = state.positions;
      const colors = state.colors;
      const edgePositions = state.edgePositions;
      const edgeColors = state.edgeColors;

      for (let i = 0; i < N; i++) {
        const x = xL + i * dx;
        const h = Math.max(0.01, heights[i]);
        const yTop = baseY + h;
        const yBot = baseY;

        // 顶点顺序：top, bottom
        const vTop = i * 2 + 0;
        const vBot = i * 2 + 1;
        positions[vTop * 3 + 0] = x;
        positions[vTop * 3 + 1] = yTop;
        positions[vTop * 3 + 2] = 0;
        positions[vBot * 3 + 0] = x;
        positions[vBot * 3 + 1] = yBot;
        positions[vBot * 3 + 2] = 0;

        // 颜色：垂直渐变 — 顶部用 gradient(t=1)，底部 gradient(t=0)
        sampleGradient(gradient, 1, tmpColor);
        colors[vTop * 3 + 0] = tmpColor.r;
        colors[vTop * 3 + 1] = tmpColor.g;
        colors[vTop * 3 + 2] = tmpColor.b;
        sampleGradient(gradient, 0, tmpColor);
        colors[vBot * 3 + 0] = tmpColor.r * 0.65;
        colors[vBot * 3 + 1] = tmpColor.g * 0.65;
        colors[vBot * 3 + 2] = tmpColor.b * 0.65;

        // 边缘 line 顶点
        edgePositions[i * 3 + 0] = x;
        edgePositions[i * 3 + 1] = yTop + 0.005;
        edgePositions[i * 3 + 2] = 0;

        if (edgeColorMode === 'white') {
          edgeColors[i * 3 + 0] = 1.0 * edgeIntensity;
          edgeColors[i * 3 + 1] = 1.0 * edgeIntensity;
          edgeColors[i * 3 + 2] = 1.0 * edgeIntensity;
        } else if (edgeColorMode === 'per-bin') {
          sampleGradient(gradient, i / Math.max(1, N - 1), tmpColor);
          edgeColors[i * 3 + 0] = tmpColor.r * (1 + edgeIntensity * 0.5);
          edgeColors[i * 3 + 1] = tmpColor.g * (1 + edgeIntensity * 0.5);
          edgeColors[i * 3 + 2] = tmpColor.b * (1 + edgeIntensity * 0.5);
        } else {
          // gradient-end
          sampleGradient(gradient, 1, tmpColor);
          const k = 1 + edgeIntensity * 0.6;
          edgeColors[i * 3 + 0] = tmpColor.r * k;
          edgeColors[i * 3 + 1] = tmpColor.g * k;
          edgeColors[i * 3 + 2] = tmpColor.b * k;
        }
      }

      state.fillGeo.attributes.position.needsUpdate = true;
      state.fillGeo.attributes.color.needsUpdate = true;
      state.edgeGeo.attributes.position.needsUpdate = true;
      state.edgeGeo.attributes.color.needsUpdate = true;
      state.fillMat.opacity = fillAlpha;
    },

    dispose(ctx) {
      if (state.group) ctx.presetGroup.remove(state.group);
      state.fillGeo?.dispose();
      state.fillMat?.dispose();
      state.edgeGeo?.dispose();
      state.edgeMat?.dispose();
      state.group = null;
      state.fillMesh = null;
      state.fillGeo = null;
      state.fillMat = null;
      state.edgeLine = null;
      state.edgeGeo = null;
      state.edgeMat = null;
    },
  };
}
