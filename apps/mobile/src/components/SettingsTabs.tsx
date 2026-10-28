import { Ionicons } from '@expo/vector-icons';
import { birthYearChoices, type GradeLevel } from '@qubedu/shared';
import { useQuery } from '@tanstack/react-query';
import * as Clipboard from 'expo-clipboard';
import * as ImagePicker from 'expo-image-picker';
import * as Sharing from 'expo-sharing';
import { File, Paths } from 'expo-file-system';
import { useRouter } from 'expo-router';
import { useEffect, useState, type ReactNode } from 'react';
import { Linking, View } from 'react-native';
import { FamilyCodeCard } from '@/components/Family';
import { TeacherVerificationCard } from '@/components/TeacherVerification';
import { FamilyRequestsCard, GradeLevelField, InviteParentCard, MyControlsCard } from '@/components/Linking';
import { Badge, Segmented, SelectField, SwitchRow } from '@/components/kit';
import { Avatar, Button, Card, Input, Loading, SectionTitle, Text } from '@/components/ui';
import { api, uploadFile } from '@/lib/api';
import { relativeTime } from '@/lib/format';
import { useT } from '@/lib/i18n';
import { queryClient } from '@/lib/query';
import { phonePushState, registerPhonePush, unregisterPhonePush, type PhonePushState } from '@/lib/push';
import { useSession } from '@/lib/session';
import { useTheme } from '@/lib/theme';
import { confirm, toast, toastError } from '@/lib/ui';
import { PhoneAlertsCard } from './PhoneAlerts';

type Tab = 'profile' | 'appearance' | 'account' | 'privacy' | 'notifications' | 'family' | 'data';

function Profile() {
  const tr = useT();
  const me = useSession((s) => s.me)!;
  const patchMe = useSession((s) => s.patchMe);
  const [form, setForm] = useState({
    displayName: me.displayName,
    username: me.username ?? '',
    bio: me.bio,
    institution: me.institution ?? '',
    educationLevel: me.educationLevel ?? '',
    gender: (me.gender ?? '') as 'male' | 'female' | '',
    birthYear: me.birthYear ? String(me.birthYear) : '',
    gradeLevel: (me.gradeLevel ?? '') as GradeLevel | '',
  });
  const gradeLocked = me.accountType === 'student' && me.guardianCount > 0;
  const [busy, setBusy] = useState(false);
  const save = async () => {
    setBusy(true);
    try {
      const next = await api.me.update({
        displayName: form.displayName.trim(),
        username: form.username.trim() || null,
        bio: form.bio.trim(),
        institution: form.institution.trim() || null,
        educationLevel: form.educationLevel.trim() || null,
        gender: form.gender || null,
        ...(form.birthYear && !me.birthYear ? { birthYear: Number(form.birthYear) } : {}),
        ...(me.accountType === 'student' && !gradeLocked && form.gradeLevel !== (me.gradeLevel ?? '') ? { gradeLevel: form.gradeLevel || null } : {}),
      });
      patchMe(next);
      toast(tr.t('settings.saved'));
    } catch (e) {
      toastError(e);
    } finally {
      setBusy(false);
    }
  };
  return (
    <View style={{ gap: 12 }}>
      <View style={{ alignItems: 'center', gap: 8 }}>
        <Avatar name={me.displayName} url={me.avatarUrl} size={88} />
        <Button
          small
          variant="outline"
          icon="camera-outline"
          title={tr.t('settings.profile.avatar')}
          onPress={async () => {
            const r = await ImagePicker.launchImageLibraryAsync({ mediaTypes: ['images'], quality: 0.8, allowsEditing: true, aspect: [1, 1] });
            if (r.canceled || !r.assets[0]) return;
            try {
              const a = r.assets[0];
              const up = await uploadFile({ uri: a.uri, name: a.fileName ?? 'avatar.jpg', mimeType: a.mimeType ?? 'image/jpeg' }, 'avatar');
              patchMe(await api.me.update({ avatarUrl: up.url }));
            } catch (e) {
              toastError(e);
            }
          }}
        />
      </View>
      <Input label={tr.t('auth.displayName')} value={form.displayName} onChangeText={(v) => setForm({ ...form, displayName: v })} />
      <Input
        label={tr.t('settings.profile.username')}
        value={form.username}
        autoCapitalize="none"
        autoCorrect={false}
        onChangeText={(v) => setForm({ ...form, username: v })}
      />
      <Input label={tr.t('settings.profile.bio')} value={form.bio} onChangeText={(v) => setForm({ ...form, bio: v })} multiline />
      <Input label={tr.t('settings.profile.institution')} value={form.institution} onChangeText={(v) => setForm({ ...form, institution: v })} />
      <Input label={tr.t('settings.profile.education')} value={form.educationLevel} onChangeText={(v) => setForm({ ...form, educationLevel: v })} />
      {me.birthYear ? (
        <Input label={tr.t('settings.profile.birthYear')} value={String(me.birthYear)} editable={false} />
      ) : (
        <SelectField
          label={tr.t('settings.profile.birthYear')}
          value={form.birthYear}
          placeholder="—"
          onChange={(v) => setForm({ ...form, birthYear: v })}
          options={birthYearChoices().map((y) => ({ value: String(y), label: String(y) }))}
        />
      )}
      <Text muted size={12}>
        {me.birthYear ? tr.t('settings.profile.birthYearLocked') : tr.t('auth.birthYearHint')}
      </Text>
      {me.accountType === 'student' ? (
        gradeLocked ? (
          <>
            <Input label={tr.t('stages.label')} value={me.gradeLevel ? tr.t(`stages.grades.${me.gradeLevel}`) : '—'} editable={false} />
            <Text muted size={12}>
              {tr.t('errors.ask_parent')}
            </Text>
          </>
        ) : (
          <GradeLevelField value={form.gradeLevel} onChange={(v) => setForm({ ...form, gradeLevel: v })} />
        )
      ) : null}
      <SelectField
        label={tr.t('settings.profile.gender')}
        value={form.gender}
        placeholder="—"
        onChange={(v) => setForm({ ...form, gender: v })}
        options={[
          { value: 'male', label: tr.t('settings.profile.male') },
          { value: 'female', label: tr.t('settings.profile.female') },
        ]}
      />
      <Button title={tr.t('common.save')} loading={busy} disabled={form.displayName.trim().length < 2} onPress={() => void save()} />
    </View>
  );
}

