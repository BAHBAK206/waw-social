import { describe, expect, it } from 'vitest';
import { DESIGNS, SKINS } from '@qubedu/shared';
import { buildThemeCss, contrast, resolveTheme } from '../src';

const AA = 4.5;

describe('WCAG AA contrast for every design × skin × mode', () => {
  const failures: string[] = [];
  for (const design of DESIGNS)
    for (const skin of SKINS)
      for (const mode of ['light', 'dark'] as const) {
        const t = resolveTheme(design, skin, mode);
        const surfaces = { bg: t.bg, card: t.cardSolid };
        for (const [sname, s] of Object.entries(surfaces)) {
          for (const key of ['text', 'text2', 'text3', 'primaryInk', 'ok', 'err', 'info', 'warn'] as const) {
            const c = contrast(t[key], s);
            if (c < AA) failures.push(`${design}/${skin}/${mode} ${key} on ${sname} = ${c.toFixed(2)}`);
          }
        }
        for (const fill of [t.primary, t.gradient[0], t.gradient[1], t.gradientDark[0], t.gradientDark[1]]) {
          const c = contrast(t.onPrimary, fill);
          if (c < AA) failures.push(`${design}/${skin}/${mode} onPrimary on ${fill} = ${c.toFixed(2)}`);
        }
        for (const fill of [t.okFill, t.errFill, t.infoFill, t.warnFill]) {
          if (contrast('#ffffff', fill) < AA) failures.push(`${mode} white on ${fill}`);
        }
      }
  it('has no failures', () => {
    expect(failures).toEqual([]);
  });
});

describe('css', () => {
  it('builds attribute-scoped variables', () => {
    const css = buildThemeCss();
    expect(css).toContain('[data-design="glass"][data-theme="dark"]');
    expect(css).toContain('[data-skin="burgundy"][data-theme="dark"]');
    expect(css).toContain('--primary:#6c5ce7');
  });
});
