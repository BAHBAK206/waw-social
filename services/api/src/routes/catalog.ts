import { createHmac, randomInt } from 'node:crypto';
import { and, desc, eq, isNull, sql } from 'drizzle-orm';
import { Hono } from 'hono';
import { normalizeSearch, redeemVoucherSchema, voucherBatchSchema, type CatalogCourseDto, type VoucherDto } from '@qubedu/shared';
import { courseMembers, courseVouchers, courses, payments, users } from '../db/schema';
import type { AppEnv, AuthUser, Deps } from '../lib/context';
import { safeEqual } from '../lib/crypto';
import { AppError, badRequest, notFound } from '../lib/errors';
import { body, param, query, requireUser } from '../lib/http';
import { pickSummary, summaryColumns, toSummary } from '../lib/mappers';
import { notify } from '../lib/notify';
import { checkRate } from '../middleware';
import { courseDtos, requireRole } from './school';
import { z } from 'zod';

const VOUCHER_ALPHABET = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789';
const voucherCode = () => {
  const part = () => Array.from({ length: 4 }, () => VOUCHER_ALPHABET[randomInt(VOUCHER_ALPHABET.length)]).join('');
  return `QB-${part()}-${part()}`;
};

const ownerCols = Object.fromEntries(Object.entries(summaryColumns).map(([k, v]) => [`owner${k[0]!.toUpperCase()}${k.slice(1)}`, v])) as Record<string, never>;

/** Adds a student to a course once (any path: free enrollment, payment, voucher). Returns true when newly added. */
export async function enroll(deps: Deps, courseId: string, userId: string): Promise<boolean> {
  const inserted = await deps.db.insert(courseMembers).values({ courseId, userId, role: 'student' }).onConflictDoNothing().returning();
  if (!inserted.length) return false;
  await deps.db
    .update(courses)
    .set({ memberCount: sql`${courses.memberCount} + 1` })
    .where(eq(courses.id, courseId));
  return true;
}

async function catalogDtos(deps: Deps, viewer: AuthUser | null, rows: { c: typeof courses.$inferSelect; [k: string]: unknown }[]): Promise<CatalogCourseDto[]> {
  const out: CatalogCourseDto[] = [];
  for (const r of rows) {
    const [stats] = await deps.db.execute<{ assignments: number; materials: number; lessons: number; enrolled: boolean }>(sql`
      select (select count(*)::int from assignments where course_id = ${r.c.id} and state <> 'draft') as assignments,
             (select count(*)::int from course_materials where course_id = ${r.c.id}) as materials,
             (select count(*)::int from quizzes where course_id = ${r.c.id} and deleted_at is null and published) as lessons,
             ${viewer ? sql`exists (select 1 from course_members where course_id = ${r.c.id} and user_id = ${viewer.id})` : sql`false`} as enrolled`);
    out.push({
      id: r.c.id,
      title: r.c.title,
      description: r.c.description,
      subject: r.c.subject,
      coverUrl: r.c.coverUrl,
      color: r.c.color,
      owner: toSummary(pickSummary('owner', r as unknown as Record<string, unknown>)),
      memberCount: r.c.memberCount,
      priceCents: r.c.priceCents,
      currency: r.c.currency,
      enrolled: !!stats?.enrolled,
      cardPayments: !!deps.env.STRIPE_SECRET_KEY,
      outline: { assignments: stats?.assignments ?? 0, materials: stats?.materials ?? 0, lessons: stats?.lessons ?? 0 },
    });
  }
  return out;
}

async function listedCourse(deps: Deps, id: string) {
  const [row] = await deps.db
    .select({ c: courses, ...ownerCols })
    .from(courses)
    .innerJoin(users, eq(users.id, courses.ownerId))
    .where(and(eq(courses.id, id), eq(courses.listed, true), eq(courses.archived, false)));
  if (!row) throw notFound('course_not_found');
  return row;
}

/** Stripe API call (form-encoded), without the SDK. */
async function stripe<T>(deps: Deps, path: string, form: Record<string, string>): Promise<T> {
  const res = await fetch(`${deps.env.STRIPE_API_URL.replace(/\/$/, '')}${path}`, {
    method: 'POST',
    headers: { authorization: `Bearer ${deps.env.STRIPE_SECRET_KEY}`, 'content-type': 'application/x-www-form-urlencoded' },
    body: new URLSearchParams(form).toString(),
    signal: AbortSignal.timeout(15_000),
  });
  const json = (await res.json().catch(() => ({}))) as T & { error?: { message?: string } };
  if (!res.ok) {
    deps.log.warn({ status: res.status, err: json.error?.message }, 'stripe request failed');
    throw new AppError(502, 'payment_unavailable');
  }
  return json;
}

