/** Coupons, school plans, referral rewards and public portfolio helpers (pure rules, shared by the API and the apps). */

export interface CouponTerms {
  percentOff: number | null;
  amountOffCents: number | null;
  maxUses: number | null;
  uses: number;
  expiresAt: number | null;
  active: boolean;
}

export type CouponProblem = 'inactive' | 'expired' | 'exhausted' | 'used';

/** Why a coupon cannot be used right now (null when it can). `usedByMe` means this student already used it. */
export function couponProblem(c: CouponTerms, usedByMe: boolean, now = Date.now()): CouponProblem | null {
  if (!c.active) return 'inactive';
  if (c.expiresAt !== null && c.expiresAt <= now) return 'expired';
  if (usedByMe) return 'used';
  if (c.maxUses !== null && c.uses >= c.maxUses) return 'exhausted';
  return null;
}

/** The price after a coupon: percent first, then a fixed amount; never below zero. */
export function applyCoupon(priceCents: number, c: Pick<CouponTerms, 'percentOff' | 'amountOffCents'>): { discountCents: number; finalCents: number } {
  const byPercent = c.percentOff ? Math.round((priceCents * c.percentOff) / 100) : 0;
  const off = Math.min(priceCents, byPercent + (c.amountOffCents ?? 0));
  return { discountCents: off, finalCents: priceCents - off };
}

export const SCHOOL_PLAN_IDS = ['free', 'standard', 'premium'] as const;
export type SchoolPlanId = (typeof SCHOOL_PLAN_IDS)[number];

export interface SchoolPlan {
  id: SchoolPlanId;
  /** Active and invited students the plan allows; null = unlimited. */
  students: number | null;
  /** Price per month in EGP piasters. */
  monthlyCents: number;
  /** Paying for a full year is two months cheaper. */
  yearlyCents: number;
}

export const SCHOOL_PLANS: readonly SchoolPlan[] = [
  { id: 'free', students: 50, monthlyCents: 0, yearlyCents: 0 },
  { id: 'standard', students: 300, monthlyCents: 50_000, yearlyCents: 500_000 },
  { id: 'premium', students: null, monthlyCents: 120_000, yearlyCents: 1_200_000 },
];
export const PLAN_PERIODS = ['month', 'year'] as const;
export type PlanPeriod = (typeof PLAN_PERIODS)[number];

export const planById = (id: string): SchoolPlan => SCHOOL_PLANS.find((p) => p.id === id) ?? SCHOOL_PLANS[0]!;
export const planPrice = (plan: SchoolPlan, period: PlanPeriod): number => (period === 'year' ? plan.yearlyCents : plan.monthlyCents);

/** The plan a school is on today: a paid plan lapses back to free after its period ends. */
export function currentPlan(sub: { plan: string; periodEnd: number | null } | null, now = Date.now()): SchoolPlan {
  if (!sub || sub.plan === 'free') return planById('free');
  return sub.periodEnd !== null && sub.periodEnd > now ? planById(sub.plan) : planById('free');
}

/** Students that can still be added (null = unlimited). */
export const seatsLeft = (plan: SchoolPlan, students: number): number | null => (plan.students === null ? null : Math.max(0, plan.students - students));

/** A period added to the end of the current one (renewing early never loses time). */
export function extendPeriod(currentEnd: number | null, period: PlanPeriod, now = Date.now()): number {
  const base = currentEnd !== null && currentEnd > now ? currentEnd : now;
  const d = new Date(base);
  d.setUTCMonth(d.getUTCMonth() + (period === 'year' ? 12 : 1));
  return d.getTime();
}

export const REFERRAL_XP = 100;
/** A referrer is rewarded for this many friends at most. */
export const REFERRAL_MAX_REWARDS = 20;
export const REFERRAL_CODE_LENGTH = 8;

/** A booked private lesson is held for this long while the student pays. */
export const LESSON_HOLD_MINUTES = 30;
export const LESSON_LENGTHS = [30, 45, 60, 90] as const;

export const PORTFOLIO_SLUG_RE = /^[a-z0-9](?:[a-z0-9-]{1,38})[a-z0-9]$/;

/** A web address friendly name: lowercase letters and digits, dashes between words ('' when nothing usable is left). */
export function slugify(name: string): string {
  return name
    .normalize('NFKD')
    .replace(/[\u0300-\u036f]/g, '')
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '')
    .slice(0, 30)
    .replace(/-+$/, '');
}