function Account() {
  const tr = useT();
  const me = useSession((s) => s.me)!;
  const patchMe = useSession((s) => s.patchMe);
  const sessions = useQuery({ queryKey: ['auth', 'sessions'], queryFn: () => api.auth.sessions() });
  const [goal, setGoal] = useState(me.dailyGoalMinutes);
  const [current, setCurrent] = useState('');
  const [next, setNext] = useState('');
  const [busy, setBusy] = useState(false);
  return (
    <View style={{ gap: 12 }}>
      <TeacherVerificationCard />
      <Card style={{ gap: 6 }}>
        <Text weight="bold">{me.email}</Text>
        <Badge tone={me.emailVerified ? 'ok' : 'warn'} label={me.emailVerified ? tr.t('settings.account.verified') : tr.t('settings.account.notVerified')} />
      </Card>
      <Card style={{ gap: 8 }}>
        <Text weight="bold">{tr.t('settings.account.dailyGoal')}</Text>
        <View style={{ flexDirection: 'row', alignItems: 'center', gap: 10 }}>
          <Button small variant="outline" title="−" onPress={() => setGoal((g) => Math.max(10, g - 10))} />
          <Text weight="black" size={20} style={{ minWidth: 60, textAlign: 'center' }}>
            {goal}
          </Text>
          <Button small variant="outline" title="+" onPress={() => setGoal((g) => Math.min(600, g + 10))} />
          <View style={{ flex: 1 }} />
          <Button
            small
            title={tr.t('common.save')}
            disabled={goal === me.dailyGoalMinutes}
            onPress={async () => {
              try {
                patchMe(await api.me.prefs({ dailyGoalMinutes: goal }));
                void queryClient.invalidateQueries({ queryKey: ['dashboard'] });
                toast(tr.t('settings.saved'));
              } catch (e) {
                toastError(e);
              }
            }}
          />
        </View>
      </Card>
      <SectionTitle>{tr.t('settings.account.changePassword')}</SectionTitle>
      <Input label={tr.t('auth.currentPassword')} value={current} onChangeText={setCurrent} secureTextEntry autoComplete="current-password" />
      <Input label={tr.t('auth.newPassword')} value={next} onChangeText={setNext} secureTextEntry autoComplete="new-password" />
      <Button
        variant="soft"
        title={tr.t('settings.account.changePassword')}
        loading={busy}
        disabled={!current || next.length < 8}
        onPress={async () => {
          setBusy(true);
          try {
            await api.auth.changePassword(current, next);
            setCurrent('');
            setNext('');
            toast(tr.t('settings.account.passwordChanged'));
          } catch (e) {
            toastError(e);
          } finally {
            setBusy(false);
          }
        }}
      />
      <SectionTitle>{tr.t('settings.account.sessions')}</SectionTitle>
      {sessions.isPending ? (
        <Loading />
      ) : (
        (sessions.data?.items ?? []).map((s) => (
          <Card key={s.id} style={{ flexDirection: 'row', alignItems: 'center', gap: 10 }}>
            <View style={{ flex: 1 }}>
              <Text weight="bold">
                {s.client}
                {s.current ? ` · ${tr.t('settings.account.thisDevice')}` : ''}
              </Text>
              <Text muted size={12} numberOfLines={1}>
                {relativeTime(s.lastUsedAt, tr)}
                {s.userAgent ? ` · ${s.userAgent}` : ''}
              </Text>
            </View>
            {!s.current && (
              <Button
                small
                variant="ghost"
                title={tr.t('settings.account.revoke')}
                onPress={async () => {
                  try {
                    await api.auth.revokeSession(s.id);
                    await sessions.refetch();
                  } catch (e) {
                    toastError(e);
                  }
                }}
              />
            )}
          </Card>
        ))
      )}
      <Button
        variant="outline"
        icon="log-out-outline"
        title={tr.t('settings.account.logoutAll')}
        onPress={async () => {
          if (!(await confirm(tr.t('settings.account.logoutAll'), { danger: true }))) return;
          try {
            await unregisterPhonePush();
            await api.auth.logoutAll();
            queryClient.clear();
          } catch (e) {
            toastError(e);
          }
        }}
      />
      <Button
        variant="outline"
        icon="log-out-outline"
        title={tr.t('nav.signOut')}
        onPress={async () => {
          if (!(await confirm(tr.t('nav.signOut')))) return;
          try {
            await unregisterPhonePush();
            await api.auth.logout();
            queryClient.clear();
          } catch (e) {
            toastError(e);
          }
        }}
      />
    </View>
  );
}

