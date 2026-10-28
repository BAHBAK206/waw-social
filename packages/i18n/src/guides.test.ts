import { GUIDE_LIST } from '@qubedu/shared';
import { describe, expect, it } from 'vitest';
import { GUIDES, LOCALE_LIST } from './index';

describe('feature guides', () => {
  it('every language has every guide with the same number of steps and tips', () => {
    for (const g of GUIDE_LIST) {
      const base = GUIDES.en[g.id];
      expect(base.steps.length).toBeGreaterThanOrEqual(3);
      if (g.detailed) {
        expect(base.tips?.length ?? 0).toBeGreaterThan(0);
        expect(base.roles).toBeDefined();
      }
      for (const l of LOCALE_LIST) {
        const x = GUIDES[l][g.id];
        expect(x.title.length, `${l}.${g.id}`).toBeGreaterThan(1);
        expect(x.steps.length, `${l}.${g.id}.steps`).toBe(base.steps.length);
        expect(x.tips?.length ?? 0, `${l}.${g.id}.tips`).toBe(base.tips?.length ?? 0);
        expect(!!x.roles, `${l}.${g.id}.roles`).toBe(!!base.roles);
        for (const s of [x.summary, ...x.steps, ...(x.tips ?? [])]) expect(s).not.toMatch(/\{\{|\}\}/);
      }
    }
  });
});
