import { GRADE_LEVELS, type GradeLevel } from './stages';
import { parseCsv } from './text';

export const SCHOOL_ROLES = ['admin', 'teacher', 'student', 'parent'] as const;
export type SchoolRole = (typeof SCHOOL_ROLES)[number];

export interface SchoolImportRow {
  name: string;
  email: string | null;
  role: SchoolRole;
  gradeLevel: GradeLevel | null;
  section: string | null;
  studentNumber: string | null;
  parentEmail: string | null;
  parentName: string | null;
}

/** Column names a school's spreadsheet may use (English, Arabic, French). */
const HEADERS: Record<keyof SchoolImportRow, string[]> = {
  name: ['name', 'full name', 'student name', 'الاسم', 'اسم الطالب', 'الاسم الكامل', 'nom', 'nom complet'],
  email: ['email', 'e-mail', 'mail', 'البريد', 'البريد الإلكتروني', 'الإيميل', 'courriel'],
  role: ['role', 'type', 'الدور', 'النوع', 'الصفة', 'rôle'],
  gradeLevel: ['grade', 'year', 'school year', 'level', 'الصف', 'السنة', 'المرحلة', 'الصف الدراسي', 'niveau', 'classe niveau'],
  section: ['class', 'section', 'homeroom', 'الفصل', 'الشعبة', 'classe'],
  studentNumber: ['number', 'student number', 'id', 'student id', 'رقم الطالب', 'الرقم', 'رقم الجلوس', 'رقم القيد', 'matricule'],
  parentEmail: ['parent email', 'guardian email', 'بريد ولي الأمر', 'إيميل ولي الأمر', 'email parent'],
  parentName: ['parent name', 'guardian name', 'اسم ولي الأمر', 'nom du parent'],
};

const ROLE_WORDS: Record<string, SchoolRole> = {
  student: 'student',
  pupil: 'student',
  طالب: 'student',
  طالبة: 'student',
  تلميذ: 'student',
  élève: 'student',
  eleve: 'student',
  teacher: 'teacher',
  معلم: 'teacher',
  معلمة: 'teacher',
  مدرس: 'teacher',
  مدرسة: 'teacher',
  enseignant: 'teacher',
  professeur: 'teacher',
  parent: 'parent',
  guardian: 'parent',
  'ولي أمر': 'parent',
  'ولي الأمر': 'parent',
  'ولية أمر': 'parent',
  admin: 'admin',
  مدير: 'admin',
  مديرة: 'admin',
  إداري: 'admin',
  إدارة: 'admin',
  directeur: 'admin',
};

/** "p1", "P 1", "1 ابتدائي", "primary 1", "3 إعدادي", "2 ثانوي", "university" → a school year code. */
export function parseGradeLevel(raw: string): GradeLevel | null {
  const s = raw.trim().toLowerCase().replace(/\s+/g, ' ');
  if (!s) return null;
  const compact = s.replace(/\s/g, '');
  if ((GRADE_LEVELS as readonly string[]).includes(compact)) return compact as GradeLevel;
  const n = Number(/\d+/.exec(s.replace(/[٠-٩]/g, (d) => String('٠١٢٣٤٥٦٧٨٩'.indexOf(d))))?.[0]);
  if (/جامع|univ/.test(s)) return 'uni';
  if (!n) return null;
  if (/ابتدا|primary|prim/.test(s) && n <= 6) return `p${n}` as GradeLevel;
  if (/إعدا|اعدا|متوسط|middle|prep|collège|college/.test(s) && n <= 3) return `m${n}` as GradeLevel;
  if (/ثانو|secondary|high|lycée|lycee/.test(s) && n <= 3) return `s${n}` as GradeLevel;
  // A bare number counts years from the first year of primary (1–12).
  if (/^\d+$/.test(compact) && n >= 1 && n <= 12) return GRADE_LEVELS[n - 1]!;
  return null;
}

/**
 * Reads a school's people spreadsheet (CSV). The first row names the columns; only "name" is required.
 * Role defaults to student. Bad rows are reported by line number, not dropped silently.
 */
export function parseSchoolCsv(text: string): { rows: SchoolImportRow[]; errors: { line: number; reason: 'name' | 'email' | 'role' | 'grade' }[] } {
  const table = parseCsv(text);
  const head = (table[0] ?? []).map((h) => h.toLowerCase().replace(/[_*]/g, ' ').trim());
  const col = (k: keyof SchoolImportRow) => head.findIndex((h) => HEADERS[k].includes(h));
  const idx = Object.fromEntries((Object.keys(HEADERS) as (keyof SchoolImportRow)[]).map((k) => [k, col(k)])) as Record<keyof SchoolImportRow, number>;
  const rows: SchoolImportRow[] = [];
  const errors: { line: number; reason: 'name' | 'email' | 'role' | 'grade' }[] = [];
  const email = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
  table.slice(1).forEach((r, i) => {
    const line = i + 2;
    const get = (k: keyof SchoolImportRow) => (idx[k] >= 0 ? (r[idx[k]] ?? '').trim() : '');
    const name = get('name');
    if (name.length < 2) return void errors.push({ line, reason: 'name' });
    const roleRaw = get('role').toLowerCase();
    const role = roleRaw ? ROLE_WORDS[roleRaw] : 'student';
    if (!role) return void errors.push({ line, reason: 'role' });
    const mail = get('email').toLowerCase();
    const parentMail = get('parentEmail').toLowerCase();
    if ((mail && !email.test(mail)) || (parentMail && !email.test(parentMail))) return void errors.push({ line, reason: 'email' });
    const gradeRaw = get('gradeLevel');
    const gradeLevel = gradeRaw ? parseGradeLevel(gradeRaw) : null;
    if (gradeRaw && !gradeLevel) return void errors.push({ line, reason: 'grade' });
    rows.push({
      name: name.slice(0, 80),
      email: mail || null,
      role,
      gradeLevel: role === 'student' ? gradeLevel : null,
      section: get('section').slice(0, 20) || null,
      studentNumber: get('studentNumber').slice(0, 40) || null,
      parentEmail: role === 'student' ? parentMail || null : null,
      parentName: role === 'student' ? get('parentName').slice(0, 80) || null : null,
    });
  });
  return { rows, errors };
}
