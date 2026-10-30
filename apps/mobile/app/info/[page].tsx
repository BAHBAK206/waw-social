import { INFO_CONTENT, type InfoPage } from '@qubedu/i18n';
import { Stack, useLocalSearchParams } from 'expo-router';
import { useState } from 'react';
import { Linking, Pressable, View } from 'react-native';
import { Screen } from '@/components/Screen';
import { Card, Empty, Text } from '@/components/ui';
import { useSession } from '@/lib/session';
import { useT } from '@/lib/i18n';
import { useTheme } from '@/lib/theme';

const PAGES = ['help', 'about', 'privacy', 'terms', 'contact'] as const;
type Page = (typeof PAGES)[number];

function Sections({ page }: { page: InfoPage }) {
  return (
    <>
      <Text muted>{page.intro}</Text>
      {page.sections.map((s) => (
        <Card key={s.title} style={{ gap: 6 }}>
          <Text weight="black">{s.title}</Text>
          {s.paragraphs?.map((p, i) => (
            <Text key={i}>{p}</Text>
          ))}
          {s.bullets?.map((b, i) => (
            <Text key={i}>• {b}</Text>
          ))}
        </Card>
      ))}
    </>
  );
}

export default function InfoScreen() {
  const { page } = useLocalSearchParams<{ page: string }>();
  const tr = useT();
  const t = useTheme();
  const email = useSession((s) => s.config?.contact?.email?.trim() || null);
  const phone = useSession((s) => s.config?.contact?.phone?.trim() || null);
  const [open, setOpen] = useState<number | null>(0);
  const content = INFO_CONTENT[tr.locale];
  if (!(PAGES as readonly string[]).includes(page ?? '')) return <Empty title={tr.t('notFound.title')} />;
  const p = page as Page;
  const title = content[p].title;
  return (
    <Screen>
      <Stack.Screen options={{ title }} />
      <Text weight="black" size={22}>
        {title}
      </Text>
      {p === 'help' ? (
        <>
          <Text muted>{content.help.intro}</Text>
          {content.help.faq.map((f, i) => (
            <Card key={i} onPress={() => setOpen(open === i ? null : i)} style={{ gap: 6 }}>
              <Text weight="bold">{f.question}</Text>
              {open === i ? <Text>{f.answer}</Text> : null}
            </Card>
          ))}
        </>
      ) : p === 'contact' ? (
        <>
          <Text muted>{content.contact.intro}</Text>
          <Card style={{ gap: 6 }}>
            <Text weight="bold">{content.contact.emailLabel}</Text>
            {email ? (
              <Pressable onPress={() => void Linking.openURL(`mailto:${email}`)} accessibilityRole="link">
                <Text weight="bold" color={t.primaryInk}>
                  {email}
                </Text>
              </Pressable>
            ) : (
              <Text muted>{content.contact.noEmailNotice}</Text>
            )}
            {phone ? (
              <Pressable onPress={() => void Linking.openURL(`tel:${phone}`)} accessibilityRole="link">
                <Text weight="bold" color={t.primaryInk}>
                  📞 {phone}
                </Text>
              </Pressable>
            ) : null}
          </Card>
          <Card style={{ gap: 4 }}>
            <Text weight="black">{content.contact.topicsTitle}</Text>
            {content.contact.topics.map((x) => (
              <Text key={x}>• {x}</Text>
            ))}
          </Card>
          <Text muted size={12}>
            {content.contact.responseNote}
          </Text>
        </>
      ) : (
        <Sections page={content[p]} />
      )}
      <View style={{ height: 12 }} />
    </Screen>
  );
}
