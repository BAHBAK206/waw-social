import { z } from 'zod';
import { attachmentSchema, daySchema, idSchema, optionalUrl, trimmed, urlSchema } from './common';

export const courseInputSchema = z.object({
  title: trimmed(160, 2),
  description: trimmed(4000).default(''),
  subject: trimmed(120).optional().nullable(),
  coverUrl: optionalUrl,
  color: z
    .string()
    .regex(/^#[0-9a-fA-F]{6}$/)
    .optional()
    .nullable(),
});
export const joinCourseSchema = z.object({ code: z.string().trim().min(4).max(16) });
export const courseAnnouncementSchema = z
  .object({ text: trimmed(5000).default(''), attachments: z.array(attachmentSchema).max(10).default([]) })
  .refine((v) => v.text.length > 0 || v.attachments.length > 0, { message: 'empty_announcement' });
export const courseMemberRoleSchema = z.object({ role: z.enum(['assistant', 'student']) });

export const assignmentInputSchema = z.object({
  title: trimmed(200, 1),
  description: trimmed(10000).default(''),
  dueAt: z.number().int().optional().nullable(),
  releaseAt: z.number().int().optional().nullable(),
  points: z.number().int().min(0).max(1000).default(100),
  rubricId: idSchema.optional().nullable(),
  allowLate: z.boolean().default(true),
  state: z.enum(['draft', 'published', 'closed']).default('published'),
  attachments: z.array(attachmentSchema).max(10).default([]),
  topic: trimmed(120).optional().nullable(),
});
export type AssignmentInput = z.infer<typeof assignmentInputSchema>;

export const submissionInputSchema = z
  .object({ text: trimmed(20000).default(''), attachments: z.array(attachmentSchema).max(10).default([]) })
  .refine((v) => v.text.length > 0 || v.attachments.length > 0, { message: 'empty_submission' });

export const gradeInputSchema = z.object({
  grade: z.number().min(0).max(1000),
  feedback: trimmed(5000).default(''),
  /** Spoken feedback recorded by the teacher. */
  feedbackAudio: attachmentSchema
    .refine((a) => a.kind === 'audio', { message: 'audio_required' })
    .nullable()
    .optional(),
  rubricScores: z.record(z.string(), z.number().min(0).max(1000)).optional(),
  returned: z.boolean().default(true),
});

export const rubricInputSchema = z.object({
  title: trimmed(160, 1),
  criteria: z
    .array(
      z.object({
        title: trimmed(160, 1),
        description: trimmed(1000).default(''),
        levels: z
          .array(z.object({ label: trimmed(80, 1), points: z.number().min(0).max(1000) }))
          .min(1)
          .max(8),
      }),
    )
    .min(1)
    .max(20),
});

export const attendanceSessionSchema = z.object({ title: trimmed(160).default(''), day: daySchema });
export const attendanceMarkSchema = z.object({
  records: z.array(z.object({ studentId: idSchema, status: z.enum(['present', 'absent', 'late', 'excused']) })).max(500),
});

export const courseMaterialSchema = z.object({
  title: trimmed(200, 1),
  text: trimmed(200000).default(''),
  topic: trimmed(120).optional().nullable(),
  fileUrl: optionalUrl,
  visibleToStudents: z.boolean().default(true),
});

export const essayKeySchema = z.object({
  prompt: trimmed(4000, 1),
  modelAnswer: trimmed(10000).default(''),
  keyPoints: z.array(trimmed(500, 1)).min(1).max(30),
  topic: trimmed(120).optional().nullable(),
});

export const synonymSchema = z.object({ term: trimmed(80, 1), synonyms: z.array(trimmed(80, 1)).min(1).max(30) });

export const liveRoomInputSchema = z.object({
  title: trimmed(160, 1),
  scopeType: z.enum(['group', 'community', 'course', 'open']).default('open'),
  scopeId: idSchema.optional().nullable(),
  scheduledAt: z.number().int().optional().nullable(),
  settings: z
    .object({
      allowStudentCamera: z.boolean().default(true),
      allowStudentMic: z.boolean().default(true),
      allowStudentScreen: z.boolean().default(false),
      allowChat: z.boolean().default(true),
    })
    .default({ allowStudentCamera: true, allowStudentMic: true, allowStudentScreen: false, allowChat: true }),
});
export type LiveRoomInput = z.infer<typeof liveRoomInputSchema>;

export const scheduledClassSchema = z.object({
  title: trimmed(160, 1),
  subject: trimmed(120).optional().nullable(),
  description: trimmed(2000).default(''),
  link: urlSchema,
  startsAt: z.number().int().optional().nullable(),
});
