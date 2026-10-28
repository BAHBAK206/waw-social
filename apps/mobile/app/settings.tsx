import { DESIGNS, LANGUAGES, SKINS, TEXT_SIZES, THEME_MODES } from '@qubedu/shared';
import { DESIGN_TOKENS, SKIN_TOKENS } from '@qubedu/tokens';
import { Alert, Pressable, View } from 'react-native';
import { Screen } from '@/components/Screen';
import { SettingsTabs } from '@/components/SettingsTabs';
import { SwitchRow } from '@/components/kit';
import { Chip, SectionTitle, Text } from '@/components/ui';
import { syncDirection, useAppearance } from '@/lib/appearance';
import { useT } from '@/lib/i18n';
import { useTheme } from '@/lib/theme';

const LANGUAGE_NAMES = { ar: 'العربية', en: 'English', fr: 'Français', es: 'Español' } as const;

function Appearance() {
  const tr = useT();
  const t = useTheme();
  const { appearance: a, update } = useAppearance();

  const setLanguage = (language: (typeof LANGUAGES)[number]) => {
    update({ language });
    if (syncDirection(language)) Alert.alert(tr.t('settings.appearance.language'), tr.t('pwa.updateAvailable'));
  };

  return (
    <View style={{ gap: 12 }}>
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

      <SwitchRow label={tr.t('settings.appearance.reduceMotion')} value={a.reduceMotion} onChange={(v) => update({ reduceMotion: v })} />
      <SwitchRow label={tr.t('settings.appearance.highContrast')} value={a.highContrast} onChange={(v) => update({ highContrast: v })} />
      <SwitchRow
        label={tr.t('settings.appearance.dyslexiaFont')}
        value={a.readingFont === 'dyslexic'}
        onChange={(v) => update({ readingFont: v ? 'dyslexic' : 'default' })}
      />
      <Text muted size={12}>
        {tr.t('settings.appearance.accessibilityHint')}
      </Text>
    </View>
  );
}

export default function SettingsScreen() {
  return (
    <Screen>
      <SettingsTabs appearance={<Appearance />} />
    </Screen>
  );
}
