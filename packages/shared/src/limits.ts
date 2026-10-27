export const LIMITS = {
  displayName: { min: 2, max: 60 },
  username: { min: 3, max: 30 },
  password: { min: 8, max: 128 },
  bio: 300,
  institution: 120,
  postText: 5000,
  commentText: 1000,
  messageText: 4000,
  groupName: { min: 3, max: 80 },
  groupDescription: 1000,
  quizTitle: 160,
  questionText: 2000,
  optionText: 500,
  questionsPerQuiz: 200,
  optionsPerQuestion: 8,
  explanation: 2000,
  taskTitle: 200,
  noteBody: 20000,
  formTitle: 200,
  formQuestions: 100,
  uploadBytes: 25 * 1024 * 1024,
  imageBytes: 8 * 1024 * 1024,
  aiQuestion: 4000,
  aiMaterial: 60000,
  workspaceContentBytes: 2 * 1024 * 1024,
  pageSize: 20,
  maxPageSize: 100,
} as const;

export const IMAGE_MIME = ['image/jpeg', 'image/png', 'image/webp', 'image/gif'] as const;
export const DOCUMENT_MIME = [
  'application/pdf',
  'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
  'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
  'application/vnd.openxmlformats-officedocument.presentationml.presentation',
  'text/plain',
  'text/csv',
  'text/markdown',
  'application/zip',
] as const;
export const AUDIO_MIME = ['audio/webm', 'audio/ogg', 'audio/mpeg', 'audio/mp4', 'audio/wav', 'audio/x-m4a', 'audio/aac'] as const;
export const VIDEO_MIME = ['video/webm', 'video/mp4', 'video/quicktime'] as const;
export const ALLOWED_UPLOAD_MIME: readonly string[] = [...IMAGE_MIME, ...DOCUMENT_MIME, ...AUDIO_MIME, ...VIDEO_MIME];

export const REACTIONS = ['like', 'love', 'haha', 'wow', 'sad', 'celebrate'] as const;
export type Reaction = (typeof REACTIONS)[number];
export const REACTION_EMOJI: Record<Reaction, string> = {
  like: '👍',
  love: '❤️',
  haha: '😂',
  wow: '😮',
  sad: '😢',
  celebrate: '🎉',
};
export const MESSAGE_EMOJI = ['👍', '❤️', '😂', '😮', '😢', '🙏', '🔥', '✅'] as const;
