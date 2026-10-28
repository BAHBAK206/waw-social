import { Ionicons } from '@expo/vector-icons';
import type { NoteDto, TaskDto } from '@qubedu/shared';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { useState } from 'react';
import { Pressable, View } from 'react-native';
import { Screen } from '@/components/Screen';
import { Badge, DateField, FeatureGate, Segmented, SelectField, Sheet, SwitchRow } from '@/components/kit';
import { Button, Card, Empty, Input, Loading, Text } from '@/components/ui';
import { api } from '@/lib/api';
import { formatDay } from '@/lib/format';
import { useT } from '@/lib/i18n';
import { useTheme } from '@/lib/theme';
import { confirm, toastError } from '@/lib/ui';

const PRIORITY_TONE = { low: 'neutral', medium: 'warn', high: 'err' } as const;
const NOTE_COLORS: Record<NoteDto['color'], string> = {
  default: 'transparent',
  yellow: '#fdcb6e55',
  green: '#00b89455',
  blue: '#0984e355',
  pink: '#e8439355',
  purple: '#6c5ce755',
};

function Tasks() {
  const tr = useT();
  const t = useTheme();
  const qc = useQueryClient();
  const q = useQuery({ queryKey: ['tasks'], queryFn: () => api.tasks.list() });
  const [showDone, setShowDone] = useState(false);
  const [open, setOpen] = useState(false);
  const [form, setForm] = useState({ title: '', priority: 'medium' as TaskDto['priority'], due: '' });
  const refresh = () => Promise.all([qc.invalidateQueries({ queryKey: ['tasks'] }), qc.invalidateQueries({ queryKey: ['dashboard'] })]);
  const items = (q.data?.items ?? []).filter((x) => showDone || x.status !== 'done');
  const update = async (task: TaskDto, body: Partial<TaskDto>) => {
    try {
      await api.tasks.update(task.id, body);
      await refresh();
    } catch (e) {
      toastError(e);
    }
  };
  return (
    <View style={{ gap: 10 }}>
      <Button icon="add" title={tr.t('organizer.addTask')} onPress={() => setOpen(true)} />
      <SwitchRow label={tr.t('organizer.showDone')} value={showDone} onChange={setShowDone} />
      {q.isPending ? (
        <Loading />
      ) : !items.length ? (
        <Empty icon="checkbox-outline" title={tr.t('organizer.noTasks')} />
      ) : (
        items.map((task) => {
          const done = task.status === 'done';
          const overdue = !done && !!task.dueAt && task.dueAt < Date.now();
          return (
            <Card key={task.id} style={{ gap: 8 }}>
              <View style={{ flexDirection: 'row', alignItems: 'flex-start', gap: 10 }}>
                <Pressable
                  hitSlop={8}
                  accessibilityRole="checkbox"
                  accessibilityState={{ checked: done }}
                  accessibilityLabel={task.title}
                  onPress={() => void update(task, { status: done ? 'todo' : 'done' })}
                >
                  <Ionicons name={done ? 'checkmark-circle' : 'ellipse-outline'} size={26} color={done ? t.ok : t.text3} />
                </Pressable>
                <View style={{ flex: 1, gap: 4 }}>
                  <Text weight="bold" style={done ? { textDecorationLine: 'line-through', opacity: 0.6 } : undefined}>
                    {task.title}
                  </Text>
                  <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: 6 }}>
                    <Badge tone={PRIORITY_TONE[task.priority]} label={tr.t(`organizer.priorities.${task.priority}`)} />
                    <Badge tone={task.status === 'doing' ? 'primary' : 'neutral'} label={tr.t(`organizer.statuses.${task.status}`)} />
                    {task.dueAt ? (
                      <Badge tone={overdue ? 'err' : 'neutral'} label={`${overdue ? `${tr.t('organizer.overdue')} · ` : ''}${formatDay(task.dueAt, tr)}`} />
                    ) : null}
                  </View>
                </View>
                <Pressable
                  hitSlop={8}
                  accessibilityRole="button"
                  accessibilityLabel={tr.t('common.delete')}
                  onPress={async () => {
                    if (!(await confirm(tr.t('common.confirmDelete'), { danger: true }))) return;
                    try {
                      await api.tasks.remove(task.id);
                      await refresh();
                    } catch (e) {
                      toastError(e);
                    }
                  }}
                >
                  <Ionicons name="trash-outline" size={18} color={t.text3} />
                </Pressable>
              </View>
              {!done && task.status === 'todo' && (
                <Button
                  small
                  variant="ghost"
                  icon="play-outline"
                  title={tr.t('organizer.statuses.doing')}
                  onPress={() => void update(task, { status: 'doing' })}
                />
              )}
            </Card>
          );
        })
      )}
      <Sheet
        open={open}
        onClose={() => setOpen(false)}
        title={tr.t('organizer.addTask')}
        footer={
          <Button
            title={tr.t('common.save')}
            disabled={!form.title.trim()}
            onPress={async () => {
              try {
                await api.tasks.create({
                  title: form.title.trim(),
                  priority: form.priority,
                  dueAt: form.due ? new Date(`${form.due}T18:00:00`).getTime() : null,
                });
                setOpen(false);
                setForm({ title: '', priority: 'medium', due: '' });
                await refresh();
              } catch (e) {
                toastError(e);
              }
            }}
          />
        }
      >
        <Input label={tr.t('organizer.taskTitle')} value={form.title} onChangeText={(v) => setForm({ ...form, title: v })} />
        <SelectField
          label={tr.t('organizer.priority')}
          value={form.priority}
          onChange={(v) => v && setForm({ ...form, priority: v })}
          options={(['low', 'medium', 'high'] as const).map((p) => ({ value: p, label: tr.t(`organizer.priorities.${p}`) }))}
        />
        <DateField label={tr.t('organizer.due')} value={form.due} onChange={(v) => setForm({ ...form, due: v })} />
      </Sheet>
    </View>
  );
}

