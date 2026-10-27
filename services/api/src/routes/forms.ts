import { and, count, desc, eq, isNull, sql } from 'drizzle-orm';
import { Hono } from 'hono';
import {
  formInputSchema,
  formResponseSchema,
  formSettingsSchema,
  paginationSchema,
  randomCode,
  type FormAnalyticsDto,
  type FormDto,
  type FormQuestion,
  type FormResponseDto,
  type FormSettings,
} from '@qubedu/shared';
import { formResponses, forms, users } from '../db/schema';
import type { AppEnv, AuthUser, Deps } from '../lib/context';
import { decodeCursor, pageOf } from '../lib/cursor';
import { badRequest, conflict, forbidden, notFound, unauthorized } from '../lib/errors';
import { body, param, query, requireUser } from '../lib/http';
import { pickSummary, toSummary } from '../lib/mappers';
import { checkRate } from '../middleware';

const ownerCols = {
  ownerId: users.id,
  ownerDisplayName: users.displayName,
  ownerUsername: users.username,
  ownerAvatarUrl: users.avatarUrl,
  ownerAccountType: users.accountType,
  ownerLevel: users.level,
  ownerXp: users.xp,
  ownerBadge: users.badge,
};

type FormRow = typeof forms.$inferSelect & Record<string, unknown>;
type Answer = string | string[] | number;

async function loadForm(deps: Deps, where: ReturnType<typeof eq>) {
  const [row] = await deps.db
    .select({ f: forms, ...ownerCols })
    .from(forms)
    .innerJoin(users, eq(users.id, forms.ownerId))
    .where(and(where, isNull(forms.deletedAt)));
  if (!row) throw notFound('form_not_found');
  return { ...row.f, ...row } as FormRow;
}

async function toDto(deps: Deps, viewer: AuthUser | null, f: FormRow, opts: { stripAnswers: boolean }): Promise<FormDto> {
  let already = false;
  if (viewer) {
    const [r] = await deps.db
      .select({ n: count() })
      .from(formResponses)
      .where(and(eq(formResponses.formId, f.id), eq(formResponses.respondentId, viewer.id)));
    already = (r?.n ?? 0) > 0;
  }
  const settings = formSettingsSchema.parse(f.settings ?? {});
  const questions = (f.questions as FormQuestion[]).map((q) =>
    opts.stripAnswers ? { ...q, correct: undefined, points: settings.quizMode ? q.points : undefined } : q,
  );
  return {
    id: f.id,
    slug: f.slug,
    title: f.title,
    description: f.description,
    settings,
    questions,
    published: f.published,
    owner: toSummary(pickSummary('owner', f)),
    responseCount: f.responseCount,
    createdAt: f.createdAt.getTime(),
    updatedAt: f.updatedAt.getTime(),
    isOwner: viewer?.id === f.ownerId,
    alreadyResponded: already,
  };
}

/** Validates a response against the question definitions; returns cleaned answers and quiz score. */
export function validateResponse(questions: FormQuestion[], settings: FormSettings, answers: Record<string, Answer>) {
  const clean: Record<string, Answer> = {};
  const errors: { id: string; code: string }[] = [];
  let score = 0;
  for (const q of questions) {
    if (q.type === 'section') continue;
    const v = answers[q.id];
    const empty = v === undefined || v === '' || (Array.isArray(v) && v.length === 0);
    if (empty) {
      if (q.required) errors.push({ id: q.id, code: 'required' });
      continue;
    }
    switch (q.type) {
      case 'single':
      case 'dropdown':
        if (typeof v !== 'string' || !q.options.includes(v)) errors.push({ id: q.id, code: 'invalid_option' });
        else clean[q.id] = v;
        break;
      case 'multiple':
        if (!Array.isArray(v) || v.some((x) => !q.options.includes(x))) errors.push({ id: q.id, code: 'invalid_option' });
        else clean[q.id] = [...new Set(v)];
        break;
      case 'scale':
      case 'rating':
      case 'number': {
        const n = typeof v === 'number' ? v : Number(v);
        const min = q.min ?? (q.type === 'number' ? -1e12 : 1);
        const max = q.max ?? (q.type === 'number' ? 1e12 : q.type === 'rating' ? 5 : 10);
        if (!Number.isFinite(n) || n < min || n > max) errors.push({ id: q.id, code: 'out_of_range' });
        else clean[q.id] = n;
        break;
      }
      case 'email':
        if (typeof v !== 'string' || !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(v)) errors.push({ id: q.id, code: 'invalid_email' });
        else clean[q.id] = v.trim();
        break;
      case 'date':
        if (typeof v !== 'string' || !/^\d{4}-\d{2}-\d{2}$/.test(v)) errors.push({ id: q.id, code: 'invalid_date' });
        else clean[q.id] = v;
        break;
      case 'time':
        if (typeof v !== 'string' || !/^\d{2}:\d{2}$/.test(v)) errors.push({ id: q.id, code: 'invalid_time' });
        else clean[q.id] = v;
        break;
      default:
        if (typeof v !== 'string') errors.push({ id: q.id, code: 'invalid_text' });
        else clean[q.id] = v.slice(0, q.type === 'short' ? 500 : 5000);
    }
    if (settings.quizMode && q.correct?.length && clean[q.id] !== undefined) {
      const given = Array.isArray(clean[q.id]) ? (clean[q.id] as string[]) : [String(clean[q.id])];
      const ok = given.length === q.correct.length && given.every((g) => q.correct!.map((c) => c.trim().toLowerCase()).includes(g.trim().toLowerCase()));
      if (ok) score += q.points ?? 1;
    }
  }
  return { clean, errors, score: settings.quizMode ? score : null };
}

