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
const PLURAL_START = /\{\s*(\w+)\s*,\s*plural\s*,/g;
type PluralSelect = (n: number) => string;
/** CLDR integer rules for our four languages, used when the JS engine has no Intl.PluralRules (older Hermes). */
const FALLBACK_RULES: Record<string, PluralSelect> = {
  ar: (n) => {
    const m = n % 100;
    return n === 0 ? 'zero' : n === 1 ? 'one' : n === 2 ? 'two' : m >= 3 && m <= 10 ? 'few' : m >= 11 && m <= 99 ? 'many' : 'other';
  },
  fr: (n) => (n === 0 || n === 1 ? 'one' : 'other'),
  en: (n) => (n === 1 ? 'one' : 'other'),
  es: (n) => (n === 1 ? 'one' : 'other'),
};
const rulesCache = new Map<string, PluralSelect>();
const pluralRules = (locale: string): PluralSelect => {
  let r = rulesCache.get(locale);
  if (!r) {
    try {
      const intl = new Intl.PluralRules(locale);
      r = (n) => intl.select(n);
    } catch {
      r = FALLBACK_RULES[locale.slice(0, 2)] ?? FALLBACK_RULES.en!;
    }
    rulesCache.set(locale, r);
  }
  return r;
};

/** Index just past the brace group that opens at `open` (which must be '{'), or -1. */
function closeBrace(s: string, open: number) {
  let depth = 0;
  for (let i = open; i < s.length; i++) {
    if (s[i] === '{') depth++;
    else if (s[i] === '}' && --depth === 0) return i + 1;
  }
  return -1;
}

/**
 * ICU-style plurals: `{count, plural, =0 {none} one {# item} two {…} few {…} many {…} other {# items}}`.
 * Picks an exact `=n` branch first, then the locale's CLDR category (Arabic uses all six), then `other`;
 * `#` becomes the value. A value that is not a plain number (e.g. a compact "1.2K") uses `other`.
 */
function expandPlurals(template: string, vars: TVars, locale: string): string {
  let out = '';
  let last = 0;
  PLURAL_START.lastIndex = 0;
  for (let m = PLURAL_START.exec(template); m; m = PLURAL_START.exec(template)) {
    const end = closeBrace(template, m.index);
    if (end < 0) break;
    const raw = vars[m[1]!];
    const branches = new Map<string, string>();
    let i = m.index + m[0].length;
    while (i < end - 1) {
      const sel = /^\s*(=\d+|\w+)\s*/.exec(template.slice(i));
      if (!sel) break;
      const open = i + sel[0].length;
      if (template[open] !== '{') break;
      const close = closeBrace(template, open);
      if (close < 0) break;
      branches.set(sel[1]!, template.slice(open + 1, close - 1));
      i = close;
      while (i < end - 1 && /\s/.test(template[i]!)) i++;
    }
    const n = typeof raw === 'number' ? raw : typeof raw === 'string' && /^-?\d+(\.\d+)?$/.test(raw) ? Number(raw) : NaN;
    const pick = (Number.isFinite(n) && branches.get(`=${n}`)) || (Number.isFinite(n) && branches.get(pluralRules(locale)(n))) || branches.get('other') || '';
    out += template.slice(last, m.index) + expandPlurals(pick, vars, locale).replace(/#/g, raw === undefined ? '#' : String(raw));
    last = end;
    PLURAL_START.lastIndex = end;
  }
  return out + template.slice(last);
}

export function interpolate(template: string, vars?: TVars, locale = 'en'): string {
  if (!vars) return template;
  const expanded = template.includes('plural') ? expandPlurals(template, vars, locale) : template;
  return expanded.replace(PLACEHOLDER, (m, name: string) => (name in vars ? String(vars[name]) : m));
}

/** Variable names a message uses: `{{name}}` placeholders and plural selectors. */
export function messageVariables(template: string): string[] {
  const names = new Set<string>();
  for (const m of template.matchAll(PLACEHOLDER)) names.add(m[1]!);
  for (const m of template.matchAll(PLURAL_START)) names.add(m[1]!);
  return [...names].sort();
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
    t: (key, vars) => interpolate(resolve(key) ?? key, vars, locale),
    tDyn: (key, vars, fb) => {
      const v = resolve(key);
      return v === undefined ? (fb ?? key) : interpolate(v, vars, locale);
    },
    has: (key) => resolve(key) !== undefined,
  };
}
