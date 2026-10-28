import { and, eq, gt, isNull, or } from 'drizzle-orm';
import { quizAttempts, quizzes } from '../db/schema';
import type { Deps } from './context';

/**
 * The exam a student is sitting right now (an open attempt on an exam or an exam-mode quiz), if any.
 * While it lasts, the AI tutor and assistant don't answer.
 */
export async function activeExam(deps: Deps, userId: string): Promise<{ quizId: string; title: string; until: number } | null> {
  const [row] = await deps.db
    .select({ quizId: quizzes.id, title: quizzes.title, until: quizAttempts.expiresAt })
    .from(quizAttempts)
    .innerJoin(quizzes, eq(quizzes.id, quizAttempts.quizId))
    .where(
      and(
        eq(quizAttempts.userId, userId),
        isNull(quizAttempts.submittedAt),
        gt(quizAttempts.expiresAt, new Date()),
        eq(quizAttempts.review, false),
        or(eq(quizzes.kind, 'exam'), eq(quizzes.integrity, true)),
      ),
    )
    .limit(1);
  return row ? { quizId: row.quizId, title: row.title, until: row.until.getTime() } : null;
}
