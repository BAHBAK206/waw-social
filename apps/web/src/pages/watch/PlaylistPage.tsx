import type { VideoDto } from '@qubedu/shared';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { ArrowDown, ArrowUp, ListVideo, Pencil, Play, Trash2, X } from 'lucide-react';
import { useNavigate, useParams } from 'react-router';
import { VideoRow } from '@/components/video/VideoCard';
import { Avatar } from '@/components/ui/Avatar';
import { Button, ButtonLink, IconButton } from '@/components/ui/Button';
import { Select } from '@/components/ui/Field';
import { EmptyState, QueryState } from '@/components/ui/States';
import { api } from '@/lib/api';
import { useT } from '@/lib/i18n';
import { confirmDialog, promptDialog, toastError } from '@/lib/ui';

export default function PlaylistPage() {
  const { id = '' } = useParams();
  const tr = useT();
  const qc = useQueryClient();
  const navigate = useNavigate();
  const key = ['playlist', id];
  const q = useQuery({ queryKey: key, queryFn: () => api.playlists.get(id) });
  const refresh = () => qc.invalidateQueries({ queryKey: key });

  return (
    <div className="page-narrow">
      <QueryState query={q}>
        {({ playlist, videos }) => {
          const move = async (i: number, d: -1 | 1) => {
            const ids = videos.map((v: VideoDto) => v.id);
            const j = i + d;
            if (j < 0 || j >= ids.length) return;
            [ids[i], ids[j]] = [ids[j]!, ids[i]!];
            try {
              await api.playlists.reorder(id, ids);
              await refresh();
            } catch (e) {
              toastError(e);
            }
          };
          return (
            <>
              <header className="card mb-5 p-5">
                <div className="flex items-start gap-3">
                  <div className="surface-gradient grid size-14 shrink-0 place-items-center rounded-2xl">
                    <ListVideo className="size-7" />
                  </div>
                  <div className="min-w-0 flex-1">
                    <h1 className="text-2xl font-black" dir="auto">
                      {playlist.title}
                    </h1>
                    <p className="muted flex items-center gap-2 text-sm">
                      <Avatar name={playlist.owner.displayName} url={playlist.owner.avatarUrl} size="xs" />
                      {playlist.owner.displayName} · {tr.t('watch.playlistVideos', { count: playlist.itemCount })}
                    </p>
                    {playlist.description && <p className="mt-2 text-sm">{playlist.description}</p>}
                  </div>
                </div>
                <div className="mt-4 flex flex-wrap items-center gap-2">
                  {videos[0] && (
                    <ButtonLink to={`/watch/${videos[0].id}?list=${playlist.id}`} icon={<Play className="size-4" />}>
                      {tr.t('watch.playAll')}
                    </ButtonLink>
                  )}
                  {playlist.canEdit && (
                    <>
                      <Button
                        variant="outline"
                        icon={<Pencil className="size-4" />}
                        onClick={async () => {
                          const title = await promptDialog({
                            title: tr.t('common.rename'),
                            input: { label: tr.t('watch.playlistName'), defaultValue: playlist.title },
                          });
                          if (!title) return;
                          try {
                            await api.playlists.update(id, { title });
                            await refresh();
                          } catch (e) {
                            toastError(e);
                          }
                        }}
                      >
                        {tr.t('common.rename')}
                      </Button>
                      <Select
                        aria-label={tr.t('studio.visibility')}
                        wrapperClassName="w-40"
                        value={playlist.visibility}
                        onChange={async (e) => {
                          try {
                            await api.playlists.update(id, { visibility: e.target.value as typeof playlist.visibility });
                            await refresh();
                          } catch (err) {
                            toastError(err);
                          }
                        }}
                        options={(['public', 'unlisted', 'private'] as const).map((v) => ({ value: v, label: tr.t(`studio.visibilities.${v}`) }))}
                      />
                      <Button
                        variant="ghost"
                        className="ms-auto text-err"
                        icon={<Trash2 className="size-4" />}
                        onClick={async () => {
                          if (!(await confirmDialog({ title: tr.t('watch.deletePlaylistConfirm'), danger: true, confirmLabel: tr.t('watch.deletePlaylist') })))
                            return;
                          try {
                            await api.playlists.remove(id);
                            navigate('/watch/library?tab=playlists', { replace: true });
                          } catch (e) {
                            toastError(e);
                          }
                        }}
                      >
                        {tr.t('watch.deletePlaylist')}
                      </Button>
                    </>
                  )}
                </div>
              </header>
              {!videos.length ? (
                <EmptyState icon={<ListVideo className="size-7" />} title={tr.t('watch.playlistEmpty')} />
              ) : (
                <ol className="space-y-1">
                  {videos.map((v: VideoDto, i: number) => (
                    <li key={v.id} className="flex items-center gap-1">
                      <span className="muted w-6 text-center text-sm tabular-nums">{i + 1}</span>
                      <div className="min-w-0 flex-1">
                        <VideoRow video={v} />
                      </div>
                      {playlist.canEdit && (
                        <div className="flex shrink-0 flex-col sm:flex-row">
                          <IconButton label={tr.t('common.previous')} size="sm" disabled={i === 0} onClick={() => void move(i, -1)}>
                            <ArrowUp className="size-4" />
                          </IconButton>
                          <IconButton label={tr.t('common.next')} size="sm" disabled={i === videos.length - 1} onClick={() => void move(i, 1)}>
                            <ArrowDown className="size-4" />
                          </IconButton>
                          <IconButton
                            label={tr.t('watch.removeFromPlaylist')}
                            size="sm"
                            onClick={async () => {
                              try {
                                await api.playlists.removeItem(id, v.id);
                                await refresh();
                              } catch (e) {
                                toastError(e);
                              }
                            }}
                          >
                            <X className="size-4" />
                          </IconButton>
                        </div>
                      )}
                    </li>
                  ))}
                </ol>
              )}
            </>
          );
        }}
      </QueryState>
    </div>
  );
}
