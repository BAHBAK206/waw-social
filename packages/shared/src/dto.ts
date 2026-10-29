import type { CourseGradingDto, GradeComponentDto, GradeRating, SubjectResult } from './gradebook';
import type { RiskLevel, RiskReason, StudentSignals } from './insights';
import type { LeagueTier } from './leagues';
import type { AgeTier, GradeLevel, ParentalControls } from './stages';
import type { AccountType, AdminPermission, Role } from './roles';
import type { BloomLevel, CurriculumKind, CurriculumSystem, ItemDifficulty, ObjectiveStatus } from './curriculum';
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
  /** A teacher account checked by the administrators. */
  verifiedTeacher: boolean;
  online?: boolean;
}

export interface PublicProfile extends UserSummary {
  bio: string;
  coverUrl: string | null;
  institution: string | null;
  educationLevel: string | null;
  gradeLevel: GradeLevel | null;
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
  /** Only ever returned to the person themselves. */
  birthYear: number | null;
  /** Under 18: stricter messaging and profile rules apply automatically. */
  isMinor: boolean;
  /** child (under 13), teen (13–17) or adult, from birth year and school year. */
  ageTier: AgeTier;
  /** What applies to this student now (set by a linked parent, or the defaults for their age). */
  parentalControls: ParentalControls;
  guardianCount: number;
  /** Signing in needs a code from an authenticator app too. */
  twoFactor: boolean;
  /** Under 13 and waiting for a parent to approve the account (most features stay off until then). */
  consentPending: boolean;
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
  /** Optional voice note (spoken answer or explanation). */
  audio: Attachment | null;
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
  kind: 'quiz' | 'test' | 'exam' | 'bank';
  difficulty: 'easy' | 'medium' | 'hard';
  durationSec: number;
  questionCount: number;
  /** Built per student from question banks. */
  fromBank: boolean;
  /** Full screen is requested and leaving the page is recorded. */
  integrity: boolean;
  paperYear: number | null;
  paperBoard: string | null;
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
  /** Full screen + leaving-the-page log are on for this attempt. */
  integrity: boolean;
}

export type IntegrityEvent = 'blur' | 'fullscreen_exit' | 'paste';

export interface IntegrityCounts {
  blur: number;
  fullscreenExit: number;
  paste: number;
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
  /** Video lessons that use this quiz as their checkpoint — where to go back and review. */
  lessons?: { id: string; title: string }[];
}

export interface QuizEditorDto {
  id: string;
  title: string;
  description: string;
  sectionId: string | null;
  materialId: string | null;
  courseId: string | null;
  kind: 'quiz' | 'test' | 'exam' | 'bank';
  difficulty: 'easy' | 'medium' | 'hard';
  durationSec: number;
  scheduledAt: number | null;
  published: boolean;
  shuffle: boolean;
  shuffleOptions: boolean;
  integrity: boolean;
  blueprint: {
    bankIds: string[];
    rules: { objectiveId?: string | null; difficulty?: ItemDifficulty | null; bloom?: BloomLevel | null; count: number }[];
  } | null;
  curriculumId: string | null;
  paperYear: number | null;
  paperBoard: string | null;
  questions: {
    id?: string;
    type: QuestionType;
    prompt: string;
    imageUrl: string | null;
    options: string[];
    answer: number | number[] | string[];
    explanation: string | null;
    topic: string | null;
    points: number;
    objectiveId?: string | null;
    bloom?: BloomLevel | null;
    level?: ItemDifficulty | null;
  }[];
}

export interface QuizStatsDto {
  attempts: number;
  averagePct: number | null;
  questions: {
    id: string;
    prompt: string;
    correct: number;
    total: number;
    /** Item analysis (null until enough answers). */
    p: number | null;
    discrimination: number | null;
    difficulty: ItemDifficulty | null;
    quality: 'good' | 'fair' | 'poor' | null;
  }[];
  leaderboard: { user: UserSummary; pct: number }[];
  /** Each student's submitted attempt, with how often they left the page (integrity exams). */
  attemptsList: { attemptId: string; user: UserSummary; pct: number; submittedAt: number; integrity: IntegrityCounts }[];
}

