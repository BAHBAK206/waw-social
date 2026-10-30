import { createHash } from 'node:crypto';
import {
  complaintInputSchema,
  complaintReviewSchema,
  dayKey,
  extraTimeSchema,
  lowMoodAlert,
  moodInputSchema,
  randomCode,
  remainingMinutes,
  timeLimitSchema,
  URGENT_COMPLAINTS,
  addDays,
  type ComplaintDto,
  type ComplaintStatusDto,
  type MoodDto,
  type UsageDto,
} from '@qubedu/shared';
import { and, asc, desc, eq, gte, sql } from 'drizzle-orm';
import { Hono } from 'hono';
import { complaints, guardianLinks, moodChecks, schoolMembers, usageLog, users } from '../db/schema';
import type { AppEnv, AuthUser, Deps } from '../lib/context';
import { badRequest, forbidden, notFound } from '../lib/errors';
import { body, param, requireUser } from '../lib/http';
import { notify } from '../lib/notify';
import { checkRate } from '../middleware';
import { requireSchoolRole } from './schools';

const codeHash = (deps: Deps, code: string) =>
  createHash('sha256')
    .update(`complaint:${deps.env.JWT_SECRET}:${code.toUpperCase().replace(/\s+/g, '')}`)
    .digest('hex');

async function isGuardianOf(deps: Deps, guardianId: string, studentId: string) {
  const [l] = await deps.db
    .select({ g: guardianLinks.guardianId })
    .from(guardianLinks)
    .where(and(eq(guardianLinks.guardianId, guardianId), eq(guardianLinks.studentId, studentId)));
  return !!l;
}

async function usageOf(deps: Deps, userId: string, tz: string): Promise<UsageDto> {
  const [u] = await deps.db.select({ limit: users.dailyLimitMinutes }).from(users).where(eq(users.id, userId));
  const [row] = await deps.db
    .select()
    .from(usageLog)
    .where(and(eq(usageLog.userId, userId), eq(usageLog.day, dayKey(Date.now(), tz))));
  const limit = u?.limit ?? null;
  const used = row?.minutes ?? 0;
  const bonus = row?.bonusMinutes ?? 0;
  const remaining = remainingMinutes(limit, used, bonus);
  return { limit, used, bonus, remaining, locked: remaining === 0 };
}

