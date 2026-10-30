import { describe, expect, it } from 'vitest';
import type { CommentDto, Me, Page, PostDto, TaxonomyDto } from '@qubedu/shared';
import { call, newUser, rootUser } from './helpers';

async function aSubject() {
  const root = await rootUser();
  const sec = await call<{ id: string }>('POST', '/admin/sections', { token: root.token, body: { name: `Grade ${Date.now()}` } });
  const mat = await call<{ id: string }>('POST', '/admin/materials', { token: root.token, body: { sectionId: sec.body.id, name: 'Physics' } });
  expect(mat.status).toBe(201);
  const tax = await call<TaxonomyDto>('GET', '/taxonomy');
  expect(tax.body.sections.some((s) => s.materials.some((m) => m.id === mat.body.id))).toBe(true);
  return mat.body.id;
}

describe('study hall Q&A', () => {
  it('ask a question in a subject, rank answers, pick a best answer and reward the answerer', async () => {
    const materialId = await aSubject();
    const asker = await newUser({ name: 'Asker' });
    const helper = await newUser({ name: 'Helper' });
    const teacher = await newUser({ name: 'Teacher', accountType: 'teacher' });
    const voter = await newUser({ name: 'Voter' });

    const short = await call('POST', '/posts', { token: asker.token, body: { kind: 'question', text: 'why?' } });
    expect(short.status).toBe(400);
    const unknown = await call('POST', '/posts', {
      token: asker.token,
      body: { kind: 'question', text: 'Why is the sky blue?', materialId: '00000000-0000-4000-8000-000000000000' },
    });
    expect(unknown.status).toBe(400);

    const q = await call<PostDto>('POST', '/posts', {
      token: asker.token,
      body: { kind: 'question', text: 'Why does a ball fall faster in air than a feather?', materialId },
    });
    expect(q.status).toBe(201);
    expect(q.body.kind).toBe('question');
    expect(q.body.material?.name).toBe('Physics');
    expect(q.body.solved).toBe(false);
    expect(q.body.canAccept).toBe(true);

    const open = await call<Page<PostDto>>('GET', `/posts?unanswered=true&materialId=${materialId}`, { token: helper.token });
    expect(open.body.items.map((p) => p.id)).toContain(q.body.id);
    expect(open.body.items.every((p) => p.kind === 'question' && !p.solved)).toBe(true);
    // Only the asker (or a moderator) may choose the best answer.
    expect((await call<PostDto>('GET', `/posts/${q.body.id}`, { token: helper.token })).body.canAccept).toBe(false);

    const a1 = await call<CommentDto>('POST', `/posts/${q.body.id}/comments`, {
      token: helper.token,
      body: { text: 'Air resistance slows the feather much more.' },
    });
    const a2 = await call<CommentDto>('POST', `/posts/${q.body.id}/comments`, {
      token: teacher.token,
      body: { text: 'In a vacuum they fall together (Galileo).' },
    });
    expect(a1.body.votes).toBe(0);

    // Helpful votes: idempotent, not on your own answer.
    expect((await call('PUT', `/posts/${q.body.id}/comments/${a1.body.id}/vote`, { token: helper.token, body: { on: true } })).status).toBe(400);
    for (let i = 0; i < 2; i++) {
      const v = await call<{ votes: number }>('PUT', `/posts/${q.body.id}/comments/${a1.body.id}/vote`, { token: voter.token, body: { on: true } });
      expect(v.body.votes).toBe(1);
    }
    let list = await call<{ items: CommentDto[] }>('GET', `/posts/${q.body.id}/comments`, { token: voter.token });
    expect(list.body.items[0]!.id).toBe(a1.body.id);
    expect(list.body.items[0]!.myVote).toBe(true);

    // Not the asker → forbidden; the asker picks the teacher's answer, which moves to the top.
    expect((await call('POST', `/posts/${q.body.id}/accept`, { token: helper.token, body: { commentId: a1.body.id } })).status).toBe(403);
    const before = (await call<Me>('GET', '/me', { token: teacher.token })).body.xp;
    const acc = await call<{ solved: boolean }>('POST', `/posts/${q.body.id}/accept`, { token: asker.token, body: { commentId: a2.body.id } });
    expect(acc.body.solved).toBe(true);
    const after = (await call<Me>('GET', '/me', { token: teacher.token })).body.xp;
    expect(after - before).toBe(15);
    list = await call<{ items: CommentDto[] }>('GET', `/posts/${q.body.id}/comments`, { token: voter.token });
    expect(list.body.items[0]!.id).toBe(a2.body.id);

    // Re-accepting the same answer does not pay twice; solved questions leave the unanswered list.
    await call('POST', `/posts/${q.body.id}/accept`, { token: asker.token, body: { commentId: null } });
    await call('POST', `/posts/${q.body.id}/accept`, { token: asker.token, body: { commentId: a2.body.id } });
    expect((await call<Me>('GET', '/me', { token: teacher.token })).body.xp).toBe(after);
    const solvedList = await call<Page<PostDto>>('GET', `/posts?unanswered=true&materialId=${materialId}`, { token: helper.token });
    expect(solvedList.body.items.map((p) => p.id)).not.toContain(q.body.id);

    // Deleting the best answer re-opens the question.
    await call('DELETE', `/posts/${q.body.id}/comments/${a2.body.id}`, { token: teacher.token });
    expect((await call<PostDto>('GET', `/posts/${q.body.id}`, { token: asker.token })).body.solved).toBe(false);

    // Discussions cannot have a best answer.
    const d = await call<PostDto>('POST', '/posts', { token: asker.token, body: { text: 'Shared my summary of chapter 3' } });
    expect(d.body.kind).toBe('discussion');
    expect((await call('POST', `/posts/${d.body.id}/accept`, { token: asker.token, body: { commentId: null } })).status).toBe(400);
  });
});

