import { and, count, desc, eq, ilike, isNull, or, sql } from 'drizzle-orm';
import { Hono } from 'hono';
import { z } from 'zod';
import {
  hasPermission,
  LIMITS,
  libraryItemSchema,
  normalizeSearch,
  paginationSchema,
  randomCode,
  savedCollectionSchema,
  savedItemSchema,
  workspaceFileCreateSchema,
  workspaceFileUpdateSchema,
  workspaceFolderSchema,
  type LibraryItemDto,
  type SavedCollectionDto,
  type SavedItemDto,
  type SearchResultsDto,
  type WorkspaceFileDto,
  type WorkspaceFolderDto,
} from '@qubedu/shared';
import {
  courseMembers,
  courses,
  eduMaterials,
  eduSections,
  groups,
  libraryItems,
  posts,
  quizzes,
  savedCollections,
  savedItems,
  users,
  workspaceFiles,
  workspaceFolders,
} from '../db/schema';
import type { AppEnv, AuthUser, Deps } from '../lib/context';
import { decodeCursor, pageOf } from '../lib/cursor';
import { AppError, badRequest, conflict, forbidden, notFound } from '../lib/errors';
import { body, param, query, requireUser } from '../lib/http';
import { pickSummary, summaryColumns, toSummary, withOnline } from '../lib/mappers';
import { REMINDER_MAX_MS } from '../lib/savedReminders';
import { checkRate } from '../middleware';

const upCols = {
  upId: users.id,
  upDisplayName: users.displayName,
  upUsername: users.username,
  upAvatarUrl: users.avatarUrl,
  upAccountType: users.accountType,
  upTeacherVerifiedAt: users.teacherVerifiedAt,
  upLevel: users.level,
  upXp: users.xp,
  upBadge: users.badge,
};

/* ───────── Library ───────── */

function libDto(
  viewer: AuthUser | null,
  r: Record<string, unknown> & {
    l: typeof libraryItems.$inferSelect;
    s: { id: string | null; name: string | null } | null;
    m: { id: string | null; name: string | null } | null;
  },
): LibraryItemDto {
  const l = r.l;
  const staff = !!viewer && hasPermission(viewer.role, viewer.permissions, 'library.manage');
  return {
    id: l.id,
    title: l.title,
    description: l.description,
    category: l.category as LibraryItemDto['category'],
    section: r.s?.id ? { id: r.s.id, name: r.s.name! } : null,
    material: r.m?.id ? { id: r.m.id, name: r.m.name! } : null,
    fileUrl: l.fileUrl,
    mime: l.mime,
    size: l.size,
    coverUrl: l.coverUrl,
    uploader: toSummary(pickSummary('up', r)),
    downloads: l.downloads,
    approved: l.approved,
    createdAt: l.createdAt.getTime(),
    canDelete: staff || viewer?.id === l.uploaderId,
  };
}

const libQuery = paginationSchema.extend({
  q: z.string().trim().max(100).default(''),
  category: z.enum(['book', 'summary', 'exam', 'notes', 'video', 'other']).optional(),
  sectionId: z.string().uuid().optional(),
  materialId: z.string().uuid().optional(),
  pending: z.coerce.boolean().optional(),
  mine: z.coerce.boolean().optional(),
});

