import { sql } from 'drizzle-orm';
import {
  boolean,
  date,
  doublePrecision,
  index,
  integer,
  jsonb,
  pgEnum,
  pgTable,
  primaryKey,
  real,
  text,
  timestamp,
  uniqueIndex,
  uuid,
} from 'drizzle-orm/pg-core';

/** Millisecond precision keeps (created_at, id) cursors exact with JS Date values. */
const ts = (name: string) => timestamp(name, { withTimezone: true, mode: 'date', precision: 3 });
const createdAt = () => ts('created_at').notNull().defaultNow();
const updatedAt = () => ts('updated_at').notNull().defaultNow();
const id = () => uuid('id').primaryKey().defaultRandom();

export const roleEnum = pgEnum('role', ['user', 'moderator', 'admin', 'root']);
export const accountTypeEnum = pgEnum('account_type', ['student', 'teacher', 'parent']);
export const groupKindEnum = pgEnum('group_kind', ['group', 'community']);
export const privacyEnum = pgEnum('group_privacy', ['public', 'private']);
export const groupRoleEnum = pgEnum('group_role', ['owner', 'admin', 'teacher', 'member']);
export const conversationKindEnum = pgEnum('conversation_kind', ['direct', 'group', 'channel', 'live']);
export const courseRoleEnum = pgEnum('course_role', ['teacher', 'assistant', 'student']);

/* ───────────────────────── Accounts ───────────────────────── */

export const users = pgTable(
  'users',
  {
    id: id(),
    email: text('email').notNull(),
    passwordHash: text('password_hash'),
    emailVerifiedAt: ts('email_verified_at'),
    username: text('username'),
    displayName: text('display_name').notNull(),
    searchName: text('search_name').notNull().default(''),
    avatarUrl: text('avatar_url'),
    coverUrl: text('cover_url'),
    bio: text('bio').notNull().default(''),
    accountType: accountTypeEnum('account_type').notNull().default('student'),
    role: roleEnum('role').notNull().default('user'),
    permissions: jsonb('permissions').$type<string[]>().notNull().default([]),
    gender: text('gender'),
    educationLevel: text('education_level'),
    institution: text('institution'),
    /** Used only to apply under-18 protections; never shown to other people. */
    birthYear: integer('birth_year'),
    xp: integer('xp').notNull().default(0),
    level: integer('level').notNull().default(1),
    streak: integer('streak').notNull().default(0),
    lastStreakDay: date('last_streak_day', { mode: 'string' }),
    quizCount: integer('quiz_count').notNull().default(0),
    perfectCount: integer('perfect_count').notNull().default(0),
    pomodoroCount: integer('pomodoro_count').notNull().default(0),
    cardReviews: integer('card_reviews').notNull().default(0),
    studyMinutes: integer('study_minutes').notNull().default(0),
    appearance: jsonb('appearance').$type<Record<string, unknown>>().notNull().default({}),
    privacy: jsonb('privacy').$type<Record<string, unknown>>().notNull().default({}),
    notificationPrefs: jsonb('notification_prefs').$type<Record<string, unknown>>().notNull().default({}),
    timezone: text('timezone').notNull().default('UTC'),
    dailyGoalMinutes: integer('daily_goal_minutes').notNull().default(60),
    onboardingDone: boolean('onboarding_done').notNull().default(false),
    badge: jsonb('badge').$type<Record<string, unknown> | null>(),
    bannedAt: ts('banned_at'),
    bannedUntil: ts('banned_until'),
    banReason: text('ban_reason'),
    tokenVersion: integer('token_version').notNull().default(0),
    lastSeenAt: ts('last_seen_at'),
    deletedAt: ts('deleted_at'),
    createdAt: createdAt(),
    updatedAt: updatedAt(),
  },
  (t) => [
    uniqueIndex('users_email_uq').on(t.email),
    uniqueIndex('users_username_uq').on(t.username),
    index('users_xp_idx').on(t.xp),
    index('users_search_trgm').using('gin', sql`${t.searchName} gin_trgm_ops`),
    index('users_created_idx').on(t.createdAt),
  ],
);

export const sessions = pgTable(
  'sessions',
  {
    id: id(),
    userId: uuid('user_id')
      .notNull()
      .references(() => users.id, { onDelete: 'cascade' }),
    tokenHash: text('token_hash').notNull(),
    previousTokenHash: text('previous_token_hash'),
    rotatedAt: ts('rotated_at'),
    userAgent: text('user_agent'),
    ip: text('ip'),
    client: text('client').notNull().default('web'),
    createdAt: createdAt(),
    lastUsedAt: ts('last_used_at').notNull().defaultNow(),
    expiresAt: ts('expires_at').notNull(),
    revokedAt: ts('revoked_at'),
  },
  (t) => [uniqueIndex('sessions_token_uq').on(t.tokenHash), index('sessions_prev_token_idx').on(t.previousTokenHash), index('sessions_user_idx').on(t.userId)],
);

export const emailTokens = pgTable(
  'email_tokens',
  {
    id: id(),
    userId: uuid('user_id')
      .notNull()
      .references(() => users.id, { onDelete: 'cascade' }),
    kind: text('kind').$type<'verify' | 'reset'>().notNull(),
    tokenHash: text('token_hash').notNull(),
    expiresAt: ts('expires_at').notNull(),
    usedAt: ts('used_at'),
    createdAt: createdAt(),
  },
  (t) => [uniqueIndex('email_tokens_hash_uq').on(t.tokenHash), index('email_tokens_user_idx').on(t.userId)],
);

export const follows = pgTable(
  'follows',
  {
    followerId: uuid('follower_id')
      .notNull()
      .references(() => users.id, { onDelete: 'cascade' }),
    followeeId: uuid('followee_id')
      .notNull()
      .references(() => users.id, { onDelete: 'cascade' }),
    createdAt: createdAt(),
  },
  (t) => [primaryKey({ columns: [t.followerId, t.followeeId] }), index('follows_followee_idx').on(t.followeeId)],
);

export const blocks = pgTable(
  'blocks',
  {
    blockerId: uuid('blocker_id')
      .notNull()
      .references(() => users.id, { onDelete: 'cascade' }),
    blockedId: uuid('blocked_id')
      .notNull()
      .references(() => users.id, { onDelete: 'cascade' }),
    createdAt: createdAt(),
  },
  (t) => [primaryKey({ columns: [t.blockerId, t.blockedId] })],
);

export const userAchievements = pgTable(
  'user_achievements',
  {
    userId: uuid('user_id')
      .notNull()
      .references(() => users.id, { onDelete: 'cascade' }),
    achievementId: text('achievement_id').notNull(),
    unlockedAt: ts('unlocked_at').notNull().defaultNow(),
  },
  (t) => [primaryKey({ columns: [t.userId, t.achievementId] })],
);

export const xpLedger = pgTable(
  'xp_ledger',
  {
    id: id(),
    userId: uuid('user_id')
      .notNull()
      .references(() => users.id, { onDelete: 'cascade' }),
    amount: integer('amount').notNull(),
    reason: text('reason').notNull(),
    ref: text('ref').notNull(),
    day: date('day', { mode: 'string' }).notNull(),
    createdAt: createdAt(),
  },
  (t) => [uniqueIndex('xp_ledger_ref_uq').on(t.userId, t.reason, t.ref), index('xp_ledger_user_day_idx').on(t.userId, t.day)],
);

export const studyLog = pgTable(
  'study_log',
  {
    userId: uuid('user_id')
      .notNull()
      .references(() => users.id, { onDelete: 'cascade' }),
    day: date('day', { mode: 'string' }).notNull(),
    minutes: integer('minutes').notNull().default(0),
    quizzes: integer('quizzes').notNull().default(0),
    cards: integer('cards').notNull().default(0),
  },
  (t) => [primaryKey({ columns: [t.userId, t.day] })],
);

/* ───────────────────────── Social ───────────────────────── */

