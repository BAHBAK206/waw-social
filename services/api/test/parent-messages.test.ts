import { createServer } from 'node:http';
import type { AddressInfo } from 'node:net';
import { describe, expect, it } from 'vitest';
import type { AssignmentDto, CourseDto, PhoneSettingsDto } from '@qubedu/shared';
import { eq } from 'drizzle-orm';
import { guardianLinks } from '../src/db/schema';
import { loadEnv } from '../src/env';
import { createMessenger } from '../src/lib/messaging';
import { sendWeeklyReports } from '../src/routes/family';
import { call, newUser, setupApp } from './helpers';

describe('WhatsApp / SMS for parents', () => {
  it('confirms a parent’s number by code, then sends the weekly report and alerts for absence and low grades', async () => {
    const { deps } = await setupApp();
    const outbox = deps.messages.outbox;
    const parent = await newUser({ name: 'Mona', accountType: 'parent' });
    const student = await newUser({ name: 'Ali' });
    const teacher = await newUser({ accountType: 'teacher' });

    // Students and teachers can't register a number.
    expect((await call('POST', '/me/phone', { token: student.token, body: { phone: '01001234567' } })).status).toBe(403);
    expect((await call<{ error: { code: string } }>('POST', '/me/phone', { token: parent.token, body: { phone: '1234567' } })).body.error.code).toBe(
      'invalid_phone',
    );

    const sent = await call<PhoneSettingsDto>('POST', '/me/phone', { token: parent.token, body: { phone: '010 0123 4567', channel: 'whatsapp' } });
    expect(sent.status).toBe(200);
    expect(sent.body).toMatchObject({ verified: false, pending: '+20 100 ••• 4567' });
    const codeMsg = outbox.filter((m) => m.kind === 'code').at(-1)!;
    expect(codeMsg).toMatchObject({ to: '+201001234567', channel: 'whatsapp' });
    const code = codeMsg.params[0]!;
    expect(code).toMatch(/^\d{6}$/);
    expect(codeMsg.text).toContain(code);

    const wrong = code === '000000' ? '111111' : '000000';
    expect((await call('POST', '/me/phone/verify', { token: parent.token, body: { code: wrong } })).status).toBe(400);
    const ok = await call<PhoneSettingsDto>('POST', '/me/phone/verify', { token: parent.token, body: { code } });
    expect(ok.body).toMatchObject({ verified: true, phone: '+20 100 ••• 4567', weekly: true, alerts: true, pending: null });
    // The code can't be used twice.
    expect((await call('POST', '/me/phone/verify', { token: parent.token, body: { code } })).status).toBe(400);

    // Link the child.
    const linkCode = await call<{ code: string }>('POST', '/family/code', { token: student.token });
    await call('POST', '/family/link', { token: parent.token, body: { code: linkCode.body.code } });

    // Weekly report (a new link counts as just reported; pretend a week went by).
    await deps.db
      .update(guardianLinks)
      .set({ lastReportAt: new Date(Date.now() - 8 * 86_400_000) })
      .where(eq(guardianLinks.studentId, student.user.id));
    const before = outbox.length;
    await sendWeeklyReports(deps, 5000);
    const weekly = outbox.slice(before).find((m) => m.kind === 'weekly' && m.to === '+201001234567');
    expect(weekly?.text).toContain('Ali');
    expect(weekly?.params[0]).toBe('Ali');

    // Absence: once per new absence, even if the register is saved again.
    const course = await call<CourseDto>('POST', '/school/courses', { token: teacher.token, body: { title: 'Science 4' } });
    await call('POST', '/school/join', { token: student.token, body: { code: course.body.joinCode } });
    const day = new Date().toISOString().slice(0, 10);
    const sess = await call<{ id: string }>('POST', `/school/courses/${course.body.id}/attendance`, { token: teacher.token, body: { day, title: 'Lesson 1' } });
    const mark = () =>
      call('PUT', `/school/attendance/${sess.body.id}`, { token: teacher.token, body: { records: [{ studentId: student.user.id, status: 'absent' }] } });
    const alertsFor = () => outbox.filter((m) => m.kind === 'alert' && m.to === '+201001234567');
    await mark();
    await mark();
    expect(alertsFor().filter((m) => m.text.includes('Science 4'))).toHaveLength(1);
    const notes = await call<{ items: { type: string }[] }>('GET', '/notifications', { token: parent.token });
    expect(notes.body.items.some((n) => n.type === 'child_absent')).toBe(true);

    // Low grade: below half of the points.
    const a = await call<AssignmentDto>('POST', `/school/courses/${course.body.id}/assignments`, {
      token: teacher.token,
      body: { title: 'Plants test', points: 20 },
    });
    await call('POST', `/school/assignments/${a.body.id}/submit`, { token: student.token, body: { text: 'My answer' } });
    const subs = await call<{ items: { id: string }[] }>('GET', `/school/assignments/${a.body.id}/submissions`, { token: teacher.token });
    await call('POST', `/school/submissions/${subs.body.items[0]!.id}/grade`, { token: teacher.token, body: { grade: 6, returned: true } });
    expect(alertsFor().at(-1)?.text).toContain('6/20');

    // Turning alerts off stops them; a test message is refused then.
    await call('PATCH', '/me/phone', { token: parent.token, body: { alerts: false } });
    const count = alertsFor().length;
    await call('PUT', `/school/attendance/${sess.body.id}`, { token: teacher.token, body: { records: [{ studentId: student.user.id, status: 'present' }] } });
    await mark();
    expect(alertsFor()).toHaveLength(count);
    expect((await call('POST', '/me/phone/test', { token: parent.token })).status).toBe(400);
    await call('PATCH', '/me/phone', { token: parent.token, body: { alerts: true } });
    expect((await call('POST', '/me/phone/test', { token: parent.token })).status).toBe(200);

    // Removing the number stops everything.
    const removed = await call<PhoneSettingsDto>('DELETE', '/me/phone', { token: parent.token });
    expect(removed.body).toMatchObject({ phone: null, verified: false });
  });

  it('locks the code after too many wrong tries', async () => {
    const { deps } = await setupApp();
    const parent = await newUser({ accountType: 'parent' });
    await call('POST', '/me/phone', { token: parent.token, body: { phone: '+201112223334', channel: 'sms' } });
    const code = deps.messages.outbox.filter((m) => m.to === '+201112223334').at(-1)!.params[0]!;
    const wrong = code === '000000' ? '111111' : '000000';
    for (let i = 0; i < 5; i++) await call('POST', '/me/phone/verify', { token: parent.token, body: { code: wrong } });
    const late = await call<{ error: { code: string } }>('POST', '/me/phone/verify', { token: parent.token, body: { code } });
    expect(late.body.error.code).toBe('code_expired');
  });
});

