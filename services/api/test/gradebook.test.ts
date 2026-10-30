import type { CourseDto, CourseGradebookDto, GradeComponentDto, ReportCardDto } from '@qubedu/shared';
import { describe, expect, it } from 'vitest';
import { call, newUser } from './helpers';

describe('subject gradebook', () => {
  it('totals a subject out of 60 from homework, attendance and a paper exam, and builds the report card', async () => {
    const teacher = await newUser({ accountType: 'teacher', name: 'Mr Adel' });
    const s1 = await newUser({ name: 'Amal' });
    const s2 = await newUser({ name: 'Bassem' });
    const course = await call<CourseDto>('POST', '/school/courses', { token: teacher.token, body: { title: 'Mathematics', subject: 'Math' } });
    const id = course.body.id;
    for (const s of [s1, s2]) await call('POST', '/school/join', { token: s.token, body: { code: course.body.joinCode } });

    // Settings: code, out of 60, pass 30. A pass mark above the total is refused.
    expect((await call('PATCH', `/school/courses/${id}`, { token: teacher.token, body: { passMarks: 70, maxMarks: 60 } })).status).toBe(400);
    const set = await call<CourseDto>('PATCH', `/school/courses/${id}`, {
      token: teacher.token,
      body: { subjectCode: 'MATH-3', maxMarks: 60, passMarks: 30, term: 'Term 1' },
    });
    expect(set.body.grading).toEqual({ subjectCode: 'MATH-3', maxMarks: 60, passMarks: 30, countsInTotal: true, term: 'Term 1' });

    // Components must fit in the total.
    expect(
      (
        await call('PUT', `/school/courses/${id}/components`, {
          token: teacher.token,
          body: { components: [{ name: 'Final', maxMarks: 61, source: 'manual' }] },
        })
      ).status,
    ).toBe(400);
    const comps = await call<{ items: GradeComponentDto[] }>('PUT', `/school/courses/${id}/components`, {
      token: teacher.token,
      body: {
        components: [
          { name: 'Homework', maxMarks: 20, source: 'assignments' },
          { name: 'Attendance', maxMarks: 10, source: 'attendance' },
          { name: 'Final exam', maxMarks: 30, source: 'manual' },
        ],
      },
    });
    const [hw, att, fin] = comps.body.items;
    expect(comps.body.items.map((x) => x.name)).toEqual(['Homework', 'Attendance', 'Final exam']);
    // Students can't change components.
    expect((await call('PUT', `/school/courses/${id}/components`, { token: s1.token, body: { components: [] } })).status).toBe(403);

    // Homework out of 10 points → scaled to 20 marks.
    const a = await call<{ id: string }>('POST', `/school/courses/${id}/assignments`, {
      token: teacher.token,
      body: { title: 'Fractions', points: 10, componentId: hw!.id },
    });
    await call('POST', `/school/assignments/${a.body.id}/submit`, { token: s1.token, body: { text: 'done' } });
    const subs = await call<{ items: { id: string; student: { id: string } }[] }>('GET', `/school/assignments/${a.body.id}/submissions`, {
      token: teacher.token,
    });
    const sub = subs.body.items.find((x) => x.student.id === s1.user.id)!;
    await call('POST', `/school/submissions/${sub.id}/grade`, { token: teacher.token, body: { grade: 9, returned: true } });

    // Attendance: 1 of 2 classes.
    const day = new Date().toISOString().slice(0, 10);
    for (const status of ['present', 'absent']) {
      const sess = await call<{ id: string }>('POST', `/school/courses/${id}/attendance`, { token: teacher.token, body: { day, title: status } });
      await call('PUT', `/school/attendance/${sess.body.id}`, { token: teacher.token, body: { records: [{ studentId: s1.user.id, status }] } });
    }

    // Paper exam marks; above the component max is refused; only students of the class.
    expect(
      (
        await call('PUT', `/school/courses/${id}/marks`, {
          token: teacher.token,
          body: { marks: [{ componentId: fin!.id, studentId: s1.user.id, marks: 31 }] },
        })
      ).status,
    ).toBe(400);
    expect(
      (
        await call('PUT', `/school/courses/${id}/marks`, {
          token: teacher.token,
          body: { marks: [{ componentId: fin!.id, studentId: teacher.user.id, marks: 3 }] },
        })
      ).status,
    ).toBe(400);
    await call('PUT', `/school/courses/${id}/marks`, {
      token: teacher.token,
      body: {
        marks: [
          { componentId: fin!.id, studentId: s1.user.id, marks: 27 },
          { componentId: fin!.id, studentId: s2.user.id, marks: 10 },
        ],
      },
    });

    const gb = await call<CourseGradebookDto>('GET', `/school/courses/${id}/gradebook`, { token: teacher.token });
    expect(gb.body.componentsTotal).toBe(60);
    const amal = gb.body.rows.find((r) => r.student.id === s1.user.id)!;
    expect(amal.marks).toEqual({ [hw!.id]: 18, [att!.id]: 5, [fin!.id]: 27 });
    expect(amal.result).toMatchObject({ score: 50, max: 60, percent: 83.3, passed: true, rating: 'veryGood', complete: true });
    const bassem = gb.body.rows.find((r) => r.student.id === s2.user.id)!;
    expect(bassem.result).toMatchObject({ score: 10, gradedMax: 30, percent: 33.3, passed: false, rating: 'fail' });
    expect((await call('GET', `/school/courses/${id}/gradebook`, { token: s1.token })).status).toBe(403);

    const card = await call<ReportCardDto>('GET', '/school/report-card', { token: s1.token });
    expect(card.body.terms).toEqual(['Term 1']);
    expect(card.body.subjects[0]).toMatchObject({ title: 'Mathematics', teacher: 'Mr Adel', result: { score: 50, max: 60 } });
    expect(card.body.overall).toMatchObject({ score: 50, max: 60, percent: 83.3, failed: 0 });
    // Someone else's report card is private.
    expect((await call('GET', `/school/report-card?studentId=${s1.user.id}`, { token: s2.token })).status).toBe(403);
  });
});
