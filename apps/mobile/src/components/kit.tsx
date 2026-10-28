import { Ionicons } from '@expo/vector-icons';
import DateTimePicker, { DateTimePickerAndroid } from '@react-native-community/datetimepicker';
import type { FeatureId } from '@qubedu/shared';
import * as DocumentPicker from 'expo-document-picker';
import { useState, type ComponentProps, type ReactNode } from 'react';
import { KeyboardAvoidingView, Modal, Platform, Pressable, ScrollView, Switch, View, type StyleProp, type ViewStyle } from 'react-native';
import { Button, Empty, Text } from '@/components/ui';
import type { PickedFile } from '@/lib/api';
import { useFeatureMode } from '@/lib/features';
import { useT } from '@/lib/i18n';
import { useTheme } from '@/lib/theme';

export type IconName = ComponentProps<typeof Ionicons>['name'];

/** Horizontally scrollable tab strip. */
export function Segmented<K extends string>({ tabs, value, onChange }: { tabs: { key: K; label: string }[]; value: K; onChange: (k: K) => void }) {
  const t = useTheme();
  return (
    <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={{ gap: 6 }} accessibilityRole="tablist">
      {tabs.map((tab) => {
        const on = tab.key === value;
        return (
          <Pressable
            key={tab.key}
            onPress={() => onChange(tab.key)}
            accessibilityRole="tab"
            accessibilityState={{ selected: on }}
            style={{
              minHeight: 38,
              paddingHorizontal: 14,
              justifyContent: 'center',
              borderRadius: 19,
              backgroundColor: on ? t.primarySoft : 'transparent',
              borderWidth: 1,
              borderColor: on ? t.primary : t.border,
            }}
          >
            <Text weight="bold" size={13} color={on ? t.primaryInk : t.text2}>
              {tab.label}
            </Text>
          </Pressable>
        );
      })}
    </ScrollView>
  );
}

/** Bottom sheet dialog. */
export function Sheet({
  open,
  onClose,
  title,
  children,
  footer,
}: {
  open: boolean;
  onClose: () => void;
  title: string;
  children: ReactNode;
  footer?: ReactNode;
}) {
  const t = useTheme();
  const tr = useT();
  return (
    <Modal visible={open} transparent animationType="slide" onRequestClose={onClose}>
      <KeyboardAvoidingView
        behavior={Platform.OS === 'ios' ? 'padding' : undefined}
        style={{ flex: 1, justifyContent: 'flex-end', backgroundColor: 'rgba(0,0,0,0.45)' }}
      >
        <Pressable style={{ flex: 1 }} onPress={onClose} accessibilityLabel={tr.t('common.close')} />
        <View style={{ maxHeight: '88%', backgroundColor: t.cardSolid, borderTopLeftRadius: 22, borderTopRightRadius: 22, paddingBottom: 24 }}>
          <View style={{ flexDirection: 'row', alignItems: 'center', padding: 16, borderBottomWidth: 1, borderBottomColor: t.border }}>
            <Text weight="black" size={17} style={{ flex: 1 }}>
              {title}
            </Text>
            <Pressable onPress={onClose} hitSlop={10} accessibilityRole="button" accessibilityLabel={tr.t('common.close')}>
              <Ionicons name="close" size={24} color={t.text2} />
            </Pressable>
          </View>
          <ScrollView contentContainerStyle={{ padding: 16, gap: 12 }} keyboardShouldPersistTaps="handled">
            {children}
          </ScrollView>
          {footer ? <View style={{ paddingHorizontal: 16, gap: 8 }}>{footer}</View> : null}
        </View>
      </KeyboardAvoidingView>
    </Modal>
  );
}

export function Badge({ label, tone = 'neutral', icon }: { label: string; tone?: 'neutral' | 'primary' | 'ok' | 'warn' | 'err'; icon?: IconName }) {
  const t = useTheme();
  const map = {
    neutral: [t.bg3, t.text2],
    primary: [t.primarySoft, t.primaryInk],
    ok: [t.okFill, '#fff'],
    warn: [t.warnFill, '#fff'],
    err: [t.errFill, '#fff'],
  } as const;
  const [bg, fg] = map[tone];
  return (
    <View
      style={{
        flexDirection: 'row',
        alignItems: 'center',
        gap: 4,
        alignSelf: 'flex-start',
        borderRadius: 999,
        paddingHorizontal: 9,
        paddingVertical: 3,
        backgroundColor: bg,
      }}
    >
      {icon ? <Ionicons name={icon} size={12} color={fg} /> : null}
      <Text size={12} weight="bold" color={fg}>
        {label}
      </Text>
    </View>
  );
}

