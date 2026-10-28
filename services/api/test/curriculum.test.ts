import type { CurriculumTreeDto, LearningPlanDto, QuizAttemptDto, QuizEditorDto, QuizResultDto, QuizStatsDto, QuizSummaryDto } from '@qubedu/shared';
import { describe, expect, it } from 'vitest';
import { call, newUser, rootUser } from './helpers';

const stamp = () => Date.now().toString(36);

async function importSubject(token: string) {
  const tag = stamp();
  const res = await call<{ subjectId: string; nodes: number }>('POST', '/curriculum/import', {
    token,
    body: {
      system: 'eg',
      gradeLevel: 'p4',
      subject: {
        title: `Mathematics ${tag}`,
        code: 'MATH-P4',
        children: [
          {
            title: 'Fractions',
            children: [
              {
                title: 'Equivalent fractions',
                children: [
                  { title: `Find an equivalent fraction ${tag}`, code: 'M4.F.1' },
                  { title: 'Simplify a fraction', code: 'M4.F.2' },
                ],
              },
            ],
          },
          { title: 'Geometry', children: [{ title: 'Angles', children: [{ title: 'Name right, acute and obtuse angles', code: 'M4.G.1' }] }] },
        ],
      },
    },
  });
  expect(res.status).toBe(201);
  expect(res.body.nodes).toBe(8);
  const tree = await call<CurriculumTreeDto>('GET', `/curriculum/${res.body.subjectId}`, { token });
  const obj = (code: string) => tree.body.nodes.find((n) => n.code === code)!;
  return { subjectId: res.body.subjectId, tree: tree.body, f1: obj('M4.F.1'), f2: obj('M4.F.2'), g1: obj('M4.G.1'), tag };
}

const mc = (prompt: string, objectiveId: string, level: 'easy' | 'medium' | 'hard') => ({
  type: 'mc' as const,
  prompt,
  options: ['right', 'wrong 1', 'wrong 2', 'wrong 3'],
  answer: 0,
  points: 1,
  objectiveId,
  level,
  bloom: 'apply' as const,
});

