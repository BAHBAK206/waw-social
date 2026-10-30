import type { RubricFeedbackDto } from '@qubedu/shared';
import { ScanSearch, Sparkles } from 'lucide-react';
import { useState } from 'react';
import { Button } from '@/components/ui/Button';
import { api } from '@/lib/api';
import { useT } from '@/lib/i18n';
import { toastError } from '@/lib/ui';

/** Criterion-by-criterion feedback from the AI (a draft for students, a submission for teachers). */
export function RubricFeedbackView({ fb }: { fb: RubricFeedbackDto }) {
  const tr = useT();
  return (
    <div className="space-y-2 rounded-[var(--radius-control)] bg-soft p-3 text-sm" aria-label={tr.t('aiGuard.feedbackTitle')}>
      <p className="font-black">{tr.t('aiGuard.feedbackTitle')}</p>
      <ul className="space-y-2">
        {fb.criteria.map((c) => (
          <li key={c.index}>
            <p>
              <b dir="auto">{c.title}</b>
              {c.levelLabel && <span className="badge ms-2">{c.levelLabel}</span>}
            </p>
            <p dir="auto">{c.comment}</p>
            {c.found.length > 0 && <p className="text-ok text-xs">{tr.t('aiGuard.found', { list: c.found.join(', ') })}</p>}
            {c.missing.length > 0 && <p className="text-warn text-xs">{tr.t('aiGuard.missing', { list: c.missing.join(', ') })}</p>}
          </li>
        ))}
      </ul>
      <p dir="auto">{fb.overall}</p>
      <p className="muted text-xs">{tr.t('aiGuard.stats', fb.stats)}</p>
    </div>
  );
}

/** Student: formative feedback on the draft against the rubric, before handing in. */
export function DraftFeedback({ assignmentId, text }: { assignmentId: string; text: string }) {
  const tr = useT();
  const [fb, setFb] = useState<RubricFeedbackDto | null>(null);
  const [busy, setBusy] = useState(false);
  return (
    <div className="space-y-2">
      <Button
        size="sm"
        variant="soft"
        icon={<Sparkles className="size-4" />}
        loading={busy}
        disabled={text.trim().length < 20}
        onClick={async () => {
          setBusy(true);
          try {
            setFb(await api.ai.rubricFeedback({ assignmentId, text }));
          } catch (e) {
            toastError(e);
          } finally {
            setBusy(false);
          }
        }}
      >
        {tr.t('aiGuard.feedback')}
      </Button>
      {fb && (
        <>
          <p className="muted text-xs">{tr.t('aiGuard.feedbackHint')}</p>
          <RubricFeedbackView fb={fb} />
        </>
      )}
    </div>
  );
}

/** Teacher: possible copying between this assignment's submissions and from the class's materials. */
export function SimilarityPanel({ assignmentId }: { assignmentId: string }) {
  const tr = useT();
  const [busy, setBusy] = useState(false);
  const [r, setR] = useState<Awaited<ReturnType<typeof api.school.similarity>> | null>(null);
  const pct = (n: number) => Math.round(n * 100);
  return (
    <section className="card space-y-3 p-4" aria-label={tr.t('aiGuard.similarity')}>
      <div className="flex flex-wrap items-center gap-2">
        <h2 className="flex-1 font-black">{tr.t('aiGuard.similarity')}</h2>
        <Button
          size="sm"
          variant="outline"
          icon={<ScanSearch className="size-4" />}
          loading={busy}
          onClick={async () => {
            setBusy(true);
            try {
              setR(await api.school.similarity(assignmentId));
            } catch (e) {
              toastError(e);
            } finally {
              setBusy(false);
            }
          }}
        >
          {tr.t('aiGuard.similarityRun')}
        </Button>
      </div>
      <p className="muted text-xs">{tr.t('aiGuard.similarityHint')}</p>
      {r &&
        (!r.pairs.length && !r.sources.length ? (
          <p className="text-sm">{tr.t('aiGuard.similarityNone', { count: r.checked })}</p>
        ) : (
          <div className="space-y-3 text-sm">
            {r.pairs.length > 0 && (
              <div>
                <p className="font-bold">{tr.t('aiGuard.pairs')}</p>
                <ul className="space-y-2">
                  {r.pairs.map((p, i) => (
                    <li key={i} className="rounded-[var(--radius-control)] border border-line p-2">
                      <p>
                        <b dir="auto">{p.a.displayName}</b> ↔ <b dir="auto">{p.b.displayName}</b>{' '}
                        <span className={p.score >= 0.6 ? 'badge badge-err' : 'badge badge-warn'}>{tr.t('aiGuard.score', { pct: pct(p.score) })}</span>
                      </p>
                      {p.excerpt && (
                        <p className="muted mt-1 line-clamp-3" dir="auto">
                          “{p.excerpt}”
                        </p>
                      )}
                    </li>
                  ))}
                </ul>
              </div>
            )}
            {r.sources.length > 0 && (
              <div>
                <p className="font-bold">{tr.t('aiGuard.sources')}</p>
                <ul className="space-y-2">
                  {r.sources.map((p, i) => (
                    <li key={i} className="rounded-[var(--radius-control)] border border-line p-2">
                      <p>
                        <b dir="auto">{p.student.displayName}</b> → <span dir="auto">{p.material}</span>{' '}
                        <span className="badge badge-warn">{tr.t('aiGuard.score', { pct: pct(p.score) })}</span>
                      </p>
                      {p.excerpt && (
                        <p className="muted mt-1 line-clamp-3" dir="auto">
                          “{p.excerpt}”
                        </p>
                      )}
                    </li>
                  ))}
                </ul>
              </div>
            )}
          </div>
        ))}
    </section>
  );
}
