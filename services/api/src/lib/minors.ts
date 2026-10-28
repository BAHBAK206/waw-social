import { and, eq, sql } from 'drizzle-orm';
import type { Db } from '../db/client';
import { ageTier, CHILD_AGE, effectiveControls, GRADE_LEVELS, TYPICAL_AGE, type AgeTier, type ParentalControls } from '@qubedu/shared';
import { follows, guardianLinks, users } from '../db/schema';
import { forbidden } from './errors';

export { ADULT_AGE } from '@qubedu/shared';

/** The fields that decide a person's age group and, for students under 18, what their parent allows. */
export type MinorRow = {
  id: string;
  birthYear: number | null;
  gradeLevel?: string | null;
  accountType?: string | null;
  parentalControls?: Record<string, unknown> | null;
};

export const minorColumns = {
  id: users.id,
  birthYear: users.birthYear,
  gradeLevel: users.gradeLevel,
  accountType: users.accountType,
  parentalControls: users.parentalControls,
};

export const tierOf = (r: MinorRow): AgeTier => ageTier(r);
/** Under 18 (by birth year or school year, whichever is younger). */
export const isMinor = (r: MinorRow) => tierOf(r) !== 'adult';
export const controlsOf = (r: MinorRow): ParentalControls => effectiveControls(tierOf(r), r.parentalControls as Partial<ParentalControls> | null);

export async function isGuardian(db: Db, guardianId: string, studentId: string): Promise<boolean> {
  const [l] = await db
    .select({ x: guardianLinks.studentId })
    .from(guardianLinks)
    .where(and(eq(guardianLinks.guardianId, guardianId), eq(guardianLinks.studentId, studentId)))
    .limit(1);
  return !!l;
}

async function sharesClass(db: Db, a: string, b: string): Promise<boolean> {
  const rows = await db.execute<{ x: number }>(sql`
    select 1 as x from course_members a join course_members b on a.course_id = b.course_id
    where a.user_id = ${a} and b.user_id = ${b} limit 1`);
  return rows.length > 0;
}

/**
 * Whether `otherId` already knows the student. Always: staff, their linked parent, people in the same class.
 * Unless a parent limited messages to classes: also people the student follows and members of their study groups.
 */
export async function knowsMinor(db: Db, minor: MinorRow, otherId: string): Promise<boolean> {
  const [other] = await db.select({ role: users.role }).from(users).where(eq(users.id, otherId));
  if (!other) return false;
  if (other.role !== 'user') return true;
  if ((await isGuardian(db, otherId, minor.id)) || (await sharesClass(db, minor.id, otherId))) return true;
  if (controlsOf(minor).messages === 'classes') return false;
  const [f] = await db
    .select({ x: sql<number>`1` })
    .from(follows)
    .where(and(eq(follows.followerId, minor.id), eq(follows.followeeId, otherId)))
    .limit(1);
  if (f) return true;
  const rows = await db.execute<{ x: number }>(sql`
    select 1 as x from group_members a join group_members b on a.group_id = b.group_id
    where a.user_id = ${minor.id} and b.user_id = ${otherId} limit 1`);
  return rows.length > 0;
}

/**
 * Private messages involving a student under 18. An adult and a minor, or a child whose parent kept messages to
 * classes, can only talk when the student already knows the other person. Returns null when no rule applies (two
 * adults, or two teens), false when blocked, true when allowed but contact details must be stripped.
 */
export async function minorContactAllowed(db: Db, a: MinorRow, b: MinorRow): Promise<boolean | null> {
  const ta = tierOf(a);
  const tb = tierOf(b);
  if (ta === 'adult' && tb === 'adult') return null;
  const checks: [MinorRow, MinorRow][] = [];
  for (const [m, o, tm, to] of [
    [a, b, ta, tb],
    [b, a, tb, ta],
  ] as const) {
    if (tm === 'adult') continue;
    if (to === 'adult' || controlsOf(m).messages === 'classes') checks.push([m, o]);
  }
  if (!checks.length) return null;
  for (const [m, o] of checks) if (!(await knowsMinor(db, m, o.id))) return false;
  return true;
}

