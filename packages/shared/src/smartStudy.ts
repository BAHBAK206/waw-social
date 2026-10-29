import { DEFAULT_EASE, rateCard, type SchedulerState } from './flashcards';
import { normalizeSearch } from './text';

const DAY_MS = 86_400_000;

/** State of a missed question in the review queue. */
export type QuestionReviewState = SchedulerState & { misses: number };

/**
 * Review schedule of a quiz question after an attempt. A miss puts it back in tomorrow's queue (and counts toward
 * "recurring mistakes"); a correct answer to a question already in the queue advances it like a known flashcard.
 * Returns null when nothing should change (a correct answer to a question that was never missed).
 */
export function reviewAfterAnswer(prev: QuestionReviewState | null, correct: boolean, now = Date.now()): QuestionReviewState | null {
  if (!correct) {
    const base: QuestionReviewState = prev ?? {
      level: 0,
      ease: DEFAULT_EASE,
      repetitions: 0,
      lapses: 0,
      intervalDays: 0,
      dueAt: now,
      lastReviewedAt: null,
      misses: 0,
    };
    const next = rateCard(base, 'again', now);
    return { ...next, misses: base.misses + 1, intervalDays: 1, dueAt: now + DAY_MS };
  }
  if (!prev) return null;
  return { ...rateCard(prev, 'know', now), misses: prev.misses };
}

/* ───────── Study pack (key terms, mind map, flashcards, questions) from plain text ───────── */

export interface StudyPack {
  keyTerms: { term: string; count: number }[];
  mindMap: { center: string; branches: { title: string; points: string[] }[] };
  flashcards: { front: string; back: string }[];
  questions: { prompt: string; answer: string }[];
  glossary: { term: string; definition: string }[];
}

const STOP = new Set(
  normalizeSearch(
    `the a an of to in on at for and or is are was were be been it this that these those with as by from which who what when where how not can may will
     في من على إلى الى عن مع هذا هذه ذلك تلك التي الذي الذين هو هي هم ما ماذا كيف متى اين أين كان كانت يكون تكون او أو ثم قد لا لم لن إن ان أن كل بعض بين عند عندما حتى لكن
     le la les un une des de du et ou est sont dans sur pour par avec que qui ce cet cette ces au aux en
     el los las un una unos unas de del y o es son en por para con que se su sus este esta estos estas al`,
  ).split(' '),
);

const sentencesOf = (text: string): string[] =>
  text
    .replace(/\r/g, '')
    .split(/(?<=[.!?؟۔…])\s+|\n+/)
    .map((s) => s.replace(/^[\s\-–•*#\d.)]+/, '').trim())
    .filter((s) => s.length >= 20 && s.length <= 400);

/** "X is/means …" in Arabic, English, French and Spanish: the term and the definition. */
const DEFINITION =
  /^(.{2,60}?)\s+(?:is defined as|is called|is the|is an?|are the|are|means|refers to|هو|هي|هم|تعريف|يعني|تعني|يُعرَّف بأنه|تُعرَّف بأنها|عبارة عن|est un|est une|est le|est la|sont|signifie|es un|es una|es el|es la|son|significa)\s+(.{8,300})$/iu;

export function definitionsIn(text: string): { term: string; definition: string }[] {
  const out: { term: string; definition: string }[] = [];
  const seen = new Set<string>();
  for (const s of sentencesOf(text)) {
    const m = DEFINITION.exec(s.replace(/[.؟?!۔…]+$/, ''));
    if (!m) continue;
    const term = m[1]!
      .replace(/^(?:the|a|an|le|la|les|un|une|el|la|los|las)\s+/i, '')
      .replace(/[:،,"«»“”]/g, '')
      .trim();
    if (!term || term.split(/\s+/).length > 5 || STOP.has(normalizeSearch(term))) continue;
    const key = normalizeSearch(term);
    if (seen.has(key)) continue;
    seen.add(key);
    out.push({ term, definition: m[2]!.trim() });
  }
  return out;
}

export function keyTermsOf(text: string, limit = 12): { term: string; count: number }[] {
  const counts = new Map<string, { term: string; count: number }>();
  for (const w of text.split(/[^\p{L}\p{N}]+/u)) {
    if (w.length < 3) continue;
    const key = normalizeSearch(w);
    if (STOP.has(key) || /^\d+$/.test(key)) continue;
    const e = counts.get(key) ?? { term: w, count: 0 };
    e.count += 1;
    counts.set(key, e);
  }
  return [...counts.values()]
    .filter((e) => e.count >= 2)
    .sort((a, b) => b.count - a.count || a.term.localeCompare(b.term))
    .slice(0, limit);
}

const isHeading = (line: string) =>
  line.length >= 3 && line.length <= 70 && !/[.!?؟]$/.test(line) && (/^#{1,3}\s/.test(line) || /^\d+[.)]\s/.test(line) || !/\s{2,}/.test(line));

export function buildStudyPack(text: string, opts: { maxFlashcards?: number; maxQuestions?: number } = {}): StudyPack {
  const clean = text.replaceAll(String.fromCharCode(0), '').trim();
  const keyTerms = keyTermsOf(clean);
  const defs = definitionsIn(clean);

  // Mind map: lines that look like headings become branches; otherwise sentences are grouped under the strongest term they mention.
  const lines = clean
    .split(/\n+/)
    .map((l) => l.trim())
    .filter(Boolean);
  const branches: { title: string; points: string[] }[] = [];
  let current: { title: string; points: string[] } | null = null;
  for (const line of lines) {
    if (lines.length > 3 && isHeading(line) && line.split(/\s+/).length <= 8 && !sentencesOf(line).length) {
      current = { title: line.replace(/^[#\d.)\s]+/, ''), points: [] };
      branches.push(current);
    } else if (current) {
      current.points.push(...sentencesOf(line).map((s) => (s.length > 120 ? `${s.slice(0, 117)}…` : s)));
    }
  }
  let filled = branches.filter((b) => b.points.length);
  if (filled.length < 2) {
    const byTerm = new Map<string, string[]>();
    const sentences = sentencesOf(clean);
    for (const s of sentences) {
      const n = normalizeSearch(s);
      const hit = keyTerms.find((k) => n.includes(normalizeSearch(k.term)));
      if (!hit) continue;
      const list = byTerm.get(hit.term) ?? [];
      list.push(s.length > 120 ? `${s.slice(0, 117)}…` : s);
      byTerm.set(hit.term, list);
    }
    filled = [...byTerm].map(([title, points]) => ({ title, points })).slice(0, 8);
  }
  const center = filled.length ? (keyTerms[0]?.term ?? filled[0]!.title) : (keyTerms[0]?.term ?? '');
  const mindMap = { center, branches: filled.slice(0, 10).map((b) => ({ title: b.title, points: b.points.slice(0, 4) })) };

  const maxCards = opts.maxFlashcards ?? 20;
  const flashcards = defs.slice(0, maxCards).map((d) => ({ front: d.term, back: d.definition }));
  const maxQ = opts.maxQuestions ?? 10;
  const questions = defs.slice(0, maxQ).map((d) => ({ prompt: `${d.term}: ${d.definition.split(/\s+/).slice(0, 14).join(' ')}…`, answer: d.term }));

  return { keyTerms, mindMap, flashcards, questions, glossary: defs.slice(0, 40) };
}
