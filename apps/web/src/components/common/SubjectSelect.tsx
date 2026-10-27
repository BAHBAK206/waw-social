import { useQuery } from '@tanstack/react-query';
import { api } from '@/lib/api';
import { cx } from '@/lib/cx';
import { useT } from '@/lib/i18n';
import { qk } from '@/lib/query';

/** Subject picker grouped by section (grade/level), from the admin-managed taxonomy. */
export function SubjectSelect({
  value,
  onChange,
  emptyLabel,
  className,
  label,
}: {
  value: string;
  onChange: (materialId: string) => void;
  emptyLabel: string;
  className?: string;
  label?: string;
}) {
  const tr = useT();
  const q = useQuery({ queryKey: qk.taxonomy, queryFn: () => api.taxonomy(), staleTime: 10 * 60_000 });
  return (
    <select
      className={cx('input h-9 min-h-0 w-auto py-0 text-sm', className)}
      value={value}
      aria-label={label ?? tr.t('feed.subject')}
      onChange={(e) => onChange(e.target.value)}
    >
      <option value="">{emptyLabel}</option>
      {(q.data?.sections ?? []).map((s) =>
        s.materials.length ? (
          <optgroup key={s.id} label={s.name}>
            {s.materials.map((m) => (
              <option key={m.id} value={m.id}>
                {m.name}
              </option>
            ))}
          </optgroup>
        ) : null,
      )}
    </select>
  );
}
