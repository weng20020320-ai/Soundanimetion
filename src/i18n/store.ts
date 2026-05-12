import { create } from 'zustand';
import type { Dictionary, Locale } from './types';
import { LOCALES } from './types';
import { zhCN } from './locales/zh-CN';
import { jaJP } from './locales/ja-JP';
import { enUS } from './locales/en-US';

const DICTS: Record<Locale, Dictionary> = {
  'zh-CN': zhCN,
  'ja-JP': jaJP,
  'en-US': enUS,
};

const STORAGE_KEY = 'av.locale';

function detectInitialLocale(): Locale {
  try {
    const stored = localStorage.getItem(STORAGE_KEY) as Locale | null;
    if (stored && DICTS[stored]) return stored;
  } catch {
    /* ignore: SSR / Electron sandbox */
  }
  // 按浏览器/系统语言自动选择，未匹配走中文。
  const langs = navigator.languages?.length ? navigator.languages : [navigator.language];
  for (const raw of langs) {
    if (!raw) continue;
    const lc = raw.toLowerCase();
    if (lc.startsWith('zh')) return 'zh-CN';
    if (lc.startsWith('ja')) return 'ja-JP';
    if (lc.startsWith('en')) return 'en-US';
  }
  return 'zh-CN';
}

interface I18nStore {
  locale: Locale;
  dict: Dictionary;
  setLocale: (l: Locale) => void;
}

export const useI18nStore = create<I18nStore>((set) => {
  const initial = detectInitialLocale();
  return {
    locale: initial,
    dict: DICTS[initial],
    setLocale: (l) => {
      try {
        localStorage.setItem(STORAGE_KEY, l);
      } catch {
        /* ignore */
      }
      set({ locale: l, dict: DICTS[l] });
      // 通知主进程同步对话框文案的当前语言。
      // 渲染进程的 onLocaleChange 监听器（如 ParameterPanel）也会被 store 自动唤起。
      try {
        void window.api?.setLocale?.(l);
      } catch {
        /* ignore */
      }
      try {
        document.documentElement.setAttribute('lang', l);
      } catch {
        /* ignore */
      }
    },
  };
});

/** 渲染组件读字典：返回类型完整的 Dictionary。 */
export function useT(): Dictionary {
  return useI18nStore((s) => s.dict);
}

/** 当前语言代号 + 切换函数。
 *
 * 实现注意：必须用两个原子选择器，绝对不能写成
 *   useI18nStore((s) => ({ locale: s.locale, setLocale: s.setLocale }))
 * 那样选择器每次返回新对象引用，React 19 的 useSyncExternalStore
 * 用 Object.is 比快照会判定为"快照永远变了" → 无限重渲染 →
 * "Maximum update depth exceeded" 黑屏崩溃。 */
export function useLocale(): {
  locale: Locale;
  setLocale: (l: Locale) => void;
} {
  const locale = useI18nStore((s) => s.locale);
  const setLocale = useI18nStore((s) => s.setLocale);
  return { locale, setLocale };
}

/** 在非 hook 上下文（例如类成员、IPC handler 内）拿到当前字典。 */
export function getDict(): Dictionary {
  return useI18nStore.getState().dict;
}

export { LOCALES };
export type { Locale, Dictionary };
