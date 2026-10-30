import { and, count, eq, isNull, sql } from 'drizzle-orm';
import {
  DEFAULT_APPEARANCE,
  dayKey,
  notificationPrefsSchema,
  permissionsFor,
  privacySchema,
  type Appearance,
  type GradeLevel,
  type Me,
  type PublicProfile,
} from '@qubedu/shared';
import { conversationMembers, conversations, follows, guardianLinks, messages, notifications, studyLog, userAchievements, users } from '../db/schema';
import type { Deps } from './context';
import { notFound } from './errors';
import { ms, onlineKey, toSummary } from './mappers';
import { controlsOf, isMinor, isParentOfStudentTaughtBy, knowsMinor, minorColumns, minorContactAllowed, tierOf, type MinorRow, consentPending } from './minors';

type UserRow = typeof users.$inferSelect;

export function appearanceOf(row: UserRow): Appearance {
  return { ...DEFAULT_APPEARANCE, ...(row.appearance as Partial<Appearance>) };
}

export function privacyOf(row: UserRow) {
  return privacySchema.parse(row.privacy ?? {});
}

async function canMessage(deps: Deps, target: UserRow, viewer: MinorRow | null): Promise<boolean> {
  if (!viewer || viewer.id === target.id) return false;
  if ((await minorContactAllowed(deps.db, target, viewer)) === false) return false;
  const p = privacyOf(target);
  if (p.allowMessages === 'everyone') return true;
  if (p.allowMessages === 'none') return false;
  // Parents can always reach the teachers of their child's classes.
  if (await isParentOfStudentTaughtBy(deps.db, viewer.id, target.id)) return true;
  const [f] = await deps.db
    .select({ n: count() })
    .from(follows)
    .where(and(eq(follows.followerId, target.id), eq(follows.followeeId, viewer.id)));
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
  const [viewerRow] = viewerId && !self ? await db.select(minorColumns).from(users).where(eq(users.id, viewerId)) : [];
  // A student under 18 shows school and activity details only to people they already know.
  // "Signed-in members only": visitors who aren't signed in (public channel pages) see just the name and photo.
  const membersOnly = !viewerId && privacy.profileVisibility === 'members';
  const guarded = membersOnly || (!self && isMinor(row) && !(viewerId && (await knowsMinor(db, row, viewerId))));
  return {
    ...toSummary(row),
    online: !guarded && (self || privacy.showOnline) ? !!online : false,
    bio: membersOnly ? '' : row.bio,
    coverUrl: membersOnly ? null : row.coverUrl,
    institution: guarded ? null : row.institution,
    educationLevel: guarded ? null : row.educationLevel,
    gradeLevel: guarded ? null : ((row.gradeLevel as GradeLevel | null) ?? null),
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
    canMessage: await canMessage(deps, row, viewerRow ?? null),
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
  const [profile, [unread], [todayLog], unreadMessages, [guardians]] = await Promise.all([
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
    deps.db.select({ n: count() }).from(guardianLinks).where(eq(guardianLinks.studentId, userId)),
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
    isMinor: isMinor(row),
    ageTier: tierOf(row),
    parentalControls: controlsOf(row),
    guardianCount: guardians?.n ?? 0,
    twoFactor: !!row.totpEnabledAt,
    consentPending: consentPending(row),
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
