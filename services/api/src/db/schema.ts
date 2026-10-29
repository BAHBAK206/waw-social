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
  type AnyPgColumn,
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
    /** School stage and year (p1…p6, m1…m3, s1…s3, uni, adult). */
    gradeLevel: text('grade_level'),
    /** Minutes a day a parent allows for this child (null = no limit). */
    dailyLimitMinutes: integer('daily_limit_minutes'),
    /** Subjects a senior student offers to help juniors with (see canMentor). */
    mentorSubjects: jsonb('mentor_subjects').$type<string[]>().notNull().default([]),
    /** Set when an administrator verifies a teacher account (unlocks public catalog, open live classes…). */
    teacherVerifiedAt: ts('teacher_verified_at'),
    /** Set by a linked parent for a student under 18 (see ParentalControls). */
    parentalControls: jsonb('parental_controls').$type<Record<string, unknown>>(),
    /** Weekly league tier for the next placement (0 = bronze). */
    leagueTier: integer('league_tier').notNull().default(0),
    /** Secret for the private calendar feed (subscribe in Google / Apple Calendar). */
    calendarToken: text('calendar_token'),
    /** Two-step sign-in: the authenticator secret (encrypted) and single-use recovery code hashes. */
    totpSecret: text('totp_secret'),
    totpEnabledAt: ts('totp_enabled_at'),
    totpRecovery: jsonb('totp_recovery').$type<string[]>().notNull().default([]),
    /** Under 13: a parent agreed to the account (or the school created it). Null while waiting. */
    consentAt: ts('consent_at'),
    consentEmail: text('consent_email'),
    /** Parents: verified phone for WhatsApp / SMS reports and alerts. */
    phone: text('phone'),
    phoneVerifiedAt: ts('phone_verified_at'),
    phoneChannel: text('phone_channel').$type<'whatsapp' | 'sms'>().notNull().default('whatsapp'),
    phonePrefs: jsonb('phone_prefs').$type<{ weekly?: boolean; alerts?: boolean }>().notNull().default({}),
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

/** A code sent to confirm a phone number (one at a time per person). */
export const phoneCodes = pgTable('phone_codes', {
  userId: uuid('user_id')
    .primaryKey()
    .references(() => users.id, { onDelete: 'cascade' }),
  phone: text('phone').notNull(),
  channel: text('channel').$type<'whatsapp' | 'sms'>().notNull(),
  codeHash: text('code_hash').notNull(),
  attempts: integer('attempts').notNull().default(0),
  expiresAt: ts('expires_at').notNull(),
  createdAt: createdAt(),
});