export const groups = pgTable(
  'groups',
  {
    id: id(),
    kind: groupKindEnum('kind').notNull().default('group'),
    name: text('name').notNull(),
    searchName: text('search_name').notNull().default(''),
    description: text('description').notNull().default(''),
    privacy: privacyEnum('privacy').notNull().default('public'),
    avatarUrl: text('avatar_url'),
    coverUrl: text('cover_url'),
    tags: jsonb('tags').$type<string[]>().notNull().default([]),
    ownerId: uuid('owner_id')
      .notNull()
      .references(() => users.id, { onDelete: 'cascade' }),
    memberCount: integer('member_count').notNull().default(0),
    postCount: integer('post_count').notNull().default(0),
    conversationId: uuid('conversation_id'),
    deletedAt: ts('deleted_at'),
    createdAt: createdAt(),
    updatedAt: updatedAt(),
  },
  (t) => [index('groups_kind_idx').on(t.kind, t.createdAt), index('groups_search_trgm').using('gin', sql`${t.searchName} gin_trgm_ops`)],
);

export const groupMembers = pgTable(
  'group_members',
  {
    groupId: uuid('group_id')
      .notNull()
      .references(() => groups.id, { onDelete: 'cascade' }),
    userId: uuid('user_id')
      .notNull()
      .references(() => users.id, { onDelete: 'cascade' }),
    role: groupRoleEnum('role').notNull().default('member'),
    points: integer('points').notNull().default(0),
    joinedAt: ts('joined_at').notNull().defaultNow(),
  },
  (t) => [primaryKey({ columns: [t.groupId, t.userId] }), index('group_members_user_idx').on(t.userId)],
);

export const groupJoinRequests = pgTable(
  'group_join_requests',
  {
    groupId: uuid('group_id')
      .notNull()
      .references(() => groups.id, { onDelete: 'cascade' }),
    userId: uuid('user_id')
      .notNull()
      .references(() => users.id, { onDelete: 'cascade' }),
    message: text('message').notNull().default(''),
    createdAt: createdAt(),
  },
  (t) => [primaryKey({ columns: [t.groupId, t.userId] })],
);

export const groupChannels = pgTable(
  'group_channels',
  {
    id: id(),
    groupId: uuid('group_id')
      .notNull()
      .references(() => groups.id, { onDelete: 'cascade' }),
    name: text('name').notNull(),
    kind: text('kind').$type<'text' | 'announcement'>().notNull().default('text'),
    conversationId: uuid('conversation_id').notNull(),
    sort: integer('sort').notNull().default(0),
    createdAt: createdAt(),
  },
  (t) => [index('group_channels_group_idx').on(t.groupId)],
);

export const groupResources = pgTable(
  'group_resources',
  {
    id: id(),
    groupId: uuid('group_id')
      .notNull()
      .references(() => groups.id, { onDelete: 'cascade' }),
    uploaderId: uuid('uploader_id')
      .notNull()
      .references(() => users.id, { onDelete: 'cascade' }),
    title: text('title').notNull(),
    url: text('url').notNull(),
    kind: text('kind').$type<'file' | 'link'>().notNull(),
    mime: text('mime'),
    size: integer('size'),
    createdAt: createdAt(),
  },
  (t) => [index('group_resources_group_idx').on(t.groupId, t.createdAt)],
);

export const posts = pgTable(
  'posts',
  {
    id: id(),
    authorId: uuid('author_id')
      .notNull()
      .references(() => users.id, { onDelete: 'cascade' }),
    groupId: uuid('group_id').references(() => groups.id, { onDelete: 'cascade' }),
    text: text('text').notNull().default(''),
    searchText: text('search_text').notNull().default(''),
    imageUrl: text('image_url'),
    pinned: boolean('pinned').notNull().default(false),
    commentCount: integer('comment_count').notNull().default(0),
    reactionCounts: jsonb('reaction_counts').$type<Record<string, number>>().notNull().default({}),
    shareCount: integer('share_count').notNull().default(0),
    /** Re-shared post (no FK so the share survives when the original is hard-deleted). */
    sharedPostId: uuid('shared_post_id'),
    /** 'discussion' (default), 'question' (Q&A with a best answer) or 'note' (study notes / summaries). */
    kind: text('kind').$type<'discussion' | 'question' | 'note'>().notNull().default('discussion'),
    materialId: uuid('material_id').references(() => eduMaterials.id, { onDelete: 'set null' }),
    /** Best answer chosen by the asker or a teacher (no FK: comments are soft-deleted). */
    acceptedCommentId: uuid('accepted_comment_id'),
    solvedAt: ts('solved_at'),
    editedAt: ts('edited_at'),
    deletedAt: ts('deleted_at'),
    createdAt: createdAt(),
  },
  (t) => [
    index('posts_feed_idx').on(t.createdAt, t.id),
    index('posts_group_idx').on(t.groupId, t.createdAt),
    index('posts_author_idx').on(t.authorId, t.createdAt),
    index('posts_search_trgm').using('gin', sql`${t.searchText} gin_trgm_ops`),
    index('posts_kind_idx').on(t.kind, t.solvedAt, t.createdAt),
    index('posts_material_idx').on(t.materialId, t.createdAt),
  ],
);

export const postReactions = pgTable(
  'post_reactions',
  {
    postId: uuid('post_id')
      .notNull()
      .references(() => posts.id, { onDelete: 'cascade' }),
    userId: uuid('user_id')
      .notNull()
      .references(() => users.id, { onDelete: 'cascade' }),
    reaction: text('reaction').notNull(),
    createdAt: createdAt(),
  },
  (t) => [primaryKey({ columns: [t.postId, t.userId] })],
);

export const comments = pgTable(
  'comments',
  {
    id: id(),
    postId: uuid('post_id')
      .notNull()
      .references(() => posts.id, { onDelete: 'cascade' }),
    authorId: uuid('author_id')
      .notNull()
      .references(() => users.id, { onDelete: 'cascade' }),
    text: text('text').notNull(),
    /** Optional voice note attached to the comment/answer. */
    audio: jsonb('audio').$type<Record<string, unknown> | null>(),
    /** "Helpful" votes from other learners (answers to questions are ranked by them). */
    votes: integer('votes').notNull().default(0),
    deletedAt: ts('deleted_at'),
    createdAt: createdAt(),
  },
  (t) => [index('comments_post_idx').on(t.postId, t.createdAt)],
);

export const commentVotes = pgTable(
  'comment_votes',
  {
    commentId: uuid('comment_id')
      .notNull()
      .references(() => comments.id, { onDelete: 'cascade' }),
    userId: uuid('user_id')
      .notNull()
      .references(() => users.id, { onDelete: 'cascade' }),
    createdAt: createdAt(),
  },
  (t) => [primaryKey({ columns: [t.commentId, t.userId] })],
);

export const notifications = pgTable(
  'notifications',
  {
    id: id(),
    userId: uuid('user_id')
      .notNull()
      .references(() => users.id, { onDelete: 'cascade' }),
    type: text('type').notNull(),
    title: text('title').notNull(),
    body: text('body').notNull().default(''),
    icon: text('icon').notNull().default('bell'),
    link: text('link'),
    actorId: uuid('actor_id').references(() => users.id, { onDelete: 'set null' }),
    data: jsonb('data').$type<Record<string, unknown>>().notNull().default({}),
    readAt: ts('read_at'),
    createdAt: createdAt(),
  },
  (t) => [index('notifications_user_idx').on(t.userId, t.createdAt)],
);

/** Single-use enrollment codes a teacher sells or gives out (cash, school fees, scholarships). */
export const courseVouchers = pgTable(
  'course_vouchers',
  {
    code: text('code').primaryKey(),
    courseId: uuid('course_id')
      .notNull()
      .references(() => courses.id, { onDelete: 'cascade' }),
    createdBy: uuid('created_by').references(() => users.id, { onDelete: 'set null' }),
    usedBy: uuid('used_by').references(() => users.id, { onDelete: 'set null' }),
    usedAt: ts('used_at'),
    createdAt: createdAt(),
  },
  (t) => [index('course_vouchers_course_idx').on(t.courseId)],
);

/** Card payments for paid courses (Stripe Checkout). */
export const payments = pgTable(
  'payments',
  {
    id: id(),
    userId: uuid('user_id')
      .notNull()
      .references(() => users.id, { onDelete: 'cascade' }),
    courseId: uuid('course_id')
      .notNull()
      .references(() => courses.id, { onDelete: 'cascade' }),
    provider: text('provider').notNull().default('stripe'),
    sessionId: text('session_id').notNull(),
    amountCents: integer('amount_cents').notNull(),
    currency: text('currency').notNull(),
    status: text('status').$type<'pending' | 'paid' | 'failed'>().notNull().default('pending'),
    createdAt: createdAt(),
    paidAt: ts('paid_at'),
  },
  (t) => [uniqueIndex('payments_session_uq').on(t.sessionId), index('payments_user_idx').on(t.userId)],
);

