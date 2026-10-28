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

/**
 * One CSV cell, safe to open in Excel/Sheets: cells starting with = + - @ (or a tab/CR) get a leading apostrophe so they
 * are shown as text instead of being run as formulas (a student named "=HYPERLINK(...)" must not run in the teacher's sheet).
 */
export function csvCell(v: unknown): string {
  const s = Array.isArray(v) ? v.join('; ') : v === null || v === undefined ? '' : String(v);
  const safe = /^[=+\-@\t\r]/.test(s) ? `'${s}` : s;
  return /[",\n\r;]/.test(safe) || safe !== safe.trim() ? `"${safe.replace(/"/g, '""')}"` : safe;
}

/** Rows → CSV text (CRLF line ends). */
export function toCsv(rows: readonly (readonly unknown[])[]): string {
  return rows.map((r) => r.map(csvCell).join(',')).join('\r\n');
}

/** CSV text → rows (quotes, doubled quotes, commas/semicolons/tabs, CRLF; a leading BOM is dropped). */
export function parseCsv(text: string): string[][] {
  const src = text.replace(/^\uFEFF/, '');
  const firstLine = src.split(/\r?\n/, 1)[0] ?? '';
  const sep = [',', ';', '\t'].reduce((best, s) => (firstLine.split(s).length > firstLine.split(best).length ? s : best), ',');
  const rows: string[][] = [];
  let row: string[] = [];
  let cell = '';
  let quoted = false;
  for (let i = 0; i < src.length; i++) {
    const ch = src[i]!;
    if (quoted) {
      if (ch === '"' && src[i + 1] === '"') {
        cell += '"';
        i++;
      } else if (ch === '"') quoted = false;
      else cell += ch;
    } else if (ch === '"' && cell === '') quoted = true;
    else if (ch === sep) {
      row.push(cell);
      cell = '';
    } else if (ch === '\n' || ch === '\r') {
      if (ch === '\r' && src[i + 1] === '\n') i++;
      row.push(cell);
      if (row.some((c) => c.trim())) rows.push(row);
      row = [];
      cell = '';
    } else cell += ch;
  }
  row.push(cell);
  if (row.some((c) => c.trim())) rows.push(row);
  return rows.map((r) => r.map((c) => c.trim()));
}
