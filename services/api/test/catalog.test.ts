import { createHmac } from 'node:crypto';
import { createServer } from 'node:http';
import type { AddressInfo } from 'node:net';
import { describe, expect, it } from 'vitest';
import type { AssignmentDto, CatalogCourseDto, CertificateDto, CertificateVerifyDto, CourseDto, VoucherDto } from '@qubedu/shared';
import { verifyStripeSignature } from '../src/routes/catalog';
import { call, newUser, setupApp } from './helpers';

/** A tiny stand-in for api.stripe.com that records the last request body. */
function fakeStripe() {
  let body = '';
  const server = createServer((req, res) => {
    let data = '';
    req.on('data', (d: Buffer) => (data += d.toString()));
    req.on('end', () => {
      body = data;
      res.setHeader('content-type', 'application/json');
      res.end(JSON.stringify({ id: 'cs_test_1', url: 'https://checkout.stripe.test/s/cs_test_1' }));
    });
  });
  const url = new Promise<string>((resolve) => server.listen(0, '127.0.0.1', () => resolve(`http://127.0.0.1:${(server.address() as AddressInfo).port}`)));
  return { url, last: () => body, close: () => server.close() };
}

async function paidCourse() {
  const teacher = await newUser({ name: 'Mr Karim', accountType: 'teacher' });
  const c = await call<CourseDto>('POST', '/school/courses', {
    token: teacher.token,
    body: { title: `Algebra Mastery ${Date.now()}`, listed: true, priceCents: 1500, currency: 'USD' },
  });
  expect(c.body.listed).toBe(true);
  return { teacher, course: c.body };
}

describe('course catalog and paid courses', () => {
  it('lists courses publicly, enrolls in free ones, and needs payment or a voucher for paid ones', async () => {
    const { teacher, course } = await paidCourse();
    const free = await call<CourseDto>('POST', '/school/courses', { token: teacher.token, body: { title: `Free Geometry ${Date.now()}`, listed: true } });
    const student = await newUser();

    const guestList = await call<{ items: CatalogCourseDto[] }>('GET', `/catalog?q=${encodeURIComponent('Algebra Mastery')}`);
    const item = guestList.body.items.find((i) => i.id === course.id)!;
    expect(item).toMatchObject({ priceCents: 1500, currency: 'USD', enrolled: false, cardPayments: false });
    expect(JSON.stringify(item)).not.toContain(course.joinCode!);

    expect((await call('POST', `/catalog/${free.body.id}/enroll`, { token: student.token })).status).toBe(200);
    const paid = await call<{ error: { code: string } }>('POST', `/catalog/${course.id}/enroll`, { token: student.token });
    expect(paid.status).toBe(402);
    expect((await call<{ error: { code: string } }>('POST', `/catalog/${course.id}/checkout`, { token: student.token })).body.error.code).toBe(
      'card_payments_off',
    );

    // Vouchers: the teacher creates them; one student spends one, once.
    expect((await call('POST', `/school/courses/${course.id}/vouchers`, { token: student.token, body: { count: 2 } })).status).toBe(404);
    const v = await call<{ codes: string[] }>('POST', `/school/courses/${course.id}/vouchers`, { token: teacher.token, body: { count: 2 } });
    expect(v.body.codes[0]).toMatch(/^QB-[A-Z2-9]{4}-[A-Z2-9]{4}$/);
    const redeemed = await call<CourseDto>('POST', '/school/redeem', { token: student.token, body: { code: v.body.codes[0]!.toLowerCase() } });
    expect(redeemed.body.myRole).toBe('student');
    const other = await newUser();
    expect((await call('POST', '/school/redeem', { token: other.token, body: { code: v.body.codes[0] } })).status).toBe(400);
    const list = await call<{ items: VoucherDto[] }>('GET', `/school/courses/${course.id}/vouchers`, { token: teacher.token });
    expect(list.body.items.find((x) => x.code === v.body.codes[0])!.usedBy?.id).toBe(student.user.id);
    expect((await call<CatalogCourseDto>('GET', `/catalog/${course.id}`, { token: student.token })).body.enrolled).toBe(true);
  });

  it('takes card payments through Stripe Checkout and enrolls on the signed webhook only', async () => {
    const { course } = await paidCourse();
    const student = await newUser();
    const { deps, app } = await setupApp();
    const env = deps.env as { STRIPE_SECRET_KEY?: string; STRIPE_WEBHOOK_SECRET?: string; STRIPE_API_URL: string };
    // A stand-in for api.stripe.com.
    const fake = fakeStripe();
    const prev = { ...env };
    env.STRIPE_SECRET_KEY = 'sk_test_x';
    env.STRIPE_WEBHOOK_SECRET = 'whsec_test';
    env.STRIPE_API_URL = await fake.url;
    try {
      const co = await call<{ url: string }>('POST', `/catalog/${course.id}/checkout`, { token: student.token });
      expect(co.status).toBe(200);
      expect(co.body.url).toBe('https://checkout.stripe.test/s/cs_test_1');
      expect(fake.last()).toContain('line_items%5B0%5D%5Bprice_data%5D%5Bunit_amount%5D=1500');

      const event = JSON.stringify({ type: 'checkout.session.completed', data: { object: { id: 'cs_test_1', payment_status: 'paid' } } });
      const forged = await app.request('/webhooks/stripe', { method: 'POST', body: event, headers: { 'stripe-signature': 't=1,v1=bad' } });
      expect(forged.status).toBe(400);
      const t = Math.floor(Date.now() / 1000);
      const sig = createHmac('sha256', 'whsec_test').update(`${t}.${event}`).digest('hex');
      const ok = await app.request('/webhooks/stripe', { method: 'POST', body: event, headers: { 'stripe-signature': `t=${t},v1=${sig}` } });
      expect(ok.status).toBe(200);
      const mine = await call<CourseDto>('GET', `/school/courses/${course.id}`, { token: student.token });
      expect(mine.body.myRole).toBe('student');
    } finally {
      Object.assign(env, prev);
      fake.close();
    }
  });

  it('checks Stripe signatures with a time limit', () => {
    const t = 1_700_000_000;
    const sig = createHmac('sha256', 's').update(`${t}.x`).digest('hex');
    expect(verifyStripeSignature('x', `t=${t},v1=${sig}`, 's', t * 1000)).toBe(true);
    expect(verifyStripeSignature('x', `t=${t},v1=${sig}`, 's', (t + 600) * 1000)).toBe(false);
    expect(verifyStripeSignature('y', `t=${t},v1=${sig}`, 's', t * 1000)).toBe(false);
  });
});

