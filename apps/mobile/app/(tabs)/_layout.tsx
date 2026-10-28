import { Ionicons } from '@expo/vector-icons';
import { Tabs, useRouter } from 'expo-router';
import { Pressable, type ColorValue } from 'react-native';
import { useT } from '@/lib/i18n';
import { useSession } from '@/lib/session';
import { useTheme } from '@/lib/theme';

type IconName = React.ComponentProps<typeof Ionicons>['name'];

const ICON = (name: IconName, focused: IconName) =>
  function TabIcon({ color, size, focused: f }: { color: ColorValue; size: number; focused: boolean }) {
    return <Ionicons name={f ? focused : name} size={size} color={color as string} />;
  };

export default function TabsLayout() {
  const t = useTheme();
  const tr = useT();
  const unread = useSession((s) => s.me?.unreadMessages ?? 0);
  const router = useRouter();
  return (
    <Tabs
      screenOptions={{
        tabBarActiveTintColor: t.primaryInk,
        tabBarInactiveTintColor: t.text3,
        tabBarStyle: { backgroundColor: t.cardSolid, borderTopColor: t.border },
        tabBarLabelStyle: { fontFamily: 'Tajawal_700Bold', fontSize: 11 },
        headerStyle: { backgroundColor: t.cardSolid },
        headerTintColor: t.text,
        headerTitleStyle: { fontFamily: 'Tajawal_800ExtraBold' },
        headerRight: () => (
          <Pressable
            onPress={() => router.push('/search')}
            hitSlop={10}
            accessibilityRole="button"
            accessibilityLabel={tr.t('nav.search')}
            style={{ marginHorizontal: 16 }}
          >
            <Ionicons name="search" size={22} color={t.text} />
          </Pressable>
        ),
      }}
    >
      <Tabs.Screen name="index" options={{ title: tr.t('nav.home'), tabBarIcon: ICON('home-outline', 'home') }} />
      <Tabs.Screen name="feed" options={{ title: tr.t('nav.feed'), tabBarIcon: ICON('newspaper-outline', 'newspaper') }} />
      <Tabs.Screen name="learn" options={{ title: tr.t('nav.quiz'), tabBarIcon: ICON('list-circle-outline', 'list-circle') }} />
      <Tabs.Screen name="watch" options={{ title: tr.t('nav.watch'), tabBarIcon: ICON('play-circle-outline', 'play-circle') }} />
      <Tabs.Screen
        name="chats"
        options={{
          title: tr.t('nav.chat'),
          tabBarBadge: unread > 0 ? (unread > 99 ? '99+' : unread) : undefined,
          tabBarIcon: ICON('chatbubbles-outline', 'chatbubbles'),
        }}
      />
      <Tabs.Screen name="me" options={{ title: tr.t('nav.profile'), tabBarIcon: ICON('person-circle-outline', 'person-circle') }} />
    </Tabs>
  );
}
