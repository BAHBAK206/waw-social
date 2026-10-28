import { and, count, desc, eq, gte, ilike, isNull, lt, ne, or, sql } from 'drizzle-orm';
import { Hono } from 'hono';
import { z } from 'zod';
import {
  adSchema,
  announcementSchema,
  assistantKnowledgeSchema,
  badgeSchema,
  birthYearSchema,
  banSchema,
  dailyChallengeSchema,
  dayKey,
  featureControlsSchema,
  levelFromXp,
  materialSchema,
  normalizeFeatureControls,
  normalizeSearch,
  paginationSchema,
  sectionSchema,
  setPermissionsSchema,
  setRoleSchema,
  siteSettingsSchema,
  type AdminOverviewDto,
  type AdminUserDto,
  type AssistantKnowledgeDto,
  type AuditEntryDto,
  type ClientErrorDto,
  type ReportDto,
} from '@qubedu/shared';
import {
  ads,
  announcements,
  assistantKnowledge,
  assistantMessages,
  auditLog,
  clientErrors,
  comments,
  courses,
  dailyChallenges,
  eduMaterials,
  eduSections,
  emailTokens,
  forms,
  groups,
  libraryItems,
  messages,
  notifications,
  posts,
  quizAttempts,
  quizzes,
  reports,
  events,
  sessions,
  siteSettings,
  stories,
  users,
  videoComments,
  videos,
} from '../db/schema';
import { audit } from '../lib/audit';
import type { AppEnv } from '../lib/context';
import { decodeCursor, pageOf } from '../lib/cursor';
import { badRequest, forbidden, notFound } from '../lib/errors';
import { body, param, query, requirePerm } from '../lib/http';
import { ms, onlineKey, pickSummary, summaryColumns, toSummary } from '../lib/mappers';
import { notify } from '../lib/notify';
import { ch } from '../lib/realtime';
import { isMinor } from '../lib/minors';
import { setHidden } from '../lib/moderation';
import { getRawSetting, getSettings, putSetting } from '../lib/settings';
import { toAd, toAnnouncement } from './config';

const reporterCols = {
  repId: users.id,
  repDisplayName: users.displayName,
  repUsername: users.username,
  repAvatarUrl: users.avatarUrl,
  repAccountType: users.accountType,
  repLevel: users.level,
  repXp: users.xp,
  repBadge: users.badge,
};

const toAdminUser = (u: typeof users.$inferSelect): AdminUserDto => ({
  ...toSummary(u),
  email: u.email,
  role: u.role,
  permissions: u.permissions,
  banned: !!u.bannedAt && (!u.bannedUntil || u.bannedUntil.getTime() > Date.now()),
  banReason: u.banReason,
  emailVerified: !!u.emailVerifiedAt,
  createdAt: u.createdAt.getTime(),
  lastSeenAt: ms(u.lastSeenAt),
  birthYear: u.birthYear ?? null,
  isMinor: isMinor(u.birthYear),
});

async function systemHealth(db: Parameters<typeof audit>[0], alertUrl: string | undefined): Promise<AdminOverviewDto['system']> {
  const [backup] = await db.select({ v: siteSettings.value }).from(siteSettings).where(eq(siteSettings.key, 'lastBackup'));
  const b = (backup?.v ?? null) as { at?: string; sizeKb?: number } | null;
  const [streams] = await db.execute<{ processing: number; failed: number }>(sql`
    select count(*) filter (where stream_status in ('pending', 'processing'))::int as processing,
           count(*) filter (where stream_status = 'failed')::int as failed
    from videos where deleted_at is null`);
  return {
    lastBackupAt: b?.at ? new Date(b.at).getTime() : null,
    lastBackupSizeKb: b?.sizeKb ?? null,
    videosProcessing: streams?.processing ?? 0,
    videosFailed: streams?.failed ?? 0,
    alertsConfigured: !!alertUrl,
  };
}

async function targetUser(db: Parameters<typeof audit>[0], id: string) {
  const [u] = await db.select().from(users).where(eq(users.id, id));
  if (!u) throw notFound('user_not_found');
  return u;
}

