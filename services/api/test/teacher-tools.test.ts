import { eq } from 'drizzle-orm';
import { describe, expect, it } from 'vitest';
import type {
  ClassComparisonDto,
  CourseDto,
  CurriculumTreeDto,
  LessonPlanDto,
  NotificationDto,
  Page,
  PaperGradeDto,
  QuizSummaryDto,
  SchoolTemplateDto,
  StudentCommentDto,
  WorksheetDto,
} from '@qubedu/shared';
import { guardianLinks, objectiveSamples, schoolMembers, uploads } from '../src/db/schema';
import { call, newUser, rootUser, setupApp } from './helpers';

const stamp = () => Date.now().toString(36);

async function objective(rootToken: string) {
  const tag = stamp();
  const res = await call<{ subjectId: string }>('POST', '/curriculum/import', {
    token: rootToken,
    body: {
      system: 'eg',
      gradeLevel: 'p4',
      subject: {
        title: `Science ${tag}`,
        children: [{ title: 'Plants', children: [{ title: 'Photosynthesis', children: [{ title: `Explain how plants make food ${tag}`, code: 'S4.P.1' }] }] }],
      },
    },
  });
  const tree = await call<CurriculumTreeDto>('GET', `/curriculum/${res.body.subjectId}`, { token: rootToken });
  return { subject: `Science ${tag}`, obj: tree.body.nodes.find((n) => n.code === 'S4.P.1')! };
}

const quiz = (title: string, objectiveId: string) => ({
  title,
  difficulty: 'easy',
  durationSec: 300,
  questions: [
    { type: 'tf', prompt: 'Plants need light', options: ['True', 'False'], answer: 0, level: 'easy', objectiveId },
    { type: 'mc', prompt: 'Which gas do plants take in?', options: ['Oxygen', 'Carbon dioxide'], answer: 1, level: 'medium', objectiveId },
    { type: 'short', prompt: 'Name the green pigment', answer: ['chlorophyll'], level: 'hard', objectiveId },
    { type: 'short', prompt: 'Where does photosynthesis happen?', answer: ['leaf'], objectiveId },
  ],
});

describe('lesson plan and tiered worksheets', () => {
  it('builds a plan from an objective and worksheets in three levels, and keeps them to teachers', async () => {
    const root = await rootUser();
    const { subject, obj } = await objective(root.token);
    const teacher = await newUser({ accountType: 'teacher' });
    const student = await newUser();
    const made = await call<QuizSummaryDto>('POST', '/quizzes', { token: teacher.token, body: quiz('Plants quiz', obj.id) });
    expect(made.status).toBe(201);

    expect((await call('POST', '/teacher/lesson-plan', { token: student.token, body: { objectiveId: obj.id } })).status).toBe(403);
    const plan = await call<LessonPlanDto>('POST', '/teacher/lesson-plan', { token: teacher.token, body: { objectiveId: obj.id, minutes: 50 } });
    expect(plan.status).toBe(200);
    expect(plan.body.path).toEqual([subject, 'Plants', 'Photosynthesis']);
    expect(plan.body.sections.reduce((n, s) => n + s.minutes, 0)).toBe(50);
    expect(plan.body.questions.map((q) => q.prompt)).toContain('Plants need light');
    expect((await call('POST', '/teacher/lesson-plan', { token: teacher.token, body: { objectiveId: made.body.id } })).status).toBe(404);

    const ws = await call<WorksheetDto>('POST', '/teacher/worksheet', {
      token: teacher.token,
      body: { objectiveId: obj.id, perTier: 3, save: true, title: 'Plants' },
    });
    expect(ws.status).toBe(200);
    expect(ws.body.tiers.easy.map((q) => q.prompt)).toContain('Plants need light');
    expect(ws.body.tiers.advanced.map((q) => q.prompt)).toContain('Name the green pigment');
    expect(Object.keys(ws.body.quizIds).sort()).toEqual(['advanced', 'easy', 'medium']);
    const mine = await call<Page<QuizSummaryDto>>('GET', '/quizzes?mine=1', { token: teacher.token });
    expect(mine.body.items.map((q) => q.title)).toEqual(expect.arrayContaining(['Plants (easy)', 'Plants (medium)', 'Plants (advanced)']));
    expect((await call('POST', '/teacher/worksheet', { token: teacher.token, body: {} })).status).toBe(400);
  });
});

