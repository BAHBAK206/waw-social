import type { AccountType, AdminPermission, Role } from './roles';
import type { Appearance } from './appearance';
import type { FeatureControlMap } from './features';
import type { NotificationPrefs, Privacy } from './schemas/users';
import type { VerificationBadge } from './schemas/admin';
import type { Attachment } from './schemas/common';
import type { FormQuestion, FormSettings, WorkspaceKind } from './schemas/content';
import type { QuestionType } from './schemas/learning';
import type { PostKind, Reaction } from './limits';
import type { MasteryLevel } from './mastery';
import type { WeeklyPlan } from './planner';
import type { XpRewardMeta } from './xp';

export interface Page<T> {
  items: T[];
  nextCursor: string | null;
}

export interface ApiErrorBody {
  error: { code: string; message: string; details?: unknown };
}

export interface UserSummary {
  id: string;
  displayName: string;
  username: string | null;
  avatarUrl: string | null;
  accountType: AccountType;
  level: number;
  xp: number;
  badge: VerificationBadge | null;
  online?: boolean;
}

export interface PublicProfile extends UserSummary {
  bio: string;
  coverUrl: string | null;
  institution: string | null;
  educationLevel: string | null;
  streak: number;
  quizCount: number;
  studyMinutes: number;
  followers: number;
  following: number;
  isFollowing: boolean;
  followsYou: boolean;
  achievements: { id: string; unlockedAt: number }[];
  createdAt: number;
  lastSeenAt: number | null;
  canMessage: boolean;
  statsHidden: boolean;
}

export interface Me extends PublicProfile {
  email: string;
  emailVerified: boolean;
  role: Role;
  permissions: AdminPermission[];
  gender: 'male' | 'female' | null;
  appearance: Appearance;
  privacy: Privacy;
  notificationPrefs: NotificationPrefs;
  timezone: string;
  dailyGoalMinutes: number;
  todayMinutes: number;
  onboardingDone: boolean;
  banned: boolean;
  unreadNotifications: number;
  unreadMessages: number;
}

export interface AuthResult {
  accessToken: string;
  accessTokenExpiresAt: number;
  refreshToken?: string;
  user: Me;
}

export interface PostDto {
  id: string;
  author: UserSummary;
  groupId: string | null;
  text: string;
  imageUrl: string | null;
  pinned: boolean;
  createdAt: number;
  editedAt: number | null;
  commentCount: number;
  reactionCounts: Partial<Record<Reaction, number>>;
  myReaction: Reaction | null;
  saved: boolean;
  canEdit: boolean;
  canDelete: boolean;
  shareCount: number;
  poll: PollDto | null;
  shared: SharedPostDto | null;
  hashtags: string[];
  kind: PostKind;
  material: { id: string; name: string } | null;
  /** Question posts: the chosen best answer. */
  acceptedCommentId: string | null;
  solved: boolean;
  /** The asker, a teacher of the post's group or a moderator may choose the best answer. */
  canAccept: boolean;
}

export interface PollDto {
  multiple: boolean;
  endsAt: number | null;
  closed: boolean;
  totalVotes: number;
  options: { id: string; text: string; votes: number }[];
  myVotes: string[];
}

export interface SharedPostDto {
  id: string;
  author: UserSummary;
  text: string;
  imageUrl: string | null;
  createdAt: number;
  /** False when the original was deleted or is no longer visible. */
  available: boolean;
}

export interface CommentDto {
  id: string;
  postId: string;
  author: UserSummary;
  text: string;
  createdAt: number;
  canDelete: boolean;
  /** "Helpful" votes; answers to questions are ranked by them. */
  votes: number;
  myVote: boolean;
}

export interface NotificationDto {
  id: string;
  type: string;
  title: string;
  body: string;
  icon: string;
  link: string | null;
  actor: UserSummary | null;
  data: Record<string, unknown>;
  read: boolean;
  createdAt: number;
}

export interface ConversationDto {
  id: string;
  kind: 'direct' | 'group' | 'channel' | 'live';
  title: string;
  avatarUrl: string | null;
  peer: UserSummary | null;
  groupId: string | null;
  lastMessage: { text: string; senderId: string; createdAt: number } | null;
  unread: number;
  muted: boolean;
  updatedAt: number;
}

