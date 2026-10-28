import { useQuery } from '@tanstack/react-query';
import { SelectField } from '@/components/kit';
import { api } from '@/lib/api';

/** Subject picker grouped by grade/level, from the admin-managed taxonomy. */
export function SubjectPicker({ label, value, onChange, placeholder }: { label: string; value: string; onChange: (id: string) => void; placeholder: string }) {
  const q = useQuery({ queryKey: ['taxonomy'], queryFn: () => api.taxonomy(), staleTime: 10 * 60_000 });
  const options = (q.data?.sections ?? []).flatMap((s) => s.materials.map((m) => ({ value: m.id, label: m.name, group: s.name })));
  return <SelectField label={label} value={value} onChange={onChange} placeholder={placeholder} options={options} />;
}
