import { z } from 'zod';
import { LIMITS } from '../limits';

export const idSchema = z.string().uuid();
export const daySchema = z.string().regex(/^\d{4}-\d{2}-\d{2}$/, 'invalid_day');
export const timeSchema = z.string().regex(/^([01]\d|2[0-3]):[0-5]\d$/, 'invalid_time');
export const urlSchema = z
  .string()
  .trim()
  .max(2048)
  .refine((v) => /^(https?:\/\/|\/)/.test(v), 'invalid_url');
export const optionalUrl = urlSchema.optional().nullable();
export const trimmed = (max: number, min = 0) => z.string().trim().min(min).max(max);

export const paginationSchema = z.object({
  cursor: z.string().max(200).optional(),
  limit: z.coerce.number().int().min(1).max(LIMITS.maxPageSize).default(LIMITS.pageSize),
});
export type Pagination = z.infer<typeof paginationSchema>;

export const searchQuerySchema = paginationSchema.extend({
  q: z.string().trim().max(120).default(''),
});

export const attachmentSchema = z.object({
  url: urlSchema,
  name: trimmed(200, 1),
  mime: trimmed(120, 1),
  size: z.number().int().min(0).max(LIMITS.uploadBytes),
  kind: z.enum(['image', 'file', 'audio', 'video']),
});
export type Attachment = z.infer<typeof attachmentSchema>;