describe('certificates', () => {
  it('a teacher issues certificates to students who passed; anyone can verify; revoking shows it', async () => {
    const { teacher, course } = await paidCourse();
    const good = await newUser({ name: 'Salma' });
    const weak = await newUser({ name: 'Omar' });
    const v = await call<{ codes: string[] }>('POST', `/school/courses/${course.id}/vouchers`, { token: teacher.token, body: { count: 2 } });
    await call('POST', '/school/redeem', { token: good.token, body: { code: v.body.codes[0] } });
    await call('POST', '/school/redeem', { token: weak.token, body: { code: v.body.codes[1] } });
    const a = await call<AssignmentDto>('POST', `/school/courses/${course.id}/assignments`, { token: teacher.token, body: { title: 'Final', points: 20 } });
    for (const [u, grade] of [
      [good, 18],
      [weak, 6],
    ] as const) {
      await call('POST', `/school/assignments/${a.body.id}/submit`, { token: u.token, body: { text: 'My final answers.' } });
      const subs = await call<{ items: { id: string; student: { id: string } }[] }>('GET', `/school/assignments/${a.body.id}/submissions`, {
        token: teacher.token,
      });
      const sub = subs.body.items.find((s) => s.student.id === u.user.id)!;
      await call('POST', `/school/submissions/${sub.id}/grade`, { token: teacher.token, body: { grade } });
    }
    const issued = await call<{ issued: number }>('POST', `/certificates/course/${course.id}`, { token: teacher.token, body: { minGrade: 60 } });
    expect(issued.body.issued).toBe(1);
    // Issuing again doesn't duplicate.
    expect((await call<{ issued: number }>('POST', `/certificates/course/${course.id}`, { token: teacher.token, body: { minGrade: 60 } })).body.issued).toBe(0);

    const mine = await call<{ items: CertificateDto[] }>('GET', '/certificates/mine', { token: good.token });
    expect(mine.body.items[0]).toMatchObject({ grade: 90, issuerName: 'Mr Karim', revoked: false });
    const check = await call<CertificateVerifyDto>('GET', `/certificates/verify/${mine.body.items[0]!.code}`);
    expect(check.body).toMatchObject({ valid: true, holderName: 'Salma', grade: 90 });
    expect((await call<{ items: CertificateDto[] }>('GET', '/certificates/mine', { token: weak.token })).body.items).toHaveLength(0);

    expect((await call('DELETE', `/certificates/${mine.body.items[0]!.id}`, { token: good.token })).status).toBe(403);
    await call('DELETE', `/certificates/${mine.body.items[0]!.id}`, { token: teacher.token });
    expect((await call<CertificateVerifyDto>('GET', `/certificates/verify/${mine.body.items[0]!.code}`)).body).toMatchObject({ valid: false, revoked: true });
  });
});
