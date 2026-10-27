import { Ionicons } from '@expo/vector-icons';
import { xpProgress } from '@qubedu/shared';
import { useRouter } from 'expo-router';
import { Pressable, View } from 'react-native';
import { Screen } from '@/components/Screen';
import { Avatar, Card, Text } from '@/components/ui';
import { useT } from '@/lib/i18n';
import { useSession } from '@/lib/session';
import { useTheme } from '@/lib/theme';

export default function MeScreen() {
  const tr = useT();
  const t = useTheme();
  const router = useRouter();
  const me = useSession((s) => s.me)!;
  const progress = xpProgress(me.xp);
  const items: { icon: React.ComponentProps<typeof Ionicons>['name']; label: string; href: string; badge?: number }[] = [
    { icon: 'notifications-outline', label: tr.t('notifications.title'), href: '/notifications', badge: me.unreadNotifications },
    { icon: 'people-outline', label: tr.t('groups.title'), href: '/groups' },
    { icon: 'person-add-outline', label: tr.t('people.title'), href: '/people' },
    { icon: 'videocam-outline', label: tr.t('live.title'), href: '/live' },
    { icon: 'bookmark-outline', label: tr.t('saved.title'), href: '/saved' },
    { icon: 'settings-outline', label: tr.t('settings.title'), href: '/settings' },
  ];
  return (
    <Screen>
      <Card onPress={() => router.push(`/user/${me.id}` as never)} style={{ flexDirection: 'row', alignItems: 'center', gap: 14 }}>
        <Avatar name={me.displayName} url={me.avatarUrl} size={64} />
        <View style={{ flex: 1 }}>
          <Text weight="black" size={20}>
            {me.displayName}
          </Text>
          <Text muted>
            {me.username ? `@${me.username} · ` : ''}
            {tr.t(`ranks.${progress.rank}`)} · {tr.t('common.levelN', { level: progress.level })}
          </Text>
          <Text muted size={12}>
            {me.xp} XP · 🔥 {me.streak}
          </Text>
        </View>
        <Ionicons name="chevron-forward" size={20} color={t.text3} />
      </Card>
      {items.map((i) => (
        <Pressable
          key={i.href}
          onPress={() => router.push(i.href as never)}
          accessibilityRole="button"
          style={({ pressed }) => ({
            flexDirection: 'row',
            alignItems: 'center',
            gap: 14,
            padding: 16,
            borderRadius: t.radiusCard,
            backgroundColor: pressed ? t.bg3 : t.cardSolid,
            borderWidth: 1,
            borderColor: t.border,
          })}
        >
          <Ionicons name={i.icon} size={22} color={t.primaryInk} />
          <Text weight="bold" style={{ flex: 1 }}>
            {i.label}
          </Text>
          {i.badge ? (
            <View
              style={{
                minWidth: 22,
                height: 22,
                borderRadius: 11,
                backgroundColor: t.errFill,
                alignItems: 'center',
                justifyContent: 'center',
                paddingHorizontal: 6,
              }}
            >
              <Text size={11} weight="bold" color="#fff">
                {i.badge > 99 ? '99+' : i.badge}
              </Text>
            </View>
          ) : null}
          <Ionicons name="chevron-forward" size={18} color={t.text3} />
        </Pressable>
      ))}
    </Screen>
  );
}
