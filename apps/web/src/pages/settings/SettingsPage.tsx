import { DESIGNS, LANGUAGES, LIMITS, SKINS, birthYearChoices, TEXT_SIZES, THEME_MODES, type Me, type NotificationPrefs, type Privacy } from '@qubedu/shared';
import { DESIGN_TOKENS, SKIN_TOKENS } from '@qubedu/tokens';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { Bell, Check, Database, Download, Lock, MonitorSmartphone, Palette, Shield, Trash2, User } from 'lucide-react';
import { useEffect, useState } from 'react';
import { canInstall, promptInstall } from '@/app/pwa';
import { browserPushState, disableBrowserPush, enableBrowserPush, type BrowserPushState } from '@/lib/push';
import { Avatar } from '@/components/ui/Avatar';
import { Button } from '@/components/ui/Button';
import { Input, Select, Switch, Textarea } from '@/components/ui/Field';
import { PageHeader, Spinner } from '@/components/ui/States';
import { Tabs, useTabParam } from '@/components/ui/Tabs';
import { UploadButton } from '@/components/ui/Upload';
import { api, downloadResponse, fileUrl } from '@/lib/api';
import { useAppearance } from '@/lib/appearance';
import { signOut } from '@/lib/auth';
import { cx } from '@/lib/cx';
import { relativeTime } from '@/lib/format';
import { errorMessage, useT } from '@/lib/i18n';
import { useSession } from '@/lib/session';
import { confirmDialog, promptDialog, toast, toastError } from '@/lib/ui';
import { PasswordInput } from '../auth/AuthLayout';

const TABS = ['profile', 'appearance', 'account', 'privacy', 'notifications', 'data'] as const;
const TAB_ICONS = { profile: User, appearance: Palette, account: Lock, privacy: Shield, notifications: Bell, data: Database } as const;
const LANGUAGE_NAMES: Record<string, string> = { ar: 'العربية', en: 'English', fr: 'Français', es: 'Español' };

function Section({ title, children }: { title?: string; children: React.ReactNode }) {
  return (
    <section className="card space-y-4 p-5">
      {title && <h2 className="text-lg font-black">{title}</h2>}
      {children}
    </section>
  );
}

