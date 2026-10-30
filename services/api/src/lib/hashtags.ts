import { and, eq } from 'drizzle-orm';
import { extractHashtags } from '@qubedu/shared';
import { hashtagUses } from '../db/schema';
import type { Db } from '../db/client';

type Subject = 'post' | 'video';

/** Replaces the hashtag index for a post/video. Accepts extra tags (video tag field). */
export async function syncHashtags(db: Db, subjectType: Subject, subjectId: string, authorId: string, text: string, extra: string[] = []): Promise<string[]> {
  const tags = [...new Set([...extractHashtags(text), ...extra.map((t) => t.toLowerCase())])].slice(0, 20);
  await db.delete(hashtagUses).where(and(eq(hashtagUses.subjectType, subjectType), eq(hashtagUses.subjectId, subjectId)));
  if (tags.length) await db.insert(hashtagUses).values(tags.map((tag) => ({ tag, subjectType, subjectId, authorId })));
  return tags;
}

export async function removeHashtags(db: Db, subjectType: Subject, subjectId: string) {
  await db.delete(hashtagUses).where(and(eq(hashtagUses.subjectType, subjectType), eq(hashtagUses.subjectId, subjectId)));
}
