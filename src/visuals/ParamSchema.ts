import type { GradientValue } from './GradientPresets';

interface CommonProps {
  label?: string;
  /** 标记为 true 时，参数变化会触发预设完全 reinit（适用于会改变 GPU buffer 大小等结构性参数）。 */
  structural?: boolean;
}

export type ParamDef =
  | (CommonProps & {
      type: 'float';
      min: number;
      max: number;
      step?: number;
      default: number;
    })
  | (CommonProps & {
      type: 'int';
      min: number;
      max: number;
      step?: number;
      default: number;
    })
  | (CommonProps & {
      type: 'bool';
      default: boolean;
    })
  | (CommonProps & {
      type: 'color';
      default: string;
    })
  | (CommonProps & {
      type: 'select';
      options: { label: string; value: string | number }[];
      default: string | number;
    })
  | (CommonProps & {
      type: 'gradient';
      default: GradientValue;
    });

export type ParamSchema = Record<string, ParamDef>;

export function defaultParamsFromSchema(
  schema: ParamSchema
): Record<string, unknown> {
  const out: Record<string, unknown> = {};
  for (const [k, def] of Object.entries(schema)) out[k] = def.default;
  return out;
}

/** 把存储中的参数与 schema 默认值合并，缺失字段填默认。 */
export function mergeWithDefaults(
  schema: ParamSchema,
  stored: Record<string, unknown> | undefined
): Record<string, unknown> {
  const defaults = defaultParamsFromSchema(schema);
  if (!stored) return defaults;
  return { ...defaults, ...stored };
}
