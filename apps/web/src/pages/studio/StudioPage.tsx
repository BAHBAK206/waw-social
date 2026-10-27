import type { VideoDto } from '@qubedu/shared';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { BarChart3, Clock, Eye, MessageSquare, Pencil, ThumbsUp, Trash2, Upload, Users, Video } from 'lucide-react';
import { useEffect, useState } from 'react';
import { Link, useSearchParams } from 'react-router';
import { Thumb } from '@/components/video/VideoCard';
import { Button, IconButton } from '@/components/ui/Button';
import { ColumnChart } from '@/components/ui/Charts';
import { EmptyState, ErrorState, LoadMore, PageHeader, QueryState, Spinner } from '@/components/ui/States';
import { Tabs, useTabParam } from '@/components/ui/Tabs';
import { api } from '@/lib/api';
import { cx } from '@/lib/cx';
import { compactNumber, formatDate, relativeTime } from '@/lib/format';
import { useFeatureOn } from '@/lib/features';
import { useT } from '@/lib/i18n';
import { usePaged } from '@/lib/infinite';
import { confirmDialog, toastError } from '@/lib/ui';
import { EditVideoDialog } from './EditVideoDialog';
import { UploadDialog } from './UploadDialog';

const TABS = ['dashboard', 'content', 'comments'] as const;

function Tile({ icon, label, value }: { icon: React.ReactNode; label: string; value: string }) {
  return (
    <div className="card p-4">
      <div className="muted flex items-center gap-2 text-sm font-bold">
        {icon} {label}
      </div>
      <p className="mt-1 text-3xl font-black tabular-nums">{value}</p>
    </div>
  );
}

function Dashboard() {
  const tr = useT();
  const q = useQuery({ queryKey: ['studio', 'overview'], queryFn: () => api.studio.overview() });
  return (
    <QueryState query={q}>
      {(o) => (
        <div className="space-y-6">
          <div className="grid grid-cols-2 gap-3 md:grid-cols-3 xl:grid-cols-6">
            <Tile icon={<Eye className="size-4" />} label={tr.t('studio.totals.views')} value={compactNumber(o.totals.views, tr)} />
            <Tile icon={<Clock className="size-4" />} label={tr.t('studio.totals.watchTime')} value={compactNumber(o.totals.watchMinutes, tr)} />
            <Tile icon={<Users className="size-4" />} label={tr.t('studio.totals.subscribers')} value={compactNumber(o.totals.subscribers, tr)} />
            <Tile icon={<ThumbsUp className="size-4" />} label={tr.t('studio.totals.likes')} value={compactNumber(o.totals.likes, tr)} />
            <Tile icon={<MessageSquare className="size-4" />} label={tr.t('studio.totals.comments')} value={compactNumber(o.totals.comments, tr)} />
            <Tile icon={<Video className="size-4" />} label={tr.t('studio.totals.videos')} value={compactNumber(o.totals.videos, tr)} />
          </div>
          <div className="card p-4">
            <ColumnChart
              title={tr.t('studio.viewsChart')}
              data={o.viewsByDay.map((d) => ({ label: d.day.slice(8), title: formatDate(d.day, tr), value: d.views }))}
              height={200}
            />
          </div>
          <div className="card p-4">
            <h2 className="mb-3 font-black">{tr.t('studio.topVideos')}</h2>
            {!o.topVideos.length && <p className="muted text-sm">{tr.t('studio.noVideos')}</p>}
            <ol className="space-y-2">
              {o.topVideos.map((v, i) => (
                <li key={v.id} className="flex items-center gap-3">
                  <span className="muted w-5 text-center tabular-nums">{i + 1}</span>
                  <Link to={v.kind === 'short' ? `/shorts/${v.id}` : `/watch/${v.id}`} className="w-24 shrink-0">
                    <Thumb video={{ thumbnailUrl: v.thumbnailUrl, durationSec: 1, progressSec: 0, title: v.title }} />
                  </Link>
                  <span className="min-w-0 flex-1 truncate font-bold" dir="auto">
                    {v.title}
                  </span>
                  <span className="muted flex items-center gap-1 text-sm tabular-nums">
                    <Eye className="size-4" /> {compactNumber(v.views, tr)}
                  </span>
                </li>
              ))}
            </ol>
          </div>
        </div>
      )}
    </QueryState>
  );
}