/** Verifies Stripe's `Stripe-Signature` header (HMAC-SHA256 of "timestamp.payload", 5-minute tolerance). */
export function verifyStripeSignature(payload: string, header: string | undefined, secret: string, now = Date.now()): boolean {
  if (!header) return false;
  const parts = Object.fromEntries(header.split(',').map((p) => p.split('=') as [string, string]));
  const t = Number(parts.t);
  const sigs = header
    .split(',')
    .filter((p) => p.startsWith('v1='))
    .map((p) => p.slice(3));
  if (!t || !sigs.length || Math.abs(now / 1000 - t) > 300) return false;
  const expected = createHmac('sha256', secret).update(`${t}.${payload}`).digest('hex');
  return sigs.some((s) => safeEqual(s, expected));
}

export const catalogRoutes = new Hono<AppEnv>()
  .get('/', async (c) => {
    const deps = c.get('deps');
    const q = query(c, z.object({ q: z.string().max(100).optional(), limit: z.coerce.number().int().min(1).max(50).default(24) }));
    const term = q.q ? normalizeSearch(q.q) : '';
    const rows = await deps.db
      .select({ c: courses, ...ownerCols })
      .from(courses)
      .innerJoin(users, eq(users.id, courses.ownerId))
      .where(
        and(
          eq(courses.listed, true),
          eq(courses.archived, false),
          isNull(users.deletedAt),
          term ? sql`${courses.searchTitle} ilike ${`%${term}%`}` : undefined,
        ),
      )
      .orderBy(desc(courses.memberCount), desc(courses.createdAt))
      .limit(q.limit);
    return c.json({ items: await catalogDtos(deps, c.get('user') ?? null, rows) });
  })
  .get('/:id', async (c) => {
    const deps = c.get('deps');
    const row = await listedCourse(deps, param(c, 'id'));
    return c.json((await catalogDtos(deps, c.get('user') ?? null, [row]))[0]);
  })
  /** Free courses: join directly. Paid ones need a payment or a voucher. */
  .post('/:id/enroll', async (c) => {
    const user = requireUser(c);
    const deps = c.get('deps');
    const row = await listedCourse(deps, param(c, 'id'));
    if (row.c.priceCents > 0) throw new AppError(402, 'payment_required');
    await enroll(deps, row.c.id, user.id);
    return c.json((await courseDtos(deps, user, [row.c.id]))[0]);
  })
  .post('/:id/checkout', async (c) => {
    const user = requireUser(c);
    await checkRate(c, { bucket: 'checkout', limit: 20, windowSec: 3600, by: 'user' });
    const deps = c.get('deps');
    if (!deps.env.STRIPE_SECRET_KEY) throw new AppError(503, 'card_payments_off');
    const row = await listedCourse(deps, param(c, 'id'));
    if (row.c.priceCents <= 0) throw badRequest('course_is_free');
    const [u] = await deps.db.select({ email: users.email }).from(users).where(eq(users.id, user.id));
    const app = deps.env.APP_URL.replace(/\/$/, '');
    const session = await stripe<{ id: string; url: string }>(deps, '/v1/checkout/sessions', {
      mode: 'payment',
      success_url: `${app}/courses/${row.c.id}?paid=1`,
      cancel_url: `${app}/courses/${row.c.id}`,
      client_reference_id: user.id,
      customer_email: u?.email ?? '',
      'metadata[courseId]': row.c.id,
      'metadata[userId]': user.id,
      'line_items[0][quantity]': '1',
      'line_items[0][price_data][currency]': row.c.currency.toLowerCase(),
      'line_items[0][price_data][unit_amount]': String(row.c.priceCents),
      'line_items[0][price_data][product_data][name]': row.c.title.slice(0, 200),
    });
    await deps.db.insert(payments).values({
      userId: user.id,
      courseId: row.c.id,
      sessionId: session.id,
      amountCents: row.c.priceCents,
      currency: row.c.currency,
    });
    return c.json({ url: session.url });
  });

