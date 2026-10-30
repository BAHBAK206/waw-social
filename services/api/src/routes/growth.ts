import { randomInt, randomUUID } from 'node:crypto';
import {
  REFERRAL_MAX_REWARDS,
  REFERRAL_XP,
  couponInputSchema,
  couponPatchSchema,
  couponPreviewSchema,
  lessonBookSchema,
  lessonSlotsSchema,
  planById,
  planOrderSchema,
  planPrice,
  planReviewSchema,
  portfolioInputSchema,
  portfolioItemSchema,
  slugify,
  type CouponDto,
  type CouponPreviewDto,
  type PlanOrderDto,
  type PlanReviewItemDto,
  type PortfolioDto,
  type PrivateLessonDto,
  type PublicPortfolioDto,
  type ReferralDto,
  type SchoolPlanStateDto,
} from '@qubedu/shared';
import { and, asc, desc, eq, gte, inArray, isNotNull, ne, or, sql } from 'drizzle-orm';
import { Hono } from 'hono';
import {
  certificates,
  courses,
  coupons,
  guardianLinks,
  portfolioItems,
  portfolios,
  privateLessons,
  quizAttempts,
  referrals,
  schoolPlanOrders,
  schools,
  userAchievements,
  users,
} from '../db/schema';
import { ownAttachment, readableAttachment, type StoredAttachment } from '../lib/attachments';
import type { AppEnv, AuthUser, Deps } from '../lib/context';
import { AppError, badRequest, conflict, forbidden, notFound } from '../lib/errors';
import { activateLesson, activatePlanOrder, ensureReferralCode, releaseStaleLessons, resolveCoupon, schoolPlanStatus } from '../lib/growth';
import { body, isStaffUser, param, query, requireUser } from '../lib/http';
import { summaryColumns, toSummary } from '../lib/mappers';
import { isMinor, minorColumns } from '../lib/minors';
import { notify } from '../lib/notify';
import { checkRate } from '../middleware';
import { paymentMethodsFor, paymob } from './catalog';
import { masteryFor } from './quizzes';
import { requireRole } from './school';
import { requireSchoolRole } from './schools';
import { z } from 'zod';

/* ───────── Paymob ───────── */

async function paymobCheckoutUrl(
  deps: Deps,
  p: { userId: string; amountCents: number; item: string; ref: string; method: 'paymob_card' | 'paymob_wallet'; phone?: string; redirect: string },
): Promise<string> {
  const [u] = await deps.db.select({ email: users.email, name: users.displayName }).from(users).where(eq(users.id, p.userId));
  const [first, ...rest] = (u?.name ?? 'Customer').trim().split(/\s+/);
  const intention = await paymob<{ client_secret: string }>(deps, '/v1/intention/', {
    amount: p.amountCents,
    currency: 'EGP',
    payment_methods: [p.method === 'paymob_card' ? deps.env.PAYMOB_CARD_INTEGRATION_ID : deps.env.PAYMOB_WALLET_INTEGRATION_ID],
    items: [{ name: p.item.slice(0, 50), amount: p.amountCents, quantity: 1, description: 'Qubedu' }],
    billing_data: {
      first_name: first || 'Customer',
      last_name: rest.join(' ') || 'NA',
      email: u?.email ?? 'NA',
      phone_number: p.phone ?? 'NA',
      apartment: 'NA',
      floor: 'NA',
      street: 'NA',
      building: 'NA',
      city: 'NA',
      country: 'EG',
      state: 'NA',
      postal_code: 'NA',
    },
    special_reference: p.ref,
    notification_url: `${deps.env.API_PUBLIC_URL.replace(/\/$/, '')}/webhooks/paymob`,
    redirection_url: p.redirect,
  });
  const base = deps.env.PAYMOB_API_URL.replace(/\/$/, '');
  return `${base}/unifiedcheckout/?publicKey=${encodeURIComponent(deps.env.PAYMOB_PUBLIC_KEY!)}&clientSecret=${encodeURIComponent(intention.client_secret)}`;
}

