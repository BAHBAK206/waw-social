import { z } from 'zod';
import { LIMITS } from '../limits';
import { FLASHCARD_RATINGS } from '../flashcards';
import { daySchema, idSchema, optionalUrl, timeSchema, trimmed } from './common';

export const questionTypeSchema = z.enum(['mc', 'tf', 'multi', 'short']);
export type QuestionType = z.infer<typeof questionTypeSchema>;

export const questionInputSchema = z
  .object({
    type: questionTypeSchema,
    prompt: trimmed(LIMITS.questionText, 1),
    imageUrl: optionalUrl,
    options: z.array(trimmed(LIMITS.optionText, 1)).max(LIMITS.optionsPerQuestion).default([]),
    /** mc/tf: 0-based index · multi: array of indices · short: accepted answers */
    answer: z.union([z.number().int().min(0), z.array(z.number().int().min(0)).min(1), z.array(trimmed(200, 1)).min(1)]),
    explanation: trimmed(LIMITS.explanation).optional().nullable(),
    topic: trimmed(120).optional().nullable(),
    points: z.number().int().min(1).max(100).default(1),
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

export const quizInputSchema = z.object({
  title: trimmed(LIMITS.quizTitle, 2),
  description: trimmed(2000).default(''),
  sectionId: idSchema.optional().nullable(),
  materialId: idSchema.optional().nullable(),
  courseId: idSchema.optional().nullable(),
  kind: z.enum(['quiz', 'test', 'exam']).default('quiz'),
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
  questions: z.array(questionInputSchema).min(1).max(LIMITS.questionsPerQuiz),
});
export type QuizInput = z.infer<typeof quizInputSchema>;

export const quizListQuerySchema = z.object({
  q: z.string().trim().max(120).optional(),
  sectionId: idSchema.optional(),
  materialId: idSchema.optional(),
  courseId: idSchema.optional(),
  difficulty: z.enum(['easy', 'medium', 'hard']).optional(),
  kind: z.enum(['quiz', 'test', 'exam']).optional(),
  mine: z.coerce.boolean().optional(),
  cursor: z.string().max(200).optional(),
  limit: z.coerce.number().int().min(1).max(100).default(24),
});

export const answerValueSchema = z.union([z.number().int().min(0), z.array(z.number().int().min(0)), z.string().max(500), z.null()]);
export const submitAttemptSchema = z.object({ answers: z.array(answerValueSchema).max(LIMITS.questionsPerQuiz) });
export type SubmitAttemptInput = z.infer<typeof submitAttemptSchema>;
export const startAttemptSchema = z.object({ review: z.boolean().default(false) });
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
export const flashcardReviewSchema = z.object({ rating: z.enum(FLASHCARD_RATINGS as [string, ...string[]]) });

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
  mode: z.enum(['solve', 'explain', 'summarize', 'quiz']).default('solve'),
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
});
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
