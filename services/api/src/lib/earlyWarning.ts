import { createTranslator, isLocale } from '@qubedu/i18n';
import { and, eq, gte, inArray, isNotNull, isNull, lte, sql } from 'drizzle-orm';
import { courseMembers, guardianLinks, meetingSlots, users } from '../db/schema';
import type { Deps } from './context';
import { studentRisk } from './insights';
import { notify } from './notify';
import { whenFor } from './when';
import { messagePerson } from './parentMessages';

const localeOf = (appearance: unknown) => {
  const l = (appearance as { language?: string } | null)?.language;
  return isLocale(l) ? l : 'ar';
};

/**
 * Looks at every student who has a parent linked: when the signals say "needs help" (homework, grades, attendance,
 * inactivity), the parents and the student's teachers are told once, and not again for a week.
 */
export async function sendEarlyWarnings(deps: Deps, limit = 300): Promise<number> {
  const kids = await deps.db
    .selectDistinct({ id: guardianLinks.studentId })
    .from(guardianLinks)
    .where(sql`not exists (select 1 from early_warnings w where w.student_id = ${guardianLinks.studentId} and w.created_at > now() - interval '7 days')`)
    .limit(limit);
  let sent = 0;
  for (const { id } of kids) {
    const r = await studentRisk(deps.db, id);
    if (r.risk.level !== 'high' && !(r.risk.level === 'watch' && r.risk.reasons.length >= 3)) continue;
    // One warning per student per week, even with several API instances running.
    const inserted = await deps.db.execute<{ id: string }>(sql`
      insert into early_warnings (student_id, level, reasons)
      select ${id}, ${r.risk.level}, ${JSON.stringify(r.risk.reasons)}::jsonb
      where not exists (select 1 from early_warnings where student_id = ${id} and created_at > now() - interval '7 days')
      returning id`);
    if (!inserted.length) continue;
    sent += 1;
    const [child] = await deps.db.select({ name: users.displayName }).from(users).where(eq(users.id, id));
    const parents = await deps.db.select({ id: guardianLinks.guardianId }).from(guardianLinks).where(eq(guardianLinks.studentId, id));
    const teachers = await deps.db
      .selectDistinct({ id: courseMembers.userId })
      .from(courseMembers)
      .where(
        and(
          eq(courseMembers.role, 'teacher'),
          inArray(
            courseMembers.courseId,
            deps.db
              .select({ c: courseMembers.courseId })
              .from(courseMembers)
              .where(and(eq(courseMembers.userId, id), eq(courseMembers.role, 'student'))),
          ),
        ),
      );
    const people = await deps.db
      .select({ id: users.id, appearance: users.appearance })
      .from(users)
      .where(
        inArray(
          users.id,
          [...parents.map((p) => p.id), ...teachers.map((t) => t.id)].length ? [...parents.map((p) => p.id), ...teachers.map((t) => t.id)] : [id],
        ),
      );
    const lang = new Map(people.map((p) => [p.id, localeOf(p.appearance)]));
    const reasonsFor = (userId: string) => {
      const tr = createTranslator(lang.get(userId) ?? 'ar');
      return r.risk.reasons
        .slice(0, 3)
        .map((x) => tr.tDyn(`insights.reason.${x}`))
        .join('، ');
    };
    const name = child?.name ?? '';
    await notify(deps, [
      ...parents.map((p) => ({
        userId: p.id,
        type: 'early_warning',
        icon: 'triangle-alert',
        link: `/family?child=${id}`,
        data: { name, reasons: reasonsFor(p.id) },
        pref: 'school' as const,
      })),
      ...teachers.map((t) => ({
        userId: t.id,
        type: 'early_warning_teacher',
        icon: 'triangle-alert',
        link: '/school',
        data: { name, reasons: reasonsFor(t.id) },
        pref: 'school' as const,
      })),
    ]);
    const link = `${deps.env.APP_URL.replace(/\/$/, '')}/family?child=${id}`;
    for (const p of parents)
      await messagePerson(deps, p.id, { kind: 'alert', key: 'early_warning', vars: { name, reasons: reasonsFor(p.id), link } }).catch(() => false);
  }
  return sent;
}

/** Reminds both sides of a booked meeting a day before and an hour before it starts (each once). */
export async function sendMeetingReminders(deps: Deps): Promise<number> {
  const now = Date.now();
  let n = 0;
  // The hour reminder goes first and also covers the day reminder (a meeting booked for later today is announced once).
  for (const [column, from, ahead, key] of [
    [meetingSlots.remindedHourAt, 0, 3_600_000, 'hour'],
    [meetingSlots.remindedDayAt, 3_600_000, 24 * 3_600_000, 'day'],
  ] as const) {
    const due = await deps.db
      .update(meetingSlots)
      .set(key === 'day' ? { remindedDayAt: new Date() } : { remindedHourAt: new Date(), remindedDayAt: new Date() })
      .where(
        and(
          eq(meetingSlots.status, 'booked'),
          isNull(column),
          isNotNull(meetingSlots.bookedBy),
          gte(meetingSlots.startsAt, new Date(now + from)),
          lte(meetingSlots.startsAt, new Date(now + ahead)),
        ),
      )
      .returning();
    for (const s of due) {
      n += 1;
      const people = [s.bookedBy!, s.teacherId];
      const rows = await deps.db
        .select({ id: users.id, name: users.displayName })
        .from(users)
        .where(inArray(users.id, [...people, ...(s.studentId ? [s.studentId] : [])]));
      const name = (uid: string | null) => rows.find((r) => r.id === uid)?.name ?? '';
      await notify(
        deps,
        await Promise.all(
          people.map(async (userId) => ({
            userId,
            type: 'meeting_reminder',
            icon: 'calendar-clock',
            link: '/meetings',
            data: {
              when: await whenFor(deps, userId, s.startsAt),
              other: userId === s.teacherId ? name(s.bookedBy) : name(s.teacherId),
              student: name(s.studentId),
            },
            pref: 'school' as const,
          })),
        ),
      );
      const link = `${deps.env.APP_URL.replace(/\/$/, '')}/meetings`;
      await messagePerson(deps, s.bookedBy!, {
        kind: 'alert',
        key: 'meeting_reminder',
        vars: { teacher: name(s.teacherId), student: name(s.studentId), when: await whenFor(deps, s.bookedBy!, s.startsAt), link },
      }).catch(() => false);
    }
  }
  return n;
}

export function startParentWorkers(deps: Deps): () => void {
  const warn = () => void sendEarlyWarnings(deps).catch((err) => deps.log.warn({ err }, 'early warnings failed'));
  const meet = () => void sendMeetingReminders(deps).catch((err) => deps.log.warn({ err }, 'meeting reminders failed'));
  const a = setInterval(warn, 6 * 3_600_000);
  const b = setInterval(meet, 5 * 60_000);
  setTimeout(warn, 90_000);
  setTimeout(meet, 30_000);
  return () => {
    clearInterval(a);
    clearInterval(b);
  };
}
