import { PARENTAL_CONTROL_KEYS, type ChildReportDto, type GradeLevel, type ParentalControls } from '@qubedu/shared';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { Check, Mail, Send, ShieldCheck, X } from 'lucide-react';
import { useState } from 'react';
import { GradeLevelSelect } from '@/components/common/GradeLevelSelect';
import { Avatar } from '@/components/ui/Avatar';
import { Button } from '@/components/ui/Button';
import { Input, Select, Switch } from '@/components/ui/Field';
import { api } from '@/lib/api';
import { cx } from '@/lib/cx';
import { useT } from '@/lib/i18n';
import { useSession } from '@/lib/session';
import { toast, toastError } from '@/lib/ui';

/** Student: invite a parent by email. */
export function InviteParent() {
  const tr = useT();
  const qc = useQueryClient();
  const [email, setEmail] = useState('');
  const [busy, setBusy] = useState(false);
  return (
    <section className="card space-y-3 p-4">
      <h2 className="font-black">{tr.t('family.inviteTitle')}</h2>
      <p className="muted text-sm">{tr.t('family.inviteHint')}</p>
      <form
        className="flex flex-wrap items-end gap-2"
        onSubmit={async (e) => {
          e.preventDefault();
          setBusy(true);
          try {
            await api.family.invite(email.trim());
            toast(tr.t('family.inviteSent'));
            setEmail('');
            await qc.invalidateQueries({ queryKey: ['family'] });
          } catch (err) {
            toastError(err);
          } finally {
            setBusy(false);
          }
        }}
      >
        <Input
          type="email"
          label={tr.t('family.parentEmail')}
          value={email}
          dir="ltr"
          wrapperClassName="min-w-56 flex-1"
          onChange={(e) => setEmail(e.target.value)}
        />
        <Button type="submit" icon={<Send className="size-4" />} loading={busy} disabled={!/.+@.+\..+/.test(email)}>
          {tr.t('family.send')}
        </Button>
      </form>
    </section>
  );
}

/** Parent: ask a student to approve the link (by email or username). */
export function RequestChild() {
  const tr = useT();
  const qc = useQueryClient();
  const [who, setWho] = useState('');
  const [busy, setBusy] = useState(false);
  return (
    <section className="card space-y-3 p-4">
      <h2 className="font-black">{tr.t('family.requestTitle')}</h2>
      <p className="muted text-sm">{tr.t('family.requestHint')}</p>
      <form
        className="flex flex-wrap items-end gap-2"
        onSubmit={async (e) => {
          e.preventDefault();
          setBusy(true);
          try {
            await api.family.request(who.trim());
            toast(tr.t('family.requestSent'));
            setWho('');
            await qc.invalidateQueries({ queryKey: ['family'] });
          } catch (err) {
            toastError(err);
          } finally {
            setBusy(false);
          }
        }}
      >
        <Input label={tr.t('family.who')} value={who} dir="ltr" wrapperClassName="min-w-56 flex-1" onChange={(e) => setWho(e.target.value)} />
        <Button type="submit" icon={<Mail className="size-4" />} loading={busy} disabled={who.trim().length < 3}>
          {tr.t('family.send')}
        </Button>
      </form>
    </section>
  );
}

/** Pending links in either direction, with accept / decline / cancel. */
export function FamilyRequests() {
  const tr = useT();
  const qc = useQueryClient();
  const me = useSession((s) => s.me)!;
  const fam = useQuery({ queryKey: ['family'], queryFn: () => api.family.get() });
  const items = fam.data?.requests ?? [];
  if (!items.length) return null;
  const act = async (fn: () => Promise<unknown>) => {
    try {
      await fn();
      await qc.invalidateQueries({ queryKey: ['family'] });
      useSession.getState().setMe(await api.me.get());
    } catch (e) {
      toastError(e);
    }
  };
  return (
    <section className="card space-y-3 p-4">
      <h2 className="font-black">{tr.t('family.requests')}</h2>
      <ul className="space-y-2">
        {items.map((r) => {
          const name = r.person?.displayName ?? r.email ?? '';
          const text = r.child
            ? tr.t('family.approveParent', { name, child: r.child.displayName })
            : r.awaitingGuardian
              ? tr.t('family.waitingParent', { name })
              : r.direction === 'outgoing'
                ? tr.t('family.outgoing', { name })
                : me.accountType === 'parent'
                  ? tr.t('family.incomingChild', { name })
                  : tr.t('family.incoming', { name });
          return (
            <li key={r.id} className="flex flex-wrap items-center gap-2">
              {r.person && <Avatar name={r.person.displayName} url={r.person.avatarUrl} size="sm" />}
              <span className="min-w-0 flex-1 text-sm" dir="auto">
                {text}
              </span>
              {r.direction === 'incoming' && (
                <Button
                  size="sm"
                  icon={<Check className="size-4" />}
                  onClick={() =>
                    void act(async () => {
                      const res = await api.family.acceptRequest(r.id);
                      toast(res.held ? tr.t('family.heldForParent', { name }) : tr.t('family.linked', { name }));
                    })
                  }
                >
                  {tr.t('family.accept')}
                </Button>
              )}
              <Button size="sm" variant="ghost" icon={<X className="size-4" />} onClick={() => void act(() => api.family.removeRequest(r.id))}>
                {r.direction === 'incoming' ? tr.t('family.decline') : tr.t('family.cancel')}
              </Button>
            </li>
          );
        })}
      </ul>
    </section>
  );
}

