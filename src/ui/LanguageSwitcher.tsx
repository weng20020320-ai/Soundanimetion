import { LOCALES, useLocale, useT } from '../i18n';

/** 顶栏右侧的小型语言切换下拉。 */
export function LanguageSwitcher() {
  const { locale, setLocale } = useLocale();
  const t = useT();
  return (
    <label
      style={{ display: 'inline-flex', alignItems: 'center', gap: 6 }}
      title={t.language.label}
    >
      <span aria-hidden style={{ fontSize: 14 }}>
        🌐
      </span>
      <select
        value={locale}
        onChange={(e) => setLocale(e.target.value as typeof locale)}
        style={{ padding: '3px 6px', fontSize: 12 }}
      >
        {LOCALES.map((l) => (
          <option key={l.id} value={l.id}>
            {l.nativeLabel}
          </option>
        ))}
      </select>
    </label>
  );
}
