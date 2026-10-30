import type { PostDto } from '@qubedu/shared';
import { useQueryClient } from '@tanstack/react-query';
import { CircleHelp, MessagesSquare } from 'lucide-react';
import { useSearchParams } from 'react-router';
import { SubjectSelect } from '@/components/common/SubjectSelect';
import { Composer } from '@/components/feed/Composer';
import { PostCard } from '@/components/feed/PostCard';
import { TrendingWidget } from '@/components/feed/TrendingWidget';
import { StoriesTray } from '@/components/stories/Stories';
import { PageHeader, EmptyState, ErrorState, CardSkeletons } from '@/components/ui/States';
import { Tabs, useTabParam } from '@/components/ui/Tabs';
import { api } from '@/lib/api';
import { patchItem, removeItem, usePaged, useSentinel } from '@/lib/infinite';
import { useT } from '@/lib/i18n';
import { cx } from '@/lib/cx';
import { qk } from '@/lib/query';

const SCOPES = ['foryou', 'questions', 'notes', 'following', 'all', 'mine'] as const;

export default function FeedPage() {
  const tr = useT();
  const qc = useQueryClient();
  const [scope, setScope] = useTabParam(SCOPES, 'foryou', 'scope');
  const [params, setParams] = useSearchParams();
  const subject = params.get('subject') ?? '';
  const unanswered = params.get('open') === '1';
  const setParam = (k: string, v: string) =>
    setParams(
      (p) => {
        const n = new URLSearchParams(p);
        if (v) n.set(k, v);
        else n.delete(k);
        return n;
      },
      { replace: true },
    );
  // Questions and notes are filters over the whole study hall; the other tabs are audiences.
  const kind = scope === 'questions' ? 'question' : scope === 'notes' ? 'note' : undefined;
  const apiScope = kind ? 'all' : (scope as 'foryou' | 'following' | 'all' | 'mine');
  const key = [...qk.feed(scope), subject, unanswered && scope === 'questions'];
  const list = usePaged<PostDto>(key, (cursor) =>
    api.posts.feed({
      scope: apiScope,
      kind,
      unanswered: scope === 'questions' && unanswered ? true : undefined,
      materialId: subject || undefined,
      cursor,
      limit: 15,
    }),
  );
  const sentinel = useSentinel(() => void list.fetchNextPage(), !!list.hasNextPage && !list.isFetchingNextPage);

  return (
    <div className="page grid gap-6 lg:grid-cols-[minmax(0,1fr)_20rem]">
      <div className="mx-auto w-full max-w-2xl space-y-4">
        <PageHeader title={tr.t('feed.title')} subtitle={tr.t('features.feed')} icon={<MessagesSquare className="size-6" />} />
        <StoriesTray />
        <Composer key={scope === 'questions' ? 'q' : 'd'} defaultKind={scope === 'questions' ? 'question' : scope === 'notes' ? 'note' : 'discussion'} />
        <Tabs
          label={tr.t('feed.title')}
          active={scope}
          onChange={setScope}
          tabs={[
            { key: 'foryou', label: tr.t('feed.scopeForYou') },
            { key: 'questions', label: tr.t('feed.scopeQuestions'), icon: <CircleHelp className="size-4" /> },
            { key: 'notes', label: tr.t('feed.scopeNotes') },
            { key: 'following', label: tr.t('feed.scopeFollowing') },
            { key: 'all', label: tr.t('feed.scopeAll') },
            { key: 'mine', label: tr.t('feed.scopeMine') },
          ]}
        />
        <div className="flex flex-wrap items-center gap-2">
          <SubjectSelect value={subject} onChange={(v) => setParam('subject', v)} emptyLabel={tr.t('feed.anySubject')} />
          {scope === 'questions' && (
            <button
              type="button"
              className={cx('chip', unanswered && 'is-active')}
              aria-pressed={unanswered}
              onClick={() => setParam('open', unanswered ? '' : '1')}
            >
              {tr.t('feed.onlyUnanswered')}
            </button>
          )}
        </div>
        {list.isPending ? (
          <CardSkeletons count={3} />
        ) : list.error ? (
          <ErrorState error={list.error} onRetry={() => void list.refetch()} />
        ) : !list.items.length ? (
          <EmptyState title={tr.t('feed.empty')} />
        ) : (
          <div className="space-y-4">
            {list.items.map((p) => (
              <PostCard key={p.id} post={p} onPatch={(fn) => patchItem<PostDto>(qc, key, p.id, fn)} onRemoved={(id) => removeItem<PostDto>(qc, key, id)} />
            ))}
            <div ref={sentinel} aria-hidden />
            {list.isFetchingNextPage && <CardSkeletons count={1} />}
          </div>
        )}
      </div>
      <aside className="hidden space-y-4 lg:block">
        <TrendingWidget />
      </aside>
    </div>
  );
}
