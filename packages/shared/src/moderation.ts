/**
 * Automatic text screening for everything people publish (posts, answers, comments, messages, names, titles).
 *
 * - "mask" words (insults, profanity) are replaced with stars and the text is kept.
 * - "block" words and phrases (threats, self-harm encouragement, sexual solicitation, slurs) reject the text.
 *
 * Matching runs on a normalized form, so diacritics, tatweel, letter variants (أ/إ/آ → ا, ة → ه, ى → ي),
 * repeated letters ("stuuupid"), common digit/symbol swaps ("1d10t", "$hit") and Arabic prefixes (و، ف، ال، يا، بال، لل)
 * do not slip past the list. The root administrator can add words to either list from the admin console.
 */

export type ModerationAction = 'allow' | 'mask' | 'block';
export interface ModerationResult {
  action: ModerationAction;
  /** The text with masked words replaced (unchanged when action is "allow" or "block"). */
  text: string;
  hits: string[];
}
export interface ModerationLists {
  mask?: readonly string[];
  block?: readonly string[];
}

const MASK_WORDS: readonly string[] = [
  // English (words with a harmless school meaning, e.g. "jerk" in physics, are left out)
  'fuck',
  'fucking',
  'fucker',
  'motherfucker',
  'shit',
  'bullshit',
  'bitch',
  'bastard',
  'asshole',
  'dickhead',
  'pussy',
  'cunt',
  'slut',
  'whore',
  'idiot',
  'moron',
  'dumbass',
  'wanker',
  'twat',
  'stfu',
  // French ("retard" and "con" are everyday words in French/Spanish, so they are not listed)
  'merde',
  'putain',
  'connard',
  'connasse',
  'salope',
  'encule',
  'batard',
  'pute',
  'abruti',
  'nique',
  'ntm',
  'fdp',
  // Spanish ("zorra" and "cono" also mean fox and cone)
  'mierda',
  'puta',
  'puto',
  'cabron',
  'pendejo',
  'pendeja',
  'gilipollas',
  'joder',
  'imbecil',
  'maricon',
  'hdp',
  'carajo',
  // Arabic: animal names are only insults when aimed at someone ("يا حمار"), never in a biology lesson
  'غبي',
  'غبيه',
  'حقير',
  'حقيره',
  'خول',
  'متناك',
  'منيوك',
  'شرموط',
  'شرموطه',
  'عرص',
  'معرص',
  'قحبه',
  'كسمك',
  'طيز',
  'زب',
  'اهبل',
  'هبله',
  'عبيط',
  'عبيطه',
  'منحط',
  'واطي',
  'ابن الكلب',
  'ابن الحرام',
  'ابن الوسخه',
  'يا حمار',
  'ياحمار',
  'يا كلب',
  'ياكلب',
  'يا حيوان',
  'ياحيوان',
  'يا خنزير',
  'ياخنزير',
  'يا بهيم',
  'يابهيم',
  'يا جزمه',
  'ياجزمه',
  'يا زباله',
  'يازباله',
  'يلعن ابوك',
  'يلعن امك',
];

const BLOCK_WORDS: readonly string[] = [
  // Self-harm encouragement and threats
  'kill yourself',
  'kys',
  'go die',
  'i will kill you',
  "i'll kill you",
  'neck yourself',
  'tue toi',
  'va mourir',
  'je vais te tuer',
  'matate',
  'muerete',
  'te voy a matar',
  'اقتل نفسك',
  'روح انتحر',
  'روح موت',
  'هقتلك',
  'سأقتلك',
  'حقتلك',
  'راح اقتلك',
  'هموتك',
  // Sexual solicitation
  'send nudes',
  'send nude',
  'nudes',
  'sexting',
  'manda nudes',
  'ابعتي صورك',
  'صور عاريه',
  'نودز',
  // Slurs
  'nigger',
  'nigga',
  'faggot',
  'tranny',
  'kike',
  'bougnoule',
  'sudaca',
];

const DIACRITICS = /[ؐ-ًؚ-ٰٟۖ-ۭـ]/g;
const LATIN_MARKS = /[̀-ͯ]/g;
const LEET: Record<string, string> = { '0': 'o', '1': 'i', '3': 'e', '4': 'a', '5': 's', '7': 't', '@': 'a', $: 's' };
const AR_PREFIXES = ['وبال', 'فال', 'وال', 'بال', 'كال', 'لل', 'يا', 'ال', 'و', 'ف', 'ب'];
const TOKEN = /[\p{L}\p{M}\p{N}@$*]+/gu;

/** Lower-case, strip marks and tatweel, unify letter variants, undo digit swaps, collapse runs of the same letter. */
export function normalizeForModeration(input: string): string {
  let s = input
    .toLowerCase()
    .replace(/\u0640/g, '')
    .normalize('NFKD')
    .replace(LATIN_MARKS, '')
    .replace(DIACRITICS, '');
  s = s
    .replace(/[أإآٱ]/g, 'ا')
    .replace(/ة/g, 'ه')
    .replace(/ى/g, 'ي')
    .replace(/ؤ/g, 'و')
    .replace(/ئ/g, 'ي');
  // Digit/symbol swaps only inside words that also contain Latin letters ("1d10t"), so numbers stay numbers.
  s = s.replace(/[\p{L}\p{N}@$]+/gu, (w) => (/[a-z]/.test(w) ? w.replace(/[013457@$]/g, (ch) => LEET[ch] ?? ch) : w));
  return s.replace(/(\p{L})\1{2,}/gu, '$1');
}

