import { randomBytes } from 'node:crypto';
import {
  LESSON_HOLD_MINUTES,
  REFERRAL_CODE_LENGTH,
  REFERRAL_MAX_REWARDS,
  REFERRAL_XP,
  applyCoupon,
  couponProblem,
  currentPlan,
  dayKey,
  extendPeriod,
  seatsLeft,
  type SchoolPlan,
} from '@qubedu/shared';
import { and, eq, inArray, isNotNull, isNull, lt, sql } from 'drizzle-orm';
import {
  conversations,
  couponUses,
  coupons,
  liveRooms,
  privateLessons,
  referrals,
  schoolMembers,
  schoolPlanOrders,
  schoolSubscriptions,
  users,
} from '../db/schema';
import type { Deps } from './context';
import { AppError, badRequest, notFound } from './errors';
import { notify } from './notify';
import { awardXp } from './progress';

/* ───────── Coupons ───────── */

export interface AppliedCoupon {
  couponId: string;
  discountCents: number;
  finalCents: number;
}

/** Checks a discount code for one course and one student; throws a coded error when it cannot be used. */
export async function resolveCoupon(
  deps: Deps,
  userId: string,
  course: { id: string; ownerId: string; priceCents: number },
  code: string,
): Promise<AppliedCoupon> {
  const normalized = code.trim().toUpperCase();
  const [c] = await deps.db.select().from(coupons).where(eq(coupons.code, normalized));
  // A coupon belongs to one teacher: it works for their courses only.
  if (!c || c.ownerId !== course.ownerId || (c.courseId && c.courseId !== course.id)) throw badRequest('coupon_invalid');
  const [used] = await deps.db
    .select({ u: couponUses.userId })
    .from(couponUses)
    .where(and(eq(couponUses.couponId, c.id), eq(couponUses.userId, userId)));
  const problem = couponProblem(
    {
      percentOff: c.percentOff,
      amountOffCents: c.amountOffCents,
      maxUses: c.maxUses,
      uses: c.uses,
      expiresAt: c.expiresAt?.getTime() ?? null,
      active: c.active,
    },
    !!used,
  );
  if (problem) throw badRequest(`coupon_${problem}`);
  const { discountCents, finalCents } = applyCoupon(course.priceCents, c);
  return { couponId: c.id, discountCents, finalCents };
}

/** A payment that used a coupon was paid: count the use once (a second call for the same student changes nothing). */
export async function settleCouponUse(deps: Deps, p: { userId: string; couponId: string | null }): Promise<void> {
  if (!p.couponId) return;
  const inserted = await deps.db
    .insert(couponUses)
    .values({ couponId: p.couponId, userId: p.userId })
    .onConflictDoNothing()
    .returning({ c: couponUses.couponId });
  if (inserted.length)
    await deps.db
      .update(coupons)
      .set({ uses: sql`${coupons.uses} + 1` })
      .where(eq(coupons.id, p.couponId));
}

/* ───────── School plans ───────── */

export interface SchoolPlanStatus {
  plan: SchoolPlan;
  periodEnd: number | null;
  students: number;
}

export async function schoolPlanStatus(deps: Deps, schoolId: string): Promise<SchoolPlanStatus> {
  const [sub] = await deps.db.select().from(schoolSubscriptions).where(eq(schoolSubscriptions.schoolId, schoolId));
  const [n] = await deps.db
    .select({ n: sql<number>`count(*)::int` })
    .from(schoolMembers)
    .where(and(eq(schoolMembers.schoolId, schoolId), eq(schoolMembers.role, 'student')));
  const periodEnd = sub?.periodEnd?.getTime() ?? null;
  return { plan: currentPlan(sub ? { plan: sub.plan, periodEnd } : null), periodEnd, students: n?.n ?? 0 };
}

/** Students the school can still add on its plan (null = unlimited). */
export async function seatsAvailable(deps: Deps, schoolId: string): Promise<number | null> {
  const s = await schoolPlanStatus(deps, schoolId);
  return seatsLeft(s.plan, s.students);
}

