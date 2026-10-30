import { normalizeSearch } from './text';

/** Languages the pronunciation lab supports (same as the UI languages). */
export const LAB_LANGUAGES = ['ar', 'en', 'fr', 'es'] as const;
export type LabLanguage = (typeof LAB_LANGUAGES)[number];

/** BCP-47 tags used for speech synthesis and recognition. */
export const SPEECH_LOCALE: Record<LabLanguage, string> = { ar: 'ar-SA', en: 'en-US', fr: 'fr-FR', es: 'es-ES' };

const ARABIC = /[\u0600-\u06FF\u0750-\u077F\uFB50-\uFDFF\uFE70-\uFEFF]/g;
const LATIN = /[A-Za-zÀ-ÿ]/g;

/** Guesses the language of a text so read-aloud picks a matching voice. Falls back to `fallback` for short/ambiguous text. */
export function detectTextLanguage(text: string, fallback: LabLanguage = 'en'): LabLanguage {
  const arabic = text.match(ARABIC)?.length ?? 0;
  const latin = text.match(LATIN)?.length ?? 0;
  if (arabic > 0 && arabic >= latin) return 'ar';
  if (!latin) return fallback;
  const t = ` ${text.toLowerCase()} `;
  const count = (re: RegExp) => t.match(re)?.length ?? 0;
  const fr = count(/[àâçèêëîïôûùœ]/g) * 2 + count(/ (le|la|les|des|est|et|une|un|du|avec|pour|dans|qui|que|ce|cette) /g);
  const es = count(/[ñ¿¡]/g) * 3 + count(/[áíóú]/g) + count(/ (el|los|las|es|y|una|con|para|por|del|que|como|está) /g);
  const en = count(/ (the|is|and|of|to|in|with|for|what|this|that|are|you) /g) * 1.2;
  const best = Math.max(fr, es, en);
  if (best === 0) return fallback === 'ar' ? 'en' : fallback;
  return best === en ? 'en' : best === fr ? 'fr' : 'es';
}

function clean(s: string): string {
  return normalizeSearch(s)
    .replace(/[\p{P}\p{S}]/gu, ' ')
    .replace(/\s+/g, ' ')
    .trim();
}

function levenshtein(a: string, b: string): number {
  if (a === b) return 0;
  if (!a.length) return b.length;
  if (!b.length) return a.length;
  let prev = Array.from({ length: b.length + 1 }, (_, i) => i);
  for (let i = 1; i <= a.length; i++) {
    const cur = [i];
    for (let j = 1; j <= b.length; j++) cur[j] = Math.min(prev[j]! + 1, cur[j - 1]! + 1, prev[j - 1]! + (a[i - 1] === b[j - 1] ? 0 : 1));
    prev = cur;
  }
  return prev[b.length]!;
}

/** 0..1, 1 = identical. */
export function similarity(a: string, b: string): number {
  const max = Math.max(a.length, b.length);
  return max === 0 ? 1 : 1 - levenshtein(a, b) / max;
}

export interface PronunciationScore {
  /** 0..100 */
  score: number;
  /** Each target word and whether it was heard (close enough). */
  words: { word: string; ok: boolean }[];
}

/**
 * Compares what the learner was asked to say with what speech recognition heard.
 * Words are aligned in order (longest common subsequence with fuzzy matching, so "photosynthesis" ≈ "photo synthesis"
 * and Arabic diacritics/letter variants are ignored). Score blends word coverage (70%) and overall character similarity (30%).
 */
export function scorePronunciation(target: string, heard: string): PronunciationScore {
  const original = target.trim().split(/\s+/).filter(Boolean);
  const t = original.map(clean);
  const h = clean(heard).split(' ').filter(Boolean);
  const close = (a: string, b: string) => a === b || (a.length > 2 && similarity(a, b) >= 0.75);
  // LCS table over words.
  const dp: number[][] = Array.from({ length: t.length + 1 }, () => new Array<number>(h.length + 1).fill(0));
  for (let i = t.length - 1; i >= 0; i--)
    for (let j = h.length - 1; j >= 0; j--) dp[i]![j] = close(t[i]!, h[j]!) ? dp[i + 1]![j + 1]! + 1 : Math.max(dp[i + 1]![j]!, dp[i]![j + 1]!);
  const ok = new Array<boolean>(t.length).fill(false);
  let i = 0;
  let j = 0;
  while (i < t.length && j < h.length) {
    if (close(t[i]!, h[j]!)) {
      ok[i] = true;
      i++;
      j++;
    } else if (dp[i + 1]![j]! >= dp[i]![j + 1]!) i++;
    else j++;
  }
  // Words that are only punctuation do not count.
  const scored = t.map((w, k) => ({ w, k })).filter((x) => x.w.length > 0);
  const coverage = scored.length ? scored.filter((x) => ok[x.k]).length / scored.length : 0;
  const chars = similarity(t.join(' '), h.join(' '));
  const score = heard.trim() ? Math.round(100 * (0.7 * coverage + 0.3 * chars)) : 0;
  return { score: Math.max(0, Math.min(100, score)), words: original.map((word, k) => ({ word, ok: t[k] === '' || ok[k]! })) };
}

