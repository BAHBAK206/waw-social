import { Ionicons } from '@expo/vector-icons';
import { GUIDES, INFO_CONTENT } from '@qubedu/i18n';
import { GUIDE_LIST, normalizeSearch } from '@qubedu/shared';
import { useRouter } from 'expo-router';
import { useState } from 'react';
import { TextInput, View } from 'react-native';
import { CapabilityList } from '@/components/Guide';
import { Row } from '@/components/kit';
import { Screen } from '@/components/Screen';
import { Button, Card, Text } from '@/components/ui';
import { useT } from '@/lib/i18n';
import { useSession } from '@/lib/session';
import { FONT, useTheme } from '@/lib/theme';

/** Help center: every feature explained, who can do what, and common questions. */
export default function HelpCenterScreen() {
  const tr = useT();
  const t = useTheme();
  const router = useRouter();
  const me = useSession((s) => s.me);
  const book = GUIDES[tr.locale];
  const faqAll = INFO_CONTENT[tr.locale].help.faq;
  const [term, setTerm] = useState('');
  const [openFaq, setOpenFaq] = useState<number | null>(null);
  const q = normalizeSearch(term.trim());
  const match = (s: string) => !q || normalizeSearch(s).includes(q);
  const guides = GUIDE_LIST.filter((g) => match([book[g.id].title, book[g.id].summary, ...book[g.id].steps, ...(book[g.id].tips ?? [])].join(' ')));
  const faq = faqAll.filter((f) => match(`${f.question} ${f.answer}`));
  return (
    <Screen>
      <Text muted>{tr.t('helpCenter.intro')}</Text>
      <TextInput
        value={term}
        onChangeText={setTerm}
        placeholder={tr.t('helpCenter.search')}
        placeholderTextColor={t.text3}
        accessibilityLabel={tr.t('helpCenter.search')}
        returnKeyType="search"
        style={{
          minHeight: 46,
          borderRadius: t.radiusControl,
          borderWidth: 1.5,
          borderColor: t.border,
          backgroundColor: t.bg2,
          paddingHorizontal: 14,
          color: t.text,
          fontFamily: FONT.regular,
          textAlign: 'auto',
        }}
      />
      {!guides.length && !faq.length ? <Text muted>{tr.t('helpCenter.noResults')}</Text> : null}
      {[true, false].map((detailed) => {
        const list = guides.filter((g) => g.detailed === detailed);
        if (!list.length) return null;
        return (
          <View key={String(detailed)} style={{ gap: 8 }}>
            <Text weight="black" size={16}>
              {detailed ? tr.t('helpCenter.detailed') : tr.t('helpCenter.quick')}
            </Text>
            {list.map((g) => (
              <Row
                key={g.id}
                icon={detailed ? 'book-outline' : 'help-circle-outline'}
                title={book[g.id].title}
                subtitle={book[g.id].summary}
                onPress={() => router.push(`/help/${g.id}` as never)}
              />
            ))}
          </View>
        );
      })}
      {!q ? (
        <View style={{ gap: 8 }}>
          <Text weight="black" size={16}>
            {tr.t('capabilities.title')}
          </Text>
          <Text muted size={13}>
            {tr.t('capabilities.hint')}
          </Text>
          <CapabilityList />
        </View>
      ) : null}
      {faq.length ? (
        <View style={{ gap: 8 }}>
          <Text weight="black" size={16}>
            {tr.t('helpCenter.faq')}
          </Text>
          {faq.map((f, i) => (
            <Card key={f.question} onPress={() => setOpenFaq(openFaq === i ? null : i)} style={{ gap: 6 }}>
              <View style={{ flexDirection: 'row', gap: 8, alignItems: 'center' }}>
                <Text weight="bold" style={{ flex: 1 }}>
                  {f.question}
                </Text>
                <Ionicons name={openFaq === i ? 'chevron-up' : 'chevron-down'} size={18} color={t.text3} />
              </View>
              {openFaq === i ? <Text muted>{f.answer}</Text> : null}
            </Card>
          ))}
        </View>
      ) : null}
      {me ? <Button icon="chatbubble-ellipses-outline" title={tr.t('helpCenter.askAi')} onPress={() => router.push('/assistant' as never)} /> : null}
      <Button variant="ghost" title={tr.t('nav.contact')} onPress={() => router.push('/info/contact' as never)} />
    </Screen>
  );
}
