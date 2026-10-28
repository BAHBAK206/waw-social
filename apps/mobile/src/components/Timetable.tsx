import { overlaps, sortSlots, todaySlots, type TimetableEntryDto, type TimetableEntryInput, type Weekday } from '@qubedu/shared';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { useRouter } from 'expo-router';
import { useState } from 'react';
import { Pressable, View } from 'react-native';
import { DateField, SelectField, Sheet } from './kit';
import { Button, Card, Input, Text } from './ui';
import { api } from '@/lib/api';
import { useT } from '@/lib/i18n';
import { useTheme } from '@/lib/theme';
import { toast, toastError } from '@/lib/ui';

export const WEEK: Weekday[] = [6, 0, 1, 2, 3, 4, 5];
const COLORS = ['#2563eb', '#16a34a', '#dc2626', '#9333ea', '#ea580c', '#0891b2', '#ca8a04'];

export function useTimetable(studentId?: string) {
  return useQuery({ queryKey: ['timetable', studentId ?? 'me'], queryFn: () => api.me.timetable(studentId) });
}

export function SlotRow({ e, badge, onPress }: { e: TimetableEntryDto; badge?: string; onPress?: () => void }) {
  const t = useTheme();
  const tr = useT();
  return (
    <Pressable
      onPress={onPress}
      disabled={!onPress}
      accessibilityRole={onPress ? 'button' : undefined}
      style={{ flexDirection: 'row', alignItems: 'center', gap: 10, paddingVertical: 6 }}
    >
      <View style={{ width: 5, alignSelf: 'stretch', borderRadius: 3, backgroundColor: e.color ?? t.primary }} />
      <Text weight="bold" size={13} style={{ width: 92, writingDirection: 'ltr' }}>
        {e.start}–{e.end}
      </Text>
      <View style={{ flex: 1 }}>
        <Text weight="bold" numberOfLines={1}>
          {e.title}
        </Text>
        <Text muted size={12} numberOfLines={1}>
          {[e.room, e.courseId ? (e.courseTitle ?? tr.t('timetable.fromTeacher')) : ''].filter(Boolean).join(' · ')}
        </Text>
      </View>
      {badge ? (
        <Text size={12} weight="bold" color={t.primaryInk}>
          {badge}
        </Text>
      ) : null}
    </Pressable>
  );
}

/** Home card: today's classes. */
export function TodayClassesCard() {
  const tr = useT();
  const router = useRouter();
  const q = useTimetable();
  if (!q.data?.items.length) return null;
  const now = new Date();
  const today = todaySlots(q.data.items, now);
  return (
    <Card onPress={() => router.push('/timetable' as never)} style={{ gap: 4 }}>
      <Text weight="black">{tr.t('timetable.today')}</Text>
      {!today.items.length ? (
        <Text muted size={13}>
          {tr.t('timetable.noneToday')}
        </Text>
      ) : (
        today.items.map((e) => (
          <SlotRow
            key={e.id}
            e={e}
            badge={e.id === today.current?.id ? tr.t('timetable.now') : e.id === today.next?.id && !today.current ? tr.t('timetable.next') : undefined}
          />
        ))
      )}
    </Card>
  );
}

type Draft = { id?: string; day: Weekday; start: string; end: string; title: string; room: string; color: string; courseId: string };

export function emptyDraft(day: Weekday = new Date().getDay() as Weekday): Draft {
  return { day, start: '08:00', end: '08:45', title: '', room: '', color: COLORS[0]!, courseId: '' };
}

export function draftOf(e: TimetableEntryDto): Draft {
  return { id: e.id, day: e.day, start: e.start, end: e.end, title: e.title, room: e.room, color: e.color ?? COLORS[0]!, courseId: e.courseId ?? '' };
}

