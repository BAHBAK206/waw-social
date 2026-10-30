import AsyncStorage from '@react-native-async-storage/async-storage';
import { DEFAULT_APPEARANCE, DESIGNS, LANGUAGES, READING_FONTS, SKINS, TEXT_SIZES, THEME_MODES, type Appearance } from '@qubedu/shared';
import { detectLocale } from '@qubedu/i18n';
import { getLocales } from 'expo-localization';
import { I18nManager } from 'react-native';
import { create } from 'zustand';

const KEY = 'qubedu.appearance';

function sanitize(raw: unknown): Partial<Appearance> {
  if (!raw || typeof raw !== 'object') return {};
  const r = raw as Record<string, unknown>;
  const out: Partial<Appearance> = {};
  if (THEME_MODES.includes(r.theme as never)) out.theme = r.theme as Appearance['theme'];
  if (DESIGNS.includes(r.design as never)) out.design = r.design as Appearance['design'];
  if (SKINS.includes(r.skin as never)) out.skin = r.skin as Appearance['skin'];
  if (LANGUAGES.includes(r.language as never)) out.language = r.language as Appearance['language'];
  if (TEXT_SIZES.includes(r.textSize as never)) out.textSize = r.textSize as Appearance['textSize'];
  if (typeof r.reduceMotion === 'boolean') out.reduceMotion = r.reduceMotion;
  if (typeof r.highContrast === 'boolean') out.highContrast = r.highContrast;
  if (typeof r.dataSaver === 'boolean') out.dataSaver = r.dataSaver;
  if (READING_FONTS.includes(r.readingFont as never)) out.readingFont = r.readingFont as Appearance['readingFont'];
  return out;
}

interface AppearanceState {
  appearance: Appearance;
  ready: boolean;
  update: (patch: Partial<Appearance>) => void;
  replace: (a: Appearance) => void;
  hydrate: () => Promise<void>;
}

type Listener = (patch: Partial<Appearance>) => void;
const listeners = new Set<Listener>();
export function onAppearanceChange(fn: Listener) {
  listeners.add(fn);
  return () => listeners.delete(fn);
}

/** RTL needs a native reload to take effect; the caller shows a hint when this returns true. */
export function syncDirection(language: Appearance['language']): boolean {
  const rtl = language === 'ar';
  I18nManager.allowRTL(rtl);
  if (I18nManager.isRTL !== rtl) {
    I18nManager.forceRTL(rtl);
    return true;
  }
  return false;
}

export const useAppearance = create<AppearanceState>((set, get) => ({
  appearance: {
    ...DEFAULT_APPEARANCE,
    language: detectLocale(
      getLocales().map((l) => l.languageTag),
      DEFAULT_APPEARANCE.language,
    ),
  },
  ready: false,
  update: (patch) => {
    const next = { ...get().appearance, ...sanitize(patch) };
    set({ appearance: next });
    void AsyncStorage.setItem(KEY, JSON.stringify(next));
    for (const l of listeners) l(patch);
  },
  replace: (a) => {
    const next = { ...DEFAULT_APPEARANCE, ...sanitize(a) };
    set({ appearance: next });
    void AsyncStorage.setItem(KEY, JSON.stringify(next));
  },
  hydrate: async () => {
    try {
      const stored = sanitize(JSON.parse((await AsyncStorage.getItem(KEY)) ?? 'null'));
      set({ appearance: { ...get().appearance, ...stored }, ready: true });
    } catch {
      set({ ready: true });
    }
    syncDirection(get().appearance.language);
  },
}));