function ProfileTab({ me }: { me: Me }) {
  const tr = useT();
  const [f, setF] = useState({
    displayName: me.displayName,
    username: me.username ?? '',
    bio: me.bio,
    gender: me.gender ?? '',
    educationLevel: me.educationLevel ?? '',
    institution: me.institution ?? '',
    accountType: me.accountType === 'teacher' ? 'teacher' : 'student',
    avatarUrl: me.avatarUrl,
    coverUrl: me.coverUrl,
    birthYear: me.birthYear ? String(me.birthYear) : '',
  });
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const save = async () => {
    setBusy(true);
    setError(null);
    try {
      const next = await api.me.update({
        displayName: f.displayName.trim(),
        username: f.username.trim() || null,
        bio: f.bio.trim(),
        gender: (f.gender || null) as 'male' | 'female' | null,
        educationLevel: f.educationLevel.trim() || null,
        institution: f.institution.trim() || null,
        accountType: f.accountType as 'student' | 'teacher',
        avatarUrl: f.avatarUrl,
        coverUrl: f.coverUrl,
        ...(f.birthYear && !me.birthYear ? { birthYear: Number(f.birthYear) } : {}),
      });
      useSession.getState().setMe(next);
      toast(tr.t('settings.saved'));
    } catch (e) {
      setError(errorMessage(e, tr));
    } finally {
      setBusy(false);
    }
  };
  return (
    <Section>
      <div className="relative">
        <div
          className="surface-gradient h-28 rounded-xl"
          style={f.coverUrl ? { backgroundImage: `url(${fileUrl(f.coverUrl)})`, backgroundSize: 'cover', backgroundPosition: 'center' } : undefined}
        />
        <div className="absolute end-2 top-2">
          <UploadButton size="sm" variant="soft" purpose="cover" imageOnly onUploaded={(r) => setF({ ...f, coverUrl: r.url })}>
            {tr.t('settings.profile.cover')}
          </UploadButton>
        </div>
        <div className="-mt-10 flex items-end gap-3 ps-4">
          <Avatar name={f.displayName} url={f.avatarUrl} size="xl" className="rounded-full ring-4 ring-[var(--card-solid)]" />
          <UploadButton size="sm" variant="outline" purpose="avatar" imageOnly onUploaded={(r) => setF({ ...f, avatarUrl: r.url })}>
            {tr.t('settings.profile.avatar')}
          </UploadButton>
          {f.avatarUrl && (
            <Button size="sm" variant="ghost" onClick={() => setF({ ...f, avatarUrl: null })}>
              {tr.t('common.remove')}
            </Button>
          )}
        </div>
      </div>
      {error && (
        <p role="alert" className="text-err text-sm font-bold">
          {error}
        </p>
      )}
      <div className="grid gap-4 sm:grid-cols-2">
        <Input
          label={tr.t('auth.displayName')}
          value={f.displayName}
          maxLength={LIMITS.displayName.max}
          onChange={(e) => setF({ ...f, displayName: e.target.value })}
        />
        <Input
          label={tr.t('settings.profile.username')}
          dir="ltr"
          value={f.username}
          maxLength={LIMITS.username.max}
          placeholder="username"
          onChange={(e) => setF({ ...f, username: e.target.value.toLowerCase() })}
        />
      </div>
      <Textarea label={tr.t('settings.profile.bio')} value={f.bio} maxLength={LIMITS.bio} onChange={(e) => setF({ ...f, bio: e.target.value })} />
      <div className="grid gap-4 sm:grid-cols-2">
        <Select
          label={tr.t('settings.profile.gender')}
          value={f.gender}
          placeholder="—"
          onChange={(e) => setF({ ...f, gender: e.target.value })}
          options={[
            { value: 'male', label: tr.t('settings.profile.male') },
            { value: 'female', label: tr.t('settings.profile.female') },
          ]}
        />
        <Select
          label={tr.t('settings.profile.accountType')}
          value={f.accountType}
          onChange={(e) => setF({ ...f, accountType: e.target.value as 'student' | 'teacher' })}
          options={[
            { value: 'student', label: tr.t('auth.student') },
            { value: 'teacher', label: tr.t('auth.teacher') },
          ]}
        />
        <Input
          label={tr.t('settings.profile.education')}
          value={f.educationLevel}
          maxLength={80}
          onChange={(e) => setF({ ...f, educationLevel: e.target.value })}
        />
        <Input
          label={tr.t('settings.profile.institution')}
          value={f.institution}
          maxLength={LIMITS.institution}
          onChange={(e) => setF({ ...f, institution: e.target.value })}
        />
        <Select
          label={tr.t('settings.profile.birthYear')}
          hint={me.birthYear ? tr.t('settings.profile.birthYearLocked') : tr.t('auth.birthYearHint')}
          value={f.birthYear}
          disabled={!!me.birthYear}
          placeholder="—"
          onChange={(e) => setF({ ...f, birthYear: e.target.value })}
          options={birthYearChoices().map((y) => ({ value: String(y), label: String(y) }))}
        />
      </div>
      <Button loading={busy} disabled={f.displayName.trim().length < LIMITS.displayName.min} onClick={() => void save()}>
        {tr.t('common.save')}
      </Button>
    </Section>
  );
}

