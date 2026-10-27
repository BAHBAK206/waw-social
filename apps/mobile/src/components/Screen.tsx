import type { ReactNode } from 'react';
import { RefreshControl, ScrollView, type StyleProp, type ViewStyle } from 'react-native';
import { useTheme } from '@/lib/theme';

export function Screen({
  children,
  refreshing,
  onRefresh,
  contentStyle,
}: {
  children: ReactNode;
  refreshing?: boolean;
  onRefresh?: () => void;
  contentStyle?: StyleProp<ViewStyle>;
}) {
  const t = useTheme();
  return (
    <ScrollView
      style={{ flex: 1, backgroundColor: t.bg }}
      contentContainerStyle={[{ padding: 16, gap: 12, paddingBottom: 32 }, contentStyle]}
      keyboardShouldPersistTaps="handled"
      refreshControl={onRefresh ? <RefreshControl refreshing={!!refreshing} onRefresh={onRefresh} tintColor={t.primary} /> : undefined}
    >
      {children}
    </ScrollView>
  );
}
