import { z } from 'zod';
import { LIMITS } from '../limits';
import { FLASHCARD_RATINGS } from '../flashcards';
import { BLOOM_LEVELS, CURRICULUM_SYSTEMS, ITEM_DIFFICULTIES } from '../curriculum';
import { daySchema, idSchema, optionalUrl, timeSchema, trimmed } from './common';

export const questionTypeSchema = z.enum(['mc', 'tf', 'multi', 'short']);
export type QuestionType = z.infer<typeof questionTypeSchema>;

export const questionInputSchema = z
  .object({
    /** Existing question (kept so its statistics carry on). */
    id: idSchema.optional(),
    type: questionTypeSchema,
    prompt: trimmed(LIMITS.questionText, 1),
    imageUrl: optionalUrl,
    options: z.array(trimmed(LIMITS.optionText, 1)).max(LIMITS.optionsPerQuestion).default([]),
    /** mc/tf: 0-based index · multi: array of indices · short: accepted answers */
    answer: z.union([z.number().int().min(0), z.array(z.number().int().min(0)).min(1), z.array(trimmed(200, 1)).min(1)]),
    explanation: trimmed(LIMITS.explanation).optional().nullable(),
    topic: trimmed(120).optional().nullable(),
    points: z.number().int().min(1).max(100).default(1),
    /** Curriculum node (usually an objective) this question checks. */
    objectiveId: idSchema.optional().nullable(),
    bloom: z.enum(BLOOM_LEVELS).optional().nullable(),
    level: z.enum(ITEM_DIFFICULTIES).optional().nullable(),
  })
  .superRefine((q, ctx) => {
    if (q.type === 'tf' && q.options.length !== 2) ctx.addIssue({ code: 'custom', message: 'tf_needs_two_options' });
    if ((q.type === 'mc' || q.type === 'multi') && q.options.length < 2) ctx.addIssue({ code: 'custom', message: 'needs_two_options' });
    if (q.type === 'mc' || q.type === 'tf') {
      if (typeof q.answer !== 'number' || q.answer >= q.options.length) ctx.addIssue({ code: 'custom', message: 'answer_out_of_range' });
    }
    if (q.type === 'multi') {
      if (!Array.isArray(q.answer) || q.answer.some((a) => typeof a !== 'number' || a >= q.options.length))
        ctx.addIssue({ code: 'custom', message: 'answer_out_of_range' });
    }
    if (q.type === 'short' && (!Array.isArray(q.answer) || q.answer.some((a) => typeof a !== 'string')))
      ctx.addIssue({ code: 'custom', message: 'short_needs_text_answers' });
  });
export type QuestionInput = z.infer<typeof questionInputSchema>;

/** Exam rules: each student gets `count` random questions per rule, from the chosen question banks. */
export const blueprintSchema = z.object({
  bankIds: z.array(idSchema).min(1).max(20),
  rules: z
    .array(
      z.object({
        objectiveId: idSchema.optional().nullable(),
        difficulty: z.enum(ITEM_DIFFICULTIES).optional().nullable(),
        bloom: z.enum(BLOOM_LEVELS).optional().nullable(),
        count: z.number().int().min(1).max(100),
      }),
    )
    .min(1)
    .max(30),
});
export type BlueprintInput = z.infer<typeof blueprintSchema>;

export const quizInputSchema = z
  .object({
    title: trimmed(LIMITS.quizTitle, 2),
    description: trimmed(2000).default(''),
    sectionId: idSchema.optional().nullable(),
    materialId: idSchema.optional().nullable(),
    courseId: idSchema.optional().nullable(),
    /** "bank" = a question bank: never listed or taken directly, used to build exams. */
    kind: z.enum(['quiz', 'test', 'exam', 'bank']).default('quiz'),
    difficulty: z.enum(['easy', 'medium', 'hard']).default('medium'),
    durationSec: z
      .number()
      .int()
      .min(30)
      .max(6 * 3600)
      .default(600),
    scheduledAt: z.number().int().optional().nullable(),
    published: z.boolean().default(true),
    shuffle: z.boolean().default(false),
    /** Each student sees the options of a question in a different order. */
    shuffleOptions: z.boolean().default(false),
    /** Ask for full screen and log when the student leaves the page during the attempt. */
    integrity: z.boolean().default(false),
    /** Build each student's questions from question banks instead of the questions below. */
    blueprint: blueprintSchema.optional().nullable(),
    /** Curriculum node the whole quiz belongs to (shown on the curriculum page). */
    curriculumId: idSchema.optional().nullable(),
    /** Past exam paper: year and board (e.g. "Thanaweya Amma"). Listed under "Past papers". */
    paperYear: z.number().int().min(1950).max(2100).optional().nullable(),
    paperBoard: trimmed(80).optional().nullable(),
    questions: z.array(questionInputSchema).max(LIMITS.questionsPerQuiz).default([]),
  })
  .superRefine((q, ctx) => {
    if (!q.blueprint && q.questions.length < 1) ctx.addIssue({ code: 'custom', path: ['questions'], message: 'needs_questions' });
    if (q.blueprint && q.kind === 'bank') ctx.addIssue({ code: 'custom', path: ['blueprint'], message: 'bank_cannot_use_blueprint' });
  });