function AppearanceTab() {
  const tr = useT();
  const { appearance: a, update } = useAppearance();
  const mode = a.theme === 'system' ? (matchMedia('(prefers-color-scheme: dark)').matches ? 'dark' : 'light') : a.theme;
  return (
    <div className="space-y-5">
      <Section title={tr.t('settings.appearance.language')}>
        <div className="flex flex-wrap gap-2">
          {LANGUAGES.map((l) => (
            <button
              key={l}
              type="button"
              lang={l}
              aria-pressed={a.language === l}
              className={cx('chip', a.language === l && 'is-active')}
              onClick={() => update({ language: l })}
            >
              {a.language === l && <Check className="size-3.5" />} {LANGUAGE_NAMES[l]}
            </button>
          ))}
        </div>
      </Section>
      <Section title={tr.t('settings.appearance.theme')}>
        <div className="flex flex-wrap gap-2">
          {THEME_MODES.map((m) => (
            <button
              key={m}
              type="button"
              aria-pressed={a.theme === m}
              className={cx('chip', a.theme === m && 'is-active')}
              onClick={() => update({ theme: m })}
            >
              {tr.t(`settings.appearance.themes.${m}`)}
            </button>
          ))}
        </div>
      </Section>
      <Section title={tr.t('settings.appearance.design')}>
        <div className="grid grid-cols-2 gap-3 sm:grid-cols-3">
          {DESIGNS.map((d) => {
            const s = DESIGN_TOKENS[d][mode];
            return (
              <button
                key={d}
                type="button"
                aria-pressed={a.design === d}
                onClick={() => update({ design: d })}
                className={cx('rounded-xl border-2 p-2 text-start transition-colors', a.design === d ? 'border-primary' : 'border-line hover:border-primary')}
              >
                <span className="block h-14 rounded-lg p-2" style={{ background: s.bg, border: `1px solid ${s.border}` }}>
                  <span className="block h-full rounded-md" style={{ background: s.card, borderRadius: DESIGN_TOKENS[d].radiusControl / 2 }} />
                </span>
                <span className="mt-1.5 block text-sm font-bold">{tr.t(`settings.appearance.designs.${d}`)}</span>
              </button>
            );
          })}
        </div>
      </Section>
      <Section title={tr.t('settings.appearance.skin')}>
        <div className="flex flex-wrap gap-3">
          {SKINS.map((s) => {
            const t = SKIN_TOKENS[s];
            return (
              <button
                key={s}
                type="button"
                aria-pressed={a.skin === s}
                aria-label={tr.t(`settings.appearance.skins.${s}`)}
                title={tr.t(`settings.appearance.skins.${s}`)}
                onClick={() => update({ skin: s })}
                className={cx(
                  'grid size-11 place-items-center rounded-full ring-offset-2 ring-offset-[var(--card-solid)] transition-shadow',
                  a.skin === s && 'ring-2 ring-[var(--primary)]',
                )}
                style={{ background: `linear-gradient(135deg, ${t.gradient[0]}, ${t.gradient[1]})`, color: t.onPrimary }}
              >
                {a.skin === s && <Check className="size-5" />}
              </button>
            );
          })}
        </div>
      </Section>
      <Section title={tr.t('settings.appearance.textSize')}>
        <div className="flex flex-wrap gap-2">
          {TEXT_SIZES.map((s) => (
            <button
              key={s}
              type="button"
              aria-pressed={a.textSize === s}
              className={cx('chip', a.textSize === s && 'is-active')}
              onClick={() => update({ textSize: s })}
            >
              {tr.t(`settings.appearance.textSizes.${s}`)}
            </button>
          ))}
        </div>
        <Switch checked={a.reduceMotion} onChange={(v) => update({ reduceMotion: v })} label={tr.t('settings.appearance.reduceMotion')} />
      </Section>
      {canInstall() && (
        <Section title={tr.t('settings.install')}>
          <p className="muted">{tr.t('settings.installDesc')}</p>
          <Button variant="outline" icon={<MonitorSmartphone className="size-4" />} onClick={() => void promptInstall()}>
            {tr.t('settings.install')}
          </Button>
        </Section>
      )}
    </div>
  );
}

