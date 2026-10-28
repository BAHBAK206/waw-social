import { describe, expect, it } from 'vitest';
import { leagueWeek, leagueWeekEnd, leagueZones, settleGroup } from './leagues';

describe('leagues', () => {
  it('weeks start on Monday UTC', () => {
    expect(leagueWeek(Date.parse('2026-10-28T10:00:00Z'))).toBe('2026-10-26'); // Wednesday
    expect(leagueWeek(Date.parse('2026-11-01T23:59:00Z'))).toBe('2026-10-26'); // Sunday
    expect(leagueWeek(Date.parse('2026-11-02T00:00:00Z'))).toBe('2026-11-02'); // Monday
    expect(leagueWeekEnd('2026-10-26')).toBe(Date.parse('2026-11-02T00:00:00Z'));
  });
  it('promotes the top, demotes the bottom and the inactive', () => {
    expect(leagueZones(30, 2)).toEqual({ promote: 5, demote: 5 });
    expect(leagueZones(4, 0)).toEqual({ promote: 1, demote: 0 });
    expect(leagueZones(30, 6)).toEqual({ promote: 0, demote: 5 });
    const members = Array.from({ length: 9 }, (_, i) => ({ userId: `u${i}`, xp: 90 - i * 10 }));
    const r = settleGroup(members, 1);
    expect([...r.values()]).toEqual(['up', 'up', 'up', 'stay', 'stay', 'stay', 'down', 'down', 'down']);
    // Nobody is promoted for zero XP; zero XP in a higher tier moves down.
    expect(settleGroup([{ userId: 'a', xp: 0 }], 0).get('a')).toBe('stay');
    expect(
      settleGroup(
        [
          { userId: 'a', xp: 50 },
          { userId: 'b', xp: 0 },
          { userId: 'c', xp: 10 },
        ],
        2,
      ).get('b'),
    ).toBe('down');
  });
});
