import { Ionicons } from '@expo/vector-icons';
import { LAB_LANGUAGES, LAB_SET_IDS, PRONUNCIATION_SETS, type LabLanguage, type LabSetId, type PronunciationResultDto } from '@qubedu/shared';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { useEffect, useRef, useState } from 'react';
import { Pressable, ScrollView, View } from 'react-native';
import { Button, Card, Chip, Text } from '@/components/ui';
import { api } from '@/lib/api';
import { useT } from '@/lib/i18n';
import { canRecognize, listen, MicDeniedError } from '@/lib/recognition';
import { speak, stopSpeaking, useSpeaking } from '@/lib/speech';
import { useTheme } from '@/lib/theme';
import { toast, toastError } from '@/lib/ui';

const LANGUAGE_NAMES: Record<LabLanguage, string> = { ar: 'العربية', en: 'English', fr: 'Français', es: 'Español' };
const feedbackKey = (score: number) => (score >= 90 ? 'excellent' : score >= 70 ? 'good' : score >= 40 ? 'almost' : 'again');

export default function LabScreen() {
  const tr = useT();
  const t = useTheme();
  const qc = useQueryClient();
  const [lang, setLang] = useState<LabLanguage>(LAB_LANGUAGES.includes(tr.locale as LabLanguage) ? (tr.locale as LabLanguage) : 'en');
  const [set, setSet] = useState<LabSetId>('basics');
  const [custom, setCustom] = useState<string[] | null>(null);
  const phrases = custom ?? PRONUNCIATION_SETS[lang][set];
  const [index, setIndex] = useState(0);
  const phrase = phrases[Math.min(index, phrases.length - 1)] ?? '';
  const [listening, setListening] = useState(false);
  const [partial, setPartial] = useState('');
  const [result, setResult] = useState<(PronunciationResultDto & { heard: string }) | null>(null);
  const stopRef = useRef<(() => void) | null>(null);
  const speakingId = useSpeaking((s) => s.id);
  const recognition = canRecognize();
  const stats = useQuery({ queryKey: ['lab', 'stats'], queryFn: () => api.practice.pronunciationStats() });

  useEffect(() => {
    setResult(null);
    setPartial('');
  }, [phrase, lang]);
  useEffect(() => () => stopRef.current?.(), []);

  const say = (rate: number, id: string) => (speakingId === id ? stopSpeaking() : speak(phrase, id, lang, rate));

  const record = async () => {
    if (listening) {
      stopRef.current?.();
      return;
    }
    stopSpeaking();
    setResult(null);
    setPartial('');
    try {
      const session = await listen(lang, setPartial);
      stopRef.current = session.stop;
      setListening(true);
      const heard = (await session.result).trim();
      setListening(false);
      stopRef.current = null;
      if (!heard) {
        toast(tr.t('lab.noSpeech'), 'err');
        return;
      }
      const res = await api.practice.pronunciation({ language: lang, phrase, heard });
      setResult({ ...res, heard });
      if (res.xpEarned > 0) toast(tr.t('lab.xp', { xp: res.xpEarned }));
      void qc.invalidateQueries({ queryKey: ['lab', 'stats'] });
    } catch (e) {
      setListening(false);
      stopRef.current = null;
      if (e instanceof MicDeniedError) toast(tr.t('lab.micDenied'), 'err');
      else toastError(e);
    }
  };

  const weak = stats.data?.weakWords ?? [];
  const today = stats.data?.today;
  return (
    <ScrollView style={{ backgroundColor: t.bg }} contentContainerStyle={{ padding: 16, gap: 12 }}>
      <Text muted>{tr.t('lab.subtitle')}</Text>
      <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={{ gap: 8 }}>
        {LAB_LANGUAGES.map((l) => (
          <Chip
            key={l}
            label={LANGUAGE_NAMES[l]}
            active={lang === l}
            onPress={() => {
              setLang(l);
              setCustom(null);
              setIndex(0);
            }}
          />
        ))}
      </ScrollView>
      <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={{ gap: 8 }}>
        {LAB_SET_IDS.map((s) => (
          <Chip
            key={s}
            label={tr.t(`lab.sets.${s}`)}
            active={!custom && set === s}
            onPress={() => {
              setSet(s);
              setCustom(null);
              setIndex(0);
            }}
          />
        ))}
      </ScrollView>

      <Card style={{ gap: 14, alignItems: 'center', paddingVertical: 22 }}>
        <Text muted size={12}>
          {tr.t('lab.phraseOf', { n: index + 1, total: phrases.length })}
        </Text>
        <Text weight="black" size={26} style={{ textAlign: 'center' }}>
          {phrase}
        </Text>
        <View style={{ flexDirection: 'row', gap: 10, flexWrap: 'wrap', justifyContent: 'center' }}>
          <Button small variant="outline" title={speakingId === 'lab-normal' ? tr.t('lab.stop') : tr.t('lab.listen')} onPress={() => say(1, 'lab-normal')} />
          <Button small variant="outline" title={speakingId === 'lab-slow' ? tr.t('lab.stop') : tr.t('lab.listenSlow')} onPress={() => say(0.6, 'lab-slow')} />
        </View>
        {recognition ? (
          <Pressable
            onPress={() => void record()}
            accessibilityRole="button"
            accessibilityLabel={listening ? tr.t('lab.stopListening') : tr.t('lab.speak')}
            style={{
              width: 84,
              height: 84,
              borderRadius: 42,
              alignItems: 'center',
              justifyContent: 'center',
              backgroundColor: listening ? t.err : t.primary,
            }}
          >
            <Ionicons name={listening ? 'stop' : 'mic'} size={38} color={t.onPrimary} />
          </Pressable>
        ) : (
          <Text muted size={13} style={{ textAlign: 'center' }}>
            {tr.t('lab.noRecognition')}
          </Text>
        )}
        {listening && (
          <Text weight="bold" color={t.primaryInk}>
            {partial || tr.t('lab.listening')}
          </Text>
        )}
      </Card>

      {result && (
        <Card style={{ gap: 10 }}>
          <View style={{ flexDirection: 'row', alignItems: 'center', gap: 12 }}>
            <Text weight="black" size={40} color={result.score >= 70 ? t.ok : result.score >= 40 ? t.warn : t.err}>
              {result.score}%
            </Text>
            <View style={{ flex: 1 }}>
              <Text muted size={12}>
                {tr.t('lab.score')}
              </Text>
              <Text weight="bold">{tr.t(`lab.feedback.${feedbackKey(result.score)}`)}</Text>
            </View>
          </View>
          <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: 6 }}>
            {result.words.map((w, i) => (
              <View key={i} style={{ borderRadius: 8, paddingHorizontal: 8, paddingVertical: 3, backgroundColor: w.ok ? t.okFill : t.errFill }}>
                <Text weight="bold" color="#fff">
                  {w.word}
                </Text>
              </View>
            ))}
          </View>
          <Text muted size={13}>
            {tr.t('lab.heard')}: {result.heard}
          </Text>
          <Button small variant="outline" title={tr.t('lab.tryAgain')} onPress={() => void record()} />
        </Card>
      )}

      <View style={{ flexDirection: 'row', gap: 10 }}>
        <View style={{ flex: 1 }}>
          <Button variant="outline" title={tr.t('common.previous')} disabled={index === 0} onPress={() => setIndex((i) => Math.max(0, i - 1))} />
        </View>
        <View style={{ flex: 1 }}>
          <Button title={tr.t('lab.next')} disabled={index >= phrases.length - 1} onPress={() => setIndex((i) => Math.min(phrases.length - 1, i + 1))} />
        </View>
      </View>

      {today && today.attempts > 0 && (
        <Card>
          <Text weight="bold">{tr.t('lab.today', { count: today.attempts, avg: today.average ?? 0 })}</Text>
        </Card>
      )}
      {weak.length > 0 && (
        <Card style={{ gap: 8 }}>
          <Text weight="black">{tr.t('lab.weakWords')}</Text>
          <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: 8 }}>
            {weak.map((w) => (
              <Chip
                key={`${w.language}:${w.word}`}
                label={`${w.word} ×${w.misses}`}
                onPress={() => {
                  setLang(w.language as LabLanguage);
                  setCustom([w.word]);
                  setIndex(0);
                }}
              />
            ))}
          </View>
          <View style={{ flexDirection: 'row', gap: 8, flexWrap: 'wrap' }}>
            <Button
              small
              variant="outline"
              title={tr.t('lab.practiseAll')}
              onPress={() => {
                const same = weak.filter((w) => w.language === lang).map((w) => w.word);
                if (!same.length) setLang(weak[0]!.language as LabLanguage);
                setCustom(same.length ? same : weak.map((w) => w.word));
                setIndex(0);
              }}
            />
            <Button
              small
              variant="soft"
              title={tr.t('lab.toCards')}
              onPress={async () => {
                try {
                  const res = await api.flashcards.create(
                    weak.map((w) => ({
                      front: w.word,
                      back: tr.t('lab.cardBack', { language: LANGUAGE_NAMES[w.language as LabLanguage] ?? w.language }),
                      deck: tr.t('lab.deck'),
                    })),
                  );
                  toast(tr.t('ai.savedCards', { count: res.items.length }));
                } catch (e) {
                  toastError(e);
                }
              }}
            />
          </View>
        </Card>
      )}
      <Text muted size={12}>
        {tr.t('lab.tip')}
      </Text>
    </ScrollView>
  );
}