export const LAB_SET_IDS = ['basics', 'classroom', 'science', 'tricky'] as const;
export type LabSetId = (typeof LAB_SET_IDS)[number];

/** Built-in practice phrases. Titles come from i18n (`lab.sets.<id>`); learners can also practise their own text or flashcards. */
export const PRONUNCIATION_SETS: Record<LabLanguage, Record<LabSetId, string[]>> = {
  ar: {
    basics: ['السلام عليكم ورحمة الله', 'صباح الخير يا أستاذ', 'شكرًا جزيلًا على المساعدة', 'من فضلك أعد السؤال', 'أنا أذاكر كل يوم', 'إلى اللقاء غدًا'],
    classroom: [
      'افتحوا الكتاب على الصفحة العاشرة',
      'هل يمكنني أن أسأل سؤالًا؟',
      'الواجب المنزلي في الصفحة الأخيرة',
      'اكتب الإجابة على السبورة',
      'الامتحان يوم الخميس القادم',
    ],
    science: [
      'التمثيل الضوئي يحدث في البلاستيدات الخضراء',
      'سرعة الضوء ثلاثمائة ألف كيلومتر في الثانية',
      'الجاذبية الأرضية',
      'المعادلة من الدرجة الثانية',
      'الخلية هي وحدة بناء الكائن الحي',
    ],
    tricky: ['قَلَم وكَلْب', 'حَلِيب وهَلال', 'ذَهَب وزَهْرة', 'ضَوْء ودَفْتَر', 'ظِلّ وزِلْزال', 'عَيْن وأَمَل', 'غَيْمة وخَيْمة', 'ثَعْلَب وسَمَكة'],
  },
  en: {
    basics: ['Good morning, teacher', 'Thank you very much for your help', 'Could you repeat the question, please?', 'I study every day', 'See you tomorrow'],
    classroom: [
      'Open your books to page ten',
      'May I ask a question?',
      'The homework is on the last page',
      'Write the answer on the board',
      'The exam is next Thursday',
    ],
    science: [
      'Photosynthesis happens in the chloroplasts',
      'The speed of light is about three hundred thousand kilometres per second',
      'Gravity pulls objects toward the Earth',
      'A quadratic equation has two solutions',
      'The cell is the basic unit of life',
    ],
    tricky: ['three thin thieves', 'the weather is better', 'she sells sea shells', 'very well', 'world, word, work', 'thought, through, tough'],
  },
  fr: {
    basics: ['Bonjour, madame', 'Merci beaucoup pour votre aide', 'Pouvez-vous répéter la question ?', "J'étudie tous les jours", 'À demain'],
    classroom: [
      'Ouvrez vos livres à la page dix',
      'Est-ce que je peux poser une question ?',
      'Les devoirs sont à la dernière page',
      'Écrivez la réponse au tableau',
      "L'examen est jeudi prochain",
    ],
    science: [
      'La photosynthèse a lieu dans les chloroplastes',
      'La vitesse de la lumière est de trois cent mille kilomètres par seconde',
      'La gravité attire les objets vers la Terre',
      'La cellule est l’unité de base du vivant',
    ],
    tricky: ['un, une, on', 'la rue et la roue', 'le chat sèche ses chaussettes', 'grenouille, feuille, œil', 'huit, oui, lui'],
  },
  es: {
    basics: ['Buenos días, profesora', 'Muchas gracias por tu ayuda', '¿Puedes repetir la pregunta, por favor?', 'Estudio todos los días', 'Hasta mañana'],
    classroom: [
      'Abran el libro en la página diez',
      '¿Puedo hacer una pregunta?',
      'La tarea está en la última página',
      'Escribe la respuesta en la pizarra',
      'El examen es el próximo jueves',
    ],
    science: [
      'La fotosíntesis ocurre en los cloroplastos',
      'La velocidad de la luz es de trescientos mil kilómetros por segundo',
      'La gravedad atrae los objetos hacia la Tierra',
      'La célula es la unidad básica de la vida',
    ],
    tricky: ['perro y pero', 'erre con erre cigarro', 'el niño come piña', 'jirafa, gente, general', 'llave, calle, lluvia'],
  },
};
