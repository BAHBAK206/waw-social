import { describe, expect, it } from 'vitest';
import { createTranslator, interpolate, messageVariables } from '../src';

describe('translator', () => {
  it('resolves nested keys with interpolation', () => {
    const en = createTranslator('en');
    expect(en.t('quiz.player.questionOf', { n: 2, total: 5 })).toBe('Question 2 of 5');
    expect(en.dir).toBe('ltr');
    expect(createTranslator('ar').dir).toBe('rtl');
  });
  it('handles runtime keys with fallback', () => {
    const fr = createTranslator('fr');
    expect(fr.tDyn('errors.not_a_real_code', undefined, 'x')).toBe('x');
    expect(fr.tDyn('errors.network')).not.toBe('errors.network');
    expect(fr.has('common.save')).toBe(true);
    expect(fr.has('common')).toBe(false);
  });
  it('leaves unknown placeholders untouched', () => {
    expect(interpolate('{{a}} {{ b }}', { a: 1 })).toBe('1 {{ b }}');
  });
});

describe('plurals', () => {
  const ar = '{count, plural, zero {لا أسئلة} one {سؤال واحد} two {سؤالان} few {# أسئلة} many {# سؤالًا} other {# سؤال}}';
  it('uses all six Arabic categories', () => {
    expect([0, 1, 2, 3, 10, 11, 99, 100, 102, 103].map((count) => interpolate(ar, { count }, 'ar'))).toEqual([
      'لا أسئلة',
      'سؤال واحد',
      'سؤالان',
      '3 أسئلة',
      '10 أسئلة',
      '11 سؤالًا',
      '99 سؤالًا',
      '100 سؤال',
      '102 سؤال',
      '103 أسئلة',
    ]);
  });
  it('prefers exact matches, keeps surrounding text and placeholders, and falls back to other', () => {
    const en = 'Saved {count, plural, =0 {nothing} one {# card} other {# cards}} for {{who}}';
    expect(interpolate(en, { count: 0, who: 'you' })).toBe('Saved nothing for you');
    expect(interpolate(en, { count: 1, who: 'you' })).toBe('Saved 1 card for you');
    expect(interpolate(en, { count: '1.2K', who: 'you' })).toBe('Saved 1.2K cards for you');
    expect(interpolate('{n, plural, one {un} other {#}} élève', { n: 0 }, 'fr')).toBe('un élève');
  });
  it('lists variables used by a message', () => {
    expect(messageVariables('{count, plural, one {# x} other {# xs}} · {{avg}}%')).toEqual(['avg', 'count']);
  });
});
