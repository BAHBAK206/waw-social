/** Weekly leagues: groups of up to 30 learners in the same tier compete on XP earned Monday→Sunday (UTC). */
export const LEAGUE_TIERS = ['bronze', 'silver', 'gold', 'sapphire', 'ruby', 'emerald', 'diamond'] as const;
export type LeagueTier = (typeof LEAGUE_TIERS)[number];
export const LEAGUE_GROUP_SIZE = 30;

/** Monday (UTC, YYYY-MM-DD) of the week containing `ms`. */
export function leagueWeek(ms: number = Date.now()): string {
  const d = new Date(ms);
  const day = (d.getUTCDay() + 6) % 7; // Monday = 0
  return new Date(Date.UTC(d.getUTCFullYear(), d.getUTCMonth(), d.getUTCDate() - day)).toISOString().slice(0, 10);
}

/** When the week that starts on `week` ends (next Monday 00:00 UTC), in ms. */
export function leagueWeekEnd(week: string): number {
  return Date.parse(`${week}T00:00:00Z`) + 7 * 86_400_000;
}

/** How many move up / down in a group of `size` (a third of the group, at most 5 each way). */
export function leagueZones(size: number, tier: number): { promote: number; demote: number } {
  const n = Math.min(5, Math.floor(size / 3));
  return { promote: tier < LEAGUE_TIERS.length - 1 ? Math.max(1, n) : 0, demote: tier > 0 ? n : 0 };
}

/**
 * Results for one finished group, ranked by XP (ties: whoever joined first). Promotion needs some XP;
 * anyone with no XP at all moves down (except from the first tier).
 */
export function settleGroup(members: { userId: string; xp: number }[], tier: number): Map<string, 'up' | 'down' | 'stay'> {
  // Stable sort: equal XP keeps the caller's order (who joined first).
  const ranked = [...members].sort((a, b) => b.xp - a.xp);
  const { promote, demote } = leagueZones(ranked.length, tier);
  const out = new Map<string, 'up' | 'down' | 'stay'>();
  ranked.forEach((m, i) => {
    if (i < promote && m.xp > 0) out.set(m.userId, 'up');
    else if (tier > 0 && (i >= ranked.length - demote || m.xp === 0)) out.set(m.userId, 'down');
    else out.set(m.userId, 'stay');
  });
  return out;
}
