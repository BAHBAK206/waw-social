import { and, desc, eq, gte, sql } from 'drizzle-orm';
import { Hono } from 'hono';
import { dayKey, pronunciationAttemptSchema, scorePronunciation, type PronunciationResultDto, type PronunciationStatsDto } from '@qubedu/shared';
import { pronunciationAttempts, users } from '../db/schema';
import type { AppEnv } from '../lib/context';
import { body, requireUser } from '../lib/http';
import { awardXp, logStudy, xpEarnedToday } from '../lib/progress';
import { checkRate } from '../middleware';

/** XP for a good attempt (score ≥ 70), capped per day so the lab rewards practice, not spamming. */
const XP_PER_GOOD_ATTEMPT = 2;
const DAILY_XP_CAP = 30;

export const practiceRoutes = new Hono<AppEnv>()
  .post('/pronunciation', async (c) => {
    const viewer = requireUser(c);
    await checkRate(c, { bucket: 'pronunciation', limit: 120, windowSec: 600, by: 'user' });
    const deps = c.get('deps');
    const input = await body(c, pronunciationAttemptSchema);
    // Never trust a client-side score: re-score what was heard against the phrase.
    const result = scorePronunciation(input.phrase, input.heard);
    const [tz] = await deps.db.select({ timezone: users.timezone }).from(users).where(eq(users.id, viewer.id));
    const today = dayKey(Date.now(), tz?.timezone ?? 'UTC');
    const xpEarned = await deps.db.transaction(async (tx) => {
      const [row] = await tx
        .insert(pronunciationAttempts)
        .values({ userId: viewer.id, language: input.language, phrase: input.phrase, heard: input.heard, score: result.score })
        .returning({ id: pronunciationAttempts.id });
      // Roughly 20 s of focused speaking per attempt: every third attempt adds a minute to the daily study goal.
      const [{ n } = { n: 0 }] = await tx
        .select({ n: sql<number>`count(*)::int` })
        .from(pronunciationAttempts)
        .where(eq(pronunciationAttempts.userId, viewer.id));
      if (n % 3 === 0) await logStudy(tx, viewer.id, today, { minutes: 1 });
      if (result.score < 70) return 0;
      const earned = await xpEarnedToday(tx, viewer.id, 'pronunciation', today);
      const amount = Math.min(XP_PER_GOOD_ATTEMPT, Math.max(0, DAILY_XP_CAP - earned));
      const award = await awardXp(tx, viewer.id, amount, 'pronunciation', row!.id, today);
      return award.awarded ? amount : 0;
    });
    const dto: PronunciationResultDto = { ...result, xpEarned };
    return c.json(dto);
  })
  .get('/pronunciation/stats', async (c) => {
    const viewer = requireUser(c);
    const deps = c.get('deps');
    const [tz] = await deps.db.select({ timezone: users.timezone }).from(users).where(eq(users.id, viewer.id));
    const today = dayKey(Date.now(), tz?.timezone ?? 'UTC');
    const since = new Date(Date.now() - 7 * 86_400_000);
    const rows = await deps.db
      .select()
      .from(pronunciationAttempts)
      .where(and(eq(pronunciationAttempts.userId, viewer.id), gte(pronunciationAttempts.createdAt, since)))
      .orderBy(desc(pronunciationAttempts.createdAt))
      .limit(300);
    const todays = rows.filter((r) => dayKey(r.createdAt.getTime(), tz?.timezone ?? 'UTC') === today);
    const avg = (xs: { score: number }[]) => (xs.length ? Math.round(xs.reduce((n, r) => n + r.score, 0) / xs.length) : null);
    const misses = new Map<string, { word: string; language: string; misses: number }>();
    for (const r of rows.slice(0, 80)) {
      for (const w of scorePronunciation(r.phrase, r.heard).words) {
        if (w.ok) continue;
        const word = w.word.replace(/[\p{P}\p{S}]/gu, '');
        if (word.length < 2) continue;
        const key = `${r.language}:${word.toLowerCase()}`;
        const cur = misses.get(key) ?? { word, language: r.language, misses: 0 };
        cur.misses += 1;
        misses.set(key, cur);
      }
    }
    const xp = await xpEarnedToday(deps.db, viewer.id, 'pronunciation', today);
    const dto: PronunciationStatsDto = {
      today: { attempts: todays.length, average: avg(todays), xp },
      week: { attempts: rows.length, average: avg(rows) },
      recent: rows.slice(0, 20).map((r) => ({ id: r.id, language: r.language, phrase: r.phrase, score: r.score, createdAt: r.createdAt.getTime() })),
      weakWords: [...misses.values()].sort((a, b) => b.misses - a.misses).slice(0, 12),
    };
    return c.json(dto);
  });
