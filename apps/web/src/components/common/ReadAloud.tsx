import type { LabLanguage } from '@qubedu/shared';
import { Square, Volume2 } from 'lucide-react';
import { useId } from 'react';
import { cx } from '@/lib/cx';
import { useT } from '@/lib/i18n';
import { canSpeak, speak, stopSpeaking, useSpeech } from '@/lib/speech';

/** Speaker button that reads a text aloud (and stops on a second press). Hidden where the browser has no speech synthesis. */
export function ReadAloud({ text, lang, compact, className }: { text: string; lang?: LabLanguage; compact?: boolean; className?: string }) {
  const tr = useT();
  const id = useId();
  const speaking = useSpeech((s) => s.speakingId === id);
  if (!canSpeak() || !text.trim()) return null;
  const label = speaking ? tr.t('lab.stop') : tr.t('lab.listen');
  return (
    <button
      type="button"
      className={cx(compact ? 'inline-flex items-center gap-1 font-bold hover:underline' : 'btn btn-ghost btn-sm', speaking && 'text-ink', className)}
      aria-pressed={speaking}
      aria-label={label}
      title={label}
      onClick={() => (speaking ? stopSpeaking() : void speak(text, { lang, id }))}
    >
      {speaking ? <Square className="size-3.5 fill-current" aria-hidden /> : <Volume2 className={compact ? 'size-3.5' : 'size-4'} aria-hidden />}
      {!compact && <span>{label}</span>}
    </button>
  );
}
