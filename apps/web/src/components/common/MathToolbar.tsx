import { MATH_SNIPPETS } from '@qubedu/shared';
import { useT } from '@/lib/i18n';

/** One-tap formulas (fraction, power, root…) added at the end of the text, to edit afterwards. */
export function MathToolbar({ onInsert }: { onInsert: (snippet: string) => void }) {
  const tr = useT();
  return (
    <div className="flex flex-wrap items-center gap-1" role="toolbar" aria-label={tr.t('math.insert')}>
      {MATH_SNIPPETS.map((s) => (
        <button
          key={s.id}
          type="button"
          className="min-h-8 min-w-9 rounded-[var(--radius-control)] border border-line px-2 font-serif text-sm hover:border-primary"
          title={tr.t(`math.symbols.${s.id}`)}
          aria-label={tr.t(`math.symbols.${s.id}`)}
          onClick={() => onInsert(s.snippet)}
        >
          {s.label}
        </button>
      ))}
    </div>
  );
}
