import { Ionicons } from '@expo/vector-icons';
import { isStaff, xpProgress, type FeatureId } from '@qubedu/shared';
import { useRouter } from 'expo-router';
import { View } from 'react-native';
import { Screen } from '@/components/Screen';
import { Row, type IconName } from '@/components/kit';
import { Avatar, Card, Text } from '@/components/ui';
import { useFeatureMode } from '@/lib/features';
import { useT } from '@/lib/i18n';
import { useSession } from '@/lib/session';
import { useTheme } from '@/lib/theme';
import { openWeb } from '@/lib/web';

interface HubItem {
  id: FeatureId;
  icon: IconName;
  /** Mobile screen, or a web path opened in the browser for web-only tools. */
  href?: string;
  web?: string;
  label?: string;
}

const SECTIONS: { key: 'learning' | 'social' | 'personal' | 'tools' | 'help'; items: HubItem[] }[] = [
  {
    key: 'learning',
    items: [
      { id: 'academic', icon: 'school-outline', href: '/study' },
      { id: 'school', icon: 'easel-outline', href: '/school' },
      { id: 'lab', icon: 'mic-outline', href: '/lab' },
      { id: 'ai', icon: 'sparkles-outline', href: '/tutor' },
      { id: 'assistant', icon: 'chatbubble-ellipses-outline', href: '/assistant' },
      { id: 'library', icon: 'library-outline', href: '/library' },
      { id: 'events', icon: 'calendar-outline', href: '/events' },
      { id: 'classes', icon: 'videocam-outline', href: '/live' },
      { id: 'forms', icon: 'clipboard-outline', href: '/forms' },
      { id: 'workspace', icon: 'document-text-outline', web: '/workspace' },
    ],
  },
  {
    key: 'social',
    items: [
      { id: 'explore', icon: 'compass-outline', href: '/explore' },
      { id: 'groups', icon: 'people-outline', href: '/groups' },
      { id: 'people', icon: 'person-add-outline', href: '/people' },
      { id: 'stories', icon: 'flash-outline', href: '/tips' },
    ],
  },
  {
    key: 'personal',
    items: [
      { id: 'organizer', icon: 'checkbox-outline', href: '/organizer' },
      { id: 'saved', icon: 'bookmark-outline', href: '/saved' },
      { id: 'studio', icon: 'cloud-upload-outline', href: '/studio' },
    ],
  },
  {
    key: 'tools',
    items: [
      { id: 'search', icon: 'search-outline', href: '/search' },
      { id: 'notifications', icon: 'notifications-outline', href: '/notifications' },
      { id: 'settings', icon: 'settings-outline', href: '/settings' },
    ],
  },
  {
    key: 'help',
    items: [
      { id: 'help', icon: 'help-buoy-outline', href: '/info/help' },
      { id: 'about', icon: 'information-circle-outline', href: '/info/about' },
      { id: 'privacy', icon: 'shield-checkmark-outline', href: '/info/privacy' },
      { id: 'terms', icon: 'document-outline', href: '/info/terms' },
      { id: 'contact', icon: 'mail-outline', href: '/info/contact' },
    ],
  },
];

function HubRow({ item, badge }: { item: HubItem; badge?: number }) {
  const tr = useT();
  const t = useTheme();
  const router = useRouter();
  const { mode } = useFeatureMode(item.id);
  if (mode === 'hidden') return null;
  const label = item.label ?? tr.tDyn(`nav.${item.id}`, undefined, tr.tDyn(`features.${item.id}`, undefined, item.id));
  return (
    <Row
      icon={item.icon}
      title={label}
      subtitle={item.web ? tr.t('common.opensInBrowser') : undefined}
      onPress={() => (item.web ? void openWeb(item.web) : router.push(item.href as never))}
      right={
        mode !== 'enabled' ? (
          <Ionicons name="lock-closed-outline" size={16} color={t.text3} />
        ) : badge ? (
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
              {badge > 99 ? '99+' : badge}
            </Text>
          </View>
        ) : undefined
      }
    />
  );
}

export default function MeScreen() {
  const tr = useT();
  const t = useTheme();
  const router = useRouter();
  const me = useSession((s) => s.me)!;
  const progress = xpProgress(me.xp);
  const isAdmin = isStaff(me.role);
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
        <Ionicons name="chevron-forward" size={20} color={t.text3} style={{ transform: [{ scaleX: tr.dir === 'rtl' ? -1 : 1 }] }} />
      </Card>
      {SECTIONS.map((s) => (
        <View key={s.key} style={{ gap: 8 }}>
          <Text weight="black" size={15} muted style={{ marginTop: 6 }}>
            {tr.t(`nav.categories.${s.key}`)}
          </Text>
          {s.items.map((i) => (
            <HubRow key={i.id} item={i} badge={i.id === 'notifications' ? me.unreadNotifications : undefined} />
          ))}
          {s.key === 'tools' && isAdmin && (
            <Row icon="construct-outline" title={tr.t('nav.admin')} subtitle={tr.t('common.opensInBrowser')} onPress={() => void openWeb('/admin')} />
          )}
        </View>
      ))}
    </Screen>
  );
}
