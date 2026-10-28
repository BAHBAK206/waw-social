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
  /** Public course catalog. */
  listed: z.boolean().optional(),
  priceCents: z.number().int().min(0).max(10_000_000).optional(),
  currency: z
    .string()
    .regex(/^[A-Z]{3}$/)
    .optional(),
  /** Subject grading. */
  subjectCode: trimmed(32).optional().nullable(),
  maxMarks: z.number().min(1).max(1000).optional(),
  passMarks: z.number().min(0).max(1000).optional(),
  countsInTotal: z.boolean().optional(),
  term: trimmed(80).optional().nullable(),
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
  /** Grade component this work counts toward. */
  componentId: idSchema.optional().nullable(),
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

export const voucherBatchSchema = z.object({ count: z.number().int().min(1).max(200) });
export const redeemVoucherSchema = z.object({ code: z.string().trim().min(6).max(20) });
export const issueCertificatesSchema = z
  .object({
    /** Specific students, or everyone whose average grade is at least `minGrade`. */
    studentIds: z.array(z.string().uuid()).max(500).optional(),
    minGrade: z.number().min(0).max(100).optional(),
    title: trimmed(200).optional(),
  })
  .refine((v) => !!v.studentIds?.length || v.minGrade !== undefined, { message: 'students_required' });

export const gradeComponentsSchema = z.object({
  components: z
    .array(
      z.object({
        id: idSchema.optional(),
        name: trimmed(80, 1),
        maxMarks: z.number().min(0.5).max(1000),
        source: z.enum(['assignments', 'manual', 'attendance']),
      }),
    )
    .max(20),
});

export const componentMarksSchema = z.object({
  marks: z
    .array(z.object({ componentId: idSchema, studentId: idSchema, marks: z.number().min(0).max(1000).nullable() }))
    .min(1)
    .max(3000),
});

const hhmm = z.string().regex(/^([01]\d|2[0-3]):[0-5]\d$/, 'time_format');

/** One weekly class in the timetable (a course id makes it the class schedule, visible to its members). */
export const timetableEntrySchema = z
  .object({
    day: z.number().int().min(0).max(6),
    start: hhmm,
    end: hhmm,
    title: z.string().trim().min(1).max(80),
    room: z.string().trim().max(60).default(''),
    color: z
      .string()
      .regex(/^#[0-9a-fA-F]{6}$/)
      .nullable()
      .optional(),
    courseId: idSchema.nullable().optional(),
  })
  .refine((v) => v.end > v.start, { message: 'end_before_start', path: ['end'] });
export type TimetableEntryInput = z.infer<typeof timetableEntrySchema>;
