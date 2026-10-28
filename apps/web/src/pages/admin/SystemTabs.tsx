import type { AssistantKnowledgeDto, AuditEntryDto } from '@qubedu/shared';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { Pencil, Plus, ThumbsDown, ThumbsUp, Trash2, Upload } from 'lucide-react';
import { useState } from 'react';
import { Button } from '@/components/ui/Button';
import { Input, Select, Textarea } from '@/components/ui/Field';
import { Modal } from '@/components/ui/Modal';
import { CardSkeletons, EmptyState, ErrorState, LoadMore } from '@/components/ui/States';
import { pickFile } from '@/components/ui/Upload';
import { AssistantGaps, AssistantTester } from './AssistantTools';
import { api } from '@/lib/api';
import { formatDateTime, relativeTime } from '@/lib/format';
import { useT } from '@/lib/i18n';
import { usePaged } from '@/lib/infinite';
import { confirmDialog, toast, toastError } from '@/lib/ui';

type KnowledgeBody = Omit<AssistantKnowledgeDto, 'id' | 'createdAt'>;

function KnowledgeDialog({ item, onClose }: { item?: AssistantKnowledgeDto; onClose: () => void }) {
  const tr = useT();
  const qc = useQueryClient();
  const [f, setF] = useState({
    question: item?.question ?? '',
    answer: item?.answer ?? '',
    tags: item?.tags.join(', ') ?? '',
    language: item?.language ?? tr.locale,
    link: item?.link ?? '',
  });
  return (
    <Modal
      open
      onClose={onClose}
      title={tr.t('admin.assistant.add')}
      footer={
        <Button
          disabled={!f.question.trim() || !f.answer.trim()}
          onClick={async () => {
            const body: KnowledgeBody = {
              question: f.question.trim(),
              answer: f.answer.trim(),
              tags: f.tags
                .split(/[,،]/)
                .map((t) => t.trim())
                .filter(Boolean),
              language: f.language as KnowledgeBody['language'],
              link: f.link.trim() || null,
            };
            try {
              if (item) await api.admin.updateKnowledge(item.id, body);
              else await api.admin.addKnowledge([body]);
              await qc.invalidateQueries({ queryKey: ['admin', 'knowledge'] });
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
        <Textarea label={tr.t('admin.assistant.question')} value={f.question} onChange={(e) => setF({ ...f, question: e.target.value })} />
        <Textarea label={tr.t('admin.assistant.answer')} value={f.answer} rows={5} onChange={(e) => setF({ ...f, answer: e.target.value })} />
        <div className="grid gap-4 sm:grid-cols-2">
          <Select
            label={tr.t('settings.appearance.language')}
            value={f.language}
            onChange={(e) => setF({ ...f, language: e.target.value as typeof f.language })}
            options={['ar', 'en', 'fr', 'es'].map((l) => ({ value: l, label: l.toUpperCase() }))}
          />
          <Input label="Tags" value={f.tags} onChange={(e) => setF({ ...f, tags: e.target.value })} />
        </div>
        <Input type="url" dir="ltr" label={tr.t('common.link')} value={f.link} placeholder="https://" onChange={(e) => setF({ ...f, link: e.target.value })} />
      </div>
    </Modal>
  );
}

export function AssistantTab() {
  const tr = useT();
  const qc = useQueryClient();
  const k = useQuery({ queryKey: ['admin', 'knowledge'], queryFn: () => api.admin.knowledge() });
  const fb = useQuery({ queryKey: ['admin', 'assistant-feedback'], queryFn: () => api.admin.assistantFeedback() });
  const [edit, setEdit] = useState<AssistantKnowledgeDto | 'new' | null>(null);
  const importJson = async () => {
    const file = await pickFile('application/json,.json');
    if (!file) return;
    try {
      const data = JSON.parse(await file.text()) as KnowledgeBody[];
      if (!Array.isArray(data)) throw new Error('format');
      const r = await api.admin.addKnowledge(
        data.map((d) => ({
          question: String(d.question),
          answer: String(d.answer),
          tags: d.tags ?? [],
          language: d.language ?? tr.locale,
          link: d.link ?? null,
        })),
      );
      toast(tr.t('admin.site.done', { result: r.added }));
      await qc.invalidateQueries({ queryKey: ['admin', 'knowledge'] });
    } catch (e) {
      toastError(e);
    }
  };
  return (
    <div className="space-y-8">
      <AssistantTester />
      <AssistantGaps />
      <section className="space-y-3">
        <div className="flex flex-wrap items-center gap-2">
          <h2 className="flex-1 text-lg font-black">{tr.t('admin.assistant.knowledge')}</h2>
          <Button size="sm" variant="outline" icon={<Upload className="size-4" />} onClick={() => void importJson()}>
            {tr.t('admin.assistant.import')}
          </Button>
          <Button size="sm" icon={<Plus className="size-4" />} onClick={() => setEdit('new')}>
            {tr.t('admin.assistant.add')}
          </Button>
        </div>
        {k.isPending ? (
          <CardSkeletons count={3} />
        ) : k.error ? (
          <ErrorState error={k.error} />
        ) : !k.data.items.length ? (
          <EmptyState title={tr.t('common.empty')} />
        ) : (
          k.data.items.map((i) => (
            <div key={i.id} className="card flex items-start gap-3 p-3">
              <div className="min-w-0 flex-1">
                <p className="font-bold" dir="auto">
                  {i.question}
                </p>
                <p className="muted line-clamp-2 text-sm" dir="auto">
                  {i.answer}
                </p>
                <p className="muted mt-1 text-xs">
                  {i.language.toUpperCase()} {i.tags.map((t) => `#${t}`).join(' ')}
                </p>
              </div>
              <button type="button" className="icon-btn icon-btn-sm" aria-label={tr.t('common.edit')} onClick={() => setEdit(i)}>
                <Pencil className="size-4" />
              </button>
              <button
                type="button"
                className="icon-btn icon-btn-sm text-err"
                aria-label={tr.t('common.delete')}
                onClick={async () => {
                  if (await confirmDialog({ title: tr.t('common.confirmDelete'), danger: true })) {
                    try {
                      await api.admin.deleteKnowledge(i.id);
                      await qc.invalidateQueries({ queryKey: ['admin', 'knowledge'] });
                    } catch (e) {
                      toastError(e);
                    }
                  }
                }}
              >
                <Trash2 className="size-4" />
              </button>
            </div>
          ))
        )}
      </section>
      <section className="space-y-3">
        <h2 className="flex items-center gap-4 text-lg font-black">
          {tr.t('admin.assistant.feedback')}
          {fb.data && (
            <span className="badge badge-ok">
              <ThumbsUp className="size-3" /> {fb.data.up}
            </span>
          )}
          {fb.data && (
            <span className="badge badge-err">
              <ThumbsDown className="size-3" /> {fb.data.down}
            </span>
          )}
        </h2>
        {fb.data?.items.map((i) => (
          <div key={i.id} className="card p-3 text-sm">
            <p className="line-clamp-3" dir="auto">
              {i.content}
            </p>
            {i.feedback && (
              <p className="mt-1 font-bold" dir="auto">
                “{i.feedback}”
              </p>
            )}
            <p className="muted mt-1 text-xs">
              {i.rating === 'up' ? '👍' : '👎'} · {relativeTime(i.createdAt, tr)}
            </p>
          </div>
        ))}
      </section>
      {edit && <KnowledgeDialog item={edit === 'new' ? undefined : edit} onClose={() => setEdit(null)} />}
    </div>
  );
}

export function ErrorsTab() {
  const tr = useT();
  const qc = useQueryClient();
  const q = useQuery({ queryKey: ['admin', 'errors'], queryFn: () => api.admin.errors() });
  if (q.isPending) return <CardSkeletons count={3} />;
  if (q.error) return <ErrorState error={q.error} />;
  return (
    <div className="space-y-3">
      <div className="flex justify-end">
        <Button
          variant="outline"
          size="sm"
          disabled={!q.data.items.length}
          onClick={async () => {
            if (!(await confirmDialog({ title: tr.t('admin.errors.clearAll'), danger: true }))) return;
            try {
              await api.admin.clearErrors();
              await qc.invalidateQueries({ queryKey: ['admin', 'errors'] });
            } catch (e) {
              toastError(e);
            }
          }}
        >
          {tr.t('admin.errors.clearAll')}
        </Button>
      </div>
      {!q.data.items.length ? (
        <EmptyState title={tr.t('admin.errors.empty')} />
      ) : (
        q.data.items.map((e) => (
          <details key={e.id} className="card p-3">
            <summary className="flex cursor-pointer items-center gap-3">
              <span className="badge badge-err tabular-nums">{tr.t('admin.errors.count', { count: e.count })}</span>
              <span className="min-w-0 flex-1 truncate font-bold" dir="ltr">
                {e.message}
              </span>
              <span className="muted text-xs">{relativeTime(e.lastSeenAt, tr)}</span>
            </summary>
            <div className="mt-3 space-y-1 text-sm">
              <p className="muted" dir="ltr">
                {e.kind} · {e.url}
              </p>
              <p className="muted text-xs">
                {tr.t('admin.errors.firstSeen')}: {formatDateTime(e.firstSeenAt, tr)}
              </p>
              {e.sampleStack && (
                <pre className="scroll-thin max-h-64 overflow-auto rounded-lg bg-soft p-3 text-xs" dir="ltr">
                  {e.sampleStack}
                </pre>
              )}
            </div>
          </details>
        ))
      )}
    </div>
  );
}

export function AuditTab() {
  const tr = useT();
  const list = usePaged<AuditEntryDto>(['admin', 'audit'], (cursor) => api.admin.audit({ cursor, limit: 50 }));
  if (list.isPending) return <CardSkeletons count={4} />;
  if (list.error) return <ErrorState error={list.error} />;
  return (
    <div className="space-y-2">
      {!list.items.length && <EmptyState title={tr.t('common.empty')} />}
      <ul className="card divide-y divide-line">
        {list.items.map((e) => (
          <li key={e.id} className="flex flex-wrap items-center gap-x-3 gap-y-1 p-3 text-sm">
            <span className="badge">{e.action}</span>
            <span className="font-bold">{e.actor?.displayName ?? '—'}</span>
            {e.targetType && (
              <span className="muted" dir="ltr">
                {e.targetType}:{e.targetId?.slice(0, 8)}
              </span>
            )}
            <span className="muted ms-auto text-xs">{formatDateTime(e.createdAt, tr)}</span>
          </li>
        ))}
      </ul>
      <LoadMore hasMore={!!list.hasNextPage} loading={list.isFetchingNextPage} onClick={() => void list.fetchNextPage()} />
    </div>
  );
}
