import { describe, expect, it } from 'vitest';
import { ageTier, defaultControls, effectiveControls, stageOf } from './stages';

const now = new Date('2026-10-01T00:00:00Z');

describe('school stages and age groups', () => {
  it('maps grades to stages', () => {
    expect(['p1', 'm2', 's3', 'uni'].map((g) => stageOf(g as never))).toEqual(['primary', 'middle', 'secondary', 'university']);
  });
  it('takes the younger of birth year and grade, and treats unknown as adult', () => {
    expect(ageTier({ gradeLevel: 'p4' }, now)).toBe('child');
    expect(ageTier({ gradeLevel: 'm2' }, now)).toBe('teen');
    expect(ageTier({ gradeLevel: 'uni' }, now)).toBe('adult');
    expect(ageTier({ birthYear: 2016 }, now)).toBe('child');
    // Says university but was born 2014: still a child.
    expect(ageTier({ birthYear: 2014, gradeLevel: 'uni' }, now)).toBe('child');
    // Born 2000 but picked primary 3 (a younger profile): the stricter rule applies.
    expect(ageTier({ birthYear: 2000, gradeLevel: 'p3' }, now)).toBe('child');
    expect(ageTier({}, now)).toBe('adult');
    expect(ageTier({ gradeLevel: 'p2', accountType: 'teacher' }, now)).toBe('adult');
    // Switching the account type doesn't make a 15-year-old an adult.
    expect(ageTier({ birthYear: 2011, accountType: 'teacher' }, now)).toBe('teen');
  });
  it('controls: children start in classes-only mode, parents can open or tighten', () => {
    expect(defaultControls('child')).toEqual({ messages: 'classes', publicPosts: false, joinGroups: false, ai: true });
    expect(effectiveControls('child', { publicPosts: true })).toMatchObject({ messages: 'classes', publicPosts: true });
    expect(effectiveControls('teen', { ai: false })).toMatchObject({ messages: 'known', publicPosts: true, ai: false });
    // Adults are never restricted by stored controls.
    expect(effectiveControls('adult', { publicPosts: false, ai: false })).toMatchObject({ publicPosts: true, ai: true });
  });
});
