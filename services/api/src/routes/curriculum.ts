import {
  CHILD_KIND,
  computeMastery,
  curriculumImportSchema,
  curriculumLinkSchema,
  curriculumNodeSchema,
  curriculumQuerySchema,
  hasPermission,
  nextObjectives,
  normalizeSearch,
  objectiveStatus,
  seededRandom,
  shuffleWith,
  type CurriculumImportNode,
  type CurriculumKind,
  type CurriculumNodeDto,
  type CurriculumResourceDto,
  type CurriculumSystem,
  type CurriculumTreeDto,
  type LearningPlanDto,
  type ObjectiveStatus,
} from '@qubedu/shared';
import { and, asc, desc, eq, gte, ilike, inArray, isNull, or, sql } from 'drizzle-orm';
import { Hono } from 'hono';
import { z } from 'zod';
import { courseMembers, curriculumLinks, curriculumNodes, libraryItems, objectiveSamples, quizAttempts, quizQuestions, quizzes, videos } from '../db/schema';
import type { AppEnv, AuthUser, Deps } from '../lib/context';
import { badRequest, forbidden, notFound } from '../lib/errors';
import { body, param, query, requireUser } from '../lib/http';
import { checkRate } from '../middleware';
import { notUsedByExam } from './quizzes';

type NodeRow = typeof curriculumNodes.$inferSelect;
const MAX_IMPORT_NODES = 2000;

function toDto(n: NodeRow): CurriculumNodeDto {
  return {
    id: n.id,
    parentId: n.parentId,
    kind: n.kind,
    title: n.title,
    code: n.code,
    description: n.description,
    system: n.system as CurriculumSystem,
    gradeLevel: n.gradeLevel,
    sort: n.sort,
  };
}

const canEditCurriculum = (u: AuthUser | null) => !!u && hasPermission(u.role, u.permissions, 'education.manage');

async function loadNode(deps: Deps, id: string) {
  const [n] = await deps.db.select().from(curriculumNodes).where(eq(curriculumNodes.id, id));
  if (!n) throw notFound('curriculum_not_found');
  return n;
}

/** The subject a node belongs to. */
async function subjectOf(deps: Deps, id: string): Promise<NodeRow> {
  let n = await loadNode(deps, id);
  for (let i = 0; i < 6 && n.parentId; i++) n = await loadNode(deps, n.parentId);
  if (n.kind !== 'subject') throw notFound('curriculum_not_found');
  return n;
}

/** A node and everything under it, in curriculum order (parents first, siblings by sort then title). */
async function subtree(deps: Deps, rootId: string): Promise<NodeRow[]> {
  const rows = await deps.db.execute<{ id: string }>(sql`
    with recursive down(id) as (
      select id from curriculum_nodes where id = ${rootId}::uuid
      union all
      select c.id from curriculum_nodes c join down on c.parent_id = down.id
    ) select id from down`);
  const ids = rows.map((r) => r.id);
  if (!ids.length) return [];
  const nodes = await deps.db.select().from(curriculumNodes).where(inArray(curriculumNodes.id, ids));
  const kids = new Map<string | null, NodeRow[]>();
  for (const n of nodes) kids.set(n.parentId, [...(kids.get(n.parentId) ?? []), n]);
  for (const list of kids.values()) list.sort((a, b) => a.sort - b.sort || a.title.localeCompare(b.title));
  const out: NodeRow[] = [];
  const walk = (n: NodeRow) => {
    out.push(n);
    for (const k of kids.get(n.id) ?? []) walk(k);
  };
  const root = nodes.find((n) => n.id === rootId);
  if (root) walk(root);
  return out;
}

