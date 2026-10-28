import { leagueWeek, type LeagueDto, type NotificationDto, type Page } from '@qubedu/shared';
import { eq } from 'drizzle-orm';
import { describe, expect, it } from 'vitest';
import { leagueMembers, users } from '../src/db/schema';
import { settleLeagueWeek } from '../src/lib/leagues';
import { awardXp } from '../src/lib/progress';
import { call, newUser, setupApp } from './helpers';

describe('weekly leagues', () => {
  it('earning XP places you in a group of your tier and ranks you by this week’s XP', async () => {
    const { deps } = await setupApp();
    const a = await newUser({ name: 'Ali' });
    const before = await call<LeagueDto>('GET', '/leagues/me', { token: a.token });
    expect(before.body).toMatchObject({ joined: false, tier: 'bronze', members: [] });

    const day = new Date().toISOString().slice(0, 10);
    await awardXp(deps.db, a.user.id, 40, 'test', `t-${Date.now()}-a`, day);
    await awardXp(deps.db, a.user.id, 15, 'test', `t-${Date.now()}-a2`, day);
    const me = await call<LeagueDto>('GET', '/leagues/me', { token: a.token });
    expect(me.body.joined).toBe(true);
    const row = me.body.members.find((m) => m.me)!;
    expect(row.xp).toBe(55);
    expect(me.body.members.map((m) => m.xp)).toEqual([...me.body.members.map((m) => m.xp)].sort((x, y) => y - x));
    expect(me.body.endsAt).toBeGreaterThan(Date.now());
  });

  it('settling a week moves the top up and the inactive down, and tells everyone', async () => {
    const { deps } = await setupApp();
    const week = '2001-01-01';
    const people = await Promise.all([newUser(), newUser(), newUser(), newUser(), newUser(), newUser()]);
    for (const p of people) await deps.db.update(users).set({ leagueTier: 2 }).where(eq(users.id, p.user.id));
    await deps.db.insert(leagueMembers).values(people.map((p, i) => ({ week, userId: p.user.id, tier: 2, groupNo: 1, xp: i === 5 ? 0 : 100 - i * 10 })));
    await settleLeagueWeek(deps, week);
    const tiers = await Promise.all(people.map(async (p) => (await deps.db.select({ t: users.leagueTier }).from(users).where(eq(users.id, p.user.id)))[0]!.t));
    expect(tiers).toEqual([3, 3, 2, 2, 1, 1]);
    const n = await call<Page<NotificationDto>>('GET', '/notifications', { token: people[0]!.token });
    expect(n.body.items.find((x) => x.type === 'league_up')?.data).toMatchObject({ tier: 'sapphire' });
    // Running it again changes nothing.
    expect(await settleLeagueWeek(deps, week)).toBe(0);
    expect(leagueWeek()).toMatch(/^\d{4}-\d{2}-\d{2}$/);
  });
});