export interface MessageDto {
  id: string;
  conversationId: string;
  sender: UserSummary;
  text: string;
  attachment: Attachment | null;
  replyTo: { id: string; text: string; senderName: string } | null;
  reactions: Record<string, string[]>;
  createdAt: number;
  editedAt: number | null;
  deleted: boolean;
  clientId: string | null;
}

export interface GroupDto {
  id: string;
  kind: 'group' | 'community';
  name: string;
  description: string;
  privacy: 'public' | 'private';
  avatarUrl: string | null;
  coverUrl: string | null;
  tags: string[];
  owner: UserSummary;
  memberCount: number;
  postCount: number;
  myRole: 'owner' | 'admin' | 'teacher' | 'member' | null;
  pendingRequest: boolean;
  requestCount: number;
  conversationId: string | null;
  createdAt: number;
}

export interface GroupMemberDto {
  user: UserSummary;
  role: 'owner' | 'admin' | 'teacher' | 'member';
  joinedAt: number;
}

export interface GroupResourceDto {
  id: string;
  title: string;
  url: string;
  kind: 'file' | 'link';
  mime: string | null;
  size: number | null;
  uploader: UserSummary;
  createdAt: number;
}

export interface ChannelDto {
  id: string;
  name: string;
  kind: 'text' | 'announcement';
  conversationId: string;
}

export interface QuizSummaryDto {
  id: string;
  title: string;
  description: string;
  kind: 'quiz' | 'test' | 'exam';
  difficulty: 'easy' | 'medium' | 'hard';
  durationSec: number;
  questionCount: number;
  section: { id: string; name: string } | null;
  material: { id: string; name: string } | null;
  courseId: string | null;
  scheduledAt: number | null;
  published: boolean;
  author: UserSummary | null;
  attempts: number;
  myBest: { pct: number; correct: number; total: number; at: number } | null;
  createdAt: number;
  canEdit: boolean;
}

export interface QuizQuestionPublic {
  id: string;
  type: QuestionType;
  prompt: string;
  imageUrl: string | null;
  options: string[];
  topic: string | null;
  points: number;
}

export interface QuizAttemptDto {
  attemptId: string;
  quiz: QuizSummaryDto;
  questions: QuizQuestionPublic[];
  startedAt: number;
  expiresAt: number;
  review: boolean;
  adaptive: boolean;
}

export interface QuestionReview {
  questionId: string;
  type: QuestionType;
  prompt: string;
  options: string[];
  correct: boolean;
  given: number | number[] | string | null;
  answer: number | number[] | string[];
  explanation: string | null;
}

export interface QuizResultDto extends XpRewardMeta {
  attemptId: string;
  quizId: string | null;
  correct: number;
  total: number;
  pct: number;
  timeSec: number;
  isNewBest: boolean;
  review: boolean;
  perfect: boolean;
  newAchievements: string[];
  breakdown: QuestionReview[];
  topicStats: { topic: string; correct: number; total: number; pct: number }[];
}

export interface QuizEditorDto {
  id: string;
  title: string;
  description: string;
  sectionId: string | null;
  materialId: string | null;
  courseId: string | null;
  kind: 'quiz' | 'test' | 'exam';
  difficulty: 'easy' | 'medium' | 'hard';
  durationSec: number;
  scheduledAt: number | null;
  published: boolean;
  shuffle: boolean;
  questions: {
    type: QuestionType;
    prompt: string;
    imageUrl: string | null;
    options: string[];
    answer: number | number[] | string[];
    explanation: string | null;
    topic: string | null;
    points: number;
  }[];
}

export interface TaxonomyDto {
  sections: { id: string; name: string; sort: number; materials: { id: string; name: string; sort: number }[] }[];
}

export interface DailyChallengeDto {
  day: string;
  type: 'quiz' | 'social';
  title: string;
  description: string;
  question: string | null;
  options: string[];
  xp: number;
  claimed: boolean;
  result: { correct: boolean; xpEarned: number; answer: number | null } | null;
}

