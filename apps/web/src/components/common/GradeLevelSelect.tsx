import { STAGES, type GradeLevel, type Stage } from '@qubedu/shared';
import { Field } from '@/components/ui/Field';
import { useT } from '@/lib/i18n';

/** School year picker grouped by stage (primary 1 → university). */
export function GradeLevelSelect({
  value,
  onChange,
  disabled,
  hint,
  label,
}: {
  value: GradeLevel | '';
  onChange: (v: GradeLevel | '') => void;
  disabled?: boolean;
  hint?: string;
  label?: string;
}) {
  const tr = useT();
  return (
    <Field label={label ?? tr.t('stages.label')} hint={hint ?? tr.t('stages.hint')}>
      {(id, desc) => (
        <select
          id={id}
          aria-describedby={desc}
          className="input"
          value={value}
          disabled={disabled}
          onChange={(e) => onChange(e.target.value as GradeLevel | '')}
        >
          <option value="">—</option>
          {(Object.keys(STAGES) as Stage[]).map((s) => (
            <optgroup key={s} label={tr.t(`stages.groups.${s}`)}>
              {STAGES[s].map((g) => (
                <option key={g} value={g}>
                  {tr.t(`stages.grades.${g}`)}
                </option>
              ))}
            </optgroup>
          ))}
        </select>
      )}
    </Field>
  );
}
