import { COMPLAINT_CATEGORIES, EXTRA_TIME_CHOICES, MOODS, TIME_LIMIT_CHOICES, type ComplaintCategory, type ComplaintStatusDto } from '@qubedu/shared';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { useEffect, useState } from 'react';
import { AppState, View } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { api } from '@/lib/api';
import { useT } from '@/lib/i18n';
import { useSession } from '@/lib/session';
import { useTheme } from '@/lib/theme';
import { toast, toastError } from '@/lib/ui';
import { SelectField } from './kit';
import { Button, Card, Chip, Input, Loading, Text } from './ui';

const MOOD_KEYS = ['wellbeing.mood.l1', 'wellbeing.mood.l2', 'wellbeing.mood.l3', 'wellbeing.mood.l4', 'wellbeing.mood.l5'] as const;
const FACES = ['😞', '🙁', '😐', '🙂', '😄'] as const;

export function MoodCard() {
  const tr = useT();
  const qc = useQueryClient();
  const q = useQuery({ queryKey: ['mood'], queryFn: () => api.wellbeing.mood() });
  const [pick, setPick] = useState<number | null>(null);
  const [note, setNote] = useState('');
  const save = useMutation({
    mutationFn: () => api.wellbeing.saveMood(pick!, note.trim() || undefined),
    onSuccess: () => {
      toast(tr.t('wellbeing.mood.saved'));
      setNote('');
      void qc.invalidateQueries({ queryKey: ['mood'] });
    },
    onError: toastError,
  });
  if (q.isPending) return <Loading />;
  const d = q.data;
  const current = pick ?? d?.today ?? null;
  return (
    <Card style={{ gap: 10 }}>
      <Text weight="black">{tr.t('wellbeing.mood.title')}</Text>
      <Text muted size={13}>
        {tr.t('wellbeing.mood.hint')}
      </Text>
      <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: 8 }}>
        {MOODS.map((m) => (
          <Chip key={m} label={`${FACES[m - 1]} ${tr.t(MOOD_KEYS[m - 1]!)}`} active={current === m} onPress={() => setPick(m)} />
        ))}
      </View>
      <Input placeholder={tr.t('wellbeing.mood.note')} value={note} maxLength={300} onChangeText={setNote} />
      <Button title={tr.t('wellbeing.mood.save')} disabled={pick === null} loading={save.isPending} onPress={() => save.mutate()} />
      {d?.today != null && <Text weight="bold">{tr.t('wellbeing.mood.today', { mood: tr.t(MOOD_KEYS[d.today - 1]!) })}</Text>}
      {!!d?.recent.length && (
        <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: 4 }} accessibilityLabel={tr.t('wellbeing.mood.history')}>
          {d.recent.map((r) => (
            <Text key={r.day} size={22}>
              {FACES[r.mood - 1]}
            </Text>
          ))}
        </View>
      )}
      <Text muted size={12}>
        {tr.t('wellbeing.mood.privacy')}
      </Text>
    </Card>
  );
}

export function SpeakCard() {
  const tr = useT();
  const schools = useQuery({ queryKey: ['schools'], queryFn: () => api.schools.list() });
  const [schoolId, setSchoolId] = useState('');
  const [category, setCategory] = useState<ComplaintCategory>('bullying');
  const [text, setText] = useState('');
  const [code, setCode] = useState<string | null>(null);
  const mine = (schools.data?.items ?? []).filter((s) => !!s.myRole);
  const sid = schoolId || mine[0]?.id || '';
  const send = useMutation({
    mutationFn: () => api.wellbeing.sendComplaint({ schoolId: sid, category, text: text.trim() }),
    onSuccess: (r) => {
      setCode(r.code);
      setText('');
      toast(tr.t('wellbeing.speak.sent'));
    },
    onError: toastError,
  });
  const t = useTheme();
  return (
    <Card style={{ gap: 10 }}>
      <Text weight="black">{tr.t('wellbeing.speak.title')}</Text>
      <Text muted size={13}>
        {tr.t('wellbeing.speak.hint')}
      </Text>
      {schools.isPending ? (
        <Loading />
      ) : !mine.length ? (
        <Text muted>{tr.t('wellbeing.speak.noSchool')}</Text>
      ) : (
        <>
          {code && (
            <View style={{ borderWidth: 2, borderColor: t.primary, borderRadius: 12, padding: 12, alignItems: 'center', gap: 4 }}>
              <Text weight="bold">{tr.t('wellbeing.speak.codeTitle')}</Text>
              <Text weight="black" size={26} selectable style={{ letterSpacing: 4 }}>
                {code}
              </Text>
              <Text muted size={12}>
                {tr.t('wellbeing.speak.codeHint')}
              </Text>
            </View>
          )}
          {mine.length > 1 && (
            <SelectField
              label={tr.t('wellbeing.speak.school')}
              value={sid}
              options={mine.map((s) => ({ value: s.id, label: s.name }))}
              onChange={(v) => setSchoolId(v)}
            />
          )}
          <SelectField
            label={tr.t('wellbeing.speak.category')}
            value={category}
            options={COMPLAINT_CATEGORIES.map((c) => ({ value: c, label: tr.t(`wellbeing.speak.${c}`) }))}
            onChange={(v) => v && setCategory(v)}
          />
          <Input label={tr.t('wellbeing.speak.text')} value={text} multiline numberOfLines={4} maxLength={2000} onChangeText={setText} />
          <Button title={tr.t('wellbeing.speak.send')} disabled={text.trim().length < 5} loading={send.isPending} onPress={() => send.mutate()} />
        </>
      )}
    </Card>
  );
}

