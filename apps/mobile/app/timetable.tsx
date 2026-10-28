import type { TimetableEntryDto } from '@qubedu/shared';
import { useQuery } from '@tanstack/react-query';
import { useState } from 'react';
import { View } from 'react-native';
import { GuideHint } from '@/components/Guide';
import { FeatureGate } from '@/components/kit';
import { Screen } from '@/components/Screen';
import { SlotSheet, WeekList, draftOf, emptyDraft, useTimetable } from '@/components/Timetable';
import { Button, Chip, Empty, Loading, Text } from '@/components/ui';
import { api } from '@/lib/api';
import { useT } from '@/lib/i18n';
import { useSession } from '@/lib/session';

export default function TimetableScreen() {
  const tr = useT();
  const parent = useSession((s) => s.me?.accountType === 'parent');
  return (
    <FeatureGate id="timetable">
      <Screen>
        <GuideHint id="tools" />
        <Text muted size={13}>
          {tr.t('features.timetable')}
        </Text>
        {parent ? <ChildTimetable /> : <MyTimetable />}
      </Screen>
    </FeatureGate>
  );
}

function MyTimetable() {
  const tr = useT();
  const q = useTimetable();
  const [draft, setDraft] = useState<ReturnType<typeof emptyDraft> | null>(null);
  const items = q.data?.items ?? [];
  if (q.isPending) return <Loading />;
  return (
    <View style={{ gap: 12 }}>
      <Button icon="add" title={tr.t('timetable.add')} onPress={() => setDraft(emptyDraft())} />
      {!items.length ? <Empty icon="calendar-outline" title={tr.t('timetable.empty')} /> : null}
      <WeekList items={items} onEdit={(e: TimetableEntryDto) => setDraft(draftOf(e))} />
      {draft ? <SlotSheet draft={draft} all={items} onClose={() => setDraft(null)} /> : null}
    </View>
  );
}

function ChildTimetable() {
  const tr = useT();
  const fam = useQuery({ queryKey: ['family'], queryFn: () => api.family.get() });
  const children = fam.data?.children ?? [];
  const [picked, setPicked] = useState<string | null>(null);
  const current = picked ?? children[0]?.id;
  const q = useTimetable(current);
  if (fam.isPending) return <Loading />;
  if (!current) return <Empty title={tr.t('family.requestTitle')} body={tr.t('family.requestHint')} />;
  return (
    <View style={{ gap: 12 }}>
      {children.length > 1 ? (
        <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: 8 }}>
          {children.map((c) => (
            <Chip key={c.id} label={c.displayName} active={c.id === current} onPress={() => setPicked(c.id)} />
          ))}
        </View>
      ) : null}
      {q.data && !q.data.items.length ? <Empty icon="calendar-outline" title={tr.t('timetable.empty')} /> : null}
      {q.data ? <WeekList items={q.data.items} /> : null}
    </View>
  );
}
