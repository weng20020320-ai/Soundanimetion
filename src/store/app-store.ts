import { create } from 'zustand';
import { POSTFX_DEFAULTS, type PostFXParams } from '../render/PostFXChain';
import type { GpuInfo } from '../render/GpuTier';
import type { MediaKind } from '../audio/AudioEngine';

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
}));
