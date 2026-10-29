import type { GlossaryTermDto } from '@qubedu/shared';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { BookA, Trash2 } from 'lucide-react';
import { useMemo, useState } from 'react';
import { Button, IconButton } from '@/components/ui/Button';
import { Input, Select, Textarea } from '@/components/ui/Field';
import { Modal } from '@/components/ui/Modal';
import { EmptyState, PageHeader, QueryState } from '@/components/ui/States';
import { api } from '@/lib/api';
import { useT } from '@/lib/i18n';
import { confirmDialog, toast, toastError } from '@/lib/ui';

function AddForm({ subjects, onDone }: { subjects: string[]; onDone: () => void }) {
  const tr = useT();
  const qc = useQueryClient();
  const [subject, setSubject] = useState(subjects[0] ?? '');
  const [term, setTerm] = useState('');
  const [definition, setDefinition] = useState('');
  const add = useMutation({
    mutationFn: () => api.glossary.add({ subject: subject.trim(), term: term.trim(), definition: definition.trim() }),
    onSuccess: () => {
      void qc.invalidateQueries({ queryKey: ['glossary'] });
      setTerm('');
      setDefinition('');
    },
    onError: toastError,
  });
  const ok = subject.trim() && term.trim() && definition.trim();
  return (
    <form
      className="card space-y-3 p-4"
      onSubmit={(e) => {
        e.preventDefault();
        if (ok) add.mutate();
      }}
    >
      <Input label={tr.t('glossary.subject')} value={subject} onChange={(e) => setSubject(e.target.value)} list="glossary-subjects" dir="auto" maxLength={80} />
      <datalist id="glossary-subjects">
        {subjects.map((s) => (
          <option key={s} value={s} />
        ))}
      </datalist>
      <Input label={tr.t('glossary.term')} value={term} onChange={(e) => setTerm(e.target.value)} dir="auto" maxLength={120} />
      <Textarea label={tr.t('glossary.definition')} value={definition} onChange={(e) => setDefinition(e.target.value)} rows={3} dir="auto" maxLength={600} />
      <div className="flex justify-end gap-2">
        <Button variant="ghost" onClick={onDone}>
          {tr.t('common.close')}
        </Button>
        <Button type="submit" loading={add.isPending} disabled={!ok}>
          {tr.t('glossary.add')}
        </Button>
      </div>
    </form>
  );
}

function SuggestDialog({ subject, onClose }: { subject: string; onClose: () => void }) {
  const tr = useT();
  const qc = useQueryClient();
  const [text, setText] = useState('');
  const [subj, setSubj] = useState(subject);
  const find = useMutation({ mutationFn: () => api.glossary.suggest(text), onError: toastError });
  const addAll = useMutation({
    mutationFn: async () => {
      let n = 0;
      for (const t of find.data?.items ?? []) {
        try {
          await api.glossary.add({ subject: subj.trim(), term: t.term, definition: t.definition });
          n += 1;
        } catch {
          /* already in the glossary */
        }
      }
      return n;
    },
    onSuccess: (n) => {
      toast(tr.t('glossary.added', { count: n }));
      void qc.invalidateQueries({ queryKey: ['glossary'] });
      onClose();
    },
  });
  return (
    <Modal open size="lg" onClose={onClose} title={tr.t('glossary.suggest')}>
      <div className="space-y-3">
        <p className="muted text-sm">{tr.t('glossary.suggestHint')}</p>
        <Textarea value={text} onChange={(e) => setText(e.target.value)} rows={6} dir="auto" aria-label={tr.t('glossary.suggest')} />
        <Button loading={find.isPending} disabled={text.trim().length < 40} onClick={() => find.mutate()}>
          {tr.t('glossary.suggestRun')}
        </Button>
        {find.data &&
          (find.data.items.length ? (
            <>
              <ul className="max-h-60 divide-y divide-line overflow-y-auto">
                {find.data.items.map((t) => (
                  <li key={t.term} className="py-2" dir="auto">
                    <p className="font-bold">{t.term}</p>
                    <p className="muted text-sm">{t.definition}</p>
                  </li>
                ))}
              </ul>
              <div className="flex flex-wrap items-end gap-2">
                <Input label={tr.t('glossary.subject')} value={subj} onChange={(e) => setSubj(e.target.value)} dir="auto" wrapperClassName="flex-1" />
                <Button loading={addAll.isPending} disabled={!subj.trim()} onClick={() => addAll.mutate()}>
                  {tr.t('glossary.addAll')}
                </Button>
              </div>
            </>
          ) : (
            <p className="muted">{tr.t('glossary.none')}</p>
          ))}
      </div>
    </Modal>
  );
}

