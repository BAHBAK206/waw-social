import type {
  AcademicDashboardDto,
  AdDto,
  AdminOverviewDto,
  AdminUserDto,
  AiAnswerDto,
  AnnouncementDto,
  AssignmentDto,
  AssistantKnowledgeDto,
  AssistantMessageDto,
  AssistantThreadDto,
  AttendanceSessionDto,
  AuditEntryDto,
  AuthResult,
  ChannelDto,
  ClientErrorDto,
  CommentDto,
  EventDto,
  ExploreDto,
  HashtagPageDto,
  PlaylistDto,
  StoryDto,
  StoryGroupDto,
  StoryViewerDto,
  StudioOverviewDto,
  TrendingTagDto,
  VideoChannelDto,
  VideoCommentDto,
  VideoDto,
  CaptionTrackDto,
  LeagueDto,
  CatalogCourseDto,
  CertificateDto,
  CertificateVerifyDto,
  VoucherDto,
  ChildReportDto,
  CourseInsightsDto,
  FamilyDto,
  StudentInsightDto,
  TeacherAiResultDto,
  TeacherAiInput,
  VideoNoteDto,
  WatchHistoryItem,
  ConversationDto,
  CourseAnalyticsDto,
  CourseAnnouncementDto,
  CourseDto,
  CourseMaterialDto,
  DailyChallengeDto,
  EssayGradeDto,
  ExamDto,
  FeatureControlMap,
  FlashcardDto,
  FormAnalyticsDto,
  FormDto,
  FormResponseDto,
  GroupDto,
  GroupMemberDto,
  GroupResourceDto,
  LeaderboardEntry,
  LibraryItemDto,
  LiveRoomDto,
  MasteryDto,
  Me,
  MessageDto,
  NoteDto,
  NotificationDto,
  Page,
  PomodoroCompleteDto,
  PomodoroSessionDto,
  PostDto,
  PronunciationResultDto,
  PronunciationStatsDto,
  PublicConfigDto,
  PublicProfile,
  QuizAttemptDto,
  QuizEditorDto,
  QuizResultDto,
  QuizSummaryDto,
  Reaction,
  ReportDto,
  RubricDto,
  SavedCollectionDto,
  SavedItemDto,
  ScheduledClassDto,
  SearchResultsDto,
  StudySessionDto,
  SubmissionDto,
  TaskDto,
  TaxonomyDto,
  UploadResultDto,
  UserSummary,
  AgeTier,
  GradeLevel,
  ParentalControls,
  CourseGradingDto,
  GradeComponentDto,
  ComponentSource,
  CourseGradebookDto,
  ReportCardDto,
  WeeklyPlanDto,
  WorkspaceFileDto,
  WorkspaceFolderDto,
} from '@qubedu/shared';
import { HttpClient, type ClientOptions } from './http';

type Q = Record<string, string | number | boolean | null | undefined>;
type Ok = { ok: true };

/** `FormData.append(name, blob, filename)` — typed loosely because React Native's FormData typings omit the filename overload. */
function appendFile(form: FormData, field: string, file: Blob, filename: string) {
  (form as unknown as { append: (n: string, v: Blob, f?: string) => void }).append(field, file, filename);
}

export interface SessionInfo {
  id: string;
  client: string;
  userAgent: string | null;
  ip: string | null;
  createdAt: number;
  lastUsedAt: number;
  current: boolean;
}