export function TrackCard() {
  const tr = useT();
  const [code, setCode] = useState('');
  const [res, setRes] = useState<ComplaintStatusDto | null>(null);
  const check = useMutation({ mutationFn: () => api.wellbeing.complaintStatus(code.trim()), onSuccess: setRes, onError: toastError });
  return (
    <Card style={{ gap: 10 }}>
      <Text weight="black">{tr.t('wellbeing.track.title')}</Text>
      <Input label={tr.t('wellbeing.track.code')} value={code} autoCapitalize="characters" onChangeText={setCode} />
      <Button variant="soft" title={tr.t('wellbeing.track.check')} disabled={code.trim().length < 6} loading={check.isPending} onPress={() => check.mutate()} />
      {res && (
        <View style={{ gap: 4 }}>
          <Text weight="bold">{tr.t(`wellbeing.track.${res.status}`)}</Text>
          <Text>{res.reply ? `${tr.t('wellbeing.track.reply')} ${res.reply}` : tr.t('wellbeing.track.noReply')}</Text>
        </View>
      )}
    </Card>
  );
}

/** Parent's daily limit for one child, with today's use and extra-time buttons. */
export function TimeLimitCard({ childId, name }: { childId: string; name: string }) {
  const tr = useT();
  const qc = useQueryClient();
  const q = useQuery({ queryKey: ['usage', childId], queryFn: () => api.wellbeing.childUsage(childId) });
  const setLimit = useMutation({
    mutationFn: (minutes: number | null) => api.wellbeing.setLimit(childId, minutes),
    onSuccess: () => {
      toast(tr.t('wellbeing.timeLimit.saved'));
      void qc.invalidateQueries({ queryKey: ['usage', childId] });
    },
    onError: toastError,
  });
  const extra = useMutation({
    mutationFn: (minutes: number) => api.wellbeing.extraTime(childId, minutes),
    onSuccess: (u) => {
      toast(tr.t('wellbeing.timeLimit.extraSent'));
      qc.setQueryData(['usage', childId], u);
    },
    onError: toastError,
  });
  const u = q.data;
  return (
    <Card style={{ gap: 10 }}>
      <Text weight="black">{tr.t('wellbeing.timeLimit.title', { name })}</Text>
      <Text muted size={13}>
        {tr.t('wellbeing.timeLimit.hint')}
      </Text>
      <SelectField
        label={tr.t('wellbeing.timeLimit.title', { name })}
        value={u?.limit ? String(u.limit) : ''}
        options={[
          { value: '', label: tr.t('wellbeing.timeLimit.none') },
          ...TIME_LIMIT_CHOICES.map((m) => ({ value: String(m), label: tr.t('wellbeing.timeLimit.minutes', { count: m }) })),
        ]}
        onChange={(v) => setLimit.mutate(v ? Number(v) : null)}
      />
      {u?.limit ? (
        <>
          <Text weight="bold">{tr.t('wellbeing.timeLimit.used', { used: u.used, limit: u.limit + u.bonus })}</Text>
          <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: 8, alignItems: 'center' }}>
            <Text muted size={12}>
              {tr.t('wellbeing.timeLimit.extra')}
            </Text>
            {EXTRA_TIME_CHOICES.map((m) => (
              <Button
                key={m}
                small
                variant="soft"
                title={tr.t('wellbeing.timeLimit.plus', { count: m })}
                loading={extra.isPending}
                onPress={() => extra.mutate(m)}
              />
            ))}
          </View>
        </>
      ) : null}
    </Card>
  );
}

/** Counts a minute of use while the app is in front and locks it when the daily limit is reached. */
export function UsageGuard() {
  const tr = useT();
  const t = useTheme();
  const qc = useQueryClient();
  const me = useSession((s) => s.me);
  const q = useQuery({ queryKey: ['usage'], queryFn: () => api.wellbeing.usage(), enabled: !!me, staleTime: 60_000 });
  const limited = !!q.data?.limit;
  const locked = !!q.data?.locked;
  useEffect(() => {
    if (!limited) return;
    const timer = setInterval(() => {
      if (AppState.currentState !== 'active') return;
      api.wellbeing
        .ping()
        .then((u) => qc.setQueryData(['usage'], u))
        .catch(() => undefined);
    }, 60_000);
    return () => clearInterval(timer);
  }, [limited, qc]);
  useEffect(() => {
    if (!locked) return;
    const timer = setInterval(() => void qc.invalidateQueries({ queryKey: ['usage'] }), 60_000);
    const sub = AppState.addEventListener('change', (s) => s === 'active' && void qc.invalidateQueries({ queryKey: ['usage'] }));
    return () => {
      clearInterval(timer);
      sub.remove();
    };
  }, [locked, qc]);
  if (!locked) return null;
  return (
    <View
      accessibilityViewIsModal
      style={{
        position: 'absolute',
        top: 0,
        bottom: 0,
        left: 0,
        right: 0,
        backgroundColor: t.bg,
        alignItems: 'center',
        justifyContent: 'center',
        padding: 28,
        gap: 12,
        zIndex: 999,
      }}
    >
      <Ionicons name="lock-closed" size={48} color={t.primary} />
      <Text weight="black" size={22} style={{ textAlign: 'center' }}>
        {tr.t('wellbeing.timeLimit.lockedTitle')}
      </Text>
      <Text style={{ textAlign: 'center' }}>{tr.t('wellbeing.timeLimit.lockedBody')}</Text>
      <Text muted size={13} style={{ textAlign: 'center' }}>
        {tr.t('wellbeing.timeLimit.lockedAsk')}
      </Text>
    </View>
  );
}