export const wellbeingRoutes = new Hono<AppEnv>()
  /* ───── Anonymous complaint box ───── */
  .post('/complaints', async (c) => {
    const user = requireUser(c);
    // Limited per person, but nothing about the person is kept with the complaint.
    await checkRate(c, { bucket: 'complaint', limit: 5, windowSec: 86_400, by: 'user' });
    const deps = c.get('deps');
    const input = await body(c, complaintInputSchema);
    const [m] = await deps.db
      .select({ role: schoolMembers.role })
      .from(schoolMembers)
      .where(and(eq(schoolMembers.schoolId, input.schoolId), eq(schoolMembers.userId, user.id), eq(schoolMembers.status, 'active')));
    if (!m) throw forbidden('school_members_only');
    const code = randomCode(10).toUpperCase();
    await deps.db.insert(complaints).values({ schoolId: input.schoolId, codeHash: codeHash(deps, code), category: input.category, body: input.text });
    const admins = await deps.db
      .select({ id: schoolMembers.userId })
      .from(schoolMembers)
      .where(and(eq(schoolMembers.schoolId, input.schoolId), eq(schoolMembers.role, 'admin'), eq(schoolMembers.status, 'active')));
    const urgent = (URGENT_COMPLAINTS as readonly string[]).includes(input.category);
    await notify(
      deps,
      admins.map((a) => ({
        userId: a.id,
        type: urgent ? 'complaint_urgent' : 'complaint_new',
        icon: 'shield-alert',
        link: `/schools/${input.schoolId}?tab=complaints`,
        data: { category: input.category },
        pref: 'school' as const,
      })),
    );
    return c.json({ code }, 201);
  })
  .get('/complaints/status', async (c) => {
    requireUser(c);
    await checkRate(c, { bucket: 'complaint-status', limit: 30, windowSec: 3600, by: 'user' });
    const deps = c.get('deps');
    const code = c.req.query('code') ?? '';
    if (code.length < 6) throw badRequest('invalid_code');
    const [row] = await deps.db
      .select()
      .from(complaints)
      .where(eq(complaints.codeHash, codeHash(deps, code)));
    if (!row) throw notFound('complaint_not_found');
    const dto: ComplaintStatusDto = { status: row.status, reply: row.reply, createdAt: row.createdAt.getTime() };
    return c.json(dto);
  })
  /* ───── Daily mood check ───── */
  .get('/mood', async (c) => {
    const user = requireUser(c);
    const { db } = c.get('deps');
    const today = dayKey(Date.now(), user.timezone);
    const rows = await db
      .select({ day: moodChecks.day, mood: moodChecks.mood })
      .from(moodChecks)
      .where(and(eq(moodChecks.userId, user.id), gte(moodChecks.day, addDays(today, -13))))
      .orderBy(asc(moodChecks.day));
    const dto: MoodDto = { today: rows.find((r) => r.day === today)?.mood ?? null, recent: rows };
    return c.json(dto);
  })
  .post('/mood', async (c) => {
    const user = requireUser(c);
    await checkRate(c, { bucket: 'mood', limit: 20, windowSec: 3600, by: 'user' });
    const deps = c.get('deps');
    const input = await body(c, moodInputSchema);
    const today = dayKey(Date.now(), user.timezone);
    await deps.db
      .insert(moodChecks)
      .values({ userId: user.id, day: today, mood: input.mood, note: input.note ?? '' })
      .onConflictDoUpdate({ target: [moodChecks.userId, moodChecks.day], set: { mood: input.mood, note: input.note ?? '' } });
    let alerted = false;
    if (user.accountType === 'student' && input.mood <= 2) {
      const recent = await deps.db
        .select({ day: moodChecks.day, mood: moodChecks.mood })
        .from(moodChecks)
        .where(and(eq(moodChecks.userId, user.id), gte(moodChecks.day, addDays(today, -7))));
      if (lowMoodAlert(recent, today)) {
        // One heads-up per week, however often the student answers.
        const inserted = await deps.db.execute<{ id: string }>(sql`
          insert into mood_alerts (user_id) select ${user.id}
          where not exists (select 1 from mood_alerts where user_id = ${user.id} and created_at > now() - interval '7 days')
          returning id`);
        if (inserted.length) {
          alerted = true;
          const parents = await deps.db.select({ id: guardianLinks.guardianId }).from(guardianLinks).where(eq(guardianLinks.studentId, user.id));
          const admins = await deps.db
            .selectDistinct({ id: schoolMembers.userId })
            .from(schoolMembers)
            .where(
              and(
                eq(schoolMembers.role, 'admin'),
                eq(schoolMembers.status, 'active'),
                sql`${schoolMembers.schoolId} in (select school_id from school_members where user_id = ${user.id} and role = 'student' and status = 'active')`,
              ),
            );
          const data = { name: user.displayName };
          await notify(deps, [
            ...parents.map((p) => ({ userId: p.id, type: 'mood_low', icon: 'heart', link: '/family', data, pref: 'school' as const })),
            ...admins.map((a) => ({ userId: a.id, type: 'mood_low_school', icon: 'heart', link: '/schools', data, pref: 'school' as const })),
          ]);
        }
      }
    }
    return c.json({ ok: true, alerted });
  })
  /* ───── Daily time limit ───── */
  .get('/usage', async (c) => {
    const user = requireUser(c);
    return c.json(await usageOf(c.get('deps'), user.id, user.timezone));
  })
  /** The app calls this about once a minute while it is open; only people with a limit are counted. */
  .post('/usage/ping', async (c) => {
    const user = requireUser(c);
    const deps = c.get('deps');
    const [u] = await deps.db.select({ limit: users.dailyLimitMinutes }).from(users).where(eq(users.id, user.id));
    if (u?.limit) {
      const day = dayKey(Date.now(), user.timezone);
      await deps.db
        .insert(usageLog)
        .values({ userId: user.id, day, minutes: 1, lastPingAt: new Date() })
        .onConflictDoUpdate({
          target: [usageLog.userId, usageLog.day],
          set: { minutes: sql`${usageLog.minutes} + 1`, lastPingAt: new Date() },
          setWhere: sql`${usageLog.lastPingAt} is null or ${usageLog.lastPingAt} < now() - interval '50 seconds'`,
        });
    }
    return c.json(await usageOf(deps, user.id, user.timezone));
  })
  /** A parent sets (or removes) the daily limit of a child. */
  .put('/children/:id/time-limit', async (c) => {
    const user = requireUser(c);
    const deps = c.get('deps');
    const id = param(c, 'id');
    if (!(await isGuardianOf(deps, user.id, id))) throw forbidden('not_linked');
    const { minutes } = await body(c, timeLimitSchema);
    await deps.db.update(users).set({ dailyLimitMinutes: minutes }).where(eq(users.id, id));
    await notify(deps, {
      userId: id,
      type: 'time_limit_changed',
      icon: 'timer',
      actorId: user.id,
      link: '/settings?tab=family',
      data: { name: user.displayName, minutes: minutes ?? 0 },
      pref: 'system',
    });
    return c.json({ limit: minutes });
  })
  .post('/children/:id/extra-time', async (c) => {
    const user = requireUser(c);
    const deps = c.get('deps');
    const id = param(c, 'id');
    if (!(await isGuardianOf(deps, user.id, id))) throw forbidden('not_linked');
    const { minutes } = await body(c, extraTimeSchema);
    const [child] = await deps.db.select({ tz: users.timezone }).from(users).where(eq(users.id, id));
    const day = dayKey(Date.now(), child?.tz ?? 'UTC');
    await deps.db
      .insert(usageLog)
      .values({ userId: id, day, minutes: 0, bonusMinutes: minutes })
      .onConflictDoUpdate({ target: [usageLog.userId, usageLog.day], set: { bonusMinutes: sql`${usageLog.bonusMinutes} + ${minutes}` } });
    return c.json(await usageOf(deps, id, child?.tz ?? 'UTC'));
  })
  .get('/children/:id/usage', async (c) => {
    const user = requireUser(c);
    const deps = c.get('deps');
    const id = param(c, 'id');
    if (!(await isGuardianOf(deps, user.id, id))) throw forbidden('not_linked');
    const [child] = await deps.db.select({ tz: users.timezone }).from(users).where(eq(users.id, id));
    return c.json(await usageOf(deps, id, child?.tz ?? 'UTC'));
  });

