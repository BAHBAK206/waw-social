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

export interface VideoChapter {
  /** Seconds from the start. */
  at: number;
  title: string;
}

/**
 * Lesson chapters from a description, YouTube-style: lines that start with a timestamp
 * ("0:00 Introduction", "12:05 - Worked example", "1:02:30 Summary"). Needs at least two, the first at 0:00.
 */
export function parseChapters(description: string, durationSec = Infinity): VideoChapter[] {
  const out: VideoChapter[] = [];
  for (const line of description.split(/\r?\n/)) {
    const m = /^\s*(?:(\d{1,2}):)?(\d{1,2}):(\d{2})\s*[-–—:|)]?\s*(.+?)\s*$/.exec(line);
    if (!m) continue;
    const at = Number(m[1] ?? 0) * 3600 + Number(m[2]) * 60 + Number(m[3]);
    if (Number(m[3]) > 59 || at > durationSec) continue;
    out.push({ at, title: m[4]!.slice(0, 120) });
  }
  out.sort((a, b) => a.at - b.at);
  const unique = out.filter((c, i) => i === 0 || c.at > out[i - 1]!.at);
  return unique.length >= 2 && unique[0]!.at === 0 ? unique : [];
}