export const voucherRoutes = new Hono<AppEnv>()
  /** Redeem a voucher from the teacher: enrolls in that course (works for listed and unlisted courses). */
  .post('/redeem', async (c) => {
    const user = requireUser(c);
    // Guessing is limited per account and per address.
    await checkRate(c, { bucket: 'voucher', limit: 10, windowSec: 3600, by: 'user' });
    await checkRate(c, { bucket: 'voucher-ip', limit: 30, windowSec: 3600 });
    const deps = c.get('deps');
    const { code } = await body(c, redeemVoucherSchema);
    const normalized = code.toUpperCase().replace(/\s+/g, '');
    // Mark it used in the same statement that checks it is unused (two people can't spend one code).
    const [v] = await deps.db
      .update(courseVouchers)
      .set({ usedBy: user.id, usedAt: new Date() })
      .where(and(eq(courseVouchers.code, normalized), isNull(courseVouchers.usedAt)))
      .returning({ courseId: courseVouchers.courseId });
    if (!v) throw badRequest('invalid_code');
    await enroll(deps, v.courseId, user.id);
    return c.json((await courseDtos(deps, user, [v.courseId]))[0]);
  })
  .post('/courses/:id/vouchers', async (c) => {
    const user = requireUser(c);
    const deps = c.get('deps');
    const id = param(c, 'id');
    await requireRole(deps, id, user, ['teacher']);
    const { count } = await body(c, voucherBatchSchema);
    const codes = Array.from({ length: count }, voucherCode);
    await deps.db
      .insert(courseVouchers)
      .values(codes.map((code) => ({ code, courseId: id, createdBy: user.id })))
      .onConflictDoNothing();
    return c.json({ codes }, 201);
  })
  .get('/courses/:id/vouchers', async (c) => {
    const user = requireUser(c);
    const deps = c.get('deps');
    const id = param(c, 'id');
    await requireRole(deps, id, user, ['teacher']);
    const rows = await deps.db
      .select({ v: courseVouchers, ...Object.fromEntries(Object.entries(summaryColumns).map(([k, col]) => [`u${k[0]!.toUpperCase()}${k.slice(1)}`, col])) })
      .from(courseVouchers)
      .leftJoin(users, eq(users.id, courseVouchers.usedBy))
      .where(eq(courseVouchers.courseId, id))
      .orderBy(desc(courseVouchers.createdAt))
      .limit(1000);
    const items: VoucherDto[] = rows.map((r) => ({
      code: r.v.code,
      usedBy: r.v.usedBy ? toSummary(pickSummary('u', r as unknown as Record<string, unknown>)) : null,
      usedAt: r.v.usedAt?.getTime() ?? null,
      createdAt: r.v.createdAt.getTime(),
    }));
    return c.json({ items });
  });

/** Stripe → us. Mounted outside /api auth (raw body needed for the signature). */
export const stripeWebhook = new Hono<AppEnv>().post('/', async (c) => {
  const deps = c.get('deps');
  const secret = deps.env.STRIPE_WEBHOOK_SECRET;
  if (!secret) throw notFound();
  const payload = await c.req.text();
  if (!verifyStripeSignature(payload, c.req.header('stripe-signature'), secret)) throw badRequest('bad_signature');
  const event = JSON.parse(payload) as { type: string; data: { object: { id: string; payment_status?: string; metadata?: Record<string, string> } } };
  if (event.type === 'checkout.session.completed' || event.type === 'checkout.session.async_payment_succeeded') {
    const s = event.data.object;
    if (s.payment_status && s.payment_status !== 'paid') return c.json({ received: true });
    const [p] = await deps.db
      .update(payments)
      .set({ status: 'paid', paidAt: new Date() })
      .where(and(eq(payments.sessionId, s.id), eq(payments.status, 'pending')))
      .returning();
    if (p && (await enroll(deps, p.courseId, p.userId))) {
      const [course] = await deps.db.select({ title: courses.title }).from(courses).where(eq(courses.id, p.courseId));
      await notify(deps, {
        userId: p.userId,
        type: 'course_paid',
        icon: 'graduation-cap',
        link: `/school/${p.courseId}`,
        data: { course: course?.title ?? '' },
        pref: 'school',
      });
    }
  } else if (event.type === 'checkout.session.expired' || event.type === 'checkout.session.async_payment_failed') {
    await deps.db.update(payments).set({ status: 'failed' }).where(eq(payments.sessionId, event.data.object.id));
  }
  return c.json({ received: true });
});
