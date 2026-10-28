/** Timed text lines of a lesson (captions / transcript). Times are seconds. */
export interface Cue {
  start: number;
  end: number;
  text: string;
}

export const CAPTION_LANGUAGES = ['ar', 'en', 'fr', 'es'] as const;
export type CaptionLanguage = (typeof CAPTION_LANGUAGES)[number];

const TIME = /(?:(\d{1,2}):)?(\d{1,2}):(\d{2})[.,](\d{1,3})/;

function seconds(t: string): number | null {
  const m = TIME.exec(t);
  if (!m) return null;
  const [, h = '0', min, sec, ms] = m;
  return Number(h) * 3600 + Number(min) * 60 + Number(sec) + Number(ms!.padEnd(3, '0')) / 1000;
}

const clean = (s: string) =>
  s
    .replace(/<[^>]+>/g, '') // <v Speaker>, <i>, <c.color> tags
    .replace(/\{\\[^}]*\}/g, '') // SRT/ASS style overrides
    .replace(/&amp;/g, '&')
    .replace(/&lt;/g, '<')
    .replace(/&gt;/g, '>')
    .replace(/&nbsp;/g, ' ')
    .replace(/\s+/g, ' ')
    .trim();

/** Reads WebVTT or SubRip (.srt) text into cues (sorted, empty lines dropped). Returns [] when nothing is timed. */
export function parseCaptions(raw: string): Cue[] {
  const blocks = raw
    .replace(/^\uFEFF/, '')
    .replace(/\r\n?/g, '\n')
    .split(/\n{2,}/);
  const cues: Cue[] = [];
  for (const block of blocks) {
    const lines = block.split('\n').filter((l) => l.trim() !== '');
    const at = lines.findIndex((l) => l.includes('-->'));
    if (at < 0) continue;
    const [a = '', b = ''] = lines[at]!.split('-->');
    const start = seconds(a);
    const end = seconds(b);
    if (start === null || end === null || end < start) continue;
    const text = clean(lines.slice(at + 1).join(' '));
    if (text) cues.push({ start: Math.round(start * 100) / 100, end: Math.round(end * 100) / 100, text });
  }
  return cues.sort((x, y) => x.start - y.start);
}

const stamp = (t: number) => {
  const ms = Math.round(t * 1000);
  const h = Math.floor(ms / 3_600_000);
  const m = Math.floor((ms % 3_600_000) / 60_000);
  const s = Math.floor((ms % 60_000) / 1000);
  return `${String(h).padStart(2, '0')}:${String(m).padStart(2, '0')}:${String(s).padStart(2, '0')}.${String(ms % 1000).padStart(3, '0')}`;
};

/** Cues as a WebVTT file (for <track> and downloads). */
export function toVtt(cues: Cue[]): string {
  return `WEBVTT\n\n${cues.map((c, i) => `${i + 1}\n${stamp(c.start)} --> ${stamp(c.end)}\n${c.text.replace(/-->/g, '→')}`).join('\n\n')}\n`;
}

/** Index of the cue showing at `time`, or -1. */
export function cueAt(cues: Cue[], time: number): number {
  let lo = 0;
  let hi = cues.length - 1;
  let found = -1;
  while (lo <= hi) {
    const mid = (lo + hi) >> 1;
    if (cues[mid]!.start <= time) {
      found = mid;
      lo = mid + 1;
    } else hi = mid - 1;
  }
  return found >= 0 && time <= cues[found]!.end + 0.3 ? found : -1;
}

/** Cues whose text contains every word of the query (accent- and case-insensitive; Arabic diacritics ignored). */
export function searchCues(cues: Cue[], query: string): number[] {
  const fold = (s: string) =>
    s
      .toLowerCase()
      .normalize('NFKD')
      .replace(/[̀-ًͯ-ٰٟـ]/g, '')
      .replace(/[أإآ]/g, 'ا')
      .replace(/ة/g, 'ه')
      .replace(/ى/g, 'ي');
  const words = fold(query).split(/\s+/).filter(Boolean);
  if (!words.length) return [];
  const out: number[] = [];
  cues.forEach((c, i) => {
    const t = fold(c.text);
    if (words.every((w) => t.includes(w))) out.push(i);
  });
  return out;
}