/** Certificates of completion, verifiable by anyone with the code. */
export const certificates = pgTable(
  'certificates',
  {
    id: id(),
    code: text('code').notNull(),
    userId: uuid('user_id')
      .notNull()
      .references(() => users.id, { onDelete: 'cascade' }),
    courseId: uuid('course_id').references(() => courses.id, { onDelete: 'set null' }),
    title: text('title').notNull(),
    issuerId: uuid('issuer_id').references(() => users.id, { onDelete: 'set null' }),
    issuerName: text('issuer_name').notNull().default(''),
    /** Average grade in percent at the time of issue. */
    grade: integer('grade'),
    issuedAt: ts('issued_at').notNull().defaultNow(),
    revokedAt: ts('revoked_at'),
  },
  (t) => [uniqueIndex('certificates_code_uq').on(t.code), index('certificates_user_idx').on(t.userId), index('certificates_course_idx').on(t.courseId)],
);

/** A parent (or guardian) who follows a student's progress. Created with a one-time code from the student. */
export const guardianLinks = pgTable(
  'guardian_links',
  {
    guardianId: uuid('guardian_id')
      .notNull()
      .references(() => users.id, { onDelete: 'cascade' }),
    studentId: uuid('student_id')
      .notNull()
      .references(() => users.id, { onDelete: 'cascade' }),
    createdAt: createdAt(),
    lastReportAt: ts('last_report_at'),
  },
  (t) => [primaryKey({ columns: [t.guardianId, t.studentId] }), index('guardian_links_student_idx').on(t.studentId)],
);

/** Captions / transcript of a lesson, one row per language. */
export const videoCaptions = pgTable(
  'video_captions',
  {
    id: id(),
    videoId: uuid('video_id')
      .notNull()
      .references(() => videos.id, { onDelete: 'cascade' }),
    language: text('language').notNull(),
    /** upload = the teacher's file, auto = speech recognition, translated = from another language. */
    source: text('source').$type<'upload' | 'auto' | 'translated'>().notNull(),
    cues: jsonb('cues').$type<{ start: number; end: number; text: string }[]>().notNull(),
    createdAt: createdAt(),
    updatedAt: updatedAt(),
  },
  (t) => [uniqueIndex('video_captions_uq').on(t.videoId, t.language)],
);

/** Phones (Expo push tokens) and browsers (Web Push subscriptions) that receive notifications while the app is closed. */
export const pushDevices = pgTable(
  'push_devices',
  {
    id: id(),
    userId: uuid('user_id')
      .notNull()
      .references(() => users.id, { onDelete: 'cascade' }),
    kind: text('kind').$type<'expo' | 'web'>().notNull(),
    /** Expo push token, or the Web Push endpoint URL. */
    token: text('token').notNull(),
    /** Web Push encryption keys (p256dh, auth). */
    keys: jsonb('keys').$type<{ p256dh: string; auth: string } | null>(),
    platform: text('platform').notNull().default(''),
    createdAt: createdAt(),
    lastUsedAt: ts('last_used_at'),
  },
  (t) => [uniqueIndex('push_devices_token_uq').on(t.token), index('push_devices_user_idx').on(t.userId)],
);

export const reports = pgTable(
  'reports',
  {
    id: id(),
    reporterId: uuid('reporter_id')
      .notNull()
      .references(() => users.id, { onDelete: 'cascade' }),
    targetType: text('target_type').notNull(),
    targetId: text('target_id').notNull(),
    reason: text('reason').notNull(),
    details: text('details').notNull().default(''),
    status: text('status').$type<'open' | 'resolved' | 'dismissed'>().notNull().default('open'),
    resolution: text('resolution'),
    /** Hidden automatically after reports from several members; restored if a moderator dismisses. */
    autoHidden: boolean('auto_hidden').notNull().default(false),
    resolvedBy: uuid('resolved_by').references(() => users.id, { onDelete: 'set null' }),
    resolvedAt: ts('resolved_at'),
    createdAt: createdAt(),
  },
  (t) => [index('reports_status_idx').on(t.status, t.createdAt), index('reports_target_idx').on(t.targetType, t.targetId)],
);

/* ───────────────────────── Chat ───────────────────────── */

export const conversations = pgTable(
  'conversations',
  {
    id: id(),
    kind: conversationKindEnum('kind').notNull(),
    directKey: text('direct_key'),
    groupId: uuid('group_id').references(() => groups.id, { onDelete: 'cascade' }),
    title: text('title'),
    lastMessageAt: ts('last_message_at'),
    lastMessageText: text('last_message_text'),
    lastMessageSenderId: uuid('last_message_sender_id'),
    createdAt: createdAt(),
  },
  (t) => [uniqueIndex('conversations_direct_uq').on(t.directKey), index('conversations_group_idx').on(t.groupId)],
);

export const conversationMembers = pgTable(
  'conversation_members',
  {
    conversationId: uuid('conversation_id')
      .notNull()
      .references(() => conversations.id, { onDelete: 'cascade' }),
    userId: uuid('user_id')
      .notNull()
      .references(() => users.id, { onDelete: 'cascade' }),
    lastReadAt: ts('last_read_at'),
    muted: boolean('muted').notNull().default(false),
    hidden: boolean('hidden').notNull().default(false),
    joinedAt: ts('joined_at').notNull().defaultNow(),
  },
  (t) => [primaryKey({ columns: [t.conversationId, t.userId] }), index('conversation_members_user_idx').on(t.userId)],
);

export const messages = pgTable(
  'messages',
  {
    id: id(),
    conversationId: uuid('conversation_id')
      .notNull()
      .references(() => conversations.id, { onDelete: 'cascade' }),
    senderId: uuid('sender_id')
      .notNull()
      .references(() => users.id, { onDelete: 'cascade' }),
    text: text('text').notNull().default(''),
    attachment: jsonb('attachment').$type<Record<string, unknown> | null>(),
    replyToId: uuid('reply_to_id'),
    clientId: text('client_id'),
    editedAt: ts('edited_at'),
    deletedAt: ts('deleted_at'),
    createdAt: createdAt(),
  },
  (t) => [index('messages_conv_idx').on(t.conversationId, t.createdAt), uniqueIndex('messages_client_uq').on(t.senderId, t.clientId)],
);

export const messageReactions = pgTable(
  'message_reactions',
  {
    messageId: uuid('message_id')
      .notNull()
      .references(() => messages.id, { onDelete: 'cascade' }),
    userId: uuid('user_id')
      .notNull()
      .references(() => users.id, { onDelete: 'cascade' }),
    emoji: text('emoji').notNull(),
    createdAt: createdAt(),
  },
  (t) => [primaryKey({ columns: [t.messageId, t.userId, t.emoji] })],
);

/* ───────────────────────── Learning ───────────────────────── */

export const eduSections = pgTable('edu_sections', {
  id: id(),
  name: text('name').notNull(),
  sort: integer('sort').notNull().default(0),
  createdAt: createdAt(),
});

export const eduMaterials = pgTable(
  'edu_materials',
  {
    id: id(),
    sectionId: uuid('section_id')
      .notNull()
      .references(() => eduSections.id, { onDelete: 'cascade' }),
    name: text('name').notNull(),
    sort: integer('sort').notNull().default(0),
    createdAt: createdAt(),
  },
  (t) => [index('edu_materials_section_idx').on(t.sectionId)],
);

export const quizzes = pgTable(
  'quizzes',
  {
    id: id(),
    title: text('title').notNull(),
    searchTitle: text('search_title').notNull().default(''),
    description: text('description').notNull().default(''),
    sectionId: uuid('section_id').references(() => eduSections.id, { onDelete: 'set null' }),
    materialId: uuid('material_id').references(() => eduMaterials.id, { onDelete: 'set null' }),
    courseId: uuid('course_id'),
    kind: text('kind').$type<'quiz' | 'test' | 'exam'>().notNull().default('quiz'),
    difficulty: text('difficulty').$type<'easy' | 'medium' | 'hard'>().notNull().default('medium'),
    durationSec: integer('duration_sec').notNull().default(600),
    scheduledAt: ts('scheduled_at'),
    published: boolean('published').notNull().default(true),
    shuffle: boolean('shuffle').notNull().default(false),
    questionCount: integer('question_count').notNull().default(0),
    attemptCount: integer('attempt_count').notNull().default(0),
    createdBy: uuid('created_by').references(() => users.id, { onDelete: 'set null' }),
    deletedAt: ts('deleted_at'),
    createdAt: createdAt(),
    updatedAt: updatedAt(),
  },
  (t) => [
    index('quizzes_list_idx').on(t.createdAt),
    index('quizzes_course_idx').on(t.courseId),
    index('quizzes_search_trgm').using('gin', sql`${t.searchTitle} gin_trgm_ops`),
  ],
);

