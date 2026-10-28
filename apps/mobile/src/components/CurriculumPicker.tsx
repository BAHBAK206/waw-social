import { Ionicons } from '@expo/vector-icons';
import type { CurriculumKind } from '@qubedu/shared';
import { useQuery } from '@tanstack/react-query';
import { useEffect, useState } from 'react';
import { Pressable, View } from 'react-native';
import { Sheet } from './kit';
import { Input, Text } from './ui';
import { api } from '@/lib/api';
import { useT } from '@/lib/i18n';
import { useTheme } from '@/lib/theme';

/** A field that opens a search sheet to pick a place in the curriculum (objective, lesson or unit). */
export function CurriculumPicker({
  label,
  value,
  onChange,
  kinds,
}: {
  label: string;
  value: string | null | undefined;
  onChange: (id: string | null) => void;
  kinds?: CurriculumKind[];
}) {
  const tr = useT();
  const t = useTheme();
  const [open, setOpen] = useState(false);
  const [term, setTerm] = useState('');
  const [debounced, setDebounced] = useState('');
  useEffect(() => {
    const id = setTimeout(() => setDebounced(term.trim()), 250);
    return () => clearTimeout(id);
  }, [term]);
  const current = useQuery({ queryKey: ['curriculum-node', value], queryFn: () => api.curriculum.nodes([value!]), enabled: !!value, staleTime: 600_000 });
  const results = useQuery({ queryKey: ['curriculum-search', debounced], queryFn: () => api.curriculum.search(debounced), enabled: debounced.length >= 2 });
  const items = (results.data?.items ?? []).filter((x) => !kinds || kinds.includes(x.node.kind));
  const label0 = current.data?.items[0];
  return (
    <View style={{ gap: 6 }}>
      <Text weight="bold" size={13} muted>
        {label}
      </Text>
      <Pressable
        onPress={() => setOpen(true)}
        accessibilityRole="button"
        accessibilityLabel={label}
        style={{
          minHeight: 48,
          borderRadius: t.radiusControl,
          borderWidth: 1.5,
          borderColor: t.border,
          backgroundColor: t.bg2,
          paddingHorizontal: 14,
          flexDirection: 'row',
          alignItems: 'center',
          gap: 8,
        }}
      >
        <Ionicons name="map-outline" size={18} color={t.text3} />
        <Text style={{ flex: 1 }} muted={!value} numberOfLines={2}>
          {value ? (label0 ? `${label0.node.title}${label0.node.code ? ` (${label0.node.code})` : ''}` : '…') : tr.t('curriculum.pickerNone')}
        </Text>
        {value ? (
          <Pressable hitSlop={10} onPress={() => onChange(null)} accessibilityRole="button" accessibilityLabel={tr.t('curriculum.pickerClear')}>
            <Ionicons name="close-circle" size={20} color={t.text3} />
          </Pressable>
        ) : null}
      </Pressable>
      <Sheet open={open} onClose={() => setOpen(false)} title={label}>
        <View style={{ gap: 8 }}>
          <Input placeholder={tr.t('curriculum.pickerSearch')} value={term} onChangeText={setTerm} autoFocus />
          {items.map((x) => (
            <Pressable
              key={x.node.id}
              accessibilityRole="button"
              onPress={() => {
                onChange(x.node.id);
                setOpen(false);
                setTerm('');
              }}
              style={{ paddingVertical: 8, borderBottomWidth: 1, borderBottomColor: t.border }}
            >
              <Text weight="bold">
                {x.node.title}
                {x.node.code ? ` (${x.node.code})` : ''}
              </Text>
              <Text muted size={12} numberOfLines={1}>
                {tr.t(`curriculum.kinds.${x.node.kind}`)} · {x.path}
              </Text>
            </Pressable>
          ))}
        </View>
      </Sheet>
    </View>
  );
}
