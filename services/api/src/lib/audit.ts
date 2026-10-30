import type { Db } from '../db/client';
import { auditLog } from '../db/schema';

export async function audit(db: Db, actorId: string | null, action: string, targetType?: string, targetId?: string, data: Record<string, unknown> = {}) {
  await db.insert(auditLog).values({ actorId, action, targetType: targetType ?? null, targetId: targetId ?? null, data });
}
