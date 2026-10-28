import { hasPermission, type AdminPermission } from '@qubedu/shared';
import {
  Activity,
  AlertTriangle,
  BadgeCheck,
  BookOpen,
  Flag,
  Megaphone,
  Settings2,
  ShieldCheck,
  ToggleLeft,
  Users,
  GraduationCap,
  Trophy,
  Bot,
  ScrollText,
} from 'lucide-react';
import { Navigate } from 'react-router';
import { PageHeader } from '@/components/ui/States';
import { Tabs, useTabParam } from '@/components/ui/Tabs';
import { useT } from '@/lib/i18n';
import { useSession } from '@/lib/session';
import { AssistantTab, AuditTab, ErrorsTab } from './SystemTabs';
import { ChallengesTab, ContentTab, EducationTab, LibraryTab } from './ContentTabs';
import { FeaturesTab, SiteTab } from './SettingsTabs';
import { OverviewTab, ReportsTab, UsersTab } from './PeopleTabs';
import { VerificationsTab } from './VerificationsTab';

const TABS = [
  { key: 'overview', perm: null, icon: Activity },
  { key: 'users', perm: 'users.view', icon: Users },
  { key: 'reports', perm: 'reports.manage', icon: Flag },
  { key: 'verifications', perm: 'users.view', icon: BadgeCheck },
  { key: 'content', perm: 'content.manage', icon: Megaphone },
  { key: 'education', perm: 'education.manage', icon: GraduationCap },
  { key: 'challenges', perm: 'challenge.manage', icon: Trophy },
  { key: 'library', perm: 'library.manage', icon: BookOpen },
  { key: 'assistant', perm: 'assistant.manage', icon: Bot },
  { key: 'features', perm: 'features.manage', icon: ToggleLeft },
  { key: 'site', perm: 'site.manage', icon: Settings2 },
  { key: 'errors', perm: 'errors.view', icon: AlertTriangle },
  { key: 'audit', perm: 'audit.view', icon: ScrollText },
] as const satisfies readonly { key: string; perm: AdminPermission | null; icon: unknown }[];

type TabKey = (typeof TABS)[number]['key'];
const KEYS = TABS.map((t) => t.key) as readonly TabKey[];

export default function AdminPage() {
  const tr = useT();
  const me = useSession((s) => s.me);
  const [tab, setTab] = useTabParam(KEYS, 'overview');
  if (!me || me.role === 'user') return <Navigate to="/" replace />;
  const allowed = TABS.filter((t) => t.perm === null || hasPermission(me.role, me.permissions, t.perm));
  const active = allowed.some((t) => t.key === tab) ? tab : 'overview';
  return (
    <div className="page space-y-5">
      <PageHeader title={tr.t('admin.title')} icon={<ShieldCheck className="size-6" />} />
      <Tabs
        label={tr.t('admin.title')}
        active={active}
        onChange={setTab}
        tabs={allowed.map((t) => ({ key: t.key, label: tr.t(`admin.tabs.${t.key}`), icon: <t.icon className="size-4" /> }))}
      />
      {active === 'overview' && <OverviewTab />}
      {active === 'users' && <UsersTab />}
      {active === 'reports' && <ReportsTab />}
      {active === 'verifications' && <VerificationsTab />}
      {active === 'content' && <ContentTab />}
      {active === 'education' && <EducationTab />}
      {active === 'challenges' && <ChallengesTab />}
      {active === 'library' && <LibraryTab />}
      {active === 'assistant' && <AssistantTab />}
      {active === 'features' && <FeaturesTab />}
      {active === 'site' && <SiteTab />}
      {active === 'errors' && <ErrorsTab />}
      {active === 'audit' && <AuditTab />}
    </div>
  );
}