describe('pronunciation lab', () => {
  it('re-scores attempts on the server, awards capped XP for good ones, and reports weak words', async () => {
    const u = await newUser({ name: 'Speaker' });
    const before = (await call<Me>('GET', '/me', { token: u.token })).body.xp;
    // A forged perfect client score is ignored: the server compares the phrase with what was heard.
    const bad = await call<{ score: number; xpEarned: number; words: { word: string; ok: boolean }[] }>('POST', '/practice/pronunciation', {
      token: u.token,
      body: { language: 'en', phrase: 'The cell is the basic unit of life', heard: 'the sell is unit', score: 100 },
    });
    expect(bad.status).toBe(200);
    expect(bad.body.score).toBeLessThan(70);
    expect(bad.body.xpEarned).toBe(0);
    expect(bad.body.words.find((w) => w.word === 'basic')?.ok).toBe(false);

    const good = await call<{ score: number; xpEarned: number }>('POST', '/practice/pronunciation', {
      token: u.token,
      body: { language: 'ar', phrase: 'صباح الخير يا أستاذ', heard: 'صباح الخير يا استاذ' },
    });
    expect(good.body.score).toBe(100);
    expect(good.body.xpEarned).toBe(2);

    // Daily cap: 30 XP at most.
    let total = 2;
    for (let i = 0; i < 20; i++) {
      const r = await call<{ xpEarned: number }>('POST', '/practice/pronunciation', {
        token: u.token,
        body: { language: 'en', phrase: 'Thank you', heard: 'thank you' },
      });
      total += r.body.xpEarned;
    }
    expect(total).toBe(30);
    expect((await call<Me>('GET', '/me', { token: u.token })).body.xp - before).toBe(30);

    const stats = await call<{ today: { attempts: number; xp: number }; weakWords: { word: string }[] }>('GET', '/practice/pronunciation/stats', {
      token: u.token,
    });
    expect(stats.body.today.attempts).toBe(22);
    expect(stats.body.today.xp).toBe(30);
    expect(stats.body.weakWords.map((w) => w.word)).toContain('basic');

    expect((await call('POST', '/practice/pronunciation', { token: u.token, body: { language: 'de', phrase: 'Hallo', heard: 'hallo' } })).status).toBe(400);
  });
});

