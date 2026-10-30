import { describe, expect, it } from 'vitest';
import { lessonTimeline, suggestPaperMarks, tierQuestions } from './teacherTools';

describe('suggestPaperMarks', () => {
  const key = [
    { label: '1', accepted: ['Cairo', 'القاهرة'], points: 2 },
    { label: '2', accepted: ['light', 'chlorophyll', 'water'], points: 4, needed: 2 },
    { label: '3', accepted: ['12'], points: 1 },
  ];
  it('gives full, partial and no marks and totals them', () => {
    const r = suggestPaperMarks('1) cairo  2) Plants use light. 3) 13', key);
    expect(r.items.map((i) => i.awarded)).toEqual([2, 2, 0]);
    expect(r.items[1]!.matched).toEqual(['light']);
    expect([r.total, r.max]).toEqual([4, 7]);
  });
  it('matches Arabic regardless of diacritics and punctuation, and whole numbers only', () => {
    expect(suggestPaperMarks('الإجابة: القاهرةُ.', key).items[0]!.awarded).toBe(2);
    expect(suggestPaperMarks('the answer is 120', key).items[2]!.awarded).toBe(0);
    expect(suggestPaperMarks('the answer is 12.', key).items[2]!.awarded).toBe(1);
  });
});

describe('lessonTimeline', () => {
  it('adds up to the lesson time', () => {
    for (const m of [20, 45, 50, 90, 7, 400]) {
      const t = lessonTimeline(m);
      expect(t.reduce((n, r) => n + r.minutes, 0)).toBe(Math.max(20, Math.min(180, m)));
      expect(t.map((r) => r.key)).toEqual(['warmup', 'explain', 'practice', 'assess', 'wrapup']);
    }
  });
});

describe('tierQuestions', () => {
  it('uses difficulty labels and spreads unlabeled questions', () => {
    const qs = [{ level: 'easy' }, { level: 'hard' }, { level: null }, { level: null }, { level: null }, { level: 'medium' }];
    const t = tierQuestions(qs, 5);
    expect([t.easy.length, t.medium.length, t.advanced.length]).toEqual([2, 2, 2]);
    expect(tierQuestions(qs, 1).easy).toHaveLength(1);
  });
});