export interface FlashcardDto {
  id: string;
  front: string;
  back: string;
  deck: string;
  topic: string | null;
  courseId: string | null;
  level: number;
  ease: number;
  repetitions: number;
  lapses: number;
  intervalDays: number;
  dueAt: number;
  lastReviewedAt: number | null;
  createdAt: number;
}

export interface TaskDto {
  id: string;
  title: string;
  notes: string;
  dueAt: number | null;
  priority: 'low' | 'medium' | 'high';
  status: 'todo' | 'doing' | 'done';
  tags: string[];
  subtasks: { title: string; done: boolean }[];
  createdAt: number;
  completedAt: number | null;
}

export interface NoteDto {
  id: string;
  title: string;
  body: string;
  color: 'default' | 'yellow' | 'green' | 'blue' | 'pink' | 'purple';
  pinned: boolean;
  tags: string[];
  createdAt: number;
  updatedAt: number;
}

export interface ExamDto {
  id: string;
  subject: string;
  day: string;
  time: string | null;
  place: string | null;
  notes: string | null;
  createdAt: number;
}

export interface StudySessionDto {
  id: string;
  title: string;
  subject: string | null;
  day: string;
  startTime: string | null;
  minutes: number;
  notes: string | null;
  completed: boolean;
}

export interface MasteryDto {
  key: string;
  topic: string;
  courseId: string | null;
  mastery: number;
  level: MasteryLevel;
  confidence: 'low' | 'medium' | 'high';
  trend: 'improving' | 'stable' | 'declining';
  evidenceQuestions: number;
  attempts: number;
  latestTs: number;
}

export interface StudyInboxItem {
  kind: 'flashcards' | 'task' | 'exam' | 'assignment' | 'weak-topic' | 'session';
  title: string;
  dueAt: number | null;
  link: string;
  refId?: string;
  count?: number;
}

export interface AcademicDashboardDto {
  today: string;
  dueCards: number;
  studyMinutesToday: number;
  dailyGoalMinutes: number;
  streak: number;
  inbox: StudyInboxItem[];
  upcomingExams: ExamDto[];
  weakTopics: MasteryDto[];
  weeklyMinutes: { day: string; minutes: number }[];
}

export type WeeklyPlanDto = WeeklyPlan;

export interface CourseDto {
  id: string;
  title: string;
  description: string;
  subject: string | null;
  coverUrl: string | null;
  color: string | null;
  owner: UserSummary;
  joinCode: string | null;
  memberCount: number;
  myRole: 'teacher' | 'assistant' | 'student' | null;
  archived: boolean;
  createdAt: number;
}

export interface CourseAnnouncementDto {
  id: string;
  author: UserSummary;
  text: string;
  attachments: Attachment[];
  createdAt: number;
}

export interface AssignmentDto {
  id: string;
  courseId: string;
  title: string;
  description: string;
  dueAt: number | null;
  releaseAt: number | null;
  points: number;
  rubricId: string | null;
  allowLate: boolean;
  state: 'draft' | 'published' | 'closed';
  attachments: Attachment[];
  topic: string | null;
  createdAt: number;
  mySubmission: SubmissionDto | null;
  stats: { submitted: number; graded: number; total: number } | null;
}

export interface SubmissionDto {
  id: string;
  assignmentId: string;
  student: UserSummary;
  text: string;
  attachments: Attachment[];
  status: 'submitted' | 'graded' | 'returned';
  late: boolean;
  grade: number | null;
  feedback: string;
  rubricScores: Record<string, number> | null;
  submittedAt: number;
  gradedAt: number | null;
}

export interface RubricDto {
  id: string;
  courseId: string;
  title: string;
  criteria: { title: string; description: string; levels: { label: string; points: number }[] }[];
}

export interface AttendanceSessionDto {
  id: string;
  title: string;
  day: string;
  records: Record<string, 'present' | 'absent' | 'late' | 'excused'>;
}

export interface CourseMaterialDto {
  id: string;
  title: string;
  topic: string | null;
  fileUrl: string | null;
  chunkCount: number;
  visibleToStudents: boolean;
  createdAt: number;
}