function Privacy() {
  const tr = useT();
  const t = useTheme();
  const me = useSession((s) => s.me)!;
  const patchMe = useSession((s) => s.patchMe);
  const set = async (privacy: Partial<typeof me.privacy>) => {
    try {
      patchMe(await api.me.prefs({ privacy }));
    } catch (e) {
      toastError(e);
    }
  };
  return (
    <View style={{ gap: 12 }}>
      {me.isMinor ? (
        <Card style={{ flexDirection: 'row', gap: 8 }}>
          <Ionicons name="shield-checkmark-outline" size={20} color={t.primary} />
          <Text size={13} style={{ flex: 1 }}>
            {tr.t('settings.privacy.minorNotice')}
          </Text>
        </Card>
      ) : null}
      <SelectField
        label={tr.t('settings.privacy.profileVisibility')}
        value={me.privacy.profileVisibility}
        onChange={(v) => v && void set({ profileVisibility: v })}
        options={(['public', 'members'] as const).map((v) => ({ value: v, label: tr.t(`settings.privacy.visibility.${v}`) }))}
      />
      <SelectField
        label={tr.t('settings.privacy.allowMessages')}
        value={me.privacy.allowMessages}
        onChange={(v) => v && void set({ allowMessages: v })}
        options={(['everyone', 'following', 'none'] as const).map((v) => ({ value: v, label: tr.t(`settings.privacy.messages.${v}`) }))}
      />
      <SwitchRow label={tr.t('settings.privacy.showStats')} value={me.privacy.showStats} onChange={(v) => void set({ showStats: v })} />
      <SwitchRow label={tr.t('settings.privacy.showOnline')} value={me.privacy.showOnline} onChange={(v) => void set({ showOnline: v })} />
      <BlockedPeople />
    </View>
  );
}

