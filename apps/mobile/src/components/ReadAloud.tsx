import { Ionicons } from '@expo/vector-icons';
import { useId } from 'react';
import { Pressable } from 'react-native';
import { useT } from '@/lib/i18n';
import { speak, stopSpeaking, useSpeaking } from '@/lib/speech';
import { useTheme } from '@/lib/theme';

export function ReadAloud({ text, size = 21 }: { text: string; size?: number }) {
  const tr = useT();
  const t = useTheme();
  const id = useId();
  const active = useSpeaking((s) => s.id === id);
  if (!text.trim()) return null;
  return (
    <Pressable
      hitSlop={8}
      accessibilityRole="button"
      accessibilityState={{ selected: active }}
      accessibilityLabel={active ? tr.t('lab.stop') : tr.t('lab.readAloud')}
      onPress={() => (active ? stopSpeaking() : speak(text, id, tr.locale))}
    >
      <Ionicons name={active ? 'stop-circle-outline' : 'volume-high-outline'} size={size} color={active ? t.primary : t.text2} />
    </Pressable>
  );
}