describe('teacher voice', () => {
  // An "M4A " ftyp box is enough for the server's magic-byte sniffing to accept it as audio/mp4.
  const M4A = new Uint8Array([0, 0, 0, 24, 0x66, 0x74, 0x79, 0x70, 0x4d, 0x34, 0x41, 0x20, 0, 0, 2, 0, 0x69, 0x73, 0x6f, 0x6d, 0, 0, 0, 0, 1, 2, 3, 4]);
  async function voice(token: string, purpose: string) {
    const form = new FormData();
    form.set('file', new Blob([M4A], { type: 'audio/mp4' }), 'voice.m4a');
    form.set('purpose', purpose);
    const res = await call<{ url: string; mime: string; size: number }>('POST', '/uploads', { token, form });
    expect(res.status).toBe(201);
    expect(res.body.mime).toBe('audio/mp4');
    return { url: res.body.url, name: 'Voice note', mime: res.body.mime, size: res.body.size, kind: 'audio' as const };
  }

  it('answers by voice, announces and gives spoken feedback', async () => {
    const teacher = await newUser({ name: 'Voice teacher', accountType: 'teacher' });
    const student = await newUser({ name: 'Voice student' });
    const q = await call<PostDto>('POST', '/posts', { token: student.token, body: { kind: 'question', text: 'How do I pronounce photosynthesis?' } });
    const clip = await voice(teacher.token, 'voice');
    expect((await call('POST', `/posts/${q.body.id}/comments`, { token: student.token, body: { audio: clip } })).status).toBe(400);
    expect((await call('POST', `/posts/${q.body.id}/comments`, { token: teacher.token, body: {} })).status).toBe(400);
    const answer = await call<CommentDto>('POST', `/posts/${q.body.id}/comments`, { token: teacher.token, body: { audio: clip } });
    expect(answer.status).toBe(201);
    expect(answer.body.audio?.kind).toBe('audio');
    const list = await call<Page<CommentDto>>('GET', `/posts/${q.body.id}/comments`, { token: student.token });
    expect(list.body.items[0]!.audio?.url).toBe(clip.url);

    const course = await call<{ id: string; joinCode: string }>('POST', '/school/courses', { token: teacher.token, body: { title: 'Biology voice' } });
    expect((await call('POST', '/school/join', { token: student.token, body: { code: course.body.joinCode } })).status).toBe(200);
    const ann = await call('POST', `/school/courses/${course.body.id}/announcements`, {
      token: teacher.token,
      body: { attachments: [await voice(teacher.token, 'course')] },
    });
    expect(ann.status).toBe(201);
    const a = await call<{ id: string }>('POST', `/school/courses/${course.body.id}/assignments`, {
      token: teacher.token,
      body: { title: 'Explain osmosis', points: 10, state: 'published', attachments: [await voice(teacher.token, 'course')] },
    });
    const sub = await call<{ id: string }>('POST', `/school/assignments/${a.body.id}/submit`, {
      token: student.token,
      body: { text: 'Water moves across a membrane' },
    });
    const spoken = await voice(teacher.token, 'assignment');
    const graded = await call<{ feedbackAudio: { url: string } | null }>('POST', `/school/submissions/${sub.body.id}/grade`, {
      token: teacher.token,
      body: { grade: 9, feedback: 'Nice', feedbackAudio: spoken },
    });
    expect(graded.status).toBe(200);
    const mine = await call<{ mySubmission: { feedbackAudio: { url: string } | null } }>('GET', `/school/assignments/${a.body.id}`, { token: student.token });
    // Private recordings come back as signed links.
    expect(mine.body.mySubmission.feedbackAudio?.url).toMatch(/sig=/);
  });
});