export const adminRoutes = new Hono<AppEnv>()
  .get('/overview', async (c) => {
    requirePerm(c, 'users.view');
    const { db, kv } = c.get('deps');
    const today = new Date();
    today.setUTCHours(0, 0, 0, 0);
    const week = new Date(Date.now() - 7 * 86400_000);
    // Raw SQL parameters must be strings: drizzle's postgres-js driver does not serialize Date objects there.
    const since14 = new Date(Date.now() - 14 * 86400_000).toISOString();
    const recent = await db
      .select({ id: users.id })
      .from(users)
      .where(gte(users.lastSeenAt, new Date(Date.now() - 15 * 60_000)))
      .limit(5000);
    const online = (await kv.existsMany(recent.map((r) => onlineKey(r.id)))).filter(Boolean).length;
    const [[total], [todayN], [weekN], [teachers], [banned], [postN], [quizN], [attemptN], [groupN], [courseN], [formN], [libN], [openReports], [errors]] =
      await Promise.all([
        db.select({ n: count() }).from(users),
        db.select({ n: count() }).from(users).where(gte(users.createdAt, today)),
        db.select({ n: count() }).from(users).where(gte(users.createdAt, week)),
        db.select({ n: count() }).from(users).where(eq(users.accountType, 'teacher')),
        db
          .select({ n: count() })
          .from(users)
          .where(sql`${users.bannedAt} is not null`),
        db.select({ n: count() }).from(posts).where(isNull(posts.deletedAt)),
        db.select({ n: count() }).from(quizzes).where(isNull(quizzes.deletedAt)),
        db
          .select({ n: count() })
          .from(quizAttempts)
          .where(sql`${quizAttempts.submittedAt} is not null`),
        db.select({ n: count() }).from(groups).where(isNull(groups.deletedAt)),
        db.select({ n: count() }).from(courses),
        db.select({ n: count() }).from(forms).where(isNull(forms.deletedAt)),
        db.select({ n: count() }).from(libraryItems).where(isNull(libraryItems.deletedAt)),
        db.select({ n: count() }).from(reports).where(eq(reports.status, 'open')),
        db
          .select({ n: sql<number>`coalesce(sum(${clientErrors.count}), 0)::int` })
          .from(clientErrors)
          .where(gte(clientErrors.lastSeenAt, new Date(Date.now() - 86400_000))),
      ]);
    const signups = await db.execute<{ day: string; n: number }>(
      sql`select to_char(created_at at time zone 'UTC', 'YYYY-MM-DD') as day, count(*)::int as n from users where created_at >= ${since14} group by 1 order by 1`,
    );
    const activity = await db.execute<{ day: string; attempts: number; posts: number; messages: number }>(sql`
      with days as (select to_char(d, 'YYYY-MM-DD') as day from generate_series(${since14}::timestamptz, now(), interval '1 day') d)
      select days.day,
        (select count(*)::int from quiz_attempts a where to_char(a.submitted_at at time zone 'UTC', 'YYYY-MM-DD') = days.day) as attempts,
        (select count(*)::int from posts p where to_char(p.created_at at time zone 'UTC', 'YYYY-MM-DD') = days.day) as posts,
        (select count(*)::int from messages m where to_char(m.created_at at time zone 'UTC', 'YYYY-MM-DD') = days.day) as messages
      from days order by days.day`);
    const dto: AdminOverviewDto = {
      users: { total: total?.n ?? 0, today: todayN?.n ?? 0, week: weekN?.n ?? 0, teachers: teachers?.n ?? 0, banned: banned?.n ?? 0, online },
      content: {
        posts: postN?.n ?? 0,
        quizzes: quizN?.n ?? 0,
        attempts: attemptN?.n ?? 0,
        groups: groupN?.n ?? 0,
        courses: courseN?.n ?? 0,
        forms: formN?.n ?? 0,
        library: libN?.n ?? 0,
      },
      openReports: openReports?.n ?? 0,
      errors24h: errors?.n ?? 0,
      system: await systemHealth(db, c.get('deps').env.ALERT_WEBHOOK_URL),
      signupsByDay: signups.map((s) => ({ day: s.day, count: Number(s.n) })),
      activityByDay: activity.map((a) => ({ day: a.day, attempts: Number(a.attempts), posts: Number(a.posts), messages: Number(a.messages) })),
    };
    return c.json(dto);
  })
  /* users */
  .get('/users', async (c) => {
    requirePerm(c, 'users.view');
    const { db } = c.get('deps');
    const q = query(
      c,
      paginationSchema.extend({
        q: z.string().trim().max(120).default(''),
        role: z.enum(['user', 'moderator', 'admin', 'root']).optional(),
        banned: z.coerce.boolean().optional(),
        accountType: z.enum(['student', 'teacher', 'parent']).optional(),
      }),
    );
    const cursor = decodeCursor(q.cursor);
    const term = normalizeSearch(q.q);
    const rows = await db
      .select()
      .from(users)
      .where(
        and(
          term ? or(ilike(users.searchName, `%${term}%`), ilike(users.email, `%${q.q.toLowerCase()}%`)) : undefined,
          q.role ? eq(users.role, q.role) : undefined,
          q.accountType ? eq(users.accountType, q.accountType) : undefined,
          q.banned ? sql`${users.bannedAt} is not null` : undefined,
          cursor ? sql`(${users.createdAt}, ${users.id}) < (to_timestamp(${cursor.t} / 1000.0), ${cursor.id})` : undefined,
        ),
      )
      .orderBy(desc(users.createdAt), desc(users.id))
      .limit(q.limit + 1);
    const page = pageOf(rows, q.limit, (r) => ({ t: r.createdAt, id: r.id }));
    return c.json({ items: page.items.map(toAdminUser), nextCursor: page.nextCursor });
  })
  .get('/users/:id', async (c) => {
    requirePerm(c, 'users.view');
    const { db } = c.get('deps');
    const u = await targetUser(db, param(c, 'id'));
    const [[postsN], [attemptsN], [reportsN], sessionRows] = await Promise.all([
      db.select({ n: count() }).from(posts).where(eq(posts.authorId, u.id)),
      db.select({ n: count() }).from(quizAttempts).where(eq(quizAttempts.userId, u.id)),
      db
        .select({ n: count() })
        .from(reports)
        .where(and(eq(reports.targetType, 'user'), eq(reports.targetId, u.id))),
      db
        .select()
        .from(sessions)
        .where(and(eq(sessions.userId, u.id), isNull(sessions.revokedAt)))
        .orderBy(desc(sessions.lastUsedAt))
        .limit(10),
    ]);
    return c.json({
      user: toAdminUser(u),
      stats: { posts: postsN?.n ?? 0, attempts: attemptsN?.n ?? 0, reports: reportsN?.n ?? 0, xp: u.xp, streak: u.streak },
      sessions: sessionRows.map((s) => ({ id: s.id, client: s.client, userAgent: s.userAgent, ip: s.ip, lastUsedAt: s.lastUsedAt.getTime() })),
    });
  })
  .post('/users/:id/ban', async (c) => {
    const actor = requirePerm(c, 'users.manage');
    const deps = c.get('deps');
    const u = await targetUser(deps.db, param(c, 'id'));
    if (u.role === 'root' || (u.role === 'admin' && actor.role !== 'root')) throw forbidden('cannot_ban_admin');
    if (u.id === actor.id) throw badRequest('cannot_ban_self');
    const input = await body(c, banSchema);
    await deps.db
      .update(users)
      .set({ bannedAt: new Date(), bannedUntil: input.until ? new Date(input.until) : null, banReason: input.reason || null, tokenVersion: u.tokenVersion + 1 })
      .where(eq(users.id, u.id));
    await deps.db.update(sessions).set({ revokedAt: new Date() }).where(eq(sessions.userId, u.id));
    await audit(deps.db, actor.id, 'user.ban', 'user', u.id, { reason: input.reason, until: input.until ?? null });
    return c.json({ ok: true });
  })
  .post('/users/:id/unban', async (c) => {
    const actor = requirePerm(c, 'users.manage');
    const { db } = c.get('deps');
    const u = await targetUser(db, param(c, 'id'));
    await db.update(users).set({ bannedAt: null, bannedUntil: null, banReason: null }).where(eq(users.id, u.id));
    await audit(db, actor.id, 'user.unban', 'user', u.id);
    return c.json({ ok: true });
  })
  .put('/users/:id/role', async (c) => {
    const actor = requirePerm(c, 'users.manage');
    const { db } = c.get('deps');
    const u = await targetUser(db, param(c, 'id'));
    const { role } = await body(c, setRoleSchema);
    if (u.role === 'root') throw forbidden('cannot_change_root');
    if ((role === 'admin' || u.role === 'admin') && actor.role !== 'root') throw forbidden('root_only');
    await db
      .update(users)
      .set({ role, tokenVersion: u.tokenVersion + 1 })
      .where(eq(users.id, u.id));
    await audit(db, actor.id, 'user.role', 'user', u.id, { from: u.role, to: role });
    return c.json({ ok: true, role });
  })
  .put('/users/:id/permissions', async (c) => {
    const actor = requirePerm(c, 'users.manage');
    const { db } = c.get('deps');
    const u = await targetUser(db, param(c, 'id'));
    if (u.role === 'root') throw forbidden('cannot_change_root');
    const { permissions } = await body(c, setPermissionsSchema);
    const filtered = permissions.filter((p) => p !== 'features.manage' && p !== 'site.manage');
    await db.update(users).set({ permissions: filtered }).where(eq(users.id, u.id));
    await audit(db, actor.id, 'user.permissions', 'user', u.id, { permissions: filtered });
    return c.json({ ok: true, permissions: filtered });
  })
  .put('/users/:id/badge', async (c) => {
    const actor = requirePerm(c, 'users.manage');
    const { db } = c.get('deps');
    const u = await targetUser(db, param(c, 'id'));
    const badge = await body(c, badgeSchema);
    await db
      .update(users)
      .set({ badge: badge.enabled ? badge : null })
      .where(eq(users.id, u.id));
    await audit(db, actor.id, 'user.badge', 'user', u.id, badge);
    return c.json({ ok: true });
  })
  .put('/users/:id/birth-year', async (c) => {
    const actor = requirePerm(c, 'users.manage');
    const { db } = c.get('deps');
    const u = await targetUser(db, param(c, 'id'));
    const { birthYear } = await body(c, z.object({ birthYear: birthYearSchema.nullable() }));
    await db.update(users).set({ birthYear }).where(eq(users.id, u.id));
    await audit(db, actor.id, 'user.birth_year', 'user', u.id, { from: u.birthYear, to: birthYear });
    return c.json({ ok: true });
  })
  .post('/users/:id/revoke-sessions', async (c) => {
    const actor = requirePerm(c, 'users.manage');
    const { db } = c.get('deps');
    const u = await targetUser(db, param(c, 'id'));
    await db
      .update(users)
      .set({ tokenVersion: u.tokenVersion + 1 })
      .where(eq(users.id, u.id));
    await db.update(sessions).set({ revokedAt: new Date() }).where(eq(sessions.userId, u.id));
    await audit(db, actor.id, 'user.revoke_sessions', 'user', u.id);
    return c.json({ ok: true });
  })
  .delete('/users/:id', async (c) => {
    const actor = requirePerm(c, 'users.manage');
    const { db } = c.get('deps');
    const u = await targetUser(db, param(c, 'id'));
    if (u.role === 'root' || u.id === actor.id || (u.role === 'admin' && actor.role !== 'root')) throw forbidden();
    await db.delete(users).where(eq(users.id, u.id));
    await audit(db, actor.id, 'user.delete', 'user', u.id, { email: u.email });
    return c.json({ ok: true });
  })
  /* reports */
  .get('/reports', async (c) => {
    requirePerm(c, 'reports.manage');
    const { db } = c.get('deps');
    const q = query(c, paginationSchema.extend({ status: z.enum(['open', 'resolved', 'dismissed']).default('open') }));
    const cursor = decodeCursor(q.cursor);
    const rows = await db
      .select({ r: reports, ...reporterCols })
      .from(reports)
      .innerJoin(users, eq(users.id, reports.reporterId))
      .where(
        and(eq(reports.status, q.status), cursor ? sql`(${reports.createdAt}, ${reports.id}) < (to_timestamp(${cursor.t} / 1000.0), ${cursor.id})` : undefined),
      )
      .orderBy(desc(reports.createdAt), desc(reports.id))
      .limit(q.limit + 1);
    const page = pageOf(rows, q.limit, (r) => ({ t: r.r.createdAt, id: r.r.id }));
    const counts = new Map<string, number>();
    if (page.items.length) {
      const grouped = await db
        .select({ type: reports.targetType, target: reports.targetId, n: count() })
        .from(reports)
        .where(and(eq(reports.status, 'open'), or(...page.items.map((r) => and(eq(reports.targetType, r.r.targetType), eq(reports.targetId, r.r.targetId))))))
        .groupBy(reports.targetType, reports.targetId);
      for (const g of grouped) counts.set(`${g.type}:${g.target}`, g.n);
    }
    const items: ReportDto[] = [];
    for (const r of page.items) {
      let target: ReportDto['target'] = null;
      if (r.r.targetType === 'user') {
        const [u] = await db
          .select({ name: users.displayName })
          .from(users)
          .where(sql`${users.id}::text = ${r.r.targetId}`);
        target = u ? { label: u.name, link: `/u/${r.r.targetId}` } : null;
      } else if (r.r.targetType === 'post') {
        const [p] = await db
          .select({ text: posts.text, groupId: posts.groupId })
          .from(posts)
          .where(sql`${posts.id}::text = ${r.r.targetId}`);
        target = p ? { label: p.text.slice(0, 120), link: p.groupId ? `/groups/${p.groupId}?post=${r.r.targetId}` : `/feed?post=${r.r.targetId}` } : null;
      } else if (r.r.targetType === 'message') {
        const [m] = await db
          .select({ text: messages.text, conv: messages.conversationId })
          .from(messages)
          .where(sql`${messages.id}::text = ${r.r.targetId}`);
        target = m ? { label: m.text.slice(0, 120), link: null } : null;
      } else if (r.r.targetType === 'group') {
        const [g] = await db
          .select({ name: groups.name })
          .from(groups)
          .where(sql`${groups.id}::text = ${r.r.targetId}`);
        target = g ? { label: g.name, link: `/groups/${r.r.targetId}` } : null;
      } else if (r.r.targetType === 'comment') {
        const [cm] = await db
          .select({ text: comments.text })
          .from(comments)
          .where(sql`${comments.id}::text = ${r.r.targetId}`);
        target = cm ? { label: cm.text.slice(0, 120), link: null } : null;
      } else if (r.r.targetType === 'video') {
        const [v] = await db
          .select({ title: videos.title })
          .from(videos)
          .where(sql`${videos.id}::text = ${r.r.targetId}`);
        target = v ? { label: v.title, link: `/watch/${r.r.targetId}` } : null;
      } else if (r.r.targetType === 'video_comment') {
        const [vc] = await db
          .select({ text: videoComments.text, videoId: videoComments.videoId })
          .from(videoComments)
          .where(sql`${videoComments.id}::text = ${r.r.targetId}`);
        target = vc ? { label: vc.text.slice(0, 120), link: `/watch/${vc.videoId}` } : null;
      } else if (r.r.targetType === 'event') {
        const [ev] = await db
          .select({ title: events.title })
          .from(events)
          .where(sql`${events.id}::text = ${r.r.targetId}`);
        target = ev ? { label: ev.title, link: `/events/${r.r.targetId}` } : null;
      } else if (r.r.targetType === 'story') {
        const [st] = await db
          .select({ text: stories.text })
          .from(stories)
          .where(sql`${stories.id}::text = ${r.r.targetId}`);
        target = st ? { label: st.text.slice(0, 120) || 'story', link: null } : null;
      }
      items.push({
        id: r.r.id,
        targetType: r.r.targetType,
        targetId: r.r.targetId,
        reason: r.r.reason,
        details: r.r.details,
        status: r.r.status,
        reporter: toSummary(pickSummary('rep', r as unknown as Record<string, unknown>)),
        target,
        resolution: r.r.resolution,
        autoHidden: r.r.autoHidden,
        reportCount: counts.get(`${r.r.targetType}:${r.r.targetId}`) ?? 1,
        createdAt: r.r.createdAt.getTime(),
        resolvedAt: ms(r.r.resolvedAt),
      });
    }
    return c.json({ items, nextCursor: page.nextCursor });
  })
  .post('/reports/:id/resolve', async (c) => {
    const actor = requirePerm(c, 'reports.manage');
    const deps = c.get('deps');
    const input = await body(
      c,
      z.object({
        status: z.enum(['resolved', 'dismissed']),
        resolution: z.string().trim().max(500).default(''),
        removeContent: z.boolean().default(false),
        /** Close every open report on the same item in one go. */
        closeSimilar: z.boolean().default(true),
      }),
    );
    const [r] = await deps.db
      .select()
      .from(reports)
      .where(eq(reports.id, param(c, 'id')));
    if (!r) throw notFound();
    if (input.removeContent) await setHidden(deps.db, r.targetType, r.targetId, true);
    // Dismissing a report on an item that was hidden automatically puts it back (unless other reports remain open).
    else if (input.status === 'dismissed' && r.autoHidden) {
      const [others] = await deps.db
        .select({ n: count() })
        .from(reports)
        .where(and(eq(reports.targetType, r.targetType), eq(reports.targetId, r.targetId), eq(reports.status, 'open'), ne(reports.id, r.id)));
      if (!others?.n || input.closeSimilar) await setHidden(deps.db, r.targetType, r.targetId, false);
    }
    await deps.db
      .update(reports)
      .set({ status: input.status, resolution: input.resolution, resolvedBy: actor.id, resolvedAt: new Date() })
      .where(
        input.closeSimilar ? and(eq(reports.targetType, r.targetType), eq(reports.targetId, r.targetId), eq(reports.status, 'open')) : eq(reports.id, r.id),
      );
    await audit(deps.db, actor.id, 'report.resolve', 'report', r.id, input);
    await notify(deps, { userId: r.reporterId, type: 'report_resolved', icon: 'shield-check', data: { status: input.status }, pref: 'system' });
    return c.json({ ok: true });
  })
  /* announcements & ads */
  .get('/announcements', async (c) => {
    requirePerm(c, 'content.manage');
    const { db } = c.get('deps');
    return c.json({ items: (await db.select().from(announcements).orderBy(desc(announcements.createdAt)).limit(200)).map(toAnnouncement) });
  })
  .post('/announcements', async (c) => {
    const actor = requirePerm(c, 'content.manage');
    const deps = c.get('deps');
    const input = await body(c, announcementSchema);
    const [row] = await deps.db
      .insert(announcements)
      .values({ ...input, expiresAt: input.expiresAt ? new Date(input.expiresAt) : null, createdBy: actor.id })
      .returning();
    await deps.realtime.publish(ch.site(), 'config:changed', {});
    return c.json(toAnnouncement(row!), 201);
  })
  .put('/announcements/:id', async (c) => {
    requirePerm(c, 'content.manage');
    const deps = c.get('deps');
    const input = await body(c, announcementSchema);
    const [row] = await deps.db
      .update(announcements)
      .set({ ...input, expiresAt: input.expiresAt ? new Date(input.expiresAt) : null })
      .where(eq(announcements.id, param(c, 'id')))
      .returning();
    if (!row) throw notFound();
    await deps.realtime.publish(ch.site(), 'config:changed', {});
    return c.json(toAnnouncement(row));
  })
  .delete('/announcements/:id', async (c) => {
    requirePerm(c, 'content.manage');
    const deps = c.get('deps');
    await deps.db.delete(announcements).where(eq(announcements.id, param(c, 'id')));
    await deps.realtime.publish(ch.site(), 'config:changed', {});
    return c.json({ ok: true });
  })
  .get('/ads', async (c) => {
    requirePerm(c, 'content.manage');
    const { db } = c.get('deps');
    return c.json({ items: (await db.select().from(ads).orderBy(desc(ads.createdAt)).limit(200)).map(toAd) });
  })
  .post('/ads', async (c) => {
    const actor = requirePerm(c, 'content.manage');
    const { db } = c.get('deps');
    const input = await body(c, adSchema);
    const [row] = await db
      .insert(ads)
      .values({ ...input, createdBy: actor.id })
      .returning();
    return c.json(toAd(row!), 201);
  })
  .put('/ads/:id', async (c) => {
    requirePerm(c, 'content.manage');
    const { db } = c.get('deps');
    const input = await body(c, adSchema);
    const [row] = await db
      .update(ads)
      .set(input)
      .where(eq(ads.id, param(c, 'id')))
      .returning();
    if (!row) throw notFound();
    return c.json(toAd(row));
  })
  .delete('/ads/:id', async (c) => {
    requirePerm(c, 'content.manage');
    const { db } = c.get('deps');
    await db.delete(ads).where(eq(ads.id, param(c, 'id')));
    return c.json({ ok: true });
  })
  .post('/broadcast', async (c) => {
    const actor = requirePerm(c, 'content.manage');
    const deps = c.get('deps');
    const input = await body(
      c,
      z.object({
        title: z.string().trim().min(1).max(160),
        body: z.string().trim().max(1000).default(''),
        link: z.string().trim().max(500).optional(),
        audience: z.enum(['all', 'students', 'teachers']).default('all'),
      }),
    );
    const ids = await deps.db
      .select({ id: users.id })
      .from(users)
      .where(and(isNull(users.deletedAt), input.audience === 'all' ? undefined : eq(users.accountType, input.audience === 'teachers' ? 'teacher' : 'student')));
    for (let i = 0; i < ids.length; i += 500) {
      await deps.db
        .insert(notifications)
        .values(
          ids
            .slice(i, i + 500)
            .map((u) => ({ userId: u.id, type: 'broadcast', title: input.title, body: input.body, icon: 'megaphone', link: input.link ?? null })),
        );
    }
    await deps.realtime.publish(ch.site(), 'notification', { type: 'broadcast' });
    await audit(deps.db, actor.id, 'broadcast', undefined, undefined, { title: input.title, recipients: ids.length });
    return c.json({ ok: true, recipients: ids.length });
  })
  /* education taxonomy */
  .post('/sections', async (c) => {
    requirePerm(c, 'education.manage');
    const { db } = c.get('deps');
    const [row] = await db
      .insert(eduSections)
      .values(await body(c, sectionSchema))
      .returning();
    return c.json(row, 201);
  })
  .put('/sections/:id', async (c) => {
    requirePerm(c, 'education.manage');
    const { db } = c.get('deps');
    const [row] = await db
      .update(eduSections)
      .set(await body(c, sectionSchema))
      .where(eq(eduSections.id, param(c, 'id')))
      .returning();
    if (!row) throw notFound();
    return c.json(row);
  })
  .delete('/sections/:id', async (c) => {
    requirePerm(c, 'education.manage');
    const { db } = c.get('deps');
    await db.delete(eduSections).where(eq(eduSections.id, param(c, 'id')));
    return c.json({ ok: true });
  })
  .post('/materials', async (c) => {
    requirePerm(c, 'education.manage');
    const { db } = c.get('deps');
    const [row] = await db
      .insert(eduMaterials)
      .values(await body(c, materialSchema))
      .returning();
    return c.json(row, 201);
  })
  .put('/materials/:id', async (c) => {
    requirePerm(c, 'education.manage');
    const { db } = c.get('deps');
    const [row] = await db
      .update(eduMaterials)
      .set(await body(c, materialSchema))
      .where(eq(eduMaterials.id, param(c, 'id')))
      .returning();
    if (!row) throw notFound();
    return c.json(row);
  })
  .delete('/materials/:id', async (c) => {
    requirePerm(c, 'education.manage');
    const { db } = c.get('deps');
    await db.delete(eduMaterials).where(eq(eduMaterials.id, param(c, 'id')));
    return c.json({ ok: true });
  })
  /* daily challenges */
  .get('/daily-challenges', async (c) => {
    requirePerm(c, 'challenge.manage');
    const { db } = c.get('deps');
    const rows = await db
      .select()
      .from(dailyChallenges)
      .where(gte(dailyChallenges.day, dayKey(Date.now() - 30 * 86400_000)))
      .orderBy(desc(dailyChallenges.day))
      .limit(120);
    return c.json({ items: rows.map((r) => ({ ...r, createdAt: r.createdAt.getTime() })) });
  })
  .put('/daily-challenges', async (c) => {
    const actor = requirePerm(c, 'challenge.manage');
    const { db } = c.get('deps');
    const input = await body(c, dailyChallengeSchema);
    const values = { ...input, question: input.question ?? null, answer: input.answer ?? null, createdBy: actor.id };
    await db.insert(dailyChallenges).values(values).onConflictDoUpdate({ target: dailyChallenges.day, set: values });
    return c.json({ ok: true });
  })
  .delete('/daily-challenges/:day', async (c) => {
    requirePerm(c, 'challenge.manage');
    const { db } = c.get('deps');
    await db.delete(dailyChallenges).where(eq(dailyChallenges.day, c.req.param('day')));
    return c.json({ ok: true });
  })
  /* root-only: feature controls & site settings */
  .get('/features', async (c) => {
    requirePerm(c, 'features.manage');
    const { db } = c.get('deps');
    return c.json({ features: normalizeFeatureControls(await getRawSetting(db, 'features')) });
  })
  .put('/features', async (c) => {
    const actor = requirePerm(c, 'features.manage');
    const deps = c.get('deps');
    const input = await body(c, featureControlsSchema);
    const normalized = normalizeFeatureControls(input);
    await putSetting(deps.db, 'features', normalized, actor.id);
    await audit(deps.db, actor.id, 'features.update', undefined, undefined, { count: Object.keys(normalized).length });
    await deps.realtime.publish(ch.site(), 'config:changed', {});
    return c.json({ features: normalized });
  })
  .get('/settings', async (c) => {
    requirePerm(c, 'site.manage');
    const { db, env } = c.get('deps');
    return c.json(await getSettings(db, env.AI_DAILY_QUOTA));
  })
  .put('/settings', async (c) => {
    const actor = requirePerm(c, 'site.manage');
    const deps = c.get('deps');
    const input = await body(c, siteSettingsSchema);
    for (const [key, value] of Object.entries(input)) if (value !== undefined) await putSetting(deps.db, key, value, actor.id);
    await audit(deps.db, actor.id, 'settings.update', undefined, undefined, { keys: Object.keys(input) });
    await deps.realtime.publish(ch.site(), 'config:changed', {});
    return c.json(await getSettings(deps.db, deps.env.AI_DAILY_QUOTA));
  })
  /* monitoring */
  .get('/errors', async (c) => {
    requirePerm(c, 'errors.view');
    const { db } = c.get('deps');
    const rows = await db.select().from(clientErrors).orderBy(desc(clientErrors.lastSeenAt)).limit(200);
    return c.json({
      items: rows.map((e): ClientErrorDto => ({
        id: e.id,
        message: e.message,
        kind: e.kind,
        url: e.url,
        count: e.count,
        lastSeenAt: e.lastSeenAt.getTime(),
        firstSeenAt: e.firstSeenAt.getTime(),
        sampleStack: e.sampleStack,
      })),
    });
  })
  .delete('/errors', async (c) => {
    const actor = requirePerm(c, 'errors.view');
    const { db } = c.get('deps');
    await db.delete(clientErrors);
    await audit(db, actor.id, 'errors.clear');
    return c.json({ ok: true });
  })
  .get('/audit', async (c) => {
    requirePerm(c, 'audit.view');
    const { db } = c.get('deps');
    const q = query(c, paginationSchema);
    const cursor = decodeCursor(q.cursor);
    const rows = await db
      .select({ a: auditLog, ...reporterCols })
      .from(auditLog)
      .leftJoin(users, eq(users.id, auditLog.actorId))
      .where(cursor ? sql`(${auditLog.createdAt}, ${auditLog.id}) < (to_timestamp(${cursor.t} / 1000.0), ${cursor.id})` : undefined)
      .orderBy(desc(auditLog.createdAt), desc(auditLog.id))
      .limit(q.limit + 1);
    const page = pageOf(rows, q.limit, (r) => ({ t: r.a.createdAt, id: r.a.id }));
    const items: AuditEntryDto[] = page.items.map((r) => ({
      id: r.a.id,
      actor: r.repId ? toSummary(pickSummary('rep', r as unknown as Record<string, unknown>)) : null,
      action: r.a.action,
      targetType: r.a.targetType,
      targetId: r.a.targetId,
      data: r.a.data,
      createdAt: r.a.createdAt.getTime(),
    }));
    return c.json({ items, nextCursor: page.nextCursor });
  })
  /* assistant knowledge base */
  .get('/assistant-knowledge', async (c) => {
    requirePerm(c, 'assistant.manage');
    const { db } = c.get('deps');
    const rows = await db.select().from(assistantKnowledge).orderBy(desc(assistantKnowledge.createdAt)).limit(1000);
    return c.json({
      items: rows.map((k): AssistantKnowledgeDto => ({
        id: k.id,
        question: k.question,
        answer: k.answer,
        tags: k.tags,
        language: k.language as AssistantKnowledgeDto['language'],
        link: k.link,
        createdAt: k.createdAt.getTime(),
      })),
    });
  })
  .post('/assistant-knowledge', async (c) => {
    requirePerm(c, 'assistant.manage');
    const { db } = c.get('deps');
    const input = await body(c, z.union([assistantKnowledgeSchema, z.object({ items: z.array(assistantKnowledgeSchema).min(1).max(500) })]));
    const list = 'items' in input ? input.items : [input];
    await db
      .insert(assistantKnowledge)
      .values(list.map((k) => ({ ...k, link: k.link ?? null, searchText: normalizeSearch(`${k.question} ${k.tags.join(' ')} ${k.answer.slice(0, 300)}`) })));
    return c.json({ ok: true, added: list.length }, 201);
  })
  .put('/assistant-knowledge/:id', async (c) => {
    requirePerm(c, 'assistant.manage');
    const { db } = c.get('deps');
    const k = await body(c, assistantKnowledgeSchema);
    const [row] = await db
      .update(assistantKnowledge)
      .set({ ...k, link: k.link ?? null, searchText: normalizeSearch(`${k.question} ${k.tags.join(' ')} ${k.answer.slice(0, 300)}`) })
      .where(eq(assistantKnowledge.id, param(c, 'id')))
      .returning();
    if (!row) throw notFound();
    return c.json({ ok: true });
  })
  .delete('/assistant-knowledge/:id', async (c) => {
    requirePerm(c, 'assistant.manage');
    const { db } = c.get('deps');
    await db.delete(assistantKnowledge).where(eq(assistantKnowledge.id, param(c, 'id')));
    return c.json({ ok: true });
  })
  .get('/assistant-feedback', async (c) => {
    requirePerm(c, 'assistant.manage');
    const { db } = c.get('deps');
    const rows = await db
      .select({
        id: assistantMessages.id,
        content: assistantMessages.content,
        rating: assistantMessages.rating,
        feedback: assistantMessages.feedback,
        createdAt: assistantMessages.createdAt,
      })
      .from(assistantMessages)
      .where(sql`${assistantMessages.rating} is not null`)
      .orderBy(desc(assistantMessages.createdAt))
      .limit(200);
    const [up] = await db.select({ n: count() }).from(assistantMessages).where(eq(assistantMessages.rating, 'up'));
    const [down] = await db.select({ n: count() }).from(assistantMessages).where(eq(assistantMessages.rating, 'down'));
    return c.json({ up: up?.n ?? 0, down: down?.n ?? 0, items: rows.map((r) => ({ ...r, createdAt: r.createdAt.getTime() })) });
  })
  /* maintenance */
  .post('/maintenance/cleanup', async (c) => {
    const actor = requirePerm(c, 'site.manage');
    const { db } = c.get('deps');
    const now = new Date();
    const s = await db
      .delete(sessions)
      .where(or(lt(sessions.expiresAt, now), lt(sessions.revokedAt, new Date(Date.now() - 7 * 86400_000))))
      .returning({ id: sessions.id });
    const t = await db.delete(emailTokens).where(lt(emailTokens.expiresAt, now)).returning({ id: emailTokens.id });
    const n = await db
      .delete(notifications)
      .where(and(lt(notifications.createdAt, new Date(Date.now() - 180 * 86400_000)), sql`${notifications.readAt} is not null`))
      .returning({ id: notifications.id });
    const a = await db
      .delete(quizAttempts)
      .where(and(isNull(quizAttempts.submittedAt), lt(quizAttempts.expiresAt, new Date(Date.now() - 86400_000))))
      .returning({ id: quizAttempts.id });
    const st = await db
      .delete(stories)
      .where(lt(stories.expiresAt, new Date(Date.now() - 86400_000)))
      .returning({ id: stories.id });
    const vv = await db.execute(sql`delete from video_views where day < current_date - 400`);
    await audit(db, actor.id, 'maintenance.cleanup', undefined, undefined, {
      stories: st.length,
      videoViews: vv.count,
      sessions: s.length,
      tokens: t.length,
      notifications: n.length,
      attempts: a.length,
    });
    return c.json({ sessions: s.length, tokens: t.length, notifications: n.length, abandonedAttempts: a.length, stories: st.length });
  })
  .post('/maintenance/recompute-levels', async (c) => {
    const actor = requirePerm(c, 'site.manage');
    const { db } = c.get('deps');
    const rows = await db.select({ id: users.id, xp: users.xp, level: users.level }).from(users);
    let fixed = 0;
    for (const r of rows) {
      const level = levelFromXp(r.xp);
      if (level !== r.level) {
        await db.update(users).set({ level }).where(eq(users.id, r.id));
        fixed++;
      }
    }
    await audit(db, actor.id, 'maintenance.recompute_levels', undefined, undefined, { fixed });
    return c.json({ checked: rows.length, fixed });
  })
  .get('/teachers', async (c) => {
    requirePerm(c, 'users.view');
    const { db } = c.get('deps');
    const rows = await db.select(summaryColumns).from(users).where(eq(users.accountType, 'teacher')).orderBy(desc(users.createdAt)).limit(200);
    return c.json({ items: rows.map(toSummary) });
  });
