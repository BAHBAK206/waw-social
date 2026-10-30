import type { LibraryItemDto } from '@qubedu/shared';
import { useInfiniteQuery } from '@tanstack/react-query';
import * as WebBrowser from 'expo-web-browser';
import { useState } from 'react';
import { FlatList, View } from 'react-native';
import { SubjectPicker } from '@/components/SubjectPicker';
import { Badge, FeatureGate, pickDocument, SelectField, Sheet } from '@/components/kit';
import { Button, Card, Chip, Empty, Input, Loading, Text } from '@/components/ui';
import { api, fileUrl, uploadFile } from '@/lib/api';
import { useT } from '@/lib/i18n';
import { useTheme } from '@/lib/theme';
import { toast, toastError } from '@/lib/ui';

const CATEGORIES = ['book', 'summary', 'exam', 'notes', 'video', 'other'] as const;

export default function LibraryScreen() {
  const tr = useT();
  const t = useTheme();
  const [category, setCategory] = useState('');
  const [term, setTerm] = useState('');
  const [q, setQ] = useState('');
  const list = useInfiniteQuery({
    queryKey: ['library', category, q],
    queryFn: ({ pageParam }) => api.library.list({ category: category || undefined, q: q || undefined, cursor: pageParam, limit: 20 }),
    initialPageParam: undefined as string | undefined,
    getNextPageParam: (l) => l.nextCursor ?? undefined,
  });
  const items = list.data?.pages.flatMap((p) => p.items) ?? [];
  const [open, setOpen] = useState(false);
  const [form, setForm] = useState({ title: '', description: '', category: 'summary' as LibraryItemDto['category'], materialId: '' });
  const [file, setFile] = useState<Awaited<ReturnType<typeof pickDocument>>>(null);
  const [busy, setBusy] = useState(false);

  const submit = async () => {
    if (!file || !form.title.trim()) return;
    setBusy(true);
    try {
      const up = await uploadFile(file, 'library');
      const res = await api.library.create({
        title: form.title.trim(),
        description: form.description.trim(),
        category: form.category,
        materialId: form.materialId || null,
        fileUrl: up.url,
        mime: up.mime,
        size: up.size,
      });
      toast(res.approved ? tr.t('common.saved') : tr.t('library.submittedForReview'));
      setOpen(false);
      setFile(null);
      setForm({ title: '', description: '', category: 'summary', materialId: '' });
      void list.refetch();
    } catch (e) {
      toastError(e);
    } finally {
      setBusy(false);
    }
  };

  return (
    <FeatureGate id="library">
      <FlatList
        style={{ backgroundColor: t.bg }}
        contentContainerStyle={{ padding: 16, gap: 10 }}
        data={items}
        keyExtractor={(i) => i.id}
        keyboardShouldPersistTaps="handled"
        onEndReached={() => list.hasNextPage && !list.isFetchingNextPage && void list.fetchNextPage()}
        refreshing={list.isRefetching && !list.isFetchingNextPage}
        onRefresh={() => void list.refetch()}
        ListHeaderComponent={
          <View style={{ gap: 10, marginBottom: 4 }}>
            <Text muted>{tr.t('library.subtitle')}</Text>
            <Input
              value={term}
              onChangeText={setTerm}
              placeholder={tr.t('library.searchPlaceholder')}
              returnKeyType="search"
              onSubmitEditing={() => setQ(term.trim())}
            />
            <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: 8 }}>
              <Chip label={tr.t('common.all')} active={!category} onPress={() => setCategory('')} />
              {CATEGORIES.map((c) => (
                <Chip key={c} label={tr.t(`library.categories.${c}`)} active={category === c} onPress={() => setCategory(c)} />
              ))}
            </View>
            <Button icon="cloud-upload-outline" variant="outline" title={tr.t('library.upload')} onPress={() => setOpen(true)} />
          </View>
        }
        renderItem={({ item }) => (
          <Card style={{ gap: 6 }}>
            <Text weight="bold">{item.title}</Text>
            {item.description ? (
              <Text muted size={13} numberOfLines={3}>
                {item.description}
              </Text>
            ) : null}
            <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: 6 }}>
              <Badge tone="primary" label={tr.t(`library.categories.${item.category}`)} />
              {item.material && <Badge label={item.material.name} />}
              {!item.approved && <Badge tone="warn" label={tr.t('library.pending')} />}
              <Badge label={tr.t('library.downloads', { count: item.downloads })} />
            </View>
            <Text muted size={12}>
              {item.uploader.displayName}
            </Text>
            <Button
              small
              variant="soft"
              icon="download-outline"
              title={tr.t('common.open')}
              onPress={async () => {
                try {
                  const r = await api.library.download(item.id);
                  await WebBrowser.openBrowserAsync(fileUrl(r.url)!);
                } catch (e) {
                  toastError(e);
                }
              }}
            />
          </Card>
        )}
        ListEmptyComponent={list.isPending ? <Loading /> : <Empty icon="library-outline" title={tr.t('library.empty')} />}
        ListFooterComponent={list.isFetchingNextPage ? <Loading /> : undefined}
      />
      <Sheet
        open={open}
        onClose={() => setOpen(false)}
        title={tr.t('library.upload')}
        footer={<Button title={tr.t('common.upload')} loading={busy} disabled={!file || !form.title.trim()} onPress={() => void submit()} />}
      >
        <Button
          variant="outline"
          icon="document-attach-outline"
          title={file ? file.name : tr.t('studio.chooseFile')}
          onPress={async () => {
            const f = await pickDocument();
            if (f) {
              setFile(f);
              if (!form.title) setForm((x) => ({ ...x, title: f.name.replace(/\.[^.]+$/, '') }));
            }
          }}
        />
        <Input label={tr.t('common.title')} value={form.title} onChangeText={(v) => setForm({ ...form, title: v })} />
        <Input label={tr.t('common.description')} value={form.description} onChangeText={(v) => setForm({ ...form, description: v })} multiline />
        <SelectField
          label={tr.t('library.category')}
          value={form.category}
          onChange={(v) => v && setForm({ ...form, category: v })}
          options={CATEGORIES.map((c) => ({ value: c, label: tr.t(`library.categories.${c}`) }))}
        />
        <SubjectPicker
          label={tr.t('feed.subject')}
          value={form.materialId}
          onChange={(v) => setForm({ ...form, materialId: v })}
          placeholder={tr.t('feed.noSubject')}
        />
      </Sheet>
    </FeatureGate>
  );
}