export function SlotSheet({ draft, all, onClose }: { draft: Draft; all: TimetableEntryDto[]; onClose: () => void }) {
  const tr = useT();
  const t = useTheme();
  const qc = useQueryClient();
  const [f, setF] = useState(draft);
  const [busy, setBusy] = useState(false);
  const courses = useQuery({ queryKey: ['school', 'courses'], queryFn: () => api.school.courses() });
  const teaching = (courses.data?.items ?? []).filter((c) => c.myRole === 'teacher' || c.myRole === 'assistant');
  const clash = all.find((x) => x.id !== f.id && overlaps(x, f));
  const done = async () => {
    await qc.invalidateQueries({ queryKey: ['timetable'] });
    onClose();
  };
  return (
    <Sheet open onClose={onClose} title={f.id ? tr.t('timetable.edit') : tr.t('timetable.add')}>
      <View style={{ gap: 10 }}>
        <Input label={tr.t('timetable.name')} value={f.title} maxLength={80} onChangeText={(v) => setF({ ...f, title: v })} />
        <SelectField
          label={tr.t('timetable.day')}
          value={String(f.day)}
          onChange={(v) => v && setF({ ...f, day: Number(v) as Weekday })}
          options={WEEK.map((d) => ({ value: String(d), label: tr.t(`timetable.days.${d}`) }))}
        />
        <View style={{ flexDirection: 'row', gap: 10 }}>
          <View style={{ flex: 1 }}>
            <DateField mode="time" label={tr.t('timetable.start')} value={f.start} onChange={(v) => setF({ ...f, start: v })} />
          </View>
          <View style={{ flex: 1 }}>
            <DateField mode="time" label={tr.t('timetable.end')} value={f.end} onChange={(v) => setF({ ...f, end: v })} />
          </View>
        </View>
        <Input label={tr.t('timetable.room')} value={f.room} maxLength={60} onChangeText={(v) => setF({ ...f, room: v })} />
        <View style={{ flexDirection: 'row', gap: 8, flexWrap: 'wrap' }}>
          {COLORS.map((c) => (
            <Pressable
              key={c}
              accessibilityRole="button"
              accessibilityLabel={c}
              accessibilityState={{ selected: f.color === c }}
              onPress={() => setF({ ...f, color: c })}
              style={{ width: 32, height: 32, borderRadius: 16, backgroundColor: c, borderWidth: 3, borderColor: f.color === c ? t.text : 'transparent' }}
            />
          ))}
        </View>
        {teaching.length ? (
          <SelectField
            label={tr.t('timetable.course')}
            value={f.courseId}
            placeholder={tr.t('timetable.personal')}
            onChange={(v) => setF({ ...f, courseId: v })}
            options={[{ value: '', label: tr.t('timetable.personal') }, ...teaching.map((c) => ({ value: c.id, label: c.title }))]}
          />
        ) : null}
        {clash ? (
          <Text weight="bold" size={13} color={t.warn}>
            {tr.t('timetable.overlap', { title: clash.title })}
          </Text>
        ) : null}
        <Button
          title={tr.t('common.save')}
          loading={busy}
          disabled={!f.title.trim() || f.end <= f.start}
          onPress={async () => {
            setBusy(true);
            try {
              const body: TimetableEntryInput = {
                day: f.day,
                start: f.start,
                end: f.end,
                title: f.title.trim(),
                room: f.room.trim(),
                color: f.color,
                courseId: f.courseId || null,
              };
              if (f.id) await api.me.updateTimetable(f.id, body);
              else await api.me.addTimetable(body);
              toast(tr.t('timetable.saved'));
              await done();
            } catch (e) {
              toastError(e);
            } finally {
              setBusy(false);
            }
          }}
        />
        {f.id ? (
          <Button
            variant="ghost"
            title={tr.t('common.delete')}
            onPress={async () => {
              try {
                await api.me.removeTimetable(f.id!);
                await done();
              } catch (e) {
                toastError(e);
              }
            }}
          />
        ) : null}
      </View>
    </Sheet>
  );
}

export function WeekList({ items, onEdit }: { items: TimetableEntryDto[]; onEdit?: (e: TimetableEntryDto) => void }) {
  const tr = useT();
  const t = useTheme();
  const sorted = sortSlots(items);
  const today = new Date().getDay();
  return (
    <View style={{ gap: 10 }}>
      {WEEK.map((d) => {
        const list = sorted.filter((s) => s.day === d);
        if (!list.length) return null;
        return (
          <Card key={d} style={{ gap: 2, borderColor: d === today ? t.primary : undefined, borderWidth: d === today ? 2 : undefined }}>
            <Text weight="black">{tr.t(`timetable.days.${d}`)}</Text>
            {list.map((e) => (
              <SlotRow key={e.id} e={e} onPress={onEdit && e.mine ? () => onEdit(e) : undefined} />
            ))}
          </Card>
        );
      })}
    </View>
  );
}