describe('message providers', () => {
  it('sends WhatsApp templates (with the code button) and Twilio SMS in the providers’ formats', async () => {
    const seen: { path: string; auth: string; body: string }[] = [];
    const server = createServer((req, res) => {
      let data = '';
      req.on('data', (d: Buffer) => (data += d.toString()));
      req.on('end', () => {
        seen.push({ path: req.url ?? '', auth: req.headers.authorization ?? '', body: data });
        res.setHeader('content-type', 'application/json');
        res.end('{}');
      });
    });
    const base = await new Promise<string>((r) => server.listen(0, '127.0.0.1', () => r(`http://127.0.0.1:${(server.address() as AddressInfo).port}`)));
    try {
      const env = loadEnv({
        ...process.env,
        NODE_ENV: 'test',
        WHATSAPP_TOKEN: 'wa-token',
        WHATSAPP_PHONE_NUMBER_ID: '1234',
        WHATSAPP_TEMPLATE_CODE: 'qubedu_code',
        WHATSAPP_API_URL: base,
        TWILIO_ACCOUNT_SID: 'AC1',
        TWILIO_AUTH_TOKEN: 'secret',
        TWILIO_FROM: '+15550001',
        TWILIO_API_URL: base,
      });
      const m = createMessenger(env, { info: () => undefined, warn: () => undefined });
      expect(m.available).toEqual({ whatsapp: true, sms: true });
      await m.send({ to: '+201001234567', channel: 'whatsapp', kind: 'code', text: 'Your code is 123456', params: ['123456'], lang: 'ar' });
      await m.send({ to: '+201001234567', channel: 'sms', kind: 'alert', text: 'Ali was absent', params: ['Ali was absent'], lang: 'ar' });
      expect(seen[0]!.path).toBe('/1234/messages');
      expect(seen[0]!.auth).toBe('Bearer wa-token');
      expect(JSON.parse(seen[0]!.body)).toMatchObject({
        to: '201001234567',
        type: 'template',
        template: { name: 'qubedu_code', language: { code: 'ar' }, components: [{ type: 'body', parameters: [{ text: '123456' }] }, { type: 'button' }] },
      });
      expect(seen[1]!.path).toBe('/2010-04-01/Accounts/AC1/Messages.json');
      expect(seen[1]!.auth).toBe(`Basic ${Buffer.from('AC1:secret').toString('base64')}`);
      expect(new URLSearchParams(seen[1]!.body).get('Body')).toBe('Ali was absent');
      expect(m.outbox).toHaveLength(0);
    } finally {
      server.close();
    }
  });
});
