import { useAppStore } from '../store/app-store';
import { useT } from '../i18n';

export function BackgroundPicker() {
  const t = useT();
  const bgColor = useAppStore((s) => s.bgColor);
  const bgAlpha = useAppStore((s) => s.bgAlpha);
  const setBgColor = useAppStore((s) => s.setBgColor);
  const setBgAlpha = useAppStore((s) => s.setBgAlpha);

  return (
    <div className="field">
      <label>{t.background.label}</label>
      <div className="row">
        <input
          type="color"
          value={bgColor}
          onChange={(e) => setBgColor(e.target.value)}
          style={{
            width: 36,
            height: 24,
            padding: 0,
            border: '1px solid var(--border)',
            background: 'transparent',
            borderRadius: 4,
          }}
          disabled={bgAlpha === 0}
        />
        <label
          className="dim"
          style={{ display: 'flex', alignItems: 'center', gap: 6 }}
        >
          <input
            type="checkbox"
            checked={bgAlpha === 0}
            onChange={(e) => setBgAlpha(e.target.checked ? 0 : 1)}
          />
          {t.background.transparentLabel}
        </label>
      </div>
      <span className="dim" style={{ fontSize: 10 }}>
        {t.background.transparentHint}
      </span>
    </div>
  );
}