export function Progress({ value, max = 100, color, style }: { value: number; max?: number; color?: string; style?: StyleProp<ViewStyle> }) {
  const t = useTheme();
  const pct = Math.max(0, Math.min(100, max ? (value / max) * 100 : 0));
  return (
    <View
      style={[{ height: 8, borderRadius: 4, backgroundColor: t.bg3, overflow: 'hidden' }, style]}
      accessibilityRole="progressbar"
      accessibilityValue={{ min: 0, max: 100, now: Math.round(pct) }}
    >
      <View style={{ height: 8, width: `${pct}%`, backgroundColor: color ?? t.primary, borderRadius: 4 }} />
    </View>
  );
}

/** A tappable list row. */
export function Row({ icon, title, subtitle, onPress, right }: { icon?: IconName; title: string; subtitle?: string; onPress?: () => void; right?: ReactNode }) {
  const t = useTheme();
  const tr = useT();
  return (
    <Pressable
      onPress={onPress}
      disabled={!onPress}
      accessibilityRole={onPress ? 'button' : undefined}
      style={({ pressed }) => ({
        flexDirection: 'row',
        alignItems: 'center',
        gap: 12,
        padding: 14,
        borderRadius: t.radiusCard,
        backgroundColor: pressed ? t.bg3 : t.cardSolid,
        borderWidth: 1,
        borderColor: t.border,
      })}
    >
      {icon ? <Ionicons name={icon} size={22} color={t.primaryInk} /> : null}
      <View style={{ flex: 1, gap: 2 }}>
        <Text weight="bold" numberOfLines={2}>
          {title}
        </Text>
        {subtitle ? (
          <Text muted size={12} numberOfLines={2}>
            {subtitle}
          </Text>
        ) : null}
      </View>
      {right}
      {onPress ? <Ionicons name="chevron-forward" size={18} color={t.text3} style={{ transform: [{ scaleX: tr.dir === 'rtl' ? -1 : 1 }] }} /> : null}
    </Pressable>
  );
}

export function SwitchRow({ label, value, onChange, hint }: { label: string; value: boolean; onChange: (v: boolean) => void; hint?: string }) {
  const t = useTheme();
  return (
    <View style={{ flexDirection: 'row', alignItems: 'center', gap: 12, minHeight: 48 }}>
      <View style={{ flex: 1 }}>
        <Text weight="bold">{label}</Text>
        {hint ? (
          <Text muted size={12}>
            {hint}
          </Text>
        ) : null}
      </View>
      <Switch value={value} onValueChange={onChange} trackColor={{ true: t.primary, false: t.bg3 }} accessibilityLabel={label} />
    </View>
  );
}

/** Picks one option from a list in a sheet. */
export function SelectField<V extends string>({
  label,
  value,
  options,
  onChange,
  placeholder,
}: {
  label: string;
  value: V | '';
  options: { value: V; label: string; group?: string }[];
  onChange: (v: V | '') => void;
  placeholder?: string;
}) {
  const t = useTheme();
  const [open, setOpen] = useState(false);
  const current = options.find((o) => o.value === value);
  let lastGroup: string | undefined;
  return (
    <View style={{ gap: 6 }}>
      <Text weight="bold" size={13} muted>
        {label}
      </Text>
      <Pressable
        onPress={() => setOpen(true)}
        accessibilityRole="button"
        accessibilityLabel={`${label}: ${current?.label ?? placeholder ?? ''}`}
        style={{
          minHeight: 48,
          borderRadius: t.radiusControl,
          borderWidth: 1.5,
          borderColor: t.border,
          backgroundColor: t.bg2,
          paddingHorizontal: 14,
          flexDirection: 'row',
          alignItems: 'center',
        }}
      >
        <Text style={{ flex: 1 }} muted={!current}>
          {current?.label ?? placeholder ?? '—'}
        </Text>
        <Ionicons name="chevron-down" size={18} color={t.text3} />
      </Pressable>
      <Sheet open={open} onClose={() => setOpen(false)} title={label}>
        {placeholder !== undefined && (
          <Pressable
            onPress={() => {
              onChange('');
              setOpen(false);
            }}
            style={{ minHeight: 44, justifyContent: 'center' }}
            accessibilityRole="button"
          >
            <Text muted weight={!value ? 'bold' : 'regular'}>
              {placeholder}
            </Text>
          </Pressable>
        )}
        {options.map((o) => {
          const header = o.group && o.group !== lastGroup ? o.group : null;
          lastGroup = o.group;
          return (
            <View key={o.value}>
              {header ? (
                <Text muted size={12} weight="bold" style={{ marginTop: 6 }}>
                  {header}
                </Text>
              ) : null}
              <Pressable
                onPress={() => {
                  onChange(o.value);
                  setOpen(false);
                }}
                accessibilityRole="button"
                accessibilityState={{ selected: o.value === value }}
                style={{ minHeight: 44, flexDirection: 'row', alignItems: 'center', gap: 8 }}
              >
                <Text weight={o.value === value ? 'bold' : 'regular'} color={o.value === value ? t.primaryInk : undefined} style={{ flex: 1 }}>
                  {o.label}
                </Text>
                {o.value === value ? <Ionicons name="checkmark" size={20} color={t.primaryInk} /> : null}
              </Pressable>
            </View>
          );
        })}
      </Sheet>
    </View>
  );
}