/* ───────────── Curriculum ───────────── */

export interface CurriculumNodeDto {
  id: string;
  parentId: string | null;
  kind: CurriculumKind;
  title: string;
  code: string | null;
  description: string | null;
  system: CurriculumSystem;
  gradeLevel: string | null;
  sort: number;
}

export interface CurriculumResourceDto {
  type: 'quiz' | 'video' | 'library';
  id: string;
  title: string;
}

export interface CurriculumTreeDto {
  subject: CurriculumNodeDto;
  /** Every node under the subject in curriculum order (parents before children). */
  nodes: CurriculumNodeDto[];
  /** Per objective, for the signed-in student. */
  mastery: Record<string, { mastery: number | null; evidence: number; status: ObjectiveStatus }>;
  resources: Record<string, CurriculumResourceDto[]>;
  /** Practice questions available per node (including its children). */
  questionCounts: Record<string, number>;
  canEdit: boolean;
}

export interface LearningPlanDto {
  subject: CurriculumNodeDto;
  progress: { mastered: number; learning: number; weak: number; new: number; total: number };
  next: {
    objective: CurriculumNodeDto;
    lesson: CurriculumNodeDto | null;
    status: ObjectiveStatus;
    mastery: number | null;
    resources: CurriculumResourceDto[];
    questions: number;
  }[];
  placementDone: boolean;
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
  kind: 'flashcards' | 'task' | 'exam' | 'assignment' | 'weak-topic' | 'session' | 'lesson' | 'checkpoint';
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
  listed: boolean;
  priceCents: number;
  currency: string;
  /** Manual payment details; null when the teacher accepts no transfers. */
  transferInfo: TransferInfoDto | null;
  /** The class's AI tutor gives hints only. */
  aiHintsOnly: boolean;
  grading: CourseGradingDto;
  createdAt: number;
}

/** A course in the public catalog (no class code, no members list). */
export interface CatalogCourseDto {
  id: string;
  title: string;
  description: string;
  subject: string | null;
  coverUrl: string | null;
  color: string | null;
  owner: UserSummary;
  memberCount: number;
  priceCents: number;
  currency: string;
  enrolled: boolean;
  /** Card payment available (else vouchers only). */
  cardPayments: boolean;
  /** Ways to pay online, in the order to show them. */
  paymentMethods: ('stripe' | 'paymob_card' | 'paymob_wallet')[];
  /** The teacher's InstaPay / wallet / bank details (paid courses only). */
  transferInfo: TransferInfoDto | null;
  /** The viewer's latest transfer for this course, while it waits or after it was refused. */
  myTransfer: { status: 'pending' | 'rejected'; reason: string | null; createdAt: number } | null;
  outline: { assignments: number; materials: number; lessons: number };
}

export interface TransferInfoDto {
  instapay?: string | null;
  wallet?: string | null;
  bank?: string | null;
  note?: string | null;
}

/** A student's manual payment (InstaPay, wallet, bank) waiting for or after the teacher's review. */
export interface TransferDto {
  id: string;
  user: UserSummary;
  method: 'instapay' | 'wallet' | 'bank';
  reference: string;
  receipt: Attachment | null;
  note: string;
  amountCents: number;
  currency: string;
  status: 'pending' | 'approved' | 'rejected';
  reason: string | null;
  createdAt: number;
  reviewedAt: number | null;
}

export interface VoucherDto {
  code: string;
  usedBy: UserSummary | null;
  usedAt: number | null;
  createdAt: number;
}

