import { useMemo, useState } from 'react';
import {
  GRADIENT_PRESETS,
  type GradientValue,
  type GradientPresetMeta,
  cloneGradient,
  gradientToCss,
  gradientFromPreset,
} from '../visuals/GradientPresets';
import { useT } from '../i18n';
import type { Dictionary } from '../i18n';

export interface GradientPickerProps {
  label: string;
  value: GradientValue;
  onChange: (g: GradientValue) => void;
}

/** 渐变组键 → 翻译表 key 的映射（GRADIENT_PRESETS 里 group 字段是中文，UI 上要本地化）。 */
const GROUP_KEY: Record<
  GradientPresetMeta['group'],
  keyof Dictionary['gradient']['groups']
> = {
  雾系: 'mist',
  霓虹: 'neon',
  极光海洋: 'auroraOcean',
  暖色: 'warm',
  单色: 'mono',
  彩虹: 'rainbow',
};

/**
 * 渐变取色器：
 *  - 顶部：当前渐变色条，宽屏预览
 *  - 中部：按分组排列的预设色块（一行一个组），点选即应用
 *  - 底部：高级模式 — 起/中/终 三段颜色 + 旋转角度
 *
 * 给完全不懂色彩的用户：直接挑预设；
 * 给想微调的用户：在预设基础上改起/终颜色，或加中间停留点。
 */
