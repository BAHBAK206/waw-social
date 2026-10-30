import type { NotificationDto } from '@qubedu/shared';
import { useInfiniteQuery, useQueryClient } from '@tanstack/react-query';
import { Bell, CheckCheck, Trash2, X } from 'lucide-react';
import { useEffect } from 'react';
import { createPortal } from 'react-dom';
import { useNavigate } from 'react-router';
import { Avatar } from '@/components/ui/Avatar';
import { Button } from '@/components/ui/Button';
import { EmptyState, ErrorState, LoadMore, Spinner } from '@/components/ui/States';
import { api } from '@/lib/api';
import { cx } from '@/lib/cx';
import { relativeTime } from '@/lib/format';
import { useT } from '@/lib/i18n';
import { qk } from '@/lib/query';
import { useSession } from '@/lib/session';
import { toastError, useUi } from '@/lib/ui';

/** Localized text from the notification type + data (the server stores a neutral fallback title). */
export function notificationText(n: NotificationDto, tr: ReturnType<typeof useT>): string {
  const vars: Record<string, string | number> = { name: n.actor?.displayName ?? '' };
  for (const [k, v] of Object.entries(n.data ?? {})) if (typeof v === 'string' || typeof v === 'number') vars[k] = v;
  if (n.type === 'broadcast') return n.title;
  return tr.tDyn(`notifications.types.${n.type}`, vars, n.title);
}

export default function NotificationsPanel() {
  const tr = useT();
  const qc = useQueryClient();
  const navigate = useNavigate();
  const close = () => useUi.getState().set({ notificationsOpen: false });
  const query = useInfiniteQuery({
    queryKey: qk.notifications,
    queryFn: ({ pageParam }) => api.notifications.list({ cursor: pageParam, limit: 20 }),
    initialPageParam: undefined as string | undefined,
    getNextPageParam: (last) => last.nextCursor ?? undefined,
  });
  const items = query.data?.pages.flatMap((p) => p.items) ?? [];

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => e.key === 'Escape' && close();
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, []);

  const markAll = async () => {
    try {
      await api.notifications.read();
      useSession.getState().patchMe({ unreadNotifications: 0 });
      await qc.invalidateQueries({ queryKey: qk.notifications });
    } catch (e) {
      toastError(e);
    }
  };

  const open = async (n: NotificationDto) => {
    if (!n.read) {
      void api.notifications.read([n.id]).catch(() => undefined);
      const me = useSession.getState().me;
      if (me) useSession.getState().patchMe({ unreadNotifications: Math.max(0, me.unreadNotifications - 1) });
    }
    close();
    if (n.link) {
      if (/^https?:/.test(n.link)) window.open(n.link, '_blank', 'noopener');
      else navigate(n.link);
    }
  };

  return createPortal(
    <div className="fixed inset-0 z-[75]" role="dialog" aria-modal="true" aria-label={tr.t('notifications.title')}>
      <div className="animate-fade absolute inset-0 bg-[var(--overlay)]" onClick={close} />
      <aside className="animate-pop absolute inset-y-0 end-0 flex w-full max-w-md flex-col bg-[var(--card-solid)] shadow-2xl">
        <div className="flex items-center gap-2 border-b border-line px-4 py-3">
          <Bell className="size-5 text-ink" aria-hidden />
          <h2 className="flex-1 text-lg font-black">{tr.t('notifications.title')}</h2>
          <Button size="sm" variant="ghost" icon={<CheckCheck className="size-4" />} onClick={markAll}>
            {tr.t('notifications.markAll')}
          </Button>
          <button type="button" className="icon-btn" aria-label={tr.t('common.close')} onClick={close}>
            <X className="size-5" />
          </button>
        </div>
        <div className="scroll-thin flex-1 overflow-y-auto">
          {query.isPending ? (
            <Spinner />
          ) : query.error ? (
            <ErrorState error={query.error} onRetry={() => void query.refetch()} />
          ) : !items.length ? (
            <EmptyState icon={<Bell className="size-7" />} title={tr.t('notifications.empty')} />
          ) : (
            <ul>
              {items.map((n) => (
                <li key={n.id} className={cx('group flex items-start gap-3 border-b border-line px-4 py-3', !n.read && 'bg-soft')}>
                  <button type="button" className="flex min-w-0 flex-1 items-start gap-3 text-start" onClick={() => void open(n)}>
                    {n.actor ? (
                      <Avatar name={n.actor.displayName} url={n.actor.avatarUrl} size="md" />
                    ) : (
                      <span className="surface-gradient grid size-10 shrink-0 place-items-center rounded-full text-lg">{n.icon || '🔔'}</span>
                    )}
                    <span className="min-w-0 flex-1">
                      <span className="block text-sm font-bold">{notificationText(n, tr)}</span>
                      {n.body && n.type === 'broadcast' && <span className="muted line-clamp-2 block text-sm">{n.body}</span>}
                      <span className="muted text-xs">{relativeTime(n.createdAt, tr)}</span>
                    </span>
                  </button>
                  <button
                    type="button"
                    className="icon-btn icon-btn-sm opacity-60 group-hover:opacity-100"
                    aria-label={tr.t('common.delete')}
                    onClick={async () => {
                      try {
                        await api.notifications.remove(n.id);
                        await qc.invalidateQueries({ queryKey: qk.notifications });
                      } catch (e) {
                        toastError(e);
                      }
                    }}
                  >
                    <Trash2 className="size-4" />
                  </button>
                </li>
              ))}
            </ul>
          )}
          <LoadMore hasMore={!!query.hasNextPage} loading={query.isFetchingNextPage} onClick={() => void query.fetchNextPage()} />
        </div>
        {!!items.length && (
          <div className="border-t border-line p-3">
            <Button
              variant="ghost"
              block
              onClick={async () => {
                try {
                  await api.notifications.clear();
                  useSession.getState().patchMe({ unreadNotifications: 0 });
                  await qc.invalidateQueries({ queryKey: qk.notifications });
                } catch (e) {
                  toastError(e);
                }
              }}
            >
              {tr.t('notifications.clear')}
            </Button>
          </div>
        )}
      </aside>
    </div>,
    document.body,
  );
}