/** A plan order was paid: start (or extend) the subscription once. */
export async function activatePlanOrder(deps: Deps, orderId: string): Promise<boolean> {
  const [o] = await deps.db
    .update(schoolPlanOrders)
    .set({ status: 'paid', paidAt: new Date() })
    .where(and(eq(schoolPlanOrders.id, orderId), inArray(schoolPlanOrders.status, ['pending', 'review'])))
    .returning();
  if (!o) return false;
  const [sub] = await deps.db.select().from(schoolSubscriptions).where(eq(schoolSubscriptions.schoolId, o.schoolId));
  const current = sub && sub.plan === o.plan ? (sub.periodEnd?.getTime() ?? null) : null;
  const periodEnd = new Date(extendPeriod(current, o.period));
  await deps.db
    .insert(schoolSubscriptions)
    .values({ schoolId: o.schoolId, plan: o.plan, periodEnd })
    .onConflictDoUpdate({ target: schoolSubscriptions.schoolId, set: { plan: o.plan, periodEnd, updatedAt: new Date() } });
  const admins = await deps.db
    .select({ id: schoolMembers.userId })
    .from(schoolMembers)
    .where(and(eq(schoolMembers.schoolId, o.schoolId), eq(schoolMembers.role, 'admin'), eq(schoolMembers.status, 'active')));
  await notify(
    deps,
    admins.map((a) => ({
      userId: a.id,
      type: 'plan_active',
      icon: 'building-2',
      link: `/schools/${o.schoolId}?tab=plan`,
      data: { plan: o.plan },
      pref: 'school' as const,
    })),
  );
  return true;
}

/* ───────── Private lessons ───────── */

/** A booking that was never paid within the hold time goes back on the list. */
export async function releaseStaleLessons(deps: Deps): Promise<void> {
  await deps.db
    .update(privateLessons)
    .set({ status: 'open', studentId: null, payStatus: 'none', provider: null, method: null, bookedAt: null })
    .where(
      and(
        eq(privateLessons.status, 'booked'),
        eq(privateLessons.payStatus, 'pending'),
        lt(privateLessons.bookedAt, new Date(Date.now() - LESSON_HOLD_MINUTES * 60_000)),
      ),
    );
}

/** The lesson is paid: open its private live room and tell both sides. */
export async function activateLesson(deps: Deps, lessonId: string): Promise<boolean> {
  const [l] = await deps.db
    .update(privateLessons)
    .set({ payStatus: 'paid', paidAt: new Date() })
    .where(and(eq(privateLessons.id, lessonId), eq(privateLessons.status, 'booked'), eq(privateLessons.payStatus, 'pending'), isNull(privateLessons.roomId)))
    .returning();
  if (!l || !l.studentId) return false;
  const roomId = await deps.db.transaction(async (tx) => {
    const [conv] = await tx.insert(conversations).values({ kind: 'live', title: l.title }).returning({ id: conversations.id });
    const [room] = await tx
      .insert(liveRooms)
      .values({
        title: l.title,
        scopeType: 'open',
        // The lesson id marks the room as private: only the teacher and the paying student can enter.
        scopeId: l.id,
        hostId: l.teacherId,
        scheduledAt: l.startsAt,
        settings: {},
        conversationId: conv!.id,
      })
      .returning({ id: liveRooms.id });
    await tx.update(privateLessons).set({ roomId: room!.id }).where(eq(privateLessons.id, l.id));
    return room!.id;
  });
  const names = await deps.db
    .select({ id: users.id, name: users.displayName })
    .from(users)
    .where(inArray(users.id, [l.teacherId, l.studentId]));
  const nameOf = (id: string) => names.find((n) => n.id === id)?.name ?? '';
  await notify(deps, [
    {
      userId: l.teacherId,
      actorId: l.studentId,
      type: 'lesson_booked',
      icon: 'calendar-check',
      link: `/lessons`,
      data: { name: nameOf(l.studentId), title: l.title, startAt: l.startsAt.getTime() },
      pref: 'school',
    },
    {
      userId: l.studentId,
      actorId: l.teacherId,
      type: 'lesson_confirmed',
      icon: 'calendar-check',
      link: `/live/${roomId}`,
      data: { name: nameOf(l.teacherId), title: l.title, startAt: l.startsAt.getTime() },
      pref: 'school',
    },
  ]);
  return true;
}

/** Reminds both sides about 15 minutes before a paid lesson starts (once). */
export async function sendLessonReminders(deps: Deps): Promise<number> {
  const soon = new Date(Date.now() + 15 * 60_000);
  const due = await deps.db
    .update(privateLessons)
    .set({ remindedAt: new Date() })
    .where(
      and(
        eq(privateLessons.status, 'booked'),
        eq(privateLessons.payStatus, 'paid'),
        isNull(privateLessons.remindedAt),
        isNotNull(privateLessons.roomId),
        lt(privateLessons.startsAt, soon),
        sql`${privateLessons.startsAt} > now() - interval '30 minutes'`,
      ),
    )
    .returning();
  for (const l of due)
    await notify(
      deps,
      [l.teacherId, l.studentId]
        .filter((x): x is string => !!x)
        .map((userId) => ({
          userId,
          type: 'lesson_soon',
          icon: 'alarm-clock',
          link: `/live/${l.roomId}`,
          data: { title: l.title, startAt: l.startsAt.getTime() },
          pref: 'live' as const,
        })),
    );
  return due.length;
}

export function startLessonWorkers(deps: Deps): () => void {
  const tick = () =>
    void (async () => {
      await releaseStaleLessons(deps);
      await sendLessonReminders(deps);
    })().catch((err) => deps.log.warn({ err }, 'lesson workers failed'));
  const timer = setInterval(tick, 60_000);
  return () => clearInterval(timer);
}