describe('grading a paper from a photo', () => {
  it('reads the photo (or says it cannot), suggests marks and keeps files private to their owner', async () => {
    const { deps } = await setupApp();
    const teacher = await newUser({ accountType: 'teacher' });
    const other = await newUser({ accountType: 'teacher' });
    const stored = await deps.storage.put(new Uint8Array([1, 2, 3]), { mime: 'image/jpeg', ext: 'jpg', visibility: 'private' });
    await deps.db
      .insert(uploads)
      .values({ ownerId: teacher.user.id, key: stored.key, mime: 'image/jpeg', size: 3, name: 'paper.jpg', visibility: 'private', purpose: 'assignment' });
    const fileUrl = `/files/${stored.key}`;

    const read = await call<{ text: string }>('POST', '/teacher/paper/read', { token: teacher.token, body: { fileUrl, language: 'en' } });
    expect(read.status).toBe(200);
    expect(read.body.text).toContain('Cairo');
    expect((await call('POST', '/teacher/paper/read', { token: other.token, body: { fileUrl } })).status).toBe(400);
    expect((await call('POST', '/teacher/paper/read', { token: teacher.token, body: { fileUrl: '/files/private/nope.jpg' } })).status).toBe(400);

    const marks = await call<PaperGradeDto>('POST', '/teacher/paper/suggest', {
      token: teacher.token,
      body: {
        text: read.body.text,
        key: [
          { label: '1', accepted: ['Cairo'], points: 2 },
          { label: '2', accepted: ['light', 'chlorophyll', 'water'], points: 4, needed: 3 },
          { label: '3', accepted: ['12'], points: 1 },
        ],
      },
    });
    expect(marks.body.items.map((i) => i.awarded)).toEqual([2, 2.5, 1]);
    expect([marks.body.total, marks.body.max]).toEqual([5.5, 7]);
    expect((await call('POST', '/teacher/paper/suggest', { token: (await newUser()).token, body: { text: 'x', key: [] } })).status).toBe(403);
  });
});

describe('comparing classes', () => {
  it('shows each class’s average on the objectives, only for classes the teacher teaches', async () => {
    const { deps } = await setupApp();
    const root = await rootUser();
    const { obj } = await objective(root.token);
    const teacher = await newUser({ accountType: 'teacher' });
    const colleague = await newUser({ accountType: 'teacher' });
    const s1 = await newUser();
    const s2 = await newUser();
    const mk = async (t: typeof teacher, title: string) => (await call<CourseDto>('POST', '/school/courses', { token: t.token, body: { title } })).body;
    const a = await mk(teacher, '5A');
    const b = await mk(teacher, '5B');
    const foreign = await mk(colleague, '6A');
    await call('POST', '/school/join', { token: s1.token, body: { code: a.joinCode } });
    await call('POST', '/school/join', { token: s2.token, body: { code: b.joinCode } });
    await deps.db.insert(objectiveSamples).values([
      { userId: s1.user.id, objectiveId: obj.id, correct: 9, total: 10, attemptId: crypto.randomUUID() },
      { userId: s2.user.id, objectiveId: obj.id, correct: 4, total: 10, attemptId: crypto.randomUUID() },
    ]);
    const cmp = await call<ClassComparisonDto>('GET', `/teacher/compare?courseIds=${a.id},${b.id}`, { token: teacher.token });
    expect(cmp.status).toBe(200);
    expect(cmp.body.objectives.map((o) => o.id)).toEqual([obj.id]);
    expect(cmp.body.classes.map((c) => [c.title, c.cells[obj.id]?.pct])).toEqual([
      ['5A', 90],
      ['5B', 40],
    ]);
    expect((await call('GET', `/teacher/compare?courseIds=${a.id},${foreign.id}`, { token: teacher.token })).status).toBe(403);
  });
});

describe('school templates', () => {
  it('shares quizzes and assignments between the teachers of one school', async () => {
    const { deps } = await setupApp();
    const root = await rootUser();
    const { obj } = await objective(root.token);
    const author = await newUser({ accountType: 'teacher' });
    const colleague = await newUser({ accountType: 'teacher' });
    const outsider = await newUser({ accountType: 'teacher' });
    const school = await call<{ id: string }>('POST', '/schools', { token: author.token, body: { name: 'Template School' } });
    await deps.db.insert(schoolMembers).values({ schoolId: school.body.id, userId: colleague.user.id, role: 'teacher', status: 'active' });
    const made = await call<QuizSummaryDto>('POST', '/quizzes', { token: author.token, body: quiz('Shared quiz', obj.id) });
    expect(made.status).toBe(201);

    expect((await call('GET', `/schools/${school.body.id}/templates`, { token: outsider.token })).status).toBe(403);
    expect((await call('POST', `/schools/${school.body.id}/templates`, { token: colleague.token, body: { kind: 'quiz', quizId: made.body.id } })).status).toBe(
      403,
    );
    const t1 = await call<{ id: string }>('POST', `/schools/${school.body.id}/templates`, {
      token: author.token,
      body: { kind: 'quiz', quizId: made.body.id },
    });
    const t2 = await call<{ id: string }>('POST', `/schools/${school.body.id}/templates`, {
      token: author.token,
      body: { kind: 'assignment', title: 'Lab report', description: 'Write up the experiment', points: 20 },
    });
    expect([t1.status, t2.status]).toEqual([201, 201]);

    const list = await call<{ items: SchoolTemplateDto[] }>('GET', `/schools/${school.body.id}/templates`, { token: colleague.token });
    expect(list.body.items.map((t) => [t.kind, t.title, t.mine, t.questionCount]).sort()).toEqual([
      ['assignment', 'Lab report', false, null],
      ['quiz', 'Shared quiz', false, 4],
    ]);

    const copy = await call<{ quizId: string }>('POST', `/schools/${school.body.id}/templates/${t1.body.id}/use`, { token: colleague.token, body: {} });
    expect(copy.status).toBe(201);
    expect((await call<QuizSummaryDto>('GET', `/quizzes/${copy.body.quizId}`, { token: colleague.token })).body).toMatchObject({
      title: 'Shared quiz',
      questionCount: 4,
      canEdit: true,
    });
    const course = (await call<CourseDto>('POST', '/school/courses', { token: colleague.token, body: { title: '6B' } })).body;
    expect((await call('POST', `/schools/${school.body.id}/templates/${t2.body.id}/use`, { token: colleague.token, body: {} })).status).toBe(400);
    const asg = await call<{ assignmentId: string }>('POST', `/schools/${school.body.id}/templates/${t2.body.id}/use`, {
      token: colleague.token,
      body: { courseId: course.id },
    });
    expect(asg.status).toBe(201);
    expect(
      (await call<{ items: SchoolTemplateDto[] }>('GET', `/schools/${school.body.id}/templates?kind=quiz`, { token: author.token })).body.items[0],
    ).toMatchObject({ uses: 1 });

    expect((await call('DELETE', `/schools/${school.body.id}/templates/${t1.body.id}`, { token: colleague.token })).status).toBe(403);
    expect((await call('DELETE', `/schools/${school.body.id}/templates/${t1.body.id}`, { token: author.token })).status).toBe(200);
  });
});