function csvCell(v: unknown): string {
  const s = Array.isArray(v) ? v.join('; ') : v === null || v === undefined ? '' : String(v);
  const safe = /^[=+\-@\t\r]/.test(s) ? `'${s}` : s;
  return /[",\n\r]/.test(safe) ? `"${safe.replace(/"/g, '""')}"` : safe;
}

export const formRoutes = new Hono<AppEnv>()
  .get('/', async (c) => {
    const viewer = requireUser(c);
    const deps = c.get('deps');
    const rows = await deps.db
      .select({ f: forms, ...ownerCols })
      .from(forms)
      .innerJoin(users, eq(users.id, forms.ownerId))
      .where(and(eq(forms.ownerId, viewer.id), isNull(forms.deletedAt)))
      .orderBy(desc(forms.updatedAt))
      .limit(200);
    return c.json({ items: await Promise.all(rows.map((r) => toDto(deps, viewer, { ...r.f, ...r } as FormRow, { stripAnswers: false }))) });
  })
  .post('/', async (c) => {
    const viewer = requireUser(c);
    await checkRate(c, { bucket: 'form-create', limit: 30, windowSec: 3600, by: 'user' });
    const deps = c.get('deps');
    const input = await body(c, formInputSchema);
    const ids = new Set(input.questions.map((q) => q.id));
    if (ids.size !== input.questions.length) throw badRequest('duplicate_question_ids');
    const [row] = await deps.db
      .insert(forms)
      .values({
        ownerId: viewer.id,
        slug: randomCode(10),
        title: input.title,
        description: input.description,
        settings: input.settings,
        questions: input.questions,
        published: input.published,
      })
      .returning({ id: forms.id });
    return c.json(await toDto(deps, viewer, await loadForm(deps, eq(forms.id, row!.id)), { stripAnswers: false }), 201);
  })
  .get('/public/:slug', async (c) => {
    const viewer = c.get('user');
    const deps = c.get('deps');
    const f = await loadForm(deps, eq(forms.slug, c.req.param('slug')));
    const isOwner = viewer?.id === f.ownerId;
    if (!f.published && !isOwner) throw notFound('form_not_found');
    const settings = formSettingsSchema.parse(f.settings ?? {});
    if (settings.requireSignIn && !viewer) throw unauthorized('sign_in_required');
    return c.json(await toDto(deps, viewer, f, { stripAnswers: !isOwner }));
  })
  .post('/public/:slug/responses', async (c) => {
    const viewer = c.get('user');
    await checkRate(c, { bucket: 'form-response', limit: 20, windowSec: 600, by: viewer ? 'user' : 'ip' });
    const deps = c.get('deps');
    const f = await loadForm(deps, eq(forms.slug, c.req.param('slug')));
    if (!f.published) throw notFound('form_not_found');
    const settings = formSettingsSchema.parse(f.settings ?? {});
    if (!settings.acceptingResponses) throw forbidden('form_closed');
    if (settings.deadline && settings.deadline < Date.now()) throw forbidden('form_deadline_passed');
    if ((settings.requireSignIn || settings.oneResponsePerUser) && !viewer) throw unauthorized('sign_in_required');
    const input = await body(c, formResponseSchema);
    if (settings.collectEmail && !viewer && !input.email) throw badRequest('email_required');
    const { clean, errors, score } = validateResponse(f.questions as FormQuestion[], settings, input.answers);
    if (errors.length) throw badRequest('invalid_answers', errors);
    const id = await deps.db.transaction(async (tx) => {
      if (settings.oneResponsePerUser && viewer) {
        await tx.execute(sql`select pg_advisory_xact_lock(hashtext(${`${f.id}:${viewer.id}`}))`);
        const [prev] = await tx
          .select({ n: count() })
          .from(formResponses)
          .where(and(eq(formResponses.formId, f.id), eq(formResponses.respondentId, viewer.id)));
        if ((prev?.n ?? 0) > 0) throw conflict('already_responded');
      }
      const [row] = await tx
        .insert(formResponses)
        .values({ formId: f.id, respondentId: viewer?.id ?? null, email: settings.collectEmail ? (input.email ?? null) : null, answers: clean, score })
        .returning({ id: formResponses.id });
      await tx
        .update(forms)
        .set({ responseCount: sql`${forms.responseCount} + 1` })
        .where(eq(forms.id, f.id));
      return row!.id;
    });
    return c.json({ id, score, confirmationMessage: settings.confirmationMessage }, 201);
  })
  .get('/:id', async (c) => {
    const viewer = requireUser(c);
    const deps = c.get('deps');
    const f = await loadForm(deps, eq(forms.id, param(c, 'id')));
    if (f.ownerId !== viewer.id) throw notFound('form_not_found');
    return c.json(await toDto(deps, viewer, f, { stripAnswers: false }));
  })
  .put('/:id', async (c) => {
    const viewer = requireUser(c);
    const deps = c.get('deps');
    const f = await loadForm(deps, eq(forms.id, param(c, 'id')));
    if (f.ownerId !== viewer.id) throw notFound('form_not_found');
    const input = await body(c, formInputSchema);
    if (new Set(input.questions.map((q) => q.id)).size !== input.questions.length) throw badRequest('duplicate_question_ids');
    await deps.db
      .update(forms)
      .set({
        title: input.title,
        description: input.description,
        settings: input.settings,
        questions: input.questions,
        published: input.published,
        updatedAt: new Date(),
      })
      .where(eq(forms.id, f.id));
    return c.json(await toDto(deps, viewer, await loadForm(deps, eq(forms.id, f.id)), { stripAnswers: false }));
  })
  .post('/:id/duplicate', async (c) => {
    const viewer = requireUser(c);
    const deps = c.get('deps');
    const f = await loadForm(deps, eq(forms.id, param(c, 'id')));
    if (f.ownerId !== viewer.id) throw notFound('form_not_found');
    const [row] = await deps.db
      .insert(forms)
      .values({
        ownerId: viewer.id,
        slug: randomCode(10),
        title: `${f.title} (2)`.slice(0, 200),
        description: f.description,
        settings: f.settings,
        questions: f.questions,
        published: false,
      })
      .returning({ id: forms.id });
    return c.json(await toDto(deps, viewer, await loadForm(deps, eq(forms.id, row!.id)), { stripAnswers: false }), 201);
  })
  .delete('/:id', async (c) => {
    const viewer = requireUser(c);
    const deps = c.get('deps');
    const f = await loadForm(deps, eq(forms.id, param(c, 'id')));
    if (f.ownerId !== viewer.id) throw notFound('form_not_found');
    await deps.db.update(forms).set({ deletedAt: new Date() }).where(eq(forms.id, f.id));
    return c.json({ ok: true });
  })
  .get('/:id/responses', async (c) => {
    const viewer = requireUser(c);
    const deps = c.get('deps');
    const f = await loadForm(deps, eq(forms.id, param(c, 'id')));
    if (f.ownerId !== viewer.id) throw notFound('form_not_found');
    const q = query(c, paginationSchema);
    const cursor = decodeCursor(q.cursor);
    const rows = await deps.db
      .select({ r: formResponses, ...ownerCols })
      .from(formResponses)
      .leftJoin(users, eq(users.id, formResponses.respondentId))
      .where(
        and(
          eq(formResponses.formId, f.id),
          cursor ? sql`(${formResponses.createdAt}, ${formResponses.id}) < (to_timestamp(${cursor.t} / 1000.0), ${cursor.id})` : undefined,
        ),
      )
      .orderBy(desc(formResponses.createdAt), desc(formResponses.id))
      .limit(q.limit + 1);
    const page = pageOf(rows, q.limit, (r) => ({ t: r.r.createdAt, id: r.r.id }));
    const items: FormResponseDto[] = page.items.map((r) => ({
      id: r.r.id,
      respondent: r.ownerId ? toSummary(pickSummary('owner', r as unknown as Record<string, unknown>)) : null,
      email: r.r.email,
      answers: r.r.answers as FormResponseDto['answers'],
      score: r.r.score,
      createdAt: r.r.createdAt.getTime(),
    }));
    return c.json({ items, nextCursor: page.nextCursor });
  })
  .delete('/:id/responses/:responseId', async (c) => {
    const viewer = requireUser(c);
    const deps = c.get('deps');
    const f = await loadForm(deps, eq(forms.id, param(c, 'id')));
    if (f.ownerId !== viewer.id) throw notFound('form_not_found');
    const removed = await deps.db
      .delete(formResponses)
      .where(and(eq(formResponses.id, param(c, 'responseId')), eq(formResponses.formId, f.id)))
      .returning();
    if (removed.length)
      await deps.db
        .update(forms)
        .set({ responseCount: sql`greatest(${forms.responseCount} - 1, 0)` })
        .where(eq(forms.id, f.id));
    return c.json({ ok: true });
  })
  .get('/:id/analytics', async (c) => {
    const viewer = requireUser(c);
    const deps = c.get('deps');
    const f = await loadForm(deps, eq(forms.id, param(c, 'id')));
    if (f.ownerId !== viewer.id) throw notFound('form_not_found');
    const rows = await deps.db.select({ answers: formResponses.answers }).from(formResponses).where(eq(formResponses.formId, f.id)).limit(20000);
    const dto: FormAnalyticsDto = {
      total: rows.length,
      questions: (f.questions as FormQuestion[])
        .filter((q) => q.type !== 'section')
        .map((q) => {
          const counts: Record<string, number> = {};
          const nums: number[] = [];
          const texts: string[] = [];
          for (const r of rows) {
            const v = (r.answers as Record<string, Answer>)[q.id];
            if (v === undefined) continue;
            if (Array.isArray(v)) for (const x of v) counts[x] = (counts[x] ?? 0) + 1;
            else if (typeof v === 'number') {
              nums.push(v);
              counts[String(v)] = (counts[String(v)] ?? 0) + 1;
            } else if (['single', 'dropdown'].includes(q.type)) counts[v] = (counts[v] ?? 0) + 1;
            else if (texts.length < 50) texts.push(v);
          }
          return {
            id: q.id,
            title: q.title,
            type: q.type,
            counts,
            average: nums.length ? Math.round((nums.reduce((a, b) => a + b, 0) / nums.length) * 100) / 100 : null,
            textAnswers: texts,
          };
        }),
    };
    return c.json(dto);
  })
  .get('/:id/export.csv', async (c) => {
    const viewer = requireUser(c);
    const deps = c.get('deps');
    const f = await loadForm(deps, eq(forms.id, param(c, 'id')));
    if (f.ownerId !== viewer.id) throw notFound('form_not_found');
    const qs = (f.questions as FormQuestion[]).filter((q) => q.type !== 'section');
    const rows = await deps.db
      .select({ r: formResponses, name: users.displayName })
      .from(formResponses)
      .leftJoin(users, eq(users.id, formResponses.respondentId))
      .where(eq(formResponses.formId, f.id))
      .orderBy(formResponses.createdAt)
      .limit(50000);
    const header = ['submitted_at', 'respondent', 'email', ...qs.map((q) => q.title), 'score'];
    const lines = [header.map(csvCell).join(',')];
    for (const { r, name } of rows) {
      const a = r.answers as Record<string, Answer>;
      lines.push([r.createdAt.toISOString(), name ?? '', r.email ?? '', ...qs.map((q) => a[q.id]), r.score ?? ''].map(csvCell).join(','));
    }
    return new Response(`\uFEFF${lines.join('\r\n')}`, {
      headers: { 'Content-Type': 'text/csv; charset=utf-8', 'Content-Disposition': `attachment; filename="form-${f.slug}.csv"`, 'Cache-Control': 'no-store' },
    });
  });
