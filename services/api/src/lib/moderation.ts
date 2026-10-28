import { and, countDistinct, eq, isNotNull, lt, or, sql } from 'drizzle-orm';
import type { Db } from '../db/client';
import { comments, events, groups, messages, posts, reports, stories, users, videoComments, videos } from '../db/schema';

/** Content that can be hidden (soft-deleted) by a moderator or automatically by reports, and who wrote it. */
const TARGETS = {
  post: { table: posts, id: posts.id, author: posts.authorId, deleted: posts.deletedAt },
  comment: { table: comments, id: comments.id, author: comments.authorId, deleted: comments.deletedAt },
  message: { table: messages, id: messages.id, author: messages.senderId, deleted: messages.deletedAt },
  video_comment: { table: videoComments, id: videoComments.id, author: videoComments.authorId, deleted: videoComments.deletedAt },
  story: { table: stories, id: stories.id, author: stories.authorId, deleted: stories.deletedAt },
  video: { table: videos, id: videos.id, author: videos.ownerId, deleted: videos.deletedAt },
  event: { table: events, id: events.id, author: events.hostId, deleted: events.deletedAt },
  group: { table: groups, id: groups.id, author: groups.ownerId, deleted: groups.deletedAt },
} as const;
type HideableType = keyof typeof TARGETS;

/** Small items people post; a whole lesson, workshop or group is never hidden without a moderator. */
const AUTO_HIDE_TYPES: ReadonlySet<string> = new Set(['post', 'comment', 'message', 'video_comment', 'story']);

const isUuid = (s: string) => /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(s);

export function isHideable(type: string): type is HideableType {
  return type in TARGETS;
}

export async function setHidden(db: Db, type: string, targetId: string, hidden: boolean) {
  if (!isHideable(type) || !isUuid(targetId)) return;
  const t = TARGETS[type];
  // Each branch is typed against its own table; the shared shape keeps this one statement.
  await db
    .update(t.table as typeof posts)
    .set({ deletedAt: hidden ? new Date() : null })
    .where(eq(t.id as typeof posts.id, targetId));
}

export async function targetAuthor(db: Db, type: string, targetId: string): Promise<string | null> {
  if (!isHideable(type) || !isUuid(targetId)) return null;
  const t = TARGETS[type];
  const [row] = await db
    .select({ author: t.author as typeof posts.authorId })
    .from(t.table as typeof posts)
    .where(eq(t.id as typeof posts.id, targetId));
  return row?.author ?? null;
}

/**
 * After a new report: when enough different, established members report the same small item, hide it until a
 * moderator looks. Brand-new accounts don't count (so one person can't hide content with throwaway sign-ups), and
 * staff content is never auto-hidden. Returns true when the item was hidden.
 */
export async function maybeAutoHide(db: Db, type: string, targetId: string, threshold: number): Promise<boolean> {
  if (threshold <= 0 || !AUTO_HIDE_TYPES.has(type)) return false;
  const dayAgo = new Date(Date.now() - 24 * 3600_000);
  const [n] = await db
    .select({ n: countDistinct(reports.reporterId) })
    .from(reports)
    .innerJoin(users, eq(users.id, reports.reporterId))
    .where(
      and(
        eq(reports.targetType, type),
        eq(reports.targetId, targetId),
        eq(reports.status, 'open'),
        or(isNotNull(users.emailVerifiedAt), lt(users.createdAt, dayAgo)),
      ),
    );
  if ((n?.n ?? 0) < threshold) return false;
  const author = await targetAuthor(db, type, targetId);
  if (!author) return false;
  const [a] = await db.select({ role: users.role }).from(users).where(eq(users.id, author));
  if (a && a.role !== 'user') return false;
  await setHidden(db, type, targetId, true);
  await db
    .update(reports)
    .set({ autoHidden: true })
    .where(and(eq(reports.targetType, type), eq(reports.targetId, targetId), eq(reports.status, 'open')));
  return true;
}

/** SQL: who wrote the reported item (or the reported person), for the report row in `reports`. */
export const reportAuthorSql = sql.raw(`(case reports.target_type
  when 'user' then (select x.id from users x where x.id::text = reports.target_id)
  when 'post' then (select x.author_id from posts x where x.id::text = reports.target_id)
  when 'comment' then (select x.author_id from comments x where x.id::text = reports.target_id)
  when 'message' then (select x.sender_id from messages x where x.id::text = reports.target_id)
  when 'video_comment' then (select x.author_id from video_comments x where x.id::text = reports.target_id)
  when 'story' then (select x.author_id from stories x where x.id::text = reports.target_id)
  when 'video' then (select x.owner_id from videos x where x.id::text = reports.target_id)
  when 'event' then (select x.host_id from events x where x.id::text = reports.target_id)
  when 'group' then (select x.owner_id from groups x where x.id::text = reports.target_id)
  end)`);