function BlockedPeople() {
  const tr = useT();
  const q = useQuery({ queryKey: ['me', 'blocks'], queryFn: () => api.me.blocks() });
  return (
    <Card style={{ gap: 8, marginTop: 8 }}>
      <Text weight="bold">{tr.t('settings.privacy.blockedTitle')}</Text>
      <Text muted size={13}>
        {tr.t('settings.privacy.blockedHint')}
      </Text>
      {q.data && !q.data.items.length ? (
        <Text muted size={13}>
          {tr.t('settings.privacy.blockedNone')}
        </Text>
      ) : null}
      {q.data?.items.map((u) => (
        <View key={u.id} style={{ flexDirection: 'row', alignItems: 'center', gap: 8 }}>
          <Avatar name={u.displayName} url={u.avatarUrl} size={32} />
          <Text style={{ flex: 1 }} numberOfLines={1}>
            {u.displayName}
          </Text>
          <Button
            small
            variant="outline"
            title={tr.t('common.unblock')}
            onPress={async () => {
              try {
                await api.users.unblock(u.id);
                await q.refetch();
              } catch (e) {
                toastError(e);
              }
            }}
          />
        </View>
      ))}
    </Card>
  );
}

function Notifications() {
  const tr = useT();
  const me = useSession((s) => s.me)!;
  const patchMe = useSession((s) => s.patchMe);
  const keys = ['follows', 'comments', 'reactions', 'messages', 'groups', 'school', 'live', 'system'] as const;
  const [device, setDevice] = useState<PhonePushState | null>(null);
  const [busy, setBusy] = useState(false);
  useEffect(() => {
    void phonePushState().then(setDevice);
  }, []);
  return (
    <View style={{ gap: 4 }}>
      <Card style={{ gap: 8, marginBottom: 8 }}>
        <Text weight="bold">{tr.t('settings.push.title')}</Text>
        <Text muted size={13}>
          {device === 'denied' ? tr.t('settings.push.denied') : device === 'unsupported' ? tr.t('settings.push.unsupported') : tr.t('settings.push.appHint')}
        </Text>
        {device === 'off' || device === 'denied' ? (
          <Button
            small
            icon="notifications-outline"
            title={tr.t('settings.push.enable')}
            loading={busy}
            onPress={async () => {
              setBusy(true);
              const next = await registerPhonePush(true);
              setBusy(false);
              setDevice(next);
              if (next === 'on') toast(tr.t('settings.push.enabled'));
              else if (next === 'denied') void Linking.openSettings();
            }}
          />
        ) : null}
        <SwitchRow
          label={tr.t('settings.notifications.push')}
          value={me.notificationPrefs.push}
          onChange={async (v) => {
            try {
              patchMe(await api.me.prefs({ notifications: { push: v } }));
            } catch (e) {
              toastError(e);
            }
          }}
        />
      </Card>
      {keys.map((k) => (
        <SwitchRow
          key={k}
          label={tr.t(`settings.notifications.${k}`)}
          value={me.notificationPrefs[k]}
          onChange={async (v) => {
            try {
              patchMe(await api.me.prefs({ notifications: { [k]: v } }));
            } catch (e) {
              toastError(e);
            }
          }}
        />
      ))}
    </View>
  );
}

/** Private iCal link: homework, exams, sessions and live classes in the phone's calendar app. */
function CalendarSync() {
  const tr = useT();
  const q = useQuery({ queryKey: ['me', 'calendar'], queryFn: () => api.me.calendar(), staleTime: Infinity });
  const url = q.data?.url;
  return (
    <Card style={{ gap: 8 }}>
      <Text weight="bold">{tr.t('settings.calendar.title')}</Text>
      <Text muted size={13}>
        {tr.t('settings.calendar.hint')}
      </Text>
      {!url ? (
        <Loading />
      ) : (
        <>
          <Text selectable size={12} style={{ writingDirection: 'ltr', textAlign: 'left' }} numberOfLines={2}>
            {url}
          </Text>
          <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: 8 }}>
            <Button
              small
              icon="calendar-outline"
              title={tr.t('settings.calendar.apple')}
              onPress={() => void Linking.openURL(url.replace(/^https?:/, 'webcal:')).catch(toastError)}
            />
            <Button
              small
              variant="soft"
              icon="logo-google"
              title={tr.t('settings.calendar.google')}
              onPress={() => void Linking.openURL(`https://calendar.google.com/calendar/r?cid=${encodeURIComponent(url.replace(/^https?:/, 'webcal:'))}`)}
            />
            <Button
              small
              variant="outline"
              icon="copy-outline"
              title={tr.t('settings.calendar.copy')}
              onPress={async () => {
                await Clipboard.setStringAsync(url);
                toast(tr.t('common.copied'));
              }}
            />
            <Button
              small
              variant="ghost"
              icon="refresh-outline"
              title={tr.t('settings.calendar.reset')}
              onPress={async () => {
                if (!(await confirm(tr.t('settings.calendar.resetConfirm'), { danger: true }))) return;
                try {
                  queryClient.setQueryData(['me', 'calendar'], await api.me.resetCalendar());
                  toast(tr.t('settings.calendar.resetDone'));
                } catch (e) {
                  toastError(e);
                }
              }}
            />
          </View>
          <Text muted size={11}>
            {tr.t('settings.calendar.private')}
          </Text>
        </>
      )}
    </Card>
  );
}