function Notes() {
  const tr = useT();
  const t = useTheme();
  const q = useQuery({ queryKey: ['notes'], queryFn: () => api.notes.list() });
  const [editing, setEditing] = useState<Partial<NoteDto> | null>(null);
  const [term, setTerm] = useState('');
  const items = (q.data?.items ?? [])
    .filter((n) => !term.trim() || `${n.title} ${n.body}`.toLowerCase().includes(term.trim().toLowerCase()))
    .sort((a, b) => Number(b.pinned) - Number(a.pinned) || b.updatedAt - a.updatedAt);
  const save = async () => {
    if (!editing) return;
    try {
      const body = { title: editing.title?.trim() ?? '', body: editing.body ?? '', color: editing.color ?? 'default', pinned: !!editing.pinned };
      if (editing.id) await api.notes.update(editing.id, body);
      else await api.notes.create(body);
      setEditing(null);
      await q.refetch();
    } catch (e) {
      toastError(e);
    }
  };
  return (
    <View style={{ gap: 10 }}>
      <Button icon="add" title={tr.t('organizer.addNote')} onPress={() => setEditing({ color: 'default' })} />
      <Input value={term} onChangeText={setTerm} placeholder={tr.t('organizer.searchNotes')} />
      {q.isPending ? (
        <Loading />
      ) : !items.length ? (
        <Empty icon="document-text-outline" title={tr.t('organizer.noNotes')} />
      ) : (
        items.map((n) => (
          <Card key={n.id} onPress={() => setEditing(n)} style={{ gap: 4, backgroundColor: n.color === 'default' ? t.cardSolid : NOTE_COLORS[n.color] }}>
            <View style={{ flexDirection: 'row', alignItems: 'center', gap: 6 }}>
              {n.pinned ? <Ionicons name="pin" size={14} color={t.primaryInk} /> : null}
              <Text weight="bold" style={{ flex: 1 }}>
                {n.title || tr.t('common.untitled')}
              </Text>
            </View>
            <Text muted numberOfLines={4}>
              {n.body}
            </Text>
          </Card>
        ))
      )}
      <Sheet
        open={!!editing}
        onClose={() => setEditing(null)}
        title={editing?.id ? tr.t('common.edit') : tr.t('organizer.addNote')}
        footer={
          <View style={{ flexDirection: 'row', gap: 8 }}>
            {editing?.id ? (
              <Button
                variant="danger"
                title={tr.t('common.delete')}
                onPress={async () => {
                  if (!(await confirm(tr.t('common.confirmDelete'), { danger: true }))) return;
                  try {
                    await api.notes.remove(editing.id!);
                    setEditing(null);
                    await q.refetch();
                  } catch (e) {
                    toastError(e);
                  }
                }}
              />
            ) : null}
            <View style={{ flex: 1 }}>
              <Button title={tr.t('common.save')} disabled={!editing?.title?.trim() && !editing?.body?.trim()} onPress={() => void save()} />
            </View>
          </View>
        }
      >
        <Input label={tr.t('organizer.noteTitle')} value={editing?.title ?? ''} onChangeText={(v) => setEditing((e) => ({ ...e, title: v }))} />
        <Input
          value={editing?.body ?? ''}
          onChangeText={(v) => setEditing((e) => ({ ...e, body: v }))}
          placeholder={tr.t('organizer.noteBody')}
          multiline
          style={{ minHeight: 160, textAlignVertical: 'top' }}
        />
        <View style={{ flexDirection: 'row', gap: 10, flexWrap: 'wrap' }}>
          {(Object.keys(NOTE_COLORS) as NoteDto['color'][]).map((c) => (
            <Pressable
              key={c}
              onPress={() => setEditing((e) => ({ ...e, color: c }))}
              accessibilityRole="radio"
              accessibilityState={{ selected: (editing?.color ?? 'default') === c }}
              accessibilityLabel={c}
              style={{
                width: 32,
                height: 32,
                borderRadius: 16,
                backgroundColor: c === 'default' ? t.bg3 : NOTE_COLORS[c],
                borderWidth: (editing?.color ?? 'default') === c ? 3 : 1,
                borderColor: (editing?.color ?? 'default') === c ? t.text : t.border,
              }}
            />
          ))}
        </View>
        <SwitchRow label={tr.t('common.pin')} value={!!editing?.pinned} onChange={(v) => setEditing((e) => ({ ...e, pinned: v }))} />
      </Sheet>
    </View>
  );
}

export default function OrganizerScreen() {
  const tr = useT();
  const [tab, setTab] = useState<'tasks' | 'notes'>('tasks');
  return (
    <FeatureGate id="organizer">
      <Screen>
        <Segmented
          tabs={[
            { key: 'tasks', label: tr.t('organizer.tasks') },
            { key: 'notes', label: tr.t('organizer.notes') },
          ]}
          value={tab}
          onChange={setTab}
        />
        {tab === 'tasks' ? <Tasks /> : <Notes />}
      </Screen>
    </FeatureGate>
  );
}
