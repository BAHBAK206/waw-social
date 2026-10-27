import type { SavedCollectionDto, SavedItemDto } from '@qubedu/shared';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { Bookmark, FolderPlus, Globe, Link2, Pencil, Share2, Trash2 } from 'lucide-react';
import { useState } from 'react';
import { Link } from 'react-router';
import { Button } from '@/components/ui/Button';
import { Input, Select, Switch, Textarea } from '@/components/ui/Field';
import { Menu } from '@/components/ui/Menu';
import { Modal } from '@/components/ui/Modal';
import { CardSkeletons, EmptyState, ErrorState, PageHeader } from '@/components/ui/States';
import { api } from '@/lib/api';
import { cx } from '@/lib/cx';
import { relativeTime } from '@/lib/format';
import { useT } from '@/lib/i18n';
import { confirmDialog, toast, toastError } from '@/lib/ui';

export function savedHref(i: Pick<SavedItemDto, 'itemType' | 'refId' | 'url'>): string | null {
  if (i.url) return i.url;
  if (!i.refId) return null;
  const map: Record<SavedItemDto['itemType'], string> = {
    post: '/post/',
    quiz: '/quiz/',
    library: '/library?item=',
    group: '/groups/',
    user: '/u/',
    link: '',
    form: '/forms/',
    course: '/school/',
  };
  return `${map[i.itemType]}${i.refId}`;
}

export function SavedLink({ item }: { item: Pick<SavedItemDto, 'itemType' | 'refId' | 'url' | 'title'> }) {
  const href = savedHref(item);
  if (!href) return <span dir="auto">{item.title}</span>;
  return /^https?:\/\//i.test(href) ? (
    <a href={href} target="_blank" rel="noopener noreferrer nofollow" className="hover:underline" dir="auto">
      {item.title}
    </a>
  ) : (
    <Link to={href} className="hover:underline" dir="auto">
      {item.title}
    </Link>
  );
}

function CollectionDialog({ collection, onClose }: { collection?: SavedCollectionDto; onClose: () => void }) {
  const tr = useT();
  const qc = useQueryClient();
  const [f, setF] = useState({ name: collection?.name ?? '', description: collection?.description ?? '', isPublic: collection?.isPublic ?? false });
  const [busy, setBusy] = useState(false);
  return (
    <Modal
      open
      size="sm"
      onClose={onClose}
      title={collection ? tr.t('common.edit') : tr.t('saved.newCollection')}
      footer={
        <Button
          loading={busy}
          disabled={!f.name.trim()}
          onClick={async () => {
            setBusy(true);
            try {
              const body = { name: f.name.trim(), description: f.description.trim(), isPublic: f.isPublic };
              if (collection) await api.saved.updateCollection(collection.id, body);
              else await api.saved.createCollection(body);
              await qc.invalidateQueries({ queryKey: ['saved'] });
              onClose();
            } catch (e) {
              toastError(e);
            } finally {
              setBusy(false);
            }
          }}
        >
          {tr.t('common.save')}
        </Button>
      }
    >
      <div className="space-y-4">
        <Input label={tr.t('common.name')} value={f.name} maxLength={60} autoFocus onChange={(e) => setF({ ...f, name: e.target.value })} />
        <Textarea label={tr.t('common.description')} value={f.description} onChange={(e) => setF({ ...f, description: e.target.value })} />
        <Switch checked={f.isPublic} onChange={(v) => setF({ ...f, isPublic: v })} label={tr.t('saved.publicCollection')} />
      </div>
    </Modal>
  );
}

