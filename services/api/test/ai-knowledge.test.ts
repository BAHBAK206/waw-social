import type { AssistantGapDto, AssistantMessageDto, AssistantTestDto, CourseDto, CourseKnowledgeDto } from '@qubedu/shared';
import { describe, expect, it } from 'vitest';
import * as helpers from './helpers';

const { call, newUser, rootUser } = helpers;

describe('feeding the local assistant', () => {
  it('sends the help guides in the user’s language with the note for their account type', async () => {
    const u = await newUser({ accountType: 'parent', name: 'Guide Parent' });
    await call('POST', '/assistant/messages', { token: u.token, body: { text: 'how do I link my child', language: 'en' } });
    const input = helpers.lastAssistantInput!;
    const family = input.guides!.find((g) => g.id === 'family')!;
    expect(family.title).toBe('Parent account');
    expect(family.link).toBe('/family');
    expect(family.guide).toBe('/help/family');
    expect(family.note).toMatch(/progress/);
  });

  it('teachers add class questions and answers that only members of that class get', async () => {
    const teacher = await newUser({ accountType: 'teacher' });
    const course = await call<CourseDto>('POST', '/school/courses', { token: teacher.token, body: { title: 'Chemistry 2' } });
    const student = await newUser();
    const outsider = await newUser();
    await call('POST', '/school/join', { token: student.token, body: { code: course.body.joinCode } });

    // Students cannot write the class knowledge.
    const denied = await call('POST', `/school/courses/${course.body.id}/knowledge`, {
      token: student.token,
      body: { question: 'When is the lab report due?', answer: 'Friday.' },
    });
    expect(denied.status).toBe(403);
    const added = await call<CourseKnowledgeDto>('POST', `/school/courses/${course.body.id}/knowledge`, {
      token: teacher.token,
      body: { question: 'When is the chemistry lab report due?', answer: 'Every Friday before 8 pm, on the Classwork tab.' },
    });
    expect(added.status).toBe(201);
    const list = await call<{ items: CourseKnowledgeDto[] }>('GET', `/school/courses/${course.body.id}/knowledge`, { token: teacher.token });
    expect(list.body.items).toHaveLength(1);

    const ask = (token: string) =>
      call<{ message: AssistantMessageDto }>('POST', '/assistant/messages', { token, body: { text: 'when is the chemistry lab report due' } });
    expect((await ask(student.token)).body.message.content).toContain('Friday');
    expect((await ask(outsider.token)).body.message.content).not.toContain('Friday');

    // The admin knowledge list stays site-wide only.
    const root = await rootUser();
    const kb = await call<{ items: { question: string }[] }>('GET', '/admin/assistant-knowledge', { token: root.token });
    expect(kb.body.items.some((k) => k.question.includes('chemistry lab'))).toBe(false);

    const updated = await call<CourseKnowledgeDto>('PUT', `/school/courses/${course.body.id}/knowledge/${added.body.id}`, {
      token: teacher.token,
      body: { question: 'When is the chemistry lab report due?', answer: 'Thursdays now.' },
    });
    expect(updated.body.answer).toBe('Thursdays now.');
    await call('DELETE', `/school/courses/${course.body.id}/knowledge/${added.body.id}`, { token: teacher.token });
    expect((await call<{ items: unknown[] }>('GET', `/school/courses/${course.body.id}/knowledge`, { token: teacher.token })).body.items).toHaveLength(0);
  });

  it('unanswered questions are collected; answering one teaches the assistant', async () => {
    const root = await rootUser();
    const u = await newUser();
    const q = `?? where is the robotics club room ${Date.now()}`;
    await call('POST', '/assistant/messages', { token: u.token, body: { text: q } });
    await call('POST', '/assistant/messages', { token: u.token, body: { text: q } });
    const gaps = await call<{ items: AssistantGapDto[] }>('GET', '/admin/assistant-gaps', { token: root.token });
    const gap = gaps.body.items.find((g) => g.question === q)!;
    expect(gap.count).toBe(2);
    expect((await call('GET', '/admin/assistant-gaps', { token: u.token })).status).toBe(403);

    const ans = await call('POST', `/admin/assistant-gaps/${gap.id}/answer`, { token: root.token, body: { answer: 'Room B12, second floor.' } });
    expect(ans.status).toBe(201);
    const after = await call<{ items: AssistantGapDto[] }>('GET', '/admin/assistant-gaps', { token: root.token });
    expect(after.body.items.some((g) => g.id === gap.id)).toBe(false);
    const r = await call<{ message: AssistantMessageDto }>('POST', '/assistant/messages', { token: u.token, body: { text: q } });
    expect(r.body.message.content).toContain('B12');

    const test = await call<AssistantTestDto>('POST', '/admin/assistant-test', { token: root.token, body: { question: q, language: 'en' } });
    expect(test.body).toMatchObject({ provider: 'qubedu:kb' });
    expect(test.body.content).toContain('B12');
  });
});