/** Normalized token variants: as is, with doubled letters collapsed, and with an Arabic prefix removed. */
function variants(token: string): string[] {
  const out = new Set([token, token.replace(/(\p{L})\1+/gu, '$1')]);
  for (const p of AR_PREFIXES) if (token.startsWith(p) && token.length - p.length >= 2) out.add(token.slice(p.length));
  return [...out];
}

interface Compiled {
  maskWords: Set<string>;
  maskPhrases: string[];
  blockWords: Set<string>;
  blockPhrases: string[];
}
const compiledCache = new Map<string, Compiled>();

function compile(lists: ModerationLists): Compiled {
  const key = `${(lists.mask ?? []).join('|')}#${(lists.block ?? []).join('|')}`;
  const hit = compiledCache.get(key);
  if (hit) return hit;
  const split = (words: readonly string[]) => {
    const single = new Set<string>();
    const phrases: string[] = [];
    for (const w of words) {
      const n = normalizeForModeration(w).trim().replace(/\s+/g, ' ');
      if (!n) continue;
      if (n.includes(' ') || n.includes('-')) phrases.push(n.replace(/-/g, ' '));
      else single.add(n);
    }
    return { single, phrases };
  };
  const m = split([...MASK_WORDS, ...(lists.mask ?? [])]);
  const b = split([...BLOCK_WORDS, ...(lists.block ?? [])]);
  const c: Compiled = { maskWords: m.single, maskPhrases: m.phrases, blockWords: b.single, blockPhrases: b.phrases };
  if (compiledCache.size > 20) compiledCache.clear();
  compiledCache.set(key, c);
  return c;
}

function matchWord(set: Set<string>, token: string): string | null {
  for (const v of variants(token)) if (set.has(v)) return v;
  return null;
}

/** Screen one piece of text. */
export function moderateText(text: string, lists: ModerationLists = {}): ModerationResult {
  if (!text || !/[\p{L}]/u.test(text)) return { action: 'allow', text, hits: [] };
  const c = compile(lists);
  const tokens = [...text.matchAll(TOKEN)].map((m) => ({ raw: m[0], start: m.index ?? 0, norm: normalizeForModeration(m[0]) }));
  const joined = ` ${tokens.map((t) => t.norm).join(' ')} `;

  const blockHits = c.blockPhrases.filter((p) => joined.includes(` ${p} `));
  for (const t of tokens) {
    const w = matchWord(c.blockWords, t.norm);
    if (w) blockHits.push(w);
  }
  if (blockHits.length) return { action: 'block', text, hits: [...new Set(blockHits)] };

  const hits: string[] = [];
  const masked = new Set<number>();
  tokens.forEach((t, i) => {
    const w = matchWord(c.maskWords, t.norm);
    if (w) {
      hits.push(w);
      masked.add(i);
    }
  });
  for (const p of c.maskPhrases) {
    const parts = p.split(' ');
    for (let i = 0; i + parts.length <= tokens.length; i++) {
      if (parts.every((part, k) => variants(tokens[i + k]!.norm).includes(part))) {
        hits.push(p);
        for (let k = 0; k < parts.length; k++) masked.add(i + k);
      }
    }
  }
  if (!hits.length) return { action: 'allow', text, hits: [] };
  let out = '';
  let pos = 0;
  tokens.forEach((t, i) => {
    if (!masked.has(i)) return;
    out += text.slice(pos, t.start);
    const chars = [...t.raw.replace(/\p{M}/gu, '')];
    out += chars[0] + '*'.repeat(Math.max(1, chars.length - 1));
    pos = t.start + t.raw.length;
  });
  out += text.slice(pos);
  return { action: 'mask', text: out, hits: [...new Set(hits)] };
}

/** Field names that carry published, human-readable text. Rich documents, passwords and ids are never touched. */
export const MODERATED_FIELDS: ReadonlySet<string> = new Set([
  'text',
  'title',
  'description',
  'bio',
  'displayName',
  'name',
  'caption',
  'details',
  'message',
  'question',
  'answer',
  'headline',
  'location',
  'about',
  'label',
  'options',
  'tags',
]);

/**
 * Walk a parsed request body and screen every moderated field (nested objects and arrays included, e.g. poll options).
 * Returns the masked copy, or the first blocked verdict.
 */
export function moderateBody<T>(value: T, lists: ModerationLists = {}): { value: T; blocked: string[] | null; masked: boolean } {
  let blocked: string[] | null = null;
  let maskedAny = false;
  const walk = (v: unknown, key: string | null, depth: number): unknown => {
    if (blocked || depth > 6) return v;
    if (typeof v === 'string') {
      if (key === null || !MODERATED_FIELDS.has(key)) return v;
      const r = moderateText(v, lists);
      if (r.action === 'block') blocked = r.hits;
      if (r.action === 'mask') maskedAny = true;
      return r.text;
    }
    if (Array.isArray(v)) return v.map((x) => walk(x, key, depth + 1));
    if (v && typeof v === 'object') {
      const out: Record<string, unknown> = {};
      for (const [k, x] of Object.entries(v)) out[k] = walk(x, k, depth + 1);
      return out;
    }
    return v;
  };
  const out = walk(value, null, 0) as T;
  return { value: blocked ? value : out, blocked, masked: maskedAny };
}
