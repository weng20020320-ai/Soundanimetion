import type { ThreeContext } from '../render/ThreeContext';
import type { AudioFeatures } from '../audio/types';
import type { ParamSchema } from './ParamSchema';

export type PresetCategory = 'spectrum' | 'particles' | 'shader';

export interface VisualPreset {
  readonly id: string;
  readonly name: string;
  readonly category: PresetCategory;
  readonly paramSchema: ParamSchema;

  /** 创建对象、挂到 ctx.presetGroup。可读 params 初始化。 */
  init(ctx: ThreeContext, params: Record<string, unknown>): void;

  /** 每帧调用，根据特征驱动几何/材质/uniform。 */
  update(features: AudioFeatures, params: Record<string, unknown>, dt: number): void;

  /** 释放资源。ctx.clearPreset 会处理 group children，这里处理预设私有的额外资源。 */
  dispose(ctx: ThreeContext): void;
}
