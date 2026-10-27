import {
  detectTextLanguage,
  LAB_LANGUAGES,
  LAB_SET_IDS,
  PRONUNCIATION_SETS,
  scorePronunciation,
  type LabLanguage,
  type LabSetId,
  type PronunciationScore,
} from '@qubedu/shared';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { AudioLines, ChevronLeft, ChevronRight, Mic, RotateCcw, Snail, Square, Volume2 } from 'lucide-react';
import { useEffect, useMemo, useRef, useState } from 'react';
import { NoticeCard } from '@/components/layout/Banners';
import { Button } from '@/components/ui/Button';
import { ProgressRing } from '@/components/ui/Charts';
import { Textarea } from '@/components/ui/Field';
import { PageHeader } from '@/components/ui/States';
import { Tabs } from '@/components/ui/Tabs';
import { api } from '@/lib/api';
import { useAppearance } from '@/lib/appearance';
import { cx } from '@/lib/cx';
import { relativeTime } from '@/lib/format';
import { useT } from '@/lib/i18n';
import { canRecognize, canSpeak, listen, speak, stopSpeaking, useSpeech, type Listening } from '@/lib/speech';
import { celebrate, toastError } from '@/lib/ui';

const LANGUAGE_NAMES: Record<LabLanguage, string> = { ar: 'العربية', en: 'English', fr: 'Français', es: 'Español' };
type Source = 'sets' | 'cards' | 'custom';

function feedbackKey(score: number) {
  return score >= 90 ? 'excellent' : score >= 70 ? 'good' : score >= 40 ? 'almost' : 'again';
}

