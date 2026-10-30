import type { LibraryItemDto } from '@qubedu/shared';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { Book, Check, Download, FileText, Library, Plus, Presentation, Trash2, Video } from 'lucide-react';
import { useEffect, useState } from 'react';
import { useSearchParams } from 'react-router';
import { Button, IconButton } from '@/components/ui/Button';
import { Input, Select, Textarea } from '@/components/ui/Field';
import { Modal } from '@/components/ui/Modal';
import { CardSkeletons, EmptyState, ErrorState, LoadMore, PageHeader } from '@/components/ui/States';
import { UploadButton } from '@/components/ui/Upload';
import { api, fileUrl } from '@/lib/api';
import { cx } from '@/lib/cx';
import { formatBytes } from '@/lib/format';
import { useT } from '@/lib/i18n';
import { usePaged } from '@/lib/infinite';
import { qk } from '@/lib/query';
import { useSession } from '@/lib/session';
import { confirmDialog, toast, toastError } from '@/lib/ui';
import { useAuthGate } from '@/lib/useAuthGate';
import { hasPermission } from '@qubedu/shared';

const CATS = ['book', 'summary', 'exam', 'notes', 'video', 'other'] as const;
const ICON = { book: Book, summary: FileText, exam: Presentation, notes: FileText, video: Video, other: FileText } as const;

function UploadDialog({ onClose }: { onClose: () => void }) {
  const tr = useT();
  const qc = useQueryClient();
  const taxonomy = useQuery({ queryKey: qk.taxonomy, queryFn: () => api.taxonomy(), staleTime: 10 * 60_000 });
  const [f, setF] = useState({ title: '', description: '', category: 'book' as (typeof CATS)[number], sectionId: '', materialId: '' });
  const [file, setFile] = useState<{ url: string; mime: string; size: number; name: string } | null>(null);
  const [busy, setBusy] = useState(false);
  const materials = taxonomy.data?.sections.find((s) => s.id === f.sectionId)?.materials ?? [];
  return (
    <Modal
      open
      onClose={onClose}
      title={tr.t('library.upload')}
      footer={
        <Button
          loading={busy}
          disabled={!file || !f.title.trim()}
          onClick={async () => {
            setBusy(true);
            try {
              const res = await api.library.create({
                ...f,
                title: f.title.trim(),
                sectionId: f.sectionId || null,
                materialId: f.materialId || null,
                fileUrl: file!.url,
                mime: file!.mime,
                size: file!.size,
              });
              toast(res.approved ? tr.t('common.saved') : tr.t('library.submittedForReview'));
              void qc.invalidateQueries({ queryKey: ['library'] });
              onClose();
            } catch (e) {
              toastError(e);
            } finally {
              setBusy(false);
            }
          }}
        >
          {tr.t('common.publish')}
        </Button>
      }
    >
      <div className="space-y-4">
        <div className="flex items-center gap-3">
          <UploadButton
            variant="outline"
            purpose="library"
            onUploaded={(r) => {
              setFile({ url: r.url, mime: r.mime, size: r.size, name: r.name });
              setF((x) => ({ ...x, title: x.title || r.name.replace(/\.[^.]+$/, '') }));
            }}
          >
            {tr.t('common.upload')}
          </UploadButton>
          {file && (
            <span className="muted truncate text-sm">
              {file.name} · {formatBytes(file.size)}
            </span>
          )}
        </div>
        <Input label={tr.t('common.title')} value={f.title} maxLength={200} onChange={(e) => setF({ ...f, title: e.target.value })} />
        <Textarea label={tr.t('common.description')} value={f.description} onChange={(e) => setF({ ...f, description: e.target.value })} />
        <div className="grid gap-3 sm:grid-cols-3">
          <Select
            label={tr.t('library.category')}
            value={f.category}
            onChange={(e) => setF({ ...f, category: e.target.value as typeof f.category })}
            options={CATS.map((c) => ({ value: c, label: tr.t(`library.categories.${c}`) }))}
          />
          <Select
            label={tr.t('quiz.section')}
            value={f.sectionId}
            placeholder="—"
            onChange={(e) => setF({ ...f, sectionId: e.target.value, materialId: '' })}
            options={(taxonomy.data?.sections ?? []).map((s) => ({ value: s.id, label: s.name }))}
          />
          <Select
            label={tr.t('quiz.material')}
            value={f.materialId}
            placeholder="—"
            disabled={!materials.length}
            onChange={(e) => setF({ ...f, materialId: e.target.value })}
            options={materials.map((m) => ({ value: m.id, label: m.name }))}
          />
        </div>
      </div>
    </Modal>
  );
}