const appUrl = (deps: Deps) => deps.env.APP_URL.replace(/\/$/, '');

/* ───────── Coupons ───────── */

const COUPON_ALPHABET = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789';
const couponCode = () => Array.from({ length: 8 }, () => COUPON_ALPHABET[randomInt(COUPON_ALPHABET.length)]).join('');

function couponDto(c: typeof coupons.$inferSelect, courseTitle: string | null): CouponDto {
  return {
    id: c.id,
    code: c.code,
    courseId: c.courseId,
    courseTitle,
    percentOff: c.percentOff,
    amountOffCents: c.amountOffCents,
    maxUses: c.maxUses,
    uses: c.uses,
    expiresAt: c.expiresAt?.getTime() ?? null,
    active: c.active,
    createdAt: c.createdAt.getTime(),
  };
}

export const couponRoutes = new Hono<AppEnv>()
  .get('/', async (c) => {
    const user = requireUser(c);
    const deps = c.get('deps');
    const rows = await deps.db
      .select({ c: coupons, title: courses.title })
      .from(coupons)
      .leftJoin(courses, eq(courses.id, coupons.courseId))
      .where(eq(coupons.ownerId, user.id))
      .orderBy(desc(coupons.createdAt))
      .limit(200);
    return c.json({ items: rows.map((r) => couponDto(r.c, r.title)) });
  })
  .post('/', async (c) => {
    const user = requireUser(c);
    await checkRate(c, { bucket: 'coupon-create', limit: 60, windowSec: 3600, by: 'user' });
    const deps = c.get('deps');
    const input = await body(c, couponInputSchema);
    if (user.accountType !== 'teacher') throw forbidden('teachers_only');
    if (input.courseId) await requireRole(deps, input.courseId, user, ['teacher']);
    const [row] = await deps.db
      .insert(coupons)
      .values({
        ownerId: user.id,
        courseId: input.courseId ?? null,
        code: input.code ?? couponCode(),
        percentOff: input.percentOff ?? null,
        amountOffCents: input.amountOffCents ?? null,
        maxUses: input.maxUses ?? null,
        expiresAt: input.expiresAt ? new Date(input.expiresAt) : null,
      })
      .onConflictDoNothing()
      .returning();
    if (!row) throw conflict('coupon_taken');
    const [course] = row.courseId ? await deps.db.select({ t: courses.title }).from(courses).where(eq(courses.id, row.courseId)) : [];
    return c.json(couponDto(row, course?.t ?? null), 201);
  })
  .patch('/:id', async (c) => {
    const user = requireUser(c);
    const deps = c.get('deps');
    const { active } = await body(c, couponPatchSchema);
    const [row] = await deps.db
      .update(coupons)
      .set({ active })
      .where(and(eq(coupons.id, param(c, 'id')), eq(coupons.ownerId, user.id)))
      .returning();
    if (!row) throw notFound();
    return c.json(couponDto(row, null));
  })
  .delete('/:id', async (c) => {
    const user = requireUser(c);
    const deps = c.get('deps');
    const gone = await deps.db
      .delete(coupons)
      .where(and(eq(coupons.id, param(c, 'id')), eq(coupons.ownerId, user.id)))
      .returning({ id: coupons.id });
    if (!gone.length) throw notFound();
    return c.json({ ok: true });
  })
  /** What a student would pay with a code, before they pay. */
  .post('/preview/:courseId', async (c) => {
    const user = requireUser(c);
    await checkRate(c, { bucket: 'coupon-preview', limit: 30, windowSec: 600, by: 'user' });
    const deps = c.get('deps');
    const { code } = await body(c, couponPreviewSchema);
    const [course] = await deps.db
      .select({ id: courses.id, ownerId: courses.ownerId, priceCents: courses.priceCents, currency: courses.currency })
      .from(courses)
      .where(and(eq(courses.id, param(c, 'courseId')), eq(courses.listed, true), eq(courses.archived, false)));
    if (!course || course.priceCents <= 0) throw notFound('course_not_found');
    const applied = await resolveCoupon(deps, user.id, course, code);
    return c.json({
      priceCents: course.priceCents,
      discountCents: applied.discountCents,
      finalCents: applied.finalCents,
      currency: course.currency,
    } satisfies CouponPreviewDto);
  });

