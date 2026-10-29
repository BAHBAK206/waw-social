import { LESSON_LENGTHS, type PrivateLessonDto } from '@qubedu/shared';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { Clock, UserRound, Video } from 'lucide-react';
import { useEffect, useState } from 'react';
import { Link } from 'react-router';
import { Button, ButtonLink } from '@/components/ui/Button';
import { Input, Select } from '@/components/ui/Field';
import { Modal } from '@/components/ui/Modal';
import { Tabs, useTabParam } from '@/components/ui/Tabs';
import { EmptyState, PageHeader, QueryState } from '@/components/ui/States';
import { api } from '@/lib/api';
import { cx } from '@/lib/cx';
import { formatDateTime, formatPrice, fromLocalInput } from '@/lib/format';
import { useT } from '@/lib/i18n';
import { useSession } from '@/lib/session';
import { toast, toastError } from '@/lib/ui';

const TABS = ['book', 'mine', 'publish'] as const;

function BookDialog({ lesson, onClose }: { lesson: PrivateLessonDto; onClose: () => void }) {
  const tr = useT();
  const qc = useQueryClient();
  const [phone, setPhone] = useState('');
  const [wallet, setWallet] = useState(false);
  const book = useMutation({
    mutationFn: (body: { method?: 'paymob_card' | 'paymob_wallet'; phone?: string }) => api.lessons.book(lesson.id, body),
    onSuccess: ({ url }) => {
      void qc.invalidateQueries({ queryKey: ['lessons'] });
      if (lesson.priceCents > 0) window.location.assign(url);
      else {
        toast(tr.t('growth.lessons.booked'));
        onClose();
      }
    },
    onError: (e) => {
      void qc.invalidateQueries({ queryKey: ['lessons'] });
      toastError(e);
      onClose();
    },
  });
  const price = formatPrice(lesson.priceCents, lesson.currency, tr);
  return (
    <Modal open onClose={onClose} title={lesson.title}>
      <div className="space-y-3">
        <p className="text-sm">
          <span dir="auto" className="font-bold">
            {lesson.teacher.displayName}
          </span>{' '}
          · {formatDateTime(lesson.startsAt, tr)} · {tr.t('growth.lessons.duration', { count: lesson.durationMin })}
        </p>
        {lesson.priceCents === 0 ? (
          <Button loading={book.isPending} onClick={() => book.mutate({})}>
            {tr.t('growth.lessons.bookFree')}
          </Button>
        ) : (
          <>
            <p className="muted text-sm">{tr.t('growth.lessons.held')}</p>
            <div className="flex flex-wrap items-end gap-2">
              <Button loading={book.isPending && !wallet} onClick={() => book.mutate({ method: 'paymob_card' })}>
                {tr.t('growth.lessons.pay')} · {price}
              </Button>
              {wallet ? (
                <form
                  className="flex flex-wrap items-end gap-2"
                  onSubmit={(e) => {
                    e.preventDefault();
                    book.mutate({ method: 'paymob_wallet', phone: phone.replace(/\s+/g, '') });
                  }}
                >
                  <Input
                    label={tr.t('growth.lessons.walletPhone')}
                    type="tel"
                    dir="ltr"
                    placeholder="01xxxxxxxxx"
                    value={phone}
                    onChange={(e) => setPhone(e.target.value)}
                    wrapperClassName="w-48"
                  />
                  <Button type="submit" disabled={phone.replace(/\D/g, '').length < 10} loading={book.isPending}>
                    {tr.t('growth.lessons.payWallet')}
                  </Button>
                </form>
              ) : (
                <Button variant="outline" onClick={() => setWallet(true)}>
                  {tr.t('growth.lessons.payWallet')}
                </Button>
              )}
            </div>
          </>
        )}
      </div>
    </Modal>
  );
}

function Book() {
  const tr = useT();
  const q = useQuery({ queryKey: ['lessons', 'open'], queryFn: () => api.lessons.open() });
  const [pick, setPick] = useState<PrivateLessonDto | null>(null);
  return (
    <QueryState query={q}>
      {(d) =>
        !d.items.length ? (
          <EmptyState title={tr.t('growth.lessons.noSlots')} />
        ) : (
          <ul className="space-y-2">
            {d.items.map((l) => (
              <li key={l.id} className="card flex flex-wrap items-center gap-3 p-3">
                <UserRound className="size-5 text-primary" aria-hidden />
                <div className="min-w-0 flex-1">
                  <p className="font-bold" dir="auto">
                    {l.title}
                  </p>
                  <p className="muted text-sm">
                    <span dir="auto">{l.teacher.displayName}</span> · {formatDateTime(l.startsAt, tr)} ·{' '}
                    {tr.t('growth.lessons.duration', { count: l.durationMin })}
                  </p>
                </div>
                <span className="badge badge-primary tabular-nums">
                  {l.priceCents === 0 ? tr.t('growth.lessons.free') : formatPrice(l.priceCents, l.currency, tr)}
                </span>
                <Button size="sm" onClick={() => setPick(l)}>
                  {tr.t('growth.lessons.book')}
                </Button>
              </li>
            ))}
            {pick && <BookDialog lesson={pick} onClose={() => setPick(null)} />}
          </ul>
        )
      }
    </QueryState>
  );
}

