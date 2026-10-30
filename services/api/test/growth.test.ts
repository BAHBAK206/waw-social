import { createServer } from 'node:http';
import type { AddressInfo } from 'node:net';
import { eq } from 'drizzle-orm';
import { describe, expect, it } from 'vitest';
import {
  planById,
  type CatalogCourseDto,
  type CouponDto,
  type CouponPreviewDto,
  type CourseDto,
  type PlanOrderDto,
  type PortfolioDto,
  type PrivateLessonDto,
  type PublicPortfolioDto,
  type QuizAttemptDto,
  type ReferralDto,
  type SchoolImportResultDto,
  type SchoolPlanStateDto,
} from '@qubedu/shared';
import { privateLessons, schoolSubscriptions, users } from '../src/db/schema';
import { paymobHmac } from '../src/routes/catalog';
import { call, newUser, setupApp } from './helpers';

/** A stand-in for Paymob: returns a client secret and keeps the last request. */
async function withPaymob<T>(
  fn: (h: { sent: () => Record<string, unknown>; callback: (obj: Record<string, unknown>) => Promise<number> }) => Promise<T>,
): Promise<T> {
  const { deps, app } = await setupApp();
  const env = deps.env as Record<string, unknown>;
  const prev = { ...env };
  let sent: Record<string, unknown> = {};
  const server = createServer((req, res) => {
    let data = '';
    req.on('data', (d: Buffer) => (data += d.toString()));
    req.on('end', () => {
      sent = JSON.parse(data) as Record<string, unknown>;
      res.setHeader('content-type', 'application/json');
      res.end(JSON.stringify({ client_secret: 'egy_csk_test_1' }));
    });
  });
  const base = await new Promise<string>((r) => server.listen(0, '127.0.0.1', () => r(`http://127.0.0.1:${(server.address() as AddressInfo).port}`)));
  Object.assign(env, {
    PAYMOB_SECRET_KEY: 'egy_sk_test',
    PAYMOB_PUBLIC_KEY: 'egy_pk_test',
    PAYMOB_HMAC_SECRET: 'hmac_test',
    PAYMOB_CARD_INTEGRATION_ID: 111,
    PAYMOB_WALLET_INTEGRATION_ID: 222,
    PAYMOB_API_URL: base,
  });
  const callback = async (obj: Record<string, unknown>) => {
    const tx = {
      created_at: '2026-10-28T10:00:00',
      currency: 'EGP',
      error_occured: false,
      has_parent_transaction: false,
      id: 9001,
      integration_id: 111,
      is_3d_secure: true,
      is_auth: false,
      is_capture: false,
      is_refunded: false,
      is_standalone_payment: true,
      is_voided: false,
      order: { id: 555, merchant_order_id: sent.special_reference },
      owner: 77,
      pending: false,
      source_data: { pan: '2346', sub_type: 'MasterCard', type: 'card' },
      success: true,
      ...obj,
    };
    const res = await app.request(`/webhooks/paymob?hmac=${paymobHmac(tx, 'hmac_test')}`, {
      method: 'POST',
      body: JSON.stringify({ type: 'TRANSACTION', obj: tx }),
      headers: { 'content-type': 'application/json' },
    });
    return res.status;
  };
  try {
    return await fn({ sent: () => sent, callback });
  } finally {
    for (const k of Object.keys(env)) if (!(k in prev)) delete env[k];
    Object.assign(env, prev);
    server.close();
  }
}

const listedCourse = async (token: string, priceCents = 35000) =>
  (
    await call<CourseDto>('POST', '/school/courses', {
      token,
      body: { title: `Course ${Date.now()}${Math.random()}`, listed: true, priceCents, currency: 'EGP' },
    })
  ).body;

