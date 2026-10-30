import { Ionicons } from '@expo/vector-icons';
import { useRouter, useSegments } from 'expo-router';
import { Pressable } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { Text } from './ui';
import { useT } from '@/lib/i18n';
import { useNetwork } from '@/lib/network';
import { useSession } from '@/lib/session';
import { useTheme } from '@/lib/theme';

/** A small pill while the server can't be reached; opens the saved lessons. */
export function OfflineBanner() {
  const tr = useT();
  const t = useTheme();
  const router = useRouter();
  const segments = useSegments();
  const insets = useSafeAreaInsets();
  const offline = useNetwork((s) => s.offline);
  const authed = useSession((s) => s.status === 'authed');
  if (!offline || !authed || segments[0] === 'downloads') return null;
  const inTabs = segments[0] === '(tabs)';
  return (
    <Pressable
      onPress={() => router.push('/downloads' as never)}
      accessibilityRole="button"
      accessibilityLiveRegion="polite"
      style={{
        position: 'absolute',
        alignSelf: 'center',
        bottom: insets.bottom + (inTabs ? 70 : 16),
        flexDirection: 'row',
        alignItems: 'center',
        gap: 8,
        paddingHorizontal: 14,
        paddingVertical: 8,
        borderRadius: 20,
        backgroundColor: t.text,
      }}
    >
      <Ionicons name="cloud-offline-outline" size={16} color={t.bg} />
      <Text size={13} weight="bold" color={t.bg}>
        {tr.t('offline.banner')}
      </Text>
    </Pressable>
  );
}