export const libraryRoutes = new Hono<AppEnv>()
  .get('/', async (c) => {
    const viewer = c.get('user');
    const { db } = c.get('deps');
    const q = query(c, libQuery);
    const staff = !!viewer && hasPermission(viewer.role, viewer.permissions, 'library.manage');
    const cursor = decodeCursor(q.cursor);
    const term = normalizeSearch(q.q);
    const rows = await db
      .select({ l: libraryItems, s: { id: eduSections.id, name: eduSections.name }, m: { id: eduMaterials.id, name: eduMaterials.name }, ...upCols })
      .from(libraryItems)
      .innerJoin(users, eq(users.id, libraryItems.uploaderId))
      .leftJoin(eduSections, eq(eduSections.id, libraryItems.sectionId))
      .leftJoin(eduMaterials, eq(eduMaterials.id, libraryItems.materialId))
      .where(
        and(
          isNull(libraryItems.deletedAt),
          q.pending && staff ? eq(libraryItems.approved, false) : q.mine && viewer ? eq(libraryItems.uploaderId, viewer.id) : eq(libraryItems.approved, true),
          q.category ? eq(libraryItems.category, q.category) : undefined,
          q.sectionId ? eq(libraryItems.sectionId, q.sectionId) : undefined,
          q.materialId ? eq(libraryItems.materialId, q.materialId) : undefined,
          term ? or(ilike(libraryItems.searchTitle, `%${term}%`), sql`${libraryItems.searchTitle} % ${term}`) : undefined,
          cursor ? sql`(${libraryItems.createdAt}, ${libraryItems.id}) < (to_timestamp(${cursor.t} / 1000.0), ${cursor.id})` : undefined,
        ),
      )
      .orderBy(desc(libraryItems.createdAt), desc(libraryItems.id))
      .limit(q.limit + 1);
    const page = pageOf(rows, q.limit, (r) => ({ t: r.l.createdAt, id: r.l.id }));
    return c.json({ items: page.items.map((r) => libDto(viewer, r as never)), nextCursor: page.nextCursor });
  })
  .post('/', async (c) => {
    const viewer = requireUser(c);
    await checkRate(c, { bucket: 'library-upload', limit: 30, windowSec: 3600, by: 'user' });
    const { db } = c.get('deps');
    const input = await body(c, libraryItemSchema);
    const staff = hasPermission(viewer.role, viewer.permissions, 'library.manage');
    // Verified teachers publish without review; everyone else waits for a moderator.
    const autoApprove = staff || viewer.verifiedTeacher;
    const [row] = await db
      .insert(libraryItems)
      .values({ ...input, searchTitle: normalizeSearch(`${input.title} ${input.description}`), uploaderId: viewer.id, approved: autoApprove })
      .returning({ id: libraryItems.id });
    return c.json({ id: row!.id, approved: autoApprove }, 201);
  })
  .post('/:id/approve', async (c) => {
    const viewer = requireUser(c);
    if (!hasPermission(viewer.role, viewer.permissions, 'library.manage')) throw forbidden();
    const { db } = c.get('deps');
    await db
      .update(libraryItems)
      .set({ approved: true })
      .where(eq(libraryItems.id, param(c, 'id')));
    return c.json({ ok: true });
  })
  .post('/:id/download', async (c) => {
    const { db } = c.get('deps');
    await checkRate(c, { bucket: 'library-dl', limit: 120, windowSec: 600 });
    const [row] = await db
      .update(libraryItems)
      .set({ downloads: sql`${libraryItems.downloads} + 1` })
      .where(and(eq(libraryItems.id, param(c, 'id')), eq(libraryItems.approved, true)))
      .returning({ url: libraryItems.fileUrl });
    if (!row) throw notFound();
    return c.json({ url: row.url });
  })
  .delete('/:id', async (c) => {
    const viewer = requireUser(c);
    const { db } = c.get('deps');
    const [row] = await db
      .select()
      .from(libraryItems)
      .where(eq(libraryItems.id, param(c, 'id')));
    if (!row) throw notFound();
    if (row.uploaderId !== viewer.id && !hasPermission(viewer.role, viewer.permissions, 'library.manage')) throw forbidden();
    await db.update(libraryItems).set({ deletedAt: new Date() }).where(eq(libraryItems.id, row.id));
    return c.json({ ok: true });
  });

/* ───────── Workspace (cloud documents, sheets, slides, whiteboards) ───────── */

const toFolder = (r: typeof workspaceFolders.$inferSelect): WorkspaceFolderDto => ({
  id: r.id,
  name: r.name,
  parentId: r.parentId,
  createdAt: r.createdAt.getTime(),
});
const toFile = (r: typeof workspaceFiles.$inferSelect, withContent = false): WorkspaceFileDto => ({
  id: r.id,
  title: r.title,
  kind: r.kind,
  folderId: r.folderId,
  version: r.version,
  createdAt: r.createdAt.getTime(),
  updatedAt: r.updatedAt.getTime(),
  ...(withContent ? { content: r.content } : {}),
});