describe('course coupons', () => {
  it('discounts a Paymob checkout, counts a use once, makes a 100% coupon free, and stays inside its teacher and rules', async () => {
    await withPaymob(async ({ sent, callback }) => {
      const teacher = await newUser({ accountType: 'teacher' });
      const other = await newUser({ accountType: 'teacher' });
      const course = await listedCourse(teacher.token);
      const otherCourse = await listedCourse(other.token);
      const student = await newUser();
      const friend = await newUser();

      const made = await call<CouponDto>('POST', '/coupons', {
        token: teacher.token,
        body: { courseId: course.id, code: 'SPRING20', percentOff: 20, maxUses: 2 },
      });
      expect(made.status, JSON.stringify(made.body)).toBe(201);
      expect((await call('POST', '/coupons', { token: teacher.token, body: { code: 'SPRING20', percentOff: 10 } })).status).toBe(409);
      expect((await call('POST', '/coupons', { token: teacher.token, body: { percentOff: 10, amountOffCents: 500 } })).status).toBe(400);
      expect((await call('POST', '/coupons', { token: student.token, body: { percentOff: 10 } })).status).toBe(403);

      const prev = await call<CouponPreviewDto>('POST', `/coupons/preview/${course.id}`, { token: student.token, body: { code: 'spring20' } });
      expect(prev.body).toMatchObject({ priceCents: 35000, discountCents: 7000, finalCents: 28000 });
      // It is this teacher's coupon: another teacher's course refuses it.
      expect((await call('POST', `/coupons/preview/${otherCourse.id}`, { token: student.token, body: { code: 'SPRING20' } })).status).toBe(400);

      const co = await call<{ url: string }>('POST', `/catalog/${course.id}/checkout`, {
        token: student.token,
        body: { method: 'paymob_card', coupon: 'SPRING20' },
      });
      expect(co.status, JSON.stringify(co.body)).toBe(200);
      expect(sent()).toMatchObject({ amount: 28000 });
      expect(await callback({ amount_cents: 35000 })).toBe(200); // the full price is not what was asked
      expect((await call<CatalogCourseDto>('GET', `/catalog/${course.id}`, { token: student.token })).body.enrolled).toBe(false);
      await call('POST', `/catalog/${course.id}/checkout`, { token: student.token, body: { method: 'paymob_card', coupon: 'SPRING20' } });
      expect(await callback({ amount_cents: 28000 })).toBe(200);
      expect((await call<CatalogCourseDto>('GET', `/catalog/${course.id}`, { token: student.token })).body.enrolled).toBe(true);
      let list = await call<{ items: CouponDto[] }>('GET', '/coupons', { token: teacher.token });
      expect(list.body.items[0]).toMatchObject({ code: 'SPRING20', uses: 1 });
      // The same student cannot use it again.
      expect(
        (await call<{ error: { code: string } }>('POST', `/coupons/preview/${course.id}`, { token: student.token, body: { code: 'SPRING20' } })).body.error
          .code,
      ).toBe('coupon_used');

      // A 100% coupon enrolls straight away, with no payment.
      await call('POST', '/coupons', { token: teacher.token, body: { courseId: course.id, code: 'FREEPASS', percentOff: 100, maxUses: 1 } });
      const free = await call<{ url: string }>('POST', `/catalog/${course.id}/checkout`, {
        token: friend.token,
        body: { method: 'paymob_card', coupon: 'FREEPASS' },
      });
      expect(free.status).toBe(200);
      expect((await call<CatalogCourseDto>('GET', `/catalog/${course.id}`, { token: friend.token })).body.enrolled).toBe(true);
      list = await call<{ items: CouponDto[] }>('GET', '/coupons', { token: teacher.token });
      expect(list.body.items.find((c) => c.code === 'FREEPASS')?.uses).toBe(1);
      const late = await newUser();
      expect(
        (await call<{ error: { code: string } }>('POST', `/coupons/preview/${course.id}`, { token: late.token, body: { code: 'FREEPASS' } })).body.error.code,
      ).toBe('coupon_exhausted');

      // Switched off or expired coupons do nothing.
      const off = list.body.items.find((c) => c.code === 'SPRING20')!;
      await call('PATCH', `/coupons/${off.id}`, { token: teacher.token, body: { active: false } });
      expect(
        (await call<{ error: { code: string } }>('POST', `/coupons/preview/${course.id}`, { token: late.token, body: { code: 'SPRING20' } })).body.error.code,
      ).toBe('coupon_inactive');
      await call('POST', '/coupons', { token: teacher.token, body: { courseId: course.id, code: 'OLDONE', percentOff: 10, expiresAt: Date.now() - 1000 } });
      expect(
        (await call<{ error: { code: string } }>('POST', `/coupons/preview/${course.id}`, { token: late.token, body: { code: 'OLDONE' } })).body.error.code,
      ).toBe('coupon_expired');
    });
  });
});