export const quizQuestions = pgTable(
  'quiz_questions',
  {
    id: id(),
    quizId: uuid('quiz_id')
      .notNull()
      .references(() => quizzes.id, { onDelete: 'cascade' }),
    position: integer('position').notNull(),
    type: text('type').$type<'mc' | 'tf' | 'multi' | 'short'>().notNull(),
    prompt: text('prompt').notNull(),
    imageUrl: text('image_url'),
    options: jsonb('options').$type<string[]>().notNull().default([]),
    answer: jsonb('answer').$type<number | number[] | string[]>().notNull(),
    explanation: text('explanation'),
    topic: text('topic'),
    points: integer('points').notNull().default(1),
  },
  (t) => [index('quiz_questions_quiz_idx').on(t.quizId, t.position), index('quiz_questions_topic_idx').on(t.topic)],
);

export const quizAttempts = pgTable(
  'quiz_attempts',
  {
    id: id(),
    quizId: uuid('quiz_id').references(() => quizzes.id, { onDelete: 'cascade' }),
    userId: uuid('user_id')
      .notNull()
      .references(() => users.id, { onDelete: 'cascade' }),
    questionIds: jsonb('question_ids').$type<string[]>().notNull(),
    review: boolean('review').notNull().default(false),
    adaptive: boolean('adaptive').notNull().default(false),
    startedAt: ts('started_at').notNull().defaultNow(),
    expiresAt: ts('expires_at').notNull(),
    submittedAt: ts('submitted_at'),
    answers: jsonb('answers').$type<unknown[]>(),
    correct: integer('correct'),
    total: integer('total'),
    pct: integer('pct'),
    timeSec: integer('time_sec'),
    xpEarned: integer('xp_earned').notNull().default(0),
    result: jsonb('result').$type<Record<string, unknown>>(),
  },
  (t) => [index('quiz_attempts_user_idx').on(t.userId, t.startedAt), index('quiz_attempts_quiz_idx').on(t.quizId)],
);

export const quizBest = pgTable(
  'quiz_best',
  {
    userId: uuid('user_id')
      .notNull()
      .references(() => users.id, { onDelete: 'cascade' }),
    quizId: uuid('quiz_id')
      .notNull()
      .references(() => quizzes.id, { onDelete: 'cascade' }),
    pct: integer('pct').notNull(),
    correct: integer('correct').notNull(),
    total: integer('total').notNull(),
    attemptId: uuid('attempt_id').notNull(),
    wrongIds: jsonb('wrong_ids').$type<string[]>().notNull().default([]),
    updatedAt: updatedAt(),
  },
  (t) => [primaryKey({ columns: [t.userId, t.quizId] })],
);

export const topicSamples = pgTable(
  'topic_samples',
  {
    id: id(),
    userId: uuid('user_id')
      .notNull()
      .references(() => users.id, { onDelete: 'cascade' }),
    topicKey: text('topic_key').notNull(),
    topic: text('topic').notNull(),
    courseId: uuid('course_id'),
    correct: integer('correct').notNull(),
    total: integer('total').notNull(),
    attemptId: uuid('attempt_id').notNull(),
    createdAt: createdAt(),
  },
  (t) => [index('topic_samples_user_idx').on(t.userId, t.topicKey, t.createdAt)],
);

export const dailyChallenges = pgTable('daily_challenges', {
  day: date('day', { mode: 'string' }).primaryKey(),
  type: text('type').$type<'quiz' | 'social'>().notNull(),
  title: text('title').notNull(),
  description: text('description').notNull().default(''),
  question: text('question'),
  options: jsonb('options').$type<string[]>().notNull().default([]),
  answer: integer('answer'),
  xp: integer('xp').notNull().default(10),
  createdBy: uuid('created_by').references(() => users.id, { onDelete: 'set null' }),
  createdAt: createdAt(),
});

export const dailyClaims = pgTable(
  'daily_claims',
  {
    userId: uuid('user_id')
      .notNull()
      .references(() => users.id, { onDelete: 'cascade' }),
    day: date('day', { mode: 'string' }).notNull(),
    correct: boolean('correct').notNull(),
    answer: integer('answer'),
    xpEarned: integer('xp_earned').notNull().default(0),
    createdAt: createdAt(),
  },
  (t) => [primaryKey({ columns: [t.userId, t.day] })],
);

export const pomodoroSessions = pgTable(
  'pomodoro_sessions',
  {
    id: id(),
    userId: uuid('user_id')
      .notNull()
      .references(() => users.id, { onDelete: 'cascade' }),
    minutes: integer('minutes').notNull(),
    label: text('label'),
    startedAt: ts('started_at').notNull().defaultNow(),
    endsAt: ts('ends_at').notNull(),
    completedAt: ts('completed_at'),
    xpEarned: integer('xp_earned').notNull().default(0),
  },
  (t) => [index('pomodoro_user_idx').on(t.userId, t.startedAt)],
);

export const flashcards = pgTable(
  'flashcards',
  {
    id: id(),
    userId: uuid('user_id')
      .notNull()
      .references(() => users.id, { onDelete: 'cascade' }),
    front: text('front').notNull(),
    back: text('back').notNull(),
    deck: text('deck').notNull().default('general'),
    topic: text('topic'),
    courseId: uuid('course_id'),
    level: integer('level').notNull().default(0),
    ease: real('ease').notNull().default(2.5),
    repetitions: integer('repetitions').notNull().default(0),
    lapses: integer('lapses').notNull().default(0),
    intervalDays: doublePrecision('interval_days').notNull().default(0),
    dueAt: ts('due_at').notNull().defaultNow(),
    lastReviewedAt: ts('last_reviewed_at'),
    createdAt: createdAt(),
  },
  (t) => [index('flashcards_due_idx').on(t.userId, t.dueAt)],
);

export const tasks = pgTable(
  'tasks',
  {
    id: id(),
    userId: uuid('user_id')
      .notNull()
      .references(() => users.id, { onDelete: 'cascade' }),
    title: text('title').notNull(),
    notes: text('notes').notNull().default(''),
    dueAt: ts('due_at'),
    priority: text('priority').$type<'low' | 'medium' | 'high'>().notNull().default('medium'),
    status: text('status').$type<'todo' | 'doing' | 'done'>().notNull().default('todo'),
    tags: jsonb('tags').$type<string[]>().notNull().default([]),
    subtasks: jsonb('subtasks').$type<{ title: string; done: boolean }[]>().notNull().default([]),
    completedAt: ts('completed_at'),
    createdAt: createdAt(),
    updatedAt: updatedAt(),
  },
  (t) => [index('tasks_user_idx').on(t.userId, t.status, t.dueAt)],
);

export const notes = pgTable(
  'notes',
  {
    id: id(),
    userId: uuid('user_id')
      .notNull()
      .references(() => users.id, { onDelete: 'cascade' }),
    title: text('title').notNull().default(''),
    body: text('body').notNull().default(''),
    color: text('color').notNull().default('default'),
    pinned: boolean('pinned').notNull().default(false),
    tags: jsonb('tags').$type<string[]>().notNull().default([]),
    createdAt: createdAt(),
    updatedAt: updatedAt(),
  },
  (t) => [index('notes_user_idx').on(t.userId, t.updatedAt)],
);

export const exams = pgTable(
  'exams',
  {
    id: id(),
    userId: uuid('user_id')
      .notNull()
      .references(() => users.id, { onDelete: 'cascade' }),
    subject: text('subject').notNull(),
    day: date('day', { mode: 'string' }).notNull(),
    time: text('time'),
    place: text('place'),
    notes: text('notes'),
    createdAt: createdAt(),
  },
  (t) => [index('exams_user_idx').on(t.userId, t.day)],
);