/** WhatsApp / SMS sent to people (for daily limits and the admin's view of costs). */
export const messageLog = pgTable(
  'message_log',
  {
    id: id(),
    userId: uuid('user_id')
      .notNull()
      .references(() => users.id, { onDelete: 'cascade' }),
    channel: text('channel').notNull(),
    kind: text('kind').notNull(),
    status: text('status').$type<'sent' | 'failed'>().notNull(),
    createdAt: createdAt(),
  },
  (t) => [index('message_log_user_idx').on(t.userId, t.kind, t.createdAt)],
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
    kind: text('kind').$type<'verify' | 'reset' | 'consent'>().notNull(),
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

/** This week's league groups: who competes with whom, and their XP this week. */
export const leagueMembers = pgTable(
  'league_members',
  {
    /** Monday (UTC) of the week. */
    week: date('week', { mode: 'string' }).notNull(),
    userId: uuid('user_id')
      .notNull()
      .references(() => users.id, { onDelete: 'cascade' }),
    tier: integer('tier').notNull(),
    groupNo: integer('group_no').notNull(),
    xp: integer('xp').notNull().default(0),
    joinedAt: ts('joined_at').notNull().defaultNow(),
    result: text('result').$type<'up' | 'down' | 'stay'>(),
  },
  (t) => [primaryKey({ columns: [t.week, t.userId] }), index('league_members_group_idx').on(t.week, t.tier, t.groupNo)],
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
    /** stripe | paymob | transfer */
    provider: text('provider').notNull().default('stripe'),
    sessionId: text('session_id').notNull(),
    amountCents: integer('amount_cents').notNull(),
    currency: text('currency').notNull(),
    status: text('status').$type<'pending' | 'paid' | 'failed'>().notNull().default('pending'),
    /** Manual transfers: instapay | wallet | bank, the student's reference and receipt, and the teacher's review. */
    method: text('method'),
    reference: text('reference'),
    receipt: jsonb('receipt').$type<Record<string, unknown> | null>(),
    note: text('note'),
    reviewedBy: uuid('reviewed_by').references(() => users.id, { onDelete: 'set null' }),
    reviewedAt: ts('reviewed_at'),
    reason: text('reason'),
    createdAt: createdAt(),
    paidAt: ts('paid_at'),
  },
  (t) => [
    uniqueIndex('payments_session_uq').on(t.sessionId),
    index('payments_user_idx').on(t.userId),
    index('payments_course_provider_idx').on(t.courseId, t.provider, t.status),
  ],
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
/** A teacher asks to be verified; moderators approve or reject. */
export const teacherVerifications = pgTable(
  'teacher_verifications',
  {
    id: id(),
    userId: uuid('user_id')
      .notNull()
      .references(() => users.id, { onDelete: 'cascade' }),
    institution: text('institution').notNull(),
    subject: text('subject').notNull(),
    note: text('note').notNull().default(''),
    /** An uploaded document (private file) or a link to a public staff page. */
    proof: jsonb('proof').$type<Record<string, unknown> | null>(),
    proofUrl: text('proof_url'),
    status: text('status').$type<'pending' | 'approved' | 'rejected'>().notNull().default('pending'),
    reason: text('reason').notNull().default(''),
    reviewedBy: uuid('reviewed_by').references(() => users.id, { onDelete: 'set null' }),
    reviewedAt: ts('reviewed_at'),
    createdAt: createdAt(),
  },
  (t) => [index('teacher_verifications_status_idx').on(t.status, t.createdAt), index('teacher_verifications_user_idx').on(t.userId)],
);

/**
 * A pending parent ↔ student link: a student invites a parent by email (token in the email link), or a parent asks a
 * student, who approves it.
 */
export const guardianRequests = pgTable(
  'guardian_requests',
  {
    id: id(),
    from: text('from').$type<'student' | 'guardian'>().notNull(),
    studentId: uuid('student_id')
      .notNull()
      .references(() => users.id, { onDelete: 'cascade' }),
    guardianId: uuid('guardian_id').references(() => users.id, { onDelete: 'cascade' }),
    email: text('email'),
    tokenHash: text('token_hash'),
    /** The student already said yes; a parent who is already linked must approve (students under 18 who have a parent). */
    awaitingGuardian: boolean('awaiting_guardian').notNull().default(false),
    expiresAt: ts('expires_at').notNull(),
    createdAt: createdAt(),
  },
  (t) => [
    index('guardian_requests_student_idx').on(t.studentId),
    index('guardian_requests_guardian_idx').on(t.guardianId),
    uniqueIndex('guardian_requests_token_uq').on(t.tokenHash),
  ],
);

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
    kind: text('kind').$type<'quiz' | 'test' | 'exam' | 'bank'>().notNull().default('quiz'),
    difficulty: text('difficulty').$type<'easy' | 'medium' | 'hard'>().notNull().default('medium'),
    durationSec: integer('duration_sec').notNull().default(600),
    scheduledAt: ts('scheduled_at'),
    published: boolean('published').notNull().default(true),
    shuffle: boolean('shuffle').notNull().default(false),
    shuffleOptions: boolean('shuffle_options').notNull().default(false),
    integrity: boolean('integrity').notNull().default(false),
    /** Exam built per student from question banks (see blueprintSchema). */
    blueprint: jsonb('blueprint').$type<{
      bankIds: string[];
      rules: { objectiveId?: string | null; difficulty?: 'easy' | 'medium' | 'hard' | null; bloom?: string | null; count: number }[];
    }>(),
    curriculumId: uuid('curriculum_id').references((): AnyPgColumn => curriculumNodes.id, { onDelete: 'set null' }),
    /** Past exam paper: the year and the board/ministry it came from (shown in the "Past papers" list). */
    paperYear: integer('paper_year'),
    paperBoard: text('paper_board'),
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
    objectiveId: uuid('objective_id').references((): AnyPgColumn => curriculumNodes.id, { onDelete: 'set null' }),
    bloom: text('bloom'),
    level: text('level').$type<'easy' | 'medium' | 'hard'>(),
  },
  (t) => [
    index('quiz_questions_quiz_idx').on(t.quizId, t.position),
    index('quiz_questions_topic_idx').on(t.topic),
    index('quiz_questions_objective_idx').on(t.objectiveId),
  ],
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
    /** Per question, the order its options are shown in (option shuffling). */
    optionOrders: jsonb('option_orders').$type<Record<string, number[]>>(),
    /** How often the student left the page / full screen or pasted text (integrity exams). */
    integrity: jsonb('integrity').$type<{ blur: number; fullscreenExit: number; paste: number }>(),
    /** Placement test for a curriculum subject. */
    placementSubjectId: uuid('placement_subject_id'),
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
    /** A class section of a school (e.g. 5A), created by the school admin. */
    schoolId: uuid('school_id').references((): AnyPgColumn => schools.id, { onDelete: 'set null' }),
    schoolSection: text('school_section'),
    /** The class's AI tutor gives hints and questions instead of answers. */
    aiHintsOnly: boolean('ai_hints_only').notNull().default(false),
    transferInfo: jsonb('transfer_info').$type<{ instapay?: string | null; wallet?: string | null; bank?: string | null; note?: string | null } | null>(),
    /** Subject grading: code (e.g. MATH-3), total marks ("out of 60"), pass mark, whether it counts in the overall total. */
    subjectCode: text('subject_code'),
    maxMarks: real('max_marks').notNull().default(100),
    passMarks: real('pass_marks').notNull().default(50),
    countsInTotal: boolean('counts_in_total').notNull().default(true),
    term: text('term'),
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
    /** The grade component this work counts toward (e.g. "Homework"). */
    componentId: uuid('component_id').references((): AnyPgColumn => gradeComponents.id, { onDelete: 'set null' }),
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

