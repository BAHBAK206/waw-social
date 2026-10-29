import { useQuery, useQueryClient } from '@tanstack/react-query';
import { useState } from 'react';
import { Pressable, View } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { Screen } from '@/components/Screen';
import { Sheet } from '@/components/kit';
import { Button, Card, Chip, Empty, ErrorView, Input, Loading, Text } from '@/components/ui';
import { api } from '@/lib/api';
import { useT } from '@/lib/i18n';
import { useTheme } from '@/lib/theme';
import { confirm, toastError } from '@/lib/ui';

export default function GlossaryScreen() {
  const tr = useT();
  const t = useTheme();
  const qc = useQueryClient();
  const [subject, setSubject] = useState('');
  const [search, setSearch] = useState('');
  const [adding, setAdding] = useState(false);
  const [form, setForm] = useState({ subject: '', term: '', definition: '' });
  const q = useQuery({
    queryKey: ['glossary', subject, search],
    queryFn: () => api.glossary.list({ subject: subject || undefined, q: search.trim() || undefined }),
  });
  const all = useQuery({ queryKey: ['glossary', 'all'], queryFn: () => api.glossary.list() });
  const refresh = () => qc.invalidateQueries({ queryKey: ['glossary'] });
  if (q.isPending) return <Loading />;
  if (q.error) return <ErrorView onRetry={() => void q.refetch()} />;
  const subjects = all.data?.subjects ?? [];
  const groups = [...new Set(q.data.items.map((i) => i.subject))];
  return (
    <Screen refreshing={q.isRefetching} onRefresh={() => void q.refetch()}>
      <Text muted>{tr.t('glossary.subtitle')}</Text>
      <Input placeholder={tr.t('glossary.search')} value={search} onChangeText={setSearch} autoCapitalize="none" />
      <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: 8 }}>
        <Chip label={tr.t('glossary.all')} active={!subject} onPress={() => setSubject('')} />
        {subjects.map((s) => (
          <Chip key={s} label={s} active={subject === s} onPress={() => setSubject(s)} />
        ))}
      </View>
      <Button icon="add" title={tr.t('glossary.add')} onPress={() => setAdding(true)} />
      {!q.data.items.length ? <Empty title={tr.t('glossary.empty')} icon="book-outline" /> : null}
      {groups.map((g) => (
        <View key={g} style={{ gap: 8 }}>
          <Text weight="black">{g}</Text>
          {q.data.items
            .filter((i) => i.subject === g)
            .map((i) => (
              <Card key={i.id} style={{ flexDirection: 'row', alignItems: 'flex-start', gap: 10 }}>
                <View style={{ flex: 1 }}>
                  <Text weight="bold">
                    {i.term}
                    {i.courseId ? `  · ${tr.t('glossary.shared')}` : ''}
                  </Text>
                  <Text muted size={13}>
                    {i.definition}
                  </Text>
                </View>
                {i.mine && (
                  <Pressable
                    hitSlop={8}
                    accessibilityRole="button"
                    accessibilityLabel={tr.t('common.delete')}
                    onPress={async () => {
                      if (!(await confirm(tr.t('common.confirmDelete'), { danger: true }))) return;
                      try {
                        await api.glossary.remove(i.id);
                        await refresh();
                      } catch (e) {
                        toastError(e);
                      }
                    }}
                  >
                    <Ionicons name="trash-outline" size={20} color={t.text3} />
                  </Pressable>
                )}
              </Card>
            ))}
        </View>
      ))}
      <Sheet
        open={adding}
        onClose={() => setAdding(false)}
        title={tr.t('glossary.add')}
        footer={
          <Button
            title={tr.t('glossary.add')}
            disabled={!form.subject.trim() || !form.term.trim() || !form.definition.trim()}
            onPress={async () => {
              try {
                await api.glossary.add({ subject: form.subject.trim(), term: form.term.trim(), definition: form.definition.trim() });
                setForm({ ...form, term: '', definition: '' });
                setAdding(false);
                await refresh();
              } catch (e) {
                toastError(e);
              }
            }}
          />
        }
      >
        <Input label={tr.t('glossary.subject')} value={form.subject} onChangeText={(subject) => setForm({ ...form, subject })} />
        <Input label={tr.t('glossary.term')} value={form.term} onChangeText={(term) => setForm({ ...form, term })} />
        <Input label={tr.t('glossary.definition')} value={form.definition} multiline onChangeText={(definition) => setForm({ ...form, definition })} />
      </Sheet>
    </Screen>
  );
}
