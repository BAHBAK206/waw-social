import { z } from 'zod';
import { CURRICULUM_SYSTEMS } from '../curriculum';
import { SCHOOL_ROLES } from '../schoolImport';
import { GRADE_LEVELS } from '../stages';
import { attachmentSchema, daySchema, idSchema, optionalUrl, trimmed, urlSchema } from './common';

/** How students pay a teacher directly (Egypt: InstaPay, mobile wallets, bank transfer). Shown on paid courses. */
export const TRANSFER_METHODS = ['instapay', 'wallet', 'bank'] as const;
export type TransferMethod = (typeof TRANSFER_METHODS)[number];
export const transferInfoSchema = z.object({
  instapay: trimmed(100).optional().nullable(),
  wallet: z
    .string()
    .trim()
    .regex(/^\+?[0-9 ]{8,20}$/)
    .optional()
    .nullable()
    .or(z.literal('')),
  bank: trimmed(300).optional().nullable(),
  note: trimmed(500).optional().nullable(),
});
export type TransferInfo = z.infer<typeof transferInfoSchema>;

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
  /** Manual payment details (InstaPay handle, wallet number, bank account). */
  transferInfo: transferInfoSchema.nullable().optional(),
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
export const CHECKOUT_METHODS = ['stripe', 'paymob_card', 'paymob_wallet'] as const;
export type CheckoutMethod = (typeof CHECKOUT_METHODS)[number];
export const checkoutSchema = z.object({
  method: z.enum(CHECKOUT_METHODS).default('stripe'),
  /** Mobile wallet number (Vodafone Cash, Orange, Etisalat, WE). */
  phone: z
    .string()
    .trim()
    .regex(/^\+?[0-9]{10,15}$/)
    .optional(),
});
export const transferRequestSchema = z.object({
  method: z.enum(TRANSFER_METHODS),
  /** Transaction number / sender name or number, so the teacher can match it. */
  reference: trimmed(80, 3),
  receipt: attachmentSchema,
  note: trimmed(500).default(''),
});
export const transferReviewSchema = z.object({ approve: z.boolean(), reason: trimmed(300).optional() });
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

/* Schools: a school admin manages people, class sections and official report cards. */
export const schoolInputSchema = z.object({
  name: trimmed(160, 2),
  system: z.enum(CURRICULUM_SYSTEMS).default('general'),
  address: trimmed(300).optional().nullable(),
  phone: trimmed(40).optional().nullable(),
  logoUrl: optionalUrl,
  /** Shown on report cards: principal's name and the stamp line. */
  principal: trimmed(120).optional().nullable(),
});
const importEmail = z.string().trim().toLowerCase().email().max(254).nullable().optional();
export const schoolImportSchema = z.object({
  rows: z
    .array(
      z.object({
        name: trimmed(80, 2),
        email: importEmail,
        role: z.enum(SCHOOL_ROLES),
        gradeLevel: z
          .enum(GRADE_LEVELS as unknown as [string, ...string[]])
          .nullable()
          .optional(),
        section: trimmed(20).nullable().optional(),
        studentNumber: trimmed(40).nullable().optional(),
        parentEmail: importEmail,
        parentName: trimmed(80).nullable().optional(),
      }),
    )
    .min(1)
    .max(300),
});
export const schoolMemberUpdateSchema = z.object({
  role: z.enum(SCHOOL_ROLES).optional(),
  section: trimmed(20).nullable().optional(),
  studentNumber: trimmed(40).nullable().optional(),
});
export const schoolClassSchema = z.object({
  section: trimmed(20, 1),
  title: trimmed(160, 2),
  subjectCode: trimmed(32).optional().nullable(),
  teacherId: idSchema,
  maxMarks: z.number().min(1).max(1000).optional(),
  passMarks: z.number().min(0).max(1000).optional(),
  term: trimmed(80).optional().nullable(),
});