const pad = (n: number) => String(n).padStart(2, '0');
export const toDay = (d: Date) => `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`;
export const toTime = (d: Date) => `${pad(d.getHours())}:${pad(d.getMinutes())}`;

/** Native date or time picker. Value: "YYYY-MM-DD" for dates, "HH:MM" for times. */
export function DateField({ label, value, onChange, mode = 'date' }: { label: string; value: string; onChange: (v: string) => void; mode?: 'date' | 'time' }) {
  const t = useTheme();
  const tr = useT();
  const [ios, setIos] = useState(false);
  const asDate = () => {
    const d = new Date();
    if (mode === 'date' && /^\d{4}-\d{2}-\d{2}$/.test(value)) {
      const [y, m, day] = value.split('-').map(Number);
      return new Date(y!, m! - 1, day!);
    }
    if (mode === 'time' && /^\d{2}:\d{2}$/.test(value)) {
      const [h, m] = value.split(':').map(Number);
      d.setHours(h!, m!, 0, 0);
    }
    return d;
  };
  const apply = (d?: Date) => d && onChange(mode === 'date' ? toDay(d) : toTime(d));
  const open = () => {
    if (Platform.OS === 'android') DateTimePickerAndroid.open({ value: asDate(), mode, onChange: (_e, d) => apply(d) });
    else setIos(true);
  };
  return (
    <View style={{ gap: 6 }}>
      <Text weight="bold" size={13} muted>
        {label}
      </Text>
      <Pressable
        onPress={open}
        accessibilityRole="button"
        accessibilityLabel={`${label}: ${value || '—'}`}
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
        <Ionicons name={mode === 'date' ? 'calendar-outline' : 'time-outline'} size={18} color={t.text3} />
        <Text style={{ flex: 1, writingDirection: 'ltr', textAlign: tr.dir === 'rtl' ? 'right' : 'left' }} muted={!value}>
          {value || '—'}
        </Text>
      </Pressable>
      {ios && (
        <Sheet open onClose={() => setIos(false)} title={label} footer={<Button title={tr.t('common.done')} onPress={() => setIos(false)} />}>
          <DateTimePicker value={asDate()} mode={mode} display="spinner" onChange={(_e, d) => apply(d)} />
        </Sheet>
      )}
    </View>
  );
}

/** Opens the document picker; resolves with the chosen file or null. */
export async function pickDocument(types: string[] = ['*/*']): Promise<(PickedFile & { size: number }) | null> {
  const res = await DocumentPicker.getDocumentAsync({ type: types, copyToCacheDirectory: true, multiple: false });
  if (res.canceled || !res.assets[0]) return null;
  const a = res.assets[0];
  return { uri: a.uri, name: a.name, mimeType: a.mimeType ?? 'application/octet-stream', size: a.size ?? 0 };
}

/** Blocks a screen the administrator disabled (or locked), mirroring the web route guard. */
export function FeatureGate({ id, children }: { id: FeatureId; children: ReactNode }) {
  const tr = useT();
  const { mode, message } = useFeatureMode(id);
  if (mode === 'enabled' || mode === 'hidden') return <>{children}</>;
  return (
    <Empty
      icon="lock-closed-outline"
      title={mode === 'locked' ? tr.t('gate.lockedTitle') : tr.t('gate.disabledTitle')}
      body={message || (mode === 'locked' ? tr.t('gate.lockedDefault') : tr.t('gate.disabledBody'))}
    />
  );
}