export interface CertificateDto {
  id: string;
  code: string;
  title: string;
  holder: UserSummary;
  courseId: string | null;
  courseTitle: string | null;
  issuerName: string;
  grade: number | null;
  issuedAt: number;
  revoked: boolean;
}

export interface CertificateVerifyDto {
  valid: boolean;
  revoked: boolean;
  holderName: string;
  title: string;
  courseTitle: string | null;
  issuerName: string;
  grade: number | null;
  issuedAt: number;
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
  componentId: string | null;
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
  feedbackAudio: Attachment | null;
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
  /** Breakout room: the main class it belongs to, and its group name. */
  parentId: string | null;
  breakoutName: string | null;
  /** Main room: the breakout groups now open, with their members' ids. */
  breakouts: { id: string; name: string; members: string[] }[];
}

/** A poll or quick quiz question asked during a live class. */
export interface LivePollDto {
  id: string;
  question: string;
  options: string[];
  status: 'open' | 'closed';
  /** The right option for a quiz question (shown to students once it closes). */
  correct: number | null;
  /** Votes per option (moderators always; students after it closes). */
  counts: number[] | null;
  total: number;
  myChoice: number | null;
  createdAt: number;
}

/** Who attended a live class and for how long. */
export interface LiveAttendanceDto {
  items: { user: UserSummary; minutes: number; firstAt: number; lastAt: number }[];
  startedAt: number | null;
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
  /** When the reminder is due (null = none). */
  remindAt: number | null;
  /** The reminder was sent. */
  reminded: boolean;
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
  kind: 'math' | 'mcq' | 'retrieval' | 'essay' | 'llm' | 'summary' | 'quiz' | 'socratic' | 'unknown';
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
  /** Safety at a glance: teachers waiting for verification, reports involving under-18s, age groups. */
  safety: { pendingVerifications: number; minorReports: number; children: number; teens: number; parents: number; unverifiedTeachers: number };
  /** Health of the server side: last backup, video processing queue. */
  system: { lastBackupAt: number | null; lastBackupSizeKb: number | null; videosProcessing: number; videosFailed: number; alertsConfigured: boolean };
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
  birthYear: number | null;
  isMinor: boolean;
  gradeLevel: string | null;
  ageTier: AgeTier;
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
  /** Hidden automatically because several members reported it. */
  autoHidden: boolean;
  /** Open reports on the same item (this one included). */
  reportCount: number;
  /** The reporter or the reported person is under 18: look at these first. */
  minorInvolved: boolean;
  /** Who wrote the reported item (or the reported person). */
  targetAuthor: UserSummary | null;
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

export interface CourseKnowledgeDto {
  id: string;
  question: string;
  answer: string;
  link: string | null;
  createdAt: number;
}

/** A question the assistant could not answer, grouped by wording. */
export interface AssistantGapDto {
  id: string;
  question: string;
  language: 'ar' | 'en' | 'fr' | 'es';
  count: number;
  lastAskedAt: number;
}

export interface AssistantTestDto {
  content: string;
  provider: string;
  sources: AiSource[];
  actions: { label: string; link: string }[];
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
  /** Adaptive stream (HLS master playlist) once processed; players prefer it over the original file. */
  streamUrl: string | null;
  /** Heights available in the stream, e.g. [360, 720, 1080]. */
  streamRenditions: number[];
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
  /** Quiz linked to the lesson ("check your understanding"). */
  quiz: { id: string; title: string; questionCount: number } | null;
}

export interface VideoNoteDto {
  id: string;
  atSec: number;
  text: string;
  createdAt: number;
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

export interface CaptionTrackDto {
  language: 'ar' | 'en' | 'fr' | 'es';
  source: 'upload' | 'auto' | 'translated';
  cues: { start: number; end: number; text: string }[];
  updatedAt: number;
}

export interface TeacherAiResultDto {
  provider: string;
  /** quiz: questions in the quiz editor's format, for the teacher to review. */
  questions?: QuizEditorDto['questions'];
  summary?: string[];
  keyPoints?: string[];
  chapters?: { at: number; title: string }[];
  ideas?: string[];
}

export interface StudentInsightDto {
  student: UserSummary;
  lastSeenAt: number | null;
  signals: StudentSignals;
  risk: { level: RiskLevel; reasons: RiskReason[] };
}

export interface CourseInsightsDto {
  courseId: string;
  title: string;
  students: StudentInsightDto[];
}

export interface ChildReportDto {
  child: UserSummary;
  gradeLevel: GradeLevel | null;
  ageTier: AgeTier;
  /** What the child can do now (the parent can change these while the child is under 18). */
  controls: ParentalControls;
  streak: number;
  xp: number;
  level: number;
  /** Last 14 days, oldest first. */
  days: { day: string; minutes: number }[];
  quizzes: { title: string; pct: number; at: number }[];
  courses: {
    id: string;
    title: string;
    teacher: string;
    /** Teacher account to message (parents can always contact their child's teachers). */
    teacherId: string | null;
    assignments: {
      id: string;
      title: string;
      dueAt: number | null;
      status: 'graded' | 'submitted' | 'missing' | 'upcoming';
      late: boolean;
      grade: number | null;
      points: number;
    }[];
    attendance: { present: number; absent: number; late: number; excused: number };
  }[];
  signals: StudentSignals;
  risk: { level: RiskLevel; reasons: RiskReason[] };
}

export interface FamilyDto {
  children: (UserSummary & { risk: RiskLevel; minutesThisWeek: number })[];
  guardians: UserSummary[];
  /** Pending links: invitations by email, a parent's request to a student, waiting for the other side. */
  requests: {
    id: string;
    direction: 'incoming' | 'outgoing';
    person: UserSummary | null;
    email: string | null;
    createdAt: number;
    /** Set when a linked parent must approve another parent for this child. */
    child?: UserSummary | null;
    awaitingGuardian?: boolean;
  }[];
}

export interface LeagueDto {
  week: string;
  endsAt: number;
  tier: LeagueTier;
  tierIndex: number;
  /** False until the learner earns XP this week. */
  joined: boolean;
  members: { user: UserSummary; xp: number; rank: number; me: boolean }[];
  promote: number;
  demote: number;
  lastResult: 'up' | 'down' | 'stay' | null;
}

export interface GradebookRowDto {
  student: UserSummary;
  /** Marks per component id (null = nothing graded yet). */
  marks: Record<string, number | null>;
  result: SubjectResult;
}

export interface CourseGradebookDto {
  grading: CourseGradingDto;
  components: GradeComponentDto[];
  /** Sum of component marks; should equal the subject total. */
  componentsTotal: number;
  rows: GradebookRowDto[];
}

export interface ReportSubjectDto {
  courseId: string;
  title: string;
  teacher: string;
  grading: CourseGradingDto;
  components: { id: string; name: string; maxMarks: number; earned: number | null }[];
  result: SubjectResult;
}

export interface ReportCardDto {
  student: UserSummary;
  term: string | null;
  terms: string[];
  subjects: ReportSubjectDto[];
  overall: { score: number; max: number; fullMax: number; percent: number | null; rating: GradeRating | null; failed: number };
}

export interface TeacherVerificationDto {
  id: string;
  user: UserSummary & { email?: string };
  institution: string;
  subject: string;
  note: string;
  proofUrl: string | null;
  status: 'pending' | 'approved' | 'rejected';
  reason: string;
  createdAt: number;
  reviewedAt: number | null;
}

export interface TimetableEntryDto {
  id: string;
  day: 0 | 1 | 2 | 3 | 4 | 5 | 6;
  start: string;
  end: string;
  title: string;
  room: string;
  color: string | null;
  courseId: string | null;
  courseTitle: string | null;
  /** The viewer can edit or delete it (their own row). */
  mine: boolean;
}

/** A parent's WhatsApp / SMS settings. */
export interface PhoneSettingsDto {
  /** Masked, e.g. +20 100 ••• 4567. */
  phone: string | null;
  verified: boolean;
  channel: 'whatsapp' | 'sms';
  weekly: boolean;
  alerts: boolean;
  /** A code was sent and is waiting (to this number). */
  pending: string | null;
  /** Which channels this site can send on. */
  available: { whatsapp: boolean; sms: boolean };
}

export interface SchoolDto {
  id: string;
  name: string;
  system: string;
  address: string | null;
  phone: string | null;
  logoUrl: string | null;
  principal: string | null;
  myRole: 'admin' | 'teacher' | 'student' | 'parent' | null;
  /** invited: added by the school, waiting for this person to accept. */
  myStatus: 'active' | 'invited' | null;
  counts: { admins: number; teachers: number; students: number; parents: number; classes: number; invited: number };
  sections: string[];
  createdAt: number;
}

export interface SchoolMemberDto {
  user: UserSummary & { email?: string };
  role: 'admin' | 'teacher' | 'student' | 'parent';
  status: 'active' | 'invited';
  section: string | null;
  studentNumber: string | null;
  gradeLevel: GradeLevel | null;
  /** The account was created by this school (its admin can reset the password). */
  managed: boolean;
  joinedAt: number;
}

export interface SchoolImportResultDto {
  /** New accounts with their first password, to print and hand out. */
  created: { name: string; login: string; password: string; role: string; section: string | null; studentNumber: string | null }[];
  /** Existing accounts asked to join (they accept in the app). */
  invited: number;
  /** Parents linked to their child (new parent accounts), or asked to confirm (existing ones). */
  parents: number;
  skipped: { row: number; name: string; reason: string }[];
}

export interface SchoolClassDto {
  id: string;
  title: string;
  section: string | null;
  subjectCode: string | null;
  term: string | null;
  teacher: UserSummary;
  memberCount: number;
}

/** Official report cards for printing (one student, or a whole class section). */
export interface SchoolReportCardsDto {
  school: SchoolDto;
  term: string | null;
  terms: string[];
  cards: (ReportCardDto & { section: string | null; studentNumber: string | null; gradeLevel: GradeLevel | null })[];
}

/** AI feedback on writing, criterion by criterion of the assignment's rubric. */
export interface RubricFeedbackDto {
  criteria: {
    index: number;
    title: string;
    level: number | null;
    levelLabel: string | null;
    points: number | null;
    comment: string;
    found: string[];
    missing: string[];
  }[];
  overall: string;
  stats: { words: number; sentences: number; paragraphs: number; avgSentence: number };
  /** Suggested total in the assignment's points (teachers), from the rubric. */
  suggestedGrade: number | null;
  provider: string;
}

/** Possible copying between students' submissions, and from the class's materials. */
export interface SimilarityReportDto {
  pairs: { a: UserSummary; b: UserSummary; score: number; excerpt: string }[];
  sources: { student: UserSummary; material: string; score: number; excerpt: string }[];
  checked: number;
}

/* ───────── Smart study ───────── */

export interface ReviewQuestionDto {
  id: string;
  quizId: string | null;
  type: 'mc' | 'tf' | 'multi' | 'short';
  prompt: string;
  options: string[];
  topic: string | null;
  imageUrl: string | null;
  misses: number;
}

export interface DailyReviewDto {
  cards: FlashcardDto[];
  questions: ReviewQuestionDto[];
  weakObjectives: { id: string; title: string; pct: number; total: number }[];
  /** Rough time the whole queue takes. */
  minutes: number;
  total: number;
}

export interface ReviewAnswerResultDto {
  correct: boolean;
  answer: number | number[] | string[];
  explanation: string | null;
  nextDueAt: number;
}

export interface RecurringMistakeDto {
  questionId: string;
  prompt: string;
  topic: string | null;
  objectiveId: string | null;
  objectiveTitle: string | null;
  misses: number;
  quizId: string | null;
  /** In-app link for practising the weak point. */
  practiceLink: string | null;
}

export interface StudyPackDto {
  keyTerms: { term: string; count: number }[];
  mindMap: { center: string; branches: { title: string; points: string[] }[] };
  flashcards: { front: string; back: string }[];
  questions: { prompt: string; answer: string }[];
  glossary: { term: string; definition: string }[];
}

export interface FocusStatusDto {
  active: { id: string; startedAt: number; endsAt: number; minutes: number } | null;
  todayMinutes: number;
  weekMinutes: number;
  weekSessions: number;
  mutedWeek: number;
}

export interface GlossaryTermDto {
  id: string;
  subject: string;
  term: string;
  definition: string;
  courseId: string | null;
  source: 'manual' | 'lesson';
  mine: boolean;
  authorName: string;
}

/* ───────── Collaboration and motivation ───────── */

export interface GroupTaskDto {
  id: string;
  title: string;
  done: boolean;
  doneByName: string | null;
  createdAt: number;
}

export interface GroupStudyDto {
  weekStart: string;
  tasks: GroupTaskDto[];
  /** This week's study minutes of the group's members. */
  board: { rank: number; user: UserSummary; minutes: number }[];
  /** Combined minutes of the whole group this week. */
  totalMinutes: number;
}

export interface ClassChallengeDto {
  weekStart: string;
  /** Classes compete inside their school; null when the class is not part of a school. */
  schoolId: string | null;
  standings: { courseId: string; title: string; students: number; minutes: number; average: number; rank: number; mine: boolean }[];
  lastWeekWinner: { courseId: string; title: string; average: number } | null;
}

export interface ClassGoalDto {
  courseId: string;
  weekStart: string;
  targetMinutes: number | null;
  minutes: number;
  reached: boolean;
  /** Weeks this class reached its goal (the class badge). */
  badges: number;
  students: number;
  canSet: boolean;
}

export interface MentorDto {
  user: UserSummary;
  subjects: string[];
  /** Answers of this mentor that a question's author chose as the best answer. */
  helped: number;
}

/* ───────── Teacher tools ───────── */

export interface LessonPlanDto {
  objective: { id: string; title: string; description: string | null };
  /** Subject › unit › lesson. */
  path: string[];
  minutes: number;
  sections: { key: 'warmup' | 'explain' | 'practice' | 'assess' | 'wrapup'; minutes: number }[];
  resources: { kind: 'quiz' | 'video' | 'library'; id: string; title: string }[];
  questions: { type: 'mc' | 'tf' | 'multi' | 'short'; prompt: string; level: string | null }[];
}

export interface PaperGradeDto {
  items: { label: string; points: number; awarded: number; matched: string[] }[];
  total: number;
  max: number;
}

export interface ClassComparisonDto {
  objectives: { id: string; title: string }[];
  classes: { courseId: string; title: string; students: number; cells: Record<string, { pct: number; questions: number } | null> }[];
}

export interface WorksheetDto {
  tiers: Record<
    'easy' | 'medium' | 'advanced',
    { type: 'mc' | 'tf' | 'multi' | 'short'; prompt: string; options: string[]; answer: number | number[] | string[]; level: string | null }[]
  >;
  /** Quizzes created when `save` was set. */
  quizIds: Partial<Record<'easy' | 'medium' | 'advanced', string>>;
}

export interface SchoolTemplateDto {
  id: string;
  kind: 'quiz' | 'assignment';
  title: string;
  authorName: string | null;
  uses: number;
  questionCount: number | null;
  mine: boolean;
  createdAt: number;
}

export interface StudentCommentDto {
  id: string;
  courseId: string;
  courseTitle: string;
  text: string;
  teacherName: string | null;
  createdAt: number;
}