function Data() {
  const tr = useT();
  const [password, setPassword] = useState('');
  const [busy, setBusy] = useState(false);
  return (
    <View style={{ gap: 12 }}>
      <CalendarSync />
      <Card style={{ gap: 8 }}>
        <Text weight="bold">{tr.t('settings.data.export')}</Text>
        <Text muted size={13}>
          {tr.t('settings.data.exportDesc')}
        </Text>
        <Button
          variant="soft"
          icon="download-outline"
          title={tr.t('settings.data.export')}
          loading={busy}
          onPress={async () => {
            setBusy(true);
            try {
              const res = await api.me.export();
              const file = new File(Paths.cache, `qubedu-export-${Date.now()}.json`);
              file.write(await res.text());
              await Sharing.shareAsync(file.uri, { mimeType: 'application/json' });
            } catch (e) {
              toastError(e);
            } finally {
              setBusy(false);
            }
          }}
        />
      </Card>
      <Card style={{ gap: 8 }}>
        <Text weight="bold">{tr.t('settings.data.delete')}</Text>
        <Text muted size={13}>
          {tr.t('settings.data.deleteDesc')}
        </Text>
        <Input label={tr.t('settings.data.deleteConfirm')} value={password} onChangeText={setPassword} secureTextEntry />
        <Button
          variant="danger"
          title={tr.t('settings.data.delete')}
          disabled={!password}
          onPress={async () => {
            if (!(await confirm(tr.t('settings.data.delete'), { danger: true }))) return;
            try {
              await api.me.delete(password);
              toast(tr.t('settings.data.deleted'));
              queryClient.clear();
              await api.auth.logout().catch(() => undefined);
            } catch (e) {
              toastError(e);
            }
          }}
        />
      </Card>
    </View>
  );
}

function FamilyTab() {
  const tr = useT();
  const router = useRouter();
  const me = useSession((s) => s.me)!;
  if (me.accountType === 'student')
    return (
      <View style={{ gap: 12 }}>
        <FamilyRequestsCard />
        <MyControlsCard />
        <FamilyCodeCard />
        <InviteParentCard />
      </View>
    );
  return (
    <View style={{ gap: 12 }}>
      <Card style={{ gap: 8 }}>
        <Text muted>{tr.t('family.parentsHint')}</Text>
        <Button variant="soft" icon="people-outline" title={tr.t('family.open')} onPress={() => router.push('/family' as never)} />
      </Card>
      {me.accountType === 'parent' ? <PhoneAlertsCard /> : null}
    </View>
  );
}

export function SettingsTabs({ appearance }: { appearance: ReactNode }) {
  const tr = useT();
  const [tab, setTab] = useState<Tab>('profile');
  const tabs: Tab[] = ['profile', 'appearance', 'account', 'privacy', 'notifications', 'family', 'data'];
  return (
    <View style={{ gap: 14 }}>
      <Segmented tabs={tabs.map((k) => ({ key: k, label: tr.t(`settings.tabs.${k}`) }))} value={tab} onChange={setTab} />
      {tab === 'profile' && <Profile />}
      {tab === 'appearance' && appearance}
      {tab === 'account' && <Account />}
      {tab === 'privacy' && <Privacy />}
      {tab === 'notifications' && <Notifications />}
      {tab === 'family' && <FamilyTab />}
      {tab === 'data' && <Data />}
    </View>
  );
}
