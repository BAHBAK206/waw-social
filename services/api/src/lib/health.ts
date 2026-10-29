import { and, count, eq, gte, inArray, isNull, sql } from 'drizzle-orm';
import type { HealthCheckDto, SystemHealthDto } from '@qubedu/shared';
import { clientErrors, complaints, payments, reports, schoolPlanOrders, siteSettings, teacherVerifications, users, videos } from '../db/schema';
import type { Deps } from './context';

const SLOW_MS = 800;

async function timed(name: HealthCheckDto['name'], fn: () => Promise<string>): Promise<HealthCheckDto> {
  const t = performance.now();
  try {
    const detail = await fn();
    const ms = Math.round(performance.now() - t);
    return { name, status: ms > SLOW_MS ? 'slow' : 'ok', ms, detail };
  } catch (e) {
    return { name, status: 'down', ms: Math.round(performance.now() - t), detail: e instanceof Error ? e.message.slice(0, 120) : 'error' };
  }
}

async function ping(url: string): Promise<string> {
  const res = await fetch(url, { signal: AbortSignal.timeout(2500) });
  if (!res.ok) throw new Error(`HTTP ${res.status}`);
  return `HTTP ${res.status}`;
}

/** Is the event loop keeping up? Time for a queued callback to run. */
const loopLag = () =>
  new Promise<number>((resolve) => {
    const t = performance.now();
    setImmediate(() => resolve(Math.round(performance.now() - t)));
  });

export async function liveHealth(deps: Deps): Promise<SystemHealthDto> {
  const checks = await Promise.all([
    timed('database', async () => {
      await deps.sql`select 1`;
      return 'PostgreSQL';
    }),
    timed('cache', async () => {
      const k = `health:${Date.now()}`;
      await deps.kv.set(k, '1', 10);
      if ((await deps.kv.get(k)) !== '1') throw new Error('read-back failed');
      await deps.kv.del(k);
      return deps.kv.kind;
    }),
    timed('storage', async () => `${deps.storage.driver}`),
    timed('ai', () => ping(`${deps.env.AI_SERVICE_URL.replace(/\/$/, '')}/health`)),
    deps.env.REALTIME_INTERNAL_URL
      ? timed('realtime', () => ping(`${deps.env.REALTIME_INTERNAL_URL!.replace(/\/$/, '')}/health`))
      : Promise.resolve<HealthCheckDto>({ name: 'realtime', status: 'off', ms: null, detail: 'not configured' }),
  ]);
  const since = new Date(Date.now() - 24 * 3600_000);
  const db = deps.db;
  const safe = async <T>(p: Promise<T>, fallback: T): Promise<T> => p.catch(() => fallback);
  const [errorRows, pendingVideos, failedVideos, openReports, verifications, transfers, plans, newComplaints, recent] = await Promise.all([
    safe(
      db
        .select({ message: clientErrors.message, n: clientErrors.count })
        .from(clientErrors)
        .where(gte(clientErrors.lastSeenAt, since))
        .orderBy(sql`${clientErrors.count} desc`)
        .limit(5),
      [],
    ),
    safe(
      db
        .select({ n: count() })
        .from(videos)
        .where(inArray(videos.streamStatus, ['pending', 'processing'])),
      [{ n: 0 }],
    ),
    safe(db.select({ n: count() }).from(videos).where(eq(videos.streamStatus, 'failed')), [{ n: 0 }]),
    safe(db.select({ n: count() }).from(reports).where(eq(reports.status, 'open')), [{ n: 0 }]),
    safe(db.select({ n: count() }).from(teacherVerifications).where(eq(teacherVerifications.status, 'pending')), [{ n: 0 }]),
    safe(
      db
        .select({ n: count() })
        .from(payments)
        .where(and(eq(payments.provider, 'transfer'), eq(payments.status, 'pending'))),
      [{ n: 0 }],
    ),
    safe(db.select({ n: count() }).from(schoolPlanOrders).where(eq(schoolPlanOrders.status, 'review')), [{ n: 0 }]),
    safe(db.select({ n: count() }).from(complaints).where(eq(complaints.status, 'new')), [{ n: 0 }]),
    safe(
      db
        .select({ id: users.id })
        .from(users)
        .where(and(gte(users.lastSeenAt, new Date(Date.now() - 15 * 60_000)), isNull(users.deletedAt)))
        .limit(5000),
      [],
    ),
  ]);
  const [backup] = await safe(db.select({ v: siteSettings.value }).from(siteSettings).where(eq(siteSettings.key, 'lastBackup')), []);
  const b = (backup?.v ?? null) as { at?: string; sizeKb?: number } | null;
  const online = (await safe(deps.kv.existsMany(recent.map((r) => `online:${r.id}`)), [])).filter(Boolean).length;
  const mem = process.memoryUsage();
  const down = checks.some((c) => c.name === 'database' && c.status === 'down');
  const degraded = checks.some((c) => c.status === 'down' || c.status === 'slow');
  return {
    checkedAt: Date.now(),
    overall: down ? 'down' : degraded ? 'degraded' : 'ok',
    checks,
    process: {
      uptimeSec: Math.round(process.uptime()),
      rssMb: Math.round(mem.rss / 1048576),
      heapMb: Math.round(mem.heapUsed / 1048576),
      node: process.version,
      loopLagMs: await loopLag(),
    },
    load: {
      online,
      errors24h: errorRows.reduce((n, e) => n + e.n, 0),
      errorKinds: errorRows.map((e) => ({ message: e.message.slice(0, 140), count: e.n })),
      pendingVideos: pendingVideos[0]?.n ?? 0,
      failedVideos: failedVideos[0]?.n ?? 0,
    },
    backup: { at: b?.at ? new Date(b.at).getTime() : null, sizeKb: b?.sizeKb ?? null },
    queues: {
      reports: openReports[0]?.n ?? 0,
      teacherVerifications: verifications[0]?.n ?? 0,
      transfers: transfers[0]?.n ?? 0,
      planPayments: plans[0]?.n ?? 0,
      complaints: newComplaints[0]?.n ?? 0,
    },
  };
}