function AccountTab({ me }: { me: Me }) {
  const tr = useT();
  const qc = useQueryClient();
  const sessions = useQuery({ queryKey: ['sessions'], queryFn: () => api.auth.sessions() });
  const [pw, setPw] = useState({ current: '', next: '' });
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [goal, setGoal] = useState(String(me.dailyGoalMinutes));
  const zones = typeof Intl.supportedValuesOf === 'function' ? Intl.supportedValuesOf('timeZone') : [me.timezone];
  return (
    <div className="space-y-5">
      <Section title={tr.t('settings.account.email')}>
        <p className="flex flex-wrap items-center gap-2">
          <span dir="ltr" className="font-bold">
            {me.email}
          </span>
          <span className={cx('badge', me.emailVerified ? 'badge-ok' : 'badge-warn')}>
            {me.emailVerified ? tr.t('settings.account.verified') : tr.t('settings.account.notVerified')}
          </span>
          {!me.emailVerified && (
            <Button
              size="sm"
              variant="outline"
              onClick={() =>
                void api.auth
                  .resendVerification()
                  .then(() => toast(tr.t('common.done')))
                  .catch(toastError)
              }
            >
              {tr.t('common.send')}
            </Button>
          )}
        </p>
        <div className="grid gap-4 sm:grid-cols-2">
          <Select
            label={tr.t('settings.account.timezone')}
            value={me.timezone}
            onChange={async (e) => {
              try {
                useSession.getState().setMe(await api.me.prefs({ timezone: e.target.value }));
              } catch (er) {
                toastError(er);
              }
            }}
            options={(zones.includes(me.timezone) ? zones : [me.timezone, ...zones]).map((z) => ({ value: z, label: z }))}
          />
          <Input
            type="number"
            min={5}
            max={600}
            label={tr.t('settings.account.dailyGoal')}
            value={goal}
            onChange={(e) => setGoal(e.target.value)}
            onBlur={async () => {
              const n = Math.max(5, Math.min(600, Math.round(Number(goal) || me.dailyGoalMinutes)));
              setGoal(String(n));
              if (n === me.dailyGoalMinutes) return;
              try {
                useSession.getState().setMe(await api.me.prefs({ dailyGoalMinutes: n }));
              } catch (er) {
                toastError(er);
              }
            }}
          />
        </div>
      </Section>
      <Section title={tr.t('settings.account.changePassword')}>
        <form
          className="max-w-sm space-y-4"
          onSubmit={async (e) => {
            e.preventDefault();
            setBusy(true);
            setError(null);
            try {
              await api.auth.changePassword(pw.current, pw.next);
              setPw({ current: '', next: '' });
              toast(tr.t('settings.account.passwordChanged'));
            } catch (er) {
              setError(errorMessage(er, tr));
            } finally {
              setBusy(false);
            }
          }}
        >
          {error && (
            <p role="alert" className="text-err text-sm font-bold">
              {error}
            </p>
          )}
          <PasswordInput label={tr.t('auth.password')} value={pw.current} onChange={(v) => setPw({ ...pw, current: v })} autoComplete="current-password" />
          <PasswordInput
            label={tr.t('settings.account.changePassword')}
            value={pw.next}
            onChange={(v) => setPw({ ...pw, next: v })}
            autoComplete="new-password"
            showStrength
          />
          <Button type="submit" loading={busy} disabled={!pw.current || pw.next.length < LIMITS.password.min}>
            {tr.t('common.save')}
          </Button>
        </form>
      </Section>
      <Section title={tr.t('settings.account.sessions')}>
        {sessions.isPending ? (
          <Spinner />
        ) : (
          <ul className="divide-y divide-line">
            {sessions.data?.items.map((s) => (
              <li key={s.id} className="flex items-center gap-3 py-3">
                <MonitorSmartphone className="size-5 shrink-0 text-fg-3" />
                <div className="min-w-0 flex-1">
                  <p className="truncate font-bold">
                    {s.client} {s.current && <span className="badge badge-primary ms-1">{tr.t('settings.account.thisDevice')}</span>}
                  </p>
                  <p className="muted truncate text-xs" dir="ltr">
                    {s.userAgent ?? ''} {s.ip ? `· ${s.ip}` : ''} · {relativeTime(s.lastUsedAt, tr)}
                  </p>
                </div>
                {!s.current && (
                  <Button
                    size="sm"
                    variant="outline"
                    onClick={async () => {
                      try {
                        await api.auth.revokeSession(s.id);
                        await qc.invalidateQueries({ queryKey: ['sessions'] });
                      } catch (e) {
                        toastError(e);
                      }
                    }}
                  >
                    {tr.t('settings.account.revoke')}
                  </Button>
                )}
              </li>
            ))}
          </ul>
        )}
        <Button variant="outline" onClick={() => void signOut(true)}>
          {tr.t('settings.account.logoutAll')}
        </Button>
      </Section>
    </div>
  );
}

function PrivacyTab({ me }: { me: Me }) {
  const tr = useT();
  const [p, setP] = useState<Privacy>(me.privacy);
  const save = async (next: Privacy) => {
    const prev = p;
    setP(next);
    try {
      useSession.getState().setMe(await api.me.prefs({ privacy: next }));
      toast(tr.t('settings.saved'));
    } catch (e) {
      setP(prev);
      toastError(e);
    }
  };
  return (
    <Section>
      {me.isMinor && (
        <p className="flex gap-2 rounded-[var(--radius-control)] bg-soft p-3 text-sm">
          <Shield className="mt-0.5 size-4 shrink-0" aria-hidden /> {tr.t('settings.privacy.minorNotice')}
        </p>
      )}
      <Select
        label={tr.t('settings.privacy.profileVisibility')}
        value={p.profileVisibility}
        onChange={(e) => void save({ ...p, profileVisibility: e.target.value as Privacy['profileVisibility'] })}
        options={(['public', 'members'] as const).map((k) => ({ value: k, label: tr.t(`settings.privacy.visibility.${k}`) }))}
      />
      <Select
        label={tr.t('settings.privacy.allowMessages')}
        value={p.allowMessages}
        onChange={(e) => void save({ ...p, allowMessages: e.target.value as Privacy['allowMessages'] })}
        options={(['everyone', 'following', 'none'] as const).map((k) => ({ value: k, label: tr.t(`settings.privacy.messages.${k}`) }))}
      />
      <Switch checked={p.showStats} onChange={(v) => void save({ ...p, showStats: v })} label={tr.t('settings.privacy.showStats')} />
      <Switch checked={p.showOnline} onChange={(v) => void save({ ...p, showOnline: v })} label={tr.t('settings.privacy.showOnline')} />
    </Section>
  );
}