export const studySessions = pgTable(
  'study_sessions',
  {
    id: id(),
    userId: uuid('user_id')
      .notNull()
      .references(() => users.id, { onDelete: 'cascade' }),
    title: text('title').notNull(),
    subject: text('subject'),
    day: date('day', { mode: 'string' }).notNull(),
    startTime: text('start_time'),
    minutes: integer('minutes').notNull().default(45),
    notes: text('notes'),
    completed: boolean('completed').notNull().default(false),
    createdAt: createdAt(),
  },
  (t) => [index('study_sessions_user_idx').on(t.userId, t.day)],
);

/* ───────────────────────── School ───────────────────────── */

export const courses = pgTable(
  'courses',
  {
    id: id(),
    title: text('title').notNull(),
    searchTitle: text('search_title').notNull().default(''),
    description: text('description').notNull().default(''),
    subject: text('subject'),
    coverUrl: text('cover_url'),
    color: text('color'),
    ownerId: uuid('owner_id')
      .notNull()
      .references(() => users.id, { onDelete: 'cascade' }),
    joinCode: text('join_code').notNull(),
    memberCount: integer('member_count').notNull().default(0),
    archived: boolean('archived').notNull().default(false),
    /** Shown in the public course catalog (otherwise joined only with the class code). */
    listed: boolean('listed').notNull().default(false),
    /** 0 = free. Paid courses are joined by card payment (Stripe) or a single-use voucher. */
    priceCents: integer('price_cents').notNull().default(0),
    currency: text('currency').notNull().default('USD'),
    createdAt: createdAt(),
    updatedAt: updatedAt(),
  },
  (t) => [uniqueIndex('courses_code_uq').on(t.joinCode), index('courses_search_trgm').using('gin', sql`${t.searchTitle} gin_trgm_ops`)],
);

export const courseMembers = pgTable(
  'course_members',
  {
    courseId: uuid('course_id')
      .notNull()
      .references(() => courses.id, { onDelete: 'cascade' }),
    userId: uuid('user_id')
      .notNull()
      .references(() => users.id, { onDelete: 'cascade' }),
    role: courseRoleEnum('role').notNull().default('student'),
    joinedAt: ts('joined_at').notNull().defaultNow(),
  },
  (t) => [primaryKey({ columns: [t.courseId, t.userId] }), index('course_members_user_idx').on(t.userId)],
);

export const courseAnnouncements = pgTable(
  'course_announcements',
  {
    id: id(),
    courseId: uuid('course_id')
      .notNull()
      .references(() => courses.id, { onDelete: 'cascade' }),
    authorId: uuid('author_id')
      .notNull()
      .references(() => users.id, { onDelete: 'cascade' }),
    text: text('text').notNull(),
    attachments: jsonb('attachments').$type<Record<string, unknown>[]>().notNull().default([]),
    createdAt: createdAt(),
  },
  (t) => [index('course_announcements_idx').on(t.courseId, t.createdAt)],
);

export const rubrics = pgTable('rubrics', {
  id: id(),
  courseId: uuid('course_id')
    .notNull()
    .references(() => courses.id, { onDelete: 'cascade' }),
  title: text('title').notNull(),
  criteria: jsonb('criteria').$type<{ title: string; description: string; levels: { label: string; points: number }[] }[]>().notNull(),
  createdAt: createdAt(),
});

export const assignments = pgTable(
  'assignments',
  {
    id: id(),
    courseId: uuid('course_id')
      .notNull()
      .references(() => courses.id, { onDelete: 'cascade' }),
    title: text('title').notNull(),
    description: text('description').notNull().default(''),
    dueAt: ts('due_at'),
    releaseAt: ts('release_at'),
    points: integer('points').notNull().default(100),
    rubricId: uuid('rubric_id').references(() => rubrics.id, { onDelete: 'set null' }),
    allowLate: boolean('allow_late').notNull().default(true),
    state: text('state').$type<'draft' | 'published' | 'closed'>().notNull().default('published'),
    attachments: jsonb('attachments').$type<Record<string, unknown>[]>().notNull().default([]),
    topic: text('topic'),
    createdBy: uuid('created_by').references(() => users.id, { onDelete: 'set null' }),
    createdAt: createdAt(),
    updatedAt: updatedAt(),
  },
  (t) => [index('assignments_course_idx').on(t.courseId, t.dueAt)],
);

export const submissions = pgTable(
  'submissions',
  {
    id: id(),
    assignmentId: uuid('assignment_id')
      .notNull()
      .references(() => assignments.id, { onDelete: 'cascade' }),
    studentId: uuid('student_id')
      .notNull()
      .references(() => users.id, { onDelete: 'cascade' }),
    text: text('text').notNull().default(''),
    attachments: jsonb('attachments').$type<Record<string, unknown>[]>().notNull().default([]),
    status: text('status').$type<'submitted' | 'graded' | 'returned'>().notNull().default('submitted'),
    late: boolean('late').notNull().default(false),
    grade: real('grade'),
    feedback: text('feedback').notNull().default(''),
    feedbackAudio: jsonb('feedback_audio').$type<Record<string, unknown> | null>(),
    rubricScores: jsonb('rubric_scores').$type<Record<string, number> | null>(),
    gradedBy: uuid('graded_by').references(() => users.id, { onDelete: 'set null' }),
    gradedAt: ts('graded_at'),
    submittedAt: ts('submitted_at').notNull().defaultNow(),
  },
  (t) => [uniqueIndex('submissions_uq').on(t.assignmentId, t.studentId)],
);

export const attendanceSessions = pgTable(
  'attendance_sessions',
  {
    id: id(),
    courseId: uuid('course_id')
      .notNull()
      .references(() => courses.id, { onDelete: 'cascade' }),
    title: text('title').notNull().default(''),
    day: date('day', { mode: 'string' }).notNull(),
    createdAt: createdAt(),
  },
  (t) => [index('attendance_sessions_course_idx').on(t.courseId, t.day)],
);

export const attendanceRecords = pgTable(
  'attendance_records',
  {
    sessionId: uuid('session_id')
      .notNull()
      .references(() => attendanceSessions.id, { onDelete: 'cascade' }),
    studentId: uuid('student_id')
      .notNull()
      .references(() => users.id, { onDelete: 'cascade' }),
    status: text('status').$type<'present' | 'absent' | 'late' | 'excused'>().notNull(),
  },
  (t) => [primaryKey({ columns: [t.sessionId, t.studentId] })],
);

export const courseMaterials = pgTable(
  'course_materials',
  {
    id: id(),
    courseId: uuid('course_id')
      .notNull()
      .references(() => courses.id, { onDelete: 'cascade' }),
    title: text('title').notNull(),
    topic: text('topic'),
    fileUrl: text('file_url'),
    visibleToStudents: boolean('visible_to_students').notNull().default(true),
    chunkCount: integer('chunk_count').notNull().default(0),
    createdBy: uuid('created_by').references(() => users.id, { onDelete: 'set null' }),
    createdAt: createdAt(),
  },
  (t) => [index('course_materials_course_idx').on(t.courseId)],
);

export const knowledgeChunks = pgTable(
  'knowledge_chunks',
  {
    id: id(),
    materialId: uuid('material_id')
      .notNull()
      .references(() => courseMaterials.id, { onDelete: 'cascade' }),
    courseId: uuid('course_id')
      .notNull()
      .references(() => courses.id, { onDelete: 'cascade' }),
    position: integer('position').notNull(),
    heading: text('heading'),
    page: integer('page'),
    text: text('text').notNull(),
    searchText: text('search_text').notNull(),
  },
  (t) => [index('knowledge_chunks_course_idx').on(t.courseId), index('knowledge_chunks_trgm').using('gin', sql`${t.searchText} gin_trgm_ops`)],
);

export const essayKeys = pgTable('essay_keys', {
  id: id(),
  courseId: uuid('course_id')
    .notNull()
    .references(() => courses.id, { onDelete: 'cascade' }),
  prompt: text('prompt').notNull(),
  modelAnswer: text('model_answer').notNull().default(''),
  keyPoints: jsonb('key_points').$type<string[]>().notNull(),
  topic: text('topic'),
  createdAt: createdAt(),
});

export const courseSynonyms = pgTable(
  'course_synonyms',
  {
    id: id(),
    courseId: uuid('course_id')
      .notNull()
      .references(() => courses.id, { onDelete: 'cascade' }),
    term: text('term').notNull(),
    synonyms: jsonb('synonyms').$type<string[]>().notNull(),
  },
  (t) => [uniqueIndex('course_synonyms_uq').on(t.courseId, t.term)],
);

