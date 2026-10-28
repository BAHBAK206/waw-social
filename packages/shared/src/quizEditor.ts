import type { QuizEditorDto } from './dto';
import type { QuestionType } from './schemas';

export type EditorQuestion = QuizEditorDto['questions'][number];
export type QuizDraft = Omit<QuizEditorDto, 'id'>;

/** An empty question of the given type (shared by the web and mobile quiz editors). */
export function blankQuestion(type: QuestionType = 'mc'): EditorQuestion {
  return {
    type,
    prompt: '',
    imageUrl: null,
    options: type === 'tf' ? ['', ''] : type === 'short' ? [] : ['', '', '', ''],
    answer: type === 'multi' ? [0] : type === 'short' ? [''] : 0,
    explanation: null,
    topic: null,
    points: 1,
  };
}

export function blankQuiz(): QuizDraft {
  return {
    title: '',
    description: '',
    sectionId: null,
    materialId: null,
    courseId: null,
    kind: 'quiz',
    difficulty: 'medium',
    durationSec: 600,
    scheduledAt: null,
    published: true,
    shuffle: false,
    questions: [blankQuestion()],
  };
}

/** Every question has text, filled options and a valid correct answer. */
export function validQuizQuestions(questions: EditorQuestion[]): boolean {
  return (
    questions.length > 0 &&
    questions.every((q) => {
      if (!q.prompt.trim()) return false;
      if (q.type === 'short') return Array.isArray(q.answer) && (q.answer as string[]).some((a) => String(a).trim());
      const opts = q.options.filter((o) => o.trim());
      if (q.type === 'tf') return q.options.length === 2 && q.options.every((o) => o.trim());
      if (opts.length < 2 || opts.length !== q.options.length) return false;
      if (q.type === 'multi') return Array.isArray(q.answer) && q.answer.length > 0;
      return typeof q.answer === 'number' && q.answer < q.options.length;
    })
  );
}

/** Trims the draft into the body the API expects. */
export function quizBody(form: QuizDraft): QuizDraft {
  return {
    ...form,
    title: form.title.trim(),
    questions: form.questions.map((q) => ({
      ...q,
      prompt: q.prompt.trim(),
      options: q.type === 'short' ? [] : q.options.map((o) => o.trim()),
      answer: q.type === 'short' ? (q.answer as string[]).map((a) => a.trim()).filter(Boolean) : q.answer,
      explanation: q.explanation?.trim() || null,
      topic: q.topic?.trim() || null,
    })),
  };
}

/** Changes a question's type, keeping what still makes sense (prompt, topic, points). */
export function retypeQuestion(q: EditorQuestion, type: QuestionType, trueLabel: string, falseLabel: string): EditorQuestion {
  const fresh = blankQuestion(type);
  return {
    ...fresh,
    prompt: q.prompt,
    topic: q.topic,
    points: q.points,
    explanation: q.explanation,
    options: type === 'tf' ? [trueLabel, falseLabel] : type === 'short' ? [] : q.options.length >= 2 ? q.options : fresh.options,
  };
}
