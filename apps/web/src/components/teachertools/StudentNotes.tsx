import { useQuery } from '@tanstack/react-query';
import { MessageSquareText } from 'lucide-react';
import { api } from '@/lib/api';
import { formatDate } from '@/lib/format';
import { useT } from '@/lib/i18n';

/** Personal notes teachers wrote about the student (or the parent's children). */
export function StudentNotes() {
  const tr = useT();
  const q = useQuery({ queryKey: ['my-teacher-notes'], queryFn: () => api.teacherTools.myComments() });
  if (!q.data?.items.length) return null;
  return (
    <section className="card mb-5 space-y-2 p-4" aria-label={tr.t('teacherTools.comments.mineTitle')}>
      <h2 className="flex items-center gap-2 font-black">
        <MessageSquareText className="size-5 text-ink" aria-hidden /> {tr.t('teacherTools.comments.mineTitle')}
      </h2>
      <ul className="divide-y divide-line">
        {q.data.items.slice(0, 5).map((n) => (
          <li key={n.id} className="py-2">
            <p dir="auto">{n.text}</p>
            <p className="muted text-xs">
              {tr.t('teacherTools.comments.from', { name: n.teacherName ?? '—', course: n.courseTitle })} · {formatDate(n.createdAt, tr)}
            </p>
          </li>
        ))}
      </ul>
    </section>
  );
}
