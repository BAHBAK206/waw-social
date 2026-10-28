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
