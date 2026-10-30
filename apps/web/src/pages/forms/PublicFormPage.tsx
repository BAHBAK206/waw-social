import type { FormDto, FormQuestion } from '@qubedu/shared';
import { useQuery } from '@tanstack/react-query';
import { CheckCircle2, Star } from 'lucide-react';
import { useMemo, useState } from 'react';
import { Link, useParams } from 'react-router';
import { NoticeCard } from '@/components/layout/Banners';
import { Button } from '@/components/ui/Button';
import { Input } from '@/components/ui/Field';
import { ErrorState, Spinner } from '@/components/ui/States';
import { api } from '@/lib/api';
import { cx } from '@/lib/cx';
import { errorMessage, useT } from '@/lib/i18n';
import { useSession } from '@/lib/session';

type Value = string | string[] | number;

function seeded<T>(list: T[], seed: string): T[] {
  let h = 2166136261;
  for (const c of seed) h = Math.imul(h ^ c.charCodeAt(0), 16777619);
  const rand = () => ((h = Math.imul(h ^ (h >>> 15), 2246822507)), ((h >>> 0) % 1000) / 1000);
  return [...list].sort(() => rand() - 0.5);
}

function Field({ q, value, onChange, error }: { q: FormQuestion; value: Value | undefined; onChange: (v: Value) => void; error?: string }) {
  const tr = useT();
  const label = (
    <>
      {q.title}
      {q.required && (
        <span className="text-err" aria-hidden>
          {' '}
          *
        </span>
      )}
    </>
  );
  if (q.type === 'section')
    return (
      <div className="px-1 pt-4">
        <h2 className="text-xl font-black" dir="auto">
          {q.title}
        </h2>
        {q.description && (
          <p className="muted" dir="auto">
            {q.description}
          </p>
        )}
      </div>
    );
  const wrap = (children: React.ReactNode) => (
    <fieldset className={cx('card space-y-3 p-4', error && 'border-err')}>
      <legend className="sr-only">{q.title}</legend>
      <p className="font-bold" dir="auto">
        {label}
      </p>
      {q.description && (
        <p className="muted -mt-2 text-sm" dir="auto">
          {q.description}
        </p>
      )}
      {children}
      {error && (
        <p className="text-sm text-err" role="alert">
          {error}
        </p>
      )}
    </fieldset>
  );
  switch (q.type) {
    case 'short':
    case 'email':
    case 'number':
    case 'date':
    case 'time':
      return wrap(
        <input
          className="input max-w-md"
          type={q.type === 'short' ? 'text' : q.type}
          dir="auto"
          value={(value as string) ?? ''}
          onChange={(e) => onChange(q.type === 'number' && e.target.value !== '' ? Number(e.target.value) : e.target.value)}
          aria-label={q.title}
          required={q.required}
        />,
      );
    case 'paragraph':
      return wrap(<textarea className="input" dir="auto" value={(value as string) ?? ''} onChange={(e) => onChange(e.target.value)} aria-label={q.title} />);
    case 'single':
      return wrap(
        <div className="space-y-2">
          {q.options.map((o) => (
            <label key={o} className="flex min-h-11 cursor-pointer items-center gap-3">
              <input type="radio" name={q.id} className="size-5 accent-[var(--primary)]" checked={value === o} onChange={() => onChange(o)} />
              <span dir="auto">{o}</span>
            </label>
          ))}
        </div>,
      );
    case 'multiple': {
      const cur = Array.isArray(value) ? value : [];
      return wrap(
        <div className="space-y-2">
          {q.options.map((o) => (
            <label key={o} className="flex min-h-11 cursor-pointer items-center gap-3">
              <input
                type="checkbox"
                className="size-5 accent-[var(--primary)]"
                checked={cur.includes(o)}
                onChange={(e) => onChange(e.target.checked ? [...cur, o] : cur.filter((x) => x !== o))}
              />
              <span dir="auto">{o}</span>
            </label>
          ))}
        </div>,
      );
    }
    case 'dropdown':
      return wrap(
        <select className="input max-w-md" value={(value as string) ?? ''} onChange={(e) => onChange(e.target.value)} aria-label={q.title}>
          <option value="">{tr.t('common.select')}</option>
          {q.options.map((o) => (
            <option key={o} value={o}>
              {o}
            </option>
          ))}
        </select>,
      );
    case 'scale': {
      const min = q.min ?? 1;
      const max = q.max ?? 5;
      return wrap(
        <div className="flex flex-wrap gap-2" role="radiogroup" aria-label={q.title}>
          {Array.from({ length: max - min + 1 }, (_, i) => min + i).map((n) => (
            <button
              key={n}
              type="button"
              role="radio"
              aria-checked={value === n}
              className={cx(
                'grid size-11 place-items-center rounded-full border font-bold',
                value === n ? 'border-primary bg-primary text-on-primary' : 'border-line hover:border-primary',
              )}
              onClick={() => onChange(n)}
            >
              {n}
            </button>
          ))}
        </div>,
      );
    }
    case 'rating':
      return wrap(
        <div className="flex gap-1" role="radiogroup" aria-label={q.title}>
          {Array.from({ length: q.max ?? 5 }, (_, i) => i + 1).map((n) => (
            <button key={n} type="button" role="radio" aria-checked={value === n} aria-label={String(n)} className="p-1" onClick={() => onChange(n)}>
              <Star className={cx('size-8', typeof value === 'number' && n <= value ? 'fill-[var(--gold)] text-[var(--gold)]' : 'text-fg-3')} />
            </button>
          ))}
        </div>,
      );
  }
}