/** Practice questions the user may see, tagged with one of these nodes (exam questions and private banks excluded). */
async function practiceQuestions(deps: Deps, userId: string, nodeIds: string[]) {
  if (!nodeIds.length) return [];
  return deps.db
    .select({ id: quizQuestions.id, objectiveId: quizQuestions.objectiveId })
    .from(quizQuestions)
    .innerJoin(quizzes, eq(quizzes.id, quizQuestions.quizId))
    .where(
      and(
        inArray(quizQuestions.objectiveId, nodeIds),
        isNull(quizzes.deletedAt),
        eq(quizzes.published, true),
        sql`${quizzes.kind} <> 'exam'`,
        notUsedByExam,
        or(
          isNull(quizzes.courseId),
          inArray(quizzes.courseId, deps.db.select({ id: courseMembers.courseId }).from(courseMembers).where(eq(courseMembers.userId, userId))),
        ),
      ),
    )
    .limit(5000);
}

/** Mastery per objective for one student (last year of results). */
async function objectiveMastery(deps: Deps, userId: string, objectiveIds: string[]) {
  const out = new Map<string, { mastery: number | null; evidence: number; status: ObjectiveStatus }>();
  if (!objectiveIds.length) return out;
  const rows = await deps.db
    .select()
    .from(objectiveSamples)
    .where(
      and(
        eq(objectiveSamples.userId, userId),
        inArray(objectiveSamples.objectiveId, objectiveIds),
        gte(objectiveSamples.createdAt, new Date(Date.now() - 365 * 86400_000)),
      ),
    )
    .orderBy(desc(objectiveSamples.createdAt))
    .limit(5000);
  const by = new Map<string, { pct: number; total: number; ts: number }[]>();
  for (const r of rows)
    by.set(r.objectiveId, [
      ...(by.get(r.objectiveId) ?? []),
      { pct: Math.round((r.correct / Math.max(1, r.total)) * 100), total: r.total, ts: r.createdAt.getTime() },
    ]);
  for (const id of objectiveIds) {
    const samples = by.get(id) ?? [];
    if (!samples.length) {
      out.set(id, { mastery: null, evidence: 0, status: 'new' });
      continue;
    }
    const m = computeMastery(id, id, null, samples);
    out.set(id, { mastery: m.mastery, evidence: m.evidenceQuestions, status: objectiveStatus(m.mastery, m.evidenceQuestions) });
  }
  return out;
}

/** Linked quizzes, lessons and library items per node (only what the viewer may open). */
async function resourcesFor(deps: Deps, nodeIds: string[]): Promise<Record<string, CurriculumResourceDto[]>> {
  const out: Record<string, CurriculumResourceDto[]> = {};
  if (!nodeIds.length) return out;
  const links = await deps.db.select().from(curriculumLinks).where(inArray(curriculumLinks.nodeId, nodeIds));
  const ids = (t: string) => links.filter((l) => l.targetType === t).map((l) => l.targetId);
  const [qs, vs, ls] = await Promise.all([
    ids('quiz').length
      ? deps.db
          .select({ id: quizzes.id, title: quizzes.title })
          .from(quizzes)
          .where(
            and(
              inArray(quizzes.id, ids('quiz')),
              isNull(quizzes.deletedAt),
              eq(quizzes.published, true),
              isNull(quizzes.courseId),
              sql`${quizzes.kind} <> 'bank'`,
            ),
          )
      : [],
    ids('video').length
      ? deps.db
          .select({ id: videos.id, title: videos.title })
          .from(videos)
          .where(and(inArray(videos.id, ids('video')), isNull(videos.deletedAt), eq(videos.visibility, 'public')))
      : [],
    ids('library').length
      ? deps.db
          .select({ id: libraryItems.id, title: libraryItems.title })
          .from(libraryItems)
          .where(and(inArray(libraryItems.id, ids('library')), isNull(libraryItems.deletedAt), eq(libraryItems.approved, true)))
      : [],
  ]);
  const titles = new Map<string, string>([
    ...qs.map((x) => [`quiz:${x.id}`, x.title] as const),
    ...vs.map((x) => [`video:${x.id}`, x.title] as const),
    ...ls.map((x) => [`library:${x.id}`, x.title] as const),
  ]);
  for (const l of links) {
    const title = titles.get(`${l.targetType}:${l.targetId}`);
    if (title) (out[l.nodeId] ??= []).push({ type: l.targetType, id: l.targetId, title });
  }
  return out;
}

