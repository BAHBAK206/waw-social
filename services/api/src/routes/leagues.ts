import { LEAGUE_TIERS, leagueWeek, leagueWeekEnd, leagueZones, type LeagueDto } from '@qubedu/shared';
import { and, asc, desc, eq, isNull } from 'drizzle-orm';
import { Hono } from 'hono';
import { leagueMembers, users } from '../db/schema';
import type { AppEnv } from '../lib/context';
import { requireUser } from '../lib/http';
import { summaryColumns, toSummary, withOnline } from '../lib/mappers';

export const leagueRoutes = new Hono<AppEnv>().get('/me', async (c) => {
  const viewer = requireUser(c);
  const deps = c.get('deps');
  const week = leagueWeek();
  const lastWeek = leagueWeek(Date.now() - 7 * 86_400_000);
  const [[mine], [last], [u]] = await Promise.all([
    deps.db
      .select()
      .from(leagueMembers)
      .where(and(eq(leagueMembers.week, week), eq(leagueMembers.userId, viewer.id))),
    deps.db
      .select({ result: leagueMembers.result })
      .from(leagueMembers)
      .where(and(eq(leagueMembers.week, lastWeek), eq(leagueMembers.userId, viewer.id))),
    deps.db.select({ tier: users.leagueTier }).from(users).where(eq(users.id, viewer.id)),
  ]);
  const tierIndex = mine?.tier ?? u?.tier ?? 0;
  let members: LeagueDto['members'] = [];
  if (mine) {
    const rows = await deps.db
      .select({ ...summaryColumns, weekXp: leagueMembers.xp })
      .from(leagueMembers)
      .innerJoin(users, eq(users.id, leagueMembers.userId))
      .where(and(eq(leagueMembers.week, week), eq(leagueMembers.tier, mine.tier), eq(leagueMembers.groupNo, mine.groupNo), isNull(users.deletedAt)))
      .orderBy(desc(leagueMembers.xp), asc(leagueMembers.joinedAt));
    const summaries = await withOnline(deps.kv, rows.map(toSummary));
    members = rows.map((r, i) => ({ user: summaries[i]!, xp: r.weekXp, rank: i + 1, me: r.id === viewer.id }));
  }
  const zones = leagueZones(members.length, tierIndex);
  return c.json({
    week,
    endsAt: leagueWeekEnd(week),
    tier: LEAGUE_TIERS[tierIndex]!,
    tierIndex,
    joined: !!mine,
    members,
    promote: zones.promote,
    demote: zones.demote,
    lastResult: last?.result ?? null,
  } satisfies LeagueDto);
});
