import type { IntegrityEvent } from '@qubedu/shared';
import { Maximize, ShieldAlert } from 'lucide-react';
import { useEffect, useRef, useState } from 'react';
import { Button } from '@/components/ui/Button';
import { api } from '@/lib/api';
import { useT } from '@/lib/i18n';
import { toast } from '@/lib/ui';

/**
 * Exam mode: asks for full screen and tells the server when the student leaves the page or full screen, or pastes.
 * The teacher sees the counts next to each student's result. Nothing is blocked; it is a deterrent and a record.
 */
export function ExamIntegrity({ attemptId }: { attemptId: string }) {
  const tr = useT();
  const [full, setFull] = useState(() => !!document.fullscreenElement);
  const last = useRef(0);
  useEffect(() => {
    const send = (type: IntegrityEvent) => {
      // Leaving the tab fires both "visibilitychange" and "blur": count it once.
      const now = Date.now();
      if (type === 'blur' && now - last.current < 1500) return;
      if (type === 'blur') last.current = now;
      void api.quizzes.integrityEvent(attemptId, type).catch(() => undefined);
      if (type !== 'paste') toast(tr.t('quiz.bank.left'), 'err');
    };
    const onVisibility = () => document.visibilityState === 'hidden' && send('blur');
    const onBlur = () => send('blur');
    const onFull = () => {
      const on = !!document.fullscreenElement;
      setFull(on);
      if (!on) send('fullscreen_exit');
    };
    const onPaste = () => send('paste');
    document.addEventListener('visibilitychange', onVisibility);
    window.addEventListener('blur', onBlur);
    document.addEventListener('fullscreenchange', onFull);
    document.addEventListener('paste', onPaste);
    return () => {
      document.removeEventListener('visibilitychange', onVisibility);
      window.removeEventListener('blur', onBlur);
      document.removeEventListener('fullscreenchange', onFull);
      document.removeEventListener('paste', onPaste);
      if (document.fullscreenElement) void document.exitFullscreen().catch(() => undefined);
    };
  }, [attemptId, tr]);
  return (
    <div role="note" className="mb-4 flex flex-wrap items-center gap-3 rounded-[var(--radius-card)] border border-warn bg-soft p-3 text-sm">
      <ShieldAlert className="size-5 shrink-0 text-warn" aria-hidden />
      <p className="min-w-0 flex-1">{tr.t('quiz.bank.integrityNotice')}</p>
      {!full && document.fullscreenEnabled && (
        <Button
          size="sm"
          variant="outline"
          icon={<Maximize className="size-4" />}
          onClick={() => void document.documentElement.requestFullscreen().catch(() => undefined)}
        >
          {tr.t('quiz.bank.fullscreen')}
        </Button>
      )}
    </div>
  );
}