function NotificationsTab({ me }: { me: Me }) {
  const tr = useT();
  const [n, setN] = useState<NotificationPrefs>(me.notificationPrefs);
  const keys = (Object.keys(n) as (keyof NotificationPrefs)[]).filter((k) => k !== 'push');
  return (
    <div className="space-y-5">
      <DevicePush />
      <Section>
        {keys.map((k) => (
          <Switch
            key={k}
            checked={n[k]}
            label={tr.t(`settings.notifications.${k}`)}
            onChange={async (v) => {
              const prev = n;
              const next = { ...n, [k]: v };
              setN(next);
              try {
                useSession.getState().setMe(await api.me.prefs({ notifications: next }));
              } catch (e) {
                setN(prev);
                toastError(e);
              }
            }}
          />
        ))}
      </Section>
    </div>
  );
}

/** "Notifications on this browser": permission + subscription for this device. */
function DevicePush() {
  const tr = useT();
  const [state, setState] = useState<BrowserPushState | null>(null);
  const [busy, setBusy] = useState(false);
  useEffect(() => {
    void browserPushState().then(setState);
  }, []);
  if (state === null) return null;
  const run = async (fn: () => Promise<BrowserPushState>) => {
    setBusy(true);
    try {
      const next = await fn();
      setState(next);
      if (next === 'on') toast(tr.t('settings.push.enabled'));
      if (next === 'denied') toast(tr.t('settings.push.denied'), 'err');
    } catch (e) {
      toastError(e);
    } finally {
      setBusy(false);
    }
  };
  return (
    <Section title={tr.t('settings.push.title')}>
      <p className="muted text-sm">
        {state === 'unsupported' ? tr.t('settings.push.unsupported') : state === 'denied' ? tr.t('settings.push.denied') : tr.t('settings.push.hint')}
      </p>
      {state === 'off' && (
        <Button icon={<Bell className="size-4" />} loading={busy} onClick={() => void run(enableBrowserPush)}>
          {tr.t('settings.push.enable')}
        </Button>
      )}
      {state === 'on' && (
        <Button variant="outline" loading={busy} onClick={() => void run(disableBrowserPush)}>
          {tr.t('settings.push.disable')}
        </Button>
      )}
    </Section>
  );
}

function DataTab() {
  const tr = useT();
  return (
    <div className="space-y-5">
      <Section title={tr.t('settings.data.export')}>
        <p className="muted">{tr.t('settings.data.exportDesc')}</p>
        <Button
          variant="outline"
          icon={<Download className="size-4" />}
          onClick={async () => {
            try {
              await downloadResponse(await api.me.export(), 'qubedu-data.json');
            } catch (e) {
              toastError(e);
            }
          }}
        >
          {tr.t('settings.data.export')}
        </Button>
      </Section>
      <Section title={tr.t('settings.data.delete')}>
        <p className="muted">{tr.t('settings.data.deleteDesc')}</p>
        <Button
          variant="danger"
          icon={<Trash2 className="size-4" />}
          onClick={async () => {
            const password = await promptDialog({
              title: tr.t('settings.data.delete'),
              body: tr.t('settings.data.deleteConfirm'),
              danger: true,
              input: { label: tr.t('auth.password'), type: 'password' },
            });
            if (!password) return;
            if (
              !(await confirmDialog({
                title: tr.t('common.confirmTitle'),
                body: tr.t('settings.data.deleteDesc'),
                danger: true,
                confirmLabel: tr.t('settings.data.delete'),
              }))
            )
              return;
            try {
              await api.me.delete(password);
              toast(tr.t('settings.data.deleted'));
              await signOut();
            } catch (e) {
              toastError(e);
            }
          }}
        >
          {tr.t('settings.data.delete')}
        </Button>
      </Section>
    </div>
  );
}

export default function SettingsPage() {
  const tr = useT();
  const me = useSession((s) => s.me)!;
  const [tab, setTab] = useTabParam(TABS, 'profile');
  return (
    <div className="page-narrow">
      <PageHeader title={tr.t('settings.title')} />
      <Tabs
        className="mb-5"
        active={tab}
        onChange={setTab}
        tabs={TABS.map((k) => {
          const Icon = TAB_ICONS[k];
          return { key: k, label: tr.t(`settings.tabs.${k}`), icon: <Icon className="size-4" /> };
        })}
      />
      {tab === 'profile' && <ProfileTab me={me} />}
      {tab === 'appearance' && <AppearanceTab />}
      {tab === 'account' && <AccountTab me={me} />}
      {tab === 'privacy' && <PrivacyTab me={me} />}
      {tab === 'notifications' && <NotificationsTab me={me} />}
      {tab === 'data' && <DataTab />}
    </div>
  );
}