export interface CourseAnalyticsDto {
  students: number;
  assignments: number;
  submissionRate: number;
  averageGrade: number | null;
  attendanceRate: number | null;
  topicMastery: { topic: string; mastery: number; students: number }[];
  perStudent: { student: UserSummary; submitted: number; averageGrade: number | null; attendance: number | null }[];
}

export interface LiveRoomDto {
  id: string;
  title: string;
  scopeType: 'group' | 'community' | 'course' | 'open';
  scopeId: string | null;
  host: UserSummary;
  status: 'scheduled' | 'live' | 'ended';
  scheduledAt: number | null;
  startedAt: number | null;
  endedAt: number | null;
  settings: { allowStudentCamera: boolean; allowStudentMic: boolean; allowStudentScreen: boolean; allowChat: boolean };
  conversationId: string | null;
  isHost: boolean;
  canModerate: boolean;
  iceServers: { urls: string | string[]; username?: string; credential?: string }[];
}

export interface ScheduledClassDto {
  id: string;
  title: string;
  subject: string | null;
  description: string;
  link: string;
  startsAt: number | null;
  createdBy: UserSummary | null;
  createdAt: number;
}

export interface FormDto {
  id: string;
  slug: string;
  title: string;
  description: string;
  settings: FormSettings;
  questions: FormQuestion[];
  published: boolean;
  owner: UserSummary;
  responseCount: number;
  createdAt: number;
  updatedAt: number;
  isOwner: boolean;
  alreadyResponded: boolean;
}

export interface FormResponseDto {
  id: string;
  respondent: UserSummary | null;
  email: string | null;
  answers: Record<string, string | string[] | number>;
  score: number | null;
  createdAt: number;
}

export interface FormAnalyticsDto {
  total: number;
  questions: {
    id: string;
    title: string;
    type: string;
    counts: Record<string, number>;
    average: number | null;
    textAnswers: string[];
  }[];
}

export interface LibraryItemDto {
  id: string;
  title: string;
  description: string;
  category: 'book' | 'summary' | 'exam' | 'notes' | 'video' | 'other';
  section: { id: string; name: string } | null;
  material: { id: string; name: string } | null;
  fileUrl: string;
  mime: string;
  size: number;
  coverUrl: string | null;
  uploader: UserSummary;
  downloads: number;
  approved: boolean;
  createdAt: number;
  canDelete: boolean;
}

export interface WorkspaceFolderDto {
  id: string;
  name: string;
  parentId: string | null;
  createdAt: number;
}

export interface WorkspaceFileDto {
  id: string;
  title: string;
  kind: WorkspaceKind;
  folderId: string | null;
  version: number;
  createdAt: number;
  updatedAt: number;
  content?: unknown;
}

export interface SavedCollectionDto {
  id: string;
  name: string;
  description: string;
  isPublic: boolean;
  shareSlug: string;
  itemCount: number;
  createdAt: number;
}

export interface SavedItemDto {
  id: string;
  itemType: 'post' | 'quiz' | 'library' | 'group' | 'user' | 'link' | 'form' | 'course';
  refId: string | null;
  title: string;
  url: string | null;
  note: string;
  collectionId: string | null;
  createdAt: number;
}

export interface SearchResultsDto {
  users: UserSummary[];
  groups: Pick<GroupDto, 'id' | 'name' | 'kind' | 'avatarUrl' | 'memberCount' | 'privacy'>[];
  quizzes: Pick<QuizSummaryDto, 'id' | 'title' | 'difficulty' | 'questionCount'>[];
  posts: Pick<PostDto, 'id' | 'text' | 'createdAt' | 'author'>[];
  library: Pick<LibraryItemDto, 'id' | 'title' | 'category'>[];
  courses: Pick<CourseDto, 'id' | 'title' | 'subject'>[];
}

export interface AnnouncementDto {
  id: string;
  title: string;
  text: string;
  imageUrl: string | null;
  link: string | null;
  level: 'info' | 'success' | 'warning' | 'critical';
  active: boolean;
  expiresAt: number | null;
  createdAt: number;
}