export default function LabPage() {
  const tr = useT();
  const qc = useQueryClient();
  const uiLang = useAppearance((s) => s.appearance.language);
  const [lang, setLang] = useState<LabLanguage>(uiLang);
  const [source, setSource] = useState<Source>('sets');
  const [setId, setSetId] = useState<LabSetId>('basics');
  const [custom, setCustom] = useState('');
  const [customPhrases, setCustomPhrases] = useState<string[]>([]);
  const [index, setIndex] = useState(0);
  const [state, setState] = useState<'idle' | 'listening' | 'scoring'>('idle');
  const [partial, setPartial] = useState('');
  const [result, setResult] = useState<(PronunciationScore & { heard: string; xpEarned: number }) | null>(null);
  const [error, setError] = useState<string | null>(null);
  const session = useRef<Listening | null>(null);
  const rate = useSpeech((s) => s.rate);
  const setRate = useSpeech((s) => s.setRate);
  const speakingId = useSpeech((s) => s.speakingId);

  const cards = useQuery({ queryKey: ['flashcards', 'lab'], queryFn: () => api.flashcards.list(), enabled: source === 'cards' });
  const stats = useQuery({ queryKey: ['lab', 'stats'], queryFn: () => api.practice.pronunciationStats() });

  const phrases = useMemo(() => {
    if (source === 'sets') return PRONUNCIATION_SETS[lang][setId];
    if (source === 'custom') return customPhrases;
    // Flashcards: practise the side written in the chosen language.
    const out: string[] = [];
    for (const c of cards.data?.items ?? []) {
      for (const side of [c.front, c.back]) if (side.trim().length <= 160 && detectTextLanguage(side, lang) === lang) out.push(side.trim());
    }
    return [...new Set(out)].slice(0, 60);
  }, [source, lang, setId, customPhrases, cards.data]);

  const phrase = phrases[Math.min(index, Math.max(0, phrases.length - 1))] ?? '';

  // Reset the attempt when the phrase changes.
  useEffect(() => {
    setResult(null);
    setPartial('');
    setError(null);
  }, [phrase]);
  useEffect(() => setIndex(0), [lang, source, setId, customPhrases]);
  useEffect(
    () => () => {
      session.current?.stop();
      stopSpeaking();
    },
    [],
  );

  const record = async () => {
    if (state === 'listening') {
      session.current?.stop();
      return;
    }
    setError(null);
    setResult(null);
    setPartial('');
    setState('listening');
    const s = listen(lang, setPartial);
    session.current = s;
    let heard = '';
    try {
      heard = await s.result;
    } catch (e) {
      setState('idle');
      const code = (e as Error).message;
      setError(code === 'not-allowed' || code === 'service-not-allowed' ? tr.t('lab.micDenied') : tr.t('lab.noRecognition'));
      return;
    }
    session.current = null;
    if (!heard) {
      setState('idle');
      setError(tr.t('lab.noSpeech'));
      return;
    }
    setState('scoring');
    // Show the local score at once; the server re-scores and awards XP.
    const local = scorePronunciation(phrase, heard);
    setResult({ ...local, heard, xpEarned: 0 });
    try {
      const r = await api.practice.pronunciation({ language: lang, phrase, heard });
      setResult({ ...r, heard });
      if (r.xpEarned) celebrate({});
      void qc.invalidateQueries({ queryKey: ['lab', 'stats'] });
    } catch (e) {
      toastError(e);
    } finally {
      setState('idle');
    }
  };

  const recognitionOk = canRecognize();
  const today = stats.data?.today;

  return (
    <div className="page grid gap-6 lg:grid-cols-[minmax(0,1fr)_20rem]">
      <div className="min-w-0 space-y-5">
        <PageHeader title={tr.t('lab.title')} subtitle={tr.t('lab.subtitle')} icon={<AudioLines className="size-6" />} />

        <section className="card space-y-4 p-4" aria-label={tr.t('lab.language')}>
          <div className="flex flex-wrap items-center gap-2">
            <span className="field-label !mb-0 me-1">{tr.t('lab.language')}</span>
            {LAB_LANGUAGES.map((l) => (
              <button key={l} type="button" lang={l} aria-pressed={lang === l} className={cx('chip', lang === l && 'is-active')} onClick={() => setLang(l)}>
                {LANGUAGE_NAMES[l]}
              </button>
            ))}
          </div>
          <Tabs
            label={tr.t('lab.source')}
            active={source}
            onChange={setSource}
            tabs={(['sets', 'cards', 'custom'] as const).map((k) => ({ key: k, label: tr.t(`lab.sources.${k}`) }))}
          />
          {source === 'sets' && (
            <div className="flex flex-wrap gap-2">
              {LAB_SET_IDS.map((id) => (
                <button key={id} type="button" aria-pressed={setId === id} className={cx('chip', setId === id && 'is-active')} onClick={() => setSetId(id)}>
                  {tr.t(`lab.sets.${id}`)}
                </button>
              ))}
            </div>
          )}
          {source === 'custom' && (
            <div className="space-y-2">
              <Textarea
                value={custom}
                onChange={(e) => setCustom(e.target.value)}
                placeholder={tr.t('lab.customPlaceholder')}
                dir="auto"
                maxLength={2000}
                aria-label={tr.t('lab.customPlaceholder')}
              />
              <Button
                size="sm"
                variant="soft"
                disabled={!custom.trim()}
                onClick={() => {
                  // Split into sentences so each one can be practised and scored on its own.
                  const parts = custom
                    .split(/(?<=[.!?؟。])\s+|\n+/)
                    .map((p) => p.trim())
                    .filter(Boolean)
                    .slice(0, 40);
                  setCustomPhrases(parts);
                  setLang(detectTextLanguage(custom, lang));
                }}
              >
                {tr.t('lab.practiseThis')}
              </Button>
            </div>
          )}
          {source === 'cards' && cards.data && !phrases.length && <p className="muted">{tr.t('lab.noCards')}</p>}
        </section>

        {!recognitionOk && <NoticeCard tone="warn">{tr.t('lab.noRecognition')}</NoticeCard>}

        {phrase && (
          <section className="card space-y-5 p-6 text-center" aria-live="polite">
            <p className="muted text-sm">{tr.t('lab.phraseOf', { n: index + 1, total: phrases.length })}</p>
            <p className="text-3xl leading-relaxed font-black" dir="auto" lang={lang}>
              {result
                ? result.words.map((w, i) => (
                    <span
                      key={i}
                      className={cx(
                        'mx-1 inline-block rounded-md px-1',
                        w.ok ? 'text-ok' : 'bg-[color-mix(in_srgb,var(--err)_12%,transparent)] text-err underline decoration-wavy',
                      )}
                    >
                      {w.word}
                    </span>
                  ))
                : phrase}
            </p>

            <div className="flex flex-wrap items-center justify-center gap-2">
              {canSpeak() && (
                <>
                  <Button
                    variant="outline"
                    icon={speakingId === 'lab' ? <Square className="size-4" /> : <Volume2 className="size-4" />}
                    onClick={() => (speakingId === 'lab' ? stopSpeaking() : void speak(phrase, { lang, id: 'lab' }))}
                  >
                    {speakingId === 'lab' ? tr.t('lab.stop') : tr.t('lab.listen')}
                  </Button>
                  <Button variant="ghost" icon={<Snail className="size-4" />} onClick={() => void speak(phrase, { lang, id: 'lab-slow', rate: 0.65 })}>
                    {tr.t('lab.listenSlow')}
                  </Button>
                </>
              )}
              {recognitionOk && (
                <Button
                  size="lg"
                  variant={state === 'listening' ? 'danger' : 'primary'}
                  loading={state === 'scoring'}
                  icon={state === 'listening' ? <Square className="size-5" /> : <Mic className="size-5" />}
                  aria-pressed={state === 'listening'}
                  onClick={() => void record()}
                >
                  {state === 'listening' ? tr.t('lab.stopListening') : tr.t('lab.speak')}
                </Button>
              )}
            </div>
            {state === 'listening' && (
              <p className="text-primary font-bold" role="status">
                <span className="me-2 inline-block size-2.5 animate-pulse rounded-full bg-err-fill" aria-hidden />
                {partial || tr.t('lab.listening')}
              </p>
            )}
            {error && <NoticeCard tone="warn">{error}</NoticeCard>}
            {result && (
              <div className="mx-auto max-w-md space-y-3">
                <div className="flex items-center justify-center gap-4">
                  <ProgressRing value={result.score} size={84} label={tr.t('lab.score')}>
                    <span className="text-xl font-black tabular-nums">{result.score}%</span>
                  </ProgressRing>
                  <div className="text-start">
                    <p className="font-black">{tr.t(`lab.feedback.${feedbackKey(result.score)}`)}</p>
                    {result.xpEarned > 0 && <p className="text-primary text-sm font-bold">{tr.t('lab.xp', { xp: result.xpEarned })}</p>}
                  </div>
                </div>
                <p className="muted text-sm" dir="auto">
                  {tr.t('lab.heard')}: “{result.heard}”
                </p>
                {result.words.some((w) => !w.ok) && (
                  <div className="flex flex-wrap justify-center gap-2">
                    <span className="muted text-sm">{tr.t('lab.missed')}:</span>
                    {result.words
                      .filter((w) => !w.ok)
                      .map((w, i) => (
                        <button key={i} type="button" className="chip" lang={lang} onClick={() => void speak(w.word, { lang, rate: 0.7 })}>
                          <Volume2 className="size-3.5" aria-hidden /> {w.word}
                        </button>
                      ))}
                  </div>
                )}
              </div>
            )}
            <div className="flex items-center justify-between border-t border-line pt-4">
              <Button variant="ghost" icon={<ChevronLeft className="size-4 flip-rtl" />} disabled={index === 0} onClick={() => setIndex(index - 1)}>
                {tr.t('common.previous')}
              </Button>
              {result && (
                <Button variant="ghost" icon={<RotateCcw className="size-4" />} onClick={() => setResult(null)}>
                  {tr.t('lab.tryAgain')}
                </Button>
              )}
              <Button variant="soft" disabled={index >= phrases.length - 1} onClick={() => setIndex(index + 1)}>
                {tr.t('lab.next')} <ChevronRight className="size-4 flip-rtl" />
              </Button>
            </div>
            <p className="muted text-xs">{tr.t('lab.tip')}</p>
          </section>
        )}
      </div>

      <aside className="space-y-4">
        <section className="card space-y-2 p-4">
          <h2 className="font-black">{tr.t('lab.speed')}</h2>
          <input
            type="range"
            min={0.5}
            max={1.5}
            step={0.1}
            value={rate}
            className="w-full accent-[var(--primary)]"
            aria-label={tr.t('lab.speed')}
            onChange={(e) => setRate(Number(e.target.value))}
          />
          <p className="muted text-sm tabular-nums">{rate.toFixed(1)}×</p>
        </section>
        {today && (
          <section className="card p-4">
            <p className="font-bold">{tr.t('lab.today', { count: today.attempts, avg: today.average ?? 0 })}</p>
            {today.xp > 0 && <p className="text-primary text-sm font-bold">{tr.t('lab.xp', { xp: today.xp })}</p>}
          </section>
        )}
        {!!stats.data?.weakWords.length && (
          <section className="card space-y-2 p-4">
            <h2 className="font-black">{tr.t('lab.weakWords')}</h2>
            <div className="flex flex-wrap gap-2">
              {stats.data.weakWords.map((w) => (
                <button
                  key={`${w.language}:${w.word}`}
                  type="button"
                  className="chip"
                  lang={w.language}
                  onClick={() => {
                    setSource('custom');
                    setCustom(w.word);
                    setCustomPhrases([w.word]);
                    setLang(w.language as LabLanguage);
                  }}
                >
                  {w.word} <span className="muted text-xs">×{w.misses}</span>
                </button>
              ))}
            </div>
          </section>
        )}
        {!!stats.data?.recent.length && (
          <section className="card p-4">
            <h2 className="mb-2 font-black">{tr.t('lab.recent')}</h2>
            <ul className="space-y-2 text-sm">
              {stats.data.recent.slice(0, 8).map((r) => (
                <li key={r.id} className="flex items-center gap-2">
                  <span className={cx('w-10 font-black tabular-nums', r.score >= 70 ? 'text-ok' : 'text-warn')}>{r.score}%</span>
                  <span className="min-w-0 flex-1 truncate" dir="auto" lang={r.language}>
                    {r.phrase}
                  </span>
                  <span className="muted text-xs">{relativeTime(r.createdAt, tr)}</span>
                </li>
              ))}
            </ul>
          </section>
        )}
      </aside>
    </div>
  );
}