describe('personal notes to students', () => {
  it('suggests a note from the student’s results, sends it to the student and their parent, and lists it for both', async () => {
    const { deps } = await setupApp();
    const teacher = await newUser({ accountType: 'teacher' });
    const student = await newUser({ name: 'Omar Hassan' });
    const parent = await newUser({ accountType: 'parent' });
    const stranger = await newUser();
    await deps.db.insert(guardianLinks).values({ guardianId: parent.user.id, studentId: student.user.id });
    const course = (await call<CourseDto>('POST', '/school/courses', { token: teacher.token, body: { title: 'Math 5A', subject: 'Mathematics' } })).body;
    await call('POST', '/school/join', { token: student.token, body: { code: course.joinCode } });
    await call('PATCH', '/me/prefs', { token: teacher.token, body: { appearance: { language: 'en' } } });
    // One assignment that is overdue and not handed in.
    await call('POST', `/school/courses/${course.id}/assignments`, {
      token: teacher.token,
      body: { title: 'Fractions homework', dueAt: Date.now() - 86_400_000 },
    });

    expect((await call('POST', '/teacher/comments/suggest', { token: student.token, body: { courseId: course.id, studentId: student.user.id } })).status).toBe(
      403,
    );
    expect((await call('POST', '/teacher/comments/suggest', { token: teacher.token, body: { courseId: course.id, studentId: stranger.user.id } })).status).toBe(
      400,
    );
    const s = await call<{ text: string; facts: { missing: number } }>('POST', '/teacher/comments/suggest', {
      token: teacher.token,
      body: { courseId: course.id, studentId: student.user.id },
    });
    expect(s.status).toBe(200);
    expect(s.body.facts.missing).toBe(1);
    expect(s.body.text).toContain('Omar');
    expect(s.body.text).toContain('1 assignment is still missing');

    const sent = await call('POST', '/teacher/comments/send', {
      token: teacher.token,
      body: { courseId: course.id, studentId: student.user.id, text: `${s.body.text} Well done on the quiz.` },
    });
    expect(sent.status).toBe(201);
    for (const u of [student, parent]) {
      const mine = await call<{ items: StudentCommentDto[] }>('GET', '/teacher/comments/mine', { token: u.token });
      expect(mine.body.items).toHaveLength(1);
      expect(mine.body.items[0]).toMatchObject({ courseTitle: 'Math 5A' });
      const notes = await call<Page<NotificationDto>>('GET', '/notifications', { token: u.token });
      expect(notes.body.items.some((n) => n.type === 'teacher_comment')).toBe(true);
    }
    expect((await call<{ items: StudentCommentDto[] }>('GET', '/teacher/comments/mine', { token: stranger.token })).body.items).toEqual([]);
    expect(
      (await call('POST', '/teacher/comments/send', { token: stranger.token, body: { courseId: course.id, studentId: student.user.id, text: 'hello there' } }))
        .status,
    ).toBe(403);
    void eq;
  });
});

describe('true/false in query strings', () => {
  it('treats archived=false as false (and 0/1 as numbers say)', async () => {
    const teacher = await newUser({ accountType: 'teacher' });
    await call('POST', '/school/courses', { token: teacher.token, body: { title: 'Active class' } });
    expect((await call<{ items: CourseDto[] }>('GET', '/school/courses?archived=false', { token: teacher.token })).body.items.map((c) => c.title)).toEqual([
      'Active class',
    ]);
    expect((await call<{ items: CourseDto[] }>('GET', '/school/courses?archived=true', { token: teacher.token })).body.items).toEqual([]);
    expect((await call<{ items: CourseDto[] }>('GET', '/school/courses?archived=0', { token: teacher.token })).body.items).toHaveLength(1);
  });
});
