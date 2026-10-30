import { randomBytes } from 'node:crypto';
import { buildIcs, type CalendarEvent } from '@qubedu/shared';
import { eq, sql } from 'drizzle-orm';
import { Hono } from 'hono';
import { users } from '../db/schema';
import type { AppEnv, Deps } from '../lib/context';
import { notFound } from '../lib/errors';
import { requireUser } from '../lib/http';
import { checkRate } from '../middleware';

const feedUrl = (deps: Deps, token: string) => `${deps.env.API_PUBLIC_URL.replace(/\/$/, '')}/api/v1/calendar/${token}.ics`;

/** Everything with a date in a person's study life: homework, exams, study sessions, tasks, workshops, live classes. */
async function eventsFor(deps: Deps, userId: string): Promise<CalendarEvent[]> {
  const app = deps.env.APP_URL.replace(/\/$/, '');
  const since = sql`now() - interval '30 days'`;
  const [homework, exams, sessions, tasks, workshops, live] = await Promise.all([
    deps.db.execute<{ id: string; title: string; due_at: Date; course: string; course_id: string }>(sql`
      select a.id, a.title, a.due_at, c.title as course, c.id as course_id from assignments a
      join course_members m on m.course_id = a.course_id and m.user_id = ${userId}
      join courses c on c.id = a.course_id
      where a.due_at is not null and a.due_at > ${since} and a.state <> 'draft' and (a.release_at is null or a.release_at <= now())`),
    deps.db.execute<{ id: string; subject: string; day: string; time: string | null; place: string | null }>(sql`
      select id, subject, day::text as day, time, place from exams where user_id = ${userId} and day >= (now() - interval '30 days')::date`),
    deps.db.execute<{ id: string; title: string; day: string; start_time: string | null; minutes: number }>(sql`
      select id, title, day::text as day, start_time, minutes from study_sessions where user_id = ${userId} and day >= (now() - interval '30 days')::date`),
    deps.db.execute<{ id: string; title: string; due_at: Date }>(sql`
      select id, title, due_at from tasks where user_id = ${userId} and due_at is not null and status <> 'done' and due_at > ${since}`),
    deps.db.execute<{ id: string; title: string; starts_at: Date; ends_at: Date | null; location: string; online_url: string | null }>(sql`
      select e.id, e.title, e.starts_at, e.ends_at, e.location, e.online_url from events e
      join event_rsvps r on r.event_id = e.id and r.user_id = ${userId}
      where e.deleted_at is null and e.starts_at > ${since}`),
    deps.db.execute<{ id: string; title: string; scheduled_at: Date }>(sql`
      select l.id, l.title, l.scheduled_at from live_rooms l
      where l.status = 'scheduled' and l.scheduled_at is not null and l.scheduled_at > ${since} and (
        l.host_id = ${userId}
        or (l.scope_type = 'course' and l.scope_id in (select course_id from course_members where user_id = ${userId}))
        or (l.scope_type in ('group', 'community') and l.scope_id in (select group_id from group_members where user_id = ${userId})))`),
  ]);
  // Local wall-clock times ("09:30") are written in UTC here; date-only items are all-day.
  const at = (day: string, time: string | null) => (time ? Date.parse(`${day}T${time}:00Z`) : undefined);
  return [
    ...homework.map((h) => ({
      uid: `hw-${h.id}`,
      title: `📝 ${h.title}`,
      description: h.course,
      start: new Date(h.due_at).getTime(),
      end: new Date(h.due_at).getTime(),
      url: `${app}/school/assignments/${h.id}`,
    })),
    ...exams.map((e) => {
      const start = at(e.day, e.time);
      return start
        ? { uid: `ex-${e.id}`, title: `🎯 ${e.subject}`, location: e.place ?? undefined, start, end: start + 2 * 3600_000 }
        : { uid: `ex-${e.id}`, title: `🎯 ${e.subject}`, location: e.place ?? undefined, day: e.day };
    }),
    ...sessions.map((s) => {
      const start = at(s.day, s.start_time);
      return start
        ? { uid: `ss-${s.id}`, title: `📚 ${s.title}`, start, end: start + s.minutes * 60_000 }
        : { uid: `ss-${s.id}`, title: `📚 ${s.title}`, day: s.day };
    }),
    ...tasks.map((t) => ({
      uid: `tk-${t.id}`,
      title: `✅ ${t.title}`,
      start: new Date(t.due_at).getTime(),
      end: new Date(t.due_at).getTime(),
      url: `${app}/organizer?tab=tasks`,
    })),
    ...workshops.map((w) => ({
      uid: `ev-${w.id}`,
      title: `🧑‍🏫 ${w.title}`,
      start: new Date(w.starts_at).getTime(),
      end: w.ends_at ? new Date(w.ends_at).getTime() : undefined,
      location: w.location || w.online_url || undefined,
      url: `${app}/events/${w.id}`,
    })),
    ...live.map((l) => ({ uid: `lv-${l.id}`, title: `🔴 ${l.title}`, start: new Date(l.scheduled_at).getTime(), url: `${app}/live/${l.id}` })),
  ];
}

/** The feed itself: secret link, no sign-in (calendar apps can't sign in). */
export const calendarRoutes = new Hono<AppEnv>().get('/:file', async (c) => {
  await checkRate(c, { bucket: 'calendar-feed', limit: 120, windowSec: 3600 });
  const deps = c.get('deps');
  const token = (c.req.param('file') ?? '').replace(/\.ics$/, '');
  if (!/^[A-Za-z0-9_-]{32,64}$/.test(token)) throw notFound();
  const [u] = await deps.db.select({ id: users.id, name: users.displayName }).from(users).where(eq(users.calendarToken, token));
  if (!u) throw notFound();
  const ics = buildIcs(`Qubedu — ${u.name}`, await eventsFor(deps, u.id));
  return c.body(ics, 200, { 'content-type': 'text/calendar; charset=utf-8', 'cache-control': 'private, max-age=600' });
});

export const myCalendarRoutes = new Hono<AppEnv>()
  .get('/', async (c) => {
    const viewer = requireUser(c);
    const deps = c.get('deps');
    const [u] = await deps.db.select({ token: users.calendarToken }).from(users).where(eq(users.id, viewer.id));
    let token = u?.token;
    if (!token) {
      token = randomBytes(24).toString('base64url');
      await deps.db.update(users).set({ calendarToken: token }).where(eq(users.id, viewer.id));
    }
    return c.json({ url: feedUrl(deps, token) });
  })
  /** A new secret link (the old one stops working — e.g. after sharing it by mistake). */
  .post('/reset', async (c) => {
    const viewer = requireUser(c);
    const deps = c.get('deps');
    const token = randomBytes(24).toString('base64url');
    await deps.db.update(users).set({ calendarToken: token }).where(eq(users.id, viewer.id));
    return c.json({ url: feedUrl(deps, token) });
  });
