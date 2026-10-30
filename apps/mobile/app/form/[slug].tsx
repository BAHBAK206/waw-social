import { Ionicons } from '@expo/vector-icons';
import type { FormQuestion } from '@qubedu/shared';
import { useQuery } from '@tanstack/react-query';
import { Stack, useLocalSearchParams } from 'expo-router';
import { useState } from 'react';
import { Pressable, View } from 'react-native';
import { Screen } from '@/components/Screen';
import { DateField, SelectField } from '@/components/kit';
import { Button, Card, Empty, ErrorView, Input, Loading, Text } from '@/components/ui';
import { api } from '@/lib/api';
import { errorMessage, useT } from '@/lib/i18n';
import { useSession } from '@/lib/session';
import { useTheme } from '@/lib/theme';

type Value = string | string[] | number;

function Choice({ label, on, multi, onPress }: { label: string; on: boolean; multi?: boolean; onPress: () => void }) {
  const t = useTheme();
  return (
    <Pressable
      onPress={onPress}
      accessibilityRole={multi ? 'checkbox' : 'radio'}
      accessibilityState={{ checked: on }}
      style={{ flexDirection: 'row', alignItems: 'center', gap: 10, minHeight: 44 }}
    >
      <Ionicons name={multi ? (on ? 'checkbox' : 'square-outline') : on ? 'radio-button-on' : 'radio-button-off'} size={22} color={on ? t.primary : t.text3} />
      <Text style={{ flex: 1 }}>{label}</Text>
    </Pressable>
  );
}

function Question({ q, value, onChange, error }: { q: FormQuestion; value: Value | undefined; onChange: (v: Value) => void; error?: string }) {
  const tr = useT();
  const t = useTheme();
  if (q.type === 'section')
    return (
      <View style={{ gap: 4, marginTop: 8 }}>
        <Text weight="black" size={18}>
          {q.title}
        </Text>
        {q.description ? <Text muted>{q.description}</Text> : null}
      </View>
    );
  let body: React.ReactNode = null;
  switch (q.type) {
    case 'short':
    case 'email':
    case 'number':
      body = (
        <Input
          value={value === undefined ? '' : String(value)}
          keyboardType={q.type === 'email' ? 'email-address' : q.type === 'number' ? 'numeric' : 'default'}
          autoCapitalize={q.type === 'email' ? 'none' : 'sentences'}
          onChangeText={(v) => onChange(q.type === 'number' && v !== '' && Number.isFinite(Number(v)) ? Number(v) : v)}
        />
      );
      break;
    case 'paragraph':
      body = <Input value={(value as string) ?? ''} onChangeText={onChange} multiline style={{ minHeight: 100, textAlignVertical: 'top' }} />;
      break;
    case 'date':
    case 'time':
      body = <DateField label={q.title} mode={q.type} value={(value as string) ?? ''} onChange={onChange} />;
      break;
    case 'single':
      body = q.options.map((o) => <Choice key={o} label={o} on={value === o} onPress={() => onChange(o)} />);
      break;
    case 'multiple': {
      const cur = Array.isArray(value) ? value : [];
      body = q.options.map((o) => (
        <Choice key={o} multi label={o} on={cur.includes(o)} onPress={() => onChange(cur.includes(o) ? cur.filter((x) => x !== o) : [...cur, o])} />
      ));
      break;
    }
    case 'dropdown':
      body = (
        <SelectField
          label={q.title}
          value={(value as string) ?? ''}
          placeholder={tr.t('common.select')}
          options={q.options.map((o) => ({ value: o, label: o }))}
          onChange={onChange}
        />
      );
      break;
    case 'scale': {
      const min = q.min ?? 1;
      const max = q.max ?? 5;
      body = (
        <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: 8 }}>
          {Array.from({ length: max - min + 1 }, (_, i) => min + i).map((n) => (
            <Pressable
              key={n}
              onPress={() => onChange(n)}
              accessibilityRole="radio"
              accessibilityState={{ checked: value === n }}
              style={{
                width: 44,
                height: 44,
                borderRadius: 22,
                alignItems: 'center',
                justifyContent: 'center',
                borderWidth: 1.5,
                borderColor: value === n ? t.primary : t.border,
                backgroundColor: value === n ? t.primary : 'transparent',
              }}
            >
              <Text weight="bold" color={value === n ? t.onPrimary : undefined}>
                {n}
              </Text>
            </Pressable>
          ))}
        </View>
      );
      break;
    }
    case 'rating':
      body = (
        <View style={{ flexDirection: 'row', gap: 6 }}>
          {Array.from({ length: q.max ?? 5 }, (_, i) => i + 1).map((n) => (
            <Pressable
              key={n}
              onPress={() => onChange(n)}
              accessibilityRole="radio"
              accessibilityLabel={String(n)}
              accessibilityState={{ checked: value === n }}
              hitSlop={4}
            >
              <Ionicons
                name={typeof value === 'number' && n <= value ? 'star' : 'star-outline'}
                size={32}
                color={typeof value === 'number' && n <= value ? t.gold : t.text3}
              />
            </Pressable>
          ))}
        </View>
      );
      break;
  }
  return (
    <Card style={{ gap: 8, borderColor: error ? t.err : t.border }}>
      <Text weight="bold">
        {q.title}
        {q.required ? <Text color={t.err}> *</Text> : null}
      </Text>
      {q.description ? (
        <Text muted size={13}>
          {q.description}
        </Text>
      ) : null}
      {body}
      {error ? (
        <Text size={12} color={t.err}>
          {error}
        </Text>
      ) : null}
    </Card>
  );
}

