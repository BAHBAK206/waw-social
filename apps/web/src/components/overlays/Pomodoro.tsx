import { useQuery } from '@tanstack/react-query';
import { Maximize2, MoonStar, Pause, Play, RotateCcw, Timer, Volume2, VolumeX } from 'lucide-react';
import { useEffect, useState } from 'react';
import { Button } from '@/components/ui/Button';
import { ProgressRing } from '@/components/ui/Charts';
import { Modal } from '@/components/ui/Modal';
import { api } from '@/lib/api';
import { cx } from '@/lib/cx';
import { formatClock } from '@/lib/format';
import { useT } from '@/lib/i18n';
import { isRunning, remainingMs, totalMs, usePomodoro, type PomodoroMode } from '@/lib/pomodoro';
import { useUi } from '@/lib/ui';

function useNow(active: boolean) {
  const [now, setNow] = useState(Date.now());
  useEffect(() => {
    if (!active) return;
    const id = setInterval(() => {
      setNow(Date.now());
      usePomodoro.getState().tick();
    }, 500);
    return () => clearInterval(id);
  }, [active]);
  return now;
}

/** Timer UI shared by the overlay and the "Focus" tab of My study. */
export function PomodoroPanel({ compact }: { compact?: boolean }) {
  const tr = useT();
  const s = usePomodoro();
  const running = isRunning(s);
  const now = useNow(running);
  const left = remainingMs(s, now);
  const total = totalMs(s);
  const stats = useQuery({ queryKey: ['pomodoro', 'stats'], queryFn: () => api.pomodoro.stats() });
  useEffect(() => {
    void usePomodoro.getState().load();
  }, []);

  const modes: { key: PomodoroMode; label: string }[] = [
    { key: 'focus', label: tr.t('academic.focus.focus') },
    { key: 'shortBreak', label: tr.t('academic.focus.shortBreak') },
    { key: 'longBreak', label: tr.t('academic.focus.longBreak') },
  ];

  return (
    <div className="flex flex-col items-center gap-5">
      <div className="tabs justify-center" role="tablist">
        {modes.map((m) => (
          <button key={m.key} type="button" role="tab" aria-selected={s.mode === m.key} className="tab" disabled={running} onClick={() => s.setMode(m.key)}>
            {m.label}
          </button>
        ))}
      </div>
      <ProgressRing value={total - left} max={total} size={compact ? 200 : 240} stroke={12} label={tr.t('academic.focus.title')}>
        <div>
          <div className="text-5xl font-black tabular-nums" dir="ltr" aria-live="off">
            {formatClock(left / 1000)}
          </div>
          {s.session?.label && <div className="muted mt-1 max-w-40 truncate text-sm">{s.session.label}</div>}
        </div>
      </ProgressRing>
      {!running && s.mode === 'focus' && (
        <div className="grid w-full max-w-sm grid-cols-[1fr_6rem] gap-2">
          <input className="input" placeholder={tr.t('academic.focus.label')} value={s.label} onChange={(e) => s.setLabel(e.target.value)} maxLength={120} />
          <input
            className="input text-center"
            type="number"
            min={1}
            max={120}
            aria-label={tr.t('academic.focus.minutesLabel')}
            value={s.minutes.focus}
            onChange={(e) => s.setMinutes('focus', Number(e.target.value) || 25)}
          />
        </div>
      )}
      <div className="flex items-center gap-2">
        {!running ? (
          <Button size="lg" loading={s.busy} icon={<Play className="size-5" />} onClick={() => void s.start()}>
            {s.pausedRemaining !== null ? tr.t('academic.focus.resume') : tr.t('academic.focus.start')}
          </Button>
        ) : s.breakEndsAt ? (
          <Button size="lg" variant="soft" icon={<Pause className="size-5" />} onClick={s.pause}>
            {tr.t('academic.focus.pause')}
          </Button>
        ) : null}
        {(running || s.pausedRemaining !== null) && (
          <Button size="lg" variant="outline" icon={<RotateCcw className="size-5" />} onClick={() => void s.cancel()}>
            {tr.t('academic.focus.reset')}
          </Button>
        )}
        <button type="button" className="icon-btn" aria-label={tr.t('academic.focus.sound')} aria-pressed={s.sound} onClick={() => s.setSound(!s.sound)}>
          {s.sound ? <Volume2 className="size-5" /> : <VolumeX className="size-5" />}
        </button>
        <button type="button" className="icon-btn" aria-label={tr.t('academic.focus.zen')} onClick={() => useUi.getState().set({ zen: true, pomodoroOpen: false })}>
          <MoonStar className="size-5" />
        </button>
      </div>
      {stats.data && (
        <p className="muted text-sm">
          {tr.t('academic.focus.week', { minutes: stats.data.weekMinutes })}
        </p>
      )}
    </div>
  );
}

/** Overlay dialog + floating mini timer shown while a session runs. */
export default function PomodoroOverlay() {
  const tr = useT();
  const open = useUi((s) => s.pomodoroOpen);
  const zen = useUi((s) => s.zen);
  const s = usePomodoro();
  const running = isRunning(s);
  const now = useNow(running && !open);
  useEffect(() => {
    void usePomodoro.getState().load();
  }, []);

  return (
    <>
      <Modal open={open} onClose={() => useUi.getState().set({ pomodoroOpen: false })} title={tr.t('academic.focus.title')} size="md">
        <PomodoroPanel />
      </Modal>
      {running && !open && (
        <button
          type="button"
          onClick={() => useUi.getState().set({ pomodoroOpen: true, zen: false })}
          className={cx(
            'surface-gradient fixed end-4 z-50 flex items-center gap-2 rounded-full px-4 py-2.5 font-black shadow-2xl',
            zen ? 'bottom-6' : 'bottom-24 lg:bottom-6',
          )}
          aria-label={tr.t('academic.focus.title')}
        >
          <Timer className="size-4" />
          <span dir="ltr" className="tabular-nums">
            {formatClock(remainingMs(s, now) / 1000)}
          </span>
          <Maximize2 className="size-4 opacity-80" />
        </button>
      )}
    </>
  );
}