/** Student: what applies to their account (read-only; the parent changes it). */
export function MyControls() {
  const tr = useT();
  const me = useSession((s) => s.me)!;
  if (me.ageTier === 'adult') return null;
  const c = me.parentalControls;
  return (
    <section className="card space-y-2 p-4">
      <h2 className="flex items-center gap-2 font-black">
        <ShieldCheck className="size-5 text-ok" aria-hidden /> {tr.t('family.myControls')}
      </h2>
      {me.ageTier === 'child' && !me.guardianCount && <p className="muted text-sm">{tr.t('family.myControlsDefault')}</p>}
      <ul className="space-y-1 text-sm">
        <li className="flex justify-between gap-3">
          <span>{tr.t('family.controls.messages')}</span>
          <b>{c.messages === 'classes' ? tr.t('family.controls.messagesClasses') : tr.t('family.controls.messagesKnown')}</b>
        </li>
        {(['publicPosts', 'joinGroups', 'ai', 'aiHints'] as const).map((k) => (
          <li key={k} className="flex justify-between gap-3">
            <span>{tr.t(`family.controls.${k}`)}</span>
            <b className={c[k] ? 'text-ok' : 'text-err'}>{c[k] ? tr.t('family.on') : tr.t('family.off')}</b>
          </li>
        ))}
      </ul>
      <p className="muted text-xs">{tr.t('family.controls.never')}</p>
    </section>
  );
}

/** Parent: change what a child under 18 can do, and correct their school year. */
export function ControlsEditor({ report }: { report: ChildReportDto }) {
  const tr = useT();
  const qc = useQueryClient();
  const [c, setC] = useState<ParentalControls>(report.controls);
  const [grade, setGrade] = useState<GradeLevel | ''>(report.gradeLevel ?? '');
  const [busy, setBusy] = useState(false);
  if (report.ageTier === 'adult') return null;
  const name = report.child.displayName;
  return (
    <section className="card space-y-3 p-4">
      <h2 className="flex items-center gap-2 font-black">
        <ShieldCheck className="size-5 text-ok" aria-hidden /> {tr.t('family.controls.title', { name })}
      </h2>
      <p className="muted text-sm">{tr.t('family.controls.hint')}</p>
      <Select
        label={tr.t('family.controls.messages')}
        value={c.messages}
        onChange={(e) => setC({ ...c, messages: e.target.value as ParentalControls['messages'] })}
        options={[
          { value: 'classes', label: tr.t('family.controls.messagesClasses') },
          { value: 'known', label: tr.t('family.controls.messagesKnown') },
        ]}
      />
      {PARENTAL_CONTROL_KEYS.filter((k) => k !== 'messages').map((k) => (
        <Switch key={k} checked={c[k] as boolean} onChange={(v) => setC({ ...c, [k]: v })} label={tr.t(`family.controls.${k}`)} />
      ))}
      <GradeLevelSelect label={tr.t('family.controls.gradeLevel')} value={grade} onChange={setGrade} />
      <p className="muted text-xs">{tr.t('family.controls.never')}</p>
      <Button
        loading={busy}
        onClick={async () => {
          setBusy(true);
          try {
            const r = await api.family.setControls(report.child.id, { ...c, ...(grade ? { gradeLevel: grade } : {}) });
            setC(r.controls);
            toast(tr.t('family.controls.saved', { name }));
            await qc.invalidateQueries({ queryKey: ['family-child', report.child.id] });
          } catch (e) {
            toastError(e);
          } finally {
            setBusy(false);
          }
        }}
      >
        {tr.t('common.save')}
      </Button>
      <p className={cx('rounded-[var(--radius-control)] bg-soft p-3 text-xs')}>{tr.t('family.limits')}</p>
    </section>
  );
}
