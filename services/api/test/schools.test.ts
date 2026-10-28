import { describe, expect, it } from 'vitest';
import type { FamilyDto, SchoolClassDto, SchoolDto, SchoolImportResultDto, SchoolMemberDto, SchoolReportCardsDto } from '@qubedu/shared';
import { call, newUser } from './helpers';

const login = async (email: string, password: string) =>
  call<{ accessToken: string }>('POST', '/auth/login', { body: { email, password }, headers: { 'x-client': 'mobile' } });

describe('schools', () => {
  it('imports people, creates class sections, and prints official report cards', async () => {
    const admin = await newUser({ name: 'Principal Amal', accountType: 'teacher' });
    const unverified = await newUser({ accountType: 'teacher', verified: false });
    expect((await call('POST', '/schools', { token: unverified.token, body: { name: 'Nope School' } })).status).toBe(403);
    const created = await call<SchoolDto>('POST', '/schools', {
      token: admin.token,
      body: { name: 'Al Nour School', system: 'eg', principal: 'Amal Hassan' },
    });
    expect(created.status).toBe(201);
    const school = created.body;
    expect(school).toMatchObject({ myRole: 'admin', myStatus: 'active' });

    // Someone with an account already: invited, not taken over.
    const existingStudent = await newUser({ name: 'Existing Kid' });
    const existingTeacher = await newUser({ name: 'Mr Samir', accountType: 'teacher' });
    const parentEmail = `parent${Date.now()}@example.com`;
    const imp = await call<SchoolImportResultDto>('POST', `/schools/${school.id}/import`, {
      token: admin.token,
      body: {
        rows: [
          { name: 'Ali Hassan', role: 'student', gradeLevel: 'p5', section: '5A', studentNumber: '1001', parentEmail, parentName: 'Mona Hassan' },
          { name: 'Sara Adel', role: 'student', gradeLevel: 'p5', section: '5A', studentNumber: '1002' },
          { name: 'Existing Kid', email: existingStudent.email, role: 'student', section: '5A', parentEmail: 'evil@example.com' },
          { name: 'Mr Samir', email: existingTeacher.email, role: 'teacher' },
          { name: 'New Teacher', email: `newteacher${Date.now()}@example.com`, role: 'teacher' },
          { name: 'No Email Parent', role: 'parent' },
        ],
      },
    });
    expect(imp.status, JSON.stringify(imp.body)).toBe(200);
    expect(imp.body.invited).toBe(2);
    expect(imp.body.parents).toBe(1);
    expect(imp.body.skipped).toEqual([{ row: 6, name: 'No Email Parent', reason: 'email_required' }]);
    const ali = imp.body.created.find((x) => x.name === 'Ali Hassan')!;
    expect(ali.login).toMatch(/^ali\.hassan\.\d{4}@[a-z0-9]{6}\.school\.invalid$/);
    expect(ali.password).toHaveLength(10);
    const mona = imp.body.created.find((x) => x.role === 'parent')!;
    expect(mona.login).toBe(parentEmail);
    const newTeacher = imp.body.created.find((x) => x.name === 'New Teacher')!;

    // The new accounts work; the parent is linked to the new child only.
    const aliToken = (await login(ali.login, ali.password)).body.accessToken;
    expect(aliToken).toBeTruthy();
    const monaToken = (await login(mona.login, mona.password)).body.accessToken;
    const fam = await call<FamilyDto>('GET', '/family', { token: monaToken });
    expect(fam.body.children.map((c) => c.displayName)).toEqual(['Ali Hassan']);
    // The existing student isn't a member until they accept, and nobody was linked to them.
    const existingFamily = await call<FamilyDto>('GET', '/family', { token: existingStudent.token });
    expect(existingFamily.body.guardians).toHaveLength(0);
    const mine = await call<{ items: SchoolDto[] }>('GET', '/schools', { token: existingStudent.token });
    expect(mine.body.items[0]).toMatchObject({ name: 'Al Nour School', myStatus: 'invited' });
    expect((await call('GET', `/schools/${school.id}/report-cards?studentId=${existingStudent.user.id}`, { token: existingStudent.token })).status).toBe(404);
    await call('POST', `/schools/${school.id}/accept`, { token: existingStudent.token });
    await call('POST', `/schools/${school.id}/accept`, { token: existingTeacher.token });

    // Members: admin sees emails, a teacher sees students without emails, a student sees nothing.
    const members = await call<{ items: SchoolMemberDto[] }>('GET', `/schools/${school.id}/members?section=5A`, { token: admin.token });
    expect(members.body.items.map((m) => m.user.displayName).sort()).toEqual(['Ali Hassan', 'Existing Kid', 'Sara Adel']);
    expect(members.body.items[0]!.user.email).toBeTruthy();
    const asTeacher = await call<{ items: SchoolMemberDto[] }>('GET', `/schools/${school.id}/members?role=student`, { token: existingTeacher.token });
    expect(asTeacher.body.items.every((m) => m.user.email === undefined)).toBe(true);
    expect((await call('GET', `/schools/${school.id}/members`, { token: aliToken })).status).toBe(403);
    expect(
      (await call('POST', `/schools/${school.id}/import`, { token: existingTeacher.token, body: { rows: [{ name: 'X Y', role: 'student' }] } })).status,
    ).toBe(403);

    // A class for section 5A: every 5A student is enrolled; a later student joins it too.
    const cls = await call<{ id: string }>('POST', `/schools/${school.id}/classes`, {
      token: admin.token,
      body: { section: '5A', title: 'Mathematics', subjectCode: 'MATH-5', teacherId: existingTeacher.user.id, maxMarks: 60, passMarks: 30, term: 'Term 1' },
    });
    expect(cls.status).toBe(201);
    const outsider = await newUser({ accountType: 'teacher' });
    expect(
      (await call('POST', `/schools/${school.id}/classes`, { token: admin.token, body: { section: '5A', title: 'Science', teacherId: outsider.user.id } }))
        .status,
    ).toBe(400);
    const list = await call<{ items: SchoolClassDto[] }>('GET', `/schools/${school.id}/classes`, { token: admin.token });
    expect(list.body.items[0]).toMatchObject({ title: 'Mathematics', section: '5A', memberCount: 4 });
    const late = await call<SchoolImportResultDto>('POST', `/schools/${school.id}/import`, {
      token: admin.token,
      body: { rows: [{ name: 'Late Student', role: 'student', section: '5A' }] },
    });
    const lateToken = (await login(late.body.created[0]!.login, late.body.created[0]!.password)).body.accessToken;
    expect((await call<{ myRole: string }>('GET', `/school/courses/${cls.body.id}`, { token: lateToken })).body.myRole).toBe('student');

    // Marks, then the official report cards for the section and for one student (by the parent).
    await call('PUT', `/school/courses/${cls.body.id}/components`, {
      token: existingTeacher.token,
      body: { components: [{ name: 'Final', maxMarks: 60, source: 'manual' }] },
    });
    const comps = await call<{ items: { id: string }[] }>('GET', `/school/courses/${cls.body.id}/components`, { token: existingTeacher.token });
    const aliId = members.body.items.find((m) => m.user.displayName === 'Ali Hassan')!.user.id;
    await call('PUT', `/school/courses/${cls.body.id}/marks`, {
      token: existingTeacher.token,
      body: { marks: [{ componentId: comps.body.items[0]!.id, studentId: aliId, marks: 51 }] },
    });
    const cards = await call<SchoolReportCardsDto>('GET', `/schools/${school.id}/report-cards?section=5A`, { token: admin.token });
    expect(cards.status).toBe(200);
    expect(cards.body.school.principal).toBe('Amal Hassan');
    const aliCard = cards.body.cards.find((x) => x.student.id === aliId)!;
    expect(aliCard).toMatchObject({ section: '5A', studentNumber: '1001', gradeLevel: 'p5' });
    expect(aliCard.subjects[0]).toMatchObject({ title: 'Mathematics' });
    expect(aliCard.overall.percent).toBe(85);
    const byParent = await call<SchoolReportCardsDto>('GET', `/schools/${school.id}/report-cards?studentId=${aliId}`, { token: monaToken });
    expect(byParent.body.cards).toHaveLength(1);
    const stranger = await newUser({ accountType: 'parent' });
    expect((await call('GET', `/schools/${school.id}/report-cards?studentId=${aliId}`, { token: stranger.token })).status).toBe(404);

    // Password reset only for accounts the school created.
    const reset = await call<{ login: string; password: string }>('POST', `/schools/${school.id}/members/${aliId}/password`, { token: admin.token });
    expect((await login(reset.body.login, reset.body.password)).status).toBe(200);
    expect((await login(ali.login, ali.password)).status).toBe(401);
    expect((await call('POST', `/schools/${school.id}/members/${existingStudent.user.id}/password`, { token: admin.token })).status).toBe(403);
    expect(newTeacher.login).toContain('@example.com');

    // The last admin can't leave.
    expect((await call('DELETE', `/schools/${school.id}/membership`, { token: admin.token })).status).toBe(400);
  });
});
