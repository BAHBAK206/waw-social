import { createHmac, randomInt, randomUUID } from 'node:crypto';
import { and, desc, eq, inArray, isNull, sql } from 'drizzle-orm';
import { Hono } from 'hono';
import {
  checkoutSchema,
  normalizeSearch,
  redeemVoucherSchema,
  transferRequestSchema,
  transferReviewSchema,
  voucherBatchSchema,
  type CatalogCourseDto,
  type TransferDto,
  type VoucherDto,
} from '@qubedu/shared';
import { courseMembers, courseVouchers, courses, payments, users } from '../db/schema';
import { ownAttachment, readableAttachment, type StoredAttachment } from '../lib/attachments';
import type { AppEnv, AuthUser, Deps } from '../lib/context';
import { safeEqual } from '../lib/crypto';
import { AppError, badRequest, conflict, notFound } from '../lib/errors';
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

/** Online ways to pay for a course: Stripe for any currency, Paymob (cards, wallets) for courses priced in EGP. */
export function paymentMethodsFor(env: Deps['env'], currency: string): CatalogCourseDto['paymentMethods'] {
  const out: CatalogCourseDto['paymentMethods'] = [];
  const paymob = !!env.PAYMOB_SECRET_KEY && !!env.PAYMOB_PUBLIC_KEY && currency === 'EGP';
  if (paymob && env.PAYMOB_CARD_INTEGRATION_ID) out.push('paymob_card');
  if (paymob && env.PAYMOB_WALLET_INTEGRATION_ID) out.push('paymob_wallet');
  if (env.STRIPE_SECRET_KEY) out.push('stripe');
  return out;
}

/** Transfer details count only when at least one way to pay is filled in. */
const hasTransferInfo = (t: (typeof courses.$inferSelect)['transferInfo']) => !!t && !!(t.instapay || t.wallet || t.bank);

