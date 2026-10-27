import { useQuery } from '@tanstack/react-query';
import { Select } from '@/components/ui/Field';
import { api } from '@/lib/api';
import { useT } from '@/lib/i18n';

/** Picks one of the teacher's published quizzes as the lesson's checkpoint. */
export function LinkedQuizSelect({ value, onChange }: { value: string; onChange: (id: string) => void }) {
  const tr = useT();
  const quizzes = useQuery({ queryKey: ['quizzes', 'mine', 'linkable'], queryFn: () => api.quizzes.list({ mine: true, limit: 50 }) });
  const options = (quizzes.data?.items ?? []).filter((q) => q.published).map((q) => ({ value: q.id, label: q.title }));
  return (
    <Select
      label={tr.t('studio.linkedQuiz')}
      hint={tr.t('studio.linkedQuizHint')}
      value={value}
      placeholder={tr.t('studio.noQuiz')}
      onChange={(e) => onChange(e.target.value)}
      options={options}
    />
  );
}
