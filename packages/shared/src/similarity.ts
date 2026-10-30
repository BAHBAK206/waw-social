import { normalizeSearch } from './text';

/**
 * Copying check between pieces of writing: overlapping 5-word sequences ("shingles") after normalising
 * (case, Arabic letter forms, punctuation). Short texts are not compared, and common phrases from the
 * assignment itself can be excluded so the instructions don't count as copying.
 */
const SHINGLE = 5;
const MIN_WORDS = 25;

const words = (text: string) =>
  normalizeSearch(text)
    .replace(/[^\p{L}\p{N}\s]/gu, ' ')
    .split(/\s+/)
    .filter(Boolean);

function shingles(ws: string[]): Set<string> {
  const out = new Set<string>();
  for (let i = 0; i + SHINGLE <= ws.length; i++) out.add(ws.slice(i, i + SHINGLE).join(' '));
  return out;
}

export interface SimilarityDoc {
  id: string;
  text: string;
}

export interface SimilarityMatch {
  a: string;
  b: string;
  /** Share of the shorter text's 5-word sequences that also appear in the other (0–1). */
  score: number;
  /** The longest shared passage, in the first text's own words. */
  excerpt: string;
}

/** Longest run of consecutive shared shingles in `a`, rebuilt from a's words. */
function sharedPassage(aw: string[], other: Set<string>): string {
  let best: [number, number] = [0, 0];
  let start = -1;
  for (let i = 0; i + SHINGLE <= aw.length + 1; i++) {
    const hit = i + SHINGLE <= aw.length && other.has(aw.slice(i, i + SHINGLE).join(' '));
    if (hit && start < 0) start = i;
    if (!hit && start >= 0) {
      if (i - start > best[1] - best[0]) best = [start, i];
      start = -1;
    }
  }
  if (best[1] === best[0]) return '';
  return aw.slice(best[0], Math.min(best[1] + SHINGLE - 1, best[0] + 60)).join(' ');
}

/**
 * Pairs of documents that share at least `threshold` of their wording, highest first.
 * `ignore` (e.g. the assignment's instructions) is removed from every document first.
 */
export function findSimilar(docs: SimilarityDoc[], opts: { threshold?: number; ignore?: string; against?: SimilarityDoc[] } = {}): SimilarityMatch[] {
  const threshold = opts.threshold ?? 0.25;
  const ignore = opts.ignore ? shingles(words(opts.ignore)) : new Set<string>();
  const prep = (d: SimilarityDoc) => {
    const ws = words(d.text);
    const sh = shingles(ws);
    for (const s of ignore) sh.delete(s);
    return { id: d.id, ws, sh };
  };
  const mine = docs.map(prep).filter((d) => d.ws.length >= MIN_WORDS && d.sh.size > 0);
  const others = opts.against ? opts.against.map(prep).filter((d) => d.sh.size > 0) : null;
  const out: SimilarityMatch[] = [];
  const compare = (x: ReturnType<typeof prep>, y: ReturnType<typeof prep>, sourceMode: boolean) => {
    let shared = 0;
    const [small, big] = x.sh.size <= y.sh.size || sourceMode ? [x.sh, y.sh] : [y.sh, x.sh];
    for (const s of small) if (big.has(s)) shared++;
    // Against a source, measure how much of the student's text comes from it.
    const score = sourceMode ? shared / x.sh.size : shared / Math.min(x.sh.size, y.sh.size);
    if (score >= threshold) out.push({ a: x.id, b: y.id, score: Math.round(score * 100) / 100, excerpt: sharedPassage(x.ws, y.sh) });
  };
  if (others) for (const x of mine) for (const y of others) compare(x, y, true);
  else for (let i = 0; i < mine.length; i++) for (let j = i + 1; j < mine.length; j++) compare(mine[i]!, mine[j]!, false);
  return out.sort((p, q) => q.score - p.score);
}

/** Simple writing statistics shown with essay feedback. */
export function writingStats(text: string): { words: number; sentences: number; paragraphs: number; avgSentence: number } {
  const w = text.trim() ? text.trim().split(/\s+/).length : 0;
  const sentences = text.split(/[.!?؟。]+(?:\s|$)/).filter((s) => s.trim().length > 1).length;
  const paragraphs = text.split(/\n\s*\n/).filter((p) => p.trim()).length;
  return { words: w, sentences, paragraphs, avgSentence: sentences ? Math.round((w / sentences) * 10) / 10 : 0 };
}