/* ───────── Private lessons ───────── */

type LessonRow = typeof privateLessons.$inferSelect;

async function lessonDtos(deps: Deps, viewer: AuthUser, rows: LessonRow[]): Promise<PrivateLessonDto[]> {
  const ids = [...new Set(rows.flatMap((r) => [r.teacherId, r.studentId]).filter((x): x is string => !!x))];
  const people = ids.length ? await deps.db.select(summaryColumns).from(users).where(inArray(users.id, ids)) : [];
  const byId = new Map(people.map((p) => [p.id, toSummary(p)]));
  return rows.map((r) => {
    const mine = r.teacherId === viewer.id ? 'teacher' : r.studentId === viewer.id ? 'student' : null;
    return {
      id: r.id,
      teacher: byId.get(r.teacherId)!,
      title: r.title,
      startsAt: r.startsAt.getTime(),
      durationMin: r.durationMin,
      priceCents: r.priceCents,
      currency: r.currency,
      status: r.status,
      student: mine && r.studentId ? (byId.get(r.studentId) ?? null) : null,
      payStatus: r.payStatus,
      roomId: mine ? r.roomId : null,
      mine,
    };
  });
}

export const lessonRoutes = new Hono<AppEnv>()
  /** Slots people can book, optionally from one teacher. */
  .get('/open', async (c) => {
    const user = requireUser(c);
    const deps = c.get('deps');
    const q = query(c, z.object({ teacherId: z.string().uuid().optional() }));
    await releaseStaleLessons(deps);
    const rows = await deps.db
      .select()
      .from(privateLessons)
      .where(
        and(
          eq(privateLessons.status, 'open'),
          gte(privateLessons.startsAt, new Date(Date.now() + 30 * 60_000)),
          ne(privateLessons.teacherId, user.id),
          q.teacherId ? eq(privateLessons.teacherId, q.teacherId) : undefined,
        ),
      )
      .orderBy(asc(privateLessons.startsAt))
      .limit(100);
    return c.json({ items: await lessonDtos(deps, user, rows) });
  })
  .get('/mine', async (c) => {
    const user = requireUser(c);
    const deps = c.get('deps');
    await releaseStaleLessons(deps);
    const rows = await deps.db
      .select()
      .from(privateLessons)
      .where(
        and(
          or(eq(privateLessons.teacherId, user.id), eq(privateLessons.studentId, user.id)),
          gte(privateLessons.startsAt, new Date(Date.now() - 24 * 3600_000)),
          ne(privateLessons.status, 'cancelled'),
        ),
      )
      .orderBy(asc(privateLessons.startsAt))
      .limit(200);
    return c.json({ items: await lessonDtos(deps, user, rows) });
  })
  /** A teacher publishes slots across a time range, each with the same title and price. */
  .post('/', async (c) => {
    const user = requireUser(c);
    await checkRate(c, { bucket: 'lesson-slots', limit: 30, windowSec: 3600, by: 'user' });
    const deps = c.get('deps');
    if (user.accountType !== 'teacher') throw forbidden('teachers_only');
    const input = await body(c, lessonSlotsSchema);
    if (input.priceCents > 0 && input.priceCents < 1000) throw badRequest('price_too_low');
    if (input.start < Date.now()) throw badRequest('in_the_past');
    const step = input.slotMinutes * 60_000;
    const starts: number[] = [];
    for (let t = input.start; t + step <= input.end; t += step) starts.push(t);
    if (!starts.length) throw badRequest('range');
    const existing = await deps.db
      .select({ s: privateLessons.startsAt, d: privateLessons.durationMin })
      .from(privateLessons)
      .where(
        and(eq(privateLessons.teacherId, user.id), ne(privateLessons.status, 'cancelled'), gte(privateLessons.startsAt, new Date(input.start - 4 * 3600_000))),
      );
    const free = starts.filter((s) => !existing.some((e) => s < e.s.getTime() + e.d * 60_000 && e.s.getTime() < s + step));
    if (free.length)
      await deps.db
        .insert(privateLessons)
        .values(
          free.map((s) => ({ teacherId: user.id, title: input.title, startsAt: new Date(s), durationMin: input.slotMinutes, priceCents: input.priceCents })),
        );
    return c.json({ created: free.length, skipped: starts.length - free.length }, 201);
  })
  .post('/:id/book', async (c) => {
    const user = requireUser(c);
    await checkRate(c, { bucket: 'lesson-book', limit: 20, windowSec: 3600, by: 'user' });
    const deps = c.get('deps');
    const input = await body(c, lessonBookSchema);
    const id = param(c, 'id');
    await releaseStaleLessons(deps);
    const [lesson] = await deps.db.select().from(privateLessons).where(eq(privateLessons.id, id));
    if (!lesson || lesson.status !== 'open' || lesson.startsAt.getTime() < Date.now() + 30 * 60_000) throw notFound('lesson_not_found');
    if (lesson.teacherId === user.id) throw badRequest('own_lesson');
    if (lesson.priceCents > 0) {
      if (!input.method || !paymentMethodsFor(deps.env, 'EGP').includes(input.method)) throw new AppError(503, 'card_payments_off');
      if (input.method === 'paymob_wallet' && !input.phone) throw badRequest('phone_required');
    }
    // Take the slot in one statement: two students can't both get it.
    const [claimed] = await deps.db
      .update(privateLessons)
      .set({
        status: 'booked',
        studentId: user.id,
        payerId: user.id,
        payStatus: 'pending',
        bookedAt: new Date(),
        provider: lesson.priceCents > 0 ? 'paymob' : 'free',
        method: input.method ?? null,
      })
      .where(and(eq(privateLessons.id, id), eq(privateLessons.status, 'open')))
      .returning();
    if (!claimed) throw conflict('lesson_taken');
    if (claimed.priceCents <= 0) {
      await activateLesson(deps, claimed.id);
      return c.json({ url: `${appUrl(deps)}/lessons?booked=1` });
    }
    try {
      const url = await paymobCheckoutUrl(deps, {
        userId: user.id,
        amountCents: claimed.priceCents,
        item: claimed.title,
        ref: claimed.id,
        method: input.method!,
        phone: input.phone,
        redirect: `${appUrl(deps)}/lessons?paid=1`,
      });
      return c.json({ url });
    } catch (e) {
      await deps.db
        .update(privateLessons)
        .set({ status: 'open', studentId: null, payStatus: 'none', provider: null, method: null, bookedAt: null })
        .where(and(eq(privateLessons.id, id), eq(privateLessons.payStatus, 'pending')));
      throw e;
    }
  })
  .post('/:id/cancel', async (c) => {
    const user = requireUser(c);
    const deps = c.get('deps');
    const [l] = await deps.db
      .select()
      .from(privateLessons)
      .where(eq(privateLessons.id, param(c, 'id')));
    if (!l || l.status === 'cancelled') throw notFound('lesson_not_found');
    const isTeacher = l.teacherId === user.id;
    const isStudent = l.studentId === user.id;
    if (!isTeacher && !isStudent) throw notFound('lesson_not_found');
    // A paid lesson is cancelled by the teacher only (who settles any refund); a student can drop an unpaid hold.
    if (isStudent && !isTeacher && l.payStatus === 'paid') throw forbidden('paid_lesson_teacher_only');
    if (isStudent && !isTeacher) {
      await deps.db
        .update(privateLessons)
        .set({ status: 'open', studentId: null, payStatus: 'none', provider: null, method: null, bookedAt: null })
        .where(and(eq(privateLessons.id, l.id), eq(privateLessons.studentId, user.id)));
      return c.json({ ok: true });
    }
    await deps.db.update(privateLessons).set({ status: 'cancelled' }).where(eq(privateLessons.id, l.id));
    if (l.studentId)
      await notify(deps, {
        userId: l.studentId,
        actorId: user.id,
        type: 'lesson_cancelled',
        icon: 'calendar-x',
        link: '/lessons',
        data: { title: l.title, startAt: l.startsAt.getTime(), paid: l.payStatus === 'paid' },
        pref: 'school',
      });
    return c.json({ ok: true });
  });

