import { ar } from './locales/ar';
import { en, type Dictionary } from './locales/en';
import { es } from './locales/es';
import { fr } from './locales/fr';

export type { Dictionary };
export { INFO_CONTENT, type InfoContent, type InfoPage, type InfoSection } from './info';

export const LOCALES = { ar, en, fr, es } as const;
export type Locale = keyof typeof LOCALES;
export const LOCALE_LIST: readonly Locale[] = ['ar', 'en', 'fr', 'es'];
export const LOCALE_NAMES: Record<Locale, string> = { ar: 'العربية', en: 'English', fr: 'Français', es: 'Español' };
export const RTL_LOCALES: readonly Locale[] = ['ar'];

export function isLocale(v: unknown): v is Locale {
  return typeof v === 'string' && v in LOCALES;
}

export function dirFor(locale: Locale): 'rtl' | 'ltr' {
  return RTL_LOCALES.includes(locale) ? 'rtl' : 'ltr';
}

/** i18next-compatible resource bundle. */
export const resources = Object.fromEntries(LOCALE_LIST.map((l) => [l, { translation: LOCALES[l] }])) as Record<Locale, { translation: Dictionary }>;

/** Detects the best locale from a list of preferred languages (navigator.languages / device locales). */
export function detectLocale(preferred: readonly string[], fallback: Locale = 'ar'): Locale {
  for (const p of preferred) {
    const base = p.toLowerCase().split(/[-_]/)[0];
    if (isLocale(base)) return base;
  }
  return fallback;
}

/** Collects every leaf key path (used by tests to guarantee parity). */
export function keyPaths(obj: unknown, prefix = ''): string[] {
  if (Array.isArray(obj)) return [`${prefix}[${obj.length}]`];
  if (obj && typeof obj === 'object') return Object.entries(obj).flatMap(([k, v]) => keyPaths(v, prefix ? `${prefix}.${k}` : k));
  return [prefix];
}

export { createTranslator, interpolate, type TKey, type TVars, type Translator } from './translate';