function LinkDialog({ collectionId, onClose }: { collectionId: string | null; onClose: () => void }) {
  const tr = useT();
  const qc = useQueryClient();
  const [f, setF] = useState({ title: '', url: '', note: '' });
  return (
    <Modal
      open
      size="sm"
      onClose={onClose}
      title={tr.t('saved.addLink')}
      footer={
        <Button
          disabled={!f.title.trim() || !/^https?:\/\//i.test(f.url.trim())}
          onClick={async () => {
            try {
              await api.saved.add({ itemType: 'link', title: f.title.trim(), url: f.url.trim(), note: f.note.trim(), collectionId });
              await qc.invalidateQueries({ queryKey: ['saved'] });
              onClose();
            } catch (e) {
              toastError(e);
            }
          }}
        >
          {tr.t('common.save')}
        </Button>
      }
    >
      <div className="space-y-4">
        <Input label={tr.t('common.title')} value={f.title} onChange={(e) => setF({ ...f, title: e.target.value })} autoFocus />
        <Input type="url" dir="ltr" label={tr.t('common.link')} placeholder="https://" value={f.url} onChange={(e) => setF({ ...f, url: e.target.value })} />
        <Input label={tr.t('saved.note')} value={f.note} onChange={(e) => setF({ ...f, note: e.target.value })} />
      </div>
    </Modal>
  );
}

export default function SavedPage() {
  const tr = useT();
  const qc = useQueryClient();
  const [collectionId, setCollectionId] = useState<string | 'all'>('all');
  const [type, setType] = useState('');
  const [editing, setEditing] = useState<SavedCollectionDto | 'new' | null>(null);
  const [addingLink, setAddingLink] = useState(false);
  const [editingItem, setEditingItem] = useState<SavedItemDto | null>(null);
  const q = useQuery({
    queryKey: ['saved', collectionId, type],
    queryFn: () => api.saved.list({ collectionId: collectionId === 'all' ? undefined : collectionId, type: type || undefined }),
  });
  const collections = q.data?.collections ?? [];
  const current = collections.find((c) => c.id === collectionId);
  const refresh = () => qc.invalidateQueries({ queryKey: ['saved'] });
  const share = async (c: SavedCollectionDto) => {
    const url = `${location.origin}/c/${c.shareSlug}`;
    if (navigator.share) await navigator.share({ title: c.name, url }).catch(() => undefined);
    else {
      await navigator.clipboard.writeText(url);
      toast(tr.t('common.copied'));
    }
  };
  return (
    <div className="page grid gap-6 lg:grid-cols-[16rem_minmax(0,1fr)]">
      <aside className="space-y-2">
        <PageHeader title={tr.t('saved.title')} icon={<Bookmark className="size-6" />} />
        <nav aria-label={tr.t('saved.collections')} className="space-y-1">
          <button
            type="button"
            aria-current={collectionId === 'all'}
            className={cx('flex w-full items-center rounded-xl px-3 py-2 text-start font-bold hover:bg-soft', collectionId === 'all' && 'bg-soft')}
            onClick={() => setCollectionId('all')}
          >
            {tr.t('saved.all')}
          </button>
          {collections.map((c) => (
            <button
              key={c.id}
              type="button"
              aria-current={collectionId === c.id}
              className={cx('flex w-full items-center gap-2 rounded-xl px-3 py-2 text-start font-bold hover:bg-soft', collectionId === c.id && 'bg-soft')}
              onClick={() => setCollectionId(c.id)}
            >
              <span className="min-w-0 flex-1 truncate" dir="auto">
                {c.name}
              </span>
              {c.isPublic && <Globe className="size-3.5 text-fg-3" aria-label={tr.t('common.public')} />}
              <span className="muted text-xs tabular-nums">{c.itemCount}</span>
            </button>
          ))}
        </nav>
        <Button variant="outline" size="sm" block icon={<FolderPlus className="size-4" />} onClick={() => setEditing('new')}>
          {tr.t('saved.newCollection')}
        </Button>
      </aside>
      <section className="min-w-0 space-y-4">
        <div className="flex flex-wrap items-center gap-2">
          <h2 className="min-w-0 flex-1 truncate text-xl font-black" dir="auto">
            {current?.name ?? tr.t('saved.all')}
          </h2>
          <Select
            aria-label={tr.t('common.filters')}
            value={type}
            onChange={(e) => setType(e.target.value)}
            wrapperClassName="w-40"
            options={[
              { value: '', label: tr.t('common.all') },
              ...(['post', 'quiz', 'library', 'group', 'user', 'link', 'form', 'course'] as const).map((k) => ({ value: k, label: tr.t(`saved.types.${k}`) })),
            ]}
          />
          <Button variant="outline" size="sm" icon={<Link2 className="size-4" />} onClick={() => setAddingLink(true)}>
            {tr.t('saved.addLink')}
          </Button>
          {current && (
            <>
              {current.isPublic && (
                <Button variant="soft" size="sm" icon={<Share2 className="size-4" />} onClick={() => void share(current)}>
                  {tr.t('saved.share')}
                </Button>
              )}
              <Menu
                label={tr.t('common.more')}
                items={[
                  { label: tr.t('common.edit'), icon: <Pencil className="size-4" />, onSelect: () => setEditing(current) },
                  {
                    label: tr.t('common.delete'),
                    icon: <Trash2 className="size-4" />,
                    danger: true,
                    onSelect: async () => {
                      if (!(await confirmDialog({ title: tr.t('common.confirmDelete'), danger: true }))) return;
                      try {
                        await api.saved.deleteCollection(current.id);
                        setCollectionId('all');
                        await refresh();
                      } catch (e) {
                        toastError(e);
                      }
                    },
                  },
                ]}
              />
            </>
          )}
        </div>
        {current?.description && <p className="muted">{current.description}</p>}
        {q.isPending ? (
          <CardSkeletons count={4} />
        ) : q.error ? (
          <ErrorState error={q.error} onRetry={() => void q.refetch()} />
        ) : !q.data.items.length ? (
          <EmptyState icon={<Bookmark className="size-7" />} title={tr.t('saved.empty')} />
        ) : (
          <ul className="space-y-2">
            {q.data.items.map((i) => (
              <li key={i.id} className="card flex items-center gap-3 p-3">
                <span className="badge shrink-0">{tr.t(`saved.types.${i.itemType}`)}</span>
                <div className="min-w-0 flex-1">
                  <p className="truncate font-bold">
                    <SavedLink item={i} />
                  </p>
                  <p className="muted truncate text-xs" dir="auto">
                    {i.note ? `${i.note} · ` : ''}
                    {relativeTime(i.createdAt, tr)}
                  </p>
                </div>
                <button type="button" className="icon-btn icon-btn-sm" aria-label={tr.t('saved.addToCollection')} onClick={() => setEditingItem(i)}>
                  <FolderPlus className="size-4" />
                </button>
                <button
                  type="button"
                  className="icon-btn icon-btn-sm text-err"
                  aria-label={tr.t('common.delete')}
                  onClick={async () => {
                    try {
                      await api.saved.remove(i.id);
                      await refresh();
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
      </section>
      {editing && <CollectionDialog collection={editing === 'new' ? undefined : editing} onClose={() => setEditing(null)} />}
      {addingLink && <LinkDialog collectionId={current?.id ?? null} onClose={() => setAddingLink(false)} />}
      {editingItem && (
        <Modal open size="sm" onClose={() => setEditingItem(null)} title={tr.t('saved.addToCollection')}>
          <div className="space-y-3">
            <Select
              label={tr.t('saved.collections')}
              value={editingItem.collectionId ?? ''}
              onChange={async (e) => {
                try {
                  await api.saved.update(editingItem.id, { collectionId: e.target.value || null });
                  await refresh();
                  setEditingItem(null);
                } catch (er) {
                  toastError(er);
                }
              }}
              options={[{ value: '', label: '—' }, ...collections.map((c) => ({ value: c.id, label: c.name }))]}
            />
          </div>
        </Modal>
      )}
    </div>
  );
}
