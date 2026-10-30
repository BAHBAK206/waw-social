import { createHmac } from 'node:crypto';
import { createServer } from 'node:http';
import type { AddressInfo } from 'node:net';
import { describe, expect, it } from 'vitest';
import type {
  AssignmentDto,
  CatalogCourseDto,
  CertificateDto,
  CertificateVerifyDto,
  CourseDto,
  TransferDto,
  UploadResultDto,
  VoucherDto,
} from '@qubedu/shared';
import { paymobHmac, verifyStripeSignature } from '../src/routes/catalog';
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
      for (const k of Object.keys(env)) if (!(k in prev)) delete (env as Record<string, unknown>)[k];
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

const PNG = Buffer.from('iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mNk+M9QDwADhgGAWjR9awAAAABJRU5ErkJggg==', 'base64');

describe('local payments (Egypt)', () => {
  it('takes InstaPay / wallet transfers with a private receipt that only the teacher approves or refuses', async () => {
    const teacher = await newUser({ name: 'Ms Hoda', accountType: 'teacher' });
    const c = await call<CourseDto>('POST', '/school/courses', {
      token: teacher.token,
      body: { title: `Physics ${Date.now()}`, listed: true, priceCents: 20000, currency: 'EGP' },
    });
    const course = c.body;
    const student = await newUser({ name: 'Youssef' });
    const form = new FormData();
    form.set('file', new Blob([PNG], { type: 'image/png' }), 'receipt.png');
    form.set('purpose', 'receipt');
    const up = await call<UploadResultDto>('POST', '/uploads', { token: student.token, form });
    expect(up.status).toBe(201);
    expect(up.body.url).toContain('/files/private/');
    const receipt = { url: up.body.url, name: 'receipt.png', mime: up.body.mime, size: up.body.size, kind: 'image' as const };
    const send = (token: string, method = 'instapay') =>
      call<{ error?: { code: string } }>('POST', `/catalog/${course.id}/transfer`, { token, body: { method, reference: 'TX-778812', receipt } });

    // No details yet: transfers are off.
    expect((await send(student.token)).body.error?.code).toBe('transfer_method_off');
    const upd = await call<CourseDto>('PATCH', `/school/courses/${course.id}`, {
      token: teacher.token,
      body: { transferInfo: { instapay: 'hoda@instapay', wallet: '', bank: null, note: 'Write your name in the note' } },
    });
    expect(upd.body.transferInfo).toEqual({ instapay: 'hoda@instapay', wallet: null, bank: null, note: 'Write your name in the note' });
    const shown = await call<CatalogCourseDto>('GET', `/catalog/${course.id}`, { token: student.token });
    expect(shown.body.transferInfo?.instapay).toBe('hoda@instapay');
    expect(shown.body.paymentMethods).toEqual([]);
    expect((await send(student.token, 'wallet')).body.error?.code).toBe('transfer_method_off');

    // Someone else can't pass off this student's receipt as their own.
    const other = await newUser();
    expect((await send(other.token)).status).toBe(400);

    expect((await send(student.token)).status).toBe(201);
    expect((await send(student.token)).body.error?.code).toBe('transfer_pending');
    expect((await call<CatalogCourseDto>('GET', `/catalog/${course.id}`, { token: student.token })).body.myTransfer?.status).toBe('pending');

    // The teacher sees it with a fresh link to the receipt; students can't list or review.
    expect((await call('GET', `/school/courses/${course.id}/transfers`, { token: student.token })).status).toBe(404);
    const list = await call<{ items: TransferDto[] }>('GET', `/school/courses/${course.id}/transfers`, { token: teacher.token });
    const t = list.body.items[0]!;
    expect(t).toMatchObject({ method: 'instapay', reference: 'TX-778812', amountCents: 20000, currency: 'EGP', status: 'pending' });
    expect(t.user.id).toBe(student.user.id);
    expect(t.receipt?.url).toContain('/files/private/');
    expect(t.receipt?.url).toMatch(/[?&](sig|signature|exp|token)=/);
    expect((await call('POST', `/school/transfers/${t.id}/review`, { token: student.token, body: { approve: true } })).status).toBe(404);

    // Refused with a reason, then sent again and approved: enrolled once, and the decision can't be flipped.
    expect((await call('POST', `/school/transfers/${t.id}/review`, { token: teacher.token, body: { approve: false } })).status).toBe(400);
    await call('POST', `/school/transfers/${t.id}/review`, { token: teacher.token, body: { approve: false, reason: 'Amount is 150, not 200' } });
    const refused = await call<CatalogCourseDto>('GET', `/catalog/${course.id}`, { token: student.token });
    expect(refused.body.myTransfer).toMatchObject({ status: 'rejected', reason: 'Amount is 150, not 200' });
    expect((await send(student.token)).status).toBe(201);
    const again = await call<{ items: TransferDto[] }>('GET', `/school/courses/${course.id}/transfers`, { token: teacher.token });
    const second = again.body.items.find((x) => x.status === 'pending')!;
    const ok = await call<TransferDto>('POST', `/school/transfers/${second.id}/review`, { token: teacher.token, body: { approve: true } });
    expect(ok.body.status).toBe('approved');
    expect((await call('POST', `/school/transfers/${second.id}/review`, { token: teacher.token, body: { approve: false, reason: 'x' } })).status).toBe(409);
    expect((await call<CourseDto>('GET', `/school/courses/${course.id}`, { token: student.token })).body.myRole).toBe('student');
    const after = await call<CatalogCourseDto>('GET', `/catalog/${course.id}`, { token: student.token });
    expect(after.body).toMatchObject({ enrolled: true, myTransfer: null });
    expect((await send(student.token)).body.error?.code).toBe('already_enrolled');
  });

  it('pays EGP courses through Paymob and enrolls only on a callback with a valid HMAC and the right amount', async () => {
    const teacher = await newUser({ accountType: 'teacher' });
    const course = (
      await call<CourseDto>('POST', '/school/courses', {
        token: teacher.token,
        body: { title: `Chemistry ${Date.now()}`, listed: true, priceCents: 35000, currency: 'EGP' },
      })
    ).body;
    const student = await newUser();
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
    try {
      const shown = await call<CatalogCourseDto>('GET', `/catalog/${course.id}`, { token: student.token });
      expect(shown.body.paymentMethods).toEqual(['paymob_card', 'paymob_wallet']);
      expect(
        (await call<{ error: { code: string } }>('POST', `/catalog/${course.id}/checkout`, { token: student.token, body: { method: 'paymob_wallet' } })).body
          .error.code,
      ).toBe('phone_required');
      const co = await call<{ url: string }>('POST', `/catalog/${course.id}/checkout`, { token: student.token, body: { method: 'paymob_card' } });
      expect(co.status).toBe(200);
      expect(co.body.url).toBe(`${base}/unifiedcheckout/?publicKey=egy_pk_test&clientSecret=egy_csk_test_1`);
      expect(sent).toMatchObject({ amount: 35000, currency: 'EGP', payment_methods: [111] });
      const pid = sent.special_reference as string;

      const tx = (over: Record<string, unknown> = {}) => ({
        amount_cents: 35000,
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
        order: { id: 555, merchant_order_id: pid },
        owner: 77,
        pending: false,
        source_data: { pan: '2346', sub_type: 'MasterCard', type: 'card' },
        success: true,
        ...over,
      });
      const post = (obj: Record<string, unknown>, hmac: string) =>
        app.request(`/webhooks/paymob?hmac=${hmac}`, {
          method: 'POST',
          body: JSON.stringify({ type: 'TRANSACTION', obj }),
          headers: { 'content-type': 'application/json' },
        });
      const enrolled = async () => (await call<CatalogCourseDto>('GET', `/catalog/${course.id}`, { token: student.token })).body.enrolled;

      expect((await post(tx(), 'bad')).status).toBe(400);
      // A correctly signed callback for less money doesn't enroll (and closes that payment).
      const cheap = tx({ amount_cents: 100 });
      expect((await post(cheap, paymobHmac(cheap, 'hmac_test'))).status).toBe(200);
      expect(await enrolled()).toBe(false);

      const co2 = await call<{ url: string }>('POST', `/catalog/${course.id}/checkout`, { token: student.token, body: { method: 'paymob_card' } });
      expect(co2.status).toBe(200);
      const good = tx({ order: { id: 556, merchant_order_id: sent.special_reference } });
      expect((await post(good, paymobHmac(good, 'hmac_test'))).status).toBe(200);
      expect(await enrolled()).toBe(true);
    } finally {
      for (const k of Object.keys(env)) if (!(k in prev)) delete env[k];
      Object.assign(env, prev);
      server.close();
    }
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
