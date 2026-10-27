import { Link, Stack } from 'expo-router';
import { View } from 'react-native';
import { Text } from '@/components/ui';
import { useT } from '@/lib/i18n';

export default function NotFound() {
  const tr = useT();
  return (
    <>
      <Stack.Screen options={{ title: '404' }} />
      <View style={{ flex: 1, alignItems: 'center', justifyContent: 'center', gap: 12, padding: 24 }}>
        <Text weight="black" size={22}>
          {tr.t('notFound.title')}
        </Text>
        <Link href="/">
          <Text weight="bold">{tr.t('notFound.home')}</Text>
        </Link>
      </View>
    </>
  );
}
