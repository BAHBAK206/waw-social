import { courseKnowledgeSchema, normalizeSearch, type CourseKnowledgeDto } from '@qubedu/shared';
import { and, desc, eq } from 'drizzle-orm';
import { Hono } from 'hono';
import { assistantKnowledge } from '../db/schema';
import type { AppEnv } from '../lib/context';
import { badRequest, notFound } from '../lib/errors';
import { body, param, requireUser } from '../lib/http';
import { requireRole, STAFF } from './school';

const MAX_PER_COURSE = 300;

function toDto(k: typeof assistantKnowledge.$inferSelect): CourseKnowledgeDto {
  return { id: k.id, question: k.question, answer: k.answer, link: k.link, createdAt: k.createdAt.getTime() };
}

const searchText = (k: { question: string; answer: string }) => normalizeSearch(`${k.question} ${k.answer.slice(0, 300)}`);

/**
 * Teachers feed the class assistant: questions and answers that only members of the class get.
 * Mounted at /school.
 */
export const courseKnowledgeRoutes = new Hono<AppEnv>()
  .get('/courses/:id/knowledge', async (c) => {
    const user = requireUser(c);
    const deps = c.get('deps');
    const courseId = param(c, 'id');
    await requireRole(deps, courseId, user, STAFF);
    const rows = await deps.db
      .select()
      .from(assistantKnowledge)
      .where(eq(assistantKnowledge.courseId, courseId))
      .orderBy(desc(assistantKnowledge.createdAt))
      .limit(MAX_PER_COURSE);
    return c.json({ items: rows.map(toDto) });
  })
  .post('/courses/:id/knowledge', async (c) => {
    const user = requireUser(c);
    const deps = c.get('deps');
    const courseId = param(c, 'id');
    await requireRole(deps, courseId, user, STAFF);
    const input = await body(c, courseKnowledgeSchema);
    const existing = await deps.db.$count(assistantKnowledge, eq(assistantKnowledge.courseId, courseId));
    if (existing >= MAX_PER_COURSE) throw badRequest('limit_reached');
    const [row] = await deps.db
      .insert(assistantKnowledge)
      .values({ ...input, link: input.link ?? null, courseId, createdBy: user.id, searchText: searchText(input) })
      .returning();
    return c.json(toDto(row!), 201);
  })
  .put('/courses/:id/knowledge/:kid', async (c) => {
    const user = requireUser(c);
    const deps = c.get('deps');
    const courseId = param(c, 'id');
    await requireRole(deps, courseId, user, STAFF);
    const input = await body(c, courseKnowledgeSchema);
    const [row] = await deps.db
      .update(assistantKnowledge)
      .set({ ...input, link: input.link ?? null, searchText: searchText(input) })
      .where(and(eq(assistantKnowledge.id, param(c, 'kid')), eq(assistantKnowledge.courseId, courseId)))
      .returning();
    if (!row) throw notFound();
    return c.json(toDto(row));
  })
  .delete('/courses/:id/knowledge/:kid', async (c) => {
    const user = requireUser(c);
    const deps = c.get('deps');
    const courseId = param(c, 'id');
    await requireRole(deps, courseId, user, STAFF);
    await deps.db.delete(assistantKnowledge).where(and(eq(assistantKnowledge.id, param(c, 'kid')), eq(assistantKnowledge.courseId, courseId)));
    return c.json({ ok: true });
  });
