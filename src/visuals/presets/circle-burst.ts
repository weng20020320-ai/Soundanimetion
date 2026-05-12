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
 * 节拍冲击环：每次检测到 beat 时释放一圈细圆环，
 * 圆环以恒定速度向外扩散并淡出，多圈可以叠加。
 * 中心可以再附一个随 RMS 缩放的核心圆。
 */

const schema: ParamSchema = {
  maxRings: {
    type: 'int',
    label: '同时存活环数',
    min: 4,
    max: 64,
    step: 1,
    default: 24,
    structural: true,
  },
  expandSpeed: {
    type: 'float',
    label: '扩散速度',
    min: 0.5,
    max: 12,
    step: 0.1,
    default: 4.0,
  },
  ringWidth: {
    type: 'float',
    label: '环宽',
    min: 0.005,
    max: 0.2,
    step: 0.005,
    default: 0.04,
  },
  fadeRate: {
    type: 'float',
    label: '淡出速度',
    min: 0.2,
    max: 4,
    step: 0.05,
    default: 1.2,
  },
  bassTrigger: {
    type: 'float',
    label: '低频触发阈值',
    min: 0,
    max: 1,
    step: 0.01,
    default: 0.45,
  },
  triggerCooldownMs: {
    type: 'float',
    label: '触发冷却（毫秒）',
    min: 30,
    max: 600,
    step: 10,
    default: 110,
  },
  coreEnabled: {
    type: 'bool',
    label: '显示中心核心',
    default: true,
  },
  coreScale: {
    type: 'float',
    label: '核心大小',
    min: 0.05,
    max: 1.5,
    step: 0.01,
    default: 0.4,
  },
  gradient: {
    type: 'gradient',
    label: '颜色',
    default: defaultGradient(),
  },
  colorMode: {
    type: 'select',
    label: '渐变映射',
    default: 'lifetime',
    options: [
      { label: '按生命（新→老）', value: 'lifetime' },
      { label: '按半径（小→大）', value: 'radius' },
      { label: '随机', value: 'random' },
    ],
  },
};

interface RingState {
  alive: boolean;
  age: number;       // 0..lifetime
  lifetime: number;
  birthRand: number; // 0..1
}

interface PresetState {
  group: THREE.Group | null;
  rings: THREE.Mesh[];
  ringStates: RingState[];
  ringGeo: THREE.RingGeometry | null;
  ringMats: THREE.MeshBasicMaterial[];
  core: THREE.Mesh | null;
  coreGeo: THREE.CircleGeometry | null;
  coreMat: THREE.MeshBasicMaterial | null;
  rmsSmoothed: number;
  lastTriggerAt: number;
}