function Mine() {
  const tr = useT();
  const qc = useQueryClient();
  const q = useQuery({ queryKey: ['lessons', 'mine'], queryFn: () => api.lessons.mine(), refetchInterval: 60_000 });
  const cancel = useMutation({
    mutationFn: (id: string) => api.lessons.cancel(id),
    onSuccess: () => {
      toast(tr.t('growth.lessons.cancelled'));
      void qc.invalidateQueries({ queryKey: ['lessons'] });
    },
    onError: toastError,
  });
  return (
    <QueryState query={q}>
      {(d) =>
        !d.items.length ? (
          <EmptyState title={tr.t('growth.lessons.noneMine')} />
        ) : (
          <ul className="space-y-2">
            {d.items.map((l) => {
              const teacher = l.mine === 'teacher';
              return (
                <li key={l.id} className="card flex flex-wrap items-center gap-3 p-3">
                  <Clock className="size-5 text-primary" aria-hidden />
                  <div className="min-w-0 flex-1">
                    <p className="font-bold" dir="auto">
                      {l.title}
                    </p>
                    <p className="muted text-sm">
                      {formatDateTime(l.startsAt, tr)} · {tr.t('growth.lessons.duration', { count: l.durationMin })} ·{' '}
                      {teacher ? (l.student ? tr.t('growth.lessons.by', { name: l.student.displayName }) : tr.t('growth.lessons.free')) : l.teacher.displayName}
                    </p>
                  </div>
                  {l.status === 'booked' && (
                    <span className={cx('badge', l.payStatus === 'paid' ? 'badge-ok' : 'badge-warn')}>
                      {l.payStatus === 'paid' ? tr.t('growth.lessons.paid') : tr.t('growth.lessons.pending')}
                    </span>
                  )}
                  {l.status === 'open' && <span className="badge">{tr.t('growth.lessons.free')}</span>}
                  {l.roomId && (
                    <ButtonLink to={`/live/${l.roomId}`} size="sm" icon={<Video className="size-4" />}>
                      {tr.t('growth.lessons.join')}
                    </ButtonLink>
                  )}
                  {(teacher || l.payStatus !== 'paid') && (
                    <Button size="sm" variant="ghost" loading={cancel.isPending} onClick={() => cancel.mutate(l.id)}>
                      {teacher ? tr.t('growth.lessons.cancel') : tr.t('growth.lessons.cancelHold')}
                    </Button>
                  )}
                </li>
              );
            })}
          </ul>
        )
      }
    </QueryState>
  );
}

function Publish() {
  const tr = useT();
  const qc = useQueryClient();
  const [f, setF] = useState({ title: '', from: '', to: '', length: 60, price: '0' });
  const start = fromLocalInput(f.from);
  const end = fromLocalInput(f.to);
  const price = Math.round(Number(f.price || 0) * 100);
  const publish = useMutation({
    mutationFn: () => api.lessons.publish({ title: f.title.trim(), start: start!, end: end!, slotMinutes: f.length, priceCents: price }),
    onSuccess: (r) => {
      toast(tr.t('growth.lessons.published', { created: r.created, skipped: r.skipped }));
      void qc.invalidateQueries({ queryKey: ['lessons'] });
    },
    onError: toastError,
  });
  return (
    <form
      className="card max-w-xl space-y-3 p-4"
      onSubmit={(e) => {
        e.preventDefault();
        publish.mutate();
      }}
    >
      <Input label={tr.t('growth.lessons.titleLabel')} value={f.title} maxLength={120} onChange={(e) => setF({ ...f, title: e.target.value })} />
      <div className="grid gap-3 sm:grid-cols-2">
        <Input label={tr.t('growth.lessons.from')} type="datetime-local" value={f.from} onChange={(e) => setF({ ...f, from: e.target.value })} />
        <Input label={tr.t('growth.lessons.to')} type="datetime-local" value={f.to} onChange={(e) => setF({ ...f, to: e.target.value })} />
      </div>
      <div className="grid gap-3 sm:grid-cols-2">
        <Select
          label={tr.t('growth.lessons.length')}
          value={String(f.length)}
          onChange={(e) => setF({ ...f, length: Number(e.target.value) })}
          options={LESSON_LENGTHS.map((m) => ({ value: String(m), label: String(m) }))}
        />
        <Input
          label={tr.t('growth.lessons.priceLabel')}
          type="number"
          min={0}
          step={5}
          value={f.price}
          onChange={(e) => setF({ ...f, price: e.target.value })}
        />
      </div>
      <p className="muted text-xs">{tr.t('growth.lessons.refundNote')}</p>
      <Button type="submit" loading={publish.isPending} disabled={f.title.trim().length < 2 || !start || !end || end <= start}>
        {tr.t('growth.lessons.publish')}
      </Button>
    </form>
  );
}

export default function LessonsPage() {
  const tr = useT();
  const me = useSession((s) => s.me);
  const teacher = me?.accountType === 'teacher';
  const keys = teacher ? TABS : (['book', 'mine'] as const);
  const [tab, setTab] = useTabParam(keys, teacher ? 'mine' : 'book');
  const paid = new URLSearchParams(window.location.search).get('paid');
  useEffect(() => {
    if (paid) toast(tr.t('growth.lessons.booked'));
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);
  return (
    <div className="page mx-auto max-w-3xl space-y-4">
      <PageHeader title={tr.t('growth.lessons.title')} subtitle={tr.t('growth.lessons.subtitle')} icon={<UserRound className="size-6" />} />
      <Tabs
        active={tab}
        onChange={setTab}
        tabs={keys.map((k) => ({
          key: k,
          label: tr.t(k === 'book' ? 'growth.lessons.tabBook' : k === 'mine' ? 'growth.lessons.tabMine' : 'growth.lessons.tabPublish'),
        }))}
      />
      {tab === 'book' && <Book />}
      {tab === 'mine' && <Mine />}
      {tab === 'publish' && teacher && <Publish />}
      <p className="muted text-xs">
        <Link to="/live" className="underline">
          {tr.t('nav.classes')}
        </Link>
      </p>
    </div>
  );
}
