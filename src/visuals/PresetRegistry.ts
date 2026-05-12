import type { VisualPreset } from './VisualPreset';
import { createSpectrumBarsPreset } from './presets/spectrum-bars';
import { createParticlesBurstPreset } from './presets/particles-burst';
import { createShaderFlowPreset } from './presets/shader-flow';
import {
  createAudioWormhole,
  createPlasmaPulse,
  createNeonGrid,
  createLiquidMercury,
  createSpectralTunnel,
} from './presets/shadertoy-presets';
import { createGPUParticlesPreset } from './presets/gpu-particles';
import { createRadialSpectrumPreset } from './presets/radial-spectrum';
import { createCircleBurstPreset } from './presets/circle-burst';
import { createAreaSpectrumPreset } from './presets/area-spectrum';
import { createWaveLinePreset } from './presets/wave-line';
import { createInversionPreset } from './presets/inversion';
import { createPianoRainPreset } from './presets/piano-rain';
import { createDriftingSpiritsPreset } from './presets/drifting-spirits';

type PresetFactory = () => VisualPreset;

const factories: Record<string, PresetFactory> = {
  // 频谱类
  'spectrum-bars': createSpectrumBarsPreset,
  'radial-spectrum': createRadialSpectrumPreset,
  'area-spectrum': createAreaSpectrumPreset,
  'wave-line': createWaveLinePreset,
  // 粒子 / 节拍
  'particles-burst': createParticlesBurstPreset,
  'circle-burst': createCircleBurstPreset,
  'gpu-particles': createGPUParticlesPreset,
  // 着色器
  'shader-flow': createShaderFlowPreset,
  'st-wormhole': createAudioWormhole,
  'st-plasma': createPlasmaPulse,
  'st-neon-grid': createNeonGrid,
  'st-mercury': createLiquidMercury,
  'st-kaleido': createSpectralTunnel,
  // 实验 / 极简
  'inversion': createInversionPreset,
  // 节奏游戏风
  'piano-rain': createPianoRainPreset,
  'drifting-spirits': createDriftingSpiritsPreset,
};

/**
 * "氛围"维度。和 category（按技术实现分）正交：UI 默认按 mood 分组展示，
 * 让用户从"我想要什么感觉的画面"出发选 preset，而不是从"频谱还是粒子"出发。
 */
export type PresetMood =
  | 'energetic' // 高能/节奏强 — 电子 / 嘻哈 / 摇滚 / 流行
  | 'ambient'   // 氛围沉浸 — 环境 / lofi / 钢琴 / post-rock
  | 'abstract'  // 抽象艺术 — 实验 / 爵士 / 古典
  | 'minimal'   // 极简风格 — minimal techno / 数学美感 / Steve Reich 风
  | 'retro'     // 复古怀旧 — synthwave / vaporwave / 8bit
  | 'organic';  // 有机自然 — folk / acoustic / dark ambient

/** 音乐标签 key（i18n 表里查 label）。每个 preset 挂 1-3 个最贴合的。 */
export type MusicTag =
  | 'electronic' | 'pop' | 'hiphop' | 'rock' | 'jazz' | 'classical' | 'piano'
  | 'lofi' | 'ambient' | 'chillout' | 'techno' | 'house'
  | 'synthwave' | 'vaporwave' | 'experimental' | 'dark-ambient' | 'drone'
  | 'post-rock' | 'dnb' | 'dubstep' | 'cinematic' | 'psychedelic' | '8bit';

export interface PresetMeta {
  id: string;
  /** 不带翻译的 fallback 名称（i18n 命中时会被覆盖）。 */
  name: string;
  /** 技术分类：spectrum / particles / shader（保留用于参数面板等场景）。 */
  category: string;
  /** 氛围分类：UI 主分组维度。 */
  mood: PresetMood;
  /** 推荐的音乐类型（按贴合度从高到低排，最多 3 个）。 */
  musicTags: MusicTag[];
}

const metaList: PresetMeta[] = [
  // 频谱类（视频常用）
  { id: 'spectrum-bars',   name: '镜像频谱条',         category: 'spectrum',
    mood: 'energetic', musicTags: ['electronic', 'pop', 'hiphop'] },
  { id: 'radial-spectrum', name: '圆环频谱',           category: 'spectrum',
    mood: 'energetic', musicTags: ['techno', 'house', 'electronic'] },
  { id: 'area-spectrum',   name: '填充频谱区域',       category: 'spectrum',
    mood: 'ambient',   musicTags: ['classical', 'piano', 'ambient'] },
  { id: 'wave-line',       name: '流光波形线',         category: 'spectrum',
    mood: 'minimal',   musicTags: ['jazz', 'ambient', 'lofi'] },
  // 粒子 / 节拍
  { id: 'circle-burst',    name: '节拍冲击环',         category: 'particles',
    mood: 'energetic', musicTags: ['dnb', 'dubstep', 'electronic'] },
  { id: 'particles-burst', name: '节拍粒子爆发',       category: 'particles',
    mood: 'energetic', musicTags: ['pop', 'rock', 'electronic'] },
  { id: 'gpu-particles',   name: 'GPU 粒子场（百万级）', category: 'particles',
    mood: 'ambient',   musicTags: ['ambient', 'post-rock', 'experimental'] },
  // 着色器
  { id: 'shader-flow',     name: '频谱流体',           category: 'shader',
    mood: 'abstract',  musicTags: ['experimental', 'jazz', 'chillout'] },
  { id: 'st-wormhole',     name: '虫洞 · 频谱驱动',    category: 'shader',
    mood: 'retro',     musicTags: ['synthwave', 'electronic', 'cinematic'] },
  { id: 'st-plasma',       name: 'Plasma · 节拍脉冲',  category: 'shader',
    mood: 'retro',     musicTags: ['techno', 'synthwave', 'house'] },
  { id: 'st-neon-grid',    name: 'Neon Grid · 80s',    category: 'shader',
    mood: 'retro',     musicTags: ['synthwave', 'vaporwave', '8bit'] },
  { id: 'st-mercury',      name: '液态金属',           category: 'shader',
    mood: 'abstract',  musicTags: ['ambient', 'jazz', 'experimental'] },
  { id: 'st-kaleido',      name: '万花筒 · 频谱',      category: 'shader',
    mood: 'abstract',  musicTags: ['psychedelic', 'experimental', 'electronic'] },
  // 实验 / 极简
  { id: 'inversion',       name: '反相栅格',           category: 'shader',
    mood: 'minimal',   musicTags: ['techno', 'experimental', 'classical'] },
  // 节奏游戏风
  { id: 'piano-rain',      name: '下落音符 · Piano Rain', category: 'shader',
    mood: 'ambient',   musicTags: ['piano', 'classical', 'ambient'] },
  { id: 'drifting-spirits', name: '飘散灵气 · Drifting Spirits', category: 'particles',
    mood: 'ambient',   musicTags: ['piano', 'ambient', 'lofi'] },
];

export function listPresets(): PresetMeta[] {
  return metaList;
}

export function createPreset(id: string): VisualPreset {
  const factory = factories[id];
  if (!factory) throw new Error(`未知预设：${id}`);
  return factory();
}
