import { eq } from 'drizzle-orm';
import { describe, expect, it } from 'vitest';
import type { CourseDto, LiveAttendanceDto, LivePollDto, LiveRoomDto } from '@qubedu/shared';
import { liveAttendance, liveRooms } from '../src/db/schema';
import { call, newUser, setupApp } from './helpers';

describe('live class tools', () => {
  it('runs breakout groups, a quick quiz question and fills in the register when the class ends', async () => {
    const { deps } = await setupApp();
    const teacher = await newUser({ accountType: 'teacher', name: 'Mr Adel' });
    const [s1, s2, s3] = [await newUser({ name: 'Ali' }), await newUser({ name: 'Mona' }), await newUser({ name: 'Ziad' })];
    const stranger = await newUser();
    const course = await call<CourseDto>('POST', '/school/courses', { token: teacher.token, body: { title: 'Science 6' } });
    for (const s of [s1, s2, s3]) await call('POST', '/school/join', { token: s.token, body: { code: course.body.joinCode } });
    const room = await call<LiveRoomDto>('POST', '/live', {
      token: teacher.token,
      body: { title: 'Plants lesson', scopeType: 'course', scopeId: course.body.id },
    });
    await call('POST', `/live/${room.body.id}/start`, { token: teacher.token });

    // Breakouts: only people who may be in the room are placed; each group is its own room.
    expect(
      (await call('POST', `/live/${room.body.id}/breakouts`, { token: s1.token, body: { groups: 2, participants: [s1.user.id, s2.user.id] } })).status,
    ).toBe(403);
    const br = await call<{ rooms: { id: string; members: string[] }[] }>('POST', `/live/${room.body.id}/breakouts`, {
      token: teacher.token,
      body: { groups: 2, participants: [s1.user.id, s2.user.id, s3.user.id, stranger.user.id] },
    });
    expect(br.status, JSON.stringify(br.body)).toBe(200);
    expect(br.body.rooms).toHaveLength(2);
    expect(br.body.rooms.flatMap((r) => r.members).sort()).toEqual([s1.user.id, s2.user.id, s3.user.id].sort());
    const mine = br.body.rooms.find((r) => r.members.includes(s1.user.id))!;
    const child = await call<LiveRoomDto>('GET', `/live/${mine.id}`, { token: s1.token });
    expect(child.body).toMatchObject({ parentId: room.body.id, status: 'live', settings: { allowStudentMic: true } });
    expect((await call<LiveRoomDto>('GET', `/live/${room.body.id}`, { token: s1.token })).body.breakouts).toHaveLength(2);
    // Breakout rooms don't show in the class list.
    const list = await call<{ items: LiveRoomDto[] }>('GET', `/live?scopeType=course&scopeId=${course.body.id}`, { token: s1.token });
    expect(list.body.items.map((r) => r.id)).toEqual([room.body.id]);
    // Time in a breakout counts for the main class.
    expect((await call<{ ok: boolean }>('POST', `/live/${mine.id}/presence`, { token: s1.token })).body.ok).toBe(true);
    await call('POST', `/live/${room.body.id}/breakouts/close`, { token: teacher.token });
    expect((await call<LiveRoomDto>('GET', `/live/${mine.id}`, { token: s1.token })).body.status).toBe('ended');
    expect((await call<LiveRoomDto>('GET', `/live/${room.body.id}`, { token: s1.token })).body.breakouts).toHaveLength(0);

    // Quick quiz question: one vote each; students see results only after it closes.
    const poll = await call<LivePollDto>('POST', `/live/${room.body.id}/polls`, {
      token: teacher.token,
      body: { question: 'Which gas do plants release?', options: ['CO2', 'Oxygen', 'Nitrogen'], correct: 1 },
    });
    expect(poll.status).toBe(201);
    expect((await call('POST', `/live/polls/${poll.body.id}/vote`, { token: s1.token, body: { choice: 1 } })).status).toBe(200);
    expect((await call('POST', `/live/polls/${poll.body.id}/vote`, { token: s1.token, body: { choice: 0 } })).status).toBe(400);
    await call('POST', `/live/polls/${poll.body.id}/vote`, { token: s2.token, body: { choice: 0 } });
    expect((await call('POST', `/live/polls/${poll.body.id}/vote`, { token: stranger.token, body: { choice: 0 } })).status).toBe(403);
    const open = await call<{ items: LivePollDto[] }>('GET', `/live/${room.body.id}/polls`, { token: s1.token });
    expect(open.body.items[0]).toMatchObject({ status: 'open', counts: null, correct: null, myChoice: 1, total: 2 });
    expect((await call<{ items: LivePollDto[] }>('GET', `/live/${room.body.id}/polls`, { token: teacher.token })).body.items[0]!.counts).toEqual([1, 1, 0]);
    await call('POST', `/live/polls/${poll.body.id}/close`, { token: teacher.token });
    const closed = await call<{ items: LivePollDto[] }>('GET', `/live/${room.body.id}/polls`, { token: s2.token });
    expect(closed.body.items[0]).toMatchObject({ status: 'closed', counts: [1, 1, 0], correct: 1, myChoice: 0 });
    expect((await call('POST', `/live/polls/${poll.body.id}/vote`, { token: s3.token, body: { choice: 1 } })).status).toBe(400);

    // Attendance: Ali stayed from the start, Mona came 15 minutes late, Ziad never came.
    await call('POST', `/live/${room.body.id}/presence`, { token: s2.token });
    const [r] = await deps.db.select().from(liveRooms).where(eq(liveRooms.id, room.body.id));
    const start = r!.startedAt!.getTime() - 40 * 60_000;
    await deps.db
      .update(liveRooms)
      .set({ startedAt: new Date(start) })
      .where(eq(liveRooms.id, room.body.id));
    await deps.db
      .update(liveAttendance)
      .set({ seconds: 2000, firstAt: new Date(start + 60_000) })
      .where(eq(liveAttendance.userId, s1.user.id));
    await deps.db
      .update(liveAttendance)
      .set({ seconds: 1200, firstAt: new Date(start + 15 * 60_000) })
      .where(eq(liveAttendance.userId, s2.user.id));
    const att = await call<LiveAttendanceDto>('GET', `/live/${room.body.id}/attendance`, { token: teacher.token });
    expect(att.body.items.map((x) => x.user.displayName)).toEqual(['Ali', 'Mona']);
    expect((await call('GET', `/live/${room.body.id}/attendance`, { token: s1.token })).status).toBe(403);
    await call('POST', `/live/${room.body.id}/end`, { token: teacher.token });
    const reg = await call<{ items: { title: string; records: Record<string, string> }[] }>('GET', `/school/courses/${course.body.id}/attendance`, {
      token: teacher.token,
    });
    const lesson = reg.body.items.find((x) => x.title === 'Plants lesson')!;
    expect(lesson.records).toEqual({ [s1.user.id]: 'present', [s2.user.id]: 'late', [s3.user.id]: 'absent' });
    // Ending again doesn't make a second register entry.
    await call('POST', `/live/${room.body.id}/end`, { token: teacher.token });
    const again = await call<{ items: { title: string }[] }>('GET', `/school/courses/${course.body.id}/attendance`, { token: teacher.token });
    expect(again.body.items.filter((x) => x.title === 'Plants lesson')).toHaveLength(1);
  });
});