/* ───────────────────────── Live & classes ───────────────────────── */

export const liveRooms = pgTable(
  'live_rooms',
  {
    id: id(),
    title: text('title').notNull(),
    scopeType: text('scope_type').$type<'group' | 'community' | 'course' | 'open'>().notNull(),
    scopeId: uuid('scope_id'),
    hostId: uuid('host_id')
      .notNull()
      .references(() => users.id, { onDelete: 'cascade' }),
    status: text('status').$type<'scheduled' | 'live' | 'ended'>().notNull().default('scheduled'),
    scheduledAt: ts('scheduled_at'),
    startedAt: ts('started_at'),
    endedAt: ts('ended_at'),
    settings: jsonb('settings').$type<Record<string, boolean>>().notNull(),
    conversationId: uuid('conversation_id'),
    whiteboard: jsonb('whiteboard').$type<unknown[]>().notNull().default([]),
    createdAt: createdAt(),
  },
  (t) => [index('live_rooms_scope_idx').on(t.scopeType, t.scopeId), index('live_rooms_status_idx').on(t.status)],
);

export const scheduledClasses = pgTable('scheduled_classes', {
  id: id(),
  title: text('title').notNull(),
  subject: text('subject'),
  description: text('description').notNull().default(''),
  link: text('link').notNull(),
  startsAt: ts('starts_at'),
  createdBy: uuid('created_by').references(() => users.id, { onDelete: 'set null' }),
  deletedAt: ts('deleted_at'),
  createdAt: createdAt(),
});

/* ───────────────────────── Forms ───────────────────────── */

export const forms = pgTable(
  'forms',
  {
    id: id(),
    ownerId: uuid('owner_id')
      .notNull()
      .references(() => users.id, { onDelete: 'cascade' }),
    slug: text('slug').notNull(),
    title: text('title').notNull(),
    description: text('description').notNull().default(''),
    settings: jsonb('settings').$type<Record<string, unknown>>().notNull(),
    questions: jsonb('questions').$type<Record<string, unknown>[]>().notNull().default([]),
    published: boolean('published').notNull().default(false),
    responseCount: integer('response_count').notNull().default(0),
    deletedAt: ts('deleted_at'),
    createdAt: createdAt(),
    updatedAt: updatedAt(),
  },
  (t) => [uniqueIndex('forms_slug_uq').on(t.slug), index('forms_owner_idx').on(t.ownerId, t.updatedAt)],
);

export const formResponses = pgTable(
  'form_responses',
  {
    id: id(),
    formId: uuid('form_id')
      .notNull()
      .references(() => forms.id, { onDelete: 'cascade' }),
    respondentId: uuid('respondent_id').references(() => users.id, { onDelete: 'set null' }),
    email: text('email'),
    answers: jsonb('answers').$type<Record<string, unknown>>().notNull(),
    score: integer('score'),
    createdAt: createdAt(),
  },
  (t) => [index('form_responses_form_idx').on(t.formId, t.createdAt), index('form_responses_user_idx').on(t.formId, t.respondentId)],
);

/* ───────────────────────── Library & workspace ───────────────────────── */

export const libraryItems = pgTable(
  'library_items',
  {
    id: id(),
    title: text('title').notNull(),
    searchTitle: text('search_title').notNull().default(''),
    description: text('description').notNull().default(''),
    category: text('category').notNull().default('other'),
    sectionId: uuid('section_id').references(() => eduSections.id, { onDelete: 'set null' }),
    materialId: uuid('material_id').references(() => eduMaterials.id, { onDelete: 'set null' }),
    fileUrl: text('file_url').notNull(),
    mime: text('mime').notNull(),
    size: integer('size').notNull().default(0),
    coverUrl: text('cover_url'),
    uploaderId: uuid('uploader_id')
      .notNull()
      .references(() => users.id, { onDelete: 'cascade' }),
    downloads: integer('downloads').notNull().default(0),
    approved: boolean('approved').notNull().default(false),
    deletedAt: ts('deleted_at'),
    createdAt: createdAt(),
  },
  (t) => [index('library_items_idx').on(t.approved, t.createdAt), index('library_search_trgm').using('gin', sql`${t.searchTitle} gin_trgm_ops`)],
);

export const workspaceFolders = pgTable(
  'workspace_folders',
  {
    id: id(),
    ownerId: uuid('owner_id')
      .notNull()
      .references(() => users.id, { onDelete: 'cascade' }),
    name: text('name').notNull(),
    parentId: uuid('parent_id'),
    createdAt: createdAt(),
  },
  (t) => [index('workspace_folders_owner_idx').on(t.ownerId)],
);

export const workspaceFiles = pgTable(
  'workspace_files',
  {
    id: id(),
    ownerId: uuid('owner_id')
      .notNull()
      .references(() => users.id, { onDelete: 'cascade' }),
    folderId: uuid('folder_id').references(() => workspaceFolders.id, { onDelete: 'set null' }),
    title: text('title').notNull(),
    kind: text('kind').$type<'doc' | 'sheet' | 'slides' | 'whiteboard'>().notNull(),
    content: jsonb('content').$type<unknown>().notNull().default({}),
    version: integer('version').notNull().default(1),
    createdAt: createdAt(),
    updatedAt: updatedAt(),
  },
  (t) => [index('workspace_files_owner_idx').on(t.ownerId, t.updatedAt)],
);

export const savedCollections = pgTable(
  'saved_collections',
  {
    id: id(),
    ownerId: uuid('owner_id')
      .notNull()
      .references(() => users.id, { onDelete: 'cascade' }),
    name: text('name').notNull(),
    description: text('description').notNull().default(''),
    isPublic: boolean('is_public').notNull().default(false),
    shareSlug: text('share_slug').notNull(),
    createdAt: createdAt(),
  },
  (t) => [uniqueIndex('saved_collections_slug_uq').on(t.shareSlug), index('saved_collections_owner_idx').on(t.ownerId)],
);

export const savedItems = pgTable(
  'saved_items',
  {
    id: id(),
    ownerId: uuid('owner_id')
      .notNull()
      .references(() => users.id, { onDelete: 'cascade' }),
    collectionId: uuid('collection_id').references(() => savedCollections.id, { onDelete: 'set null' }),
    itemType: text('item_type').notNull(),
    refId: text('ref_id'),
    title: text('title').notNull(),
    url: text('url'),
    note: text('note').notNull().default(''),
    createdAt: createdAt(),
  },
  (t) => [index('saved_items_owner_idx').on(t.ownerId, t.createdAt), uniqueIndex('saved_items_ref_uq').on(t.ownerId, t.itemType, t.refId)],
);

export const uploads = pgTable(
  'uploads',
  {
    id: id(),
    ownerId: uuid('owner_id')
      .notNull()
      .references(() => users.id, { onDelete: 'cascade' }),
    key: text('key').notNull(),
    mime: text('mime').notNull(),
    size: integer('size').notNull(),
    name: text('name').notNull(),
    visibility: text('visibility').$type<'public' | 'private'>().notNull().default('public'),
    purpose: text('purpose').notNull().default('general'),
    createdAt: createdAt(),
  },
  (t) => [uniqueIndex('uploads_key_uq').on(t.key), index('uploads_owner_idx').on(t.ownerId)],
);

/* ───────────────────────── AI assistant ───────────────────────── */

export const assistantThreads = pgTable(
  'assistant_threads',
  {
    id: id(),
    userId: uuid('user_id')
      .notNull()
      .references(() => users.id, { onDelete: 'cascade' }),
    title: text('title').notNull(),
    createdAt: createdAt(),
    updatedAt: updatedAt(),
  },
  (t) => [index('assistant_threads_user_idx').on(t.userId, t.updatedAt)],
);

export const assistantMessages = pgTable(
  'assistant_messages',
  {
    id: id(),
    threadId: uuid('thread_id')
      .notNull()
      .references(() => assistantThreads.id, { onDelete: 'cascade' }),
    role: text('role').$type<'user' | 'assistant'>().notNull(),
    content: text('content').notNull(),
    sources: jsonb('sources').$type<Record<string, unknown>[]>().notNull().default([]),
    actions: jsonb('actions').$type<{ label: string; link: string }[]>().notNull().default([]),
    rating: text('rating').$type<'up' | 'down' | null>(),
    feedback: text('feedback'),
    provider: text('provider'),
    createdAt: createdAt(),
  },
  (t) => [index('assistant_messages_thread_idx').on(t.threadId, t.createdAt)],
);

