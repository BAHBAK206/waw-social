import { DEFAULT_APPEARANCE, DESIGNS, LANGUAGES, SKINS, TEXT_SIZES, THEME_MODES, type Appearance } from '@qubedu/shared';
import { detectLocale } from '@qubedu/i18n';
import { buildThemeCss, resolveTheme, TEXT_SCALE } from '@qubedu/tokens';
import { create } from 'zustand';

const STORAGE_KEY = 'qubedu:appearance';
const darkQuery = typeof window !== 'undefined' ? window.matchMedia('(prefers-color-scheme: dark)') : null;

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
  return out;
}

function load(): Appearance {
  let stored: Partial<Appearance> = {};
  try {
    stored = sanitize(JSON.parse(localStorage.getItem(STORAGE_KEY) ?? 'null'));
  } catch {
    /* storage unavailable (private mode) */
  }
  const language = stored.language ?? detectLocale(typeof navigator !== 'undefined' ? navigator.languages : [], DEFAULT_APPEARANCE.language);
  return { ...DEFAULT_APPEARANCE, ...stored, language };
}

function persist(a: Appearance) {
  try {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(a));
  } catch {
    /* ignore */
  }
}

export function resolvedMode(a: Appearance): 'light' | 'dark' {
  if (a.theme === 'system') return darkQuery?.matches ? 'dark' : 'light';
  return a.theme;
}

let cssInjected = false;
function ensureThemeCss() {
  if (cssInjected || typeof document === 'undefined') return;
  const style = document.createElement('style');
  style.id = 'qubedu-theme';
  style.textContent = buildThemeCss();
  document.head.prepend(style);
  cssInjected = true;
}

export function applyAppearance(a: Appearance) {
  ensureThemeCss();
  const root = document.documentElement;
  const mode = resolvedMode(a);
  root.dataset.design = a.design;
  root.dataset.skin = a.skin;
  root.dataset.theme = mode;
  root.dataset.reduceMotion = String(a.reduceMotion);
  root.lang = a.language;
  root.dir = a.language === 'ar' ? 'rtl' : 'ltr';
  root.style.setProperty('--text-scale', String(TEXT_SCALE[a.textSize]));
  const theme = resolveTheme(a.design, a.skin, mode, a.textSize);
  document.querySelector('meta[name="theme-color"]')?.setAttribute('content', mode === 'dark' ? theme.bg : theme.primary);
}

interface AppearanceState {
  appearance: Appearance;
  /** Updates locally; `onChange` listeners (session sync) push it to the server for signed-in users. */
  update: (patch: Partial<Appearance>) => void;
  /** Replaces from the server profile without echoing back. */
  replace: (a: Appearance) => void;
}

type Listener = (patch: Partial<Appearance>) => void;
const listeners = new Set<Listener>();
export function onAppearanceChange(fn: Listener) {
  listeners.add(fn);
  return () => listeners.delete(fn);
}

export const useAppearance = create<AppearanceState>((set, get) => ({
  appearance: load(),
  update: (patch) => {
    const next = { ...get().appearance, ...sanitize(patch) };
    set({ appearance: next });
    persist(next);
    applyAppearance(next);
    for (const l of listeners) l(patch);
  },
  replace: (a) => {
    const next = { ...DEFAULT_APPEARANCE, ...sanitize(a) };
    set({ appearance: next });
    persist(next);
    applyAppearance(next);
  },
}));

darkQuery?.addEventListener('change', () => {
  const a = useAppearance.getState().appearance;
  if (a.theme === 'system') applyAppearance(a);
});
