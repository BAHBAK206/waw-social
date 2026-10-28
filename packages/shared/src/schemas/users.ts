import { z } from 'zod';
import { LIMITS } from '../limits';
import { GRADE_LEVELS } from '../stages';
import { DESIGNS, LANGUAGES, READING_FONTS, SKINS, TEXT_SIZES, THEME_MODES } from '../appearance';
import { birthYearSchema, displayNameSchema, usernameSchema } from './auth';
import { optionalUrl, trimmed } from './common';

const tuple = <T extends string>(v: readonly T[]) => v as unknown as [T, ...T[]];

export const updateProfileSchema = z.object({
  displayName: displayNameSchema.optional(),
  username: usernameSchema.optional().nullable(),
  bio: trimmed(LIMITS.bio).optional(),
  avatarUrl: optionalUrl,
  coverUrl: optionalUrl,
  gender: z.enum(['male', 'female']).optional().nullable(),
  educationLevel: trimmed(80).optional().nullable(),
  institution: trimmed(LIMITS.institution).optional().nullable(),
  accountType: z.enum(['student', 'teacher', 'parent']).optional(),
  birthYear: birthYearSchema.optional(),
  gradeLevel: z
    .enum(GRADE_LEVELS as unknown as [string, ...string[]])
    .optional()
    .nullable(),
});
export type UpdateProfileInput = z.infer<typeof updateProfileSchema>;

export const privacySchema = z.object({
  profileVisibility: z.enum(['public', 'members']).default('public'),
  allowMessages: z.enum(['everyone', 'following', 'none']).default('everyone'),
  showStats: z.boolean().default(true),
  showOnline: z.boolean().default(true),
});
export type Privacy = z.infer<typeof privacySchema>;

export const notificationPrefsSchema = z.object({
  follows: z.boolean().default(true),
  comments: z.boolean().default(true),
  reactions: z.boolean().default(true),
  messages: z.boolean().default(true),
  groups: z.boolean().default(true),
  school: z.boolean().default(true),
  live: z.boolean().default(true),
  system: z.boolean().default(true),
  /** Phone and browser notifications while the app is closed (each device still has to allow them). */
  push: z.boolean().default(true),
});
export type NotificationPrefs = z.infer<typeof notificationPrefsSchema>;

export const appearanceSchema = z.object({
  theme: z.enum(tuple(THEME_MODES)),
  design: z.enum(tuple(DESIGNS)),
  skin: z.enum(tuple(SKINS)),
  language: z.enum(tuple(LANGUAGES)),
  textSize: z.enum(tuple(TEXT_SIZES)),
  reduceMotion: z.boolean(),
  highContrast: z.boolean(),
  readingFont: z.enum(tuple(READING_FONTS)),
});

export const updatePrefsSchema = z.object({
  appearance: appearanceSchema.partial().optional(),
  privacy: privacySchema.partial().optional(),
  notifications: notificationPrefsSchema.partial().optional(),
  timezone: z.string().max(64).optional(),
  dailyGoalMinutes: z.number().int().min(5).max(600).optional(),
  onboardingDone: z.boolean().optional(),
});
export type UpdatePrefsInput = z.infer<typeof updatePrefsSchema>;

export const reportSchema = z.object({
  targetType: z.enum(['user', 'post', 'comment', 'message', 'group', 'form', 'library', 'video', 'video_comment', 'story', 'event']),
  targetId: z.string().min(1).max(64),
  reason: z.enum(['spam', 'abuse', 'inappropriate', 'impersonation', 'copyright', 'other']),
  details: trimmed(1000).optional(),
});
export type ReportInput = z.infer<typeof reportSchema>;

/** Browser push services. The server posts to the endpoint, so anything else (an internal address) is refused. */
const PUSH_HOSTS = [
  /^fcm\.googleapis\.com$/,
  /^updates\.push\.services\.mozilla\.com$/,
  /(^|\.)push\.apple\.com$/,
  /\.notify\.windows\.com$/,
  /^push\.services\.mozilla\.com$/,
];
export function isPushEndpoint(url: string): boolean {
  try {
    const u = new URL(url);
    return u.protocol === 'https:' && !u.port && PUSH_HOSTS.some((h) => h.test(u.hostname));
  } catch {
    return false;
  }
}

/** A phone (Expo push token) or a browser (Web Push subscription) that should receive notifications. */
export const pushDeviceSchema = z.discriminatedUnion('kind', [
  z.object({
    kind: z.literal('expo'),
    token: z.string().regex(/^(Exponent|Expo)PushToken\[[\w-]+\]$/, 'invalid_push_token'),
    platform: z.enum(['ios', 'android']).default('android'),
  }),
  z.object({
    kind: z.literal('web'),
    token: z.string().url().max(1024).refine(isPushEndpoint, 'invalid_push_token'),
    keys: z.object({ p256dh: z.string().min(10).max(200), auth: z.string().min(8).max(100) }),
    platform: z.literal('web').default('web'),
  }),
]);
export type PushDeviceInput = z.infer<typeof pushDeviceSchema>;

/** A parent sets these for a linked child under 18. */
export const parentalControlsSchema = z.object({
  messages: z.enum(['classes', 'known']).optional(),
  publicPosts: z.boolean().optional(),
  joinGroups: z.boolean().optional(),
  ai: z.boolean().optional(),
  gradeLevel: z.enum(GRADE_LEVELS as unknown as [string, ...string[]]).optional(),
});

export const guardianInviteSchema = z.object({ email: z.string().trim().toLowerCase().email().max(254) });
/** A parent asks to link with a student by the student's email or username. */
export const guardianRequestSchema = z.object({ who: z.string().trim().toLowerCase().min(3).max(254) });

export const teacherVerificationSchema = z.object({
  institution: trimmed(160, 2),
  subject: trimmed(120, 2),
  note: trimmed(1000).default(''),
  /** A public page that shows the person teaches there (school staff page, ministry registry…). */
  proofUrl: z
    .string()
    .trim()
    .url()
    .max(500)
    .refine((u) => /^https?:\/\//i.test(u), 'invalid_url')
    .optional()
    .nullable(),
});
export const verificationDecisionSchema = z.object({ reason: trimmed(500).default('') });