describe('paid private lessons', () => {
  it('sells a slot once, opens a private room after payment and keeps it closed to everyone else', async () => {
    await withPaymob(async ({ sent, callback }) => {
      const { deps } = await setupApp();
      const teacher = await newUser({ accountType: 'teacher', name: 'Mr Tarek' });
      const student = await newUser({ name: 'Omar' });
      const rival = await newUser({ name: 'Nour' });
      const start = Date.now() + 2 * 86_400_000;
      const pub = await call<{ created: number }>('POST', '/lessons', {
        token: teacher.token,
        body: { title: 'Algebra help', start, end: start + 3 * 3_600_000, slotMinutes: 60, priceCents: 15000 },
      });
      expect(pub.status, JSON.stringify(pub.body)).toBe(201);
      expect(pub.body.created).toBe(3);
      // The same hours again are not duplicated.
      expect(
        (
          await call<{ created: number; skipped: number }>('POST', '/lessons', {
            token: teacher.token,
            body: { title: 'Algebra help', start, end: start + 3_600_000, slotMinutes: 60, priceCents: 15000 },
          })
        ).body,
      ).toMatchObject({ created: 0, skipped: 1 });
      expect(
        (await call('POST', '/lessons', { token: student.token, body: { title: 'Nope', start, end: start + 3_600_000, slotMinutes: 60, priceCents: 0 } }))
          .status,
      ).toBe(403);

      const open = await call<{ items: PrivateLessonDto[] }>('GET', `/lessons/open?teacherId=${teacher.user.id}`, { token: student.token });
      expect(open.body.items).toHaveLength(3);
      const slot = open.body.items[0]!;
      expect(slot.student).toBeNull();

      const book = await call<{ url: string }>('POST', `/lessons/${slot.id}/book`, { token: student.token, body: { method: 'paymob_card' } });
      expect(book.status, JSON.stringify(book.body)).toBe(200);
      expect(sent()).toMatchObject({ amount: 15000, special_reference: slot.id });
      // Taken: nobody else can book it while it is held.
      expect((await call('POST', `/lessons/${slot.id}/book`, { token: rival.token, body: { method: 'paymob_card' } })).status).toBe(404);
      expect((await call<{ items: PrivateLessonDto[] }>('GET', `/lessons/open?teacherId=${teacher.user.id}`, { token: rival.token })).body.items).toHaveLength(
        2,
      );
      // Not paid yet: no room.
      let mine = await call<{ items: PrivateLessonDto[] }>('GET', '/lessons/mine', { token: student.token });
      expect(mine.body.items[0]).toMatchObject({ payStatus: 'pending', roomId: null, mine: 'student' });

      expect(await callback({ amount_cents: 15000 })).toBe(200);
      mine = await call<{ items: PrivateLessonDto[] }>('GET', '/lessons/mine', { token: student.token });
      const paid = mine.body.items[0]!;
      expect(paid).toMatchObject({ payStatus: 'paid' });
      expect(paid.roomId).toBeTruthy();
      const tmine = await call<{ items: PrivateLessonDto[] }>('GET', '/lessons/mine', { token: teacher.token });
      expect(tmine.body.items[0]).toMatchObject({ roomId: paid.roomId, mine: 'teacher' });
      expect(tmine.body.items[0]!.student?.displayName).toBe('Omar');

      // Only the two of them can enter or even see the room.
      expect((await call('GET', `/live/${paid.roomId}`, { token: student.token })).status).toBe(200);
      expect((await call('GET', `/live/${paid.roomId}`, { token: teacher.token })).status).toBe(200);
      expect((await call('GET', `/live/${paid.roomId}`, { token: rival.token })).status).toBe(403);
      const rooms = await call<{ items: { id: string }[] }>('GET', '/live', { token: rival.token });
      expect(rooms.body.items.some((r) => r.id === paid.roomId)).toBe(false);
      expect((await call<{ items: { id: string }[] }>('GET', '/live', { token: student.token })).body.items.some((r) => r.id === paid.roomId)).toBe(true);

      // A paid lesson is cancelled by the teacher only.
      expect((await call('POST', `/lessons/${slot.id}/cancel`, { token: student.token })).status).toBe(403);
      expect((await call('POST', `/lessons/${slot.id}/cancel`, { token: teacher.token })).status).toBe(200);
      expect((await call<{ items: PrivateLessonDto[] }>('GET', '/lessons/mine', { token: student.token })).body.items.some((l) => l.id === slot.id)).toBe(
        false,
      );

      // An unpaid hold goes back on the list after half an hour; free lessons are confirmed at once.
      const second = open.body.items[1]!;
      await call('POST', `/lessons/${second.id}/book`, { token: rival.token, body: { method: 'paymob_card' } });
      await deps.db
        .update(privateLessons)
        .set({ bookedAt: new Date(Date.now() - 31 * 60_000) })
        .where(eq(privateLessons.id, second.id));
      expect(
        (await call<{ items: PrivateLessonDto[] }>('GET', `/lessons/open?teacherId=${teacher.user.id}`, { token: student.token })).body.items.map((l) => l.id),
      ).toContain(second.id);
      const t2 = start + 5 * 86_400_000;
      await call('POST', '/lessons', { token: teacher.token, body: { title: 'Free intro', start: t2, end: t2 + 1_800_000, slotMinutes: 30, priceCents: 0 } });
      const freeSlot = (
        await call<{ items: PrivateLessonDto[] }>('GET', `/lessons/open?teacherId=${teacher.user.id}`, { token: student.token })
      ).body.items.find((l) => l.title === 'Free intro')!;
      expect((await call('POST', `/lessons/${freeSlot.id}/book`, { token: student.token, body: {} })).status).toBe(200);
      expect(
        (await call<{ items: PrivateLessonDto[] }>('GET', '/lessons/mine', { token: student.token })).body.items.find((l) => l.id === freeSlot.id),
      ).toMatchObject({ payStatus: 'paid' });
    });
  });
});

