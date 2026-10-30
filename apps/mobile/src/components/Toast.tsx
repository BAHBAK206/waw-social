import { View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { useToast } from '@/lib/ui';
import { useTheme } from '@/lib/theme';
import { Text } from './ui';

export function ToastHost() {
  const { text, kind } = useToast();
  const t = useTheme();
  const insets = useSafeAreaInsets();
  if (!text) return null;
  return (
    <View
      pointerEvents="none"
      style={{ position: 'absolute', left: 16, right: 16, bottom: insets.bottom + 72, alignItems: 'center' }}
      accessibilityLiveRegion="polite"
    >
      <View style={{ backgroundColor: kind === 'err' ? t.errFill : t.text, paddingHorizontal: 16, paddingVertical: 10, borderRadius: 14, maxWidth: 520 }}>
        <Text weight="bold" color={kind === 'err' ? '#fff' : t.bg}>
          {text}
        </Text>
      </View>
    </View>
  );
}
