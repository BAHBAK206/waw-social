import type { ReactNode } from 'react';
import { KeyboardAvoidingView, Platform, ScrollView, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { GradientHeader, Text } from '@/components/ui';
import { useT } from '@/lib/i18n';
import { useTheme } from '@/lib/theme';

export function AuthShell({ title, subtitle, children }: { title: string; subtitle: string; children: ReactNode }) {
  const t = useTheme();
  const tr = useT();
  const insets = useSafeAreaInsets();
  return (
    <KeyboardAvoidingView style={{ flex: 1, backgroundColor: t.bg }} behavior={Platform.OS === 'ios' ? 'padding' : undefined}>
      <ScrollView keyboardShouldPersistTaps="handled" contentContainerStyle={{ flexGrow: 1 }}>
        <GradientHeader style={{ paddingTop: insets.top + 36, paddingBottom: 36 }}>
          <Text weight="black" size={32} color={t.onPrimary}>
            {tr.t('app.name')}
          </Text>
          <Text color={t.onPrimary} style={{ opacity: 0.9, marginTop: 4 }}>
            {tr.t('app.tagline')}
          </Text>
        </GradientHeader>
        <View style={{ padding: 20, gap: 16 }}>
          <View>
            <Text weight="black" size={24}>
              {title}
            </Text>
            <Text muted>{subtitle}</Text>
          </View>
          {children}
        </View>
      </ScrollView>
    </KeyboardAvoidingView>
  );
}
