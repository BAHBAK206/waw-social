import { and, eq, sql } from 'drizzle-orm';
import { describe, expect, it } from 'vitest';
import { addDays, dayKey, type ComplaintDto, type ComplaintStatusDto, type MoodDto, type NotificationDto, type Page, type UsageDto } from '@qubedu/shared';
import { guardianLinks, moodChecks, schoolMembers, usageLog } from '../src/db/schema';
import { call, newUser, setupApp } from './helpers';

const notes = async (token: string, type: string) =>
  (await call<Page<NotificationDto>>('GET', '/notifications', { token })).body.items.filter((n) => n.type === type);

describe('anonymous complaint box', () => {
  it('takes a complaint from a member without keeping who wrote it, alerts the supervisors and lets the writer read the reply', async () => {
    const { deps } = await setupApp();
    const admin = await newUser({ name: 'Principal', accountType: 'teacher' });
    const kid = await newUser({ name: 'Omar' });
    const outsider = await newUser();
    const sc = await call<{ id: string }>('POST', '/schools', { token: admin.token, body: { name: 'Safe School' } });
    await deps.db.insert(schoolMembers).values({ schoolId: sc.body.id, userId: kid.user.id, role: 'student', status: 'active' });

    const text = 'Some older boys keep taking my lunch money every day.';
    expect((await call('POST', '/wellbeing/complaints', { token: outsider.token, body: { schoolId: sc.body.id, category: 'bullying', text } })).status).toBe(
      403,
    );
    expect(
      (await call('POST', '/wellbeing/complaints', { token: kid.token, body: { schoolId: sc.body.id, category: 'bullying', text: 'short' } })).status,
    ).toBe(400);
    const sent = await call<{ code: string }>('POST', '/wellbeing/complaints', {
      token: kid.token,
      body: { schoolId: sc.body.id, category: 'harassment', text },
    });
    expect(sent.status).toBe(201);
    expect(sent.body.code).toMatch(/^[A-Z0-9]{10}$/);
    expect(await notes(admin.token, 'complaint_urgent')).toHaveLength(1);

    // Supervisors see the text but nothing about the writer; nobody else can read the box.
    expect((await call('GET', `/schools/${sc.body.id}/complaints`, { token: kid.token })).status).toBe(403);
    const list = await call<{ items: ComplaintDto[] }>('GET', `/schools/${sc.body.id}/complaints`, { token: admin.token });
    expect(list.body.items).toHaveLength(1);
    expect(list.body.items[0]).toMatchObject({ category: 'harassment', status: 'new', text });
    expect(JSON.stringify(list.body)).not.toContain(kid.user.id);
    const stored = await deps.db.execute<Record<string, unknown>>(sql`select * from complaints`);
    expect(JSON.stringify(stored)).not.toContain(kid.user.id);
    expect(JSON.stringify(stored)).not.toContain(sent.body.code);

    // Reply, and the writer reads it with the code.
    await call('PATCH', `/schools/${sc.body.id}/complaints/${list.body.items[0]!.id}`, {
      token: admin.token,
      body: { status: 'seen', reply: 'Thank you. We are speaking with the year head today.' },
    });
    const status = await call<ComplaintStatusDto>('GET', `/wellbeing/complaints/status?code=${sent.body.code.toLowerCase()}`, { token: outsider.token });
    expect(status.body).toMatchObject({ status: 'seen', reply: 'Thank you. We are speaking with the year head today.' });
    expect((await call('GET', '/wellbeing/complaints/status?code=NOPE000000', { token: kid.token })).status).toBe(404);
  });
});