export const assistantKnowledge = pgTable(
  'assistant_knowledge',
  {
    id: id(),
    question: text('question').notNull(),
    answer: text('answer').notNull(),
    tags: jsonb('tags').$type<string[]>().notNull().default([]),
    language: text('language').notNull().default('ar'),
    link: text('link'),
    searchText: text('search_text').notNull().default(''),
    createdAt: createdAt(),
  },
  (t) => [index('assistant_knowledge_trgm').using('gin', sql`${t.searchText} gin_trgm_ops`)],
);

export const aiUsage = pgTable(
  'ai_usage',
  {
    userId: uuid('user_id')
      .notNull()
      .references(() => users.id, { onDelete: 'cascade' }),
    day: date('day', { mode: 'string' }).notNull(),
    count: integer('count').notNull().default(0),
  },
  (t) => [primaryKey({ columns: [t.userId, t.day] })],
);

/* ───────────────────────── Site & admin ───────────────────────── */

export const siteSettings = pgTable('site_settings', {
  key: text('key').primaryKey(),
  value: jsonb('value').$type<unknown>().notNull(),
  updatedBy: uuid('updated_by').references(() => users.id, { onDelete: 'set null' }),
  updatedAt: updatedAt(),
});

export const announcements = pgTable('announcements', {
  id: id(),
  title: text('title').notNull(),
  text: text('text').notNull().default(''),
  imageUrl: text('image_url'),
  link: text('link'),
  level: text('level').$type<'info' | 'success' | 'warning' | 'critical'>().notNull().default('info'),
  active: boolean('active').notNull().default(true),
  expiresAt: ts('expires_at'),
  createdBy: uuid('created_by').references(() => users.id, { onDelete: 'set null' }),
  createdAt: createdAt(),
});

export const ads = pgTable('ads', {
  id: id(),
  title: text('title').notNull(),
  subtitle: text('subtitle').notNull().default(''),
  link: text('link'),
  imageUrl: text('image_url'),
  placement: text('placement').$type<'home' | 'quiz' | 'both'>().notNull().default('both'),
  active: boolean('active').notNull().default(true),
  clicks: integer('clicks').notNull().default(0),
  impressions: integer('impressions').notNull().default(0),
  createdBy: uuid('created_by').references(() => users.id, { onDelete: 'set null' }),
  createdAt: createdAt(),
});

export const auditLog = pgTable(
  'audit_log',
  {
    id: id(),
    actorId: uuid('actor_id').references(() => users.id, { onDelete: 'set null' }),
    action: text('action').notNull(),
    targetType: text('target_type'),
    targetId: text('target_id'),
    data: jsonb('data').$type<Record<string, unknown>>().notNull().default({}),
    createdAt: createdAt(),
  },
  (t) => [index('audit_log_created_idx').on(t.createdAt)],
);

export const clientErrors = pgTable(
  'client_errors',
  {
    id: id(),
    fingerprint: text('fingerprint').notNull(),
    message: text('message').notNull(),
    kind: text('kind').notNull(),
    url: text('url'),
    release: text('release'),
    sampleStack: text('sample_stack'),
    userId: uuid('user_id').references(() => users.id, { onDelete: 'set null' }),
    count: integer('count').notNull().default(1),
    firstSeenAt: ts('first_seen_at').notNull().defaultNow(),
    lastSeenAt: ts('last_seen_at').notNull().defaultNow(),
  },
  (t) => [uniqueIndex('client_errors_fp_uq').on(t.fingerprint), index('client_errors_last_idx').on(t.lastSeenAt)],
);

/* ───────────────── Polls, hashtags ───────────────── */

export const polls = pgTable('polls', {
  postId: uuid('post_id')
    .primaryKey()
    .references(() => posts.id, { onDelete: 'cascade' }),
  multiple: boolean('multiple').notNull().default(false),
  endsAt: ts('ends_at'),
  totalVotes: integer('total_votes').notNull().default(0),
});

export const pollOptions = pgTable(
  'poll_options',
  {
    id: id(),
    postId: uuid('post_id')
      .notNull()
      .references(() => posts.id, { onDelete: 'cascade' }),
    text: text('text').notNull(),
    position: integer('position').notNull(),
    votes: integer('votes').notNull().default(0),
  },
  (t) => [index('poll_options_post_idx').on(t.postId, t.position)],
);

export const pollVotes = pgTable(
  'poll_votes',
  {
    postId: uuid('post_id')
      .notNull()
      .references(() => posts.id, { onDelete: 'cascade' }),
    optionId: uuid('option_id')
      .notNull()
      .references(() => pollOptions.id, { onDelete: 'cascade' }),
    userId: uuid('user_id')
      .notNull()
      .references(() => users.id, { onDelete: 'cascade' }),
    createdAt: createdAt(),
  },
  (t) => [primaryKey({ columns: [t.optionId, t.userId] }), index('poll_votes_user_idx').on(t.postId, t.userId)],
);

/** Hashtag usage across posts and videos; powers trending and tag pages. */
export const hashtagUses = pgTable(
  'hashtag_uses',
  {
    tag: text('tag').notNull(),
    subjectType: text('subject_type').$type<'post' | 'video'>().notNull(),
    subjectId: uuid('subject_id').notNull(),
    authorId: uuid('author_id')
      .notNull()
      .references(() => users.id, { onDelete: 'cascade' }),
    createdAt: createdAt(),
  },
  (t) => [
    primaryKey({ columns: [t.tag, t.subjectType, t.subjectId] }),
    index('hashtag_uses_recent_idx').on(t.createdAt, t.tag),
    index('hashtag_uses_subject_idx').on(t.subjectType, t.subjectId),
  ],
);

/* ───────────────── Watch: videos, shorts, playlists ───────────────── */

export const videos = pgTable(
  'videos',
  {
    id: id(),
    ownerId: uuid('owner_id')
      .notNull()
      .references(() => users.id, { onDelete: 'cascade' }),
    kind: text('kind').$type<'video' | 'short'>().notNull().default('video'),
    title: text('title').notNull(),
    description: text('description').notNull().default(''),
    searchText: text('search_text').notNull().default(''),
    videoUrl: text('video_url').notNull(),
    thumbnailUrl: text('thumbnail_url'),
    durationSec: integer('duration_sec').notNull(),
    visibility: text('visibility').$type<'public' | 'unlisted' | 'private'>().notNull().default('public'),
    tags: jsonb('tags').$type<string[]>().notNull().default([]),
    sectionId: uuid('section_id').references(() => eduSections.id, { onDelete: 'set null' }),
    materialId: uuid('material_id').references(() => eduMaterials.id, { onDelete: 'set null' }),
    allowComments: boolean('allow_comments').notNull().default(true),
    /** "Check your understanding" quiz shown at the end of the lesson. */
    quizId: uuid('quiz_id').references(() => quizzes.id, { onDelete: 'set null' }),
    views: integer('views').notNull().default(0),
    likes: integer('likes').notNull().default(0),
    dislikes: integer('dislikes').notNull().default(0),
    commentCount: integer('comment_count').notNull().default(0),
    watchSeconds: integer('watch_seconds').notNull().default(0),
    /** Adaptive stream (HLS, 360p/720p/1080p) made from the upload: none → pending → processing → ready | failed. */
    streamStatus: text('stream_status').$type<'none' | 'pending' | 'processing' | 'ready' | 'failed'>().notNull().default('none'),
    streamUrl: text('stream_url'),
    streamRenditions: jsonb('stream_renditions').$type<number[]>().notNull().default([]),
    streamError: text('stream_error'),
    deletedAt: ts('deleted_at'),
    createdAt: createdAt(),
    updatedAt: updatedAt(),
  },
  (t) => [
    index('videos_stream_idx').on(t.streamStatus),
    index('videos_feed_idx').on(t.visibility, t.kind, t.createdAt),
    index('videos_owner_idx').on(t.ownerId, t.createdAt),
    index('videos_views_idx').on(t.views),
    index('videos_search_trgm').using('gin', sql`${t.searchText} gin_trgm_ops`),
  ],
);

export const videoReactions = pgTable(
  'video_reactions',
  {
    videoId: uuid('video_id')
      .notNull()
      .references(() => videos.id, { onDelete: 'cascade' }),
    userId: uuid('user_id')
      .notNull()
      .references(() => users.id, { onDelete: 'cascade' }),
    value: integer('value').notNull(),
    createdAt: createdAt(),
  },
  (t) => [primaryKey({ columns: [t.videoId, t.userId] }), index('video_reactions_user_idx').on(t.userId, t.createdAt)],
);

