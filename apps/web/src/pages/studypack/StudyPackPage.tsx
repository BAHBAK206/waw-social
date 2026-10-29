import type { StudyPackDto } from '@qubedu/shared';
import { useMutation, useQuery } from '@tanstack/react-query';
import { NotebookPen } from 'lucide-react';
import { useState } from 'react';
import { MathText } from '@/components/common/Math';
import { Button, ButtonLink } from '@/components/ui/Button';
import { Input, Select, Textarea } from '@/components/ui/Field';
import { EmptyState, PageHeader } from '@/components/ui/States';
import { api } from '@/lib/api';
import { useT } from '@/lib/i18n';
import { toast, toastError } from '@/lib/ui';

function MindMap({ map }: { map: StudyPackDto['mindMap'] }) {
  if (!map.branches.length) return null;
  return (
    <div className="space-y-3">
      <p className="mx-auto w-fit rounded-full bg-ink px-4 py-1.5 text-center font-black text-white" dir="auto">
        {map.center}
      </p>
      <div className="grid gap-3 sm:grid-cols-2">
        {map.branches.map((b, i) => (
          <div key={i} className="rounded-xl border border-line bg-bg-2 p-3">
            <p className="font-black" dir="auto">
              {b.title}
            </p>
            <ul className="mt-1 list-disc space-y-1 ps-5 text-sm">
              {b.points.map((p, j) => (
                <li key={j} dir="auto">
                  {p}
                </li>
              ))}
            </ul>
          </div>
        ))}
      </div>
    </div>
  );
}

export default function StudyPackPage() {
  const tr = useT();
  const [text, setText] = useState('');
  const [noteId, setNoteId] = useState('');
  const [subject, setSubject] = useState('');
  const [deck, setDeck] = useState('study-pack');
  const notes = useQuery({ queryKey: ['notes'], queryFn: () => api.notes.list() });
  const make = useMutation({ mutationFn: () => api.study.pack({ text: text.trim() || undefined, noteId: noteId || undefined }), onError: toastError });
  const save = useMutation({
    mutationFn: (p: StudyPackDto) =>
      api.study.savePack({ deck: deck.trim() || 'study-pack', cards: p.flashcards, terms: p.glossary, subject: subject.trim() || undefined }),
    onSuccess: (r) => toast(tr.t('studyPack.saved', { cards: r.cards, terms: r.terms })),
    onError: toastError,
  });
  const pack = make.data;
  const canMake = text.trim().length >= 80 || !!noteId;
  return (
    <div className="page">
      <PageHeader title={tr.t('studyPack.title')} subtitle={tr.t('studyPack.subtitle')} icon={<NotebookPen className="size-6" />} />
      <div className="grid gap-5 lg:grid-cols-[2fr_3fr]">
        <form
          className="card space-y-3 self-start p-4"
          onSubmit={(e) => {
            e.preventDefault();
            make.mutate();
          }}
        >
          <Textarea
            label={tr.t('studyPack.text')}
            placeholder={tr.t('studyPack.textPlaceholder')}
            rows={10}
            value={text}
            onChange={(e) => setText(e.target.value)}
            dir="auto"
          />
          {!!notes.data?.items.length && (
            <Select
              label={tr.t('studyPack.fromNote')}
              value={noteId}
              onChange={(e) => setNoteId(e.target.value)}
              options={[
                { value: '', label: tr.t('studyPack.noNote') },
                ...notes.data.items.map((n) => ({ value: n.id, label: n.title || n.body.slice(0, 40) })),
              ]}
            />
          )}
          <Button type="submit" block loading={make.isPending} disabled={!canMake}>
            {tr.t('studyPack.generate')}
          </Button>
        </form>
        <div className="space-y-4">
          {!pack ? null : !pack.flashcards.length && !pack.keyTerms.length ? (
            <EmptyState title={tr.t('studyPack.nothing')} />
          ) : (
            <>
              {pack.keyTerms.length > 0 && (
                <section className="card p-4">
                  <h2 className="mb-2 font-black">{tr.t('studyPack.keyTerms')}</h2>
                  <ul className="flex flex-wrap gap-2">
                    {pack.keyTerms.map((k) => (
                      <li key={k.term} className="badge badge-primary" dir="auto">
                        {k.term} · {k.count}
                      </li>
                    ))}
                  </ul>
                </section>
              )}
              {pack.mindMap.branches.length > 0 && (
                <section className="card p-4">
                  <h2 className="mb-3 font-black">{tr.t('studyPack.mindMap')}</h2>
                  <MindMap map={pack.mindMap} />
                </section>
              )}
              {pack.flashcards.length > 0 && (
                <section className="card p-4">
                  <h2 className="mb-2 font-black">{tr.t('studyPack.flashcards')}</h2>
                  <ul className="divide-y divide-line">
                    {pack.flashcards.map((c, i) => (
                      <li key={i} className="py-2" dir="auto">
                        <p className="font-bold">
                          <MathText text={c.front} />
                        </p>
                        <p className="muted text-sm">
                          <MathText text={c.back} />
                        </p>
                      </li>
                    ))}
                  </ul>
                </section>
              )}
              {pack.questions.length > 0 && (
                <section className="card p-4">
                  <h2 className="mb-2 font-black">{tr.t('studyPack.questions')}</h2>
                  <ol className="list-decimal space-y-2 ps-5">
                    {pack.questions.map((q, i) => (
                      <li key={i} dir="auto">
                        {q.prompt}
                        <details className="muted text-sm">
                          <summary className="cursor-pointer">{tr.t('studyPack.answerIs')}</summary>
                          <span className="font-bold">{q.answer}</span>
                        </details>
                      </li>
                    ))}
                  </ol>
                </section>
              )}
              {pack.flashcards.length > 0 && (
                <section className="card flex flex-wrap items-end gap-3 p-4">
                  <Input
                    label={tr.t('studyPack.subject')}
                    value={subject}
                    onChange={(e) => setSubject(e.target.value)}
                    dir="auto"
                    wrapperClassName="min-w-40 flex-1"
                  />
                  <Input label={tr.t('studyPack.deck')} value={deck} onChange={(e) => setDeck(e.target.value)} dir="auto" wrapperClassName="min-w-40 flex-1" />
                  <Button loading={save.isPending} onClick={() => save.mutate(pack)}>
                    {tr.t('studyPack.saveAll')}
                  </Button>
                  {save.isSuccess && (
                    <ButtonLink to="/review" variant="soft">
                      {tr.t('studyPack.reviewNow')}
                    </ButtonLink>
                  )}
                </section>
              )}
            </>
          )}
        </div>
      </div>
    </div>
  );
}