/** The school's supervisors read the anonymous complaints and answer them. */
export const complaintAdminRoutes = new Hono<AppEnv>()
  .get('/:id/complaints', async (c) => {
    const user: AuthUser = requireUser(c);
    const deps = c.get('deps');
    await requireSchoolRole(deps, param(c, 'id'), user, ['admin']);
    const rows = await deps.db
      .select()
      .from(complaints)
      .where(eq(complaints.schoolId, param(c, 'id')))
      .orderBy(desc(complaints.createdAt))
      .limit(200);
    const items: ComplaintDto[] = rows.map((r) => ({
      id: r.id,
      category: r.category,
      text: r.body,
      status: r.status,
      reply: r.reply,
      createdAt: r.createdAt.getTime(),
    }));
    return c.json({ items });
  })
  .patch('/:id/complaints/:cid', async (c) => {
    const user = requireUser(c);
    const deps = c.get('deps');
    await requireSchoolRole(deps, param(c, 'id'), user, ['admin']);
    const input = await body(c, complaintReviewSchema);
    const [row] = await deps.db
      .update(complaints)
      .set({ status: input.status, ...(input.reply !== undefined ? { reply: input.reply || null } : {}), updatedAt: new Date() })
      .where(and(eq(complaints.id, param(c, 'cid')), eq(complaints.schoolId, param(c, 'id'))))
      .returning();
    if (!row) throw notFound();
    return c.json({ ok: true });
  });