export function createApi(options: ClientOptions) {
  const http = new HttpClient(options);
  const enc = encodeURIComponent;

  return {
    http,
    config: () => http.request<PublicConfigDto>('GET', '/config', { anonymous: true }),
    taxonomy: () => http.request<TaxonomyDto>('GET', '/taxonomy', { anonymous: true }),
    adClick: (id: string) => http.post<Ok>(`/ads/${id}/click`),
    adImpressions: (ids: string[]) => http.post<Ok>('/ads/impressions', { ids }),
    reportClientError: (body: { message: string; stack?: string; url?: string; release?: string; kind?: string }) => http.post<Ok>('/client-errors', body),

    auth: {
      register: async (body: {
        email: string;
        password: string;
        displayName: string;
        accountType: 'student' | 'teacher' | 'parent';
        birthYear?: number;
        gradeLevel?: GradeLevel;
        parentEmail?: string;
        language?: string;
        timezone?: string;
      }) => http.acceptAuth(await http.request<AuthResult>('POST', '/auth/register', { body, anonymous: true })),
      login: async (body: { email: string; password: string }) =>
        http.acceptAuth(await http.request<AuthResult>('POST', '/auth/login', { body, anonymous: true })),
      /** Restores a session on app start (cookie on web, secure storage on mobile). */
      restore: async () => ((await http.refresh()) ? http.get<Me>('/me') : null),
      /** Mobile → in-app browser: a 60-second, single-use code that signs the web app in as this user. */
      handoff: () => http.post<{ code: string; expiresAt: number }>('/auth/handoff'),
      redeemHandoff: async (code: string) =>
        http.acceptAuth(await http.request<AuthResult>('POST', '/auth/handoff/redeem', { body: { code }, anonymous: true })),
      logout: async () => {
        let body: Record<string, string> = {};
        if (options.platform === 'mobile') {
          const rt = await options.tokenStore?.getRefreshToken?.();
          if (rt) body = { refreshToken: rt };
        }
        await http.request('POST', '/auth/logout', { body }).catch(() => undefined);
        await http.clearAuth();
      },
      logoutAll: async () => {
        await http.post('/auth/logout-all');
        await http.clearAuth();
      },
      sessions: () => http.get<{ items: SessionInfo[] }>('/auth/sessions'),
      revokeSession: (id: string) => http.del<Ok>(`/auth/sessions/${id}`),
      verifyEmail: (token: string) => http.request<Ok>('POST', '/auth/verify-email', { body: { token }, anonymous: true }),
      resendVerification: () => http.post<Ok>('/auth/resend-verification'),
      requestReset: (email: string) => http.request<Ok>('POST', '/auth/request-reset', { body: { email }, anonymous: true }),
      resetPassword: (token: string, password: string) => http.request<Ok>('POST', '/auth/reset-password', { body: { token, password }, anonymous: true }),
      changePassword: async (currentPassword: string, newPassword: string) =>
        http.acceptAuth(await http.post<AuthResult>('/auth/change-password', { currentPassword, newPassword })),
    },

    me: {
      get: () => http.get<Me>('/me'),
      update: (
        body: Partial<
          Pick<
            Me,
            | 'displayName'
            | 'username'
            | 'bio'
            | 'avatarUrl'
            | 'coverUrl'
            | 'gender'
            | 'educationLevel'
            | 'institution'
            | 'accountType'
            | 'birthYear'
            | 'gradeLevel'
          >
        >,
      ) => http.patch<Me>('/me', body),
      prefs: (body: {
        appearance?: Partial<Me['appearance']>;
        privacy?: Partial<Me['privacy']>;
        notifications?: Partial<Me['notificationPrefs']>;
        timezone?: string;
        dailyGoalMinutes?: number;
        onboardingDone?: boolean;
      }) => http.patch<Me>('/me/prefs', body),
      checkin: () => http.post<{ streak: number; changed: boolean; newAchievements: string[] }>('/me/checkin'),
      blocks: () => http.get<{ items: UserSummary[] }>('/me/blocks'),
      calendar: () => http.get<{ url: string }>('/me/calendar'),
      resetCalendar: () => http.post<{ url: string }>('/me/calendar/reset'),
      pushKey: () => http.get<{ enabled: boolean; vapidPublicKey: string | null }>('/me/push/key'),
      registerPush: (
        body: { kind: 'expo'; token: string; platform: 'ios' | 'android' } | { kind: 'web'; token: string; keys: { p256dh: string; auth: string } },
      ) => http.post<Ok>('/me/push', body),
      unregisterPush: (token: string) => http.del<Ok>('/me/push', { token }),
      export: () => http.request<Response>('GET', '/me/export', { raw: true }),
      delete: (password: string) => http.del<Ok>('/me', { password }),
    },

    teacher: {
      /** Quiz draft, summary, chapters or assignment ideas from a lesson, pasted text or an uploaded document. */
      ai: (body: Partial<TeacherAiInput> & Pick<TeacherAiInput, 'task'>) => http.post<TeacherAiResultDto>('/teacher/ai', body),
    },

    users: {
      list: (q: Q = {}) => http.get<Page<UserSummary>>('/users', q),
      suggested: () => http.get<{ items: UserSummary[] }>('/users/suggested'),
      leaderboard: (q: { period?: 'all' | 'week' | 'month'; scope?: 'global' | 'following'; limit?: number } = {}) =>
        http.get<{ items: LeaderboardEntry[] }>('/users/leaderboard', q),
      get: (id: string) => http.get<PublicProfile>(`/users/${id}`),
      byUsername: (u: string) => http.get<PublicProfile>(`/users/by-username/${enc(u)}`),
      follow: (id: string) => http.post<{ following: boolean; newAchievements: string[] }>(`/users/${id}/follow`),
      unfollow: (id: string) => http.del<{ following: boolean }>(`/users/${id}/follow`),
      block: (id: string) => http.post<{ blocked: boolean }>(`/users/${id}/block`),
      unblock: (id: string) => http.del<{ blocked: boolean }>(`/users/${id}/block`),
      followers: (id: string, q: Q = {}) => http.get<Page<UserSummary>>(`/users/${id}/followers`, q),
      following: (id: string, q: Q = {}) => http.get<Page<UserSummary>>(`/users/${id}/following`, q),
      groups: (id: string) =>
        http.get<{ items: { id: string; name: string; kind: string; avatarUrl: string | null; memberCount: number }[] }>(`/users/${id}/groups`),
      quizResults: (id: string) =>
        http.get<{ items: { quizId: string; title: string; pct: number; correct: number; total: number; at: number }[] }>(`/users/${id}/quiz-results`),
    },

    report: (body: { targetType: string; targetId: string; reason: string; details?: string }) => http.post<{ id: string; hidden: boolean }>('/reports', body),

    posts: {
      feed: (
        q: {
          scope?: 'all' | 'following' | 'mine' | 'foryou';
          authorId?: string;
          tag?: string;
          kind?: PostDto['kind'];
          unanswered?: boolean;
          materialId?: string;
          cursor?: string;
          limit?: number;
        } = {},
      ) => http.get<Page<PostDto>>('/posts', q),
      get: (id: string) => http.get<PostDto>(`/posts/${id}`),
      create: (body: {
        text: string;
        imageUrl?: string | null;
        groupId?: string | null;
        poll?: { options: string[]; multiple?: boolean; durationHours?: number };
        sharedPostId?: string | null;
        kind?: PostDto['kind'];
        materialId?: string | null;
      }) => http.post<PostDto & { newAchievements: string[] }>('/posts', body),
      accept: (id: string, commentId: string | null) => http.post<{ acceptedCommentId: string | null; solved: boolean }>(`/posts/${id}/accept`, { commentId }),
      voteComment: (id: string, commentId: string, on: boolean) =>
        http.put<{ votes: number; myVote: boolean }>(`/posts/${id}/comments/${commentId}/vote`, { on }),
      vote: (id: string, optionIds: string[]) => http.put<PostDto>(`/posts/${id}/vote`, { optionIds }),
      update: (id: string, text: string) => http.patch<PostDto>(`/posts/${id}`, { text }),
      remove: (id: string) => http.del<Ok>(`/posts/${id}`),
      pin: (id: string, pinned: boolean) => http.post<{ pinned: boolean }>(`/posts/${id}/pin`, { pinned }),
      react: (id: string, reaction: Reaction | null) =>
        http.put<{ reactionCounts: Record<string, number>; myReaction: Reaction | null }>(`/posts/${id}/reaction`, { reaction }),
      comments: (id: string, q: Q = {}) => http.get<Page<CommentDto>>(`/posts/${id}/comments`, q),
      comment: (id: string, text: string, audio?: CommentDto['audio']) => http.post<CommentDto>(`/posts/${id}/comments`, { text, audio: audio ?? undefined }),
      deleteComment: (id: string, commentId: string) => http.del<Ok>(`/posts/${id}/comments/${commentId}`),
    },

    videos: {
      captions: (id: string) => http.get<{ items: CaptionTrackDto[] }>(`/videos/${id}/captions`),
      saveCaptions: (id: string, language: string, content: string) => http.put<CaptionTrackDto>(`/videos/${id}/captions/${language}`, { content }),
      deleteCaptions: (id: string, language: string) => http.del<Ok>(`/videos/${id}/captions/${language}`),
      autoCaptions: (id: string, language: string) => http.post<CaptionTrackDto>(`/videos/${id}/captions-auto`, { language }),
      translateCaptions: (id: string, from: string, to: string) => http.post<CaptionTrackDto>(`/videos/${id}/captions/${from}/translate`, { to }),
      list: (
        q: {
          feed?: 'home' | 'trending' | 'subscriptions' | 'new' | 'liked';
          kind?: 'video' | 'short';
          q?: string;
          tag?: string;
          sectionId?: string;
          materialId?: string;
          ownerId?: string;
          cursor?: string;
          limit?: number;
        } = {},
      ) => http.get<Page<VideoDto>>('/videos', q),
      get: (id: string) => http.get<VideoDto>(`/videos/${id}`),
      create: (body: {
        kind?: 'video' | 'short';
        title: string;
        description?: string;
        videoUrl: string;
        thumbnailUrl?: string | null;
        durationSec: number;
        visibility?: 'public' | 'unlisted' | 'private';
        tags?: string[];
        sectionId?: string | null;
        materialId?: string | null;
        quizId?: string | null;
        allowComments?: boolean;
      }) => http.post<VideoDto>('/videos', body),
      update: (
        id: string,
        body: Partial<{
          title: string;
          description: string;
          thumbnailUrl: string | null;
          visibility: 'public' | 'unlisted' | 'private';
          tags: string[];
          sectionId: string | null;
          materialId: string | null;
          quizId: string | null;
          allowComments: boolean;
        }>,
      ) => http.patch<VideoDto>(`/videos/${id}`, body),
      notes: (id: string) => http.get<{ items: VideoNoteDto[] }>(`/videos/${id}/notes`),
      addNote: (id: string, atSec: number, text: string) => http.post<VideoNoteDto>(`/videos/${id}/notes`, { atSec, text }),
      deleteNote: (id: string, noteId: string) => http.del<Ok>(`/videos/${id}/notes/${noteId}`),
      remove: (id: string) => http.del<Ok>(`/videos/${id}`),
      view: (id: string) => http.post<{ counted: boolean; views: number }>(`/videos/${id}/view`),
      progress: (id: string, progressSec: number, completed = false) =>
        http.put<{ ok: true; studyMinutes: number; xpEarned: number; completed: boolean }>(`/videos/${id}/progress`, { progressSec, completed }),
      react: (id: string, value: 1 | -1 | 0) => http.put<{ likes: number; dislikes: number; myReaction: number }>(`/videos/${id}/reaction`, { value }),
      watchLater: (id: string, on: boolean) => http.put<{ watchLater: boolean }>(`/videos/${id}/watch-later`, { on }),
      related: (id: string) => http.get<{ items: VideoDto[] }>(`/videos/${id}/related`),
      comments: (id: string, q: { parentId?: string; sort?: 'top' | 'new'; cursor?: string; limit?: number } = {}) =>
        http.get<Page<VideoCommentDto>>(`/videos/${id}/comments`, q),
      comment: (id: string, text: string, parentId?: string | null) => http.post<VideoCommentDto>(`/videos/${id}/comments`, { text, parentId }),
      deleteComment: (id: string, commentId: string) => http.del<Ok>(`/videos/${id}/comments/${commentId}`),
      likeComment: (id: string, commentId: string, liked: boolean) =>
        http.put<{ liked: boolean; likes: number }>(`/videos/${id}/comments/${commentId}/like`, { liked }),
      pinComment: (id: string, commentId: string, pinned: boolean) => http.put<{ pinned: boolean }>(`/videos/${id}/comments/${commentId}/pin`, { pinned }),
      history: (q: { cursor?: string; limit?: number } = {}) => http.get<Page<WatchHistoryItem>>('/videos/me/history', q),
      clearHistory: () => http.del<Ok>('/videos/me/history'),
      removeFromHistory: (id: string) => http.del<Ok>(`/videos/me/history/${id}`),
      watchLaterList: (q: { cursor?: string; limit?: number } = {}) => http.get<Page<VideoDto>>('/videos/me/watch-later', q),
    },
    playlists: {
      mine: (videoId?: string) => http.get<{ items: PlaylistDto[] }>('/playlists/mine', { videoId }),
      create: (body: { title: string; description?: string; visibility?: 'public' | 'unlisted' | 'private' }) => http.post<PlaylistDto>('/playlists', body),
      get: (id: string) => http.get<{ playlist: PlaylistDto; videos: VideoDto[] }>(`/playlists/${id}`),
      update: (id: string, body: Partial<{ title: string; description: string; visibility: 'public' | 'unlisted' | 'private' }>) =>
        http.patch<PlaylistDto>(`/playlists/${id}`, body),
      remove: (id: string) => http.del<Ok>(`/playlists/${id}`),
      addItem: (id: string, videoId: string) => http.post<Ok>(`/playlists/${id}/items`, { videoId }),
      removeItem: (id: string, videoId: string) => http.del<Ok>(`/playlists/${id}/items/${videoId}`),
      reorder: (id: string, videoIds: string[]) => http.put<Ok>(`/playlists/${id}/order`, { videoIds }),
    },
    channels: { get: (userId: string) => http.get<VideoChannelDto>(`/channels/${userId}`) },
    practice: {
      pronunciation: (body: { language: 'ar' | 'en' | 'fr' | 'es'; phrase: string; heard: string }) =>
        http.post<PronunciationResultDto>('/practice/pronunciation', body),
      pronunciationStats: () => http.get<PronunciationStatsDto>('/practice/pronunciation/stats'),
    },
    studio: {
      overview: () => http.get<StudioOverviewDto>('/studio/overview'),
      videos: (q: { cursor?: string; limit?: number } = {}) => http.get<Page<VideoDto>>('/studio/videos', q),
      comments: () =>
        http.get<{ items: { id: string; videoId: string; text: string; createdAt: number; title: string; author: string }[] }>('/studio/comments'),
    },
    stories: {
      tray: () => http.get<{ items: StoryGroupDto[] }>('/stories'),
      create: (body: { mediaKind: 'image' | 'video' | 'text'; mediaUrl?: string | null; text?: string; bgColor?: string; durationSec?: number }) =>
        http.post<StoryDto>('/stories', body),
      view: (id: string) => http.post<Ok>(`/stories/${id}/view`),
      react: (id: string, emoji: string | null) => http.put<{ myReaction: string | null }>(`/stories/${id}/reaction`, { emoji }),
      viewers: (id: string) => http.get<{ items: StoryViewerDto[] }>(`/stories/${id}/viewers`),
      remove: (id: string) => http.del<Ok>(`/stories/${id}`),
    },
    events: {
      list: (q: { scope?: 'upcoming' | 'mine' | 'past'; groupId?: string; cursor?: string; limit?: number } = {}) => http.get<Page<EventDto>>('/events', q),
      get: (id: string) => http.get<EventDto>(`/events/${id}`),
      create: (body: {
        title: string;
        description?: string;
        coverUrl?: string | null;
        startsAt: number;
        endsAt?: number | null;
        location?: string;
        onlineUrl?: string | null;
        groupId?: string | null;
      }) => http.post<EventDto>('/events', body),
      update: (
        id: string,
        body: {
          title: string;
          description?: string;
          coverUrl?: string | null;
          startsAt: number;
          endsAt?: number | null;
          location?: string;
          onlineUrl?: string | null;
        },
      ) => http.patch<EventDto>(`/events/${id}`, body),
      remove: (id: string) => http.del<Ok>(`/events/${id}`),
      rsvp: (id: string, status: 'going' | 'interested' | 'none') =>
        http.put<{ myStatus: 'going' | 'interested' | null; goingCount: number; interestedCount: number }>(`/events/${id}/rsvp`, { status }),
      attendees: (id: string) => http.get<{ items: { status: 'going' | 'interested'; user: UserSummary }[] }>(`/events/${id}/attendees`),
    },
    explore: {
      home: () => http.get<ExploreDto>('/explore'),
      tags: (q: { hours?: number; limit?: number } = {}) => http.get<{ items: TrendingTagDto[] }>('/explore/tags', q),
      suggestTags: (q: string, signal?: AbortSignal) => http.get<{ items: { tag: string; count: number }[] }>('/explore/tags/suggest', { q }, signal),
      tag: (tag: string) => http.get<HashtagPageDto>(`/explore/tag/${enc(tag)}`),
    },

    notifications: {
      list: (q: Q = {}) => http.get<Page<NotificationDto> & { unread: number }>('/notifications', q),
      read: (ids?: string[]) => http.post<Ok>('/notifications/read', { ids }),
      remove: (id: string) => http.del<Ok>(`/notifications/${id}`),
      clear: () => http.del<Ok>('/notifications'),
    },

    upload: (file: Blob, name: string, purpose: string) => {
      const form = new FormData();
      appendFile(form, 'file', file, name);
      form.append('purpose', purpose);
      return http.request<UploadResultDto>('POST', '/uploads', { form });
    },

    chat: {
      conversations: (q: Q = {}) => http.get<{ items: ConversationDto[]; nextCursor: string | null }>('/chat/conversations', q),
      direct: (userId: string) => http.post<ConversationDto>('/chat/conversations/direct', { userId }),
      get: (id: string) => http.get<ConversationDto>(`/chat/conversations/${id}`),
      update: (id: string, body: { muted?: boolean; hidden?: boolean }) => http.patch<Ok>(`/chat/conversations/${id}`, body),
      messages: (id: string, q: Q = {}) => http.get<Page<MessageDto> & { peerLastReadAt: number | null }>(`/chat/conversations/${id}/messages`, q),
      send: (id: string, body: { text: string; attachment?: MessageDto['attachment']; replyToId?: string | null; clientId?: string }) =>
        http.post<MessageDto>(`/chat/conversations/${id}/messages`, body),
      read: (id: string) => http.post<{ ok: true; at: number }>(`/chat/conversations/${id}/read`),
      edit: (messageId: string, text: string) => http.patch<MessageDto>(`/chat/messages/${messageId}`, { text }),
      remove: (messageId: string) => http.del<Ok>(`/chat/messages/${messageId}`),
      react: (messageId: string, emoji: string) => http.post<MessageDto>(`/chat/messages/${messageId}/reactions`, { emoji }),
    },

    groups: {
      list: (q: { kind?: 'group' | 'community'; scope?: 'all' | 'mine' | 'discover'; q?: string; cursor?: string } = {}) =>
        http.get<Page<GroupDto>>('/groups', q),
      get: (id: string) => http.get<GroupDto>(`/groups/${id}`),
      create: (body: {
        kind: 'group' | 'community';
        name: string;
        description?: string;
        privacy: 'public' | 'private';
        avatarUrl?: string | null;
        coverUrl?: string | null;
        tags?: string[];
      }) => http.post<GroupDto & { newAchievements: string[] }>('/groups', body),
      update: (
        id: string,
        body: Partial<{ name: string; description: string; privacy: 'public' | 'private'; avatarUrl: string | null; coverUrl: string | null; tags: string[] }>,
      ) => http.patch<GroupDto>(`/groups/${id}`, body),
      remove: (id: string) => http.del<Ok>(`/groups/${id}`),
      join: (id: string, message?: string) => http.post<{ status: 'member' | 'requested' }>(`/groups/${id}/join`, { message }),
      cancelRequest: (id: string) => http.del<{ status: 'none' }>(`/groups/${id}/join`),
      leave: (id: string) => http.post<{ status: 'none' }>(`/groups/${id}/leave`),
      requests: (id: string) => http.get<{ items: { user: UserSummary; message: string; createdAt: number }[] }>(`/groups/${id}/requests`),
      decide: (id: string, userId: string, decision: 'approve' | 'reject') => http.post<Ok>(`/groups/${id}/requests/${userId}/${decision}`),
      members: (id: string, q: Q = {}) => http.get<Page<GroupMemberDto>>(`/groups/${id}/members`, q),
      setRole: (id: string, userId: string, role: 'admin' | 'teacher' | 'member') => http.patch<Ok>(`/groups/${id}/members/${userId}`, { role }),
      kick: (id: string, userId: string) => http.del<Ok>(`/groups/${id}/members/${userId}`),
      transfer: (id: string, userId: string) => http.post<Ok>(`/groups/${id}/transfer`, { userId }),
      posts: (id: string, q: Q = {}) => http.get<Page<PostDto>>(`/groups/${id}/posts`, q),
      leaderboard: (id: string) => http.get<{ items: LeaderboardEntry[] }>(`/groups/${id}/leaderboard`),
      resources: (id: string, q: Q = {}) => http.get<Page<GroupResourceDto>>(`/groups/${id}/resources`, q),
      addResource: (id: string, body: { title: string; url: string; kind: 'file' | 'link'; mime?: string | null; size?: number | null }) =>
        http.post<{ id: string }>(`/groups/${id}/resources`, body),
      removeResource: (id: string, resourceId: string) => http.del<Ok>(`/groups/${id}/resources/${resourceId}`),
      channels: (id: string) => http.get<{ items: ChannelDto[] }>(`/groups/${id}/channels`),
      addChannel: (id: string, body: { name: string; kind: 'text' | 'announcement' }) => http.post<ChannelDto>(`/groups/${id}/channels`, body),
      removeChannel: (id: string, channelId: string) => http.del<Ok>(`/groups/${id}/channels/${channelId}`),
    },

    quizzes: {
      list: (q: Q = {}) => http.get<Page<QuizSummaryDto>>('/quizzes', q),
      get: (id: string) => http.get<QuizSummaryDto>(`/quizzes/${id}`),
      editor: (id: string) => http.get<QuizEditorDto>(`/quizzes/${id}/edit`),
      create: (body: Omit<QuizEditorDto, 'id'>) => http.post<QuizSummaryDto>('/quizzes', body),
      update: (id: string, body: Omit<QuizEditorDto, 'id'>) => http.put<QuizSummaryDto>(`/quizzes/${id}`, body),
      remove: (id: string) => http.del<Ok>(`/quizzes/${id}`),
      stats: (id: string) =>
        http.get<{
          attempts: number;
          averagePct: number | null;
          questions: { id: string; prompt: string; correct: number; total: number }[];
          leaderboard: { user: UserSummary; pct: number }[];
        }>(`/quizzes/${id}/stats`),
      start: (id: string, review = false) => http.post<QuizAttemptDto>(`/quizzes/${id}/attempts`, { review }),
      adaptive: (body: { courseId?: string | null; topic?: string | null; count?: number }) => http.post<QuizAttemptDto>('/quizzes/adaptive', body),
      attempt: (attemptId: string) =>
        http.get<{ submitted: true; result: QuizResultDto } | { submitted: false; attempt: QuizAttemptDto }>(`/quizzes/attempts/${attemptId}`),
      submit: (attemptId: string, answers: (number | number[] | string | null)[]) =>
        http.post<QuizResultDto>(`/quizzes/attempts/${attemptId}/submit`, { answers }),
      history: () =>
        http.get<{
          items: {
            attemptId: string;
            quizId: string | null;
            title: string | null;
            adaptive: boolean;
            review: boolean;
            pct: number;
            correct: number;
            total: number;
            xpEarned: number;
            submittedAt: number;
          }[];
        }>('/quizzes/history'),
      mastery: () => http.get<{ items: MasteryDto[] }>('/quizzes/mastery'),
    },

    flashcards: {
      list: (q: { due?: boolean; deck?: string } = {}) =>
        http.get<{ items: FlashcardDto[]; dueCount: number; decks: { name: string; count: number }[] }>('/flashcards', q),
      create: (cards: { front: string; back: string; deck?: string; topic?: string | null; courseId?: string | null }[]) =>
        http.post<{ items: FlashcardDto[] }>('/flashcards', { cards }),
      update: (id: string, body: Partial<{ front: string; back: string; deck: string; topic: string | null }>) =>
        http.patch<FlashcardDto>(`/flashcards/${id}`, body),
      remove: (id: string) => http.del<Ok>(`/flashcards/${id}`),
      review: (id: string, rating: 'again' | 'unsure' | 'know' | 'easy', reviewedAt?: number) =>
        http.post<{ card: FlashcardDto; newAchievements: string[] }>(`/flashcards/${id}/review`, { rating, reviewedAt }),
    },

    pomodoro: {
      active: () => http.get<{ session: PomodoroSessionDto | null }>('/pomodoro/active'),
      stats: () => http.get<{ weekSessions: number; weekMinutes: number; totalSessions: number }>('/pomodoro/stats'),
      start: (minutes: number, label?: string) => http.post<PomodoroSessionDto>('/pomodoro/start', { minutes, label }),
      complete: (id: string) => http.post<PomodoroCompleteDto>(`/pomodoro/${id}/complete`),
      cancel: (id: string) => http.post<Ok>(`/pomodoro/${id}/cancel`),
    },

    daily: {
      get: () => http.get<{ challenge: DailyChallengeDto | null }>('/daily-challenge'),
      answer: (answer?: number) => http.post<{ challenge: DailyChallengeDto }>('/daily-challenge/answer', { answer }),
    },

    tasks: {
      list: (status?: 'todo' | 'doing' | 'done' | 'open') => http.get<{ items: TaskDto[] }>('/tasks', { status }),
      create: (body: Partial<Omit<TaskDto, 'id' | 'createdAt' | 'completedAt'>> & { title: string }) => http.post<TaskDto>('/tasks', body),
      update: (id: string, body: Partial<Omit<TaskDto, 'id' | 'createdAt' | 'completedAt'>>) => http.patch<TaskDto>(`/tasks/${id}`, body),
      remove: (id: string) => http.del<Ok>(`/tasks/${id}`),
    },
    notes: {
      list: () => http.get<{ items: NoteDto[] }>('/notes'),
      create: (body: Partial<Omit<NoteDto, 'id' | 'createdAt' | 'updatedAt'>>) => http.post<NoteDto>('/notes', body),
      update: (id: string, body: Partial<Omit<NoteDto, 'id' | 'createdAt' | 'updatedAt'>>) => http.patch<NoteDto>(`/notes/${id}`, body),
      remove: (id: string) => http.del<Ok>(`/notes/${id}`),
    },
    exams: {
      list: () => http.get<{ items: ExamDto[] }>('/exams'),
      create: (body: { subject: string; day: string; time?: string | null; place?: string | null; notes?: string | null }) =>
        http.post<ExamDto>('/exams', body),
      update: (id: string, body: Partial<{ subject: string; day: string; time: string | null; place: string | null; notes: string | null }>) =>
        http.patch<ExamDto>(`/exams/${id}`, body),
      remove: (id: string) => http.del<Ok>(`/exams/${id}`),
      ics: () => http.request<Response>('GET', '/exams/calendar.ics', { raw: true }),
    },
    sessions: {
      list: (q: { from?: string; to?: string } = {}) => http.get<{ items: StudySessionDto[] }>('/study-sessions', q),
      create: (body: Omit<StudySessionDto, 'id'>) => http.post<StudySessionDto>('/study-sessions', body),
      update: (id: string, body: Partial<Omit<StudySessionDto, 'id'>>) => http.patch<StudySessionDto>(`/study-sessions/${id}`, body),
      remove: (id: string) => http.del<Ok>(`/study-sessions/${id}`),
    },
    academic: {
      dashboard: () => http.get<AcademicDashboardDto>('/academic/dashboard'),
      weeklyPlan: (q: { budget?: number; days?: number } = {}) => http.get<WeeklyPlanDto>('/academic/weekly-plan', q),
      studyLog: (days = 90) => http.get<{ items: { day: string; minutes: number; quizzes: number; cards: number }[] }>('/academic/study-log', { days }),
    },

    catalog: {
      list: (q: { q?: string; limit?: number } = {}) => http.get<{ items: CatalogCourseDto[] }>('/catalog', q),
      get: (id: string) => http.get<CatalogCourseDto>(`/catalog/${id}`),
      enroll: (id: string) => http.post<CourseDto>(`/catalog/${id}/enroll`),
      checkout: (id: string) => http.post<{ url: string }>(`/catalog/${id}/checkout`),
    },

    certificates: {
      mine: () => http.get<{ items: CertificateDto[] }>('/certificates/mine'),
      course: (courseId: string) => http.get<{ items: CertificateDto[] }>(`/certificates/course/${courseId}`),
      issue: (courseId: string, body: { studentIds?: string[]; minGrade?: number; title?: string }) =>
        http.post<{ issued: number }>(`/certificates/course/${courseId}`, body),
      revoke: (id: string) => http.del<Ok>(`/certificates/${id}`),
      verify: (code: string) => http.get<CertificateVerifyDto>(`/certificates/verify/${encodeURIComponent(code)}`),
    },

    leagues: {
      me: () => http.get<LeagueDto>('/leagues/me'),
    },

    family: {
      get: () => http.get<FamilyDto>('/family'),
      code: () => http.post<{ code: string; expiresAt: number }>('/family/code'),
      link: (code: string) => http.post<{ child: UserSummary | null }>('/family/link', { code }),
      unlink: (otherId: string) => http.del<Ok>(`/family/${otherId}`),
      child: (id: string) => http.get<ChildReportDto>(`/family/children/${id}`),
      invite: (email: string) => http.post<Ok>('/family/invite', { email }),
      request: (who: string) => http.post<Ok>('/family/request', { who }),
      acceptRequest: (id: string) => http.post<Ok>(`/family/requests/${id}/accept`),
      removeRequest: (id: string) => http.del<Ok>(`/family/requests/${id}`),
      acceptInvite: (token: string) => http.post<{ child: UserSummary | null }>('/family/invite/accept', { token }),
      setControls: (childId: string, body: Partial<ParentalControls> & { gradeLevel?: GradeLevel }) =>
        http.put<{ tier: AgeTier; controls: ParentalControls; gradeLevel: GradeLevel | null }>(`/family/children/${childId}/controls`, body),
    },

    school: {
      redeem: (code: string) => http.post<CourseDto>('/school/redeem', { code }),
      vouchers: (courseId: string) => http.get<{ items: VoucherDto[] }>(`/school/courses/${courseId}/vouchers`),
      makeVouchers: (courseId: string, count: number) => http.post<{ codes: string[] }>(`/school/courses/${courseId}/vouchers`, { count }),
      insights: (courseId: string) => http.get<CourseInsightsDto>(`/school/courses/${courseId}/insights`),
      atRisk: () => http.get<{ items: (StudentInsightDto & { courses: string[] })[] }>('/school/at-risk'),
      components: (courseId: string) => http.get<{ grading: CourseGradingDto; items: GradeComponentDto[] }>(`/school/courses/${courseId}/components`),
      saveComponents: (courseId: string, components: { id?: string; name: string; maxMarks: number; source: ComponentSource }[]) =>
        http.put<{ grading: CourseGradingDto; items: GradeComponentDto[] }>(`/school/courses/${courseId}/components`, { components }),
      saveMarks: (courseId: string, marks: { componentId: string; studentId: string; marks: number | null }[]) =>
        http.put<{ ok: true; saved: number }>(`/school/courses/${courseId}/marks`, { marks }),
      gradebook: (courseId: string) => http.get<CourseGradebookDto>(`/school/courses/${courseId}/gradebook`),
      reportCard: (q: { studentId?: string; term?: string } = {}) => http.get<ReportCardDto>('/school/report-card', q),
      roster: (courseId: string, emails: string[]) =>
        http.post<{ added: number; already: number; invited: number }>(`/school/courses/${courseId}/roster`, { emails }),
      nudge: (courseId: string, studentId: string, message: string) => http.post<Ok>(`/school/courses/${courseId}/nudge`, { studentId, message }),
      courses: (archived = false) => http.get<{ items: CourseDto[] }>('/school/courses', { archived }),
      create: (body: { title: string; description?: string; subject?: string | null; coverUrl?: string | null; color?: string | null }) =>
        http.post<CourseDto>('/school/courses', body),
      join: (code: string) => http.post<CourseDto>('/school/join', { code }),
      get: (id: string) => http.get<CourseDto>(`/school/courses/${id}`),
      update: (
        id: string,
        body: Partial<{
          title: string;
          description: string;
          subject: string | null;
          coverUrl: string | null;
          color: string | null;
          archived: boolean;
          listed: boolean;
          priceCents: number;
          currency: string;
          regenerateCode: boolean;
          subjectCode: string | null;
          maxMarks: number;
          passMarks: number;
          countsInTotal: boolean;
          term: string | null;
        }>,
      ) => http.patch<CourseDto>(`/school/courses/${id}`, body),
      remove: (id: string) => http.del<Ok>(`/school/courses/${id}`),
      members: (id: string) =>
        http.get<{ items: { user: UserSummary; role: 'teacher' | 'assistant' | 'student'; joinedAt: number }[] }>(`/school/courses/${id}/members`),
      setMemberRole: (id: string, userId: string, role: 'assistant' | 'student') => http.patch<Ok>(`/school/courses/${id}/members/${userId}`, { role }),
      removeMember: (id: string, userId: string) => http.del<Ok>(`/school/courses/${id}/members/${userId}`),
      announcements: (id: string) => http.get<{ items: CourseAnnouncementDto[] }>(`/school/courses/${id}/announcements`),
      announce: (id: string, body: { text: string; attachments?: CourseAnnouncementDto['attachments'] }) =>
        http.post<{ id: string }>(`/school/courses/${id}/announcements`, body),
      deleteAnnouncement: (id: string, annId: string) => http.del<Ok>(`/school/courses/${id}/announcements/${annId}`),
      assignments: (id: string) => http.get<{ items: AssignmentDto[] }>(`/school/courses/${id}/assignments`),
      createAssignment: (id: string, body: Partial<AssignmentDto> & { title: string }) => http.post<AssignmentDto>(`/school/courses/${id}/assignments`, body),
      assignment: (assignmentId: string) => http.get<AssignmentDto>(`/school/assignments/${assignmentId}`),
      updateAssignment: (assignmentId: string, body: Partial<AssignmentDto>) => http.patch<AssignmentDto>(`/school/assignments/${assignmentId}`, body),
      deleteAssignment: (assignmentId: string) => http.del<Ok>(`/school/assignments/${assignmentId}`),
      submit: (assignmentId: string, body: { text: string; attachments: SubmissionDto['attachments'] }) =>
        http.post<SubmissionDto>(`/school/assignments/${assignmentId}/submit`, body),
      unsubmit: (assignmentId: string) => http.del<Ok>(`/school/assignments/${assignmentId}/submit`),
      submissions: (assignmentId: string) => http.get<{ items: SubmissionDto[] }>(`/school/assignments/${assignmentId}/submissions`),
      grade: (
        submissionId: string,
        body: { grade: number; feedback?: string; feedbackAudio?: SubmissionDto['feedbackAudio']; rubricScores?: Record<string, number>; returned?: boolean },
      ) => http.post<SubmissionDto>(`/school/submissions/${submissionId}/grade`, body),
      rubrics: (id: string) => http.get<{ items: RubricDto[] }>(`/school/courses/${id}/rubrics`),
      createRubric: (id: string, body: Omit<RubricDto, 'id' | 'courseId'>) => http.post<RubricDto>(`/school/courses/${id}/rubrics`, body),
      deleteRubric: (rubricId: string) => http.del<Ok>(`/school/rubrics/${rubricId}`),
      attendance: (id: string) => http.get<{ items: AttendanceSessionDto[] }>(`/school/courses/${id}/attendance`),
      createAttendance: (id: string, body: { title: string; day: string }) => http.post<AttendanceSessionDto>(`/school/courses/${id}/attendance`, body),
      markAttendance: (sessionId: string, records: { studentId: string; status: 'present' | 'absent' | 'late' | 'excused' }[]) =>
        http.put<{ ok: true; saved: number }>(`/school/attendance/${sessionId}`, { records }),
      deleteAttendance: (sessionId: string) => http.del<Ok>(`/school/attendance/${sessionId}`),
      materials: (id: string) => http.get<{ items: CourseMaterialDto[] }>(`/school/courses/${id}/materials`),
      addMaterial: (id: string, body: { title: string; text?: string; topic?: string | null; fileUrl?: string | null; visibleToStudents?: boolean }) =>
        http.post<CourseMaterialDto>(`/school/courses/${id}/materials`, body),
      deleteMaterial: (materialId: string) => http.del<Ok>(`/school/materials/${materialId}`),
      essayKeys: (id: string) =>
        http.get<{ items: { id: string; prompt: string; topic: string | null; keyPointCount: number; modelAnswer?: string; keyPoints?: string[] }[] }>(
          `/school/courses/${id}/essay-keys`,
        ),
      addEssayKey: (id: string, body: { prompt: string; modelAnswer?: string; keyPoints: string[]; topic?: string | null }) =>
        http.post<{ id: string }>(`/school/courses/${id}/essay-keys`, body),
      deleteEssayKey: (keyId: string) => http.del<Ok>(`/school/essay-keys/${keyId}`),
      synonyms: (id: string) => http.get<{ items: { id: string; term: string; synonyms: string[] }[] }>(`/school/courses/${id}/synonyms`),
      addSynonym: (id: string, body: { term: string; synonyms: string[] }) => http.post<Ok>(`/school/courses/${id}/synonyms`, body),
      deleteSynonym: (synId: string) => http.del<Ok>(`/school/synonyms/${synId}`),
      grades: (id: string) =>
        http.get<{
          assignments: { id: string; title: string; points: number; dueAt: number | null }[];
          rows: { student: UserSummary; grades: Record<string, { status: string; grade: number | null; late: boolean } | null> }[];
        }>(`/school/courses/${id}/grades`),
      analytics: (id: string) => http.get<CourseAnalyticsDto>(`/school/courses/${id}/analytics`),
    },

    live: {
      list: (q: { scopeType?: string; scopeId?: string } = {}) => http.get<{ items: LiveRoomDto[] }>('/live', q),
      create: (body: {
        title: string;
        scopeType: LiveRoomDto['scopeType'];
        scopeId?: string | null;
        scheduledAt?: number | null;
        settings?: LiveRoomDto['settings'];
      }) => http.post<LiveRoomDto>('/live', body),
      get: (id: string) => http.get<LiveRoomDto>(`/live/${id}`),
      start: (id: string) => http.post<LiveRoomDto>(`/live/${id}/start`),
      end: (id: string) => http.post<LiveRoomDto>(`/live/${id}/end`),
      settings: (id: string, settings: LiveRoomDto['settings']) => http.put<{ settings: LiveRoomDto['settings'] }>(`/live/${id}/settings`, settings),
      moderate: (id: string, action: string, targetUserId?: string) => http.post<Ok>(`/live/${id}/moderate`, { action, targetUserId }),
      whiteboard: (id: string) => http.get<{ strokes: unknown[] }>(`/live/${id}/whiteboard`),
      saveWhiteboard: (id: string, strokes: unknown[]) => http.put<Ok>(`/live/${id}/whiteboard`, { strokes }),
      remove: (id: string) => http.del<Ok>(`/live/${id}`),
    },
    classes: {
      list: () => http.get<{ items: ScheduledClassDto[] }>('/classes'),
      create: (body: { title: string; subject?: string | null; description?: string; link: string; startsAt?: number | null }) =>
        http.post<{ id: string }>('/classes', body),
      remove: (id: string) => http.del<Ok>(`/classes/${id}`),
    },

    forms: {
      mine: () => http.get<{ items: FormDto[] }>('/forms'),
      create: (body: Pick<FormDto, 'title' | 'description' | 'settings' | 'questions' | 'published'>) => http.post<FormDto>('/forms', body),
      get: (id: string) => http.get<FormDto>(`/forms/${id}`),
      update: (id: string, body: Pick<FormDto, 'title' | 'description' | 'settings' | 'questions' | 'published'>) => http.put<FormDto>(`/forms/${id}`, body),
      duplicate: (id: string) => http.post<FormDto>(`/forms/${id}/duplicate`),
      remove: (id: string) => http.del<Ok>(`/forms/${id}`),
      public: (slug: string) => http.get<FormDto>(`/forms/public/${enc(slug)}`),
      respond: (slug: string, body: { answers: Record<string, string | string[] | number>; email?: string }) =>
        http.post<{ id: string; score: number | null; confirmationMessage: string }>(`/forms/public/${enc(slug)}/responses`, body),
      responses: (id: string, q: Q = {}) => http.get<Page<FormResponseDto>>(`/forms/${id}/responses`, q),
      deleteResponse: (id: string, responseId: string) => http.del<Ok>(`/forms/${id}/responses/${responseId}`),
      analytics: (id: string) => http.get<FormAnalyticsDto>(`/forms/${id}/analytics`),
      exportCsv: (id: string) => http.request<Response>('GET', `/forms/${id}/export.csv`, { raw: true }),
    },

    library: {
      list: (q: Q = {}) => http.get<Page<LibraryItemDto>>('/library', q),
      create: (body: {
        title: string;
        description?: string;
        category: LibraryItemDto['category'];
        sectionId?: string | null;
        materialId?: string | null;
        fileUrl: string;
        mime: string;
        size: number;
        coverUrl?: string | null;
      }) => http.post<{ id: string; approved: boolean }>('/library', body),
      approve: (id: string) => http.post<Ok>(`/library/${id}/approve`),
      download: (id: string) => http.post<{ url: string }>(`/library/${id}/download`),
      remove: (id: string) => http.del<Ok>(`/library/${id}`),
    },

    workspace: {
      list: () => http.get<{ folders: WorkspaceFolderDto[]; files: WorkspaceFileDto[] }>('/workspace'),
      createFolder: (name: string, parentId?: string | null) => http.post<WorkspaceFolderDto>('/workspace/folders', { name, parentId }),
      renameFolder: (id: string, name: string) => http.patch<WorkspaceFolderDto>(`/workspace/folders/${id}`, { name }),
      deleteFolder: (id: string) => http.del<Ok>(`/workspace/folders/${id}`),
      createFile: (body: { title: string; kind: WorkspaceFileDto['kind']; folderId?: string | null; content?: unknown }) =>
        http.post<WorkspaceFileDto>('/workspace/files', body),
      file: (id: string) => http.get<WorkspaceFileDto>(`/workspace/files/${id}`),
      updateFile: (id: string, body: { version: number; title?: string; folderId?: string | null; content?: unknown }) =>
        http.patch<WorkspaceFileDto>(`/workspace/files/${id}`, body),
      deleteFile: (id: string) => http.del<Ok>(`/workspace/files/${id}`),
      import: (file: Blob, name: string) => {
        const form = new FormData();
        appendFile(form, 'file', file, name);
        return http.request<{ title: string; text: string; chunks: { heading: string | null; page: number | null; text: string }[] }>(
          'POST',
          '/workspace/import',
          { form },
        );
      },
    },

    saved: {
      list: (q: { collectionId?: string; type?: string } = {}) => http.get<{ items: SavedItemDto[]; collections: SavedCollectionDto[] }>('/saved', q),
      add: (body: {
        itemType: SavedItemDto['itemType'];
        refId?: string | null;
        title: string;
        url?: string | null;
        note?: string;
        collectionId?: string | null;
      }) => http.post<SavedItemDto>('/saved', body),
      update: (id: string, body: { note?: string; collectionId?: string | null; title?: string }) => http.patch<SavedItemDto>(`/saved/${id}`, body),
      remove: (id: string) => http.del<Ok>(`/saved/${id}`),
      removeByRef: (type: string, refId: string) => http.del<Ok>(`/saved/by-ref/${enc(type)}/${enc(refId)}`),
      createCollection: (body: { name: string; description?: string; isPublic: boolean }) => http.post<SavedCollectionDto>('/saved/collections', body),
      updateCollection: (id: string, body: Partial<{ name: string; description: string; isPublic: boolean }>) =>
        http.patch<SavedCollectionDto>(`/saved/collections/${id}`, body),
      deleteCollection: (id: string) => http.del<Ok>(`/saved/collections/${id}`),
      public: (slug: string) =>
        http.request<{ collection: SavedCollectionDto; owner: UserSummary; items: SavedItemDto[] }>('GET', `/saved/public/${enc(slug)}`, { anonymous: true }),
    },

    search: (q: string, signal?: AbortSignal) => http.get<SearchResultsDto>('/search', { q }, signal),

    ai: {
      courses: () => http.get<{ items: { id: string; title: string; subject: string | null; materials: number }[] }>('/ai/courses'),
      quota: () => http.get<{ enabled: boolean; limit: number; used: number }>('/ai/quota'),
      solve: (body: { question: string; material?: string; options?: string[]; courseId?: string | null; mode?: 'solve' | 'explain' | 'summarize' | 'quiz' }) =>
        http.post<AiAnswerDto>('/ai/solve', body),
      gradeEssay: (body: { answer: string; keyId?: string; modelAnswer?: string; keyPoints?: string[] }) => http.post<EssayGradeDto>('/ai/grade-essay', body),
      explain: (attemptId: string, questionId: string) => http.post<AiAnswerDto>('/ai/explain', { attemptId, questionId }),
    },
    assistant: {
      threads: () => http.get<{ items: AssistantThreadDto[] }>('/assistant/threads'),
      thread: (id: string) => http.get<{ thread: AssistantThreadDto; messages: AssistantMessageDto[] }>(`/assistant/threads/${id}`),
      deleteThread: (id: string) => http.del<Ok>(`/assistant/threads/${id}`),
      send: (body: { threadId?: string | null; text: string; language?: string }) =>
        http.post<{ threadId: string; userMessage: AssistantMessageDto; message: AssistantMessageDto; remainingQuota: number }>('/assistant/messages', body),
      feedback: (messageId: string, rating: 'up' | 'down', comment?: string) => http.post<Ok>('/assistant/feedback', { messageId, rating, comment }),
    },

    admin: {
      overview: () => http.get<AdminOverviewDto>('/admin/overview'),
      users: (q: Q = {}) => http.get<Page<AdminUserDto>>('/admin/users', q),
      user: (id: string) =>
        http.get<{
          user: AdminUserDto;
          stats: { posts: number; attempts: number; reports: number; xp: number; streak: number };
          sessions: { id: string; client: string; userAgent: string | null; ip: string | null; lastUsedAt: number }[];
        }>(`/admin/users/${id}`),
      ban: (id: string, reason: string, until?: number | null) => http.post<Ok>(`/admin/users/${id}/ban`, { reason, until }),
      unban: (id: string) => http.post<Ok>(`/admin/users/${id}/unban`),
      setRole: (id: string, role: 'user' | 'moderator' | 'admin') => http.put<Ok>(`/admin/users/${id}/role`, { role }),
      setPermissions: (id: string, permissions: string[]) => http.put<Ok>(`/admin/users/${id}/permissions`, { permissions }),
      setBirthYear: (id: string, birthYear: number | null) => http.put<Ok>(`/admin/users/${id}/birth-year`, { birthYear }),
      setBadge: (id: string, badge: { enabled: boolean; label: string; color: string; icon?: string; shape?: string }) =>
        http.put<Ok>(`/admin/users/${id}/badge`, badge),
      revokeSessions: (id: string) => http.post<Ok>(`/admin/users/${id}/revoke-sessions`),
      deleteUser: (id: string) => http.del<Ok>(`/admin/users/${id}`),
      reports: (q: Q = {}) => http.get<Page<ReportDto>>('/admin/reports', q),
      resolveReport: (id: string, body: { status: 'resolved' | 'dismissed'; resolution?: string; removeContent?: boolean; closeSimilar?: boolean }) =>
        http.post<Ok>(`/admin/reports/${id}/resolve`, body),
      announcements: () => http.get<{ items: AnnouncementDto[] }>('/admin/announcements'),
      createAnnouncement: (body: Omit<AnnouncementDto, 'id' | 'createdAt'>) => http.post<AnnouncementDto>('/admin/announcements', body),
      updateAnnouncement: (id: string, body: Omit<AnnouncementDto, 'id' | 'createdAt'>) => http.put<AnnouncementDto>(`/admin/announcements/${id}`, body),
      deleteAnnouncement: (id: string) => http.del<Ok>(`/admin/announcements/${id}`),
      ads: () => http.get<{ items: AdDto[] }>('/admin/ads'),
      createAd: (body: Pick<AdDto, 'title' | 'subtitle' | 'link' | 'imageUrl' | 'placement' | 'active'>) => http.post<AdDto>('/admin/ads', body),
      updateAd: (id: string, body: Pick<AdDto, 'title' | 'subtitle' | 'link' | 'imageUrl' | 'placement' | 'active'>) =>
        http.put<AdDto>(`/admin/ads/${id}`, body),
      deleteAd: (id: string) => http.del<Ok>(`/admin/ads/${id}`),
      broadcast: (body: { title: string; body?: string; link?: string; audience?: 'all' | 'students' | 'teachers' }) =>
        http.post<{ ok: true; recipients: number }>('/admin/broadcast', body),
      createSection: (body: { name: string; sort?: number }) => http.post<{ id: string }>('/admin/sections', body),
      updateSection: (id: string, body: { name: string; sort?: number }) => http.put<{ id: string }>(`/admin/sections/${id}`, body),
      deleteSection: (id: string) => http.del<Ok>(`/admin/sections/${id}`),
      createMaterial: (body: { sectionId: string; name: string; sort?: number }) => http.post<{ id: string }>('/admin/materials', body),
      updateMaterial: (id: string, body: { sectionId: string; name: string; sort?: number }) => http.put<{ id: string }>(`/admin/materials/${id}`, body),
      deleteMaterial: (id: string) => http.del<Ok>(`/admin/materials/${id}`),
      dailyChallenges: () =>
        http.get<{
          items: {
            day: string;
            type: 'quiz' | 'social';
            title: string;
            description: string;
            question: string | null;
            options: string[];
            answer: number | null;
            xp: number;
          }[];
        }>('/admin/daily-challenges'),
      saveDailyChallenge: (body: {
        day: string;
        type: 'quiz' | 'social';
        title: string;
        description?: string;
        question?: string | null;
        options?: string[];
        answer?: number | null;
        xp?: number;
      }) => http.put<Ok>('/admin/daily-challenges', body),
      deleteDailyChallenge: (day: string) => http.del<Ok>(`/admin/daily-challenges/${day}`),
      features: () => http.get<{ features: FeatureControlMap }>('/admin/features'),
      saveFeatures: (features: FeatureControlMap) => http.put<{ features: FeatureControlMap }>('/admin/features', features),
      settings: () =>
        http.get<{
          features: FeatureControlMap;
          maintenance: { enabled: boolean; message: string };
          registrationOpen: boolean;
          contact: Record<string, string>;
          ai: { enabled: boolean; dailyQuota: number };
          uploads: { enabled: boolean };
          moderation: { enabled: boolean; mask: string[]; block: string[]; autoHideReports: number };
        }>('/admin/settings'),
      saveSettings: (body: Record<string, unknown>) => http.put<unknown>('/admin/settings', body),
      errors: () => http.get<{ items: ClientErrorDto[] }>('/admin/errors'),
      clearErrors: () => http.del<Ok>('/admin/errors'),
      audit: (q: Q = {}) => http.get<Page<AuditEntryDto>>('/admin/audit', q),
      knowledge: () => http.get<{ items: AssistantKnowledgeDto[] }>('/admin/assistant-knowledge'),
      addKnowledge: (items: Omit<AssistantKnowledgeDto, 'id' | 'createdAt'>[]) =>
        http.post<{ ok: true; added: number }>('/admin/assistant-knowledge', { items }),
      updateKnowledge: (id: string, body: Omit<AssistantKnowledgeDto, 'id' | 'createdAt'>) => http.put<Ok>(`/admin/assistant-knowledge/${id}`, body),
      deleteKnowledge: (id: string) => http.del<Ok>(`/admin/assistant-knowledge/${id}`),
      assistantFeedback: () =>
        http.get<{ up: number; down: number; items: { id: string; content: string; rating: 'up' | 'down'; feedback: string | null; createdAt: number }[] }>(
          '/admin/assistant-feedback',
        ),
      cleanup: () => http.post<{ sessions: number; tokens: number; notifications: number; abandonedAttempts: number }>('/admin/maintenance/cleanup'),
      recomputeLevels: () => http.post<{ checked: number; fixed: number }>('/admin/maintenance/recompute-levels'),
    },
  };
}

export type Api = ReturnType<typeof createApi>;