/** Parts of a subject's total, e.g. Homework 10 + Monthly tests 20 + Final exam 30 = 60. */
export const gradeComponents = pgTable(
  'grade_components',
  {
    id: id(),
    courseId: uuid('course_id')
      .notNull()
      .references(() => courses.id, { onDelete: 'cascade' }),
    name: text('name').notNull(),
    maxMarks: real('max_marks').notNull(),
    source: text('source').$type<'assignments' | 'manual' | 'attendance'>().notNull().default('manual'),
    position: integer('position').notNull().default(0),
    createdAt: createdAt(),
  },
  (t) => [index('grade_components_course_idx').on(t.courseId, t.position)],
);

/** Marks entered by the teacher for a manual component (a paper exam, oral test…). */
export const componentMarks = pgTable(
  'component_marks',
  {
    componentId: uuid('component_id')
      .notNull()
      .references(() => gradeComponents.id, { onDelete: 'cascade' }),
    studentId: uuid('student_id')
      .notNull()
      .references(() => users.id, { onDelete: 'cascade' }),
    marks: real('marks').notNull(),
    updatedBy: uuid('updated_by').references(() => users.id, { onDelete: 'set null' }),
    updatedAt: updatedAt(),
  },
  (t) => [primaryKey({ columns: [t.componentId, t.studentId] }), index('component_marks_student_idx').on(t.studentId)],
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
    /** Breakout rooms belong to a main class; the main class lists its open groups. */
    parentId: uuid('parent_id').references((): AnyPgColumn => liveRooms.id, { onDelete: 'cascade' }),
    breakoutName: text('breakout_name'),
    breakouts: jsonb('breakouts').$type<{ id: string; name: string; members: string[] }[]>().notNull().default([]),
    /** The register entry made from this class when it ended (automatic attendance). */
    attendanceSessionId: uuid('attendance_session_id'),
    createdAt: createdAt(),
  },
  (t) => [index('live_rooms_scope_idx').on(t.scopeType, t.scopeId), index('live_rooms_status_idx').on(t.status), index('live_rooms_parent_idx').on(t.parentId)],
);

/** Polls and quick quiz questions asked during a live class. */
export const livePolls = pgTable(
  'live_polls',
  {
    id: id(),
    roomId: uuid('room_id')
      .notNull()
      .references(() => liveRooms.id, { onDelete: 'cascade' }),
    createdBy: uuid('created_by').references(() => users.id, { onDelete: 'set null' }),
    question: text('question').notNull(),
    options: jsonb('options').$type<string[]>().notNull(),
    correct: integer('correct'),
    status: text('status').$type<'open' | 'closed'>().notNull().default('open'),
    createdAt: createdAt(),
    closedAt: ts('closed_at'),
  },
  (t) => [index('live_polls_room_idx').on(t.roomId)],
);

export const livePollVotes = pgTable(
  'live_poll_votes',
  {
    pollId: uuid('poll_id')
      .notNull()
      .references(() => livePolls.id, { onDelete: 'cascade' }),
    userId: uuid('user_id')
      .notNull()
      .references(() => users.id, { onDelete: 'cascade' }),
    choice: integer('choice').notNull(),
    createdAt: createdAt(),
  },
  (t) => [primaryKey({ columns: [t.pollId, t.userId] })],
);

