import type { FormQuestion, FormQuestionType, FormSettings } from './schemas';

/** Form builder rules shared by the web and mobile editors. */
export const FORM_TYPES: FormQuestionType[] = ['short', 'paragraph', 'single', 'multiple', 'dropdown', 'scale', 'rating', 'date', 'time', 'email', 'number', 'section'];
export const FORM_TYPES_WITH_OPTIONS = new Set<FormQuestionType>(['single', 'multiple', 'dropdown']);

export const DEFAULT_FORM_SETTINGS: FormSettings = {
  acceptingResponses: true,
  requireSignIn: false,
  oneResponsePerUser: false,
  collectEmail: false,
  showResults: false,
  quizMode: false,
  shuffleQuestions: false,
  deadline: null,
  confirmationMessage: '',
  color: '#6c5ce7',
};

const uid = () => Math.random().toString(36).slice(2, 10);

export function blankFormQuestion(type: FormQuestionType = 'short'): FormQuestion {
  return {
    id: uid(),
    type,
    title: '',
    description: '',
    required: false,
    options: FORM_TYPES_WITH_OPTIONS.has(type) ? ['', ''] : [],
    ...(type === 'scale' ? { min: 1, max: 5 } : {}),
    ...(type === 'rating' ? { max: 5 } : {}),
  };
}

/** Changes a question's type, keeping its options where they still apply. */
export function retypeFormQuestion(q: FormQuestion, type: FormQuestionType): FormQuestion {
  return {
    ...q,
    type,
    options: FORM_TYPES_WITH_OPTIONS.has(type) ? (q.options.length ? q.options : ['', '']) : [],
    ...(type === 'scale' ? { min: q.min ?? 1, max: q.max ?? 5 } : {}),
    ...(type === 'rating' ? { max: q.max ?? 5 } : {}),
  };
}

export function validForm(title: string, questions: FormQuestion[]): boolean {
  return title.trim().length > 0 && questions.every((q) => q.title.trim() && (!FORM_TYPES_WITH_OPTIONS.has(q.type) || q.options.filter((o) => o.trim()).length >= 2));
}

export function formQuestionsBody(questions: FormQuestion[]): FormQuestion[] {
  return questions.map((q) => ({
    ...q,
    title: q.title.trim(),
    options: FORM_TYPES_WITH_OPTIONS.has(q.type) ? q.options.map((o) => o.trim()).filter(Boolean) : [],
  }));
}
