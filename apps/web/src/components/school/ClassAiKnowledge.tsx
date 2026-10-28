import type { CourseDto, CourseKnowledgeDto } from '@qubedu/shared';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { Bot, Pencil, Plus, Trash2 } from 'lucide-react';
import { useState } from 'react';
import { Button, IconButton } from '@/components/ui/Button';
import { Input, Textarea } from '@/components/ui/Field';
import { Modal } from '@/components/ui/Modal';
import { api } from '@/lib/api';
import { useT } from '@/lib/i18n';
import { toast, toastError } from '@/lib/ui';

type Draft = { id?: string; question: string; answer: string; link: string };
const EMPTY: Draft = { question: '', answer: '', link: '' };

/** Teacher feeds the class assistant with questions and answers that only this class gets. */
export function ClassAiKnowledge({ course }: { course: CourseDto }) {
  const tr = useT();
  const qc = useQueryClient();
  const key = ['course', course.id, 'knowledge'];
  const list = useQuery({ queryKey: key, queryFn: () => api.school.knowledge(course.id) });
  const [draft, setDraft] = useState<Draft | null>(null);
  const [busy, setBusy] = useState(false);
  const items = list.data?.items ?? [];
  const save = async () => {
    if (!draft) return;
    setBusy(true);
    try {
      const body = { question: draft.question.trim(), answer: draft.answer.trim(), link: draft.link.trim() || null };
      if (draft.id) await api.school.updateKnowledge(course.id, draft.id, body);
      else await api.school.addKnowledge(course.id, body);
      toast(tr.t('classAi.saved'));
      setDraft(null);
      await qc.invalidateQueries({ queryKey: key });
    } catch (e) {
      toastError(e);
    } finally {
      setBusy(false);
    }
  };
  return (
    <section aria-labelledby="class-ai" className="space-y-3">
      <div className="flex flex-wrap items-center gap-2">
        <h2 id="class-ai" className="flex flex-1 items-center gap-2 font-black">
          <Bot className="size-5" aria-hidden /> {tr.t('classAi.title')}
        </h2>
        <Button variant="outline" icon={<Plus className="size-4" />} onClick={() => setDraft(EMPTY)}>
          {tr.t('classAi.add')}
        </Button>
      </div>
      <p className="muted text-sm">{tr.t('classAi.hint')}</p>
      {items.length === 0 ? (
        <p className="muted rounded-[var(--radius-control)] border border-dashed border-line p-4 text-center text-sm">{tr.t('classAi.empty')}</p>
      ) : (
        <ul className="divide-y divide-line rounded-[var(--radius-card)] border border-line">
          {items.map((k: CourseKnowledgeDto) => (
            <li key={k.id} className="flex items-start gap-2 p-3">
              <div className="min-w-0 flex-1">
                <p className="font-bold" dir="auto">
                  {k.question}
                </p>
                <p className="muted line-clamp-3 text-sm whitespace-pre-line" dir="auto">
                  {k.answer}
                </p>
              </div>
              <IconButton
                label={tr.t('common.edit')}
                size="sm"
                onClick={() => setDraft({ id: k.id, question: k.question, answer: k.answer, link: k.link ?? '' })}
              >
                <Pencil className="size-4" />
              </IconButton>
              <IconButton
                label={tr.t('common.delete')}
                size="sm"
                onClick={async () => {
                  try {
                    await api.school.removeKnowledge(course.id, k.id);
                    await qc.invalidateQueries({ queryKey: key });
                  } catch (e) {
                    toastError(e);
                  }
                }}
              >
                <Trash2 className="size-4" />
              </IconButton>
            </li>
          ))}
        </ul>
      )}
      <Modal
        open={!!draft}
        onClose={() => setDraft(null)}
        title={draft?.id ? tr.t('common.edit') : tr.t('classAi.add')}
        footer={
          <Button loading={busy} disabled={!draft || draft.question.trim().length < 3 || !draft.answer.trim()} onClick={() => void save()}>
            {tr.t('common.save')}
          </Button>
        }
      >
        {draft && (
          <div className="space-y-3">
            <Input label={tr.t('classAi.question')} value={draft.question} maxLength={500} onChange={(e) => setDraft({ ...draft, question: e.target.value })} />
            <Textarea
              label={tr.t('classAi.answer')}
              rows={5}
              value={draft.answer}
              maxLength={4000}
              onChange={(e) => setDraft({ ...draft, answer: e.target.value })}
            />
            <Input type="url" dir="ltr" label={tr.t('classAi.link')} value={draft.link} onChange={(e) => setDraft({ ...draft, link: e.target.value })} />
          </div>
        )}
      </Modal>
    </section>
  );
}