export function createCircleBurstPreset(): VisualPreset {
  const state: PresetState = {
    group: null,
    rings: [],
    ringStates: [],
    ringGeo: null,
    ringMats: [],
    core: null,
    coreGeo: null,
    coreMat: null,
    rmsSmoothed: 0,
    lastTriggerAt: -Infinity,
  };
  const tmpColor = new THREE.Color();

  function rebuild(ctx: ThreeContext, count: number) {
    if (state.group) {
      ctx.presetGroup.remove(state.group);
      for (const m of state.ringMats) m.dispose();
      state.ringGeo?.dispose();
      state.coreGeo?.dispose();
      state.coreMat?.dispose();
      state.rings = [];
      state.ringMats = [];
    }
    const group = new THREE.Group();
    state.ringGeo = new THREE.RingGeometry(0.99, 1.0, 96);
    for (let i = 0; i < count; i++) {
      const mat = new THREE.MeshBasicMaterial({
        color: 0xffffff,
        transparent: true,
        opacity: 0,
        side: THREE.DoubleSide,
      });
      const m = new THREE.Mesh(state.ringGeo, mat);
      m.frustumCulled = false;
      m.visible = false;
      group.add(m);
      state.rings.push(m);
      state.ringMats.push(mat);
      state.ringStates.push({ alive: false, age: 0, lifetime: 1, birthRand: 0 });
    }

    state.coreGeo = new THREE.CircleGeometry(1, 64);
    state.coreMat = new THREE.MeshBasicMaterial({
      color: 0xffffff,
      transparent: true,
      opacity: 0.6,
    });
    state.core = new THREE.Mesh(state.coreGeo, state.coreMat);
    group.add(state.core);

    ctx.presetGroup.add(group);
    state.group = group;
  }

  function spawnRing(now: number) {
    for (let i = 0; i < state.rings.length; i++) {
      const st = state.ringStates[i];
      if (!st.alive) {
        st.alive = true;
        st.age = 0;
        st.lifetime = 0.9 + Math.random() * 0.6;
        st.birthRand = Math.random();
        state.rings[i].visible = true;
        return;
      }
    }
    // 全部存活时：替换最老的
    let oldestIdx = 0;
    let oldestAge = 0;
    for (let i = 0; i < state.ringStates.length; i++) {
      if (state.ringStates[i].age > oldestAge) {
        oldestAge = state.ringStates[i].age;
        oldestIdx = i;
      }
    }
    const st = state.ringStates[oldestIdx];
    st.alive = true;
    st.age = 0;
    st.lifetime = 0.9 + Math.random() * 0.6;
    st.birthRand = Math.random();
    state.rings[oldestIdx].visible = true;
    void now;
  }

  return {
    id: 'circle-burst',
    name: '节拍冲击环',
    category: 'particles',
    paramSchema: schema,

    init(ctx, params) {
      rebuild(ctx, (params.maxRings as number) ?? 24);
    },

    update(features: AudioFeatures, params, dt) {
      if (!state.group) return;

      const expandSpeed = params.expandSpeed as number;
      const ringWidth = params.ringWidth as number;
      const fadeRate = params.fadeRate as number;
      const bassTrigger = params.bassTrigger as number;
      const triggerCooldownMs = params.triggerCooldownMs as number;
      const coreEnabled = params.coreEnabled as boolean;
      const coreScale = params.coreScale as number;
      const gradient = params.gradient as GradientValue;
      const colorMode =
        (params.colorMode as 'lifetime' | 'radius' | 'random') ?? 'lifetime';

      const now = performance.now();
      const sinceLast = now - state.lastTriggerAt;
      const bass = features.bands.bass;
      const shouldTrigger =
        (features.beat || bass > bassTrigger) && sinceLast > triggerCooldownMs;
      if (shouldTrigger) {
        spawnRing(now);
        state.lastTriggerAt = now;
      }

      // RMS 平滑
      state.rmsSmoothed = state.rmsSmoothed * 0.85 + features.rms * 0.15;

      // 更新 rings
      for (let i = 0; i < state.rings.length; i++) {
        const st = state.ringStates[i];
        const m = state.rings[i];
        const mat = state.ringMats[i];
        if (!st.alive) {
          m.visible = false;
          continue;
        }
        st.age += dt;
        const lifeT = Math.min(1, st.age / st.lifetime);
        if (lifeT >= 1) {
          st.alive = false;
          m.visible = false;
          continue;
        }
        const r = lifeT * expandSpeed;
        const w = ringWidth * (1 + lifeT * 1.2);
        m.scale.set(r, r, 1);
        // 通过更新 RingGeometry 太重，改用宽度模拟：把 RingGeometry 当成单位环然后用 mesh.material 的渐变 alpha
        // 简化：直接调整 scale 的 z，做成「径向厚度」由 ringWidth 表达
        // 由于 RingGeometry 是平面环，无法仅靠 scale 控制厚度，这里通过淡出 + 多圈叠加营造光晕。
        const alpha =
          (1 - Math.pow(lifeT, 1.4)) *
          Math.exp(-lifeT * fadeRate) *
          (0.5 + state.rmsSmoothed * 0.7);
        mat.opacity = Math.max(0, Math.min(1, alpha));

        let tColor: number;
        if (colorMode === 'lifetime') tColor = lifeT;
        else if (colorMode === 'radius')
          tColor = Math.min(1, r / Math.max(0.5, expandSpeed));
        else tColor = st.birthRand;
        sampleGradient(gradient, tColor, tmpColor);
        mat.color.copy(tmpColor);
        void w;
      }

      // 核心
      if (state.core && state.coreMat) {
        state.core.visible = coreEnabled;
        if (coreEnabled) {
          const s = coreScale * (0.6 + state.rmsSmoothed * 1.2);
          state.core.scale.setScalar(s);
          sampleGradient(gradient, 0, tmpColor);
          state.coreMat.color.copy(tmpColor);
          state.coreMat.opacity = 0.4 + state.rmsSmoothed * 0.5;
        }
      }
    },

    dispose(ctx) {
      if (state.group) ctx.presetGroup.remove(state.group);
      for (const m of state.ringMats) m.dispose();
      state.ringGeo?.dispose();
      state.coreGeo?.dispose();
      state.coreMat?.dispose();
      state.rings = [];
      state.ringMats = [];
      state.group = null;
      state.core = null;
    },
  };
}
