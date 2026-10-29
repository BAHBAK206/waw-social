import { describe, expect, it } from 'vitest';
import { applyCoupon, couponProblem, currentPlan, extendPeriod, planById, planPrice, seatsLeft, slugify, PORTFOLIO_SLUG_RE } from './growth';

const coupon = { percentOff: 20, amountOffCents: null, maxUses: 2, uses: 0, expiresAt: null, active: true };
const NOW = Date.UTC(2026, 5, 1);

describe('coupons', () => {
  it('takes a percentage, then a fixed amount, and never goes below zero', () => {
    expect(applyCoupon(50_000, { percentOff: 20, amountOffCents: null })).toEqual({ discountCents: 10_000, finalCents: 40_000 });
    expect(applyCoupon(50_000, { percentOff: null, amountOffCents: 20_000 })).toEqual({ discountCents: 20_000, finalCents: 30_000 });
    expect(applyCoupon(50_000, { percentOff: 50, amountOffCents: 40_000 })).toEqual({ discountCents: 50_000, finalCents: 0 });
    expect(applyCoupon(50_000, { percentOff: 100, amountOffCents: null }).finalCents).toBe(0);
  });
  it('says why a coupon cannot be used', () => {
    expect(couponProblem(coupon, false, NOW)).toBeNull();
    expect(couponProblem({ ...coupon, active: false }, false, NOW)).toBe('inactive');
    expect(couponProblem({ ...coupon, expiresAt: NOW - 1 }, false, NOW)).toBe('expired');
    expect(couponProblem(coupon, true, NOW)).toBe('used');
    expect(couponProblem({ ...coupon, uses: 2 }, false, NOW)).toBe('exhausted');
    expect(couponProblem({ ...coupon, maxUses: null, uses: 999 }, false, NOW)).toBeNull();
  });
});

describe('school plans', () => {
  it('lapses to free when the paid period ends and counts seats', () => {
    expect(currentPlan(null, NOW).id).toBe('free');
    expect(currentPlan({ plan: 'standard', periodEnd: NOW + 1000 }, NOW).id).toBe('standard');
    expect(currentPlan({ plan: 'standard', periodEnd: NOW - 1 }, NOW).id).toBe('free');
    expect(seatsLeft(planById('free'), 48)).toBe(2);
    expect(seatsLeft(planById('free'), 80)).toBe(0);
    expect(seatsLeft(planById('premium'), 5000)).toBeNull();
    expect(planPrice(planById('standard'), 'year')).toBeLessThan(planPrice(planById('standard'), 'month') * 12);
  });
  it('renewing early adds to the end of the current period', () => {
    const end = Date.UTC(2026, 6, 10);
    expect(new Date(extendPeriod(end, 'month', NOW)).toISOString().slice(0, 10)).toBe('2026-08-10');
    expect(new Date(extendPeriod(null, 'year', NOW)).toISOString().slice(0, 10)).toBe('2027-06-01');
  });
});

describe('portfolio addresses', () => {
  it('makes a clean address from a name', () => {
    expect(slugify('Omar Hassan')).toBe('omar-hassan');
    expect(slugify('  José  Ñuñez!! ')).toBe('jose-nunez');
    expect(slugify('عمر')).toBe('');
    expect(PORTFOLIO_SLUG_RE.test('omar-hassan')).toBe(true);
    expect(PORTFOLIO_SLUG_RE.test('-bad')).toBe(false);
    expect(PORTFOLIO_SLUG_RE.test('a')).toBe(false);
  });
});
