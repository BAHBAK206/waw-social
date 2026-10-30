import { describe, expect, it } from 'vitest';
import type { AssignmentDto, CourseDto, QuizAttemptDto, RubricFeedbackDto, SimilarityReportDto } from '@qubedu/shared';
import { call, lastAssistantInput, lastSolveInput, newUser } from './helpers';

const reg = async (body: Record<string, unknown>) => {
  const email = `kid${Date.now()}${Math.random().toString(36).slice(2, 6)}@qubedu.test`;
  const r = await call<{ accessToken: string; user: { id: string } }>('POST', '/auth/register', {
    body: { email, password: 'Password#123', displayName: 'Kid', ...body },
    headers: { 'x-client': 'mobile' },
  });
  return { token: r.body.accessToken, user: r.body.user };
};

describe('AI guard rails', () => {
  it('stays quiet during an exam, and gives hints when a parent or the class asks for it', async () => {
    const teacher = await newUser({ accountType: 'teacher' });
    const student = await newUser({ name: 'Omar' });
    const course = await call<CourseDto>('POST', '/school/courses', { token: teacher.token, body: { title: 'Physics 2' } });
    await call('POST', '/school/join', { token: student.token, body: { code: course.body.joinCode } });

    // An exam in progress locks the AI; reading the quota still works and says why.
    const exam = await call<{ id: string }>('POST', '/quizzes', {
      token: teacher.token,
      body: {
        title: 'Final',
        kind: 'exam',
        published: true,
        durationSec: 600,
        courseId: course.body.id,
        questions: [{ type: 'mc', prompt: '2+2?', options: ['3', '4'], answer: 1, points: 1 }],
      },
    });
    const att = await call<QuizAttemptDto>('POST', `/quizzes/${exam.body.id}/attempts`, { token: student.token, body: {} });
    expect(att.status).toBe(201);
    const locked = await call<{ error: { code: string } }>('POST', '/ai/solve', { token: student.token, body: { question: '2 + 2' } });
    expect(locked.status).toBe(423);
    expect(locked.body.error.code).toBe('exam_in_progress');
    expect((await call('POST', '/assistant/messages', { token: student.token, body: { text: 'what is 2+2' } })).status).toBe(423);
    const quota = await call<{ exam: { title: string } | null }>('GET', '/ai/quota', { token: student.token });
    expect(quota.body.exam?.title).toBe('Final');
    await call('POST', `/quizzes/attempts/${att.body.attemptId}/submit`, { token: student.token, body: { answers: [1] } });
    expect((await call('POST', '/ai/solve', { token: student.token, body: { question: '2 + 2' } })).status).toBe(200);
    expect(lastSolveInput?.mode).toBe('solve');

    // The teacher turns on hints-only for the class: questions about this class get hints.
    await call('PATCH', `/school/courses/${course.body.id}`, { token: teacher.token, body: { aiHintsOnly: true } });
    await call('POST', '/ai/solve', { token: student.token, body: { question: 'Why do objects fall?', courseId: course.body.id } });
    expect(lastSolveInput?.mode).toBe('socratic');
    await call('POST', '/ai/solve', { token: student.token, body: { question: 'Why do objects fall?' } });
    expect(lastSolveInput?.mode).toBe('solve');

    // A student can ask for hints in the assistant.
    await call('POST', '/assistant/messages', { token: student.token, body: { text: 'help me with fractions', hints: true } });
    expect(lastAssistantInput?.socratic).toBe(true);

    // Under 13: no AI until a parent approves (linking counts); then hints by default, which the parent can change.
    const kid = await reg({ gradeLevel: 'p4', parentEmail: `mum${Date.now()}@family.test` });
    expect((await call('POST', '/ai/solve', { token: kid.token, body: { question: 'What is a noun?' } })).status).toBe(403);
    const parent = await newUser({ accountType: 'parent' });
    const code = await call<{ code: string }>('POST', '/family/code', { token: kid.token });
    await call('POST', '/family/link', { token: parent.token, body: { code: code.body.code } });
    await call('POST', '/ai/solve', { token: kid.token, body: { question: 'What is a noun?' } });
    expect(lastSolveInput?.mode).toBe('socratic');
    expect((await call<{ hintsOnly: boolean }>('GET', '/ai/quota', { token: kid.token })).body.hintsOnly).toBe(true);
    await call('PUT', `/family/children/${kid.user.id}/controls`, { token: parent.token, body: { aiHints: false } });
    await call('POST', '/ai/solve', { token: kid.token, body: { question: 'What is a noun?' } });
    expect(lastSolveInput?.mode).toBe('solve');
  });

  it('gives rubric feedback on a draft and a suggested grade to the teacher, and flags copied work', async () => {
    const teacher = await newUser({ accountType: 'teacher' });
    const s1 = await newUser({ name: 'Layla' });
    const s2 = await newUser({ name: 'Karim' });
    const s3 = await newUser({ name: 'Nour' });
    const course = await call<CourseDto>('POST', '/school/courses', { token: teacher.token, body: { title: 'Biology 3' } });
    for (const s of [s1, s2, s3]) await call('POST', '/school/join', { token: s.token, body: { code: course.body.joinCode } });
    const rubric = await call<{ id: string }>('POST', `/school/courses/${course.body.id}/rubrics`, {
      token: teacher.token,
      body: {
        title: 'Essay',
        criteria: [
          {
            title: 'Photosynthesis',
            description: 'Explains the process',
            levels: [
              { label: 'Weak', points: 1 },
              { label: 'Strong', points: 5 },
            ],
          },
          {
            title: 'Examples',
            description: 'Gives examples',
            levels: [
              { label: 'None', points: 0 },
              { label: 'Good', points: 5 },
            ],
          },
        ],
      },
    });
    expect(rubric.status, JSON.stringify(rubric.body)).toBe(201);
    const a = await call<AssignmentDto>('POST', `/school/courses/${course.body.id}/assignments`, {
      token: teacher.token,
      body: { title: 'Plants essay', points: 20, rubricId: rubric.body.id, description: 'Write about how plants make food.' },
    });
    const draft = 'Photosynthesis is how plants make food from light, water and air in their green leaves.';
    const fb = await call<RubricFeedbackDto>('POST', '/ai/rubric-feedback', { token: s1.token, body: { assignmentId: a.body.id, text: draft } });
    expect(fb.status, JSON.stringify(fb.body)).toBe(200);
    expect(fb.body.criteria[0]).toMatchObject({ title: 'Photosynthesis', levelLabel: 'Strong', points: 5 });
    expect(fb.body.criteria[1]).toMatchObject({ levelLabel: 'None' });
    expect(fb.body.suggestedGrade).toBeNull();
    // Not for people outside the class.
    const stranger = await newUser();
    expect((await call('POST', '/ai/rubric-feedback', { token: stranger.token, body: { assignmentId: a.body.id, text: draft } })).status).toBe(404);

    const essay =
      'Photosynthesis is the process in which green plants use sunlight water and carbon dioxide to make glucose and release oxygen into the air which animals then breathe to live and grow every single day of the year.';
    await call('POST', `/school/assignments/${a.body.id}/submit`, { token: s1.token, body: { text: essay } });
    await call('POST', `/school/assignments/${a.body.id}/submit`, { token: s2.token, body: { text: `My answer: ${essay} The end.` } });
    await call('POST', `/school/assignments/${a.body.id}/submit`, {
      token: s3.token,
      body: {
        text: 'Volcanoes form where tectonic plates meet and magma rises through cracks in the crust, building mountains over thousands of years while ash and lava change the land around them.',
      },
    });
    const subs = await call<{ items: { id: string; student: { id: string } }[] }>('GET', `/school/assignments/${a.body.id}/submissions`, {
      token: teacher.token,
    });
    const sub1 = subs.body.items.find((x) => x.student.id === s1.user.id)!;
    const sug = await call<RubricFeedbackDto>('POST', '/ai/rubric-feedback', { token: teacher.token, body: { submissionId: sub1.id } });
    expect(sug.body.suggestedGrade).toBe(10);
    expect((await call('POST', '/ai/rubric-feedback', { token: s2.token, body: { submissionId: sub1.id } })).status).toBe(404);

    const sim = await call<SimilarityReportDto>('GET', `/school/assignments/${a.body.id}/similarity`, { token: teacher.token });
    expect(sim.body.checked).toBe(3);
    expect(sim.body.pairs).toHaveLength(1);
    expect([sim.body.pairs[0]!.a.id, sim.body.pairs[0]!.b.id].sort()).toEqual([s1.user.id, s2.user.id].sort());
    expect(sim.body.pairs[0]!.excerpt).toContain('green plants use sunlight');
    expect((await call('GET', `/school/assignments/${a.body.id}/similarity`, { token: s1.token })).status).toBe(403);
  });
});
