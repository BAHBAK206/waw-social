import { execFileSync } from 'node:child_process';
import { mkdtempSync, readFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { describe, expect, it } from 'vitest';
import type { CaptionTrackDto, Page, TeacherAiResultDto, UploadResultDto, VideoDto } from '@qubedu/shared';
import { call, newUser } from './helpers';

const VTT = `WEBVTT

00:00:00.000 --> 00:00:04.000
Photosynthesis turns light into glucose.

00:00:04.000 --> 00:00:09.000
Chlorophyll in the chloroplast absorbs sunlight.
`;

async function lesson(token: string) {
  const dir = mkdtempSync(path.join(tmpdir(), 'qb-cap-'));
  const file = path.join(dir, 'l.mp4');
  execFileSync('ffmpeg', [
    '-y',
    '-loglevel',
    'error',
    '-f',
    'lavfi',
    '-i',
    'testsrc=size=320x240:rate=10:duration=2',
    '-f',
    'lavfi',
    '-i',
    'sine=frequency=300:duration=2',
    '-c:v',
    'libx264',
    '-pix_fmt',
    'yuv420p',
    '-c:a',
    'aac',
    '-shortest',
    file,
  ]);
  const form = new FormData();
  form.set('file', new File([readFileSync(file)], 'l.mp4', { type: 'video/mp4' }));
  form.set('purpose', 'video');
  const up = await call<UploadResultDto>('POST', '/uploads', { token, form });
  const v = await call<VideoDto>('POST', '/videos', {
    token,
    body: { title: 'Plants and light', videoUrl: up.body.url, durationSec: 9, description: 'How plants feed.' },
  });
  expect(v.status).toBe(201);
  return v.body;
}

describe('captions and transcript', () => {
  it('teachers upload captions, students read them as VTT, search finds lessons by what is said', async () => {
    const teacher = await newUser({ accountType: 'teacher' });
    const student = await newUser();
    const v = await lesson(teacher.token);

    expect((await call('PUT', `/videos/${v.id}/captions/en`, { token: student.token, body: { content: VTT } })).status).toBe(403);
    expect((await call('PUT', `/videos/${v.id}/captions/en`, { token: teacher.token, body: { content: 'nothing timed here' } })).status).toBe(400);
    const put = await call<CaptionTrackDto>('PUT', `/videos/${v.id}/captions/en`, { token: teacher.token, body: { content: VTT } });
    expect(put.body.cues).toHaveLength(2);
    expect(put.body.source).toBe('upload');

    const list = await call<{ items: CaptionTrackDto[] }>('GET', `/videos/${v.id}/captions`, { token: student.token });
    expect(list.body.items.map((t) => t.language)).toEqual(['en']);
    const vtt = await call<string>('GET', `/videos/${v.id}/captions/en.vtt`, { token: student.token });
    expect(vtt.headers.get('content-type')).toContain('text/vtt');
    expect(vtt.body).toContain('00:00:04.000 --> 00:00:09.000');

    const found = await call<Page<VideoDto>>('GET', `/videos?q=${encodeURIComponent('chloroplast sunlight')}`, { token: student.token });
    expect(found.body.items.map((x) => x.id)).toContain(v.id);

    const tr = await call<CaptionTrackDto>('POST', `/videos/${v.id}/captions/en/translate`, { token: teacher.token, body: { to: 'ar' } });
    expect(tr.body.source).toBe('translated');
    expect(tr.body.cues[0]!.text).toBe('[ar] Photosynthesis turns light into glucose.');
    expect(tr.body.cues[1]!.start).toBe(4);

    const auto = await call<CaptionTrackDto>('POST', `/videos/${v.id}/captions-auto`, { token: teacher.token, body: { language: 'fr' } });
    expect(auto.status).toBe(200);
    expect(auto.body.source).toBe('auto');

    expect((await call('DELETE', `/videos/${v.id}/captions/fr`, { token: teacher.token })).status).toBe(200);
    expect((await call<{ items: CaptionTrackDto[] }>('GET', `/videos/${v.id}/captions`, { token: student.token })).body.items).toHaveLength(2);
  });
});

describe('teacher AI tools', () => {
  it('drafts a quiz, summary, chapters and ideas from a lesson; students cannot use them', async () => {
    const teacher = await newUser({ accountType: 'teacher' });
    const student = await newUser();
    const v = await lesson(teacher.token);
    await call('PUT', `/videos/${v.id}/captions/en`, { token: teacher.token, body: { content: VTT } });

    expect((await call('POST', '/teacher/ai', { token: student.token, body: { task: 'quiz', videoId: v.id } })).status).toBe(403);

    const quiz = await call<TeacherAiResultDto>('POST', '/teacher/ai', {
      token: teacher.token,
      body: { task: 'quiz', videoId: v.id, count: 3, language: 'ar' },
    });
    expect(quiz.status).toBe(200);
    expect(quiz.body.questions).toHaveLength(3);
    // True/false options are written in the teacher's language, ready for the quiz editor.
    const tf = quiz.body.questions!.find((q) => q.type === 'tf')!;
    expect(tf.options).toEqual(['صح', 'خطأ']);
    expect(quiz.body.questions!.every((q) => q.points === 1 && q.imageUrl === null)).toBe(true);

    const chapters = await call<TeacherAiResultDto>('POST', '/teacher/ai', { token: teacher.token, body: { task: 'chapters', videoId: v.id, language: 'en' } });
    expect(chapters.body.chapters![0]!.at).toBe(0);

    const summary = await call<TeacherAiResultDto>('POST', '/teacher/ai', {
      token: teacher.token,
      body: { task: 'summary', text: 'Photosynthesis is how plants make glucose. '.repeat(5), language: 'en' },
    });
    expect(summary.body.summary!.length).toBeGreaterThan(0);

    const short = await call<{ error: { code: string } }>('POST', '/teacher/ai', { token: teacher.token, body: { task: 'ideas', text: 'too short' } });
    expect(short.body.error.code).toBe('source_too_short');
  });
});