/** Questions available under each node (a unit counts its lessons' and objectives' questions). */
function countUp(nodes: NodeRow[], questions: { objectiveId: string | null }[]): Record<string, number> {
  const direct = new Map<string, number>();
  for (const q of questions) if (q.objectiveId) direct.set(q.objectiveId, (direct.get(q.objectiveId) ?? 0) + 1);
  const total: Record<string, number> = {};
  for (const n of [...nodes].reverse()) {
    total[n.id] = (total[n.id] ?? 0) + (direct.get(n.id) ?? 0);
    if (n.parentId) total[n.parentId] = (total[n.parentId] ?? 0) + total[n.id]!;
  }
  return total;
}

/** A practice attempt from given question ids (graded like adaptive practice). */
async function practiceAttempt(deps: Deps, userId: string, ids: string[], placementSubjectId: string | null = null) {
  if (!ids.length) throw badRequest('no_practice_questions');
  const [a] = await deps.db
    .insert(quizAttempts)
    .values({
      quizId: null,
      userId,
      questionIds: ids,
      adaptive: true,
      placementSubjectId,
      expiresAt: new Date(Date.now() + ids.length * 90_000 + 60_000),
    })
    .returning({ id: quizAttempts.id });
  return a!.id;
}

async function canLink(deps: Deps, user: AuthUser, type: 'quiz' | 'video' | 'library', id: string) {
  if (canEditCurriculum(user)) return true;
  if (type === 'quiz') {
    const [q] = await deps.db.select({ by: quizzes.createdBy }).from(quizzes).where(eq(quizzes.id, id));
    return q?.by === user.id || hasPermission(user.role, user.permissions, 'quizzes.manage');
  }
  if (type === 'video') {
    const [v] = await deps.db.select({ by: videos.ownerId }).from(videos).where(eq(videos.id, id));
    return v?.by === user.id;
  }
  const [l] = await deps.db.select({ by: libraryItems.uploaderId }).from(libraryItems).where(eq(libraryItems.id, id));
  return l?.by === user.id || hasPermission(user.role, user.permissions, 'library.manage');
}

/** Nodes with their place in the curriculum ("Subject › Unit › Lesson"). */
async function withPaths(deps: Deps, rows: NodeRow[]) {
  const parents = new Map<string, NodeRow>();
  let pending = [...new Set(rows.map((r) => r.parentId).filter((x): x is string => !!x))];
  for (let depth = 0; depth < 4 && pending.length; depth++) {
    const ps = await deps.db.select().from(curriculumNodes).where(inArray(curriculumNodes.id, pending));
    for (const p of ps) parents.set(p.id, p);
    pending = ps.map((p) => p.parentId).filter((x): x is string => !!x && !parents.has(x));
  }
  const path = (n: NodeRow) => {
    const names: string[] = [];
    let p = n.parentId ? parents.get(n.parentId) : undefined;
    while (p) {
      names.unshift(p.code ? `${p.title} (${p.code})` : p.title);
      p = p.parentId ? parents.get(p.parentId) : undefined;
    }
    return names.join(' › ');
  };
  return rows.map((r) => ({ node: toDto(r), path: path(r) }));
}

