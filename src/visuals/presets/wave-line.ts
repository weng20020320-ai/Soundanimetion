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
 * 流光波形线：横屏一条粗描边波形，每段位移由音频波形驱动。
 * 用三角带模拟「粗线」：每个采样点在法线方向上下偏移 thickness/2。
 * 配合 PostFX 的 Bloom，做 Lyric Video / Lofi 视频特别合适。
 */

const schema: ParamSchema = {
  resolution: {
    type: 'int',
    label: '采样精度',
    min: 64,
    max: 1024,
    step: 32,
    default: 384,
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
  thickness: {
    type: 'float',
    label: '线宽',
    min: 0.01,
    max: 0.6,
    step: 0.005,
    default: 0.08,
  },
  amplitude: {
    type: 'float',
    label: '波形幅度',
    min: 0.2,
    max: 6,
    step: 0.05,
    default: 2.0,
  },
  smoothing: {
    type: 'float',
    label: '平滑',
    min: 0,
    max: 0.95,
    step: 0.01,
    default: 0.4,
  },
  glowSpread: {
    type: 'float',
    label: '辉光半径',
    min: 0,
    max: 1,
    step: 0.01,
    default: 0.35,
  },
  beatGrow: {
    type: 'float',
    label: '节拍增粗',
    min: 0,
    max: 2,
    step: 0.05,
    default: 0.7,
  },
  doubleLine: {
    type: 'bool',
    label: '双层（增加体积感）',
    default: true,
  },
  gradient: {
    type: 'gradient',
    label: '波形渐变',
    default: defaultGradient(),
  },
  colorMode: {
    type: 'select',
    label: '渐变映射',
    default: 'horizontal',
    options: [
      { label: '横向（左→右）', value: 'horizontal' },
      { label: '幅度（中线→峰）', value: 'amplitude' },
    ],
  },
  centerLine: {
    type: 'bool',
    label: '画一条中线',
    default: true,
  },
};

interface PresetState {
  group: THREE.Group | null;
  mainGeo: THREE.BufferGeometry | null;
  mainMat: THREE.MeshBasicMaterial | null;
  mainMesh: THREE.Mesh | null;
  haloGeo: THREE.BufferGeometry | null;
  haloMat: THREE.MeshBasicMaterial | null;
  haloMesh: THREE.Mesh | null;
  centerLine: THREE.Line | null;
  centerGeo: THREE.BufferGeometry | null;
  centerMat: THREE.LineBasicMaterial | null;

  positions: Float32Array | null;       // main band: 2N 顶点（上下）
  colors: Float32Array | null;
  haloPositions: Float32Array | null;   // halo band: 2N
  haloColors: Float32Array | null;

  smoothed: Float32Array;
  beatEnv: number;
}

export function createWaveLinePreset(): VisualPreset {
  const state: PresetState = {
    group: null,
    mainGeo: null,
    mainMat: null,
    mainMesh: null,
    haloGeo: null,
    haloMat: null,
    haloMesh: null,
    centerLine: null,
    centerGeo: null,
    centerMat: null,
    positions: null,
    colors: null,
    haloPositions: null,
    haloColors: null,
    smoothed: new Float32Array(0),
    beatEnv: 0,
  };
  const tmpColor = new THREE.Color();

  function makeBand(n: number) {
    const positions = new Float32Array(n * 2 * 3);
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
    const geo = new THREE.BufferGeometry();
    geo.setAttribute('position', new THREE.BufferAttribute(positions, 3));
    geo.setAttribute('color', new THREE.BufferAttribute(colors, 3));
    geo.setIndex(indices);
    return { geo, positions, colors };
  }

  function rebuild(ctx: ThreeContext, n: number) {
    if (state.group) {
      ctx.presetGroup.remove(state.group);
      state.mainGeo?.dispose();
      state.mainMat?.dispose();
      state.haloGeo?.dispose();
      state.haloMat?.dispose();
      state.centerGeo?.dispose();
      state.centerMat?.dispose();
    }
    const group = new THREE.Group();

    // 主层
    const main = makeBand(n);
    state.mainGeo = main.geo;
    state.positions = main.positions;
    state.colors = main.colors;
    state.mainMat = new THREE.MeshBasicMaterial({
      vertexColors: true,
      transparent: true,
      opacity: 1,
      depthTest: false,
      depthWrite: false,
      side: THREE.DoubleSide,
    });
    state.mainMesh = new THREE.Mesh(state.mainGeo, state.mainMat);
    state.mainMesh.frustumCulled = false;
    group.add(state.mainMesh);

    // 辉光层
    const halo = makeBand(n);
    state.haloGeo = halo.geo;
    state.haloPositions = halo.positions;
    state.haloColors = halo.colors;
    state.haloMat = new THREE.MeshBasicMaterial({
      vertexColors: true,
      transparent: true,
      opacity: 0.35,
      depthTest: false,
      depthWrite: false,
      side: THREE.DoubleSide,
      blending: THREE.AdditiveBlending,
    });
    state.haloMesh = new THREE.Mesh(state.haloGeo, state.haloMat);
    state.haloMesh.frustumCulled = false;
    state.haloMesh.position.z = -0.001;
    group.add(state.haloMesh);

    // 中线
    state.centerGeo = new THREE.BufferGeometry();
    const centerPos = new Float32Array(2 * 3);
    state.centerGeo.setAttribute(
      'position',
      new THREE.BufferAttribute(centerPos, 3)
    );
    state.centerMat = new THREE.LineBasicMaterial({
      color: 0xffffff,
      transparent: true,
      opacity: 0.18,
      depthTest: false,
      depthWrite: false,
    });
    state.centerLine = new THREE.Line(state.centerGeo, state.centerMat);
    state.centerLine.frustumCulled = false;
    group.add(state.centerLine);

    ctx.presetGroup.add(group);
    state.group = group;
    state.smoothed = new Float32Array(n);
  }

  return {
    id: 'wave-line',
    name: '流光波形线',
    category: 'spectrum',
    paramSchema: schema,

    init(ctx, params) {
      rebuild(ctx, (params.resolution as number) ?? 384);
    },

    update(features: AudioFeatures, params, dt) {
      if (
        !state.positions ||
        !state.colors ||
        !state.haloPositions ||
        !state.haloColors ||
        !state.mainGeo ||
        !state.haloGeo ||
        !state.centerGeo ||
        !state.haloMat ||
        !state.centerMat ||
        !state.mainMat
      )
        return;

      const N = state.smoothed.length;
      const totalWidth = params.width as number;
      const thickness = params.thickness as number;
      const amplitude = params.amplitude as number;
      const smoothing = params.smoothing as number;
      const glowSpread = params.glowSpread as number;
      const beatGrow = params.beatGrow as number;
      const doubleLine = params.doubleLine as boolean;
      const gradient = params.gradient as GradientValue;
      const colorMode =
        (params.colorMode as 'horizontal' | 'amplitude') ?? 'horizontal';
      const showCenter = params.centerLine as boolean;

      if (features.beat) state.beatEnv = 1;
      state.beatEnv = Math.max(0, state.beatEnv - dt * 2.5);

      // 用 fft（更稳定的可视效果）：把 N 个采样从频谱低频端取一段宽，再做空间平滑
      // 更接近"波形线"的视觉，但用 FFT 更耐看（不会闪到没法看）
      const fft = features.fft;
      const fftLen = fft.length;
      const minBin = 1;
      const maxBin = Math.min(fftLen - 1, Math.floor(fftLen * 0.55));
      const logMin = Math.log(minBin);
      const logMax = Math.log(maxBin);

      // 1) 先生成 raw 高度（[-1, 1] 范围左右）
      const raw = new Float32Array(N);
      for (let i = 0; i < N; i++) {
        const tFreq = N > 1 ? i / (N - 1) : 0;
        const lo = Math.floor(Math.exp(logMin + (logMax - logMin) * tFreq));
        const hi = Math.floor(
          Math.exp(logMin + (logMax - logMin) * Math.min(1, tFreq + 1 / N))
        );
        let sum = 0;
        let cnt = 0;
        for (let k = lo; k <= Math.max(lo, hi); k++) {
          sum += fft[k];
          cnt++;
        }
        raw[i] = (cnt > 0 ? sum / cnt : 0) * amplitude;
      }
      // 时间平滑
      for (let i = 0; i < N; i++) {
        state.smoothed[i] =
          state.smoothed[i] * smoothing + raw[i] * (1 - smoothing);
      }

      // 2) 算每个点的 x, y
      // y 用 sin(t * π) 镜像形状以避免左右极端被切：基线在 0
      const xL = -totalWidth / 2;
      const dx = N > 1 ? totalWidth / (N - 1) : 0;
      const half = thickness * 0.5 * (1 + state.beatEnv * beatGrow);
      const haloHalf = half * (1 + glowSpread * 6);

      // y(i) = smoothed[i] * 直接当 y（双向波）
      // 这里我们按"双向波形"：i 居中时，把 N 拆成 [-1..1]
      // 而 smoothed 是非负 → 用 sign = ((i % 2 === 0) ? 1 : -1) 做轻微镜像？
      // 更简单：用 (i / N) - 0.5 当作时间相位 + 加上一点抖动
      // 视觉上： y[i] = smoothed[i] * (i 偶数:+1 奇数:-1)
      // 这样能形成对称波纹
      // 但若用户把 smoothing 调高，看起来就是"上下交错"的小山
      // 替代：直接把 smoothed 当作 abs，然后乘以一个低频正弦相位，让线条蜿蜒
      const positions = state.positions;
      const colors = state.colors;
      const haloPositions = state.haloPositions;
      const haloColors = state.haloColors;

      for (let i = 0; i < N; i++) {
        const x = xL + i * dx;
        const phase = Math.sin((i / N) * Math.PI * 4) * 0.3;
        const y = state.smoothed[i] * (i % 2 === 0 ? 1 : -1) * 0.5 + phase * 0.2;

        // 主带
        const yT = y + half;
        const yB = y - half;
        const top = i * 2 + 0;
        const bot = i * 2 + 1;
        positions[top * 3 + 0] = x;
        positions[top * 3 + 1] = yT;
        positions[top * 3 + 2] = 0;
        positions[bot * 3 + 0] = x;
        positions[bot * 3 + 1] = yB;
        positions[bot * 3 + 2] = 0;

        let tColor: number;
        if (colorMode === 'horizontal') tColor = N > 1 ? i / (N - 1) : 0;
        else tColor = Math.min(1, Math.abs(y) / Math.max(0.5, amplitude));
        sampleGradient(gradient, tColor, tmpColor);
        colors[top * 3 + 0] = tmpColor.r;
        colors[top * 3 + 1] = tmpColor.g;
        colors[top * 3 + 2] = tmpColor.b;
        colors[bot * 3 + 0] = tmpColor.r;
        colors[bot * 3 + 1] = tmpColor.g;
        colors[bot * 3 + 2] = tmpColor.b;

        // 辉光带
        haloPositions[top * 3 + 0] = x;
        haloPositions[top * 3 + 1] = y + haloHalf;
        haloPositions[top * 3 + 2] = 0;
        haloPositions[bot * 3 + 0] = x;
        haloPositions[bot * 3 + 1] = y - haloHalf;
        haloPositions[bot * 3 + 2] = 0;
        haloColors[top * 3 + 0] = tmpColor.r * 0.6;
        haloColors[top * 3 + 1] = tmpColor.g * 0.6;
        haloColors[top * 3 + 2] = tmpColor.b * 0.6;
        haloColors[bot * 3 + 0] = tmpColor.r * 0.6;
        haloColors[bot * 3 + 1] = tmpColor.g * 0.6;
        haloColors[bot * 3 + 2] = tmpColor.b * 0.6;
      }

      state.mainGeo.attributes.position.needsUpdate = true;
      state.mainGeo.attributes.color.needsUpdate = true;
      state.haloGeo.attributes.position.needsUpdate = true;
      state.haloGeo.attributes.color.needsUpdate = true;
      state.haloMesh!.visible = doubleLine;

      // 中线
      const cArr = state.centerGeo.attributes.position.array as Float32Array;
      cArr[0] = -totalWidth / 2;
      cArr[1] = 0;
      cArr[2] = -0.005;
      cArr[3] = totalWidth / 2;
      cArr[4] = 0;
      cArr[5] = -0.005;
      state.centerGeo.attributes.position.needsUpdate = true;
      state.centerLine!.visible = showCenter;
    },

    dispose(ctx) {
      if (state.group) ctx.presetGroup.remove(state.group);
      state.mainGeo?.dispose();
      state.mainMat?.dispose();
      state.haloGeo?.dispose();
      state.haloMat?.dispose();
      state.centerGeo?.dispose();
      state.centerMat?.dispose();
      state.group = null;
      state.mainGeo = null;
      state.mainMat = null;
      state.mainMesh = null;
      state.haloGeo = null;
      state.haloMat = null;
      state.haloMesh = null;
      state.centerGeo = null;
      state.centerMat = null;
      state.centerLine = null;
    },
  };
}
