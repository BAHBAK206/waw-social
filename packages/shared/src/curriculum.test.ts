import { describe, expect, it } from 'vitest';
import {
  itemAnalysis,
  nextObjectives,
  objectiveStatus,
  permuteOptions,
  pickFromBlueprint,
  seededRandom,
  optionPermutation,
  unpermuteAnswer,
} from './curriculum';

describe('exam blueprint', () => {
  const items = [
    ...Array.from({ length: 6 }, (_, i) => ({ id: `a${i}`, path: ['objA', 'unit1'], difficulty: 'easy' as const, bloom: 'remember' as const })),
    ...Array.from({ length: 4 }, (_, i) => ({ id: `b${i}`, path: ['objB', 'unit1'], difficulty: 'hard' as const, bloom: 'apply' as const })),
  ];
  it('picks per rule, never twice, the same for the same seed and different between students', () => {
    const rules = [
      { objectiveId: 'objA', count: 3 },
      { objectiveId: 'unit1', difficulty: 'hard' as const, count: 2 },
    ];
    const one = pickFromBlueprint(items, rules, 'student-1');
    expect(one.ids).toHaveLength(5);
    expect(new Set(one.ids).size).toBe(5);
    expect(one.ids.filter((x) => x.startsWith('a'))).toHaveLength(3);
    expect(one.missing).toEqual([0, 0]);
    expect(pickFromBlueprint(items, rules, 'student-1').ids).toEqual(one.ids);
    const others = ['s2', 's3', 's4', 's5'].map((s) => pickFromBlueprint(items, rules, s).ids.join());
    expect(new Set([one.ids.join(), ...others]).size).toBeGreaterThan(1);
  });
  it('reports what the bank could not fill', () => {
    expect(pickFromBlueprint(items, [{ objectiveId: 'objB', count: 6 }], 'x').missing).toEqual([2]);
  });
});

describe('option shuffling', () => {
  it('maps the displayed answer back to the original option', () => {
    const perm = optionPermutation(4, seededRandom('q1'));
    const shown = permuteOptions(['A', 'B', 'C', 'D'], perm);
    const pickB = shown.indexOf('B');
    expect(unpermuteAnswer(pickB, perm)).toBe(1);
    expect(unpermuteAnswer([shown.indexOf('A'), shown.indexOf('D')], perm)).toEqual([0, 3]);
    expect(unpermuteAnswer('text', perm)).toBe('text');
  });
});

describe('item analysis', () => {
  it('finds easy, hard and badly discriminating questions', () => {
    const attempts = Array.from({ length: 20 }, (_, i) => ({
      pct: i * 5,
      items: { easy: true, hard: i >= 17, good: i >= 10, bad: i < 10 },
    }));
    const [easy, hard, good, bad] = itemAnalysis(attempts, ['easy', 'hard', 'good', 'bad']);
    expect(easy).toMatchObject({ difficulty: 'easy', p: 1 });
    expect(hard).toMatchObject({ difficulty: 'hard' });
    expect(good).toMatchObject({ quality: 'good' });
    expect(bad!.discrimination).toBeLessThan(0);
    expect(bad!.quality).toBe('poor');
    expect(itemAnalysis(attempts.slice(0, 3), ['easy'])[0]!.p).toBeNull();
  });
});

describe('learning plan', () => {
  it('orders weak, then learning, then new objectives and skips mastered ones', () => {
    expect(objectiveStatus(null, 0)).toBe('new');
    expect(objectiveStatus(90, 5)).toBe('mastered');
    expect(objectiveStatus(30, 4)).toBe('weak');
    expect(objectiveStatus(60, 4)).toBe('learning');
    const list = [
      { id: 'o1', status: 'mastered' as const },
      { id: 'o2', status: 'new' as const },
      { id: 'o3', status: 'learning' as const },
      { id: 'o4', status: 'weak' as const },
      { id: 'o5', status: 'new' as const },
    ];
    expect(nextObjectives(list).map((o) => o.id)).toEqual(['o4', 'o3', 'o2']);
  });
});