describe('school plans', () => {
  it('limits students on the free plan, and a Paymob payment starts a paid plan', async () => {
    await withPaymob(async ({ sent, callback }) => {
      const { deps } = await setupApp();
      const admin = await newUser({ accountType: 'teacher', name: 'Principal' });
      const sc = await call<{ id: string }>('POST', '/schools', { token: admin.token, body: { name: 'Plan School' } });
      const state = await call<SchoolPlanStateDto>('GET', `/schools/${sc.body.id}/plan`, { token: admin.token });
      expect(state.body).toMatchObject({ plan: 'free', limit: 50, students: 0 });
      expect((await call('GET', `/schools/${sc.body.id}/plan`, { token: (await newUser()).token })).status).toBe(404);

      // The free plan holds only so many students: the rest of an import is skipped, not half-created.
      const free = planById('free') as { students: number | null };
      const was = free.students;
      free.students = 2;
      try {
        const rows = [1, 2, 3].map((n) => ({ name: `Kid ${n}`, role: 'student', gradeLevel: 'p5', section: '5A' }));
        const imp = await call<SchoolImportResultDto>('POST', `/schools/${sc.body.id}/import`, { token: admin.token, body: { rows } });
        expect(imp.body.created.filter((c) => c.role === 'student')).toHaveLength(2);
        expect(imp.body.skipped).toEqual([{ row: 3, name: 'Kid 3', reason: 'plan_limit' }]);
      } finally {
        free.students = was;
      }

      const order = await call<{ order: PlanOrderDto; url: string }>('POST', `/schools/${sc.body.id}/plan/orders`, {
        token: admin.token,
        body: { plan: 'standard', period: 'month', method: 'paymob_card' },
      });
      expect(order.status, JSON.stringify(order.body)).toBe(201);
      expect(sent()).toMatchObject({ amount: 50_000, currency: 'EGP', special_reference: order.body.order.id });
      expect(await callback({ amount_cents: 500 })).toBe(200);
      expect((await call<SchoolPlanStateDto>('GET', `/schools/${sc.body.id}/plan`, { token: admin.token })).body.plan).toBe('free');
      await call('POST', `/schools/${sc.body.id}/plan/orders`, { token: admin.token, body: { plan: 'standard', period: 'month', method: 'paymob_card' } });
      expect(await callback({ amount_cents: 50_000 })).toBe(200);
      const after = await call<SchoolPlanStateDto>('GET', `/schools/${sc.body.id}/plan`, { token: admin.token });
      expect(after.body).toMatchObject({ plan: 'standard', limit: 300 });
      expect(after.body.periodEnd!).toBeGreaterThan(Date.now() + 27 * 86_400_000);
      // When the period ends the school is back on the free plan.
      await deps.db
        .update(schoolSubscriptions)
        .set({ periodEnd: new Date(Date.now() - 1000) })
        .where(eq(schoolSubscriptions.schoolId, sc.body.id));
      expect((await call<SchoolPlanStateDto>('GET', `/schools/${sc.body.id}/plan`, { token: admin.token })).body.plan).toBe('free');
      // Transfers need the platform's details to be set.
      expect(
        (
          await call('POST', `/schools/${sc.body.id}/plan/orders`, {
            token: admin.token,
            body: { plan: 'premium', period: 'year', method: 'transfer', reference: 'TX12345' },
          })
        ).status,
      ).toBe(400);
    });
  });
});