export default function PublicFormPage() {
  const { slug = '' } = useParams();
  const tr = useT();
  const me = useSession((s) => s.me);
  const q = useQuery({ queryKey: ['form-public', slug], queryFn: () => api.forms.public(slug), retry: false });
  const [answers, setAnswers] = useState<Record<string, Value>>({});
  const [email, setEmail] = useState('');
  const [errors, setErrors] = useState<Record<string, string>>({});
  const [busy, setBusy] = useState(false);
  const [done, setDone] = useState<{ score: number | null; message: string } | null>(null);
  const [submitError, setSubmitError] = useState<string | null>(null);

  const form: FormDto | undefined = q.data;
  const questions = useMemo(
    () =>
      form?.settings.shuffleQuestions
        ? seeded(
            form.questions.filter((x) => x.type !== 'section'),
            form.id,
          )
        : (form?.questions ?? []),
    [form],
  );

  if (q.isPending) return <Spinner className="py-24" />;
  if (q.error || !form)
    return (
      <div className="page-narrow">
        <ErrorState error={q.error ?? new Error('x')} />
      </div>
    );
  const closedByDeadline = !!form.settings.deadline && form.settings.deadline < Date.now();
  const closed = !form.settings.acceptingResponses || closedByDeadline;

  const submit = async (e: React.FormEvent) => {
    e.preventDefault();
    const errs: Record<string, string> = {};
    for (const x of questions) {
      if (x.type === 'section' || !x.required) continue;
      const v = answers[x.id];
      if (v === undefined || v === '' || (Array.isArray(v) && !v.length)) errs[x.id] = tr.t('forms.required');
    }
    setErrors(errs);
    if (Object.keys(errs).length) return document.getElementById(`q-${Object.keys(errs)[0]}`)?.scrollIntoView({ behavior: 'smooth', block: 'center' });
    setBusy(true);
    setSubmitError(null);
    try {
      const clean = Object.fromEntries(Object.entries(answers).filter(([, v]) => v !== '' && !(Array.isArray(v) && !v.length)));
      const res = await api.forms.respond(slug, { answers: clean as Record<string, string | string[] | number>, email: email.trim() || undefined });
      setDone({ score: res.score, message: res.confirmationMessage });
    } catch (err) {
      setSubmitError(errorMessage(err, tr));
    } finally {
      setBusy(false);
    }
  };

  return (
    <div className="page-narrow space-y-4">
      <header className="card overflow-hidden">
        <div className="h-3" style={{ background: form.settings.color }} />
        <div className="p-5">
          <h1 className="text-3xl font-black" dir="auto">
            {form.title}
          </h1>
          {form.description && (
            <p className="mt-2 whitespace-pre-wrap text-fg-2" dir="auto">
              {form.description}
            </p>
          )}
          <p className="muted mt-2 text-sm">{form.owner.displayName}</p>
        </div>
      </header>
      {done ? (
        <div className="card space-y-3 p-8 text-center">
          <CheckCircle2 className="mx-auto size-12 text-ok" />
          <p className="text-xl font-black">{done.message || tr.t('forms.submitted')}</p>
          {done.score !== null && <p className="text-3xl font-black tabular-nums">{tr.t('forms.yourScore', { score: done.score })}</p>}
        </div>
      ) : closed ? (
        <NoticeCard tone="warn">{closedByDeadline ? tr.t('errors.form_deadline_passed') : tr.t('forms.closed')}</NoticeCard>
      ) : form.alreadyResponded ? (
        <NoticeCard tone="info">{tr.t('forms.alreadyResponded')}</NoticeCard>
      ) : form.settings.requireSignIn && !me ? (
        <NoticeCard tone="info">
          {tr.t('errors.sign_in_required')}{' '}
          <Link to={`/login?next=${encodeURIComponent(`/f/${slug}`)}`} className="link">
            {tr.t('nav.signIn')}
          </Link>
        </NoticeCard>
      ) : (
        <form onSubmit={submit} className="space-y-4" noValidate>
          {submitError && <NoticeCard tone="err">{submitError}</NoticeCard>}
          {form.settings.collectEmail && <Input type="email" label={tr.t('auth.email')} value={email} onChange={(e) => setEmail(e.target.value)} required />}
          {questions.map((x) => (
            <div key={x.id} id={`q-${x.id}`}>
              <Field
                q={x}
                value={answers[x.id]}
                error={errors[x.id]}
                onChange={(v) => {
                  setAnswers((a) => ({ ...a, [x.id]: v }));
                  setErrors((er) => ({ ...er, [x.id]: '' }));
                }}
              />
            </div>
          ))}
          <Button type="submit" size="lg" loading={busy} style={{ background: form.settings.color }}>
            {tr.t('forms.submit')}
          </Button>
        </form>
      )}
    </div>
  );
}