async function catalogDtos(deps: Deps, viewer: AuthUser | null, rows: { c: typeof courses.$inferSelect; [k: string]: unknown }[]): Promise<CatalogCourseDto[]> {
  const out: CatalogCourseDto[] = [];
  for (const r of rows) {
    const [stats] = await deps.db.execute<{ assignments: number; materials: number; lessons: number; enrolled: boolean }>(sql`
      select (select count(*)::int from assignments where course_id = ${r.c.id} and state <> 'draft') as assignments,
             (select count(*)::int from course_materials where course_id = ${r.c.id}) as materials,
             (select count(*)::int from quizzes where course_id = ${r.c.id} and deleted_at is null and published) as lessons,
             ${viewer ? sql`exists (select 1 from course_members where course_id = ${r.c.id} and user_id = ${viewer.id})` : sql`false`} as enrolled`);
    const [mine] =
      viewer && r.c.priceCents > 0
        ? await deps.db
            .select({ status: payments.status, reason: payments.reason, createdAt: payments.createdAt })
            .from(payments)
            .where(and(eq(payments.courseId, r.c.id), eq(payments.userId, viewer.id), eq(payments.provider, 'transfer')))
            .orderBy(desc(payments.createdAt))
            .limit(1)
        : [];
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
      paymentMethods: r.c.priceCents > 0 ? paymentMethodsFor(deps.env, r.c.currency) : [],
      transferInfo: r.c.priceCents > 0 && hasTransferInfo(r.c.transferInfo) ? r.c.transferInfo! : null,
      myTransfer:
        mine && !stats?.enrolled && mine.status !== 'paid'
          ? { status: mine.status === 'pending' ? 'pending' : 'rejected', reason: mine.reason, createdAt: mine.createdAt.getTime() }
          : null,
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

/** Paymob API call (JSON, secret key auth). */
async function paymob<T>(deps: Deps, path: string, payload: unknown): Promise<T> {
  const res = await fetch(`${deps.env.PAYMOB_API_URL.replace(/\/$/, '')}${path}`, {
    method: 'POST',
    headers: { authorization: `Token ${deps.env.PAYMOB_SECRET_KEY}`, 'content-type': 'application/json' },
    body: JSON.stringify(payload),
    signal: AbortSignal.timeout(15_000),
  });
  const json = (await res.json().catch(() => ({}))) as T & { detail?: string };
  if (!res.ok) {
    deps.log.warn({ status: res.status, err: json.detail }, 'paymob request failed');
    throw new AppError(502, 'payment_unavailable');
  }
  return json;
}

/** The fields of a Paymob transaction callback, in the order Paymob concatenates them for its HMAC. */
const PAYMOB_HMAC_FIELDS = [
  'amount_cents',
  'created_at',
  'currency',
  'error_occured',
  'has_parent_transaction',
  'id',
  'integration_id',
  'is_3d_secure',
  'is_auth',
  'is_capture',
  'is_refunded',
  'is_standalone_payment',
  'is_voided',
  'order.id',
  'owner',
  'pending',
  'source_data.pan',
  'source_data.sub_type',
  'source_data.type',
  'success',
] as const;

/** HMAC-SHA512 of a Paymob transaction, as sent in the callback's `hmac` query parameter. */
export function paymobHmac(obj: Record<string, unknown>, secret: string): string {
  const get = (path: string): unknown =>
    path.split('.').reduce<unknown>((o, k) => (o && typeof o === 'object' ? (o as Record<string, unknown>)[k] : undefined), obj);
  const text = PAYMOB_HMAC_FIELDS.map((f) => {
    const v = get(f);
    return v === undefined || v === null ? '' : String(v);
  }).join('');
  return createHmac('sha512', secret).update(text).digest('hex');
}

async function paidAndEnrolled(deps: Deps, p: typeof payments.$inferSelect) {
  if (!(await enroll(deps, p.courseId, p.userId))) return;
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

async function transferDtos(deps: Deps, rows: (typeof payments.$inferSelect)[]): Promise<TransferDto[]> {
  const ids = [...new Set(rows.map((r) => r.userId))];
  const people = ids.length ? await deps.db.select(summaryColumns).from(users).where(inArray(users.id, ids)) : [];
  const byId = new Map(people.map((u) => [u.id, toSummary(u)]));
  return Promise.all(
    rows.map(async (r) => ({
      id: r.id,
      user: byId.get(r.userId)!,
      method: (r.method ?? 'bank') as TransferDto['method'],
      reference: r.reference ?? '',
      receipt: await readableAttachment(deps, r.receipt as StoredAttachment | null),
      note: r.note ?? '',
      amountCents: r.amountCents,
      currency: r.currency,
      status: r.status === 'paid' ? 'approved' : r.status === 'failed' ? 'rejected' : 'pending',
      reason: r.reason,
      createdAt: r.createdAt.getTime(),
      reviewedAt: r.reviewedAt?.getTime() ?? null,
    })),
  );
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
    const input = checkoutSchema.parse(await c.req.json().catch(() => ({})));
    const row = await listedCourse(deps, param(c, 'id'));
    if (row.c.priceCents <= 0) throw badRequest('course_is_free');
    if (!paymentMethodsFor(deps.env, row.c.currency).includes(input.method)) throw new AppError(503, 'card_payments_off');
    const [u] = await deps.db.select({ email: users.email, name: users.displayName }).from(users).where(eq(users.id, user.id));
    const app = deps.env.APP_URL.replace(/\/$/, '');
    if (input.method !== 'stripe') {
      if (input.method === 'paymob_wallet' && !input.phone) throw badRequest('phone_required');
      // Our payment id travels as the merchant reference, so the callback finds the row without trusting anything else.
      const pid = randomUUID();
      await deps.db.insert(payments).values({
        id: pid,
        userId: user.id,
        courseId: row.c.id,
        provider: 'paymob',
        method: input.method,
        sessionId: `paymob:${pid}`,
        amountCents: row.c.priceCents,
        currency: row.c.currency,
      });
      const [first, ...rest] = (u?.name ?? 'Student').trim().split(/\s+/);
      const intention = await paymob<{ client_secret: string }>(deps, '/v1/intention/', {
        amount: row.c.priceCents,
        currency: 'EGP',
        payment_methods: [input.method === 'paymob_card' ? deps.env.PAYMOB_CARD_INTEGRATION_ID : deps.env.PAYMOB_WALLET_INTEGRATION_ID],
        items: [{ name: row.c.title.slice(0, 50), amount: row.c.priceCents, quantity: 1, description: 'Course' }],
        billing_data: {
          first_name: first || 'Student',
          last_name: rest.join(' ') || 'NA',
          email: u?.email ?? 'NA',
          phone_number: input.phone ?? 'NA',
          apartment: 'NA',
          floor: 'NA',
          street: 'NA',
          building: 'NA',
          city: 'NA',
          country: 'EG',
          state: 'NA',
          postal_code: 'NA',
        },
        special_reference: pid,
        notification_url: `${deps.env.API_PUBLIC_URL.replace(/\/$/, '')}/webhooks/paymob`,
        redirection_url: `${app}/courses/${row.c.id}?paid=1`,
      }).catch(async (e: unknown) => {
        await deps.db.update(payments).set({ status: 'failed' }).where(eq(payments.id, pid));
        throw e;
      });
      const base = deps.env.PAYMOB_API_URL.replace(/\/$/, '');
      return c.json({
        url: `${base}/unifiedcheckout/?publicKey=${encodeURIComponent(deps.env.PAYMOB_PUBLIC_KEY!)}&clientSecret=${encodeURIComponent(intention.client_secret)}`,
      });
    }
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
  })
  /** Paid by InstaPay, a mobile wallet or a bank transfer: the student sends the reference and a receipt; the teacher approves. */
  .post('/:id/transfer', async (c) => {
    const user = requireUser(c);
    await checkRate(c, { bucket: 'transfer', limit: 10, windowSec: 3600, by: 'user' });
    const deps = c.get('deps');
    const input = await body(c, transferRequestSchema);
    const row = await listedCourse(deps, param(c, 'id'));
    if (row.c.priceCents <= 0) throw badRequest('course_is_free');
    const info = row.c.transferInfo;
    if (!info || !info[input.method]) throw badRequest('transfer_method_off');
    if (row.c.ownerId === user.id) throw badRequest('own_course');
    const [member] = await deps.db
      .select({ u: courseMembers.userId })
      .from(courseMembers)
      .where(and(eq(courseMembers.courseId, row.c.id), eq(courseMembers.userId, user.id)));
    if (member) throw conflict('already_enrolled');
    const receipt = await ownAttachment(deps, user, input.receipt, '');
    if (!receipt.mime.startsWith('image/') && receipt.mime !== 'application/pdf') throw badRequest('invalid_media_url');
    const pid = randomUUID();
    // One open transfer per student and course.
    const inserted = await deps.db.execute<{ id: string }>(sql`
      insert into payments (id, user_id, course_id, provider, session_id, amount_cents, currency, method, reference, receipt, note)
      select ${pid}, ${user.id}, ${row.c.id}, 'transfer', ${`transfer:${pid}`}, ${row.c.priceCents}, ${row.c.currency},
             ${input.method}, ${input.reference}, ${JSON.stringify(receipt)}::jsonb, ${input.note}
      where not exists (select 1 from payments where course_id = ${row.c.id} and user_id = ${user.id} and provider = 'transfer' and status = 'pending')
      returning id`);
    if (!inserted.length) throw conflict('transfer_pending');
    const [me] = await deps.db.select({ name: users.displayName }).from(users).where(eq(users.id, user.id));
    await notify(deps, {
      userId: row.c.ownerId,
      actorId: user.id,
      type: 'transfer_pending',
      icon: 'graduation-cap',
      link: `/school/${row.c.id}?tab=settings`,
      data: { name: me?.name ?? '', course: row.c.title },
      pref: 'school',
    });
    return c.json({ ok: true }, 201);
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
  .get('/courses/:id/transfers', async (c) => {
    const user = requireUser(c);
    const deps = c.get('deps');
    const id = param(c, 'id');
    await requireRole(deps, id, user, ['teacher']);
    const rows = await deps.db
      .select()
      .from(payments)
      .where(and(eq(payments.courseId, id), eq(payments.provider, 'transfer')))
      .orderBy(sql`${payments.status} = 'pending' desc`, desc(payments.createdAt))
      .limit(300);
    return c.json({ items: await transferDtos(deps, rows) });
  })
  .post('/transfers/:transferId/review', async (c) => {
    const user = requireUser(c);
    const deps = c.get('deps');
    const [p] = await deps.db
      .select()
      .from(payments)
      .where(and(eq(payments.id, param(c, 'transferId')), eq(payments.provider, 'transfer')));
    if (!p) throw notFound();
    await requireRole(deps, p.courseId, user, ['teacher']);
    const { approve, reason } = await body(c, transferReviewSchema);
    if (!approve && !reason) throw badRequest('reason_required');
    // Only a pending transfer changes, once (two clicks or two teachers can't enroll twice or flip a decision).
    const [done] = await deps.db
      .update(payments)
      .set({
        status: approve ? 'paid' : 'failed',
        reviewedBy: user.id,
        reviewedAt: new Date(),
        reason: approve ? null : reason,
        ...(approve ? { paidAt: new Date() } : {}),
      })
      .where(and(eq(payments.id, p.id), eq(payments.status, 'pending')))
      .returning();
    if (!done) throw conflict('already_reviewed');
    if (approve) await paidAndEnrolled(deps, done);
    else {
      const [course] = await deps.db.select({ title: courses.title }).from(courses).where(eq(courses.id, p.courseId));
      await notify(deps, {
        userId: p.userId,
        actorId: user.id,
        type: 'transfer_rejected',
        icon: 'graduation-cap',
        link: `/courses/${p.courseId}`,
        data: { course: course?.title ?? '', reason: reason ?? '' },
        pref: 'school',
      });
    }
    return c.json((await transferDtos(deps, [done]))[0]);
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
    if (p) await paidAndEnrolled(deps, p);
  } else if (event.type === 'checkout.session.expired' || event.type === 'checkout.session.async_payment_failed') {
    await deps.db.update(payments).set({ status: 'failed' }).where(eq(payments.sessionId, event.data.object.id));
  }
  return c.json({ received: true });
});

/**
 * Paymob → us (transaction processed callback). The HMAC in the query proves it came from Paymob; the amount and our
 * own payment id (sent as the merchant reference) must match a pending Paymob payment.
 */
export const paymobWebhook = new Hono<AppEnv>().post('/', async (c) => {
  const deps = c.get('deps');
  const secret = deps.env.PAYMOB_HMAC_SECRET;
  if (!secret) throw notFound();
  const event = (await c.req.json().catch(() => null)) as { type?: string; obj?: Record<string, unknown> } | null;
  const obj = event?.obj;
  const hmac = c.req.query('hmac') ?? '';
  if (!obj || !hmac || !safeEqual(hmac.toLowerCase(), paymobHmac(obj, secret))) throw badRequest('bad_signature');
  if (event.type && event.type !== 'TRANSACTION') return c.json({ received: true });
  const order = obj.order as { merchant_order_id?: string | number } | undefined;
  const pid = String(order?.merchant_order_id ?? '');
  if (!/^[0-9a-f-]{36}$/i.test(pid)) return c.json({ received: true });
  const [p] = await deps.db
    .select()
    .from(payments)
    .where(and(eq(payments.id, pid), eq(payments.provider, 'paymob')));
  if (!p || p.status !== 'pending') return c.json({ received: true });
  const ok = obj.success === true && obj.pending !== true && obj.is_voided !== true && obj.is_refunded !== true;
  if (ok && Number(obj.amount_cents) === p.amountCents && String(obj.currency ?? '').toUpperCase() === p.currency) {
    const [paid] = await deps.db
      .update(payments)
      .set({ status: 'paid', paidAt: new Date() })
      .where(and(eq(payments.id, p.id), eq(payments.status, 'pending')))
      .returning();
    if (paid) await paidAndEnrolled(deps, paid);
  } else if (obj.pending !== true) {
    await deps.db
      .update(payments)
      .set({ status: 'failed' })
      .where(and(eq(payments.id, p.id), eq(payments.status, 'pending')));
  }
  return c.json({ received: true });
});