describe('student portfolio', () => {
  it('is private until switched on, hides young students and shows only what the student allows', async () => {
    const adult = await newUser({ name: 'Salma Adel' });
    const mine = await call<PortfolioDto>('GET', '/portfolio/mine', { token: adult.token });
    expect(mine.body).toMatchObject({ enabled: false, blocked: null });
    expect(mine.body.slug).toMatch(/^salma-adel/);
    expect((await call('GET', `/portfolio/public/${mine.body.slug}`)).status).toBe(404);
    await call('PUT', '/portfolio/mine', { token: adult.token, body: { enabled: true, headline: 'Future engineer', bio: 'I love maths.' } });
    await call('POST', '/portfolio/items', {
      token: adult.token,
      body: { kind: 'project', title: 'Robot arm', description: 'Built with Arduino', url: 'https://example.com/robot' },
    });
    const pub = await call<PublicPortfolioDto>('GET', `/portfolio/public/${mine.body.slug}`);
    expect(pub.status).toBe(200);
    expect(pub.body).toMatchObject({ name: 'Salma Adel', headline: 'Future engineer' });
    expect(pub.body.items.map((i) => i.title)).toEqual(['Robot arm']);
    expect(pub.body.stats).not.toBeNull();
    await call('PUT', '/portfolio/mine', { token: adult.token, body: { showStats: false } });
    expect((await call<PublicPortfolioDto>('GET', `/portfolio/public/${mine.body.slug}`)).body.stats).toBeNull();
    // Addresses are unique.
    const other = await newUser();
    await call('GET', '/portfolio/mine', { token: other.token });
    expect((await call('PUT', '/portfolio/mine', { token: other.token, body: { slug: mine.body.slug } })).status).toBe(409);
    // Switched off again, it disappears.
    await call('PUT', '/portfolio/mine', { token: adult.token, body: { enabled: false } });
    expect((await call('GET', `/portfolio/public/${mine.body.slug}`)).status).toBe(404);

    // A student under 18 needs a linked parent first, and the public page shows a first name only.
    const kid = await call<{ accessToken: string; user: { id: string } }>('POST', '/auth/register', {
      body: {
        email: `teen${Date.now()}@qubedu.test`,
        password: 'Password#123',
        displayName: 'Karim Hassan',
        gradeLevel: 's2',
        birthYear: new Date().getFullYear() - 16,
      },
      headers: { 'x-client': 'mobile' },
    });
    const kidToken = kid.body.accessToken;
    const kp = await call<PortfolioDto>('GET', '/portfolio/mine', { token: kidToken });
    expect(kp.body.blocked).toBe('needs_guardian');
    expect((await call('PUT', '/portfolio/mine', { token: kidToken, body: { enabled: true } })).status).toBe(403);
    const parent = await newUser({ accountType: 'parent' });
    const code = await call<{ code: string }>('POST', '/family/code', { token: kidToken });
    await call('POST', '/family/link', { token: parent.token, body: { code: code.body.code } });
    expect((await call('PUT', '/portfolio/mine', { token: kidToken, body: { enabled: true } })).status).toBe(200);
    const kpub = await call<PublicPortfolioDto>('GET', `/portfolio/public/${kp.body.slug}`);
    expect(kpub.body.name).toBe('Karim');
    expect(kpub.body.avatarUrl).toBeNull();
  });
});

