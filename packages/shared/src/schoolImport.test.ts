import { describe, expect, it } from 'vitest';
import { parseGradeLevel, parseSchoolCsv } from './schoolImport';
import { parseCsv } from './text';

describe('school spreadsheet import', () => {
  it('reads CSV with quotes, semicolons and a BOM', () => {
    expect(parseCsv('\uFEFFa;b\r\n"x; y";"say ""hi"""\n\n')).toEqual([
      ['a', 'b'],
      ['x; y', 'say "hi"'],
    ]);
  });

  it('understands school years written in different ways', () => {
    expect(parseGradeLevel('p3')).toBe('p3');
    expect(parseGradeLevel('3 ابتدائي')).toBe('p3');
    expect(parseGradeLevel('الصف ٢ الإعدادي')).toBe('m2');
    expect(parseGradeLevel('Secondary 1')).toBe('s1');
    expect(parseGradeLevel('7')).toBe('m1');
    expect(parseGradeLevel('جامعة')).toBe('uni');
    expect(parseGradeLevel('kindergarten')).toBeNull();
  });

  it('maps Arabic and English columns and reports bad lines', () => {
    const csv = [
      'الاسم,الدور,الصف,الفصل,رقم الطالب,بريد ولي الأمر',
      'علي حسن,طالب,5 ابتدائي,5A,1024,mona@example.com',
      'Ms Salma,معلمة,,,,',
      'X,طالب,,,,',
      'Omar,طالب,kindergarten,,,',
      'Hana,boss,,,,',
    ].join('\n');
    const { rows, errors } = parseSchoolCsv(csv);
    expect(rows).toEqual([
      {
        name: 'علي حسن',
        email: null,
        role: 'student',
        gradeLevel: 'p5',
        section: '5A',
        studentNumber: '1024',
        parentEmail: 'mona@example.com',
        parentName: null,
      },
      { name: 'Ms Salma', email: null, role: 'teacher', gradeLevel: null, section: null, studentNumber: null, parentEmail: null, parentName: null },
    ]);
    expect(errors).toEqual([
      { line: 4, reason: 'name' },
      { line: 5, reason: 'grade' },
      { line: 6, reason: 'role' },
    ]);
  });
});