export type QuizInput = z.infer<typeof quizInputSchema>;

export const quizListQuerySchema = z.object({
  q: z.string().trim().max(120).optional(),
  sectionId: idSchema.optional(),
  materialId: idSchema.optional(),
  courseId: idSchema.optional(),
  difficulty: z.enum(['easy', 'medium', 'hard']).optional(),
  kind: z.enum(['quiz', 'test', 'exam', 'bank']).optional(),
  mine: z.coerce.boolean().optional(),
  /** Only past exam papers. */
  papers: z.coerce.boolean().optional(),
  paperYear: z.coerce.number().int().optional(),
  cursor: z.string().max(200).optional(),
  limit: z.coerce.number().int().min(1).max(100).default(24),
});

export const answerValueSchema = z.union([z.number().int().min(0), z.array(z.number().int().min(0)), z.string().max(500), z.null()]);
export const submitAttemptSchema = z.object({ answers: z.array(answerValueSchema).max(LIMITS.questionsPerQuiz) });
export type SubmitAttemptInput = z.infer<typeof submitAttemptSchema>;
export const startAttemptSchema = z.object({ review: z.boolean().default(false) });
export const integrityEventSchema = z.object({ type: z.enum(['blur', 'fullscreen_exit', 'paste']) });
export const adaptiveQuizSchema = z.object({
  courseId: idSchema.optional().nullable(),
  topic: trimmed(120).optional().nullable(),
  count: z.number().int().min(3).max(30).default(10),
});

export const dailyAnswerSchema = z.object({ answer: z.number().int().min(0).max(10).optional() });

export const flashcardInputSchema = z.object({
  front: trimmed(2000, 1),
  back: trimmed(4000, 1),
  deck: trimmed(80).default('general'),
  topic: trimmed(120).optional().nullable(),
  courseId: idSchema.optional().nullable(),
});
export const flashcardReviewSchema = z.object({
  rating: z.enum(FLASHCARD_RATINGS as [string, ...string[]]),
  /** When the review happened (set by apps that reviewed offline and sync later). */
  reviewedAt: z.number().int().positive().optional(),
});

export const pomodoroStartSchema = z.object({
  minutes: z.number().int().min(5).max(90).default(25),
  label: trimmed(120).optional(),
});

export const taskInputSchema = z.object({
  title: trimmed(LIMITS.taskTitle, 1),
  notes: trimmed(4000).default(''),
  dueAt: z.number().int().optional().nullable(),
  priority: z.enum(['low', 'medium', 'high']).default('medium'),
  status: z.enum(['todo', 'doing', 'done']).default('todo'),
  tags: z.array(trimmed(30, 1)).max(10).default([]),
  subtasks: z
    .array(z.object({ title: trimmed(200, 1), done: z.boolean().default(false) }))
    .max(30)
    .default([]),
});
export type TaskInput = z.infer<typeof taskInputSchema>;

export const noteInputSchema = z.object({
  title: trimmed(200).default(''),
  body: trimmed(LIMITS.noteBody).default(''),
  color: z.enum(['default', 'yellow', 'green', 'blue', 'pink', 'purple']).default('default'),
  pinned: z.boolean().default(false),
  tags: z.array(trimmed(30, 1)).max(10).default([]),
});

export const examInputSchema = z.object({
  subject: trimmed(120, 1),
  day: daySchema,
  time: timeSchema.optional().nullable(),
  place: trimmed(120).optional().nullable(),
  notes: trimmed(1000).optional().nullable(),
});

export const studySessionSchema = z.object({
  title: trimmed(160, 1),
  subject: trimmed(120).optional().nullable(),
  day: daySchema,
  startTime: timeSchema.optional().nullable(),
  minutes: z.number().int().min(5).max(600).default(45),
  notes: trimmed(2000).optional().nullable(),
  completed: z.boolean().default(false),
});

export const weeklyPlanQuerySchema = z.object({
  budget: z.coerce.number().int().min(15).max(600).optional(),
  days: z.coerce.number().int().min(1).max(14).optional(),
});

export const aiSolveSchema = z.object({
  question: trimmed(LIMITS.aiQuestion, 1),
  material: trimmed(LIMITS.aiMaterial).optional(),
  options: z.array(trimmed(500, 1)).max(8).optional(),
  courseId: idSchema.optional().nullable(),
  /** socratic: hints and guiding questions instead of the answer. */
  mode: z.enum(['solve', 'explain', 'summarize', 'quiz', 'socratic']).default('solve'),
});
export type AiSolveInput = z.infer<typeof aiSolveSchema>;

export const essayGradeSchema = z.object({
  answer: trimmed(10000, 1),
  keyId: idSchema.optional(),
  modelAnswer: trimmed(10000).optional(),
  keyPoints: z.array(trimmed(500, 1)).max(30).optional(),
});

