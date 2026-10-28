import { expect, test } from '@playwright/test';
import { adminToken, apiRegister, login, newUser, trackErrors, uid } from './helpers';

test('curriculum, question bank exam with exam mode, item analysis, and the student plan', async ({ browser, request }) => {
  const tag = uid();
  const admin = await adminToken(request);
  const imported = await request.post('/api/v1/curriculum/import', {
    headers: { authorization: `Bearer ${admin}` },
    data: {
      system: 'eg',
      gradeLevel: 'p5',
      subject: {
        title: `Science ${tag}`,
        children: [{ title: 'Living things', children: [{ title: 'Plants', children: [{ title: `Name the parts of a plant ${tag}`, code: `S5.${tag}` }] }] }],
      },
    },
  });
  expect(imported.ok(), await imported.text()).toBeTruthy();
  const { subjectId } = (await imported.json()) as { subjectId: string };
  const tree = (await (await request.get(`/api/v1/curriculum/${subjectId}`, { headers: { authorization: `Bearer ${admin}` } })).json()) as {
    nodes: { id: string; kind: string }[];
  };
  const objectiveId = tree.nodes.find((n) => n.kind === 'objective')!.id;

  // The teacher keeps two banks: one shared for practice, one private for the exam.
  const teacher = newUser('banker');
  const tToken = await apiRegister(request, teacher, 'teacher');
  const auth = { authorization: `Bearer ${tToken}` };
  const q = (p: string) => ({ type: 'mc', prompt: p, options: ['Root', 'Moon', 'Car', 'Cloud'], answer: 0, points: 1, objectiveId, level: 'easy' });
  const shared = await request.post('/api/v1/quizzes', {
    headers: auth,
    data: { title: `Practice bank ${tag}`, kind: 'bank', published: true, questions: [1, 2, 3, 4].map((i) => q(`Practice ${i}: which part takes in water?`)) },
  });
  expect(shared.ok(), await shared.text()).toBeTruthy();
  const privateBank = await request.post('/api/v1/quizzes', {
    headers: auth,
    data: { title: `Exam bank ${tag}`, kind: 'bank', published: false, questions: [1, 2, 3, 4, 5].map((i) => q(`Exam ${i}: which part takes in water?`)) },
  });
  expect(privateBank.ok()).toBeTruthy();

  // Teacher: builds the exam in the editor from the private bank.
  const ctxT = await browser.newContext({ locale: 'en-US' });
  const pageT = await ctxT.newPage();
  await login(pageT, teacher);
  await pageT.goto('/quiz?tab=banks');
  await expect(pageT.getByText(`Exam bank ${tag}`)).toBeVisible();
  await pageT.goto('/quiz/new');
  await pageT.getByLabel('Quiz title').fill(`Plants exam ${tag}`);
  await pageT.getByRole('combobox', { name: 'Type' }).first().selectOption('exam');
  await pageT.getByRole('switch', { name: 'Exam mode: full screen, and record when a student leaves the page' }).click();
  await pageT.getByRole('switch', { name: 'Shuffle the answer choices for each student' }).click();
  await pageT.getByRole('switch', { name: 'Build from question banks' }).click();
  await pageT.getByRole('button', { name: new RegExp(`Exam bank ${tag}`) }).click();
  await pageT.getByLabel('Questions', { exact: true }).fill('3');
  await expect(pageT.getByText('3 questions per student')).toBeVisible();
  await pageT.getByRole('button', { name: 'Save quiz' }).click();
  await expect(pageT).toHaveURL(/\/quiz\?mine=1/);

  // Student: takes the exam in exam mode and leaves the page once.
  const student = newUser('learner');
  await apiRegister(request, student);
  const ctxS = await browser.newContext({ locale: 'en-US' });
  const pageS = await ctxS.newPage();
  const errors = trackErrors(pageS);
  await login(pageS, student);
  await pageS.goto(`/quiz?q=${encodeURIComponent(`Plants exam ${tag}`)}`);
  await pageS.getByRole('button', { name: 'Start' }).first().click();
  await expect(pageS.getByText(/Exam mode: this exam records when you leave the page/)).toBeVisible();
  await pageS.evaluate(() => window.dispatchEvent(new Event('blur')));
  await expect(pageS.getByText('You left the exam page. Your teacher can see this.')).toBeVisible();
  for (let i = 0; i < 3; i++) {
    await pageS.getByRole('radio', { name: 'Root' }).click();
    if (i < 2) await pageS.getByRole('button', { name: 'Next' }).click();
  }
  await pageS.getByRole('button', { name: 'Submit' }).click();
  await pageS.getByRole('dialog').getByRole('button', { name: 'Submit' }).click();
  await expect(pageS.getByText('3/3').or(pageS.getByText('100%')).first()).toBeVisible();

  // Teacher: question analysis and who left the page.
  const exams = (await (await request.get(`/api/v1/quizzes?mine=1&q=${encodeURIComponent(`Plants exam ${tag}`)}`, { headers: auth })).json()) as {
    items: { id: string }[];
  };
  await pageT.goto(`/quiz/${exams.items[0]!.id}/stats`);
  await expect(pageT.getByRole('heading', { name: 'Question analysis' })).toBeVisible();
  await expect(pageT.getByText('Left the page once')).toBeVisible();

  // Student: the curriculum plan offers the placement test and practice from the shared bank only.
  await pageS.goto(`/curriculum/${subjectId}`);
  await expect(pageS.getByRole('heading', { name: 'Your plan' })).toBeVisible();
  await expect(pageS.getByText('0 of 1 objectives mastered').or(pageS.getByText('1 of 1 objectives mastered'))).toBeVisible();
  await pageS.getByRole('button', { name: 'Practise' }).first().click();
  await expect(pageS).toHaveURL(/\/quiz\/attempt\//);
  await expect(pageS.getByText(/^Practice \d: which part takes in water\?/)).toBeVisible();
  expect(errors.filter((e) => !/fullscreen/i.test(e))).toEqual([]);
  await ctxT.close();
  await ctxS.close();
});