export default function GlossaryPage() {
  const tr = useT();
  const qc = useQueryClient();
  const [subject, setSubject] = useState('');
  const [search, setSearch] = useState('');
  const [adding, setAdding] = useState(false);
  const [suggest, setSuggest] = useState(false);
  const q = useQuery({
    queryKey: ['glossary', subject, search],
    queryFn: () => api.glossary.list({ subject: subject || undefined, q: search.trim() || undefined }),
  });
  const all = useQuery({ queryKey: ['glossary', 'all'], queryFn: () => api.glossary.list() });
  const subjects = all.data?.subjects ?? [];
  const remove = async (t: GlossaryTermDto) => {
    if (!(await confirmDialog({ title: tr.t('common.delete'), body: t.term, danger: true }))) return;
    try {
      await api.glossary.remove(t.id);
      void qc.invalidateQueries({ queryKey: ['glossary'] });
    } catch (e) {
      toastError(e);
    }
  };
  const grouped = useMemo(() => {
    const m = new Map<string, GlossaryTermDto[]>();
    for (const t of q.data?.items ?? []) m.set(t.subject, [...(m.get(t.subject) ?? []), t]);
    return [...m];
  }, [q.data]);
  return (
    <div className="page">
      <PageHeader
        title={tr.t('glossary.title')}
        subtitle={tr.t('glossary.subtitle')}
        icon={<BookA className="size-6" />}
        actions={
          <div className="flex gap-2">
            <Button variant="soft" onClick={() => setSuggest(true)}>
              {tr.t('glossary.suggest')}
            </Button>
            <Button onClick={() => setAdding((v) => !v)}>{tr.t('glossary.add')}</Button>
          </div>
        }
      />
      {adding && (
        <div className="mb-5 max-w-xl">
          <AddForm subjects={subjects} onDone={() => setAdding(false)} />
        </div>
      )}
      <div className="mb-4 flex flex-wrap gap-3">
        <Input
          type="search"
          aria-label={tr.t('glossary.search')}
          placeholder={tr.t('glossary.search')}
          value={search}
          onChange={(e) => setSearch(e.target.value)}
          wrapperClassName="min-w-48 flex-1"
        />
        <Select
          aria-label={tr.t('glossary.subject')}
          value={subject}
          onChange={(e) => setSubject(e.target.value)}
          options={[{ value: '', label: tr.t('glossary.all') }, ...subjects.map((s) => ({ value: s, label: s }))]}
        />
      </div>
      <QueryState query={q}>
        {() =>
          !grouped.length ? (
            <EmptyState icon={<BookA className="size-7" />} title={tr.t('glossary.empty')} />
          ) : (
            <div className="space-y-5">
              {grouped.map(([name, terms]) => (
                <section key={name} className="card p-4">
                  <h2 className="mb-2 font-black" dir="auto">
                    {name}
                  </h2>
                  <dl className="divide-y divide-line">
                    {terms.map((t) => (
                      <div key={t.id} className="flex items-start gap-3 py-2">
                        <div className="min-w-0 flex-1" dir="auto">
                          <dt className="font-bold">
                            {t.term} {t.courseId && <span className="badge badge-primary ms-1">{tr.t('glossary.shared')}</span>}
                          </dt>
                          <dd className="muted text-sm">{t.definition}</dd>
                        </div>
                        {t.mine && (
                          <IconButton label={tr.t('common.delete')} onClick={() => void remove(t)}>
                            <Trash2 className="size-4" />
                          </IconButton>
                        )}
                      </div>
                    ))}
                  </dl>
                </section>
              ))}
            </div>
          )
        }
      </QueryState>
      {suggest && <SuggestDialog subject={subject || subjects[0] || ''} onClose={() => setSuggest(false)} />}
    </div>
  );
}
