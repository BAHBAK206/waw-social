import { describe, expect, it } from 'vitest';
import { CAPABILITY_TABLE, can } from './capabilities';

describe('who can do what', () => {
  it('teachers need verification for public-facing powers', () => {
    expect(can({ accountType: 'teacher' }, 'createClass')).toBe(true);
    expect(can({ accountType: 'teacher' }, 'publishCatalog')).toBe(false);
    expect(can({ accountType: 'teacher', verifiedTeacher: true }, 'publishCatalog')).toBe(true);
    // A student can't be "verified" into teacher powers.
    expect(can({ accountType: 'student', verifiedTeacher: true }, 'publishCatalog')).toBe(false);
  });
  it('parents follow children but never join classes or grade', () => {
    expect(can({ accountType: 'parent' }, 'followChildren')).toBe(true);
    expect(can({ accountType: 'parent' }, 'joinClasses')).toBe(false);
    expect(can({ accountType: 'parent' }, 'gradeWork')).toBe(false);
    expect(can({ accountType: 'student' }, 'createClass')).toBe(false);
  });
  it('every row is unique', () => {
    expect(new Set(CAPABILITY_TABLE.map((r) => r.key)).size).toBe(CAPABILITY_TABLE.length);
  });
});

describe('navigation', () => {
  it('places every page in exactly one known section and orders all of them', async () => {
    const { FEATURES, FEATURE_CATEGORIES, NAV_ORDER, sectionItems } = await import('./index');
    const pages = FEATURES.filter((f) => f.kind === 'page' && !('route' in f && f.route.includes(':'))).map((f) => f.id);
    expect([...NAV_ORDER].sort()).toEqual([...pages].sort());
    for (const f of FEATURES) expect(FEATURE_CATEGORIES).toContain(f.category);
    expect(sectionItems('me', 'parent')).toContain('family');
    expect(sectionItems('classroom', 'teacher')).not.toContain('grades');
  });
});
