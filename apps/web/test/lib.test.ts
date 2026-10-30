import { createTranslator, LOCALE_LIST } from '@qubedu/i18n';
import { describe, expect, it } from 'vitest';
import { formatBytes, formatClock, fromLocalInput, relativeTime, toLocalInput, todayKey } from '../src/lib/format';
import { safeNext } from '../src/pages/auth/LoginPage';
import { savedHref } from '../src/pages/saved/SavedPage';

describe('format helpers', () => {
  const en = createTranslator('en');
  it('describes elapsed time in the active language', () => {
    const now = Date.now();
    expect(relativeTime(now - 5_000, en, now)).toBe(en.t('common.justNow'));
    expect(relativeTime(now - 5 * 60_000, en, now)).toBe('5 min ago');
    expect(relativeTime(now - 3 * 3_600_000, createTranslator('fr'), now)).toContain('3');
  });
  it('round-trips datetime-local values', () => {
    const t = new Date(2026, 9, 27, 14, 30).getTime();
    expect(fromLocalInput(toLocalInput(t))).toBe(t);
    expect(toLocalInput(null)).toBe('');
    expect(fromLocalInput('')).toBeNull();
  });
  it('formats sizes and clocks', () => {
    expect(formatBytes(512)).toBe('512 B');
    expect(formatBytes(1536)).toBe('1.5 KB');
    expect(formatClock(75)).toBe('01:15');
    expect(formatClock(3725)).toBe('1:02:05');
  });
  it('builds a YYYY-MM-DD key', () => {
    expect(todayKey(new Date(2026, 0, 5))).toBe('2026-01-05');
  });
  it('works for every locale', () => {
    for (const l of LOCALE_LIST) expect(() => relativeTime(0, createTranslator(l))).not.toThrow();
  });
});

describe('navigation safety', () => {
  it('only allows same-origin relative redirects after login', () => {
    expect(safeNext('/quiz/1')).toBe('/quiz/1');
    expect(safeNext('//evil.com')).toBe('/');
    expect(safeNext('https://evil.com')).toBe('/');
    expect(safeNext(null)).toBe('/');
  });
  it('resolves saved items to in-app or external links', () => {
    expect(savedHref({ itemType: 'quiz', refId: 'q1', url: null })).toBe('/quiz/q1');
    expect(savedHref({ itemType: 'link', refId: null, url: 'https://example.com' })).toBe('https://example.com');
    expect(savedHref({ itemType: 'post', refId: null, url: null })).toBeNull();
  });
});
