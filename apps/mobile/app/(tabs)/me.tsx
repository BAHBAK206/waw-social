import { Ionicons } from '@expo/vector-icons';
import { FEATURE_CATEGORIES, isStaff, sectionItems, xpProgress, type AccountType, type FeatureCategory, type FeatureId } from '@qubedu/shared';
import { useRouter } from 'expo-router';
import { View } from 'react-native';
import { Screen } from '@/components/Screen';
import { Row, type IconName } from '@/components/kit';
import { Avatar, Card, Text } from '@/components/ui';
import { useFeatureMode } from '@/lib/features';
import { useT } from '@/lib/i18n';
import { useSession } from '@/lib/session';
import { useTheme } from '@/lib/theme';

interface HubItem {
  id: FeatureId;
  icon: IconName;
  /** Mobile screen, or a web path opened in the browser for web-only tools. */
  href?: string;
  web?: string;
  label?: string;
  /** Translation key when the row is not the feature's own page (e.g. downloads under "watch"). */
  labelKey?: string;
}

/** Where each feature opens on the phone (a native screen, or a web page for web-only tools). */
const MOBILE: Partial<Record<FeatureId, Omit<HubItem, 'id'>>> = {
  school: { icon: 'easel-outline', href: '/school' },
  schools: { icon: 'business-outline', href: '/schools' },
  grades: { icon: 'ribbon-outline', href: '/grades' },
  classes: { icon: 'videocam-outline', href: '/live' },
  catalog: { icon: 'storefront-outline', href: '/courses' },
  certificates: { icon: 'medal-outline', href: '/certificates' },
  curriculum: { icon: 'map-outline', href: '/curriculum' },
  academic: { icon: 'school-outline', href: '/study' },
  review: { icon: 'repeat-outline', href: '/review' },
  'study-pack': { icon: 'create-outline', web: '/study-pack' },
  glossary: { icon: 'book-outline', href: '/glossary' },
  exams: { icon: 'hourglass-outline', href: '/study?tab=exams' },
  library: { icon: 'library-outline', href: '/library' },
  shorts: { icon: 'film-outline', href: '/shorts' },
  lab: { icon: 'mic-outline', href: '/lab' },
  events: { icon: 'calendar-outline', href: '/events' },
  assistant: { icon: 'chatbubble-ellipses-outline', href: '/assistant' },
  ai: { icon: 'sparkles-outline', href: '/tutor' },
  groups: { icon: 'people-outline', href: '/groups' },
  communities: { icon: 'globe-outline', web: '/communities' },
  people: { icon: 'person-add-outline', href: '/people' },
  explore: { icon: 'compass-outline', href: '/explore' },
  mentors: { icon: 'hand-left-outline', web: '/mentors' },
  league: { icon: 'trophy-outline', href: '/league' },
  timetable: { icon: 'calendar-number-outline', href: '/timetable' },
  calculator: { icon: 'calculator-outline', href: '/calculator' },
  workspace: { icon: 'document-text-outline', href: '/workspace' },
  forms: { icon: 'clipboard-outline', href: '/forms' },
  organizer: { icon: 'checkbox-outline', href: '/organizer' },
  settings: { icon: 'settings-outline', href: '/settings' },
  family: { icon: 'people-circle-outline', href: '/family' },
  saved: { icon: 'bookmark-outline', href: '/saved' },
  studio: { icon: 'cloud-upload-outline', href: '/studio' },
  help: { icon: 'help-buoy-outline', href: '/help' },
  about: { icon: 'information-circle-outline', href: '/info/about' },
  privacy: { icon: 'shield-checkmark-outline', href: '/info/privacy' },
  terms: { icon: 'document-outline', href: '/info/terms' },
  contact: { icon: 'mail-outline', href: '/info/contact' },
};

/** Phone-only rows that are not pages of their own on the web. */
const EXTRAS: Partial<Record<FeatureCategory, HubItem[]>> = {
  study: [{ id: 'watch', icon: 'download-outline', href: '/downloads', labelKey: 'nav.downloads' }],
  community: [{ id: 'stories', icon: 'flash-outline', href: '/tips' }],
  tools: [
    { id: 'search', icon: 'search-outline', href: '/search' },
    { id: 'notifications', icon: 'notifications-outline', href: '/notifications' },
  ],
};

/** Same sections and order as the web menu, filtered for the account type. Tabs (home, feed, quiz, watch, chat) are left out. */
function hubSections(accountType: AccountType): { key: FeatureCategory; items: HubItem[] }[] {
  return FEATURE_CATEGORIES.filter((c) => c !== 'main')
    .map((key) => ({
      key,
      items: [
        ...sectionItems(key, accountType).flatMap((id) => {
          const m = MOBILE[id];
          return m ? [{ id, ...m }] : [];
        }),
        ...(EXTRAS[key] ?? []),
      ],
    }))
    .filter((s) => s.items.length > 0);
}

function HubRow({ item, badge }: { item: HubItem; badge?: number }) {
  const tr = useT();
  const t = useTheme();
  const router = useRouter();
  const { mode } = useFeatureMode(item.id);
  if (mode === 'hidden') return null;
  const label =
    item.label ??
    (item.labelKey ? tr.tDyn(item.labelKey) : undefined) ??
    tr.tDyn(`nav.${item.id}`, undefined, tr.tDyn(`features.${item.id}`, undefined, item.id));
  return (
    <Row
      icon={item.icon}
      title={label}
      subtitle={undefined}
      onPress={() => router.push((item.web ? `/web?path=${encodeURIComponent(item.web)}&title=${encodeURIComponent(label)}` : item.href) as never)}
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
      {hubSections(me.accountType).map((s) => (
        <View key={s.key} style={{ gap: 8 }}>
          <Text weight="black" size={15} muted style={{ marginTop: 6 }}>
            {tr.t(`nav.categories.${s.key}`)}
          </Text>
          {s.items.map((i) => (
            <HubRow key={i.href ?? i.web ?? i.id} item={i} badge={i.id === 'notifications' ? me.unreadNotifications : undefined} />
          ))}
          {s.key === 'tools' && isAdmin && (
            <Row
              icon="construct-outline"
              title={tr.t('nav.admin')}
              onPress={() => router.push(`/web?path=${encodeURIComponent('/admin')}&title=${encodeURIComponent(tr.t('nav.admin'))}` as never)}
            />
          )}
        </View>
      ))}
    </Screen>
  );
}
