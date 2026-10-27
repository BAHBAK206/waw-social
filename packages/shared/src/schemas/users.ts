import { z } from 'zod';
import { LIMITS } from '../limits';
import { DESIGNS, LANGUAGES, SKINS, TEXT_SIZES, THEME_MODES } from '../appearance';
import { displayNameSchema, usernameSchema } from './auth';
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
  accountType: z.enum(['student', 'teacher']).optional(),
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
});
export type NotificationPrefs = z.infer<typeof notificationPrefsSchema>;

export const appearanceSchema = z.object({
  theme: z.enum(tuple(THEME_MODES)),
  design: z.enum(tuple(DESIGNS)),
  skin: z.enum(tuple(SKINS)),
  language: z.enum(tuple(LANGUAGES)),
  textSize: z.enum(tuple(TEXT_SIZES)),
  reduceMotion: z.boolean(),
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
  targetType: z.enum(['user', 'post', 'comment', 'message', 'group', 'form', 'library']),
  targetId: z.string().min(1).max(64),
  reason: z.enum(['spam', 'abuse', 'inappropriate', 'impersonation', 'copyright', 'other']),
  details: trimmed(1000).optional(),
});
export type ReportInput = z.infer<typeof reportSchema>;