describe('referrals', () => {
  it('rewards both friends once, when the invited friend finishes a first quiz', async () => {
    const { deps } = await setupApp();
    const inviter = await newUser({ name: 'Inviter' });
    const ref = await call<ReferralDto>('GET', '/referrals/mine', { token: inviter.token });
    expect(ref.body.code).toMatch(/^[A-Z0-9]{8}$/);
    expect((await call<ReferralDto>('GET', '/referrals/mine', { token: inviter.token })).body.code).toBe(ref.body.code);

    const reg = (code?: string) =>
      call<{ accessToken: string; user: { id: string } }>('POST', '/auth/register', {
        body: {
          email: `friend${Date.now()}${Math.random().toString(36).slice(2, 6)}@qubedu.test`,
          password: 'Password#123',
          displayName: 'Friend',
          ...(code ? { referralCode: code } : {}),
        },
        headers: { 'x-client': 'mobile' },
      });
    // An unknown code never blocks a sign-up.
    expect((await reg('ZZZZZZZZ')).status).toBe(201);
    const friend = (await reg(ref.body.code)).body;
    expect((await call<ReferralDto>('GET', '/referrals/mine', { token: inviter.token })).body).toMatchObject({ invited: 1, rewarded: 0, xpEarned: 0 });

    const teacher = await newUser({ accountType: 'teacher' });
    const quiz = await call<{ id: string }>('POST', '/quizzes', {
      token: teacher.token,
      body: { title: 'Warm up', published: true, questions: [{ type: 'mc', prompt: '2+2?', options: ['3', '4'], answer: 1, points: 1 }] },
    });
    const att = await call<QuizAttemptDto>('POST', `/quizzes/${quiz.body.id}/attempts`, { token: friend.accessToken, body: {} });
    await call('POST', `/quizzes/attempts/${att.body.attemptId}/submit`, { token: friend.accessToken, body: { answers: [1] } });
    const after = await call<ReferralDto>('GET', '/referrals/mine', { token: inviter.token });
    expect(after.body).toMatchObject({ invited: 1, rewarded: 1, xpEarned: 100 });
    const xp = async (id: string) => (await deps.db.select({ xp: users.xp }).from(users).where(eq(users.id, id)))[0]!.xp;
    expect(await xp(friend.user.id)).toBeGreaterThanOrEqual(100);
    // A second quiz does not pay again.
    const before = await xp(inviter.user.id);
    const att2 = await call<QuizAttemptDto>('POST', `/quizzes/${quiz.body.id}/attempts`, { token: friend.accessToken, body: {} });
    await call('POST', `/quizzes/attempts/${att2.body.attemptId}/submit`, { token: friend.accessToken, body: { answers: [1] } });
    expect(await xp(inviter.user.id)).toBe(before);
  });
});
