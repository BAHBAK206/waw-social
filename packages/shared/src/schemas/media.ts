import { z } from 'zod';
import { LIMITS, STORY_REACTIONS } from '../limits';
import { idSchema, optionalUrl, trimmed, urlSchema } from './common';

export const videoKinds = ['video', 'short'] as const;
export const videoVisibility = ['public', 'unlisted', 'private'] as const;

const tagList = z
  .array(trimmed(40, 1))
  .max(15)
  .default([])
  .transform((tags) => [...new Set(tags.map((t) => t.replace(/^#/, '').toLowerCase()))]);

export const videoInputSchema = z.object({
  kind: z.enum(videoKinds).default('video'),
  title: trimmed(LIMITS.videoTitle, 1),
  description: trimmed(LIMITS.videoDescription).default(''),
  videoUrl: urlSchema,
  thumbnailUrl: optionalUrl,
  durationSec: z
    .number()
    .int()
    .min(1)
    .max(60 * 60 * 6),
  visibility: z.enum(videoVisibility).default('public'),
  tags: tagList,
  sectionId: idSchema.optional().nullable(),
  materialId: idSchema.optional().nullable(),
  allowComments: z.boolean().default(true),
  /** "Check your understanding" quiz offered when the lesson ends. */
  quizId: idSchema.optional().nullable(),
});
export type VideoInput = z.infer<typeof videoInputSchema>;

export const videoUpdateSchema = videoInputSchema.omit({ kind: true, videoUrl: true, durationSec: true }).partial();

export const videoListQuerySchema = z.object({
  feed: z.enum(['home', 'trending', 'subscriptions', 'new', 'liked']).default('home'),
  kind: z.enum(videoKinds).optional(),
  q: z.string().trim().max(100).optional(),
  tag: z.string().trim().max(40).optional(),
  sectionId: idSchema.optional(),
  materialId: idSchema.optional(),
  ownerId: idSchema.optional(),
  cursor: z.string().max(200).optional(),
  limit: z.coerce.number().int().min(1).max(50).default(20),
});

export const videoReactSchema = z.object({ value: z.union([z.literal(1), z.literal(-1), z.literal(0)]) });
export const videoProgressSchema = z.object({
  progressSec: z
    .number()
    .min(0)
    .max(60 * 60 * 6),
  completed: z.boolean().default(false),
});
export const videoCommentSchema = z.object({ text: trimmed(LIMITS.commentText, 1), parentId: idSchema.optional().nullable() });

export const playlistInputSchema = z.object({
  title: trimmed(100, 1),
  description: trimmed(1000).default(''),
  visibility: z.enum(videoVisibility).default('public'),
});
export const playlistItemSchema = z.object({ videoId: idSchema });
export const playlistReorderSchema = z.object({ videoIds: z.array(idSchema).max(LIMITS.playlistItems) });

export const storyInputSchema = z
  .object({
    mediaKind: z.enum(['image', 'video', 'text']),
    mediaUrl: optionalUrl,
    text: trimmed(LIMITS.storyTextMax).default(''),
    bgColor: z
      .string()
      .regex(/^#[0-9a-fA-F]{6}$/)
      .default('#6c5ce7'),
    durationSec: z.number().int().min(1).max(60).default(6),
  })
  .refine((v) => v.mediaKind === 'text' || !!v.mediaUrl, { message: 'media_required' })
  .refine((v) => v.mediaKind !== 'text' || v.text.length > 0, { message: 'text_required' });
export type StoryInput = z.infer<typeof storyInputSchema>;
export const storyReactSchema = z.object({ emoji: z.enum(STORY_REACTIONS) });

export const eventInputSchema = z
  .object({
    title: trimmed(120, 1),
    description: trimmed(5000).default(''),
    coverUrl: optionalUrl,
    startsAt: z.number().int(),
    endsAt: z.number().int().optional().nullable(),
    location: trimmed(200).default(''),
    onlineUrl: optionalUrl,
    groupId: idSchema.optional().nullable(),
  })
  .refine((v) => !v.endsAt || v.endsAt > v.startsAt, { message: 'invalid_range' });
export type EventInput = z.infer<typeof eventInputSchema>;
export const eventRsvpSchema = z.object({ status: z.enum(['going', 'interested', 'none']) });
export const eventListQuerySchema = z.object({
  scope: z.enum(['upcoming', 'mine', 'past']).default('upcoming'),
  groupId: idSchema.optional(),
  cursor: z.string().max(200).optional(),
  limit: z.coerce.number().int().min(1).max(50).default(20),
});

export const videoNoteSchema = z.object({
  atSec: z
    .number()
    .min(0)
    .max(60 * 60 * 6)
    .transform((v) => Math.floor(v)),
  text: trimmed(1000, 1),
});

export const captionLanguageSchema = z.enum(['ar', 'en', 'fr', 'es']);
/** A WebVTT or SubRip file's text. */
export const captionsUploadSchema = z.object({ content: z.string().min(10).max(2_000_000) });
export const captionsTranslateSchema = z.object({ to: captionLanguageSchema });
export const captionsAutoSchema = z.object({ language: captionLanguageSchema.optional() });

/** Teacher AI tools. The source is one of: a lesson (its captions, description and chapters), pasted text, or an uploaded document. */
export const teacherAiSchema = z
  .object({
    task: z.enum(['quiz', 'summary', 'chapters', 'ideas']),
    videoId: z.string().uuid().optional(),
    text: z.string().max(60_000).optional(),
    fileUrl: z.string().max(2048).optional(),
    count: z.number().int().min(1).max(20).default(5),
    types: z
      .array(z.enum(['mc', 'tf', 'short']))
      .min(1)
      .max(3)
      .default(['mc', 'tf', 'short']),
    language: z.enum(['ar', 'en', 'fr', 'es']).default('ar'),
  })
  .refine((v) => !!(v.videoId || v.text?.trim() || v.fileUrl), { message: 'source_required' });
export type TeacherAiInput = z.infer<typeof teacherAiSchema>;
