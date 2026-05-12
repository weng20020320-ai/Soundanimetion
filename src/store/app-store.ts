import { create } from 'zustand';
import { POSTFX_DEFAULTS, type PostFXParams } from '../render/PostFXChain';
import type { GpuInfo } from '../render/GpuTier';
import type { MediaKind } from '../audio/AudioEngine';

/**
 * 取景比例（决定相机视野和导出分辨率默认值）。
 * id 是 UI 上显示的字符串，ratio 是 width/height。
 * 排序按使用频率从高到低（横屏视频、竖屏短视频、方形、IG 竖屏）。
 */
export const ASPECT_OPTIONS = [
  { id: '16:9' as const, ratio: 16 / 9, defaultW: 1920, defaultH: 1080 },
  { id: '9:16' as const, ratio: 9 / 16, defaultW: 1080, defaultH: 1920 },
  { id: '1:1' as const,  ratio: 1,      defaultW: 1080, defaultH: 1080 },
  { id: '4:5' as const,  ratio: 4 / 5,  defaultW: 1080, defaultH: 1350 },
];

export type AspectId = (typeof ASPECT_OPTIONS)[number]['id'];

export function getAspectRatio(id: AspectId): number {
  return ASPECT_OPTIONS.find((a) => a.id === id)?.ratio ?? 16 / 9;
}

export function getAspectDefaultSize(id: AspectId): { w: number; h: number } {
  const o = ASPECT_OPTIONS.find((a) => a.id === id);
  return o ? { w: o.defaultW, h: o.defaultH } : { w: 1920, h: 1080 };
}

export const VIEW_SCALE_MIN = 0.5;
export const VIEW_SCALE_MAX = 2.0;
export const VIEW_SCALE_DEFAULT = 1.0;

export interface AppState {
  audioLoaded: boolean;
  audioFileName: string | null;
  audioFilePath: string | null;
  /** 当前加载的源类型；视频文件目前只取音轨用于可视化。 */
  audioKind: MediaKind;
  duration: number;
  currentTime: number;
  isPlaying: boolean;
  volume: number;

  activePresetId: string;
  presetParams: Record<string, Record<string, unknown>>;

  bgColor: string;
  bgAlpha: number;

  postFXParams: PostFXParams;

  /** 启动时一次性探测的 GPU 信息（null 表示尚未探测）。 */
  gpuInfo: GpuInfo | null;

  /** 取景比例。预览 + 导出共用，保证 WYSIWYG。 */
  targetAspectId: AspectId;
  /** 预览缩放（presetGroup.scale）。不影响导出像素分辨率。 */
  viewScale: number;

  setAudioMeta: (
    meta: Pick<
      AppState,
      | 'audioLoaded'
      | 'audioFileName'
      | 'audioFilePath'
      | 'audioKind'
      | 'duration'
    >
  ) => void;
  setTime: (t: number) => void;
  setPlaying: (p: boolean) => void;
  setVolume: (v: number) => void;

  setActivePreset: (id: string) => void;
  setPresetParam: (presetId: string, key: string, value: unknown) => void;
  setPresetParams: (presetId: string, params: Record<string, unknown>) => void;

  setBgColor: (hex: string) => void;
  setBgAlpha: (a: number) => void;

  setPostFXParam: <K extends keyof PostFXParams>(
    key: K,
    value: PostFXParams[K]
  ) => void;
  setPostFXParams: (params: Partial<PostFXParams>) => void;

  setGpuInfo: (info: GpuInfo) => void;

  setTargetAspectId: (id: AspectId) => void;
  setViewScale: (v: number) => void;
}

export const useAppStore = create<AppState>((set) => ({
  audioLoaded: false,
  audioFileName: null,
  audioFilePath: null,
  audioKind: 'audio',
  duration: 0,
  currentTime: 0,
  isPlaying: false,
  volume: 1,

  activePresetId: 'spectrum-bars',
  presetParams: {},

  bgColor: '#0b0d12',
  bgAlpha: 1,

  postFXParams: { ...POSTFX_DEFAULTS },

  gpuInfo: null,

  targetAspectId: '16:9',
  viewScale: VIEW_SCALE_DEFAULT,

  setAudioMeta: (meta) => set(meta),
  setTime: (t) => set({ currentTime: t }),
  setPlaying: (p) => set({ isPlaying: p }),
  setVolume: (v) => set({ volume: v }),

  setActivePreset: (id) => set({ activePresetId: id }),
  setPresetParam: (presetId, key, value) =>
    set((s) => ({
      presetParams: {
        ...s.presetParams,
        [presetId]: { ...(s.presetParams[presetId] || {}), [key]: value },
      },
    })),
  setPresetParams: (presetId, params) =>
    set((s) => ({
      presetParams: { ...s.presetParams, [presetId]: { ...params } },
    })),

  setBgColor: (hex) => set({ bgColor: hex }),
  setBgAlpha: (a) => set({ bgAlpha: a }),

  setPostFXParam: (key, value) =>
    set((s) => ({ postFXParams: { ...s.postFXParams, [key]: value } })),
  setPostFXParams: (params) =>
    set((s) => ({ postFXParams: { ...s.postFXParams, ...params } })),

  setGpuInfo: (info) => set({ gpuInfo: info }),

  setTargetAspectId: (id) => set({ targetAspectId: id }),
  setViewScale: (v) =>
    set({ viewScale: Math.min(VIEW_SCALE_MAX, Math.max(VIEW_SCALE_MIN, v)) }),
}));