/* ───────── School plans ───────── */

const orderDto = (o: typeof schoolPlanOrders.$inferSelect): PlanOrderDto => ({
  id: o.id,
  plan: o.plan,
  period: o.period,
  amountCents: o.amountCents,
  method: o.method ?? '',
  status: o.status,
  reason: o.reason,
  createdAt: o.createdAt.getTime(),
});

export const planRoutes = new Hono<AppEnv>()
  .get('/:id/plan', async (c) => {
    const user = requireUser(c);
    const deps = c.get('deps');
    const id = param(c, 'id');
    await requireSchoolRole(deps, id, user, ['admin']);
    const s = await schoolPlanStatus(deps, id);
    const orders = await deps.db.select().from(schoolPlanOrders).where(eq(schoolPlanOrders.schoolId, id)).orderBy(desc(schoolPlanOrders.createdAt)).limit(20);
    return c.json({
      plan: s.plan.id,
      periodEnd: s.periodEnd,
      students: s.students,
      limit: s.plan.students,
      orders: orders.map(orderDto),
      transferInfo: deps.env.PLATFORM_TRANSFER_INFO ?? null,
    } satisfies SchoolPlanStateDto);
  })
  .post('/:id/plan/orders', async (c) => {
    const user = requireUser(c);
    await checkRate(c, { bucket: 'plan-order', limit: 10, windowSec: 3600, by: 'user' });
    const deps = c.get('deps');
    const id = param(c, 'id');
    await requireSchoolRole(deps, id, user, ['admin']);
    const input = await body(c, planOrderSchema);
    const amountCents = planPrice(planById(input.plan), input.period);
    const [school] = await deps.db.select({ name: schools.name }).from(schools).where(eq(schools.id, id));
    if (input.method === 'transfer') {
      if (!deps.env.PLATFORM_TRANSFER_INFO) throw badRequest('transfer_method_off');
      if (!input.reference || !input.receipt) throw badRequest('receipt_required');
      const receipt = await ownAttachment(deps, user, input.receipt, '');
      if (!receipt.mime.startsWith('image/') && receipt.mime !== 'application/pdf') throw badRequest('invalid_media_url');
      const [o] = await deps.db
        .insert(schoolPlanOrders)
        .values({
          schoolId: id,
          plan: input.plan,
          period: input.period,
          amountCents,
          provider: 'transfer',
          method: 'transfer',
          reference: input.reference,
          receipt,
          status: 'review',
          createdBy: user.id,
        })
        .returning();
      return c.json({ order: orderDto(o!), url: null }, 201);
    }
    if (!paymentMethodsFor(deps.env, 'EGP').includes(input.method)) throw new AppError(503, 'card_payments_off');
    if (input.method === 'paymob_wallet' && !input.phone) throw badRequest('phone_required');
    const pid = randomUUID();
    const [o] = await deps.db
      .insert(schoolPlanOrders)
      .values({ id: pid, schoolId: id, plan: input.plan, period: input.period, amountCents, provider: 'paymob', method: input.method, createdBy: user.id })
      .returning();
    try {
      const url = await paymobCheckoutUrl(deps, {
        userId: user.id,
        amountCents,
        item: `${school?.name ?? 'School'} · ${input.plan}`,
        ref: pid,
        method: input.method,
        phone: input.phone,
        redirect: `${appUrl(deps)}/schools/${id}?tab=plan&paid=1`,
      });
      return c.json({ order: orderDto(o!), url }, 201);
    } catch (e) {
      await deps.db.update(schoolPlanOrders).set({ status: 'failed' }).where(eq(schoolPlanOrders.id, pid));
      throw e;
    }
  });

