import { useEffect, useMemo, useRef } from 'react';
import { Pane } from 'tweakpane';
import type { ParamSchema, ParamDef } from '../visuals/ParamSchema';
import type { GradientValue } from '../visuals/GradientPresets';
import { GradientPicker } from './GradientPicker';
import { useT, useI18nStore } from '../i18n';
import type { Dictionary } from '../i18n';

export interface ParameterPanelProps {
  presetId: string;
  schema: ParamSchema;
  values: Record<string, unknown>;
  onChange: (key: string, value: unknown, structural: boolean) => void;
}

/**
 * 根据预设的 paramSchema 自动生成 Tweakpane 控件。
 * presetId 切换时整个面板重建。
 */
export function ParameterPanel({
  presetId,
  schema,
  values,
  onChange,
}: ParameterPanelProps) {
  const paneContainerRef = useRef<HTMLDivElement>(null);
  const t = useT();
  // 语言变化时重建 Tweakpane（labels 是构造时传入的字符串，没有 reactive 通道）。
  const locale = useI18nStore((s) => s.locale);

  // 把 schema 拆成「Tweakpane 能处理的标量参数」和「需要自定义 React 控件的参数（gradient）」。
  const { paneEntries, gradientEntries } = useMemo(() => {
    const pane: [string, ParamDef][] = [];
    const grad: [string, ParamDef][] = [];
    for (const [key, def] of Object.entries(schema)) {
      if (def.type === 'gradient') grad.push([key, def]);
      else pane.push([key, def]);
    }
    return { paneEntries: pane, gradientEntries: grad };
  }, [schema]);

  useEffect(() => {
    if (!paneContainerRef.current) return;
    const pane = new Pane({
      container: paneContainerRef.current,
      title: t.parameterPanel.paneTitle,
    });

    const proxy: Record<string, unknown> = { ...values };
    // 在绑定之前用 schema 默认值兜底缺失/类型不匹配的键，
    // 否则 Tweakpane v4 的 addBinding 会因为 target[key]=undefined 直接抛错，整个面板就空了。
    for (const [key, def] of paneEntries) {
      const v = proxy[key];
      if (!isCompatibleValue(def, v)) {
        proxy[key] = (def as { default: unknown }).default;
      }
    }

    for (const [key, def] of paneEntries) {
      try {
        addBinding(pane, proxy, key, def, (value) => {
          onChange(key, value, !!def.structural);
        }, presetId, t);
      } catch (e) {
        console.error(
          '[ParameterPanel] addBinding 失败 key=%s def=%o value=%o err=%o',
          key,
          def,
          proxy[key],
          e
        );
      }
    }

    return () => {
      try {
        pane.dispose();
      } catch {
        /* ignore */
      }
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [presetId, paneEntries, locale]);

  return (
    <div className="param-pane">
      {gradientEntries.map(([key, def]) => (
        <GradientPicker
          key={key}
          label={resolveLabel(t, presetId, key, def)}
          value={(values[key] as GradientValue) ?? (def as { default: GradientValue }).default}
          onChange={(g) => onChange(key, g, !!def.structural)}
        />
      ))}
      <div ref={paneContainerRef} />
    </div>
  );
}

/**
 * 解析 label：先查 i18n 翻译表（presetParamLabels[presetId][key]），
 * 命中走翻译；否则回退到预设源码里的 inline label，再回退到 key 本身。
 *
 * 这样允许 zh-CN 走源码内 label（保持现状），ja-JP / en-US 走翻译表。
 */
function resolveLabel(
  t: Dictionary,
  presetId: string,
  key: string,
  def: ParamDef
): string {
  return t.presetParamLabels[presetId]?.[key] ?? def.label ?? key;
}

/** 同样的 fallback 逻辑用于 select 的 option labels。 */
function resolveOptionLabel(
  t: Dictionary,
  presetId: string,
  key: string,
  optValue: string | number,
  fallback: string
): string {
  return (
    t.presetParamOptions[presetId]?.[key]?.[String(optValue)] ?? fallback
  );
}

function isCompatibleValue(def: ParamDef, v: unknown): boolean {
  if (v === undefined || v === null) return false;
  switch (def.type) {
    case 'float':
    case 'int':
      return typeof v === 'number' && Number.isFinite(v);
    case 'bool':
      return typeof v === 'boolean';
    case 'color':
      return typeof v === 'string';
    case 'select':
      return typeof v === 'string' || typeof v === 'number';
    case 'gradient':
      return typeof v === 'object';
  }
}

function addBinding(
  pane: Pane,
  proxy: Record<string, unknown>,
  key: string,
  def: ParamDef,
  onValue: (v: unknown) => void,
  presetId: string,
  t: Dictionary
) {
  const label = resolveLabel(t, presetId, key, def);
  switch (def.type) {
    case 'float': {
      const binding = pane.addBinding(proxy, key, {
        label,
        min: def.min,
        max: def.max,
        step: def.step ?? (def.max - def.min) / 200,
      });
      binding.on('change', (e) => onValue(e.value));
      break;
    }
    case 'int': {
      const binding = pane.addBinding(proxy, key, {
        label,
        min: def.min,
        max: def.max,
        step: def.step ?? 1,
      });
      binding.on('change', (e) => onValue(Math.round(Number(e.value))));
      break;
    }
    case 'bool': {
      const binding = pane.addBinding(proxy, key, {
        label,
      });
      binding.on('change', (e) => onValue(!!e.value));
      break;
    }
    case 'color': {
      const binding = pane.addBinding(proxy, key, {
        label,
        view: 'color',
      });
      binding.on('change', (e) => onValue(String(e.value)));
      break;
    }
    case 'select': {
      const optMap: Record<string, string | number> = {};
      for (const opt of def.options) {
        const optLabel = resolveOptionLabel(t, presetId, key, opt.value, opt.label);
        optMap[optLabel] = opt.value;
      }
      const binding = pane.addBinding(proxy, key, {
        label,
        options: optMap,
      });
      binding.on('change', (e) => onValue(e.value));
      break;
    }
  }
}
