import { Ionicons } from '@expo/vector-icons';
import { GUIDES } from '@qubedu/i18n';
import { CAPABILITY_TABLE, type AccountType, type GuideId } from '@qubedu/shared';
import { useRouter } from 'expo-router';
import { useState } from 'react';
import { Pressable, View } from 'react-native';
import { Card, Text } from './ui';
import { useT } from '@/lib/i18n';
import { useSession } from '@/lib/session';
import { useTheme } from '@/lib/theme';

export function useGuide(id: GuideId) {
  const tr = useT();
  return GUIDES[tr.locale][id];
}

/** Steps, tips and the per-account notes (the signed-in account first). */
export function GuideBody({ id, compact }: { id: GuideId; compact?: boolean }) {
  const tr = useT();
  const t = useTheme();
  const g = useGuide(id);
  const me = useSession((s) => s.me);
  const roles = (['student', 'teacher', 'parent'] as AccountType[]).sort((a, b) => Number(b === me?.accountType) - Number(a === me?.accountType));
  return (
    <View style={{ gap: 12 }}>
      <Text>{g.summary}</Text>
      <Text weight="black">{tr.t('helpCenter.steps')}</Text>
      {g.steps.map((s, i) => (
        <View key={i} style={{ flexDirection: 'row', gap: 10 }}>
          <View style={{ width: 26, height: 26, borderRadius: 13, backgroundColor: t.primarySoft, alignItems: 'center', justifyContent: 'center' }}>
            <Text weight="black" size={13} color={t.primaryInk}>
              {i + 1}
            </Text>
          </View>
          <Text style={{ flex: 1 }}>{s}</Text>
        </View>
      ))}
      {g.tips?.length ? (
        <View style={{ gap: 4, backgroundColor: t.primarySoft, borderRadius: t.radiusControl, padding: 12 }}>
          <Text weight="black">💡 {tr.t('helpCenter.tips')}</Text>
          {g.tips.map((s, i) => (
            <Text key={i} size={14}>
              • {s}
            </Text>
          ))}
        </View>
      ) : null}
      {g.roles && compact && me ? (
        <View style={{ borderWidth: 1, borderColor: t.primary, borderRadius: t.radiusControl, padding: 12 }}>
          <Text size={14}>{g.roles[me.accountType]}</Text>
        </View>
      ) : null}
      {g.roles && !compact ? (
        <View style={{ gap: 8 }}>
          <Text weight="black">{tr.t('helpCenter.roles')}</Text>
          {roles.map((r) => (
            <View
              key={r}
              style={{ borderWidth: 1, borderColor: r === me?.accountType ? t.primary : t.border, borderRadius: t.radiusControl, padding: 12, gap: 4 }}
            >
              <Text weight="black" size={14}>
                {tr.t(`capabilities.${r}`)}
                {r === me?.accountType ? ` · ${tr.t('helpCenter.forYou')}` : ''}
              </Text>
              <Text size={14}>{g.roles![r]}</Text>
            </View>
          ))}
        </View>
      ) : null}
    </View>
  );
}

/** Collapsible "How does this work?" card at the top of a screen. */
export function GuideHint({ id }: { id: GuideId }) {
  const tr = useT();
  const t = useTheme();
  const router = useRouter();
  const [open, setOpen] = useState(false);
  return (
    <Card style={{ gap: 10 }}>
      <Pressable
        onPress={() => setOpen((o) => !o)}
        accessibilityRole="button"
        accessibilityState={{ expanded: open }}
        style={{ flexDirection: 'row', alignItems: 'center', gap: 8 }}
      >
        <Ionicons name="help-circle-outline" size={22} color={t.primaryInk} />
        <Text weight="bold" style={{ flex: 1 }}>
          {tr.t('helpCenter.howItWorks')}
        </Text>
        <Ionicons name={open ? 'chevron-up' : 'chevron-down'} size={18} color={t.text3} />
      </Pressable>
      {open ? (
        <>
          <GuideBody id={id} compact />
          <Pressable onPress={() => router.push(`/help/${id}` as never)} accessibilityRole="link">
            <Text weight="bold" color={t.primaryInk}>
              {tr.t('helpCenter.fullGuide')}
            </Text>
          </Pressable>
        </>
      ) : null}
    </Card>
  );
}

/** "Who can do what" as one card per action (a table is too wide for phones). */
export function CapabilityList() {
  const tr = useT();
  const t = useTheme();
  const me = useSession((s) => s.me);
  const cols: AccountType[] = ['student', 'teacher', 'parent'];
  return (
    <View style={{ gap: 8 }}>
      {CAPABILITY_TABLE.map((row) => (
        <Card key={row.key} style={{ gap: 6 }}>
          <Text weight="bold">{tr.t(`capabilities.keys.${row.key}`)}</Text>
          <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: 12 }}>
            {cols.map((c) => {
              const v = row[c];
              return (
                <Text key={c} size={13} weight={c === me?.accountType ? 'black' : 'regular'} color={v === 'no' ? t.text3 : v === 'yes' ? t.ok : undefined}>
                  {tr.t(`capabilities.${c}`)}: {tr.t(`capabilities.values.${v}`)}
                </Text>
              );
            })}
          </View>
        </Card>
      ))}
    </View>
  );
}
