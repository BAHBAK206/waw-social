import { and, desc, eq, gt, isNull, or, sql } from 'drizzle-orm';
import { Hono } from 'hono';
import { z } from 'zod';
import { clientErrorSchema, type AdDto, type AnnouncementDto, type PublicConfigDto } from '@qubedu/shared';
import { ads, announcements, clientErrors } from '../db/schema';
import type { AppEnv } from '../lib/context';
import { sha256 } from '../lib/crypto';
import { body, param } from '../lib/http';
import { ms } from '../lib/mappers';
import { getSettings } from '../lib/settings';
import { checkRate } from '../middleware';

export const APP_VERSION = '2.0.0';

export function toAnnouncement(a: typeof announcements.$inferSelect): AnnouncementDto {
  return { id: a.id, title: a.title, text: a.text, imageUrl: a.imageUrl, link: a.link, level: a.level, active: a.active, expiresAt: ms(a.expiresAt), createdAt: a.createdAt.getTime() };
}

export function toAd(a: typeof ads.$inferSelect): AdDto {
  return { id: a.id, title: a.title, subtitle: a.subtitle, link: a.link, imageUrl: a.imageUrl, placement: a.placement, active: a.active, clicks: a.clicks, impressions: a.impressions, createdAt: a.createdAt.getTime() };
}

export const configRoutes = new Hono<AppEnv>()
  .get('/config', async (c) => {
    const { db, env } = c.get('deps');
    const s = await getSettings(db, env.AI_DAILY_QUOTA);
    const [anns, adRows] = await Promise.all([
      db
        .select()
        .from(announcements)
        .where(and(eq(announcements.active, true), or(isNull(announcements.expiresAt), gt(announcements.expiresAt, new Date()))))
        .orderBy(desc(announcements.createdAt))
        .limit(5),
      db.select().from(ads).where(eq(ads.active, true)).orderBy(desc(ads.createdAt)).limit(10),
    ]);
    const dto: PublicConfigDto = {
      features: s.features,
      maintenance: s.maintenance,
      registrationOpen: s.registrationOpen,
      contact: s.contact,
      announcements: anns.map(toAnnouncement),
      ads: adRows.map(toAd),
      ai: { enabled: s.ai.enabled },
      uploads: s.uploads,
      realtimeUrl: env.REALTIME_PUBLIC_URL || null,
      version: APP_VERSION,
      fetchedAt: Date.now(),
    };
    c.header('Cache-Control', 'public, max-age=15, stale-while-revalidate=60');
    return c.json(dto);
  })
  .post('/ads/:id/click', async (c) => {
    await checkRate(c, { bucket: 'ad-click', limit: 30, windowSec: 600 });
    const { db } = c.get('deps');
    await db.update(ads).set({ clicks: sql`${ads.clicks} + 1` }).where(eq(ads.id, param(c, 'id')));
    return c.json({ ok: true });
  })
  .post('/ads/impressions', async (c) => {
    await checkRate(c, { bucket: 'ad-imp', limit: 60, windowSec: 600 });
    const { db } = c.get('deps');
    const { ids } = await body(c, z.object({ ids: z.array(z.string().uuid()).max(10) }));
    for (const id of ids) await db.update(ads).set({ impressions: sql`${ads.impressions} + 1` }).where(eq(ads.id, id));
    return c.json({ ok: true });
  })
  .post('/client-errors', async (c) => {
    await checkRate(c, { bucket: 'client-error', limit: 30, windowSec: 600 });
    const { db } = c.get('deps');
    const input = await body(c, clientErrorSchema);
    const user = c.get('user');
    const fingerprint = sha256(`${input.kind}|${input.message}|${(input.stack ?? '').split('\n').slice(0, 3).join('|')}`);
    await db
      .insert(clientErrors)
      .values({ fingerprint, message: input.message, kind: input.kind, url: input.url ?? null, release: input.release ?? null, sampleStack: input.stack ?? null, userId: user?.id ?? null })
      .onConflictDoUpdate({ target: clientErrors.fingerprint, set: { count: sql`${clientErrors.count} + 1`, lastSeenAt: new Date(), url: input.url ?? null } });
    return c.json({ ok: true }, 202);
  });