export function GradientPicker({ label, value, onChange }: GradientPickerProps) {
  const t = useT();
  const [advanced, setAdvanced] = useState(false);

  const groups = useMemo(() => {
    const out: Record<string, GradientPresetMeta[]> = {};
    for (const p of GRADIENT_PRESETS) {
      (out[p.group] ||= []).push(p);
    }
    return out;
  }, []);

  function applyPreset(p: GradientPresetMeta) {
    onChange({
      presetId: p.id,
      stops: p.stops.map((s) => ({ ...s })),
      rotation: value.rotation ?? 0,
    });
  }

  function setStopColor(idx: number, color: string) {
    const next = cloneGradient(value);
    if (!next.stops[idx]) return;
    next.stops[idx].color = color;
    next.presetId = undefined;
    onChange(next);
  }

  function setRotation(deg: number) {
    onChange({ ...cloneGradient(value), rotation: deg });
  }

  function ensureMiddleStop(): GradientValue {
    const next = cloneGradient(value);
    if (next.stops.length < 3) {
      const a = next.stops[0];
      const b = next.stops[next.stops.length - 1];
      next.stops = [
        { ...a, t: 0 },
        { color: blendHex(a.color, b.color, 0.5), t: 0.5 },
        { ...b, t: 1 },
      ];
    }
    next.presetId = undefined;
    return next;
  }

  function toggleMiddleStop() {
    if (value.stops.length >= 3) {
      const next = cloneGradient(value);
      next.stops = [next.stops[0], next.stops[next.stops.length - 1]];
      next.stops[0].t = 0;
      next.stops[1].t = 1;
      next.presetId = undefined;
      onChange(next);
    } else {
      onChange(ensureMiddleStop());
    }
  }

  const startStop = value.stops[0];
  const middleStop =
    value.stops.length >= 3 ? value.stops[Math.floor(value.stops.length / 2)] : null;
  const endStop = value.stops[value.stops.length - 1];

  const presetMeta = value.presetId
    ? GRADIENT_PRESETS.find((p) => p.id === value.presetId)
    : undefined;
  const presetMetaName = presetMeta
    ? t.gradient.presets[presetMeta.id] ?? presetMeta.name
    : undefined;

  return (
    <div className="gradient-picker">
      <div className="gp-header">
        <span className="gp-label">{label}</span>
        <span className="gp-current">{presetMetaName ?? t.gradient.custom}</span>
        <button
          type="button"
          className="gp-toggle"
          onClick={() => setAdvanced((v) => !v)}
        >
          {advanced ? t.gradient.collapse : t.gradient.advanced}
        </button>
      </div>

      <div
        className="gp-strip"
        style={{ background: gradientToCss(value) }}
        title={value.stops.map((s) => s.color).join(' → ')}
      />

      {Object.entries(groups).map(([groupName, items]) => (
        <div key={groupName} className="gp-group">
          <div className="gp-group-name">
            {t.gradient.groups[GROUP_KEY[groupName as GradientPresetMeta['group']]] ??
              groupName}
          </div>
          <div className="gp-chips">
            {items.map((p) => {
              const active = value.presetId === p.id;
              const localizedName = t.gradient.presets[p.id] ?? p.name;
              return (
                <button
                  key={p.id}
                  type="button"
                  className={'gp-chip' + (active ? ' active' : '')}
                  onClick={() => applyPreset(p)}
                  title={localizedName}
                  style={{
                    background: gradientToCss({
                      stops: p.stops,
                      rotation: 90,
                    }),
                  }}
                >
                  <span className="gp-chip-name">{localizedName}</span>
                </button>
              );
            })}
          </div>
        </div>
      ))}

      {advanced && (
        <div className="gp-advanced">
          <div className="gp-row">
            <label>{t.gradient.start}</label>
            <input
              type="color"
              value={startStop?.color ?? '#000000'}
              onChange={(e) => setStopColor(0, e.target.value)}
            />
            <span className="gp-hex">{startStop?.color}</span>
          </div>

          <div className="gp-row">
            <label>{t.gradient.middle}</label>
            {middleStop ? (
              <>
                <input
                  type="color"
                  value={middleStop.color}
                  onChange={(e) =>
                    setStopColor(
                      Math.floor(value.stops.length / 2),
                      e.target.value
                    )
                  }
                />
                <span className="gp-hex">{middleStop.color}</span>
                <button type="button" onClick={toggleMiddleStop}>
                  {t.gradient.removeMiddle}
                </button>
              </>
            ) : (
              <button type="button" onClick={toggleMiddleStop}>
                {t.gradient.addMiddle}
              </button>
            )}
          </div>

          <div className="gp-row">
            <label>{t.gradient.end}</label>
            <input
              type="color"
              value={endStop?.color ?? '#ffffff'}
              onChange={(e) =>
                setStopColor(value.stops.length - 1, e.target.value)
              }
            />
            <span className="gp-hex">{endStop?.color}</span>
          </div>

          <div className="gp-row">
            <label>{t.gradient.angle(value.rotation ?? 0)}</label>
            <input
              type="range"
              min={0}
              max={360}
              step={5}
              value={value.rotation ?? 0}
              onChange={(e) => setRotation(Number(e.target.value))}
            />
            <button
              type="button"
              onClick={() => setRotation(0)}
              title={t.gradient.horizontalTitle}
            >
              ⇆
            </button>
            <button
              type="button"
              onClick={() => setRotation(90)}
              title={t.gradient.verticalTitle}
            >
              ⇅
            </button>
          </div>

          <div className="gp-row">
            <button
              type="button"
              onClick={() =>
                onChange(gradientFromPreset('midnight-violet', 0))
              }
            >
              {t.gradient.reset}
            </button>
          </div>
        </div>
      )}
    </div>
  );
}

function blendHex(a: string, b: string, k: number): string {
  const ca = hexToRgb(a);
  const cb = hexToRgb(b);
  const r = Math.round(ca[0] * (1 - k) + cb[0] * k);
  const g = Math.round(ca[1] * (1 - k) + cb[1] * k);
  const bl = Math.round(ca[2] * (1 - k) + cb[2] * k);
  return rgbToHex(r, g, bl);
}

function hexToRgb(s: string): [number, number, number] {
  const m = s.replace('#', '');
  const r = parseInt(m.length === 3 ? m[0] + m[0] : m.slice(0, 2), 16) || 0;
  const g = parseInt(m.length === 3 ? m[1] + m[1] : m.slice(2, 4), 16) || 0;
  const b = parseInt(m.length === 3 ? m[2] + m[2] : m.slice(4, 6), 16) || 0;
  return [r, g, b];
}

function rgbToHex(r: number, g: number, b: number): string {
  const h = (n: number) => Math.max(0, Math.min(255, n)).toString(16).padStart(2, '0');
  return '#' + h(r) + h(g) + h(b);
}