export interface AdDto {
  id: string;
  title: string;
  subtitle: string;
  link: string | null;
  imageUrl: string | null;
  placement: 'home' | 'quiz' | 'both';
  active: boolean;
  clicks: number;
  impressions: number;
  createdAt: number;
}

export interface PublicConfigDto {
  features: FeatureControlMap;
  maintenance: { enabled: boolean; message: string };
  registrationOpen: boolean;
  contact: Record<string, string>;
  announcements: AnnouncementDto[];
  ads: AdDto[];
  ai: { enabled: boolean };
  uploads: { enabled: boolean };
  realtimeUrl: string | null;
  version: string;
  fetchedAt: number;
}

export interface AiSource {
  title: string;
  heading: string | null;
  page: number | null;
  snippet: string;
  materialId?: string | null;
}

export interface AiAnswerDto {
  answer: string;
  steps: string[];
  confidence: 'high' | 'medium' | 'low' | 'uncertain';
  kind: 'math' | 'mcq' | 'retrieval' | 'essay' | 'llm' | 'summary' | 'quiz' | 'unknown';
  sources: AiSource[];
  choice: number | null;
  provider: string;
  remainingQuota: number | null;
  generatedQuestions?: { prompt: string; options: string[]; answer: number; explanation: string }[];
}

export interface EssayGradeDto {
  score: number;
  coverage: { point: string; matched: boolean; evidence: string | null }[];
  feedback: string;
}

export interface AssistantThreadDto {
  id: string;
  title: string;
  updatedAt: number;
}

export interface AssistantMessageDto {
  id: string;
  threadId: string;
  role: 'user' | 'assistant';
  content: string;
  sources: AiSource[];
  actions: { label: string; link: string }[];
  rating: 'up' | 'down' | null;
  createdAt: number;
}

export interface AdminOverviewDto {
  users: { total: number; today: number; week: number; teachers: number; banned: number; online: number };
  content: { posts: number; quizzes: number; attempts: number; groups: number; courses: number; forms: number; library: number };
  openReports: number;
  errors24h: number;
  signupsByDay: { day: string; count: number }[];
  activityByDay: { day: string; attempts: number; posts: number; messages: number }[];
}

export interface AdminUserDto extends UserSummary {
  email: string;
  role: Role;
  permissions: string[];
  banned: boolean;
  banReason: string | null;
  emailVerified: boolean;
  createdAt: number;
  lastSeenAt: number | null;
}

export interface ReportDto {
  id: string;
  targetType: string;
  targetId: string;
  reason: string;
  details: string;
  status: 'open' | 'resolved' | 'dismissed';
  reporter: UserSummary;
  target: { label: string; link: string | null } | null;
  resolution: string | null;
  createdAt: number;
  resolvedAt: number | null;
}

export interface AuditEntryDto {
  id: string;
  actor: UserSummary | null;
  action: string;
  targetType: string | null;
  targetId: string | null;
  data: Record<string, unknown>;
  createdAt: number;
}

export interface ClientErrorDto {
  id: string;
  message: string;
  kind: string;
  url: string | null;
  count: number;
  lastSeenAt: number;
  firstSeenAt: number;
  sampleStack: string | null;
}

export interface AssistantKnowledgeDto {
  id: string;
  question: string;
  answer: string;
  tags: string[];
  language: 'ar' | 'en' | 'fr' | 'es';
  link: string | null;
  createdAt: number;
}

export interface LeaderboardEntry {
  rank: number;
  user: UserSummary;
  score: number;
}

export interface UploadResultDto {
  url: string;
  key: string;
  mime: string;
  size: number;
  name: string;
  kind: 'image' | 'file' | 'audio' | 'video';
}

export interface PomodoroSessionDto {
  id: string;
  minutes: number;
  label: string | null;
  startedAt: number;
  endsAt: number;
  completedAt: number | null;
}

export interface PomodoroCompleteDto extends XpRewardMeta {
  sessionId: string;
  minutes: number;
  alreadyCompleted: boolean;
  newAchievements: string[];
  todayMinutes: number;
}

/* ───────── Watch (videos & shorts) ───────── */

