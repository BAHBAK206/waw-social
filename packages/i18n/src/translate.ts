import { ar } from './locales/ar';
import { en, type Dictionary } from './locales/en';
import { es } from './locales/es';
import { fr } from './locales/fr';

export type Locale = 'ar' | 'en' | 'fr' | 'es';
const LOCALES: Record<Locale, Dictionary> = { ar, en, fr, es };

/** Every string leaf of the dictionary as a dotted path, e.g. "quiz.player.submit". */
type Leaves<T, P extends string = ''> = {
  [K in keyof T & string]: T[K] extends string ? `${P}${K}` : T[K] extends readonly unknown[] ? never : Leaves<T[K], `${P}${K}.`>;
}[keyof T & string];

export type TKey = Leaves<Dictionary>;
export type TVars = Record<string, string | number>;

const PLACEHOLDER = /{{\s*(\w+)\s*}}/g;

export function interpolate(template: string, vars?: TVars): string {
  if (!vars) return template;
  return template.replace(PLACEHOLDER, (m, name: string) => (name in vars ? String(vars[name]) : m));
}

function lookup(dict: unknown, path: string): unknown {
  let cur: unknown = dict;
  for (const part of path.split('.')) {
    if (cur === null || typeof cur !== 'object') return undefined;
    cur = (cur as Record<string, unknown>)[part];
  }
  return cur;
}

export interface Translator {
  locale: Locale;
  dir: 'rtl' | 'ltr';
  /** The full dictionary, for arrays and tuples (e.g. dict.auth.strength). */
  dict: Dictionary;
  t: (key: TKey, vars?: TVars) => string;
  /** For keys built at runtime (error codes, notification types). Falls back when missing. */
  tDyn: (key: string, vars?: TVars, fallback?: string) => string;
  has: (key: string) => boolean;
  /** Intl locale tag; Arabic uses Latin digits so numbers read the same in math and code. */
  intl: string;
}

export function createTranslator(locale: Locale): Translator {
  const dict = LOCALES[locale];
  const fallback = LOCALES.en;
  const resolve = (key: string): string | undefined => {
    const v = lookup(dict, key) ?? lookup(fallback, key);
    return typeof v === 'string' ? v : undefined;
  };
  return {
    locale,
    dir: locale === 'ar' ? 'rtl' : 'ltr',
    dict,
    intl: locale === 'ar' ? 'ar-u-nu-latn' : locale,
    t: (key, vars) => interpolate(resolve(key) ?? key, vars),
    tDyn: (key, vars, fb) => {
      const v = resolve(key);
      return v === undefined ? (fb ?? key) : interpolate(v, vars);
    },
    has: (key) => resolve(key) !== undefined,
  };
}
