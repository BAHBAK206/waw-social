import type { CurriculumKind, CurriculumNodeDto } from '@qubedu/shared';
import { useQuery } from '@tanstack/react-query';
import { MapPin, X } from 'lucide-react';
import { useEffect, useId, useState } from 'react';
import { api } from '@/lib/api';
import { cx } from '@/lib/cx';
import { useT } from '@/lib/i18n';

/** Label for a node id ("Lesson › Objective (code)"), shared by every picker on the page. */
export function useCurriculumLabel(id: string | null | undefined) {
  const q = useQuery({
    queryKey: ['curriculum-node', id],
    queryFn: () => api.curriculum.nodes([id!]),
    enabled: !!id,
    staleTime: 10 * 60_000,
  });
  const x = q.data?.items[0];
  return x ? labelOf(x.node, x.path) : null;
}

export function labelOf(node: CurriculumNodeDto, path: string) {
  const self = node.code ? `${node.title} (${node.code})` : node.title;
  return path ? `${path} › ${self}` : self;
}

/**
 * Search-as-you-type picker for a place in the curriculum (an objective, a lesson or a unit).
 * `kinds` limits what can be chosen.
 */
export function CurriculumPicker({
  label,
  value,
  onChange,
  kinds,
  className,
}: {
  label: string;
  value: string | null | undefined;
  onChange: (id: string | null) => void;
  kinds?: CurriculumKind[];
  className?: string;
}) {
  const tr = useT();
  const id = useId();
  const current = useCurriculumLabel(value);
  const [term, setTerm] = useState('');
  const [debounced, setDebounced] = useState('');
  const [open, setOpen] = useState(false);
  useEffect(() => {
    const t = setTimeout(() => setDebounced(term.trim()), 250);
    return () => clearTimeout(t);
  }, [term]);
  const results = useQuery({ queryKey: ['curriculum-search', debounced], queryFn: () => api.curriculum.search(debounced), enabled: debounced.length >= 2 });
  const items = (results.data?.items ?? []).filter((x) => !kinds || kinds.includes(x.node.kind));
  return (
    <div className={cx('relative', className)}>
      <label htmlFor={id} className="field-label">
        {label}
      </label>
      {value ? (
        <div className="input flex items-center gap-2">
          <MapPin className="size-4 shrink-0 text-ink" aria-hidden />
          <span className="min-w-0 flex-1 truncate text-sm" dir="auto" title={current ?? ''}>
            {current ?? '…'}
          </span>
          <button type="button" className="icon-btn icon-btn-sm" aria-label={tr.t('curriculum.pickerClear')} onClick={() => onChange(null)}>
            <X className="size-4" />
          </button>
        </div>
      ) : (
        <input
          id={id}
          className="input"
          role="combobox"
          aria-expanded={open && items.length > 0}
          aria-controls={`${id}-list`}
          aria-autocomplete="list"
          placeholder={tr.t('curriculum.pickerSearch')}
          value={term}
          onFocus={() => setOpen(true)}
          onBlur={() => setTimeout(() => setOpen(false), 150)}
          onChange={(e) => {
            setTerm(e.target.value);
            setOpen(true);
          }}
        />
      )}
      {!value && open && items.length > 0 && (
        <ul id={`${id}-list`} role="listbox" className="card absolute inset-x-0 top-full z-30 mt-1 max-h-72 overflow-auto p-1 shadow-lg">
          {items.map((x) => (
            <li key={x.node.id} role="option" aria-selected={false}>
              <button
                type="button"
                className="w-full rounded-[var(--radius-control)] p-2 text-start hover:bg-bg-3"
                onMouseDown={(e) => e.preventDefault()}
                onClick={() => {
                  onChange(x.node.id);
                  setTerm('');
                  setOpen(false);
                }}
              >
                <span className="block text-sm font-bold" dir="auto">
                  {x.node.code ? `${x.node.title} (${x.node.code})` : x.node.title}
                </span>
                <span className="muted block truncate text-xs" dir="auto">
                  {tr.t(`curriculum.kinds.${x.node.kind}`)} · {x.path}
                </span>
              </button>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}