/** A parent may contact the teachers (and assistants) of their child's classes, even if the teacher only takes messages from people they follow. */
export async function isParentOfStudentTaughtBy(db: Db, guardianId: string, staffId: string): Promise<boolean> {
  const rows = await db.execute<{ x: number }>(sql`
    select 1 as x from guardian_links g
    join course_members s on s.user_id = g.student_id and s.role = 'student'
    join course_members t on t.course_id = s.course_id and t.user_id = ${staffId} and t.role in ('teacher', 'assistant')
    where g.guardian_id = ${guardianId} limit 1`);
  return rows.length > 0;
}

const PHONE = /(?:\+|00)?\d[\d\s().-]{7,}\d/g;
const EMAIL = /[\w.+-]+@[\w-]+(?:\.[\w-]+)+/g;
const LINK_HANDLE = /(?:wa\.me|t\.me|discord\.gg|snapchat\.com\/add|instagram\.com|tiktok\.com\/@?)\/?[\w.-]+/gi;
const NAMED_HANDLE =
  /(?<![\p{L}])(?:whatsapp|telegram|snapchat|snap|instagram|insta|ig|tiktok|discord|kik|واتس|واتساب|تليجرام|تلجرام|انستا|انستجرام|سناب)\s*(?::|@|：)\s*@?[\w.-]{3,}/giu;
const AR_DIGITS = /[٠-٩۰-۹]/g;

/**
 * Between an adult and a student under 18, private messages don't carry phone numbers, emails or handles for other apps:
 * conversations stay on the platform where they can be reported and moderated.
 */
export function stripContactInfo(text: string): { text: string; changed: boolean } {
  // Eastern Arabic digits are numbers too (٠١٢٣ → 0123) for detection.
  const western = text.replace(AR_DIGITS, (d) => String(Math.max('٠١٢٣٤٥٦٧٨٩'.indexOf(d), '۰۱۲۳۴۵۶۷۸۹'.indexOf(d))));
  let changed = false;
  const mark = () => {
    changed = true;
    return '[•••]';
  };
  let out = western.replace(EMAIL, mark).replace(LINK_HANDLE, mark).replace(NAMED_HANDLE, mark);
  out = out.replace(PHONE, (m) => {
    const digits = m.replace(/\D/g, '').length;
    if (/^\d+\.\d+$/.test(m.trim())) return m; // a decimal number from a lesson
    return (/^(\+|0)/.test(m) && digits >= 8) || digits >= 10 ? mark() : m;
  });
  return { text: changed ? out : text, changed };
}

/** Refuses an action a linked parent turned off (or that is off by default for under-13s). */
export async function requireControl(db: Db, userId: string, key: 'publicPosts' | 'joinGroups' | 'ai'): Promise<void> {
  const [row] = await db.select(minorColumns).from(users).where(eq(users.id, userId));
  if (row && !controlsOf(row)[key]) throw forbidden('parent_restricted');
}

const CHILD_GRADES = GRADE_LEVELS.filter((g) => (TYPICAL_AGE[g] ?? 99) < CHILD_AGE);

/**
 * People search and suggestions: students under 13 are only found by their classmates, teachers, parents and staff.
 * Returns undefined (no filter) for staff.
 */
export function childFindableSql(viewer: { id: string; role: string }) {
  if (viewer.role !== 'user') return undefined;
  return sql`(not (
      (${users.birthYear} is not null and extract(year from now())::int - ${users.birthYear} < ${CHILD_AGE})
      or (${users.accountType} = 'student' and ${users.gradeLevel} in (${sql.join(
        CHILD_GRADES.map((g) => sql`${g}`),
        sql`, `,
      )}))
    )
    or exists (select 1 from course_members a join course_members b on a.course_id = b.course_id where a.user_id = ${users.id} and b.user_id = ${viewer.id})
    or exists (select 1 from guardian_links g where g.student_id = ${users.id} and g.guardian_id = ${viewer.id}))`;
}
