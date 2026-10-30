import { useState } from 'react';
import { Button } from '@/components/ui/Button';
import { Modal } from '@/components/ui/Modal';
import { api } from '@/lib/api';
import { cx } from '@/lib/cx';
import { useT } from '@/lib/i18n';
import { useSession } from '@/lib/session';
import { useUi } from '@/lib/ui';

const EMOJI = ['👋', '🎯', '🗓️', '🤝', '🎨'];

export default function Onboarding() {
  const tr = useT();
  const steps = tr.dict.onboarding.steps;
  const [i, setI] = useState(0);
  const finish = () => {
    useUi.getState().set({ onboardingOpen: false });
    useSession.getState().patchMe({ onboardingDone: true });
    void api.me.prefs({ onboardingDone: true }).catch(() => undefined);
  };
  const step = steps[i]!;
  const last = i === steps.length - 1;
  return (
    <Modal
      open
      onClose={finish}
      size="sm"
      footer={
        <>
          <Button variant="ghost" onClick={finish}>
            {tr.t('onboarding.skip')}
          </Button>
          <div className="flex-1" />
          {i > 0 && (
            <Button variant="outline" onClick={() => setI(i - 1)}>
              {tr.t('common.previous')}
            </Button>
          )}
          <Button onClick={() => (last ? finish() : setI(i + 1))}>{last ? tr.t('onboarding.finish') : tr.t('common.next')}</Button>
        </>
      }
    >
      <div className="py-4 text-center">
        <div className="surface-gradient mx-auto mb-5 grid size-20 place-items-center rounded-3xl text-4xl shadow-xl" aria-hidden>
          {EMOJI[i]}
        </div>
        <h2 className="text-2xl font-black">{step[0]}</h2>
        <p className="muted mt-2">{step[1]}</p>
        <div className="mt-6 flex justify-center gap-1.5" aria-hidden>
          {steps.map((_, k) => (
            <span key={k} className={cx('h-2 rounded-full transition-all', k === i ? 'w-6 bg-primary' : 'w-2 bg-bg-3')} />
          ))}
        </div>
      </div>
    </Modal>
  );
}