describe('daily mood check', () => {
  it('keeps answers private and gently tells the parents and the school after three low days, once a week', async () => {
    const { deps } = await setupApp();
    const admin = await newUser({ accountType: 'teacher' });
    const kid = await newUser({ name: 'Omar Hassan' });
    const parent = await newUser({ accountType: 'parent' });
    const sc = await call<{ id: string }>('POST', '/schools', { token: admin.token, body: { name: 'Care School' } });
    await deps.db.insert(schoolMembers).values({ schoolId: sc.body.id, userId: kid.user.id, role: 'student', status: 'active' });
    await deps.db.insert(guardianLinks).values({ guardianId: parent.user.id, studentId: kid.user.id });
    const today = dayKey(Date.now(), 'UTC');
    await deps.db.insert(moodChecks).values([
      { userId: kid.user.id, day: addDays(today, -1), mood: 1 },
      { userId: kid.user.id, day: addDays(today, -2), mood: 2 },
    ]);

    expect((await call('POST', '/wellbeing/mood', { token: kid.token, body: { mood: 9 } })).status).toBe(400);
    const first = await call<{ alerted: boolean }>('POST', '/wellbeing/mood', { token: kid.token, body: { mood: 2, note: 'Tired and sad' } });
    expect(first.body.alerted).toBe(true);
    for (const [u, type] of [
      [parent, 'mood_low'],
      [admin, 'mood_low_school'],
    ] as const) {
      const n = await notes(u.token, type);
      expect(n).toHaveLength(1);
      // The alert says who, never what they wrote.
      expect(JSON.stringify(n[0])).not.toContain('Tired and sad');
    }
    expect((await call<{ alerted: boolean }>('POST', '/wellbeing/mood', { token: kid.token, body: { mood: 1 } })).body.alerted).toBe(false);
    expect(await notes(parent.token, 'mood_low')).toHaveLength(1);

    const mine = await call<MoodDto>('GET', '/wellbeing/mood', { token: kid.token });
    expect(mine.body.today).toBe(1);
    expect(mine.body.recent).toHaveLength(3);
    // Parents cannot read the moods themselves.
    expect((await call<MoodDto>('GET', '/wellbeing/mood', { token: parent.token })).body.recent).toEqual([]);
  });
});

describe('daily time limit', () => {
  it('lets a parent set a limit, counts minutes, locks at the limit and unlocks with extra time', async () => {
    const { deps } = await setupApp();
    const kid = await newUser({ name: 'Omar' });
    const parent = await newUser({ accountType: 'parent' });
    const stranger = await newUser({ accountType: 'parent' });
    await deps.db.insert(guardianLinks).values({ guardianId: parent.user.id, studentId: kid.user.id });

    expect((await call<UsageDto>('POST', '/wellbeing/usage/ping', { token: kid.token })).body).toMatchObject({ limit: null, used: 0, locked: false });
    expect((await call('PUT', `/wellbeing/children/${kid.user.id}/time-limit`, { token: stranger.token, body: { minutes: 30 } })).status).toBe(403);
    expect((await call('PUT', `/wellbeing/children/${kid.user.id}/time-limit`, { token: parent.token, body: { minutes: 5 } })).status).toBe(400);
    expect((await call('PUT', `/wellbeing/children/${kid.user.id}/time-limit`, { token: parent.token, body: { minutes: 30 } })).status).toBe(200);
    expect(await notes(kid.token, 'time_limit_changed')).toHaveLength(1);

    const p1 = await call<UsageDto>('POST', '/wellbeing/usage/ping', { token: kid.token });
    expect(p1.body).toMatchObject({ limit: 30, used: 1, remaining: 29, locked: false });
    // A second ping right away is not counted twice.
    expect((await call<UsageDto>('POST', '/wellbeing/usage/ping', { token: kid.token })).body.used).toBe(1);

    const day = dayKey(Date.now(), 'UTC');
    await deps.db
      .update(usageLog)
      .set({ minutes: 30, lastPingAt: new Date(Date.now() - 120_000) })
      .where(and(eq(usageLog.userId, kid.user.id), eq(usageLog.day, day)));
    expect((await call<UsageDto>('GET', '/wellbeing/usage', { token: kid.token })).body).toMatchObject({ used: 30, remaining: 0, locked: true });
    const more = await call<UsageDto>('POST', `/wellbeing/children/${kid.user.id}/extra-time`, { token: parent.token, body: { minutes: 15 } });
    expect(more.body).toMatchObject({ bonus: 15, remaining: 15, locked: false });
    expect((await call<UsageDto>('GET', `/wellbeing/children/${kid.user.id}/usage`, { token: parent.token })).body.limit).toBe(30);
    expect((await call('GET', `/wellbeing/children/${kid.user.id}/usage`, { token: stranger.token })).status).toBe(403);
    // Removing the limit lifts the lock.
    await call('PUT', `/wellbeing/children/${kid.user.id}/time-limit`, { token: parent.token, body: { minutes: null } });
    expect((await call<UsageDto>('GET', '/wellbeing/usage', { token: kid.token })).body).toMatchObject({ limit: null, locked: false });
  });
});
