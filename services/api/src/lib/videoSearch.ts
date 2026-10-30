import { and, eq, or, sql, type SQL } from 'drizzle-orm';
import { normalizeSearch } from '@qubedu/shared';
import { videoCaptions, videos } from '../db/schema';
import type { Deps } from './context';

/** Title, tags, description and what is said in the lesson (its captions), normalized for search. */
export async function refreshVideoSearchText(deps: Deps, videoId: string) {
  const [v] = await deps.db.select({ title: videos.title, description: videos.description, tags: videos.tags }).from(videos).where(eq(videos.id, videoId));
  if (!v) return;
  const tracks = await deps.db.select({ cues: videoCaptions.cues }).from(videoCaptions).where(eq(videoCaptions.videoId, videoId));
  const transcript = tracks
    .flatMap((t) => t.cues.map((c) => c.text))
    .join(' ')
    .slice(0, 20_000);
  await deps.db
    .update(videos)
    .set({ searchText: normalizeSearch(`${v.title} ${v.tags.join(' ')} ${v.description.slice(0, 500)} ${transcript}`) })
    .where(eq(videos.id, videoId));
}

/** Every word of the query appears somewhere (any order), or the whole query is close by trigram similarity. */
export function videoSearchFilter(term: string): SQL | undefined {
  const words = term
    .split(/\s+/)
    .filter((w) => w.length > 1)
    .slice(0, 8);
  if (!words.length) return undefined;
  return or(and(...words.map((w) => sql`${videos.searchText} ilike ${`%${w.replace(/[%_]/g, '')}%`}`)), sql`${videos.searchText} % ${term}`);
}
