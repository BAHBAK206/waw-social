import { describe, expect, it } from 'vitest';
import { overallResult, ratingOf, scaleTo, subjectResult } from './gradebook';

describe('subject grading', () => {
  it('adds components out of the subject total and rates the percentage', () => {
    // Math out of 60: homework 10, monthly test 20, final 30.
    const r = subjectResult({
      maxMarks: 60,
      passMarks: 30,
      components: [
        { max: 10, earned: 9 },
        { max: 20, earned: 15.5 },
        { max: 30, earned: 27 },
      ],
    });
    expect(r).toMatchObject({ score: 51.5, max: 60, gradedMax: 60, percent: 85.8, passed: true, rating: 'excellent', complete: true });
  });
  it('rates on graded work only until the term is complete', () => {
    const r = subjectResult({
      maxMarks: 80,
      passMarks: 40,
      components: [
        { max: 20, earned: 10 },
        { max: 60, earned: null },
      ],
    });
    expect(r).toMatchObject({ score: 10, max: 80, gradedMax: 20, percent: 50, passed: true, rating: 'pass', complete: false });
    expect(subjectResult({ maxMarks: 80, passMarks: 40, components: [{ max: 80, earned: null }] }).percent).toBeNull();
  });
  it('uses the subject pass mark (e.g. 40%) and clamps marks', () => {
    expect(subjectResult({ maxMarks: 100, passMarks: 40, components: [{ max: 100, earned: 42 }] }).rating).toBe('pass');
    expect(subjectResult({ maxMarks: 100, passMarks: 50, components: [{ max: 100, earned: 42 }] }).rating).toBe('fail');
    expect(subjectResult({ maxMarks: 10, passMarks: 5, components: [{ max: 10, earned: 14 }] }).score).toBe(10);
  });
  it('bands and scaling', () => {
    expect([90, 80, 70, 55, 30].map((p) => ratingOf(p))).toEqual(['excellent', 'veryGood', 'good', 'pass', 'fail']);
    expect(scaleTo(20, 45, 50)).toBe(18);
    expect(scaleTo(20, 0, 0)).toBeNull();
  });
  it('overall total skips subjects that do not count', () => {
    const math = subjectResult({ maxMarks: 60, passMarks: 30, components: [{ max: 60, earned: 54 }] });
    const religion = subjectResult({ maxMarks: 40, passMarks: 20, components: [{ max: 40, earned: 10 }] });
    const o = overallResult([
      { result: math, countsInTotal: true },
      { result: religion, countsInTotal: false },
    ]);
    expect(o).toMatchObject({ score: 54, max: 60, percent: 90, rating: 'excellent', failed: 1 });
  });
});