/** Platform staff approve plan payments made by transfer. */
export const planReviewRoutes = new Hono<AppEnv>()
  .get('/plans/review', async (c) => {
    const user = requireUser(c);
    if (!isStaffUser(user, 'site.manage')) throw forbidden('missing_permission');
    const deps = c.get('deps');
    const rows = await deps.db
      .select({ o: schoolPlanOrders, school: schools.name })
      .from(schoolPlanOrders)
      .innerJoin(schools, eq(schools.id, schoolPlanOrders.schoolId))
      .where(eq(schoolPlanOrders.status, 'review'))
      .orderBy(asc(schoolPlanOrders.createdAt))
      .limit(100);
    const items: PlanReviewItemDto[] = await Promise.all(
      rows.map(async (r) => ({
        ...orderDto(r.o),
        school: { id: r.o.schoolId, name: r.school },
        reference: r.o.reference,
        receipt: await readableAttachment(deps, r.o.receipt as StoredAttachment | null),
      })),
    );
    return c.json({ items });
  })
  .post('/plans/:oid/review', async (c) => {
    const user = requireUser(c);
    if (!isStaffUser(user, 'site.manage')) throw forbidden('missing_permission');
    const deps = c.get('deps');
    const { approve, reason } = await body(c, planReviewSchema);
    const [o] = await deps.db
      .select()
      .from(schoolPlanOrders)
      .where(and(eq(schoolPlanOrders.id, param(c, 'oid')), eq(schoolPlanOrders.status, 'review')));
    if (!o) throw conflict('already_reviewed');
    if (approve) {
      await deps.db.update(schoolPlanOrders).set({ reviewedBy: user.id }).where(eq(schoolPlanOrders.id, o.id));
      await activatePlanOrder(deps, o.id);
    } else {
      if (!reason) throw badRequest('reason_required');
      await deps.db
        .update(schoolPlanOrders)
        .set({ status: 'failed', reason, reviewedBy: user.id })
        .where(and(eq(schoolPlanOrders.id, o.id), eq(schoolPlanOrders.status, 'review')));
      if (o.createdBy)
        await notify(deps, {
          userId: o.createdBy,
          actorId: user.id,
          type: 'plan_rejected',
          icon: 'building-2',
          link: `/schools/${o.schoolId}?tab=plan`,
          data: { reason },
          pref: 'school',
        });
    }
    return c.json({ ok: true });
  });

