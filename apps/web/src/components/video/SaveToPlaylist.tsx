import type { PlaylistDto } from '@qubedu/shared';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { Plus } from 'lucide-react';
import { useState } from 'react';
import { Button } from '@/components/ui/Button';
import { Modal } from '@/components/ui/Modal';
import { Spinner } from '@/components/ui/States';
import { api } from '@/lib/api';
import { useT } from '@/lib/i18n';
import { toastError } from '@/lib/ui';

export function SaveToPlaylist({ videoId, onClose }: { videoId: string; onClose: () => void }) {
  const tr = useT();
  const qc = useQueryClient();
  const key = ['playlists', 'mine', videoId];
  const q = useQuery({ queryKey: key, queryFn: () => api.playlists.mine(videoId), staleTime: 0 });
  const [name, setName] = useState('');
  const [creating, setCreating] = useState(false);

  const toggle = async (pl: PlaylistDto) => {
    try {
      if (pl.hasVideo) await api.playlists.removeItem(pl.id, videoId);
      else await api.playlists.addItem(pl.id, videoId);
      await qc.invalidateQueries({ queryKey: key });
      void qc.invalidateQueries({ queryKey: ['playlists'] });
    } catch (e) {
      toastError(e);
    }
  };

  const create = async () => {
    if (!name.trim()) return;
    setCreating(true);
    try {
      const pl = await api.playlists.create({ title: name.trim(), visibility: 'private' });
      await api.playlists.addItem(pl.id, videoId);
      setName('');
      await qc.invalidateQueries({ queryKey: key });
      void qc.invalidateQueries({ queryKey: ['playlists'] });
    } catch (e) {
      toastError(e);
    } finally {
      setCreating(false);
    }
  };

  return (
    <Modal open onClose={onClose} size="sm" title={tr.t('watch.saveToPlaylist')}>
      {q.isPending ? (
        <Spinner />
      ) : (
        <ul className="space-y-1">
          {q.data?.items.map((pl) => (
            <li key={pl.id}>
              <label className="flex min-h-11 cursor-pointer items-center gap-3 rounded-[var(--radius-control)] px-2 hover:bg-bg-3">
                <input type="checkbox" className="size-5 accent-[var(--primary)]" checked={!!pl.hasVideo} onChange={() => void toggle(pl)} />
                <span className="min-w-0 flex-1 truncate font-bold">{pl.title}</span>
                <span className="muted text-xs">{pl.visibility === 'private' ? tr.t('watch.privateBadge') : ''}</span>
              </label>
            </li>
          ))}
          {!q.data?.items.length && <li className="muted px-2 text-sm">{tr.t('watch.noPlaylists')}</li>}
        </ul>
      )}
      <form
        className="mt-4 flex gap-2 border-t border-line pt-4"
        onSubmit={(e) => {
          e.preventDefault();
          void create();
        }}
      >
        <input
          className="input"
          value={name}
          maxLength={100}
          onChange={(e) => setName(e.target.value)}
          placeholder={tr.t('watch.playlistName')}
          aria-label={tr.t('watch.playlistName')}
        />
        <Button type="submit" variant="soft" loading={creating} disabled={!name.trim()} icon={<Plus className="size-4" />}>
          {tr.t('common.create')}
        </Button>
      </form>
    </Modal>
  );
}
