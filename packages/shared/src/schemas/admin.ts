import { z } from 'zod';
import { ADMIN_PERMISSIONS } from '../roles';
import { FEATURE_IDS, FEATURE_MODES } from '../features';
import { daySchema, optionalUrl, trimmed } from './common';

export const banSchema = z.object({ reason: trimmed(500).default(''), until: z.number().int().optional().nullable() });
export const setRoleSchema = z.object({ role: z.enum(['user', 'moderator', 'admin']) });
export const setPermissionsSchema = z.object({ permissions: z.array(z.enum(ADMIN_PERMISSIONS)).max(ADMIN_PERMISSIONS.length) });
export const badgeSchema = z.object({
  enabled: z.boolean(),
  label: trimmed(40).default(''),
  color: z.string().regex(/^#[0-9a-fA-F]{6}$/).default('#1d9bf0'),
  icon: trimmed(8).optional(),
  shape: z.enum(['pill', 'shield', 'diamond', 'ribbon', 'seal', 'crown']).default('seal'),
});
export type VerificationBadge = z.infer<typeof badgeSchema>;

export const announcementSchema = z.object({
  title: trimmed(160, 1),
  text: trimmed(2000).default(''),
  imageUrl: optionalUrl,
  link: optionalUrl,
  level: z.enum(['info', 'success', 'warning', 'critical']).default('info'),
  active: z.boolean().default(true),
  expiresAt: z.number().int().optional().nullable(),
});
export const adSchema = z.object({
  title: trimmed(160, 1),
  subtitle: trimmed(300).default(''),
  link: optionalUrl,
  imageUrl: optionalUrl,
  placement: z.enum(['home', 'quiz', 'both']).default('both'),
  active: z.boolean().default(true),
});
export const sectionSchema = z.object({ name: trimmed(120, 1), sort: z.number().int().default(0) });
export const materialSchema = z.object({ sectionId: z.string().uuid(), name: trimmed(120, 1), sort: z.number().int().default(0) });
export const dailyChallengeSchema = z
  .object({
    day: daySchema,
    type: z.enum(['quiz', 'social']),
    title: trimmed(200, 1),
    description: trimmed(1000).default(''),
    question: trimmed(2000).optional().nullable(),
    options: z.array(trimmed(300, 1)).max(6).default([]),
    answer: z.number().int().min(0).max(5).optional().nullable(),
    xp: z.number().int().min(1).max(100).default(10),
  })
  .refine((v) => v.type === 'social' || (v.question && v.options.length >= 2 && v.answer != null && v.answer < v.options.length), {
    message: 'quiz_challenge_incomplete',
  });

const featureEntry = z.object({ mode: z.enum(FEATURE_MODES as [string, ...string[]]), message: trimmed(420).default('') });
// partialRecord: in zod 4 an enum-keyed record is exhaustive; feature overrides are optional per id.
export const featureControlsSchema = z.partialRecord(z.enum(FEATURE_IDS as unknown as [string, ...string[]]), featureEntry);

export const siteSettingsSchema = z.object({
  maintenance: z.object({ enabled: z.boolean(), message: trimmed(1000).default('') }).optional(),
  registrationOpen: z.boolean().optional(),
  contact: z
    .object({
      email: z.string().trim().max(254).default(''),
      phone: trimmed(40).default(''),
      whatsapp: trimmed(40).default(''),
      address: trimmed(300).default(''),
      facebook: trimmed(300).default(''),
      instagram: trimmed(300).default(''),
      telegram: trimmed(300).default(''),
    })
    .optional(),
  ai: z.object({ enabled: z.boolean(), dailyQuota: z.number().int().min(0).max(10000) }).optional(),
  uploads: z.object({ enabled: z.boolean() }).optional(),
});
export type SiteSettingsInput = z.infer<typeof siteSettingsSchema>;

export const assistantKnowledgeSchema = z.object({
  question: trimmed(1000, 1),
  answer: trimmed(8000, 1),
  tags: z.array(trimmed(40, 1)).max(20).default([]),
  language: z.enum(['ar', 'en', 'fr', 'es']).default('ar'),
  link: optionalUrl,
});

export const clientErrorSchema = z.object({
  message: trimmed(1000, 1),
  stack: trimmed(8000).optional(),
  url: trimmed(2048).optional(),
  release: trimmed(64).optional(),
  kind: z.enum(['error', 'unhandledrejection', 'boundary', 'network']).default('error'),
});
