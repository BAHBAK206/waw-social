import { Ionicons } from '@expo/vector-icons';
import type { SearchResultsDto } from '@qubedu/shared';
import { useQuery } from '@tanstack/react-query';
import { useRouter } from 'expo-router';
import { useEffect, useState } from 'react';
import { Pressable, ScrollView, TextInput, View } from 'react-native';
import { Row } from '@/components/kit';
import { Empty, Loading, SectionTitle } from '@/components/ui';
import { api } from '@/lib/api';
import { useAppearance } from '@/lib/appearance';
import { useT } from '@/lib/i18n';
import { canRecognize, listen, MicDeniedError } from '@/lib/recognition';
import { toast, toastError } from '@/lib/ui';
import { FONT, useTheme } from '@/lib/theme';

function useDebounced<T>(value: T, ms = 300) {
  const [v, setV] = useState(value);
  useEffect(() => {
    const id = setTimeout(() => setV(value), ms);
    return () => clearTimeout(id);
  }, [value, ms]);
  return v;
}

export default function SearchScreen() {
  const tr = useT();
  const t = useTheme();
  const router = useRouter();
  const [term, setTerm] = useState('');
  const [listening, setListening] = useState<{ stop: () => void } | null>(null);
  const language = useAppearance((s) => s.appearance.language);
  const talk = async () => {
    if (listening) {
      listening.stop();
      return;
    }
    if (!canRecognize()) {
      toast(tr.t('ops.voice.unsupported'), 'err');
      return;
    }
    try {
      const l = await listen(language, setTerm);
      setListening(l);
      const said = await l.result;
      setListening(null);
      if (said.trim()) setTerm(said.trim());
      else toast(tr.t('ops.voice.nothing'));
    } catch (e) {
      setListening(null);
      if (e instanceof MicDeniedError) toast(tr.t('ops.voice.denied'), 'err');
      else toastError(e);
    }
  };
  const q = useDebounced(term.trim());
  const res = useQuery({ queryKey: ['search', q], queryFn: ({ signal }) => api.search(q, signal), enabled: q.length >= 2 });
  const d: SearchResultsDto | undefined = res.data;
  const empty = d && !d.users.length && !d.groups.length && !d.quizzes.length && !d.posts.length && !d.library.length && !d.courses.length;
  return (
    <ScrollView style={{ flex: 1, backgroundColor: t.bg }} contentContainerStyle={{ padding: 16, gap: 8 }} keyboardShouldPersistTaps="handled">
      <View
        style={{
          flexDirection: 'row',
          alignItems: 'center',
          gap: 8,
          borderRadius: 24,
          borderWidth: 1.5,
          borderColor: t.border,
          backgroundColor: t.bg2,
          paddingHorizontal: 14,
        }}
      >
        <Ionicons name="search" size={20} color={t.text3} />
        <TextInput
          autoFocus
          value={term}
          onChangeText={setTerm}
          placeholder={tr.t('nav.searchPlaceholder')}
          placeholderTextColor={t.text3}
          accessibilityLabel={tr.t('nav.searchPlaceholder')}
          returnKeyType="search"
          style={{ flex: 1, minHeight: 48, color: t.text, fontFamily: FONT.regular, fontSize: 15, textAlign: 'auto' }}
        />
        <Pressable
          hitSlop={8}
          accessibilityRole="button"
          accessibilityLabel={listening ? tr.t('ops.voice.listening') : tr.t('ops.voice.speak')}
          onPress={() => void talk()}
        >
          <Ionicons name={listening ? 'stop-circle' : 'mic-outline'} size={22} color={listening ? t.err : t.text3} />
        </Pressable>
      </View>
      {res.isFetching && <Loading />}
      {empty && <Empty icon="search-outline" title={tr.t('palette.noResults')} />}
      {!!d?.quizzes.length && <SectionTitle>{tr.t('nav.quiz')}</SectionTitle>}
      {d?.quizzes.map((x) => (
        <Row
          key={x.id}
          icon="list-circle-outline"
          title={x.title}
          subtitle={tr.t('quiz.questions', { count: x.questionCount })}
          onPress={() => router.push(`/quiz/${x.id}` as never)}
        />
      ))}
      {!!d?.posts.length && <SectionTitle>{tr.t('nav.feed')}</SectionTitle>}
      {d?.posts.map((x) => (
        <Row
          key={x.id}
          icon="chatbox-ellipses-outline"
          title={x.text.slice(0, 120) || '…'}
          subtitle={x.author.displayName}
          onPress={() => router.push(`/post/${x.id}` as never)}
        />
      ))}
      {!!d?.courses.length && <SectionTitle>{tr.t('nav.school')}</SectionTitle>}
      {d?.courses.map((x) => (
        <Row key={x.id} icon="easel-outline" title={x.title} subtitle={x.subject ?? undefined} onPress={() => router.push(`/course/${x.id}` as never)} />
      ))}
      {!!d?.library.length && <SectionTitle>{tr.t('nav.library')}</SectionTitle>}
      {d?.library.map((x) => (
        <Row
          key={x.id}
          icon="library-outline"
          title={x.title}
          subtitle={tr.t(`library.categories.${x.category}`)}
          onPress={() => router.push('/library' as never)}
        />
      ))}
      {!!d?.groups.length && <SectionTitle>{tr.t('nav.groups')}</SectionTitle>}
      {d?.groups.map((x) => (
        <Row
          key={x.id}
          icon="people-outline"
          title={x.name}
          subtitle={tr.t('groups.members', { count: x.memberCount })}
          onPress={() => router.push(`/group/${x.id}` as never)}
        />
      ))}
      {!!d?.users.length && <SectionTitle>{tr.t('nav.people')}</SectionTitle>}
      {d?.users.map((x) => (
        <Row
          key={x.id}
          icon="person-outline"
          title={x.displayName}
          subtitle={x.username ? `@${x.username}` : undefined}
          onPress={() => router.push(`/user/${x.id}` as never)}
        />
      ))}
    </ScrollView>
  );
}
