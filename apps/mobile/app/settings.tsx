import { DESIGNS, LANGUAGES, SKINS, TEXT_SIZES, THEME_MODES } from '@qubedu/shared';
import { DESIGN_TOKENS, SKIN_TOKENS } from '@qubedu/tokens';
import { Alert, Pressable, View } from 'react-native';
import { Screen } from '@/components/Screen';
import { Button, Card, Chip, SectionTitle, Text } from '@/components/ui';
import { api } from '@/lib/api';
import { syncDirection, useAppearance } from '@/lib/appearance';
import { useT } from '@/lib/i18n';
import { useSession } from '@/lib/session';
import { useTheme } from '@/lib/theme';
import { confirm, toast, toastError } from '@/lib/ui';
import { queryClient } from '@/lib/query';

const LANGUAGE_NAMES = { ar: 'العربية', en: 'English', fr: 'Français', es: 'Español' } as const;

export default function SettingsScreen() {
  const tr = useT();
  const t = useTheme();
  const { appearance: a, update } = useAppearance();
  const me = useSession((s) => s.me)!;

  const setLanguage = (language: (typeof LANGUAGES)[number]) => {
    update({ language });
    if (syncDirection(language)) Alert.alert(tr.t('settings.appearance.language'), tr.t('pwa.updateAvailable'));
  };

  return (
    <Screen>
      <Card>
        <Text weight="black" size={18}>
          {me.displayName}
        </Text>
        <Text muted>{me.email}</Text>
      </Card>

      <SectionTitle>{tr.t('settings.appearance.language')}</SectionTitle>
      <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: 8 }}>
        {LANGUAGES.map((l) => (
          <Chip key={l} label={LANGUAGE_NAMES[l]} active={a.language === l} onPress={() => setLanguage(l)} />
        ))}
      </View>

      <SectionTitle>{tr.t('settings.appearance.theme')}</SectionTitle>
      <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: 8 }}>
        {THEME_MODES.map((m) => (
          <Chip key={m} label={tr.t(`settings.appearance.themes.${m}`)} active={a.theme === m} onPress={() => update({ theme: m })} />
        ))}
      </View>

      <SectionTitle>{tr.t('settings.appearance.design')}</SectionTitle>
      <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: 10 }}>
        {DESIGNS.map((d) => {
          const s = DESIGN_TOKENS[d][t.mode];
          const on = a.design === d;
          return (
            <Pressable
              key={d}
              onPress={() => update({ design: d })}
              accessibilityRole="button"
              accessibilityState={{ selected: on }}
              style={{ width: '30%', flexGrow: 1, gap: 6, padding: 8, borderRadius: 14, borderWidth: 2, borderColor: on ? t.primary : t.border }}
            >
              <View style={{ height: 44, borderRadius: 8, padding: 6, backgroundColor: s.bg, borderWidth: 1, borderColor: s.border }}>
                <View style={{ flex: 1, borderRadius: DESIGN_TOKENS[d].radiusControl / 2, backgroundColor: s.card }} />
              </View>
              <Text weight="bold" size={12}>
                {tr.t(`settings.appearance.designs.${d}`)}
              </Text>
            </Pressable>
          );
        })}
      </View>

      <SectionTitle>{tr.t('settings.appearance.skin')}</SectionTitle>
      <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: 12 }}>
        {SKINS.map((s) => (
          <Pressable
            key={s}
            onPress={() => update({ skin: s })}
            accessibilityRole="button"
            accessibilityLabel={tr.t(`settings.appearance.skins.${s}`)}
            accessibilityState={{ selected: a.skin === s }}
            style={{ width: 44, height: 44, borderRadius: 22, backgroundColor: SKIN_TOKENS[s].primary, borderWidth: a.skin === s ? 4 : 0, borderColor: t.text }}
          />
        ))}
      </View>

      <SectionTitle>{tr.t('settings.appearance.textSize')}</SectionTitle>
      <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: 8 }}>
        {TEXT_SIZES.map((s) => (
          <Chip key={s} label={tr.t(`settings.appearance.textSizes.${s}`)} active={a.textSize === s} onPress={() => update({ textSize: s })} />
        ))}
      </View>

      <View style={{ height: 16 }} />
      <Button
        title={tr.t('nav.signOut')}
        variant="outline"
        icon="log-out-outline"
        onPress={async () => {
          if (!(await confirm(tr.t('nav.signOut')))) return;
          try {
            await api.auth.logout();
            queryClient.clear();
            toast(tr.t('common.done'));
          } catch (e) {
            toastError(e);
          }
        }}
      />
    </Screen>
  );
}