describe('curriculum, question bank and exams', () => {
  it('builds per-student exams from a bank, grades shuffled options, records leaving the page and item analysis', async () => {
    const root = await rootUser();
    const { subjectId, tree, f1, f2, g1 } = await importSubject(root.token);
    expect(tree.nodes.map((n) => n.kind)).toEqual(['unit', 'lesson', 'objective', 'objective', 'unit', 'lesson', 'objective']);
    // Only curriculum editors can change it.
    const teacher = await newUser({ accountType: 'teacher' });
    expect((await call('POST', '/curriculum', { token: teacher.token, body: { kind: 'subject', title: 'Mine' } })).status).toBe(403);
    expect((await call('POST', '/curriculum', { token: root.token, body: { kind: 'lesson', title: 'x', parentId: subjectId } })).status).toBe(400);

    // A bank of 12 tagged questions.
    const questions = [
      ...Array.from({ length: 5 }, (_, i) => mc(`F1 easy ${i}`, f1.id, 'easy')),
      ...Array.from({ length: 4 }, (_, i) => mc(`F2 hard ${i}`, f2.id, 'hard')),
      ...Array.from({ length: 3 }, (_, i) => mc(`G1 medium ${i}`, g1.id, 'medium')),
    ];
    const bank = await call<QuizSummaryDto>('POST', '/quizzes', {
      token: teacher.token,
      body: { title: 'Fractions bank', kind: 'bank', published: false, questions },
    });
    expect(bank.status).toBe(201);
    // Banks are never listed or taken by students.
    const student = await newUser();
    expect((await call('POST', `/quizzes/${bank.body.id}/attempts`, { token: student.token, body: {} })).status).toBe(404);
    // Editing keeps question ids.
    const ed1 = await call<QuizEditorDto>('GET', `/quizzes/${bank.body.id}/edit`, { token: teacher.token });
    await call('PUT', `/quizzes/${bank.body.id}`, { token: teacher.token, body: { ...ed1.body, title: 'Fractions bank v2' } });
    const ed2 = await call<QuizEditorDto>('GET', `/quizzes/${bank.body.id}/edit`, { token: teacher.token });
    expect(ed2.body.questions.map((q) => q.id)).toEqual(ed1.body.questions.map((q) => q.id));
    expect(ed2.body.questions[0]).toMatchObject({ objectiveId: f1.id, level: 'easy', bloom: 'apply' });

    // Someone else's bank cannot be used.
    const other = await newUser({ accountType: 'teacher' });
    const stolen = await call('POST', '/quizzes', {
      token: other.token,
      body: { title: 'Copy', kind: 'exam', blueprint: { bankIds: [bank.body.id], rules: [{ count: 2 }] } },
    });
    expect(stolen.status).toBe(403);

    // Exam: 3 from objective F1 + 2 hard from the whole unit, options shuffled, integrity on.
    const fractionsUnit = tree.nodes.find((n) => n.title === 'Fractions')!;
    const exam = await call<QuizSummaryDto>('POST', '/quizzes', {
      token: teacher.token,
      body: {
        title: 'Fractions exam',
        kind: 'exam',
        shuffleOptions: true,
        integrity: true,
        curriculumId: fractionsUnit.id,
        blueprint: {
          bankIds: [bank.body.id],
          rules: [
            { objectiveId: f1.id, count: 3 },
            { objectiveId: fractionsUnit.id, difficulty: 'hard', count: 2 },
          ],
        },
      },
    });
    expect(exam.status).toBe(201);
    expect(exam.body).toMatchObject({ questionCount: 5, fromBank: true, integrity: true });

    const students = await Promise.all(Array.from({ length: 6 }, () => newUser()));
    const sets: string[] = [];
    for (const [i, s] of students.entries()) {
      const a = await call<QuizAttemptDto>('POST', `/quizzes/${exam.body.id}/attempts`, { token: s.token, body: {} });
      expect(a.status).toBe(201);
      expect(a.body.integrity).toBe(true);
      expect(a.body.questions).toHaveLength(5);
      expect(a.body.questions.filter((q) => q.prompt.startsWith('F1')).length).toBe(3);
      expect(a.body.questions.filter((q) => q.prompt.startsWith('F2')).length).toBe(2);
      sets.push(
        a.body.questions
          .map((q) => q.prompt)
          .sort()
          .join(),
      );
      // Leaving the page is counted (twice for the first student).
      if (i === 0) {
        await call('POST', `/quizzes/attempts/${a.body.attemptId}/events`, { token: s.token, body: { type: 'blur' } });
        await call('POST', `/quizzes/attempts/${a.body.attemptId}/events`, { token: s.token, body: { type: 'blur' } });
      }
      // Students answer the shown option "right" (wherever it moved to) for the first i questions.
      const answers = a.body.questions.map((q, k) => (k < i ? q.options.indexOf('right') : q.options.indexOf('wrong 1')));
      const r = await call<QuizResultDto>('POST', `/quizzes/attempts/${a.body.attemptId}/submit`, { token: s.token, body: { answers } });
      expect(r.body.correct).toBe(Math.min(i, 5));
    }
    expect(new Set(sets).size).toBeGreaterThan(1);
    // The same student gets the same exam again (and cannot retake it).
    expect((await call('POST', `/quizzes/${exam.body.id}/attempts`, { token: students[0]!.token, body: {} })).status).toBe(409);

    const stats = await call<QuizStatsDto>('GET', `/quizzes/${exam.body.id}/stats`, { token: teacher.token });
    expect(stats.body.attempts).toBe(6);
    expect(stats.body.questions.length).toBeGreaterThanOrEqual(5);
    const first = stats.body.attemptsList.find((x) => x.user.id === students[0]!.user.id)!;
    expect(first.integrity.blur).toBe(2);
    expect((await call('GET', `/quizzes/${exam.body.id}/stats`, { token: students[1]!.token })).status).toBe(403);

    // Mastery per objective is recorded; the tree and the plan show it.
    const t = await call<CurriculumTreeDto>('GET', `/curriculum/${subjectId}`, { token: students[5]!.token });
    expect(t.body.mastery[f1.id]!.evidence).toBeGreaterThan(0);
    // The bank feeds an exam, so its questions are not offered for practice.
    expect(t.body.questionCounts[f1.id] ?? 0).toBe(0);
    // The exam was attached to its unit, so students find it from the curriculum.
    expect(t.body.resources[fractionsUnit.id]).toEqual([{ type: 'quiz', id: exam.body.id, title: 'Fractions exam' }]);
  });

  it('practice, placement test and the personal plan use shared banks', async () => {
    const root = await rootUser();
    const { subjectId, f1, f2, g1 } = await importSubject(root.token);
    const teacher = await newUser({ accountType: 'teacher' });
    const bank = await call<QuizSummaryDto>('POST', '/quizzes', {
      token: teacher.token,
      body: {
        title: 'Shared practice bank',
        kind: 'bank',
        published: true,
        questions: [
          ...Array.from({ length: 4 }, (_, i) => mc(`P F1 ${i}`, f1.id, 'easy')),
          ...Array.from({ length: 4 }, (_, i) => mc(`P F2 ${i}`, f2.id, 'medium')),
          ...Array.from({ length: 4 }, (_, i) => mc(`P G1 ${i}`, g1.id, 'medium')),
        ],
      },
    });
    expect(bank.status).toBe(201);
    const s = await newUser();
    let plan = await call<LearningPlanDto>('GET', `/curriculum/${subjectId}/plan`, { token: s.token });
    expect(plan.body).toMatchObject({ placementDone: false, progress: { total: 3, new: 3 } });

    const place = await call<{ attemptId: string }>('POST', `/curriculum/${subjectId}/placement`, { token: s.token });
    const attempt = await call<{ submitted: false; attempt: QuizAttemptDto }>('GET', `/quizzes/attempts/${place.body.attemptId}`, { token: s.token });
    expect(attempt.body.attempt.questions).toHaveLength(6);
    // Right on F1 and G1, wrong on F2.
    const answers = attempt.body.attempt.questions.map((q) => (q.prompt.startsWith('P F2') ? 1 : 0));
    await call('POST', `/quizzes/attempts/${place.body.attemptId}/submit`, { token: s.token, body: { answers } });

    plan = await call<LearningPlanDto>('GET', `/curriculum/${subjectId}/plan`, { token: s.token });
    expect(plan.body.placementDone).toBe(true);
    expect(plan.body.next[0]!.objective.id).toBe(f2.id);
    expect(plan.body.next[0]!.status).toBe('weak');
    expect(plan.body.next[0]!.questions).toBe(4);

    const practice = await call<{ attemptId: string }>('POST', `/curriculum/${f2.id}/practice`, { token: s.token });
    const p = await call<{ submitted: false; attempt: QuizAttemptDto }>('GET', `/quizzes/attempts/${practice.body.attemptId}`, { token: s.token });
    expect(p.body.attempt.questions.every((q) => q.prompt.startsWith('P F2'))).toBe(true);

    const found = await call<{ items: { node: { id: string }; path: string }[] }>('GET', `/curriculum/search?q=Simplify a fraction`, { token: s.token });
    expect(found.body.items.find((x) => x.node.id === f2.id)!.path).toMatch(/Fractions › Equivalent fractions/);
  });
});
