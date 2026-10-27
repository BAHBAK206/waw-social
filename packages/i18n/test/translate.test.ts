import { describe, expect, it } from 'vitest';
import { createTranslator, interpolate } from '../src';

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