export default function PublicFormScreen() {
  const { slug } = useLocalSearchParams<{ slug: string }>();
  const tr = useT();
  const t = useTheme();
  const authed = useSession((s) => s.status === 'authed');
  const q = useQuery({ queryKey: ['form-public', slug], queryFn: () => api.forms.public(slug!), retry: false });
  const [answers, setAnswers] = useState<Record<string, Value>>({});
  const [email, setEmail] = useState('');
  const [errors, setErrors] = useState<Record<string, string>>({});
  const [busy, setBusy] = useState(false);
  const [done, setDone] = useState<{ score: number | null; message: string } | null>(null);
  const [submitError, setSubmitError] = useState<string | null>(null);
  if (q.isPending) return <Loading />;
  if (q.error || !q.data) return <ErrorView onRetry={() => void q.refetch()} />;
  const form = q.data;
  const closed = !form.settings.acceptingResponses || (!!form.settings.deadline && form.settings.deadline < Date.now());

  const submit = async () => {
    const errs: Record<string, string> = {};
    for (const x of form.questions) {
      if (x.type === 'section' || !x.required) continue;
      const v = answers[x.id];
      if (v === undefined || v === '' || (Array.isArray(v) && !v.length)) errs[x.id] = tr.t('forms.required');
    }
    setErrors(errs);
    if (Object.keys(errs).length) return;
    setBusy(true);
    setSubmitError(null);
    try {
      const clean = Object.fromEntries(Object.entries(answers).filter(([, v]) => v !== '' && !(Array.isArray(v) && !v.length)));
      const res = await api.forms.respond(slug!, { answers: clean, email: email.trim() || undefined });
      setDone({ score: res.score, message: res.confirmationMessage });
    } catch (e) {
      setSubmitError(errorMessage(e));
    } finally {
      setBusy(false);
    }
  };

  return (
    <Screen>
      <Stack.Screen options={{ title: form.title }} />
      <Card style={{ gap: 6, borderTopWidth: 6, borderTopColor: form.settings.color }}>
        <Text weight="black" size={22}>
          {form.title}
        </Text>
        {form.description ? <Text muted>{form.description}</Text> : null}
        <Text muted size={12}>
          {form.owner.displayName}
        </Text>
      </Card>
      {done ? (
        <Card style={{ alignItems: 'center', gap: 10, padding: 24 }}>
          <Ionicons name="checkmark-circle" size={48} color={t.ok} />
          <Text weight="black" size={18} style={{ textAlign: 'center' }}>
            {done.message || tr.t('forms.submitted')}
          </Text>
          {done.score !== null && <Text weight="bold">{tr.t('forms.yourScore', { score: done.score })}</Text>}
        </Card>
      ) : form.alreadyResponded && form.settings.oneResponsePerUser ? (
        <Empty icon="checkmark-done-outline" title={tr.t('forms.alreadyResponded')} />
      ) : closed ? (
        <Empty icon="lock-closed-outline" title={tr.t('forms.closed')} />
      ) : form.settings.requireSignIn && !authed ? (
        <Empty icon="log-in-outline" title={tr.t('errors.sign_in_required')} />
      ) : (
        <>
          {form.settings.collectEmail && (
            <Input label={tr.t('auth.email')} value={email} onChangeText={setEmail} keyboardType="email-address" autoCapitalize="none" />
          )}
          {form.questions.map((x) => (
            <Question key={x.id} q={x} value={answers[x.id]} error={errors[x.id]} onChange={(v) => setAnswers((a) => ({ ...a, [x.id]: v }))} />
          ))}
          {submitError ? <Text color={t.err}>{submitError}</Text> : null}
          <Button title={tr.t('forms.submit')} loading={busy} onPress={() => void submit()} />
        </>
      )}
    </Screen>
  );
}
