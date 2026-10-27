import { FEATURES, featureMode, type FeatureCategory, type FeatureControlMap, type FeatureId } from '@qubedu/shared';
import {
  Bell,
  Bookmark,
  Bot,
  CalendarClock,
  Camera,
  CircleDot,
  ClipboardList,
  Download,
  FileText,
  Flame,
  Globe,
  GraduationCap,
  Hand,
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

/** Navigable pages after applying the root admin's feature controls (hidden items are removed). */
export function navItems(controls: FeatureControlMap): NavItem[] {
  return FEATURES.filter((f): f is PageFeature => f.kind === 'page' && 'route' in f && !f.route.includes(':'))
    .filter((f) => featureMode(controls, f.id) !== 'hidden')
    .map((f) => ({
      id: f.id,
      route: f.route,
      icon: ICONS[f.icon] ?? LayoutGrid,
      category: f.category,
      auth: 'auth' in f && f.auth === true,
      locked: featureMode(controls, f.id) !== 'enabled',
    }));
}

export const NAV_CATEGORIES: FeatureCategory[] = ['main', 'learning', 'social', 'personal', 'tools', 'help'];

/** The five bottom-bar destinations on phones. */
export const BOTTOM_NAV: FeatureId[] = ['home', 'quiz', 'academic', 'chat', 'profile'];

export function actionVisible(controls: FeatureControlMap, id: FeatureId) {
  return featureMode(controls, id) === 'enabled';
}