function Content({ onEdit }: { onEdit: (v: VideoDto) => void }) {
  const tr = useT();
  const qc = useQueryClient();
  const list = usePaged<VideoDto>(['studio', 'videos'], (cursor) => api.studio.videos({ cursor, limit: 20 }));
  if (list.isPending) return <Spinner />;
  if (list.error) return <ErrorState error={list.error} onRetry={() => void list.refetch()} />;
  if (!list.items.length) return <EmptyState icon={<Video className="size-7" />} title={tr.t('studio.noVideos')} />;
  return (
    <div className="card overflow-hidden">
      <table className="w-full text-start">
        <thead className="bg-bg-2 text-sm">
          <tr className="text-start">
            <th className="p-3 text-start">{tr.t('studio.titleLabel')}</th>
            <th className="hidden p-3 text-start md:table-cell">{tr.t('studio.visibility')}</th>
            <th className="hidden p-3 text-start sm:table-cell">{tr.t('studio.date')}</th>
            <th className="p-3 text-start">{tr.t('studio.views')}</th>
            <th className="w-24 p-3" />
          </tr>
        </thead>
        <tbody>
          {list.items.map((v) => (
            <tr key={v.id} className="border-t border-line">
              <td className="p-3">
                <div className="flex items-center gap-3">
                  <Link to={v.kind === 'short' ? `/shorts/${v.id}` : `/watch/${v.id}`} className="w-28 shrink-0">
                    <Thumb video={v} />
                  </Link>
                  <div className="min-w-0">
                    <p className="line-clamp-2 font-bold" dir="auto">
                      {v.title}
                    </p>
                    <p className="muted flex gap-3 text-xs">
                      <span className="flex items-center gap-1">
                        <ThumbsUp className="size-3" /> {v.likes}
                      </span>
                      <span className="flex items-center gap-1">
                        <MessageSquare className="size-3" /> {v.commentCount}
                      </span>
                      {v.kind === 'short' && <span className="badge">{tr.t('studio.kinds.short').split(' ')[0]}</span>}
                    </p>
                  </div>
                </div>
              </td>
              <td className="hidden p-3 md:table-cell">
                <span className={cx('badge', v.visibility === 'public' ? 'badge-ok' : v.visibility === 'private' ? 'badge-warn' : '')}>
                  {tr.t(`studio.visibilities.${v.visibility}`)}
                </span>
              </td>
              <td className="muted hidden p-3 text-sm sm:table-cell">{formatDate(v.createdAt, tr)}</td>
              <td className="p-3 tabular-nums">{v.views.toLocaleString(tr.intl)}</td>
              <td className="p-3">
                <div className="flex justify-end">
                  <IconButton label={tr.t('studio.editVideo')} size="sm" onClick={() => onEdit(v)}>
                    <Pencil className="size-4" />
                  </IconButton>
                  <IconButton
                    label={tr.t('studio.deleteVideo')}
                    size="sm"
                    onClick={async () => {
                      if (!(await confirmDialog({ title: tr.t('studio.deleteConfirm'), danger: true, confirmLabel: tr.t('common.delete') }))) return;
                      try {
                        await api.videos.remove(v.id);
                        await qc.invalidateQueries({ queryKey: ['studio'] });
                      } catch (e) {
                        toastError(e);
                      }
                    }}
                  >
                    <Trash2 className="size-4 text-err" />
                  </IconButton>
                </div>
              </td>
            </tr>
          ))}
        </tbody>
      </table>
      <LoadMore hasMore={!!list.hasNextPage} loading={list.isFetchingNextPage} onClick={() => void list.fetchNextPage()} />
    </div>
  );
}

function RecentComments() {
  const tr = useT();
  const q = useQuery({ queryKey: ['studio', 'comments'], queryFn: () => api.studio.comments() });
  return (
    <QueryState query={q} isEmpty={(d) => !d.items.length} empty={<EmptyState icon={<MessageSquare className="size-7" />} title={tr.t('studio.noComments')} />}>
      {(d) => (
        <ul className="card divide-y divide-line">
          {d.items.map((c) => (
            <li key={c.id} className="p-4">
              <p className="text-sm">
                <span className="font-bold">{c.author}</span> <span className="muted">· {relativeTime(c.createdAt, tr)}</span>
              </p>
              <p className="mt-1" dir="auto">
                {c.text}
              </p>
              <Link to={`/watch/${c.videoId}`} className="link text-sm">
                {c.title}
              </Link>
            </li>
          ))}
        </ul>
      )}
    </QueryState>
  );
}

export default function StudioPage() {
  const tr = useT();
  const [params, setParams] = useSearchParams();
  const [tab, setTab] = useTabParam(TABS, 'dashboard');
  const canUpload = useFeatureOn('video-upload');
  const [uploading, setUploading] = useState(params.get('upload') === '1');
  const [editing, setEditing] = useState<VideoDto | null>(null);
  const editId = params.get('edit');

  useEffect(() => {
    if (!editId) return;
    api.videos
      .get(editId)
      .then((v) => (v.canEdit ? setEditing(v) : undefined))
      .catch(() => undefined);
  }, [editId]);

  const clearParam = (k: string) =>
    setParams(
      (p) => {
        const n = new URLSearchParams(p);
        n.delete(k);
        return n;
      },
      { replace: true },
    );

  return (
    <div className="page">
      <PageHeader
        title={tr.t('studio.title')}
        icon={<BarChart3 className="size-6" />}
        actions={
          canUpload && (
            <Button icon={<Upload className="size-4" />} onClick={() => setUploading(true)}>
              {tr.t('studio.upload')}
            </Button>
          )
        }
      />
      <Tabs
        className="mb-5"
        active={tab}
        onChange={setTab}
        tabs={[
          { key: 'dashboard', label: tr.t('studio.tabs.dashboard') },
          { key: 'content', label: tr.t('studio.tabs.content') },
          { key: 'comments', label: tr.t('studio.tabs.comments') },
        ]}
      />
      {tab === 'dashboard' && <Dashboard />}
      {tab === 'content' && <Content onEdit={setEditing} />}
      {tab === 'comments' && <RecentComments />}
      {uploading && (
        <UploadDialog
          onClose={() => {
            setUploading(false);
            clearParam('upload');
          }}
        />
      )}
      {editing && (
        <EditVideoDialog
          video={editing}
          onClose={() => {
            setEditing(null);
            clearParam('edit');
          }}
        />
      )}
    </div>
  );
}