function assertContentSize(content: unknown) {
  if (content !== undefined && JSON.stringify(content).length > LIMITS.workspaceContentBytes) throw new AppError(413, 'content_too_large');
}

async function ownFolder(deps: Deps, user: AuthUser, id: string | null | undefined) {
  if (!id) return;
  const [f] = await deps.db.select({ owner: workspaceFolders.ownerId }).from(workspaceFolders).where(eq(workspaceFolders.id, id));
  if (!f || f.owner !== user.id) throw badRequest('invalid_folder');
}

export const workspaceRoutes = new Hono<AppEnv>()
  .get('/', async (c) => {
    const viewer = requireUser(c);
    const { db } = c.get('deps');
    const [folders, files] = await Promise.all([
      db.select().from(workspaceFolders).where(eq(workspaceFolders.ownerId, viewer.id)).orderBy(workspaceFolders.name),
      db.select().from(workspaceFiles).where(eq(workspaceFiles.ownerId, viewer.id)).orderBy(desc(workspaceFiles.updatedAt)).limit(2000),
    ]);
    return c.json({ folders: folders.map(toFolder), files: files.map((f) => toFile(f)) });
  })
  .post('/folders', async (c) => {
    const viewer = requireUser(c);
    const deps = c.get('deps');
    const input = await body(c, workspaceFolderSchema);
    await ownFolder(deps, viewer, input.parentId);
    const [row] = await deps.db
      .insert(workspaceFolders)
      .values({ ownerId: viewer.id, name: input.name, parentId: input.parentId ?? null })
      .returning();
    return c.json(toFolder(row!), 201);
  })
  .patch('/folders/:id', async (c) => {
    const viewer = requireUser(c);
    const { db } = c.get('deps');
    const input = await body(c, workspaceFolderSchema.partial());
    const id = param(c, 'id');
    if (input.parentId === id) throw badRequest('invalid_folder');
    const [row] = await db
      .update(workspaceFolders)
      .set(input)
      .where(and(eq(workspaceFolders.id, id), eq(workspaceFolders.ownerId, viewer.id)))
      .returning();
    if (!row) throw notFound();
    return c.json(toFolder(row));
  })
  .delete('/folders/:id', async (c) => {
    const viewer = requireUser(c);
    const { db } = c.get('deps');
    const id = param(c, 'id');
    await db
      .update(workspaceFolders)
      .set({ parentId: null })
      .where(and(eq(workspaceFolders.parentId, id), eq(workspaceFolders.ownerId, viewer.id)));
    await db.delete(workspaceFolders).where(and(eq(workspaceFolders.id, id), eq(workspaceFolders.ownerId, viewer.id)));
    return c.json({ ok: true });
  })
  .post('/files', async (c) => {
    const viewer = requireUser(c);
    const deps = c.get('deps');
    const input = await body(c, workspaceFileCreateSchema);
    assertContentSize(input.content);
    await ownFolder(deps, viewer, input.folderId);
    const [{ n }] = (await deps.db.select({ n: count() }).from(workspaceFiles).where(eq(workspaceFiles.ownerId, viewer.id))) as [{ n: number }];
    if (n >= 2000) throw conflict('workspace_limit');
    const [row] = await deps.db
      .insert(workspaceFiles)
      .values({ ownerId: viewer.id, title: input.title, kind: input.kind, folderId: input.folderId ?? null, content: input.content ?? {} })
      .returning();
    return c.json(toFile(row!, true), 201);
  })
  .get('/files/:id', async (c) => {
    const viewer = requireUser(c);
    const { db } = c.get('deps');
    const [row] = await db
      .select()
      .from(workspaceFiles)
      .where(and(eq(workspaceFiles.id, param(c, 'id')), eq(workspaceFiles.ownerId, viewer.id)));
    if (!row) throw notFound('file_not_found');
    return c.json(toFile(row, true));
  })
  .patch('/files/:id', async (c) => {
    const viewer = requireUser(c);
    const deps = c.get('deps');
    const input = await body(c, workspaceFileUpdateSchema);
    assertContentSize(input.content);
    await ownFolder(deps, viewer, input.folderId);
    const id = param(c, 'id');
    // Optimistic concurrency: the client must send the version it edited.
    const [row] = await deps.db
      .update(workspaceFiles)
      .set({
        ...(input.title !== undefined ? { title: input.title } : {}),
        ...(input.folderId !== undefined ? { folderId: input.folderId } : {}),
        ...(input.content !== undefined ? { content: input.content } : {}),
        version: sql`${workspaceFiles.version} + 1`,
        updatedAt: new Date(),
      })
      .where(and(eq(workspaceFiles.id, id), eq(workspaceFiles.ownerId, viewer.id), eq(workspaceFiles.version, input.version)))
      .returning();
    if (!row) {
      const [current] = await deps.db
        .select()
        .from(workspaceFiles)
        .where(and(eq(workspaceFiles.id, id), eq(workspaceFiles.ownerId, viewer.id)));
      if (!current) throw notFound('file_not_found');
      throw conflict('version_conflict', toFile(current, true));
    }
    return c.json(toFile(row, true));
  })
  .delete('/files/:id', async (c) => {
    const viewer = requireUser(c);
    const { db } = c.get('deps');
    await db.delete(workspaceFiles).where(and(eq(workspaceFiles.id, param(c, 'id')), eq(workspaceFiles.ownerId, viewer.id)));
    return c.json({ ok: true });
  })
  .post('/import', async (c) => {
    requireUser(c);
    await checkRate(c, { bucket: 'workspace-import', limit: 20, windowSec: 600, by: 'user' });
    const deps = c.get('deps');
    const form = await c.req.formData().catch(() => null);
    const file = form?.get('file');
    if (!file || typeof file === 'string') throw badRequest('file_required');
    if (file.size > LIMITS.uploadBytes) throw new AppError(413, 'file_too_large');
    const data = new Uint8Array(await file.arrayBuffer());
    const extracted = await deps.ai.extract({ filename: file.name, mime: file.type || 'application/octet-stream', data });
    return c.json({ title: file.name.replace(/\.[^.]+$/, ''), text: extracted.text, chunks: extracted.chunks });
  });

