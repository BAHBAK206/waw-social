import type { TimetableEntryDto, Weekday } from '@qubedu/shared';
import { useQuery } from '@tanstack/react-query';
import { CalendarRange, Plus } from 'lucide-react';
import { useState } from 'react';
import { SlotDialog, WeekGrid, draftOf, emptyDraft, useTimetable } from '@/components/tools/Timetable';
import { Button } from '@/components/ui/Button';
import { EmptyState, PageHeader, Spinner } from '@/components/ui/States';
import { api } from '@/lib/api';
import { useT } from '@/lib/i18n';
import { useSession } from '@/lib/session';

/** Weekly timetable. Parents see a linked child's (read-only). */
export default function TimetablePage() {
  const tr = useT();
  const parent = useSession((s) => s.me?.accountType === 'parent');
  return (
    <div className="page mx-auto max-w-6xl">
      <PageHeader title={tr.t('timetable.title')} subtitle={tr.t('features.timetable')} icon={<CalendarRange className="size-6" />} />
      {parent ? <ChildTimetable /> : <MyTimetable />}
    </div>
  );
}

function MyTimetable() {
  const tr = useT();
  const q = useTimetable();
  const [draft, setDraft] = useState<ReturnType<typeof emptyDraft> | null>(null);
  const items = q.data?.items ?? [];
  if (q.isPending) return <Spinner className="py-10" />;
  return (
    <div className="space-y-4">
      <Button icon={<Plus className="size-4" />} onClick={() => setDraft(emptyDraft())}>
        {tr.t('timetable.add')}
      </Button>
      {!items.length && <EmptyState icon={<CalendarRange className="size-7" />} title={tr.t('timetable.empty')} />}
      <WeekGrid items={items} onEdit={(e: TimetableEntryDto) => setDraft(draftOf(e))} onAdd={(d: Weekday) => setDraft(emptyDraft(d))} />
      {draft && <SlotDialog draft={draft} all={items} onClose={() => setDraft(null)} />}
    </div>
  );
}

function ChildTimetable() {
  const tr = useT();
  const fam = useQuery({ queryKey: ['family'], queryFn: () => api.family.get() });
  const children = fam.data?.children ?? [];
  const [picked, setPicked] = useState<string | null>(null);
  const current = picked ?? children[0]?.id;
  const q = useTimetable(current);
  if (fam.isPending) return <Spinner className="py-10" />;
  if (!current) return <EmptyState title={tr.t('family.requestTitle')} body={tr.t('family.requestHint')} />;
  return (
    <div className="space-y-4">
      {children.length > 1 && (
        <div className="flex flex-wrap gap-2">
          {children.map((c) => (
            <button key={c.id} type="button" className="chip" aria-pressed={c.id === current} onClick={() => setPicked(c.id)}>
              {tr.t('timetable.child')} {c.displayName}
            </button>
          ))}
        </div>
      )}
      {q.data && !q.data.items.length && <EmptyState title={tr.t('timetable.empty')} />}
      {q.data && <WeekGrid items={q.data.items} />}
    </div>
  );
}
