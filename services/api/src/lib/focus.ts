import { and, gte, inArray, isNull, sql } from 'drizzle-orm';
import { focusSessions } from '../db/schema';
import type { Deps } from './context';

/** Users who are in a focus session right now (their push notifications are held back). */
export async function focusingNow(deps: Deps, userIds: string[]): Promise<Set<string>> {
  if (!userIds.length) return new Set();
  const rows = await deps.db
    .select({ id: focusSessions.id, userId: focusSessions.userId })
    .from(focusSessions)
    .where(and(inArray(focusSessions.userId, userIds), isNull(focusSessions.endedAt), gte(focusSessions.endsAt, new Date())));
  if (rows.length) {
    await deps.db
      .update(focusSessions)
      .set({ muted: sql`${focusSessions.muted} + 1` })
      .where(
        inArray(
          focusSessions.id,
          rows.map((r) => r.id),
        ),
      );
  }
  return new Set(rows.map((r) => r.userId));
}