/* ───────── Saved items & collections ───────── */

const toCollection = (r: typeof savedCollections.$inferSelect, itemCount: number): SavedCollectionDto => ({
  id: r.id,
  name: r.name,
  description: r.description,
  isPublic: r.isPublic,
  shareSlug: r.shareSlug,
  itemCount,
  createdAt: r.createdAt.getTime(),
});
const toSaved = (r: typeof savedItems.$inferSelect): SavedItemDto => ({
  id: r.id,
  itemType: r.itemType as SavedItemDto['itemType'],
  refId: r.refId,
  title: r.title,
  url: r.url,
  note: r.note,
  collectionId: r.collectionId,
  remindAt: r.remindAt?.getTime() ?? null,
  reminded: !!r.remindedAt,
  createdAt: r.createdAt.getTime(),
});

/** A reminder must be a moment in the near future (a minute from now to a year); null clears it. */
function reminderOf(v: number | null | undefined): { remindAt: Date | null; remindedAt: null } | Record<string, never> {
  if (v === undefined) return {};
  if (v === null) return { remindAt: null, remindedAt: null };
  const now = Date.now();
  if (v < now + 30_000 || v > now + REMINDER_MAX_MS) throw badRequest('invalid_reminder');
  return { remindAt: new Date(v), remindedAt: null };
}

