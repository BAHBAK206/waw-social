import { CheckCircle2, Info, Sparkles, TriangleAlert, X } from 'lucide-react';
import { useEffect, useState } from 'react';
import { Button } from '@/components/ui/Button';
import { Modal } from '@/components/ui/Modal';
import { cx } from '@/lib/cx';
import { useT } from '@/lib/i18n';
import { achievementName, useUi } from '@/lib/ui';
import { ACHIEVEMENTS } from '@qubedu/shared';

export function Toaster() {
  const toasts = useUi((s) => s.toasts);
  const tr = useT();
  return (
    <div className="pointer-events-none fixed inset-x-0 bottom-20 z-[100] flex flex-col items-center gap-2 px-4 md:bottom-6" aria-live="polite">
      {toasts.map((t) => (
        <div
          key={t.id}
          role={t.kind === 'err' ? 'alert' : 'status'}
          className={cx(
            'card animate-pop pointer-events-auto flex max-w-md items-start gap-3 bg-[var(--card-solid)] px-4 py-3 shadow-xl',
            t.kind === 'err' && 'border-err',
          )}
        >
          {t.kind === 'ok' ? (
            <CheckCircle2 className="mt-0.5 size-5 shrink-0 text-ok" />
          ) : t.kind === 'err' ? (
            <TriangleAlert className="mt-0.5 size-5 shrink-0 text-err" />
          ) : (
            <Info className="mt-0.5 size-5 shrink-0 text-info" />
          )}
          <p className="min-w-0 flex-1 text-sm font-bold">{t.text}</p>
          <button
            type="button"
            aria-label={tr.t('common.close')}
            className="text-fg-3 hover:text-fg"
            onClick={() => useUi.setState((s) => ({ toasts: s.toasts.filter((x) => x.id !== t.id) }))}
          >
            <X className="size-4" />
          </button>
        </div>
      ))}
    </div>
  );
}

export function ConfirmHost() {
  const req = useUi((s) => s.confirm);
  const tr = useT();
  const [value, setValue] = useState('');
  useEffect(() => setValue(req?.input?.defaultValue ?? ''), [req]);
  if (!req) return null;
  const close = (v: string | boolean | null) => {
    req.resolve(v);
    useUi.setState({ confirm: null });
  };
  return (
    <Modal
      open
      size="sm"
      title={req.title}
      onClose={() => close(req.input ? null : false)}
      footer={
        <>
          <Button variant="ghost" onClick={() => close(req.input ? null : false)}>
            {tr.t('common.cancel')}
          </Button>
          <Button
            variant={req.danger ? 'danger' : 'primary'}
            disabled={!!req.input && !value.trim()}
            onClick={() => close(req.input ? value.trim() : true)}
            data-autofocus={req.input ? undefined : ''}
          >
            {req.confirmLabel ?? tr.t('common.confirm')}
          </Button>
        </>
      }
    >
      {req.body && <p className="text-fg-2">{req.body}</p>}
      {req.input && (
        <form
          onSubmit={(e) => {
            e.preventDefault();
            if (value.trim()) close(value.trim());
          }}
        >
          <label className="field-label mt-2" htmlFor="confirm-input">
            {req.input.label}
          </label>
          <input
            id="confirm-input"
            data-autofocus=""
            className="input"
            type={req.input.type ?? 'text'}
            placeholder={req.input.placeholder}
            value={value}
            onChange={(e) => setValue(e.target.value)}
          />
        </form>
      )}
    </Modal>
  );
}

/** XP gains, level-ups and newly unlocked achievements. */
export function RewardHost() {
  const rewards = useUi((s) => s.rewards);
  const tr = useT();
  return (
    <div className="pointer-events-none fixed inset-x-0 top-20 z-[95] flex flex-col items-center gap-2 px-4" aria-live="polite">
      {rewards.map((r) => (
        <div key={r.id} className="surface-gradient animate-pop flex items-center gap-3 rounded-full px-5 py-2.5 shadow-2xl">
          <Sparkles className="size-5" />
          <div className="text-sm font-black">
            {r.xp > 0 && <span>{tr.t('xp.earned', { xp: r.xp })}</span>}
            {r.levelUp && <span className="ms-2">{tr.t('xp.levelUp', { level: r.levelUp })}</span>}
            {r.achievements.map((a) => (
              <span key={a} className="ms-2 block">
                {ACHIEVEMENTS.find((d) => d.id === a)?.icon} {tr.t('xp.achievement', { name: achievementName(a) })}
              </span>
            ))}
          </div>
        </div>
      ))}
    </div>
  );
}
