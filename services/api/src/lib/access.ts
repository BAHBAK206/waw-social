import { and, eq, isNull } from 'drizzle-orm';
import type { Db } from '../db/client';
import { conversationMembers, conversations, courseMembers, groupMembers, groups, liveRooms } from '../db/schema';
import { forbidden, notFound } from './errors';

export type GroupRole = 'owner' | 'admin' | 'teacher' | 'member';
export type CourseRole = 'teacher' | 'assistant' | 'student';

export async function groupRole(db: Db, groupId: string, userId: string): Promise<GroupRole | null> {
  const [m] = await db
    .select({ role: groupMembers.role })
    .from(groupMembers)
    .where(and(eq(groupMembers.groupId, groupId), eq(groupMembers.userId, userId)));
  return m?.role ?? null;
}

export async function loadGroup(db: Db, groupId: string) {
  const [g] = await db
    .select()
    .from(groups)
    .where(and(eq(groups.id, groupId), isNull(groups.deletedAt)));
  if (!g) throw notFound('group_not_found');
  return g;
}

export async function courseRole(db: Db, courseId: string, userId: string): Promise<CourseRole | null> {
  const [m] = await db
    .select({ role: courseMembers.role })
    .from(courseMembers)
    .where(and(eq(courseMembers.courseId, courseId), eq(courseMembers.userId, userId)));
  return m?.role ?? null;
}

export async function requireCourseRole(db: Db, courseId: string, userId: string, allowed: CourseRole[], isStaff = false): Promise<CourseRole> {
  const role = await courseRole(db, courseId, userId);
  if (isStaff && !role) return 'teacher';
  if (!role) throw notFound('course_not_found');
  if (!allowed.includes(role)) throw forbidden('course_forbidden');
  return role;
}

type LiveRoomRow = typeof liveRooms.$inferSelect;

export async function canAccessLiveRoom(db: Db, room: LiveRoomRow, userId: string): Promise<boolean> {
  if (room.hostId === userId || room.scopeType === 'open' || !room.scopeId) return true;
  if (room.scopeType === 'course') return !!(await courseRole(db, room.scopeId, userId));
  return !!(await groupRole(db, room.scopeId, userId));
}

export async function canModerateLiveRoom(db: Db, room: LiveRoomRow, userId: string): Promise<boolean> {
  if (room.hostId === userId) return true;
  if (!room.scopeId) return false;
  if (room.scopeType === 'course') {
    const r = await courseRole(db, room.scopeId, userId);
    return r === 'teacher' || r === 'assistant';
  }
  if (room.scopeType === 'group' || room.scopeType === 'community') {
    const r = await groupRole(db, room.scopeId, userId);
    return r === 'owner' || r === 'admin' || r === 'teacher';
  }
  return false;
}

/** Resolves a conversation and checks that the user may read/post in it. */
export async function conversationAccess(db: Db, conversationId: string, userId: string) {
  const [conv] = await db.select().from(conversations).where(eq(conversations.id, conversationId));
  if (!conv) throw notFound('conversation_not_found');
  if (conv.kind === 'direct') {
    const [m] = await db
      .select()
      .from(conversationMembers)
      .where(and(eq(conversationMembers.conversationId, conversationId), eq(conversationMembers.userId, userId)));
    if (!m) throw notFound('conversation_not_found');
    return { conv, groupRole: null as GroupRole | null };
  }
  if (conv.kind === 'live') {
    const [room] = await db.select().from(liveRooms).where(eq(liveRooms.conversationId, conversationId));
    if (!room || !(await canAccessLiveRoom(db, room, userId))) throw forbidden('conversation_forbidden');
    return { conv, groupRole: null };
  }
  if (!conv.groupId) throw notFound('conversation_not_found');
  const role = await groupRole(db, conv.groupId, userId);
  if (!role) throw forbidden('not_a_member');
  return { conv, groupRole: role };
}

/** Ensures a membership row exists (used for unread tracking in group/channel/live conversations). */
export async function ensureConversationMember(db: Db, conversationId: string, userId: string) {
  await db.insert(conversationMembers).values({ conversationId, userId }).onConflictDoNothing();
}