export const savedRoutes = new Hono<AppEnv>()
  .get('/', async (c) => {
    const viewer = requireUser(c);
    const { db } = c.get('deps');
    const q = query(c, z.object({ collectionId: z.string().uuid().optional(), type: z.string().max(20).optional() }));
    const [items, cols, counts] = await Promise.all([
      db
        .select()
        .from(savedItems)
        .where(
          and(
            eq(savedItems.ownerId, viewer.id),
            q.collectionId ? eq(savedItems.collectionId, q.collectionId) : undefined,
            q.type ? eq(savedItems.itemType, q.type) : undefined,
          ),
        )
        .orderBy(desc(savedItems.createdAt))
        .limit(1000),
      db.select().from(savedCollections).where(eq(savedCollections.ownerId, viewer.id)).orderBy(savedCollections.name),
      db.select({ id: savedItems.collectionId, n: count() }).from(savedItems).where(eq(savedItems.ownerId, viewer.id)).groupBy(savedItems.collectionId),
    ]);
    const countMap = new Map(counts.map((x) => [x.id, x.n]));
    return c.json({ items: items.map(toSaved), collections: cols.map((col) => toCollection(col, countMap.get(col.id) ?? 0)) });
  })
  .post('/', async (c) => {
    const viewer = requireUser(c);
    const { db } = c.get('deps');
    const input = await body(c, savedItemSchema);
    if (input.collectionId) {
      const [col] = await db.select({ o: savedCollections.ownerId }).from(savedCollections).where(eq(savedCollections.id, input.collectionId));
      if (col?.o !== viewer.id) throw badRequest('invalid_collection');
    }
    const { remindAt, ...rest } = input;
    const reminder = reminderOf(remindAt);
    const [row] = await db
      .insert(savedItems)
      .values({ ...rest, ...reminder, ownerId: viewer.id })
      .onConflictDoUpdate({
        target: [savedItems.ownerId, savedItems.itemType, savedItems.refId],
        set: { collectionId: input.collectionId ?? null, note: input.note, title: input.title, ...reminder },
      })
      .returning();
    return c.json(toSaved(row!), 201);
  })
  .patch('/:id', async (c) => {
    const viewer = requireUser(c);
    const { db } = c.get('deps');
    const { remindAt, ...input } = await body(c, savedItemSchema.pick({ note: true, collectionId: true, title: true, remindAt: true }).partial());
    const [row] = await db
      .update(savedItems)
      .set({ ...input, ...reminderOf(remindAt) })
      .where(and(eq(savedItems.id, param(c, 'id')), eq(savedItems.ownerId, viewer.id)))
      .returning();
    if (!row) throw notFound();
    return c.json(toSaved(row));
  })
  .delete('/:id', async (c) => {
    const viewer = requireUser(c);
    const { db } = c.get('deps');
    await db.delete(savedItems).where(and(eq(savedItems.id, param(c, 'id')), eq(savedItems.ownerId, viewer.id)));
    return c.json({ ok: true });
  })
  .delete('/by-ref/:type/:refId', async (c) => {
    const viewer = requireUser(c);
    const { db } = c.get('deps');
    await db
      .delete(savedItems)
      .where(and(eq(savedItems.ownerId, viewer.id), eq(savedItems.itemType, c.req.param('type')), eq(savedItems.refId, c.req.param('refId'))));
    return c.json({ ok: true });
  })
  .post('/collections', async (c) => {
    const viewer = requireUser(c);
    const { db } = c.get('deps');
    const input = await body(c, savedCollectionSchema);
    const [row] = await db
      .insert(savedCollections)
      .values({ ...input, ownerId: viewer.id, shareSlug: randomCode(12) })
      .returning();
    return c.json(toCollection(row!, 0), 201);
  })
  .patch('/collections/:id', async (c) => {
    const viewer = requireUser(c);
    const { db } = c.get('deps');
    const input = await body(c, savedCollectionSchema.partial());
    const [row] = await db
      .update(savedCollections)
      .set(input)
      .where(and(eq(savedCollections.id, param(c, 'id')), eq(savedCollections.ownerId, viewer.id)))
      .returning();
    if (!row) throw notFound();
    return c.json(toCollection(row, 0));
  })
  .delete('/collections/:id', async (c) => {
    const viewer = requireUser(c);
    const { db } = c.get('deps');
    await db.delete(savedCollections).where(and(eq(savedCollections.id, param(c, 'id')), eq(savedCollections.ownerId, viewer.id)));
    return c.json({ ok: true });
  })
  .get('/public/:slug', async (c) => {
    const { db } = c.get('deps');
    const [col] = await db
      .select({ c: savedCollections, ...summaryColumns })
      .from(savedCollections)
      .innerJoin(users, eq(users.id, savedCollections.ownerId))
      .where(and(eq(savedCollections.shareSlug, c.req.param('slug')), eq(savedCollections.isPublic, true)));
    if (!col) throw notFound('collection_not_found');
    const items = await db.select().from(savedItems).where(eq(savedItems.collectionId, col.c.id)).orderBy(desc(savedItems.createdAt)).limit(500);
    c.header('Cache-Control', 'public, max-age=60');
    return c.json({ collection: toCollection(col.c, items.length), owner: toSummary(col), items: items.map(toSaved) });
  });

