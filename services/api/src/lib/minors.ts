import { and, eq, sql } from 'drizzle-orm';
import type { Db } from '../db/client';
import { follows, users } from '../db/schema';

export const ADULT_AGE = 18;

/** Under 18 by birth year. Unknown age counts as adult (the field is asked at sign-up and in settings). */
export function isMinor(birthYear: number | null | undefined, now = new Date()): boolean {
  return typeof birthYear === 'number' && now.getUTCFullYear() - birthYear < ADULT_AGE;
}

/**
 * Whether `otherId` already knows the student: the student follows them, they share a study group, or they are in the
 * same course. Staff always count (moderators must be able to reach anyone).
 */
export async function knowsMinor(db: Db, minorId: string, otherId: string): Promise<boolean> {
  const [other] = await db.select({ role: users.role }).from(users).where(eq(users.id, otherId));
  if (!other) return false;
  if (other.role !== 'user') return true;
  const [f] = await db
    .select({ x: sql<number>`1` })
    .from(follows)
    .where(and(eq(follows.followerId, minorId), eq(follows.followeeId, otherId)))
    .limit(1);
  if (f) return true;
  const rows = await db.execute<{ x: number }>(sql`
    select 1 as x where exists (
      select 1 from group_members a join group_members b on a.group_id = b.group_id
      where a.user_id = ${minorId} and b.user_id = ${otherId}
    ) or exists (
      select 1 from course_members a join course_members b on a.course_id = b.course_id
      where a.user_id = ${minorId} and b.user_id = ${otherId}
    )`);
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