export const assistantMessageSchema = z.object({
  threadId: idSchema.optional().nullable(),
  text: trimmed(4000, 1),
  language: z.enum(['ar', 'en', 'fr', 'es']).optional(),
  /** Guide me: hints and questions instead of answers. */
  hints: z.boolean().optional(),
});
/** Feedback on writing against an assignment's rubric: the student's draft, or a submission (teacher). */
export const rubricFeedbackSchema = z
  .object({ assignmentId: idSchema.optional(), submissionId: idSchema.optional(), text: trimmed(20000).optional() })
  .refine((v) => !!v.submissionId || (!!v.assignmentId && !!v.text && v.text.length >= 20), { message: 'submission_or_text' });
export const assistantFeedbackSchema = z.object({
  messageId: idSchema,
  rating: z.enum(['up', 'down']),
  comment: trimmed(1000).optional(),
});

export const pronunciationAttemptSchema = z.object({
  language: z.enum(['ar', 'en', 'fr', 'es']),
  phrase: trimmed(300, 1),
  /** What the browser's speech recognition heard; the server re-scores it. */
  heard: trimmed(600).default(''),
});

/* ───────────── Curriculum ───────────── */

export const curriculumNodeSchema = z.object({
  parentId: idSchema.optional().nullable(),
  kind: z.enum(['subject', 'unit', 'lesson', 'objective']),
  title: trimmed(200, 1),
  code: trimmed(40).optional().nullable(),
  description: trimmed(2000).optional().nullable(),
  system: z.enum(CURRICULUM_SYSTEMS).default('general'),
  gradeLevel: z.string().max(10).optional().nullable(),
  sort: z.number().int().min(0).max(100000).default(0),
});
export type CurriculumNodeInput = z.infer<typeof curriculumNodeSchema>;

export interface CurriculumImportNode {
  title: string;
  code?: string | null;
  description?: string | null;
  children?: CurriculumImportNode[];
}
const importNode: z.ZodType<CurriculumImportNode> = z.lazy(() =>
  z.object({
    title: trimmed(200, 1),
    code: trimmed(40).optional().nullable(),
    description: trimmed(2000).optional().nullable(),
    children: z.array(importNode).max(200).optional(),
  }),
);

/** A whole subject at once: units → lessons → objectives (paste the official programme as JSON). */
export const curriculumImportSchema = z.object({
  system: z.enum(CURRICULUM_SYSTEMS).default('general'),
  gradeLevel: z.string().max(10).optional().nullable(),
  subject: importNode,
});

export const curriculumLinkSchema = z.object({
  targetType: z.enum(['quiz', 'video', 'library']),
  targetId: idSchema,
});

export const curriculumQuerySchema = z.object({
  system: z.enum(CURRICULUM_SYSTEMS).optional(),
  gradeLevel: z.string().max(10).optional(),
  q: z.string().trim().max(120).optional(),
});

/* ───────── Smart study (daily review, study pack, focus, glossary) ───────── */

export const reviewAnswerSchema = z.object({
  answer: z.union([z.number().int(), z.array(z.number().int()).max(20), z.string().max(500)]).nullable(),
});

export const studyPackSchema = z.object({
  text: z.string().trim().min(80).max(60_000).optional(),
  videoId: idSchema.optional(),
  noteId: idSchema.optional(),
  language: z.enum(['en', 'ar', 'fr', 'es']).optional(),
});

export const studyPackSaveSchema = z.object({
  deck: trimmed(80, 1).default('study-pack'),
  cards: z
    .array(z.object({ front: trimmed(500, 1), back: trimmed(1000, 1) }))
    .min(1)
    .max(100),
  terms: z
    .array(z.object({ term: trimmed(120, 1), definition: trimmed(600, 1) }))
    .max(100)
    .default([]),
  subject: trimmed(80).optional(),
});

export const applyPlanSchema = z.object({
  budget: z.coerce.number().int().min(15).max(600).optional(),
  days: z.coerce.number().int().min(1).max(14).optional(),
});

export const focusStartSchema = z.object({ minutes: z.number().int().min(5).max(180).default(25) });

export const glossaryInputSchema = z.object({
  subject: trimmed(80, 1),
  term: trimmed(120, 1),
  definition: trimmed(600, 1),
  courseId: idSchema.optional().nullable(),
});

export const glossaryQuerySchema = z.object({
  subject: z.string().trim().max(80).optional(),
  courseId: idSchema.optional(),
  q: z.string().trim().max(120).optional(),
});

/* ───────── Collaboration and motivation ───────── */

export const groupTaskSchema = z.object({ title: trimmed(200, 1) });
export const groupTaskUpdateSchema = z.object({ done: z.boolean() });
export const classGoalSchema = z.object({ targetMinutes: z.number().int().min(30).max(200_000) });
export const mentorSettingsSchema = z.object({ subjects: z.array(trimmed(40, 1)).max(6) });
export const mentorQuerySchema = z.object({ subject: z.string().trim().max(40).optional() });