/** Paymob settled a transaction whose merchant reference is a private lesson or a school plan order. */
export async function settleGrowthFromPaymob(deps: Deps, ref: string, obj: Record<string, unknown>): Promise<boolean> {
  const ok = obj.success === true && obj.pending !== true && obj.is_voided !== true && obj.is_refunded !== true;
  const amount = Number(obj.amount_cents);
  const currency = String(obj.currency ?? '').toUpperCase();
  const [lesson] = await deps.db
    .select()
    .from(privateLessons)
    .where(and(eq(privateLessons.id, ref), eq(privateLessons.provider, 'paymob')));
  if (lesson) {
    if (lesson.payStatus !== 'pending') return true;
    if (ok && amount === lesson.priceCents && currency === lesson.currency) await activateLesson(deps, lesson.id);
    else if (obj.pending !== true)
      await deps.db
        .update(privateLessons)
        .set({ status: 'open', studentId: null, payStatus: 'none', provider: null, method: null, bookedAt: null })
        .where(and(eq(privateLessons.id, lesson.id), eq(privateLessons.payStatus, 'pending')));
    return true;
  }
  const [order] = await deps.db
    .select()
    .from(schoolPlanOrders)
    .where(and(eq(schoolPlanOrders.id, ref), eq(schoolPlanOrders.provider, 'paymob')));
  if (!order) return false;
  if (order.status !== 'pending') return true;
  if (ok && amount === order.amountCents && currency === 'EGP') await activatePlanOrder(deps, order.id);
  else if (obj.pending !== true)
    await deps.db
      .update(schoolPlanOrders)
      .set({ status: 'failed' })
      .where(and(eq(schoolPlanOrders.id, order.id), eq(schoolPlanOrders.status, 'pending')));
  return true;
}

/* ───────── Referrals ───────── */

const CODE_ALPHABET = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789';
const newReferralCode = () => Array.from(randomBytes(REFERRAL_CODE_LENGTH), (b) => CODE_ALPHABET[b % CODE_ALPHABET.length]).join('');

/** Everyone gets one invite code, made the first time it is needed. */
export async function ensureReferralCode(deps: Deps, userId: string): Promise<string> {
  const [u] = await deps.db.select({ code: users.referralCode }).from(users).where(eq(users.id, userId));
  if (!u) throw notFound();
  if (u.code) return u.code;
  for (let i = 0; i < 5; i++) {
    const code = newReferralCode();
    const [set] = await deps.db
      .update(users)
      .set({ referralCode: code })
      .where(and(eq(users.id, userId), isNull(users.referralCode)))
      .returning({ code: users.referralCode })
      .catch(() => []);
    if (set) return set.code!;
    const [again] = await deps.db.select({ code: users.referralCode }).from(users).where(eq(users.id, userId));
    if (again?.code) return again.code;
  }
  throw new AppError(500, 'referral_code_failed');
}

/** A new account came in with a friend's code: remember who invited them (an unknown code is ignored). */
export async function recordReferral(deps: Deps, referredId: string, code: string): Promise<void> {
  const [ref] = await deps.db.select({ id: users.id }).from(users).where(eq(users.referralCode, code.toUpperCase()));
  if (!ref || ref.id === referredId) return;
  await deps.db.insert(referrals).values({ referredId, referrerId: ref.id }).onConflictDoNothing();
}

/** The invited friend finished a first quiz: both get XP once (the inviter up to a limit). */
export async function rewardReferral(deps: Deps, referredId: string): Promise<void> {
  const [r] = await deps.db
    .update(referrals)
    .set({ rewardedAt: new Date() })
    .where(and(eq(referrals.referredId, referredId), isNull(referrals.rewardedAt)))
    .returning();
  if (!r) return;
  const [done] = await deps.db
    .select({ n: sql<number>`count(*)::int` })
    .from(referrals)
    .where(and(eq(referrals.referrerId, r.referrerId), isNotNull(referrals.rewardedAt)));
  const day = dayKey(Date.now());
  const [friend] = await deps.db.select({ name: users.displayName }).from(users).where(eq(users.id, referredId));
  await awardXp(deps.db, referredId, REFERRAL_XP, 'referral_friend', r.referrerId, day);
  if ((done?.n ?? 0) <= REFERRAL_MAX_REWARDS) {
    await awardXp(deps.db, r.referrerId, REFERRAL_XP, 'referral', referredId, day);
    await notify(deps, {
      userId: r.referrerId,
      actorId: referredId,
      type: 'referral_reward',
      icon: 'gift',
      link: '/invite',
      data: { name: friend?.name ?? '', xp: REFERRAL_XP },
      pref: 'system',
    });
  }
}
