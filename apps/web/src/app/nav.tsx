import {
  BOTTOM_NAV_BY_ACCOUNT,
  FEATURE_CATEGORIES,
  FEATURES,
  NAV_ORDER,
  featureMode,
  shownTo,
  type AccountType,
  type FeatureCategory,
  type FeatureControlMap,
  type FeatureId,
} from '@qubedu/shared';
import {
  AudioLines,
  Bell,
  Bookmark,
  Aperture,
  Bot,
  CalendarDays,
  ChartColumn,
  Clapperboard,
  ClipboardCheck,
  Compass,
  Film,
  Vote,
  CalendarClock,
  CalendarRange,
  Calculator,
  Camera,
  CircleDot,
  ClipboardList,
  Download,
  FileText,
  Flame,
  Globe,
  GraduationCap,
  Hand,
  HeartHandshake,
  Award,
  Map as MapIcon,
  Medal,
  Store,
  House,
  Info,
  Layers,
  LayoutGrid,
  Library,
  LifeBuoy,
  ListChecks,
  ListTodo,
  Mail,
  MessageCircle,
  MessagesSquare,
  Mic,
  MonitorUp,
  MoonStar,
  Newspaper,
  Palette,
  PenTool,
  Radio,
  School,
  ScrollText,
  Search,
  Settings,
  Share2,
  Shield,
  Sparkles,
  Timer,
  Trophy,
  Upload,
  User,
  Users,
  UsersRound,
  Video,
  type LucideIcon,
} from 'lucide-react';

export const ICONS: Record<string, LucideIcon> = {
  home: House,
  newspaper: Newspaper,
  'list-checks': ListChecks,
  sparkles: Sparkles,
  bot: Bot,
  'clipboard-list': ClipboardList,
  library: Library,
  'file-text': FileText,
  'graduation-cap': GraduationCap,
  school: School,
  video: Video,
  'calendar-clock': CalendarClock,
  users: Users,
  trophy: Trophy,
  'users-round': UsersRound,
  globe: Globe,
  'message-circle': MessageCircle,
  radio: Radio,
  bookmark: Bookmark,
  user: User,
  'list-todo': ListTodo,
  settings: Settings,
  'layout-grid': LayoutGrid,
  'life-buoy': LifeBuoy,
  info: Info,
  shield: Shield,
  'scroll-text': ScrollText,
  mail: Mail,
  flame: Flame,
  search: Search,
  bell: Bell,
  timer: Timer,
  layers: Layers,
  palette: Palette,
  'moon-star': MoonStar,
  'share-2': Share2,
  camera: Camera,
  mic: Mic,
  'monitor-up': MonitorUp,
  'pen-tool': PenTool,
  'circle-dot': CircleDot,
  'messages-square': MessagesSquare,
  hand: Hand,
  upload: Upload,
  download: Download,
  clapperboard: Clapperboard,
  film: Film,
  compass: Compass,
  'calendar-days': CalendarDays,
  'chart-column': ChartColumn,
  'audio-lines': AudioLines,
  aperture: Aperture,
  vote: Vote,
  'heart-handshake': HeartHandshake,
  award: Award,
  medal: Medal,
  store: Store,
  'clipboard-check': ClipboardCheck,
  'calendar-range': CalendarRange,
  calculator: Calculator,
  map: MapIcon,
};

export interface NavItem {
  id: FeatureId;
  route: string;
  icon: LucideIcon;
  category: FeatureCategory;
  auth: boolean;
  locked: boolean;
}

type PageFeature = Extract<(typeof FEATURES)[number], { route: string }>;

/** Navigable pages in menu order, after the root admin's feature controls (hidden items removed) and the account's audience. */
export function navItems(controls: FeatureControlMap, accountType?: AccountType | null): NavItem[] {
  const byId = new Map<FeatureId, PageFeature>(
    FEATURES.filter((f): f is PageFeature => f.kind === 'page' && 'route' in f && !f.route.includes(':')).map((f) => [f.id, f]),
  );
  return NAV_ORDER.map((id) => byId.get(id))
    .filter((f): f is PageFeature => !!f && featureMode(controls, f.id) !== 'hidden' && shownTo(f.id, accountType))
    .map((f) => ({
      id: f.id,
      route: f.route,
      icon: ICONS[f.icon] ?? LayoutGrid,
      category: f.category,
      auth: 'auth' in f && f.auth === true,
      locked: featureMode(controls, f.id) !== 'enabled',
    }));
}

export const NAV_CATEGORIES: readonly FeatureCategory[] = FEATURE_CATEGORIES;

/** The five bottom-bar destinations on phones, per account type. */
export function bottomNav(accountType?: AccountType | null): readonly FeatureId[] {
  return BOTTOM_NAV_BY_ACCOUNT[accountType ?? 'guest'];
}

export function actionVisible(controls: FeatureControlMap, id: FeatureId) {
  return featureMode(controls, id) === 'enabled';
}