/* ───────── Global search ───────── */

export const searchRoutes = new Hono<AppEnv>().get('/', async (c) => {
  const viewer = requireUser(c);
  await checkRate(c, { bucket: 'search', limit: 60, windowSec: 60, by: 'user' });
  const deps = c.get('deps');
  const { q } = query(c, z.object({ q: z.string().trim().min(1).max(100) }));
  const term = normalizeSearch(q);
  if (term.length < 2) return c.json({ users: [], groups: [], quizzes: [], posts: [], library: [], courses: [] } satisfies SearchResultsDto);
  const like = `%${term.replace(/[%_]/g, '')}%`;
  const { db } = deps;
  const [u, g, qz, p, l, cs] = await Promise.all([
    db
      .select(summaryColumns)
      .from(users)
      .where(and(isNull(users.deletedAt), or(ilike(users.searchName, like), sql`${users.searchName} % ${term}`)))
      .orderBy(desc(users.xp))
      .limit(8),
    db
      .select({ id: groups.id, name: groups.name, kind: groups.kind, avatarUrl: groups.avatarUrl, memberCount: groups.memberCount, privacy: groups.privacy })
      .from(groups)
      .where(and(isNull(groups.deletedAt), or(ilike(groups.searchName, like), sql`${groups.searchName} % ${term}`)))
      .orderBy(desc(groups.memberCount))
      .limit(8),
    db
      .select({ id: quizzes.id, title: quizzes.title, difficulty: quizzes.difficulty, questionCount: quizzes.questionCount })
      .from(quizzes)
      .where(
        and(
          isNull(quizzes.deletedAt),
          eq(quizzes.published, true),
          isNull(quizzes.courseId),
          or(ilike(quizzes.searchTitle, like), sql`${quizzes.searchTitle} % ${term}`),
        ),
      )
      .limit(8),
    db
      .select({ id: posts.id, text: posts.text, createdAt: posts.createdAt, ...upCols })
      .from(posts)
      .innerJoin(users, eq(users.id, posts.authorId))
      .where(and(isNull(posts.deletedAt), isNull(posts.groupId), ilike(posts.searchText, like)))
      .orderBy(desc(posts.createdAt))
      .limit(8),
    db
      .select({ id: libraryItems.id, title: libraryItems.title, category: libraryItems.category })
      .from(libraryItems)
      .where(
        and(
          isNull(libraryItems.deletedAt),
          eq(libraryItems.approved, true),
          or(ilike(libraryItems.searchTitle, like), sql`${libraryItems.searchTitle} % ${term}`),
        ),
      )
      .limit(8),
    db
      .select({ id: courses.id, title: courses.title, subject: courses.subject })
      .from(courses)
      .innerJoin(courseMembers, and(eq(courseMembers.courseId, courses.id), eq(courseMembers.userId, viewer.id)))
      .where(or(ilike(courses.searchTitle, like), sql`${courses.searchTitle} % ${term}`))
      .limit(8),
  ]);
  const result: SearchResultsDto = {
    users: await withOnline(deps.kv, u.map(toSummary)),
    groups: g,
    quizzes: qz,
    posts: p.map((x) => ({
      id: x.id,
      text: x.text.slice(0, 200),
      createdAt: x.createdAt.getTime(),
      author: toSummary(pickSummary('up', x as unknown as Record<string, unknown>)),
    })),
    library: l.map((x) => ({ id: x.id, title: x.title, category: x.category as LibraryItemDto['category'] })),
    courses: cs,
  };
  return c.json(result);
});
