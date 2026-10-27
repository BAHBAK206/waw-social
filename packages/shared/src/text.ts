/** Normalizes Arabic/Latin text for search and matching. */
export function normalizeSearch(value: string): string {
  return value
    .normalize('NFKD')
    .replace(/[̀-ͯ]/g, '')
    .replace(/[ً-ٰٟـ]/g, '')
    .replace(/[أإآٱ]/g, 'ا')
    .replace(/ى/g, 'ي')
    .replace(/ة/g, 'ه')
    .replace(/ؤ/g, 'و')
    .replace(/ئ/g, 'ي')
    .toLocaleLowerCase()
    .replace(/\s+/g, ' ')
    .trim();
}

export function truncate(value: string, max: number): string {
  if (value.length <= max) return value;
  return `${value.slice(0, Math.max(0, max - 1)).trimEnd()}…`;
}

export function initials(name: string): string {
  const parts = name.trim().split(/\s+/).filter(Boolean);
  if (!parts.length) return '?';
  return parts
    .slice(0, 2)
    .map((p) => p[0]!.toUpperCase())
    .join('');
}

export function isRtlLanguage(lang: string): boolean {
  return /^(ar|fa|he|ur)\b/.test(lang);
}

const SLUG_ALPHABET = 'abcdefghijkmnpqrstuvwxyz23456789';
export function randomCode(length = 8, rand: () => number = Math.random): string {
  let out = '';
  for (let i = 0; i < length; i++) out += SLUG_ALPHABET[Math.floor(rand() * SLUG_ALPHABET.length)];
  return out;
}

/** Unique lowercase #hashtags (Arabic-aware, max 20). Ignores URL fragments like "page#section". */
export function extractHashtags(text: string): string[] {
  const out = new Set<string>();
  for (const m of text.matchAll(/(?:^|[\s(])#([\p{L}\p{N}_]{2,40})/gu)) {
    out.add(m[1]!.toLowerCase());
    if (out.size >= 20) break;
  }
  return [...out];
}