export default function LibraryPage() {
  const tr = useT();
  const qc = useQueryClient();
  const gate = useAuthGate();
  const me = useSession((s) => s.me);
  const canApprove = !!me && hasPermission(me.role, me.permissions, 'library.manage');
  const [params, setParams] = useSearchParams();
  const [q, setQ] = useState(params.get('q') ?? '');
  const [term, setTerm] = useState(q);
  const [uploading, setUploading] = useState(false);
  const category = params.get('category') ?? '';
  const pending = params.get('pending') === '1';
  useEffect(() => {
    const t = setTimeout(() => setTerm(q.trim()), 300);
    return () => clearTimeout(t);
  }, [q]);
  const filters = { q: term, category, pending };
  const list = usePaged<LibraryItemDto>(qk.library(filters), (cursor) =>
    api.library.list({ q: term || undefined, category: category || undefined, pending: pending || undefined, cursor, limit: 24 }),
  );
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

  return (
    <div className="page">
      <PageHeader
        title={tr.t('library.title')}
        subtitle={tr.t('library.subtitle')}
        icon={<Library className="size-6" />}
        actions={
          <Button icon={<Plus className="size-4" />} onClick={gate(() => setUploading(true))}>
            {tr.t('library.upload')}
          </Button>
        }
      />
      <input
        className="input mb-4 max-w-xl"
        type="search"
        value={q}
        onChange={(e) => setQ(e.target.value)}
        placeholder={tr.t('library.searchPlaceholder')}
        aria-label={tr.t('library.searchPlaceholder')}
      />
      <div className="scroll-thin mb-5 flex gap-2 overflow-x-auto pb-1">
        <button
          type="button"
          className={cx('chip', !category && !pending && 'is-active')}
          onClick={() => {
            setParam('category', '');
            setParam('pending', '');
          }}
        >
          {tr.t('common.all')}
        </button>
        {CATS.map((c) => (
          <button key={c} type="button" className={cx('chip', category === c && 'is-active')} onClick={() => setParam('category', category === c ? '' : c)}>
            {tr.t(`library.categories.${c}`)}
          </button>
        ))}
        {canApprove && (
          <button type="button" className={cx('chip', pending && 'is-active')} onClick={() => setParam('pending', pending ? '' : '1')}>
            {tr.t('library.pending')}
          </button>
        )}
      </div>
      {list.isPending ? (
        <CardSkeletons count={6} className="sm:grid-cols-2 lg:grid-cols-3" />
      ) : list.error ? (
        <ErrorState error={list.error} onRetry={() => void list.refetch()} />
      ) : !list.items.length ? (
        <EmptyState icon={<Library className="size-7" />} title={tr.t('library.empty')} />
      ) : (
        <>
          <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
            {list.items.map((it) => {
              const Icon = ICON[it.category];
              return (
                <article key={it.id} className="card flex gap-4 p-4">
                  {it.coverUrl ? (
                    <img src={fileUrl(it.coverUrl)} alt="" loading="lazy" className="h-28 w-20 shrink-0 rounded-lg object-cover" />
                  ) : (
                    <span className="surface-gradient grid h-28 w-20 shrink-0 place-items-center rounded-lg">
                      <Icon className="size-8" />
                    </span>
                  )}
                  <div className="flex min-w-0 flex-1 flex-col">
                    <div className="mb-1 flex flex-wrap gap-1">
                      <span className="badge badge-primary">{tr.t(`library.categories.${it.category}`)}</span>
                      {!it.approved && <span className="badge badge-warn">{tr.t('library.pending')}</span>}
                    </div>
                    <h2 className="line-clamp-2 leading-snug font-black" dir="auto">
                      {it.title}
                    </h2>
                    <p className="muted line-clamp-1 text-sm">{[it.section?.name, it.material?.name].filter(Boolean).join(' · ') || it.uploader.displayName}</p>
                    <p className="muted text-xs">
                      {formatBytes(it.size)} · {tr.t('library.downloads', { count: it.downloads })}
                    </p>
                    <div className="mt-auto flex items-center gap-1 pt-2">
                      <Button
                        size="sm"
                        icon={<Download className="size-4" />}
                        onClick={gate(async () => {
                          try {
                            const { url } = await api.library.download(it.id);
                            window.open(fileUrl(url), '_blank', 'noopener');
                          } catch (e) {
                            toastError(e);
                          }
                        })}
                      >
                        {tr.t('common.download')}
                      </Button>
                      {canApprove && !it.approved && (
                        <IconButton
                          label={tr.t('library.approve')}
                          size="sm"
                          onClick={async () => {
                            try {
                              await api.library.approve(it.id);
                              await qc.invalidateQueries({ queryKey: ['library'] });
                            } catch (e) {
                              toastError(e);
                            }
                          }}
                        >
                          <Check className="size-4 text-ok" />
                        </IconButton>
                      )}
                      {it.canDelete && (
                        <IconButton
                          label={tr.t('common.delete')}
                          size="sm"
                          onClick={async () => {
                            if (!(await confirmDialog({ title: tr.t('common.confirmDelete'), danger: true, confirmLabel: tr.t('common.delete') }))) return;
                            try {
                              await api.library.remove(it.id);
                              await qc.invalidateQueries({ queryKey: ['library'] });
                            } catch (e) {
                              toastError(e);
                            }
                          }}
                        >
                          <Trash2 className="size-4 text-err" />
                        </IconButton>
                      )}
                    </div>
                  </div>
                </article>
              );
            })}
          </div>
          <LoadMore hasMore={!!list.hasNextPage} loading={list.isFetchingNextPage} onClick={() => void list.fetchNextPage()} />
        </>
      )}
      {uploading && <UploadDialog onClose={() => setUploading(false)} />}
    </div>
  );
}
