import { describe, expect, it } from 'vitest';
import { ACHIEVEMENTS, FEATURE_IDS, ADMIN_PERMISSIONS, DESIGNS, SKINS } from '@qubedu/shared';
import { INFO_CONTENT, LOCALES, LOCALE_LIST, detectLocale, dirFor, keyPaths } from '../src';

describe('translations', () => {
  const base = keyPaths(LOCALES.en).sort();
  for (const l of LOCALE_LIST) {
    it(`${l} has exactly the same keys (and array lengths) as English`, () => {
      expect(keyPaths(LOCALES[l]).sort()).toEqual(base);
    });
    it(`${l} interpolation placeholders match English`, () => {
      const placeholders = (s: string) => (s.match(/{{\s*\w+\s*}}/g) ?? []).sort();
      const walk = (a: unknown, b: unknown, path: string) => {
        if (typeof a === 'string' && typeof b === 'string') expect(placeholders(b), path).toEqual(placeholders(a));
        else if (a && typeof a === 'object') for (const k of Object.keys(a)) walk((a as never)[k], (b as never)[k], `${path}.${k}`);
      };
      walk(LOCALES.en, LOCALES[l], l);
    });
    it(`${l} info pages are complete`, () => {
      expect(INFO_CONTENT[l].help.faq.length).toBe(INFO_CONTENT.en.help.faq.length);
      expect(INFO_CONTENT[l].privacy.sections.length).toBe(INFO_CONTENT.en.privacy.sections.length);
    });
  }

  it('covers every shared registry id', () => {
    for (const id of FEATURE_IDS) expect(LOCALES.en.features, id).toHaveProperty([id]);
    for (const a of ACHIEVEMENTS) expect(LOCALES.en.achievements.items, a.key).toHaveProperty([a.key]);
    for (const p of ADMIN_PERMISSIONS) expect(LOCALES.en.admin.permissions, p).toHaveProperty([p]);
    for (const d of DESIGNS) expect(LOCALES.en.settings.appearance.designs).toHaveProperty([d]);
    for (const s of SKINS) expect(LOCALES.en.settings.appearance.skins).toHaveProperty([s]);
  });

  it('detects locale and direction', () => {
    expect(detectLocale(['fr-FR', 'en'])).toBe('fr');
    expect(detectLocale(['de-DE'])).toBe('ar');
    expect(dirFor('ar')).toBe('rtl');
    expect(dirFor('es')).toBe('ltr');
  });
});