export const curriculumRoutes = new Hono<AppEnv>()
  /** Subjects, filtered by curriculum system and school year. */
  .get('/', async (c) => {
    const deps = c.get('deps');
    const q = query(c, curriculumQuerySchema);
    const rows = await deps.db
      .select()
      .from(curriculumNodes)
      .where(
        and(
          eq(curriculumNodes.kind, 'subject'),
          q.system ? eq(curriculumNodes.system, q.system) : undefined,
          q.gradeLevel ? eq(curriculumNodes.gradeLevel, q.gradeLevel) : undefined,
          q.q ? ilike(curriculumNodes.searchText, `%${normalizeSearch(q.q)}%`) : undefined,
        ),
      )
      .orderBy(asc(curriculumNodes.gradeLevel), asc(curriculumNodes.sort), asc(curriculumNodes.title))
      .limit(300);
    c.header('Cache-Control', 'private, max-age=30');
    return c.json({ items: rows.map(toDto) });
  })
  /** Lessons and objectives matching a search, with their place in the curriculum (for pickers in editors). */
  .get('/search', async (c) => {
    requireUser(c);
    const deps = c.get('deps');
    const { q } = query(c, z.object({ q: z.string().trim().min(1).max(120) }));
    const rows = await deps.db
      .select()
      .from(curriculumNodes)
      .where(and(inArray(curriculumNodes.kind, ['unit', 'lesson', 'objective']), ilike(curriculumNodes.searchText, `%${normalizeSearch(q)}%`)))
      .limit(30);
    return c.json({ items: await withPaths(deps, rows) });
  })
  /** Names and places of given nodes (labels for pickers). */
  .get('/nodes', async (c) => {
    const deps = c.get('deps');
    const { ids } = query(c, z.object({ ids: z.string().max(2000) }));
    const list = [...new Set(ids.split(',').filter((x) => /^[0-9a-f-]{36}$/i.test(x)))].slice(0, 50);
    if (!list.length) return c.json({ items: [] });
    const rows = await deps.db.select().from(curriculumNodes).where(inArray(curriculumNodes.id, list));
    return c.json({ items: await withPaths(deps, rows) });
  })
  .post('/', async (c) => {
    const user = requireUser(c);
    if (!canEditCurriculum(user)) throw forbidden();
    const deps = c.get('deps');
    const input = await body(c, curriculumNodeSchema);
    let system = input.system;
    let gradeLevel = input.gradeLevel ?? null;
    if (input.kind === 'subject') {
      if (input.parentId) throw badRequest('subject_has_no_parent');
    } else {
      if (!input.parentId) throw badRequest('parent_required');
      const parent = await loadNode(deps, input.parentId);
      if (CHILD_KIND[parent.kind] !== input.kind) throw badRequest('wrong_kind');
      system = parent.system as CurriculumSystem;
      gradeLevel = parent.gradeLevel;
    }
    const [row] = await deps.db
      .insert(curriculumNodes)
      .values({
        ...input,
        parentId: input.parentId ?? null,
        code: input.code ?? null,
        description: input.description ?? null,
        system,
        gradeLevel,
        searchText: normalizeSearch(`${input.title} ${input.code ?? ''}`),
        createdBy: user.id,
      })
      .returning();
    return c.json(toDto(row!), 201);
  })
  /** Paste a whole subject: units → lessons → objectives. */
  .post('/import', async (c) => {
    const user = requireUser(c);
    if (!canEditCurriculum(user)) throw forbidden();
    await checkRate(c, { bucket: 'curriculum-import', limit: 20, windowSec: 3600, by: 'user' });
    const deps = c.get('deps');
    const input = await body(c, curriculumImportSchema);
    const kinds: CurriculumKind[] = ['subject', 'unit', 'lesson', 'objective'];
    let count = 0;
    const countNodes = (n: CurriculumImportNode, depth: number): void => {
      count += 1;
      if (depth >= 3 && n.children?.length) throw badRequest('too_deep');
      for (const ch of n.children ?? []) countNodes(ch, depth + 1);
    };
    countNodes(input.subject, 0);
    if (count > MAX_IMPORT_NODES) throw badRequest('too_many_nodes');
    const subjectId = await deps.db.transaction(async (tx) => {
      const insert = async (n: CurriculumImportNode, depth: number, parentId: string | null, sort: number): Promise<string> => {
        const [row] = await tx
          .insert(curriculumNodes)
          .values({
            parentId,
            kind: kinds[depth]!,
            title: n.title,
            code: n.code ?? null,
            description: n.description ?? null,
            system: input.system,
            gradeLevel: input.gradeLevel ?? null,
            sort,
            searchText: normalizeSearch(`${n.title} ${n.code ?? ''}`),
            createdBy: user.id,
          })
          .returning({ id: curriculumNodes.id });
        for (const [i, ch] of (n.children ?? []).entries()) await insert(ch, depth + 1, row!.id, i);
        return row!.id;
      };
      return insert(input.subject, 0, null, 0);
    });
    return c.json({ subjectId, nodes: count }, 201);
  })
  .put('/:id', async (c) => {
    const user = requireUser(c);
    if (!canEditCurriculum(user)) throw forbidden();
    const deps = c.get('deps');
    const node = await loadNode(deps, param(c, 'id'));
    const input = await body(
      c,
      curriculumNodeSchema.pick({ title: true, code: true, description: true, sort: true, gradeLevel: true, system: true }).partial(),
    );
    const [row] = await deps.db
      .update(curriculumNodes)
      .set({
        ...input,
        searchText: normalizeSearch(`${input.title ?? node.title} ${input.code ?? node.code ?? ''}`),
      })
      .where(eq(curriculumNodes.id, node.id))
      .returning();
    // Year and system belong to the whole subject.
    if (node.kind === 'subject' && (input.gradeLevel !== undefined || input.system))
      await deps.db.execute(sql`
        with recursive down(id) as (select id from curriculum_nodes where parent_id = ${node.id}::uuid
          union all select c.id from curriculum_nodes c join down on c.parent_id = down.id)
        update curriculum_nodes set grade_level = ${row!.gradeLevel}, system = ${row!.system} where id in (select id from down)`);
    return c.json(toDto(row!));
  })
  .delete('/:id', async (c) => {
    const user = requireUser(c);
    if (!canEditCurriculum(user)) throw forbidden();
    const deps = c.get('deps');
    await deps.db.delete(curriculumNodes).where(eq(curriculumNodes.id, param(c, 'id')));
    return c.json({ ok: true });
  })
  .post('/:id/links', async (c) => {
    const user = requireUser(c);
    const deps = c.get('deps');
    const node = await loadNode(deps, param(c, 'id'));
    const input = await body(c, curriculumLinkSchema);
    if (!(await canLink(deps, user, input.targetType, input.targetId))) throw forbidden();
    await deps.db
      .insert(curriculumLinks)
      .values({ nodeId: node.id, ...input, createdBy: user.id })
      .onConflictDoNothing();
    return c.json({ ok: true }, 201);
  })
  .delete('/:id/links/:type/:targetId', async (c) => {
    const user = requireUser(c);
    const deps = c.get('deps');
    const type = z.enum(['quiz', 'video', 'library']).parse(c.req.param('type'));
    const targetId = param(c, 'targetId');
    if (!(await canLink(deps, user, type, targetId))) throw forbidden();
    await deps.db
      .delete(curriculumLinks)
      .where(and(eq(curriculumLinks.nodeId, param(c, 'id')), eq(curriculumLinks.targetType, type), eq(curriculumLinks.targetId, targetId)));
    return c.json({ ok: true });
  })
  /** The whole subject with the viewer's mastery, linked resources and practice questions per node. */
  .get('/:id', async (c) => {
    const viewer = c.get('user');
    const deps = c.get('deps');
    const subject = await subjectOf(deps, param(c, 'id'));
    const nodes = await subtree(deps, subject.id);
    const objectives = nodes.filter((n) => n.kind === 'objective').map((n) => n.id);
    const [mastery, resources, questions] = await Promise.all([
      viewer ? objectiveMastery(deps, viewer.id, objectives) : Promise.resolve(new Map()),
      resourcesFor(
        deps,
        nodes.map((n) => n.id),
      ),
      viewer
        ? practiceQuestions(
            deps,
            viewer.id,
            nodes.map((n) => n.id),
          )
        : Promise.resolve([]),
    ]);
    const dto: CurriculumTreeDto = {
      subject: toDto(subject),
      nodes: nodes.filter((n) => n.id !== subject.id).map(toDto),
      mastery: Object.fromEntries(mastery),
      resources,
      questionCounts: countUp(nodes, questions),
      canEdit: canEditCurriculum(viewer),
    };
    return c.json(dto);
  })
  /** Ten practice questions on a node (an objective, a lesson or a whole unit), weakest objectives first. */
  .post('/:id/practice', async (c) => {
    const viewer = requireUser(c);
    await checkRate(c, { bucket: 'curriculum-practice', limit: 20, windowSec: 60, by: 'user' });
    const deps = c.get('deps');
    const node = await loadNode(deps, param(c, 'id'));
    const nodes = await subtree(deps, node.id);
    const pool = await practiceQuestions(
      deps,
      viewer.id,
      nodes.map((n) => n.id),
    );
    const mastery = await objectiveMastery(deps, viewer.id, [...new Set(pool.map((q) => q.objectiveId!))]);
    const rand = seededRandom(`${viewer.id}:${Date.now()}`);
    const weight = (q: { objectiveId: string | null }) => mastery.get(q.objectiveId!)?.mastery ?? 40;
    const picked = shuffleWith(pool, rand)
      .sort((a, b) => weight(a) - weight(b))
      .slice(0, 10)
      .map((q) => q.id);
    return c.json({ attemptId: await practiceAttempt(deps, viewer.id, shuffleWith(picked, rand)) }, 201);
  })
  /** Placement test: up to two questions per objective of the subject (at most 30). */
  .post('/:id/placement', async (c) => {
    const viewer = requireUser(c);
    await checkRate(c, { bucket: 'curriculum-placement', limit: 5, windowSec: 600, by: 'user' });
    const deps = c.get('deps');
    const subject = await subjectOf(deps, param(c, 'id'));
    const nodes = await subtree(deps, subject.id);
    const pool = await practiceQuestions(
      deps,
      viewer.id,
      nodes.map((n) => n.id),
    );
    const rand = seededRandom(`${viewer.id}:${subject.id}:${Date.now()}`);
    const by = new Map<string, string[]>();
    for (const q of shuffleWith(pool, rand)) by.set(q.objectiveId!, [...(by.get(q.objectiveId!) ?? []), q.id]);
    const order = nodes.filter((n) => by.has(n.id)).map((n) => n.id);
    const picked: string[] = [];
    for (const id of order) picked.push(...(by.get(id) ?? []).slice(0, 2));
    return c.json({ attemptId: await practiceAttempt(deps, viewer.id, picked.slice(0, 30), subject.id) }, 201);
  })
  /** The student's plan for a subject: progress and the next objectives to study, with what to use. */
  .get('/:id/plan', async (c) => {
    const viewer = requireUser(c);
    const deps = c.get('deps');
    const subject = await subjectOf(deps, param(c, 'id'));
    const nodes = await subtree(deps, subject.id);
    const objectives = nodes.filter((n) => n.kind === 'objective');
    const [mastery, resources, questions, placement] = await Promise.all([
      objectiveMastery(
        deps,
        viewer.id,
        objectives.map((o) => o.id),
      ),
      resourcesFor(
        deps,
        nodes.map((n) => n.id),
      ),
      practiceQuestions(
        deps,
        viewer.id,
        objectives.map((o) => o.id),
      ),
      deps.db
        .select({ id: quizAttempts.id })
        .from(quizAttempts)
        .where(and(eq(quizAttempts.userId, viewer.id), eq(quizAttempts.placementSubjectId, subject.id), sql`${quizAttempts.submittedAt} is not null`))
        .limit(1),
    ]);
    const byId = new Map(nodes.map((n) => [n.id, n]));
    const counts = countUp(nodes, questions);
    const list = objectives.map((o) => ({ id: o.id, o, status: mastery.get(o.id)?.status ?? ('new' as ObjectiveStatus) }));
    const progress = { mastered: 0, learning: 0, weak: 0, new: 0, total: list.length };
    for (const x of list) progress[x.status] += 1;
    const dto: LearningPlanDto = {
      subject: toDto(subject),
      progress,
      next: nextObjectives(list, 3).map((x) => {
        const lesson = x.o.parentId ? (byId.get(x.o.parentId) ?? null) : null;
        return {
          objective: toDto(x.o),
          lesson: lesson ? toDto(lesson) : null,
          status: x.status,
          mastery: mastery.get(x.id)?.mastery ?? null,
          resources: [...(resources[x.id] ?? []), ...(lesson ? (resources[lesson.id] ?? []) : [])],
          questions: counts[x.id] ?? 0,
        };
      }),
      placementDone: placement.length > 0,
    };
    return c.json(dto);
  });