/* ───────── Portfolio ───────── */

const portfolioRowDto = async (deps: Deps, userId: string, row: typeof portfolios.$inferSelect): Promise<PortfolioDto> => {
  const items = await deps.db.select().from(portfolioItems).where(eq(portfolioItems.userId, userId)).orderBy(desc(portfolioItems.createdAt)).limit(100);
  return {
    slug: row.slug,
    enabled: row.enabled,
    headline: row.headline,
    bio: row.bio,
    showCertificates: row.showCertificates,
    showStats: row.showStats,
    items: items.map((i) => ({ id: i.id, kind: i.kind, title: i.title, description: i.description, url: i.url, day: i.day })),
    blocked: await guardianNeeded(deps, userId),
  };
};

/** A student under 18 needs a linked parent before the page can be public. */
async function guardianNeeded(deps: Deps, userId: string): Promise<'needs_guardian' | null> {
  const [u] = await deps.db.select(minorColumns).from(users).where(eq(users.id, userId));
  if (!u || !isMinor(u)) return null;
  const [g] = await deps.db.select({ g: guardianLinks.guardianId }).from(guardianLinks).where(eq(guardianLinks.studentId, userId)).limit(1);
  return g ? null : 'needs_guardian';
}

async function ownPortfolio(deps: Deps, userId: string, name: string) {
  const [existing] = await deps.db.select().from(portfolios).where(eq(portfolios.userId, userId));
  if (existing) return existing;
  const base = slugify(name) || 'student';
  for (let i = 0; i < 6; i++) {
    const slug = i === 0 && base.length >= 3 ? base : `${base.slice(0, 26)}-${randomInt(1000, 9999)}`;
    const [row] = await deps.db.insert(portfolios).values({ userId, slug }).onConflictDoNothing().returning();
    if (row) return row;
    const [again] = await deps.db.select().from(portfolios).where(eq(portfolios.userId, userId));
    if (again) return again;
  }
  throw new AppError(500, 'portfolio_failed');
}

