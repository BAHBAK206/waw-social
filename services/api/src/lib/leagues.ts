import { LEAGUE_GROUP_SIZE, LEAGUE_TIERS, leagueWeek, settleGroup } from '@qubedu/shared';
import { and, asc, eq, sql } from 'drizzle-orm';
import type { Db } from '../db/client';
import { leagueMembers, siteSettings, users } from '../db/schema';
import type { Deps } from './context';
import { notify } from './notify';

type Tx = Parameters<Parameters<Db['transaction']>[0]>[0] | Db;

/**
 * Adds XP to this week's league. The first XP of the week places the learner in a group of their tier that still
 * has room (or a new one). Advisory lock per week+tier so two first-XP events can't overfill a group.
 */
export async function addLeagueXp(tx: Tx, userId: string, amount: number, now = Date.now()) {
  if (amount <= 0) return;
  const week = leagueWeek(now);
  const updated = await tx
    .update(leagueMembers)
    .set({ xp: sql`${leagueMembers.xp} + ${amount}` })
    .where(and(eq(leagueMembers.week, week), eq(leagueMembers.userId, userId)))
    .returning({ w: leagueMembers.week });
  if (updated.length) return;
  const [u] = await tx.select({ tier: users.leagueTier }).from(users).where(eq(users.id, userId));
  const tier = Math.min(LEAGUE_TIERS.length - 1, Math.max(0, u?.tier ?? 0));
  await tx.execute(sql`select pg_advisory_xact_lock(hashtext(${`league:${week}:${tier}`}))`);
  const [open] = await tx.execute<{ group_no: number }>(sql`
    select group_no from league_members where week = ${week} and tier = ${tier}
    group by group_no having count(*) < ${LEAGUE_GROUP_SIZE} order by group_no limit 1`);
  const groupNo =
    open?.group_no ??
    Number(
      (await tx.execute<{ n: number }>(sql`select coalesce(max(group_no), 0) + 1 as n from league_members where week = ${week} and tier = ${tier}`))[0]?.n ?? 1,
    );
  await tx
    .insert(leagueMembers)
    .values({ week, userId, tier, groupNo, xp: amount })
    .onConflictDoUpdate({ target: [leagueMembers.week, leagueMembers.userId], set: { xp: sql`${leagueMembers.xp} + ${amount}` } });
}

/** Closes a finished week: moves people up or down a tier and tells them. Safe to run more than once. */
export async function settleLeagueWeek(deps: Deps, week: string): Promise<number> {
  const groups = await deps.db.execute<{ tier: number; group_no: number }>(sql`
    select distinct tier, group_no from league_members where week = ${week} and result is null`);
  let moved = 0;
  for (const g of groups) {
    const members = await deps.db
      .select({ userId: leagueMembers.userId, xp: leagueMembers.xp })
      .from(leagueMembers)
      .where(and(eq(leagueMembers.week, week), eq(leagueMembers.tier, g.tier), eq(leagueMembers.groupNo, g.group_no)))
      .orderBy(asc(leagueMembers.joinedAt));
    const results = settleGroup(members, g.tier);
    for (const [userId, result] of results) {
      const next = result === 'up' ? g.tier + 1 : result === 'down' ? g.tier - 1 : g.tier;
      await deps.db.transaction(async (tx) => {
        await tx
          .update(leagueMembers)
          .set({ result })
          .where(and(eq(leagueMembers.week, week), eq(leagueMembers.userId, userId)));
        await tx.update(users).set({ leagueTier: next }).where(eq(users.id, userId));
      });
      if (result !== 'stay') moved++;
      await notify(deps, {
        userId,
        type: `league_${result}`,
        icon: 'trophy',
        link: '/league',
        data: { tier: LEAGUE_TIERS[next]! },
        pref: 'system',
      });
    }
  }
  return moved;
}

/** Settles last week once (hourly check; the week boundary is Monday 00:00 UTC). */
export function startLeagueWorker(deps: Deps): () => void {
  const tick = async () => {
    try {
      const last = leagueWeek(Date.now() - 7 * 86_400_000);
      const [row] = await deps.db.select().from(siteSettings).where(eq(siteSettings.key, 'leagueSettled'));
      if ((row?.value as { week?: string } | undefined)?.week === last) return;
      await settleLeagueWeek(deps, last);
      await deps.db
        .insert(siteSettings)
        .values({ key: 'leagueSettled', value: { week: last } })
        .onConflictDoUpdate({ target: siteSettings.key, set: { value: { week: last }, updatedAt: new Date() } });
    } catch (err) {
      deps.log.warn({ err }, 'league settlement failed');
    }
  };
  const timer = setInterval(() => void tick(), 3600_000);
  setTimeout(() => void tick(), 30_000);
  return () => clearInterval(timer);
}