/** Time each person spent in a live class (breakout rooms count toward their main class). */
export const liveAttendance = pgTable(
  'live_attendance',
  {
    roomId: uuid('room_id')
      .notNull()
      .references(() => liveRooms.id, { onDelete: 'cascade' }),
    userId: uuid('user_id')
      .notNull()
      .references(() => users.id, { onDelete: 'cascade' }),
    firstAt: ts('first_at').notNull().defaultNow(),
    lastAt: ts('last_at').notNull().defaultNow(),
    seconds: integer('seconds').notNull().default(0),
  },
  (t) => [primaryKey({ columns: [t.roomId, t.userId] })],
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
    /** A reminder to come back to this item; `remindedAt` is set when the reminder was sent. */
    remindAt: ts('remind_at'),
    remindedAt: ts('reminded_at'),
    createdAt: createdAt(),
  },
  (t) => [
    index('saved_items_remind_idx').on(t.remindAt),
    index('saved_items_owner_idx').on(t.ownerId, t.createdAt),
    uniqueIndex('saved_items_ref_uq').on(t.ownerId, t.itemType, t.refId),
  ],
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
    /** Null = everyone (written by administrators); otherwise only members of this class see it (written by its teachers). */
    courseId: uuid('course_id').references((): AnyPgColumn => courses.id, { onDelete: 'cascade' }),
    createdBy: uuid('created_by').references(() => users.id, { onDelete: 'set null' }),
    createdAt: createdAt(),
  },
  (t) => [index('assistant_knowledge_trgm').using('gin', sql`${t.searchText} gin_trgm_ops`), index('assistant_knowledge_course_idx').on(t.courseId)],
);