export const portfolioRoutes = new Hono<AppEnv>()
  /** A public page, no sign-in. Young students show a first name only and no photo. */
  .get('/public/:slug', async (c) => {
    await checkRate(c, { bucket: 'portfolio-view', limit: 120, windowSec: 600 });
    const deps = c.get('deps');
    const slug = (c.req.param('slug') ?? '').toLowerCase();
    const [row] = await deps.db
      .select({ p: portfolios, u: users })
      .from(portfolios)
      .innerJoin(users, eq(users.id, portfolios.userId))
      .where(and(eq(portfolios.slug, slug), eq(portfolios.enabled, true)));
    if (!row || row.u.deletedAt || row.u.bannedAt) throw notFound('portfolio_not_found');
    const minor = isMinor(row.u);
    const userId = row.u.id;
    const items = await deps.db.select().from(portfolioItems).where(eq(portfolioItems.userId, userId)).orderBy(desc(portfolioItems.createdAt)).limit(100);
    const ach = await deps.db.select({ id: userAchievements.achievementId }).from(userAchievements).where(eq(userAchievements.userId, userId));
    const certs = row.p.showCertificates
      ? await deps.db
          .select()
          .from(certificates)
          .where(and(eq(certificates.userId, userId), sql`${certificates.revokedAt} is null`))
          .orderBy(desc(certificates.issuedAt))
          .limit(50)
      : [];
    let stats: PublicPortfolioDto['stats'] = null;
    let topics: PublicPortfolioDto['topics'] = [];
    if (row.p.showStats) {
      const [s] = await deps.db
        .select({ n: sql<number>`count(*)::int`, avg: sql<number>`coalesce(round(avg(${quizAttempts.pct})), 0)::int` })
        .from(quizAttempts)
        .where(and(eq(quizAttempts.userId, userId), isNotNull(quizAttempts.submittedAt), eq(quizAttempts.review, false)));
      stats = { quizzes: s?.n ?? 0, averagePct: s?.avg ?? 0 };
      topics = (await masteryFor(deps, userId))
        .filter((m) => m.mastery >= 75 && m.evidenceQuestions >= 5)
        .sort((a, b) => b.mastery - a.mastery)
        .slice(0, 6)
        .map((m) => ({ topic: m.topic, mastery: Math.round(m.mastery) }));
    }
    return c.json({
      name: minor ? (row.u.displayName.trim().split(/\s+/)[0] ?? row.u.displayName) : row.u.displayName,
      avatarUrl: minor ? null : row.u.avatarUrl,
      headline: row.p.headline,
      bio: row.p.bio,
      level: row.u.level,
      xp: row.u.xp,
      streak: row.u.streak,
      joinedAt: row.u.createdAt.getTime(),
      achievements: ach.map((a) => a.id),
      stats,
      topics,
      certificates: certs.map((x) => ({ code: x.code, title: x.title, issuerName: x.issuerName, grade: x.grade, issuedAt: x.issuedAt.getTime() })),
      items: items.map((i) => ({ id: i.id, kind: i.kind, title: i.title, description: i.description, url: i.url, day: i.day })),
    } satisfies PublicPortfolioDto);
  })
  .get('/mine', async (c) => {
    const user = requireUser(c);
    const deps = c.get('deps');
    const row = await ownPortfolio(deps, user.id, user.displayName);
    return c.json(await portfolioRowDto(deps, user.id, row));
  })
  .put('/mine', async (c) => {
    const user = requireUser(c);
    const deps = c.get('deps');
    const input = await body(c, portfolioInputSchema);
    const row = await ownPortfolio(deps, user.id, user.displayName);
    if (input.enabled && (await guardianNeeded(deps, user.id))) throw forbidden('needs_guardian');
    const set = {
      ...(input.enabled !== undefined ? { enabled: input.enabled } : {}),
      ...(input.slug !== undefined ? { slug: input.slug } : {}),
      ...(input.headline !== undefined ? { headline: input.headline } : {}),
      ...(input.bio !== undefined ? { bio: input.bio } : {}),
      ...(input.showCertificates !== undefined ? { showCertificates: input.showCertificates } : {}),
      ...(input.showStats !== undefined ? { showStats: input.showStats } : {}),
      updatedAt: new Date(),
    };
    try {
      const [next] = await deps.db.update(portfolios).set(set).where(eq(portfolios.userId, user.id)).returning();
      return c.json(await portfolioRowDto(deps, user.id, next ?? row));
    } catch (e) {
      const pg = (e as { code?: string; cause?: { code?: string } }).cause ?? (e as { code?: string });
      if (pg.code === '23505') throw conflict('slug_taken');
      throw e;
    }
  })
  .post('/items', async (c) => {
    const user = requireUser(c);
    const deps = c.get('deps');
    const input = await body(c, portfolioItemSchema);
    const [n] = await deps.db
      .select({ n: sql<number>`count(*)::int` })
      .from(portfolioItems)
      .where(eq(portfolioItems.userId, user.id));
    if ((n?.n ?? 0) >= 50) throw badRequest('too_many_items');
    const [row] = await deps.db
      .insert(portfolioItems)
      .values({ userId: user.id, kind: input.kind, title: input.title, description: input.description, url: input.url ?? null, day: input.day ?? null })
      .returning();
    return c.json({ id: row!.id }, 201);
  })
  .delete('/items/:id', async (c) => {
    const user = requireUser(c);
    const deps = c.get('deps');
    const gone = await deps.db
      .delete(portfolioItems)
      .where(and(eq(portfolioItems.id, param(c, 'id')), eq(portfolioItems.userId, user.id)))
      .returning({ id: portfolioItems.id });
    if (!gone.length) throw notFound();
    return c.json({ ok: true });
  });

/* ───────── Referrals ───────── */

export const referralRoutes = new Hono<AppEnv>().get('/mine', async (c) => {
  const user = requireUser(c);
  const deps = c.get('deps');
  const code = await ensureReferralCode(deps, user.id);
  const rows = await deps.db
    .select({ r: referrals, name: users.displayName })
    .from(referrals)
    .innerJoin(users, eq(users.id, referrals.referredId))
    .where(eq(referrals.referrerId, user.id))
    .orderBy(desc(referrals.createdAt))
    .limit(100);
  const rewarded = rows.filter((r) => r.r.rewardedAt).length;
  return c.json({
    code,
    invited: rows.length,
    rewarded,
    xpEarned: Math.min(rewarded, REFERRAL_MAX_REWARDS) * REFERRAL_XP,
    maxRewards: REFERRAL_MAX_REWARDS,
    rewardXp: REFERRAL_XP,
    friends: rows.map((r) => ({ name: r.name, joinedAt: r.r.createdAt.getTime(), rewarded: !!r.r.rewardedAt })),
  } satisfies ReferralDto);
});