export interface VideoDto {
  id: string;
  kind: 'video' | 'short';
  title: string;
  description: string;
  videoUrl: string;
  thumbnailUrl: string | null;
  durationSec: number;
  visibility: 'public' | 'unlisted' | 'private';
  tags: string[];
  section: { id: string; name: string } | null;
  material: { id: string; name: string } | null;
  owner: UserSummary;
  views: number;
  likes: number;
  dislikes: number;
  commentCount: number;
  allowComments: boolean;
  createdAt: number;
  /** -1 | 0 | 1 */
  myReaction: number;
  watchLater: boolean;
  /** Playback resume point for the viewer. */
  progressSec: number;
  subscribed: boolean;
  subscribers: number;
  canEdit: boolean;
}

export interface VideoCommentDto {
  id: string;
  videoId: string;
  parentId: string | null;
  author: UserSummary;
  text: string;
  likes: number;
  liked: boolean;
  replyCount: number;
  pinned: boolean;
  createdAt: number;
  canDelete: boolean;
}

export interface PlaylistDto {
  id: string;
  /** Present when the list was requested for a specific video ("save to playlist"). */
  hasVideo?: boolean;
  title: string;
  description: string;
  visibility: 'public' | 'unlisted' | 'private';
  itemCount: number;
  owner: UserSummary;
  thumbnailUrl: string | null;
  updatedAt: number;
  canEdit: boolean;
}

export interface VideoChannelDto {
  user: PublicProfile;
  subscribers: number;
  videoCount: number;
  shortCount: number;
  totalViews: number;
  isSubscribed: boolean;
  playlists: PlaylistDto[];
}

export interface WatchHistoryItem {
  video: VideoDto;
  progressSec: number;
  completed: boolean;
  watchedAt: number;
}

export interface StudioOverviewDto {
  totals: { videos: number; views: number; likes: number; comments: number; subscribers: number; watchMinutes: number };
  viewsByDay: { day: string; views: number }[];
  topVideos: { id: string; title: string; thumbnailUrl: string | null; views: number; likes: number; kind: 'video' | 'short' }[];
}

/* ───────── Stories ───────── */

export interface StoryDto {
  id: string;
  mediaKind: 'image' | 'video' | 'text';
  mediaUrl: string | null;
  text: string;
  bgColor: string;
  durationSec: number;
  createdAt: number;
  expiresAt: number;
  viewed: boolean;
  viewCount: number;
  myReaction: string | null;
}

export interface StoryGroupDto {
  author: UserSummary;
  stories: StoryDto[];
  /** True when every story was already seen by the viewer. */
  allViewed: boolean;
  isMine: boolean;
}

export interface StoryViewerDto {
  user: UserSummary;
  viewedAt: number;
  reaction: string | null;
}

/* ───────── Explore: hashtags, trending, events ───────── */

export interface TrendingTagDto {
  tag: string;
  count: number;
  /** Change versus the previous window, in percent (null when new). */
  growth: number | null;
}

export interface ExploreDto {
  tags: TrendingTagDto[];
  videos: VideoDto[];
  posts: PostDto[];
  people: UserSummary[];
  events: EventDto[];
}

export interface HashtagPageDto {
  tag: string;
  postCount: number;
  videoCount: number;
  posts: PostDto[];
  videos: VideoDto[];
}

export interface EventDto {
  id: string;
  title: string;
  description: string;
  coverUrl: string | null;
  startsAt: number;
  endsAt: number | null;
  location: string;
  onlineUrl: string | null;
  host: UserSummary;
  groupId: string | null;
  goingCount: number;
  interestedCount: number;
  myStatus: 'going' | 'interested' | null;
  canEdit: boolean;
  createdAt: number;
}

export interface PronunciationResultDto {
  score: number;
  words: { word: string; ok: boolean }[];
  xpEarned: number;
}

export interface PronunciationStatsDto {
  today: { attempts: number; average: number | null; xp: number };
  week: { attempts: number; average: number | null };
  recent: { id: string; language: string; phrase: string; score: number; createdAt: number }[];
  /** Words most often missed recently (to practise again). */
  weakWords: { word: string; language: string; misses: number }[];
}