/** Questions the assistant could not answer (grouped by normalized text) so administrators can add the missing knowledge. */
export const assistantGaps = pgTable(
  'assistant_gaps',
  {
    id: id(),
    question: text('question').notNull(),
    normalized: text('normalized').notNull(),
    language: text('language').notNull().default('ar'),
    count: integer('count').notNull().default(1),
    lastAskedAt: timestamp('last_asked_at', { withTimezone: true }).notNull().defaultNow(),
    createdAt: createdAt(),
  },
  (t) => [uniqueIndex('assistant_gaps_normalized_uq').on(t.normalized), index('assistant_gaps_count_idx').on(t.count)],
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

/** Weekly timetable. A row with a course is that class's schedule (set by its teachers) and every member sees it. */
export const timetableEntries = pgTable(
  'timetable_entries',
  {
    id: id(),
    userId: uuid('user_id')
      .notNull()
      .references(() => users.id, { onDelete: 'cascade' }),
    courseId: uuid('course_id').references(() => courses.id, { onDelete: 'cascade' }),
    day: integer('day').notNull(),
    start: text('start').notNull(),
    end: text('end').notNull(),
    title: text('title').notNull(),
    room: text('room').notNull().default(''),
    color: text('color'),
    createdAt: createdAt(),
  },
  (t) => [index('timetable_user_idx').on(t.userId), index('timetable_course_idx').on(t.courseId)],
);

/* ───────────────────────── Curriculum ───────────────────────── */

/** Subject → unit → lesson → objective, per curriculum system and school year. */
export const curriculumNodes = pgTable(
  'curriculum_nodes',
  {
    id: id(),
    parentId: uuid('parent_id').references((): AnyPgColumn => curriculumNodes.id, { onDelete: 'cascade' }),
    kind: text('kind').$type<'subject' | 'unit' | 'lesson' | 'objective'>().notNull(),
    title: text('title').notNull(),
    code: text('code'),
    description: text('description'),
    system: text('system').notNull().default('general'),
    gradeLevel: text('grade_level'),
    sort: integer('sort').notNull().default(0),
    searchText: text('search_text').notNull().default(''),
    createdBy: uuid('created_by').references(() => users.id, { onDelete: 'set null' }),
    createdAt: createdAt(),
  },
  (t) => [index('curriculum_parent_idx').on(t.parentId, t.sort), index('curriculum_subject_idx').on(t.kind, t.system, t.gradeLevel)],
);

/** Resources (quizzes, video lessons, library items) attached to a curriculum node. */
export const curriculumLinks = pgTable(
  'curriculum_links',
  {
    nodeId: uuid('node_id')
      .notNull()
      .references(() => curriculumNodes.id, { onDelete: 'cascade' }),
    targetType: text('target_type').$type<'quiz' | 'video' | 'library'>().notNull(),
    targetId: uuid('target_id').notNull(),
    createdBy: uuid('created_by').references(() => users.id, { onDelete: 'set null' }),
    createdAt: createdAt(),
  },
  (t) => [primaryKey({ columns: [t.nodeId, t.targetType, t.targetId] }), index('curriculum_links_target_idx').on(t.targetType, t.targetId)],
);

/** One student's result on one objective in one attempt (mastery is computed from these). */
export const objectiveSamples = pgTable(
  'objective_samples',
  {
    id: id(),
    userId: uuid('user_id')
      .notNull()
      .references(() => users.id, { onDelete: 'cascade' }),
    objectiveId: uuid('objective_id')
      .notNull()
      .references(() => curriculumNodes.id, { onDelete: 'cascade' }),
    correct: integer('correct').notNull(),
    total: integer('total').notNull(),
    attemptId: uuid('attempt_id').notNull(),
    createdAt: createdAt(),
  },
  (t) => [index('objective_samples_user_idx').on(t.userId, t.objectiveId, t.createdAt)],
);

/** A school (or centre): its admins add people in bulk, create class sections and print official report cards. */
export const schools = pgTable('schools', {
  id: id(),
  name: text('name').notNull(),
  /** Short code used in the sign-in names of students created without an email. */
  code: text('code').notNull().unique(),
  system: text('system').notNull().default('general'),
  address: text('address'),
  phone: text('phone'),
  logoUrl: text('logo_url'),
  principal: text('principal'),
  /** How parents can pay fees by InstaPay, a wallet or a bank transfer (they send the reference and a receipt). */
  transferInfo: jsonb('transfer_info').$type<{ instapay?: string | null; wallet?: string | null; bank?: string | null; note?: string | null } | null>(),
  createdBy: uuid('created_by').references(() => users.id, { onDelete: 'set null' }),
  createdAt: createdAt(),
  updatedAt: updatedAt(),
});

export const schoolMembers = pgTable(
  'school_members',
  {
    schoolId: uuid('school_id')
      .notNull()
      .references(() => schools.id, { onDelete: 'cascade' }),
    userId: uuid('user_id')
      .notNull()
      .references(() => users.id, { onDelete: 'cascade' }),
    role: text('role').$type<'admin' | 'teacher' | 'student' | 'parent'>().notNull(),
    /** Existing accounts are invited and join only when they accept. */
    status: text('status').$type<'active' | 'invited'>().notNull().default('active'),
    section: text('section'),
    studentNumber: text('student_number'),
    /** The school created this account (its admin may reset the password). */
    managed: boolean('managed').notNull().default(false),
    invitedBy: uuid('invited_by').references(() => users.id, { onDelete: 'set null' }),
    createdAt: createdAt(),
  },
  (t) => [
    primaryKey({ columns: [t.schoolId, t.userId] }),
    index('school_members_user_idx').on(t.userId),
    index('school_members_section_idx').on(t.schoolId, t.role, t.section),
  ],
);

/** A quiz question the student missed, scheduled for spaced review (same scheduler as flashcards). */
export const questionReviews = pgTable(
  'question_reviews',
  {
    userId: uuid('user_id')
      .notNull()
      .references(() => users.id, { onDelete: 'cascade' }),
    questionId: uuid('question_id')
      .notNull()
      .references(() => quizQuestions.id, { onDelete: 'cascade' }),
    ease: real('ease').notNull().default(2.5),
    level: integer('level').notNull().default(0),
    repetitions: integer('repetitions').notNull().default(0),
    lapses: integer('lapses').notNull().default(0),
    intervalDays: doublePrecision('interval_days').notNull().default(0),
    /** How many times the question was answered wrong in total (recurring-mistake detection). */
    misses: integer('misses').notNull().default(0),
    dueAt: ts('due_at').notNull().defaultNow(),
    lastResult: boolean('last_result'),
    lastReviewedAt: ts('last_reviewed_at'),
    createdAt: createdAt(),
  },
  (t) => [primaryKey({ columns: [t.userId, t.questionId] }), index('question_reviews_due_idx').on(t.userId, t.dueAt)],
);

/** A focus session: notifications are muted and social screens hidden until it ends. */
export const focusSessions = pgTable(
  'focus_sessions',
  {
    id: id(),
    userId: uuid('user_id')
      .notNull()
      .references(() => users.id, { onDelete: 'cascade' }),
    startedAt: ts('started_at').notNull().defaultNow(),
    endsAt: ts('ends_at').notNull(),
    endedAt: ts('ended_at'),
    minutes: integer('minutes').notNull().default(0),
    muted: integer('muted').notNull().default(0),
  },
  (t) => [index('focus_sessions_user_idx').on(t.userId, t.startedAt)],
);

/** Glossary term of a subject: personal, or shared with a course by its teacher. */
export const glossaryTerms = pgTable(
  'glossary_terms',
  {
    id: id(),
    userId: uuid('user_id')
      .notNull()
      .references(() => users.id, { onDelete: 'cascade' }),
    courseId: uuid('course_id'),
    subject: text('subject').notNull(),
    term: text('term').notNull(),
    definition: text('definition').notNull(),
    source: text('source').$type<'manual' | 'lesson'>().notNull().default('manual'),
    createdAt: createdAt(),
  },
  (t) => [index('glossary_subject_idx').on(t.userId, t.subject), index('glossary_course_idx').on(t.courseId)],
);

/** A task shared by a study group: anyone in the group can add it and tick it off. */
export const groupTasks = pgTable(
  'group_tasks',
  {
    id: id(),
    groupId: uuid('group_id')
      .notNull()
      .references(() => groups.id, { onDelete: 'cascade' }),
    title: text('title').notNull(),
    createdBy: uuid('created_by').references(() => users.id, { onDelete: 'set null' }),
    doneBy: uuid('done_by').references(() => users.id, { onDelete: 'set null' }),
    doneAt: ts('done_at'),
    createdAt: createdAt(),
  },
  (t) => [index('group_tasks_group_idx').on(t.groupId, t.createdAt)],
);

/** A class's study-time goal for one week (Monday start). Reaching it earns every student a badge and XP once. */
export const classGoals = pgTable(
  'class_goals',
  {
    id: id(),
    courseId: uuid('course_id')
      .notNull()
      .references(() => courses.id, { onDelete: 'cascade' }),
    weekStart: date('week_start', { mode: 'string' }).notNull(),
    targetMinutes: integer('target_minutes').notNull(),
    createdBy: uuid('created_by').references(() => users.id, { onDelete: 'set null' }),
    reachedAt: ts('reached_at'),
    createdAt: createdAt(),
  },
  (t) => [uniqueIndex('class_goals_week_uq').on(t.courseId, t.weekStart)],
);

/** A quiz or assignment a teacher shares with the other teachers of their school. */
export const schoolTemplates = pgTable(
  'school_templates',
  {
    id: id(),
    schoolId: uuid('school_id')
      .notNull()
      .references(() => schools.id, { onDelete: 'cascade' }),
    kind: text('kind').$type<'quiz' | 'assignment'>().notNull(),
    title: text('title').notNull(),
    payload: jsonb('payload').$type<Record<string, unknown>>().notNull(),
    authorId: uuid('author_id').references(() => users.id, { onDelete: 'set null' }),
    uses: integer('uses').notNull().default(0),
    createdAt: createdAt(),
  },
  (t) => [index('school_templates_school_idx').on(t.schoolId, t.kind, t.createdAt)],
);

/** A personal comment from a teacher about one student in one class (shown to the student and their parents). */
export const studentComments = pgTable(
  'student_comments',
  {
    id: id(),
    courseId: uuid('course_id')
      .notNull()
      .references(() => courses.id, { onDelete: 'cascade' }),
    studentId: uuid('student_id')
      .notNull()
      .references(() => users.id, { onDelete: 'cascade' }),
    teacherId: uuid('teacher_id').references(() => users.id, { onDelete: 'set null' }),
    text: text('text').notNull(),
    createdAt: createdAt(),
  },
  (t) => [index('student_comments_idx').on(t.studentId, t.createdAt), index('student_comments_course_idx').on(t.courseId, t.createdAt)],
);

/** A fee a school charges (tuition, activities…), split into monthly instalments, one invoice per student and instalment. */
export const schoolFees = pgTable(
  'school_fees',
  {
    id: id(),
    schoolId: uuid('school_id')
      .notNull()
      .references(() => schools.id, { onDelete: 'cascade' }),
    title: text('title').notNull(),
    amountCents: integer('amount_cents').notNull(),
    currency: text('currency').notNull().default('EGP'),
    instalments: integer('instalments').notNull().default(1),
    firstDue: date('first_due', { mode: 'string' }).notNull(),
    /** Only students of this section (null = every student of the school). */
    section: text('section'),
    createdBy: uuid('created_by').references(() => users.id, { onDelete: 'set null' }),
    createdAt: createdAt(),
  },
  (t) => [index('school_fees_school_idx').on(t.schoolId, t.createdAt)],
);

export const feeInvoices = pgTable(
  'fee_invoices',
  {
    id: id(),
    feeId: uuid('fee_id')
      .notNull()
      .references(() => schoolFees.id, { onDelete: 'cascade' }),
    schoolId: uuid('school_id')
      .notNull()
      .references(() => schools.id, { onDelete: 'cascade' }),
    studentId: uuid('student_id')
      .notNull()
      .references(() => users.id, { onDelete: 'cascade' }),
    no: integer('no').notNull(),
    amountCents: integer('amount_cents').notNull(),
    currency: text('currency').notNull(),
    dueDay: date('due_day', { mode: 'string' }).notNull(),
    /** pending → (review →) paid, or cancelled by the school. */
    status: text('status').$type<'pending' | 'review' | 'paid' | 'cancelled'>().notNull().default('pending'),
    /** paymob | transfer, and for transfers instapay | wallet | bank with the payer's reference and receipt. */
    provider: text('provider'),
    method: text('method'),
    reference: text('reference'),
    receipt: jsonb('receipt').$type<Record<string, unknown> | null>(),
    paidBy: uuid('paid_by').references(() => users.id, { onDelete: 'set null' }),
    paidAt: ts('paid_at'),
    reason: text('reason'),
    lastRemindedAt: ts('last_reminded_at'),
    createdAt: createdAt(),
  },
  (t) => [
    uniqueIndex('fee_invoices_uq').on(t.feeId, t.studentId, t.no),
    index('fee_invoices_student_idx').on(t.studentId, t.dueDay),
    index('fee_invoices_school_idx').on(t.schoolId, t.status, t.dueDay),
  ],
);

export const schoolAnnouncements = pgTable(
  'school_announcements',
  {
    id: id(),
    schoolId: uuid('school_id')
      .notNull()
      .references(() => schools.id, { onDelete: 'cascade' }),
    title: text('title').notNull(),
    body: text('body').notNull().default(''),
    /** all | students | teachers | parents */
    audience: text('audience').notNull().default('all'),
    createdBy: uuid('created_by').references(() => users.id, { onDelete: 'set null' }),
    createdAt: createdAt(),
  },
  (t) => [index('school_announcements_idx').on(t.schoolId, t.createdAt)],
);

/** A date on the school calendar (holiday, exam period, event, parents' meeting). */
export const schoolEvents = pgTable(
  'school_events',
  {
    id: id(),
    schoolId: uuid('school_id')
      .notNull()
      .references(() => schools.id, { onDelete: 'cascade' }),
    title: text('title').notNull(),
    day: date('day', { mode: 'string' }).notNull(),
    endDay: date('end_day', { mode: 'string' }),
    kind: text('kind').$type<'holiday' | 'exam' | 'event' | 'meeting'>().notNull().default('event'),
    createdBy: uuid('created_by').references(() => users.id, { onDelete: 'set null' }),
    createdAt: createdAt(),
  },
  (t) => [index('school_events_idx').on(t.schoolId, t.day)],
);

export const schoolSurveys = pgTable(
  'school_surveys',
  {
    id: id(),
    schoolId: uuid('school_id')
      .notNull()
      .references(() => schools.id, { onDelete: 'cascade' }),
    title: text('title').notNull(),
    /** students | parents | teachers | all */
    audience: text('audience').notNull().default('all'),
    questions: jsonb('questions').$type<{ id: string; text: string; kind: 'rating' | 'text' }[]>().notNull(),
    closedAt: ts('closed_at'),
    createdBy: uuid('created_by').references(() => users.id, { onDelete: 'set null' }),
    createdAt: createdAt(),
  },
  (t) => [index('school_surveys_idx').on(t.schoolId, t.createdAt)],
);

/** Survey answers are anonymous: only a one-way key per person (so nobody answers twice) is stored, never the person. */
export const surveyResponses = pgTable(
  'survey_responses',
  {
    id: id(),
    surveyId: uuid('survey_id')
      .notNull()
      .references(() => schoolSurveys.id, { onDelete: 'cascade' }),
    respondentKey: text('respondent_key').notNull(),
    answers: jsonb('answers').$type<Record<string, string | number>>().notNull(),
    createdAt: createdAt(),
  },
  (t) => [uniqueIndex('survey_responses_uq').on(t.surveyId, t.respondentKey)],
);

/** An "needs help" warning sent to a student's parents and teachers (at most one per week per student). */
export const earlyWarnings = pgTable(
  'early_warnings',
  {
    id: id(),
    studentId: uuid('student_id')
      .notNull()
      .references(() => users.id, { onDelete: 'cascade' }),
    level: text('level').notNull(),
    reasons: jsonb('reasons').$type<string[]>().notNull().default([]),
    createdAt: createdAt(),
  },
  (t) => [index('early_warnings_idx').on(t.studentId, t.createdAt)],
);

/** A parent-teacher meeting slot: published by the teacher, booked by a parent for one of their children. */
export const meetingSlots = pgTable(
  'meeting_slots',
  {
    id: id(),
    teacherId: uuid('teacher_id')
      .notNull()
      .references(() => users.id, { onDelete: 'cascade' }),
    startsAt: ts('starts_at').notNull(),
    endsAt: ts('ends_at').notNull(),
    status: text('status').$type<'open' | 'booked' | 'cancelled'>().notNull().default('open'),
    bookedBy: uuid('booked_by').references(() => users.id, { onDelete: 'set null' }),
    studentId: uuid('student_id').references(() => users.id, { onDelete: 'set null' }),
    note: text('note').notNull().default(''),
    remindedDayAt: ts('reminded_day_at'),
    remindedHourAt: ts('reminded_hour_at'),
    createdAt: createdAt(),
  },
  (t) => [index('meeting_slots_teacher_idx').on(t.teacherId, t.startsAt), index('meeting_slots_booked_idx').on(t.bookedBy, t.startsAt)],
);

/** A teacher's note about a student's behavior (praise or a concern), shown to the student and their parents. */
export const behaviorNotes = pgTable(
  'behavior_notes',
  {
    id: id(),
    studentId: uuid('student_id')
      .notNull()
      .references(() => users.id, { onDelete: 'cascade' }),
    courseId: uuid('course_id')
      .notNull()
      .references(() => courses.id, { onDelete: 'cascade' }),
    teacherId: uuid('teacher_id').references(() => users.id, { onDelete: 'set null' }),
    kind: text('kind').$type<'positive' | 'concern'>().notNull(),
    text: text('text').notNull(),
    createdAt: createdAt(),
  },
  (t) => [index('behavior_notes_student_idx').on(t.studentId, t.createdAt)],
);

/** "I saw the homework": a parent's one-tap acknowledgement that they know about an assignment. */
export const homeworkAcks = pgTable(
  'homework_acks',
  {
    assignmentId: uuid('assignment_id')
      .notNull()
      .references(() => assignments.id, { onDelete: 'cascade' }),
    studentId: uuid('student_id')
      .notNull()
      .references(() => users.id, { onDelete: 'cascade' }),
    guardianId: uuid('guardian_id')
      .notNull()
      .references(() => users.id, { onDelete: 'cascade' }),
    ackedAt: ts('acked_at').notNull().defaultNow(),
  },
  (t) => [primaryKey({ columns: [t.assignmentId, t.studentId, t.guardianId] })],
);

/** Minutes spent in the app on a day, counted only for people with a daily limit (plus extra time a parent granted). */
export const usageLog = pgTable(
  'usage_log',
  {
    userId: uuid('user_id')
      .notNull()
      .references(() => users.id, { onDelete: 'cascade' }),
    day: date('day', { mode: 'string' }).notNull(),
    minutes: integer('minutes').notNull().default(0),
    bonusMinutes: integer('bonus_minutes').notNull().default(0),
    lastPingAt: ts('last_ping_at'),
  },
  (t) => [primaryKey({ columns: [t.userId, t.day] })],
);

/** A student's daily "how are you?" answer (1 = very low … 5 = great). Private to the student. */
export const moodChecks = pgTable(
  'mood_checks',
  {
    userId: uuid('user_id')
      .notNull()
      .references(() => users.id, { onDelete: 'cascade' }),
    day: date('day', { mode: 'string' }).notNull(),
    mood: integer('mood').notNull(),
    note: text('note').notNull().default(''),
    createdAt: createdAt(),
  },
  (t) => [primaryKey({ columns: [t.userId, t.day] })],
);

/** One gentle "low mood" heads-up per student per week. */
export const moodAlerts = pgTable(
  'mood_alerts',
  {
    id: id(),
    userId: uuid('user_id')
      .notNull()
      .references(() => users.id, { onDelete: 'cascade' }),
    createdAt: createdAt(),
  },
  (t) => [index('mood_alerts_idx').on(t.userId, t.createdAt)],
);

/**
 * An anonymous complaint to a school's supervisors. Nothing here says who wrote it; the writer keeps a tracking
 * code (only its hash is stored) to read the school's reply.
 */
export const complaints = pgTable(
  'complaints',
  {
    id: id(),
    schoolId: uuid('school_id')
      .notNull()
      .references(() => schools.id, { onDelete: 'cascade' }),
    codeHash: text('code_hash').notNull(),
    category: text('category').$type<'bullying' | 'harassment' | 'safety' | 'other'>().notNull(),
    body: text('body').notNull(),
    status: text('status').$type<'new' | 'seen' | 'resolved'>().notNull().default('new'),
    reply: text('reply'),
    createdAt: createdAt(),
    updatedAt: updatedAt(),
  },
  (t) => [uniqueIndex('complaints_code_uq').on(t.codeHash), index('complaints_school_idx').on(t.schoolId, t.status, t.createdAt)],
);