export const videoComments = pgTable(
  'video_comments',
  {
    id: id(),
    videoId: uuid('video_id')
      .notNull()
      .references(() => videos.id, { onDelete: 'cascade' }),
    authorId: uuid('author_id')
      .notNull()
      .references(() => users.id, { onDelete: 'cascade' }),
    parentId: uuid('parent_id'),
    text: text('text').notNull(),
    likeCount: integer('like_count').notNull().default(0),
    replyCount: integer('reply_count').notNull().default(0),
    pinned: boolean('pinned').notNull().default(false),
    deletedAt: ts('deleted_at'),
    createdAt: createdAt(),
  },
  (t) => [index('video_comments_video_idx').on(t.videoId, t.parentId, t.createdAt)],
);

export const videoCommentLikes = pgTable(
  'video_comment_likes',
  {
    commentId: uuid('comment_id')
      .notNull()
      .references(() => videoComments.id, { onDelete: 'cascade' }),
    userId: uuid('user_id')
      .notNull()
      .references(() => users.id, { onDelete: 'cascade' }),
  },
  (t) => [primaryKey({ columns: [t.commentId, t.userId] })],
);

/** One row per viewer per video per day: de-duplicates view counts and feeds the Studio chart. */
export const videoViews = pgTable(
  'video_views',
  {
    videoId: uuid('video_id')
      .notNull()
      .references(() => videos.id, { onDelete: 'cascade' }),
    viewerKey: text('viewer_key').notNull(),
    day: date('day', { mode: 'string' }).notNull(),
  },
  (t) => [primaryKey({ columns: [t.videoId, t.viewerKey, t.day] }), index('video_views_day_idx').on(t.day)],
);

export const watchHistory = pgTable(
  'watch_history',
  {
    userId: uuid('user_id')
      .notNull()
      .references(() => users.id, { onDelete: 'cascade' }),
    videoId: uuid('video_id')
      .notNull()
      .references(() => videos.id, { onDelete: 'cascade' }),
    progressSec: integer('progress_sec').notNull().default(0),
    /** Seconds of actual watching credited as study time (capped by wall-clock time between syncs). */
    studiedSec: integer('studied_sec').notNull().default(0),
    completed: boolean('completed').notNull().default(false),
    watchedAt: ts('watched_at').notNull().defaultNow(),
  },
  (t) => [primaryKey({ columns: [t.userId, t.videoId] }), index('watch_history_recent_idx').on(t.userId, t.watchedAt)],
);

export const watchLater = pgTable(
  'watch_later',
  {
    userId: uuid('user_id')
      .notNull()
      .references(() => users.id, { onDelete: 'cascade' }),
    videoId: uuid('video_id')
      .notNull()
      .references(() => videos.id, { onDelete: 'cascade' }),
    createdAt: createdAt(),
  },
  (t) => [primaryKey({ columns: [t.userId, t.videoId] })],
);

export const playlists = pgTable(
  'playlists',
  {
    id: id(),
    ownerId: uuid('owner_id')
      .notNull()
      .references(() => users.id, { onDelete: 'cascade' }),
    title: text('title').notNull(),
    description: text('description').notNull().default(''),
    visibility: text('visibility').$type<'public' | 'unlisted' | 'private'>().notNull().default('public'),
    itemCount: integer('item_count').notNull().default(0),
    createdAt: createdAt(),
    updatedAt: updatedAt(),
  },
  (t) => [index('playlists_owner_idx').on(t.ownerId, t.updatedAt)],
);

export const playlistItems = pgTable(
  'playlist_items',
  {
    playlistId: uuid('playlist_id')
      .notNull()
      .references(() => playlists.id, { onDelete: 'cascade' }),
    videoId: uuid('video_id')
      .notNull()
      .references(() => videos.id, { onDelete: 'cascade' }),
    position: integer('position').notNull(),
    addedAt: createdAt(),
  },
  (t) => [primaryKey({ columns: [t.playlistId, t.videoId] }), index('playlist_items_pos_idx').on(t.playlistId, t.position)],
);

/* ───────────────── Stories ───────────────── */

export const stories = pgTable(
  'stories',
  {
    id: id(),
    authorId: uuid('author_id')
      .notNull()
      .references(() => users.id, { onDelete: 'cascade' }),
    mediaKind: text('media_kind').$type<'image' | 'video' | 'text'>().notNull(),
    mediaUrl: text('media_url'),
    text: text('text').notNull().default(''),
    bgColor: text('bg_color').notNull().default('#6c5ce7'),
    durationSec: integer('duration_sec').notNull().default(6),
    viewCount: integer('view_count').notNull().default(0),
    expiresAt: ts('expires_at').notNull(),
    deletedAt: ts('deleted_at'),
    createdAt: createdAt(),
  },
  (t) => [index('stories_active_idx').on(t.expiresAt, t.authorId), index('stories_author_idx').on(t.authorId, t.createdAt)],
);

export const storyViews = pgTable(
  'story_views',
  {
    storyId: uuid('story_id')
      .notNull()
      .references(() => stories.id, { onDelete: 'cascade' }),
    viewerId: uuid('viewer_id')
      .notNull()
      .references(() => users.id, { onDelete: 'cascade' }),
    reaction: text('reaction'),
    viewedAt: ts('viewed_at').notNull().defaultNow(),
  },
  (t) => [primaryKey({ columns: [t.storyId, t.viewerId] }), index('story_views_viewer_idx').on(t.viewerId, t.viewedAt)],
);

/* ───────────────── Events ───────────────── */

export const events = pgTable(
  'events',
  {
    id: id(),
    hostId: uuid('host_id')
      .notNull()
      .references(() => users.id, { onDelete: 'cascade' }),
    groupId: uuid('group_id').references(() => groups.id, { onDelete: 'cascade' }),
    title: text('title').notNull(),
    description: text('description').notNull().default(''),
    searchText: text('search_text').notNull().default(''),
    coverUrl: text('cover_url'),
    startsAt: ts('starts_at').notNull(),
    endsAt: ts('ends_at'),
    location: text('location').notNull().default(''),
    onlineUrl: text('online_url'),
    goingCount: integer('going_count').notNull().default(0),
    interestedCount: integer('interested_count').notNull().default(0),
    deletedAt: ts('deleted_at'),
    createdAt: createdAt(),
  },
  (t) => [index('events_start_idx').on(t.startsAt), index('events_host_idx').on(t.hostId), index('events_group_idx').on(t.groupId, t.startsAt)],
);

export const eventRsvps = pgTable(
  'event_rsvps',
  {
    eventId: uuid('event_id')
      .notNull()
      .references(() => events.id, { onDelete: 'cascade' }),
    userId: uuid('user_id')
      .notNull()
      .references(() => users.id, { onDelete: 'cascade' }),
    status: text('status').$type<'going' | 'interested'>().notNull(),
    createdAt: createdAt(),
  },
  (t) => [primaryKey({ columns: [t.eventId, t.userId] }), index('event_rsvps_user_idx').on(t.userId, t.status)],
);

/** Private, timestamped notes a learner takes while watching a lesson. */
export const videoNotes = pgTable(
  'video_notes',
  {
    id: id(),
    userId: uuid('user_id')
      .notNull()
      .references(() => users.id, { onDelete: 'cascade' }),
    videoId: uuid('video_id')
      .notNull()
      .references(() => videos.id, { onDelete: 'cascade' }),
    atSec: integer('at_sec').notNull().default(0),
    text: text('text').notNull(),
    createdAt: createdAt(),
  },
  (t) => [index('video_notes_user_video_idx').on(t.userId, t.videoId, t.atSec)],
);

/** Pronunciation practice attempts (speech recognised in the browser, scored against the target phrase). */
export const pronunciationAttempts = pgTable(
  'pronunciation_attempts',
  {
    id: id(),
    userId: uuid('user_id')
      .notNull()
      .references(() => users.id, { onDelete: 'cascade' }),
    language: text('language').notNull(),
    phrase: text('phrase').notNull(),
    heard: text('heard').notNull().default(''),
    score: integer('score').notNull(),
    createdAt: createdAt(),
  },
  (t) => [index('pron_user_idx').on(t.userId, t.createdAt)],
);
