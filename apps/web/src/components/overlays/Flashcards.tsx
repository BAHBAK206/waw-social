import type { FlashcardDto } from '@qubedu/shared';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { Layers, PartyPopper, RotateCcw } from 'lucide-react';
import { useState } from 'react';
import { Button } from '@/components/ui/Button';
import { ProgressBar } from '@/components/ui/Charts';
import { Modal } from '@/components/ui/Modal';
import { EmptyState, ErrorState, Spinner } from '@/components/ui/States';
import { api } from '@/lib/api';
import { cx } from '@/lib/cx';
import { useT } from '@/lib/i18n';
import { qk } from '@/lib/query';
import { celebrate, toastError, useUi } from '@/lib/ui';
import { ReadAloud } from '@/components/common/ReadAloud';

type Rating = 'again' | 'unsure' | 'know' | 'easy';

/** Spaced-repetition review session over due cards (SM-2 scheduling happens on the server). */
export function FlashcardReviewer({ deck, onDone }: { deck?: string; onDone?: () => void }) {
  const tr = useT();
  const qc = useQueryClient();
  const query = useQuery({ queryKey: [...qk.flashcards, 'due', deck ?? ''], queryFn: () => api.flashcards.list({ due: true, deck }), staleTime: 0 });
  const [queue, setQueue] = useState<FlashcardDto[] | null>(null);
  const [flipped, setFlipped] = useState(false);
  const [reviewed, setReviewed] = useState(0);
  const [busy, setBusy] = useState(false);
  const cards = queue ?? query.data?.items ?? [];
  const total = (query.data?.items.length ?? 0) || 1;
  const card = cards[0];

  if (query.isPending) return <Spinner />;
  if (query.error) return <ErrorState error={query.error} onRetry={() => void query.refetch()} />;

  if (!card) {
    return reviewed ? (
      <EmptyState
        icon={<PartyPopper className="size-7" />}
        title={tr.t('academic.cards.sessionDone', { count: reviewed })}
        action={
          onDone && (
            <Button variant="soft" onClick={onDone}>
              {tr.t('common.done')}
            </Button>
          )
        }
      />
    ) : (
      <EmptyState icon={<Layers className="size-7" />} title={tr.t('academic.cards.noneDue')} />
    );
  }

  const rate = async (rating: Rating) => {
    setBusy(true);
    try {
      const res = await api.flashcards.review(card.id, rating);
      celebrate({ newAchievements: res.newAchievements });
      const rest = cards.slice(1);
      // "Again" puts the card back at the end of this session.
      setQueue(rating === 'again' ? [...rest, res.card] : rest);
      setReviewed((n) => n + 1);
      setFlipped(false);
      void qc.invalidateQueries({ queryKey: qk.dashboard });
      if (!rest.length && rating !== 'again') void qc.invalidateQueries({ queryKey: qk.flashcards });
    } catch (e) {
      toastError(e);
    } finally {
      setBusy(false);
    }
  };

  const buttons: { r: Rating; label: string; cls: string }[] = [
    { r: 'again', label: tr.t('academic.cards.again'), cls: 'btn-danger' },
    { r: 'unsure', label: tr.t('academic.cards.unsure'), cls: 'btn-outline' },
    { r: 'know', label: tr.t('academic.cards.know'), cls: 'btn-soft' },
    { r: 'easy', label: tr.t('academic.cards.easy'), cls: 'btn-success' },
  ];

  return (
    <div className="mx-auto flex max-w-xl flex-col gap-4">
      <div className="flex items-center gap-3 text-sm">
        <span className="badge badge-primary">{card.deck}</span>
        <ProgressBar value={Math.min(reviewed, total)} max={Math.max(total, reviewed + cards.length)} className="flex-1" />
        <span className="muted tabular-nums">{cards.length}</span>
      </div>
      <button
        type="button"
        onClick={() => setFlipped((f) => !f)}
        className="relative h-72 w-full [perspective:1200px]"
        aria-label={flipped ? card.back : `${card.front} — ${tr.t('academic.cards.showAnswer')}`}
      >
        <div className={cx('relative h-full w-full transition-transform duration-500 [transform-style:preserve-3d]', flipped && '[transform:rotateY(180deg)]')}>
          <div className="card absolute inset-0 grid place-items-center p-6 text-center text-xl font-bold [backface-visibility:hidden]">
            <span className="whitespace-pre-wrap">{card.front}</span>
            <span className="muted absolute bottom-3 text-xs font-normal">{tr.t('academic.cards.showAnswer')}</span>
          </div>
          <div className="surface-gradient absolute inset-0 grid place-items-center rounded-[var(--radius-card)] p-6 text-center text-lg font-bold [backface-visibility:hidden] [transform:rotateY(180deg)]">
            <span className="whitespace-pre-wrap">{card.back}</span>
          </div>
        </div>
      </button>
      <div className="flex justify-center">
        <ReadAloud text={flipped ? card.back : card.front} />
      </div>
      {flipped ? (
        <div className="grid grid-cols-4 gap-2">
          {buttons.map((b) => (
            <button key={b.r} type="button" className={cx('btn btn-sm', b.cls)} disabled={busy} onClick={() => void rate(b.r)}>
              {b.label}
            </button>
          ))}
        </div>
      ) : (
        <Button block icon={<RotateCcw className="size-4" />} onClick={() => setFlipped(true)}>
          {tr.t('academic.cards.showAnswer')}
        </Button>
      )}
    </div>
  );
}

export default function FlashcardsOverlay() {
  const tr = useT();
  const ctx = useUi((s) => s.flashcards);
  const close = () => useUi.getState().set({ flashcards: null });
  return (
    <Modal open={!!ctx} onClose={close} title={tr.t('academic.cards.title')} size="lg">
      <FlashcardReviewer deck={ctx?.deck} onDone={close} />
    </Modal>
  );
}
