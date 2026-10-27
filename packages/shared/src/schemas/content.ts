import { z } from 'zod';
import { LIMITS } from '../limits';
import { idSchema, optionalUrl, trimmed } from './common';

export const formQuestionTypes = [
  'short',
  'paragraph',
  'single',
  'multiple',
  'dropdown',
  'scale',
  'rating',
  'date',
  'time',
  'email',
  'number',
  'section',
] as const;
export type FormQuestionType = (typeof formQuestionTypes)[number];

export const formQuestionSchema = z.object({
  id: z.string().min(1).max(40),
  type: z.enum(formQuestionTypes),
  title: trimmed(500, 1),
  description: trimmed(2000).default(''),
  required: z.boolean().default(false),
  options: z.array(trimmed(300, 1)).max(50).default([]),
  min: z.number().int().optional(),
  max: z.number().int().optional(),
  /** Quiz mode: correct option(s) and points */
  correct: z.array(z.string().max(300)).max(50).optional(),
  points: z.number().int().min(0).max(100).optional(),
});
export type FormQuestion = z.infer<typeof formQuestionSchema>;

export const formSettingsSchema = z.object({
  acceptingResponses: z.boolean().default(true),
  requireSignIn: z.boolean().default(false),
  oneResponsePerUser: z.boolean().default(false),
  collectEmail: z.boolean().default(false),
  showResults: z.boolean().default(false),
  quizMode: z.boolean().default(false),
  shuffleQuestions: z.boolean().default(false),
  deadline: z.number().int().optional().nullable(),
  confirmationMessage: trimmed(1000).default(''),
  color: z.string().regex(/^#[0-9a-fA-F]{6}$/).default('#6c5ce7'),
});
export type FormSettings = z.infer<typeof formSettingsSchema>;

export const formInputSchema = z.object({
  title: trimmed(LIMITS.formTitle, 1),
  description: trimmed(4000).default(''),
  settings: formSettingsSchema.default(formSettingsSchema.parse({})),
  questions: z.array(formQuestionSchema).max(LIMITS.formQuestions).default([]),
  published: z.boolean().default(false),
});
export type FormInput = z.infer<typeof formInputSchema>;

export const formResponseSchema = z.object({
  answers: z.record(z.string().max(40), z.union([z.string().max(5000), z.array(z.string().max(300)).max(50), z.number()])),
  email: z.string().trim().max(254).optional(),
});
export type FormResponseInput = z.infer<typeof formResponseSchema>;

export const libraryItemSchema = z.object({
  title: trimmed(200, 1),
  description: trimmed(2000).default(''),
  category: z.enum(['book', 'summary', 'exam', 'notes', 'video', 'other']).default('other'),
  sectionId: idSchema.optional().nullable(),
  materialId: idSchema.optional().nullable(),
  fileUrl: z.string().trim().min(1).max(2048),
  mime: trimmed(120).default('application/octet-stream'),
  size: z.number().int().min(0).default(0),
  coverUrl: optionalUrl,
});

export const workspaceFolderSchema = z.object({ name: trimmed(120, 1), parentId: idSchema.optional().nullable() });
export const workspaceKinds = ['doc', 'sheet', 'slides', 'whiteboard'] as const;
export type WorkspaceKind = (typeof workspaceKinds)[number];
export const workspaceFileCreateSchema = z.object({
  title: trimmed(200, 1),
  kind: z.enum(workspaceKinds),
  folderId: idSchema.optional().nullable(),
  content: z.unknown().optional(),
});
export const workspaceFileUpdateSchema = z.object({
  title: trimmed(200, 1).optional(),
  folderId: idSchema.optional().nullable(),
  content: z.unknown().optional(),
  version: z.number().int().min(0),
});

export const savedCollectionSchema = z.object({
  name: trimmed(80, 1),
  description: trimmed(500).default(''),
  isPublic: z.boolean().default(false),
});
export const savedItemSchema = z.object({
  itemType: z.enum(['post', 'quiz', 'library', 'group', 'user', 'link', 'form', 'course']),
  refId: z.string().max(64).optional().nullable(),
  title: trimmed(200, 1),
  url: z.string().trim().max(2048).optional().nullable(),
  note: trimmed(1000).default(''),
  collectionId: idSchema.optional().nullable(),
});
