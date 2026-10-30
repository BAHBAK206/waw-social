import { describe, expect, it } from 'vitest';
import { makeZip } from '../src/lib/zip';
import { call, newUser, rootUser, setupApp } from './helpers';

/** Reads the entries of a stored ZIP (enough to check what we wrote). */
function readZip(buf: Buffer) {
  const out: Record<string, string> = {};
  let p = 0;
  while (buf.readUInt32LE(p) === 0x04034b50) {
    const size = buf.readUInt32LE(p + 18);
    const nameLen = buf.readUInt16LE(p + 26);
    const name = buf.subarray(p + 30, p + 30 + nameLen).toString('utf8');
    out[name] = buf.subarray(p + 30 + nameLen, p + 30 + nameLen + size).toString('utf8');
    p += 30 + nameLen + size;
  }
  return out;
}

describe('zip writer', () => {
  it('stores entries with correct sizes and an end record', () => {
    const zip = makeZip([
      { name: 'a.txt', data: 'hello' },
      { name: 'عربي.csv', data: 'x,y\r\n1,2' },
    ]);
    expect(readZip(zip)).toEqual({ 'a.txt': 'hello', 'عربي.csv': 'x,y\r\n1,2' });
    expect(zip.readUInt32LE(zip.length - 22)).toBe(0x06054b50);
    expect(zip.readUInt16LE(zip.length - 22 + 10)).toBe(2);
  });
});

describe('school export', () => {
  it('gives the principal a ZIP with the school data and nobody else', async () => {
    await setupApp();
    const admin = await newUser({ accountType: 'teacher', name: 'Principal' });
    const outsider = await newUser();
    const sc = await call<{ id: string }>('POST', '/schools', { token: admin.token, body: { name: 'Export School' } });
    await call('POST', `/schools/${sc.body.id}/import`, {
      token: admin.token,
      body: { rows: [{ name: '=cmd Kid', role: 'student', gradeLevel: 'p5', section: '5A' }] },
    });
    expect((await call('GET', `/schools/${sc.body.id}/export`, { token: outsider.token })).status).toBe(404);
    const { app } = await setupApp();
    const res = await app.request(`/api/v1/schools/${sc.body.id}/export`, { headers: { authorization: `Bearer ${admin.token}` } });
    expect(res.status).toBe(200);
    expect(res.headers.get('content-type')).toBe('application/zip');
    expect(res.headers.get('content-disposition')).toMatch(/attachment; filename="qubedu-.*\.zip"/);
    const files = readZip(Buffer.from(await res.arrayBuffer()));
    expect(Object.keys(files)).toEqual(expect.arrayContaining(['README.txt', 'members.csv', 'grades.csv', 'fees.csv', 'school.json']));
    expect(files['members.csv']).toContain('Principal');
    // A name that looks like a formula is neutralised.
    expect(files['members.csv']).toContain("'=cmd Kid");
    expect(JSON.parse(files['school.json']!).name).toBe('Export School');
  });
});

describe('system health', () => {
  it('shows the checks and queues to staff only', async () => {
    await setupApp();
    const user = await newUser();
    expect((await call('GET', '/admin/health', { token: user.token })).status).toBe(403);
    const root = await rootUser();
    const res = await call<{ overall: string; checks: { name: string; status: string }[]; queues: Record<string, number> }>('GET', '/admin/health', {
      token: root.token,
    });
    expect(res.status).toBe(200);
    expect(res.body.checks.find((c) => c.name === 'database')?.status).toBe('ok');
    expect(res.body.queues).toHaveProperty('reports');
  });
});
