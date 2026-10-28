import type { AssistantGapDto, AssistantTestDto } from '@qubedu/shared';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { MessageCircleQuestion, Play, X } from 'lucide-react';
import { useState } from 'react';
import { Button, IconButton } from '@/components/ui/Button';
import { Input, Select, Textarea } from '@/components/ui/Field';
import { Modal } from '@/components/ui/Modal';
import { api } from '@/lib/api';
import { relativeTime } from '@/lib/format';
import { useT } from '@/lib/i18n';
import { toast, toastError } from '@/lib/ui';

const LANGS = ['ar', 'en', 'fr', 'es'] as const;

/** Ask the assistant as a student would, and see which source answered. */
export function AssistantTester() {
  const tr = useT();
  const [q, setQ] = useState('');
  const [lang, setLang] = useState<(typeof LANGS)[number]>(tr.locale);
  const [busy, setBusy] = useState(false);
  const [r, setR] = useState<AssistantTestDto | null>(null);
  const source = r ? (r.provider.split(':')[1] ?? 'claude') : '';
  return (
    <section className="card space-y-3 p-4" aria-labelledby="ai-test">
      <h2 id="ai-test" className="text-lg font-black">
        {tr.t('admin.assistant.test')}
      </h2>
      <p className="muted text-sm">{tr.t('admin.assistant.testHint')}</p>
      <form
        className="flex flex-wrap items-end gap-2"
        onSubmit={async (e) => {
          e.preventDefault();
          setBusy(true);
          try {
            setR(await api.admin.testAssistant(q.trim(), lang));
          } catch (err) {
            toastError(err);
          } finally {
            setBusy(false);
          }
        }}
      >
        <Input label={tr.t('admin.assistant.question')} value={q} wrapperClassName="min-w-56 flex-1" onChange={(e) => setQ(e.target.value)} />
        <Select
          label={tr.t('admin.assistant.language')}
          value={lang}
          onChange={(e) => setLang(e.target.value as (typeof LANGS)[number])}
          options={LANGS.map((l) => ({ value: l, label: l.toUpperCase() }))}
        />
        <Button type="submit" icon={<Play className="size-4" />} loading={busy} disabled={!q.trim()}>
          {tr.t('admin.assistant.testRun')}
        </Button>
      </form>
      {r && (
        <div className="space-y-2 rounded-[var(--radius-control)] bg-soft p-3">
          <p className="text-xs font-black">
            {tr.t('admin.assistant.source')}: {tr.tDyn(`admin.assistant.sources.${source}`, undefined, r.provider)}
          </p>
          <p className="text-sm whitespace-pre-line" dir="auto">
            {r.content}
          </p>
          {r.actions.length > 0 && <p className="muted text-xs">{r.actions.map((a) => `${a.label} → ${a.link}`).join(' · ')}</p>}
        </div>
      )}
    </section>
  );
}

/** Questions nobody answered yet: answer once and the assistant knows it from then on. */
export function AssistantGaps() {
  const tr = useT();
  const qc = useQueryClient();
  const gaps = useQuery({ queryKey: ['admin', 'assistant-gaps'], queryFn: () => api.admin.assistantGaps() });
  const [answering, setAnswering] = useState<AssistantGapDto | null>(null);
  const items = gaps.data?.items ?? [];
  const refresh = () =>
    Promise.all([qc.invalidateQueries({ queryKey: ['admin', 'assistant-gaps'] }), qc.invalidateQueries({ queryKey: ['admin', 'knowledge'] })]);
  return (
    <section className="space-y-3" aria-labelledby="ai-gaps">
      <h2 id="ai-gaps" className="flex items-center gap-2 text-lg font-black">
        <MessageCircleQuestion className="size-5" aria-hidden /> {tr.t('admin.assistant.gaps')}
      </h2>
      <p className="muted text-sm">{tr.t('admin.assistant.gapsHint')}</p>
      {!items.length && <p className="muted text-sm">{tr.t('admin.assistant.gapsEmpty')}</p>}
      <ul className="space-y-2">
        {items.map((g) => (
          <li key={g.id} className="card flex flex-wrap items-center gap-2 p-3">
            <div className="min-w-0 flex-1">
              <p className="font-bold" dir="auto">
                {g.question}
              </p>
              <p className="muted text-xs">
                {g.language.toUpperCase()} · {tr.t('admin.assistant.asked', { count: g.count })} · {relativeTime(g.lastAskedAt, tr)}
              </p>
            </div>
            <Button size="sm" onClick={() => setAnswering(g)}>
              {tr.t('admin.assistant.answerIt')}
            </Button>
            <IconButton
              label={tr.t('admin.assistant.dismiss')}
              size="sm"
              onClick={async () => {
                try {
                  await api.admin.dismissGap(g.id);
                  await refresh();
                } catch (e) {
                  toastError(e);
                }
              }}
            >
              <X className="size-4" />
            </IconButton>
          </li>
        ))}
      </ul>
      {answering && <AnswerGapDialog gap={answering} onClose={() => setAnswering(null)} onDone={refresh} />}
    </section>
  );
}

function AnswerGapDialog({ gap, onClose, onDone }: { gap: AssistantGapDto; onClose: () => void; onDone: () => Promise<unknown> }) {
  const tr = useT();
  const [answer, setAnswer] = useState('');
  const [link, setLink] = useState('');
  const [busy, setBusy] = useState(false);
  return (
    <Modal
      open
      onClose={onClose}
      title={tr.t('admin.assistant.answerIt')}
      footer={
        <Button
          loading={busy}
          disabled={!answer.trim()}
          onClick={async () => {
            setBusy(true);
            try {
              await api.admin.answerGap(gap.id, { answer: answer.trim(), link: link.trim() || null });
              toast(tr.t('admin.assistant.answered'));
              await onDone();
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
      <div className="space-y-3">
        <p className="rounded-[var(--radius-control)] bg-soft p-3 font-bold" dir="auto">
          {gap.question}
        </p>
        <Textarea label={tr.t('admin.assistant.answer')} rows={5} value={answer} onChange={(e) => setAnswer(e.target.value)} />
        <Input type="url" dir="ltr" label={tr.t('admin.assistant.link')} value={link} onChange={(e) => setLink(e.target.value)} />
      </div>
    </Modal>
  );
}
