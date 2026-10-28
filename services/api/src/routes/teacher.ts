import { createTranslator } from '@qubedu/i18n';
import { and, eq } from 'drizzle-orm';
import { Hono } from 'hono';
import { hasPermission, teacherAiSchema, type QuizEditorDto, type TeacherAiResultDto } from '@qubedu/shared';
import { uploads, videoCaptions } from '../db/schema';
import type { AppEnv, AuthUser, Deps } from '../lib/context';
import { AppError, badRequest, forbidden } from '../lib/errors';
import { body, requireUser } from '../lib/http';
import { checkRate } from '../middleware';
import { consumeQuota } from './ai';
import { loadVideo } from './videos';

const DOC_MIME = /^(application\/pdf|text\/plain|application\/vnd\.openxmlformats-officedocument\.(wordprocessingml|presentationml)\.|application\/msword)/;

function isTeacher(u: AuthUser) {
  return u.accountType === 'teacher' || hasPermission(u.role, u.permissions, 'content.manage');
}

/** Lesson text: title, description and the captions in the requested language (or any language). */
async function lessonSource(deps: Deps, viewer: AuthUser, videoId: string, language: string) {
  const video = await loadVideo(deps, viewer, videoId);
  const tracks = await deps.db.select().from(videoCaptions).where(eq(videoCaptions.videoId, video.id));
  const track = tracks.find((t) => t.language === language) ?? tracks[0];
  const cues = track?.cues ?? [];
  const text = [video.title, video.description, cues.map((c) => c.text).join(' ')].filter(Boolean).join('\n\n');
  return { text, cues };
}

/** Text of a document the teacher uploaded (PDF, Word, PowerPoint, plain text). */
async function documentSource(deps: Deps, viewer: AuthUser, url: string) {
  const key = /\/files\/((?:public|private)\/[^?#]+)/.exec(url)?.[1];
  if (!key) throw badRequest('invalid_media_url');
  const [row] = await deps.db
    .select({ mime: uploads.mime, name: uploads.name })
    .from(uploads)
    .where(and(eq(uploads.key, key), eq(uploads.ownerId, viewer.id)));
  if (!row || !DOC_MIME.test(row.mime)) throw badRequest('invalid_media_url');
  const file = await deps.storage.get(key);
  if (!file) throw badRequest('invalid_media_url');
  const extracted = await deps.ai.extract({ filename: row.name ?? 'document', mime: row.mime, data: file.data });
  return extracted.text;
}

export const teacherRoutes = new Hono<AppEnv>().post('/ai', async (c) => {
  const viewer = requireUser(c);
  if (!isTeacher(viewer)) throw forbidden('teachers_only');
  await checkRate(c, { bucket: 'teacher-ai', limit: 30, windowSec: 3600, by: 'user' });
  const deps = c.get('deps');
  const input = await body(c, teacherAiSchema);
  let text = input.text?.trim() ?? '';
  let cues: { start: number; end: number; text: string }[] = [];
  if (input.videoId) {
    const src = await lessonSource(deps, viewer, input.videoId, input.language);
    text = [src.text, text].filter(Boolean).join('\n\n');
    cues = src.cues;
  }
  if (input.fileUrl) text = [await documentSource(deps, viewer, input.fileUrl), text].filter(Boolean).join('\n\n');
  if (input.task === 'chapters' && !cues.length) throw new AppError(422, 'captions_required');
  if (input.task !== 'chapters' && text.length < 80) throw new AppError(422, 'source_too_short');
  await consumeQuota(deps, viewer);

  const res = await deps.ai.teacher({ task: input.task, text: text.slice(0, 60_000), cues, count: input.count, types: input.types, language: input.language });
  const out: TeacherAiResultDto = { provider: res.provider };
  if (input.task === 'quiz') {
    const tr = createTranslator(input.language);
    const raw =
      (res.questions as { type: 'mc' | 'tf' | 'short'; prompt: string; options: string[]; answer: number | string[]; explanation?: string | null }[]) ?? [];
    out.questions = raw.map((q): QuizEditorDto['questions'][number] => ({
      type: q.type,
      prompt: q.prompt.slice(0, 1000),
      imageUrl: null,
      options: q.type === 'tf' ? [tr.t('quiz.editor.true'), tr.t('quiz.editor.false')] : q.options.map((o) => o.slice(0, 300)),
      answer: q.answer,
      explanation: q.explanation?.slice(0, 1000) ?? null,
      topic: null,
      points: 1,
    }));
    if (!out.questions.length) throw new AppError(422, 'source_too_short');
  }
  if (input.task === 'summary') {
    out.summary = (res.summary as string[]) ?? [];
    out.keyPoints = (res.keyPoints as string[]) ?? [];
  }
  if (input.task === 'chapters') out.chapters = (res.chapters as { at: number; title: string }[]) ?? [];
  if (input.task === 'ideas') out.ideas = (res.ideas as string[]) ?? [];
  return c.json(out);
});
