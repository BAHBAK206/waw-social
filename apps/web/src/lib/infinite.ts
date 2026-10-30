import { useInfiniteQuery, type QueryClient, type QueryKey } from '@tanstack/react-query';
import type { Page } from '@qubedu/shared';
import { useEffect, useRef } from 'react';

/** Cursor-paginated list: flattens pages and exposes helpers for "load more" / infinite scroll. */
export function usePaged<T>(key: QueryKey, fetchPage: (cursor: string | undefined) => Promise<Page<T>>, enabled = true) {
  const query = useInfiniteQuery({
    queryKey: key,
    queryFn: ({ pageParam }) => fetchPage(pageParam),
    initialPageParam: undefined as string | undefined,
    getNextPageParam: (last) => last.nextCursor ?? undefined,
    enabled,
  });
  const items = query.data?.pages.flatMap((p) => p.items) ?? [];
  return { ...query, items };
}

/** Fires `onVisible` when the sentinel scrolls into view (infinite scroll). */
export function useSentinel(onVisible: () => void, enabled: boolean) {
  const ref = useRef<HTMLDivElement>(null);
  const cb = useRef(onVisible);
  cb.current = onVisible;
  useEffect(() => {
    const el = ref.current;
    if (!el || !enabled) return;
    const io = new IntersectionObserver((entries) => entries[0]?.isIntersecting && cb.current(), { rootMargin: '600px' });
    io.observe(el);
    return () => io.disconnect();
  }, [enabled]);
  return ref;
}

type InfiniteData<T> = { pages: { items: T[]; nextCursor: string | null }[]; pageParams: unknown[] };

/** Applies `fn` to the item with `id` inside a cached infinite query without refetching. */
export function patchItem<T extends { id: string }>(qc: QueryClient, key: QueryKey, id: string, fn: (item: T) => T) {
  qc.setQueryData<InfiniteData<T>>(key, (data) =>
    data ? { ...data, pages: data.pages.map((p) => ({ ...p, items: p.items.map((i) => (i.id === id ? fn(i) : i)) })) } : data,
  );
}

export function removeItem<T extends { id: string }>(qc: QueryClient, key: QueryKey, id: string) {
  qc.setQueryData<InfiniteData<T>>(key, (data) =>
    data ? { ...data, pages: data.pages.map((p) => ({ ...p, items: p.items.filter((i) => i.id !== id) })) } : data,
  );
}
