import { and, count, eq, isNull, sql } from 'drizzle-orm';
import {
  DEFAULT_APPEARANCE,
  dayKey,
  notificationPrefsSchema,
  permissionsFor,
  privacySchema,
  type Appearance,
  type Me,
  type PublicProfile,
} from '@qubedu/shared';
import { conversationMembers, conversations, follows, messages, notifications, studyLog, userAchievements, users } from '../db/schema';
import type { Deps } from './context';
import { notFound } from './errors';
import { ms, onlineKey, toSummary } from './mappers';
import { isMinor, knowsMinor } from './minors';

type UserRow = typeof users.$inferSelect;

export function appearanceOf(row: UserRow): Appearance {
  return { ...DEFAULT_APPEARANCE, ...(row.appearance as Partial<Appearance>) };
}

export function privacyOf(row: UserRow) {
  return privacySchema.parse(row.privacy ?? {});
}

/**
 * Under-18 rule, applied on top of everyone's own message setting: an adult and a student under 18 can only message
 * each other when the student already knows them (follows them, same study group or course). Returns null when the
 * rule doesn't apply (both adults, or both under 18).
 */
export async function minorContactAllowed(deps: Deps, a: Pick<UserRow, 'id' | 'birthYear'>, b: Pick<UserRow, 'id' | 'birthYear'>): Promise<boolean | null> {
  const am = isMinor(a.birthYear);
  const bm = isMinor(b.birthYear);
  if (am === bm) return null;
  return am ? knowsMinor(deps.db, a.id, b.id) : knowsMinor(deps.db, b.id, a.id);
}

async function canMessage(deps: Deps, target: UserRow, viewerId: string | null, viewerBirthYear: number | null): Promise<boolean> {
  if (!viewerId || viewerId === target.id) return false;
  if ((await minorContactAllowed(deps, target, { id: viewerId, birthYear: viewerBirthYear })) === false) return false;
  const p = privacyOf(target);
  if (p.allowMessages === 'everyone') return true;
  if (p.allowMessages === 'none') return false;
  const [f] = await deps.db
    .select({ n: count() })
    .from(follows)
    .where(and(eq(follows.followerId, target.id), eq(follows.followeeId, viewerId)));
  return (f?.n ?? 0) > 0;
}

export async function buildProfile(deps: Deps, row: UserRow, viewerId: string | null): Promise<PublicProfile> {
  const { db, kv } = deps;
  const [[followers], [following], isFollowing, followsYou, achievements, [online]] = await Promise.all([
    db.select({ n: count() }).from(follows).where(eq(follows.followeeId, row.id)),
    db.select({ n: count() }).from(follows).where(eq(follows.followerId, row.id)),
    viewerId
      ? db
          .select({ n: count() })
          .from(follows)
          .where(and(eq(follows.followerId, viewerId), eq(follows.followeeId, row.id)))
      : Promise.resolve([{ n: 0 }]),
    viewerId
      ? db
          .select({ n: count() })
          .from(follows)
          .where(and(eq(follows.followerId, row.id), eq(follows.followeeId, viewerId)))
      : Promise.resolve([{ n: 0 }]),
    db.select().from(userAchievements).where(eq(userAchievements.userId, row.id)),
    kv.existsMany([onlineKey(row.id)]),
  ]);
  const privacy = privacyOf(row);
  const self = viewerId === row.id;
  const statsHidden = !self && !privacy.showStats;
  const [viewerRow] = viewerId && !self ? await db.select({ birthYear: users.birthYear }).from(users).where(eq(users.id, viewerId)) : [];
  // A student under 18 shows school and activity details only to people they already know.
  const guarded = !self && isMinor(row.birthYear) && !(viewerId && (await knowsMinor(db, row.id, viewerId)));
  return {
    ...toSummary(row),
    online: !guarded && (self || privacy.showOnline) ? !!online : false,
    bio: row.bio,
    coverUrl: row.coverUrl,
    institution: guarded ? null : row.institution,
    educationLevel: guarded ? null : row.educationLevel,
    streak: statsHidden ? 0 : row.streak,
    quizCount: statsHidden ? 0 : row.quizCount,
    studyMinutes: statsHidden ? 0 : row.studyMinutes,
    followers: followers?.n ?? 0,
    following: following?.n ?? 0,
    isFollowing: (isFollowing[0]?.n ?? 0) > 0,
    followsYou: (followsYou[0]?.n ?? 0) > 0,
    achievements: achievements.map((a) => ({ id: a.achievementId, unlockedAt: a.unlockedAt.getTime() })),
    createdAt: row.createdAt.getTime(),
    lastSeenAt: !guarded && (self || privacy.showOnline) ? ms(row.lastSeenAt) : null,
    canMessage: await canMessage(deps, row, viewerId, viewerRow?.birthYear ?? null),
    statsHidden,
  };
}

export async function unreadMessageCount(deps: Deps, userId: string): Promise<number> {
  const [row] = await deps.db
    .select({ n: sql<number>`count(distinct ${conversations.id})::int` })
    .from(conversationMembers)
    .innerJoin(conversations, eq(conversations.id, conversationMembers.conversationId))
    .innerJoin(messages, eq(messages.conversationId, conversations.id))
    .where(
      and(
        eq(conversationMembers.userId, userId),
        eq(conversations.kind, 'direct'),
        eq(conversationMembers.hidden, false),
        sql`${messages.senderId} <> ${userId}`,
        isNull(messages.deletedAt),
        sql`${messages.createdAt} > coalesce(${conversationMembers.lastReadAt}, to_timestamp(0))`,
      ),
    );
  return row?.n ?? 0;
}

export async function buildMe(deps: Deps, userId: string): Promise<Me> {
  const [row] = await deps.db
    .select()
    .from(users)
    .where(and(eq(users.id, userId), isNull(users.deletedAt)));
  if (!row) throw notFound('user_not_found');
  const today = dayKey(Date.now(), row.timezone);
  const [profile, [unread], [todayLog], unreadMessages] = await Promise.all([
    buildProfile(deps, row, userId),
    deps.db
      .select({ n: count() })
      .from(notifications)
      .where(and(eq(notifications.userId, userId), isNull(notifications.readAt))),
    deps.db
      .select({ minutes: studyLog.minutes })
      .from(studyLog)
      .where(and(eq(studyLog.userId, userId), eq(studyLog.day, today))),
    unreadMessageCount(deps, userId),
  ]);
  const banned = !!row.bannedAt && (!row.bannedUntil || row.bannedUntil.getTime() > Date.now());
  return {
    ...profile,
    email: row.email,
    emailVerified: !!row.emailVerifiedAt,
    role: row.role,
    permissions: permissionsFor(row.role, row.permissions),
    gender: (row.gender as 'male' | 'female' | null) ?? null,
    appearance: appearanceOf(row),
    privacy: privacyOf(row),
    birthYear: row.birthYear ?? null,
    isMinor: isMinor(row.birthYear),
    notificationPrefs: notificationPrefsSchema.parse(row.notificationPrefs ?? {}),
    timezone: row.timezone,
    dailyGoalMinutes: row.dailyGoalMinutes,
    todayMinutes: todayLog?.minutes ?? 0,
    onboardingDone: row.onboardingDone,
    banned,
    unreadNotifications: unread?.n ?? 0,
    unreadMessages,
  };
}
