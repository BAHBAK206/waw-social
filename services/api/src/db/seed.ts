/**
 * Idempotent seed: subject taxonomy, starter quizzes, a month of daily challenges and the assistant
 * knowledge base. Optional: a root admin (SEED_ADMIN_EMAIL + SEED_ADMIN_PASSWORD) and, outside
 * production, a demo student (SEED_DEMO=true).
 *
 * Run: pnpm --filter @qubedu/api db:seed   (or `node dist/seed.js` from the built image)
 */
import { readFileSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { addDays, dayKey, normalizeSearch } from '@qubedu/shared';
import { count, eq } from 'drizzle-orm';
import { hashPassword } from '../lib/crypto';
import { createDb } from './client';
import { runMigrations } from './migrate';
import { assistantKnowledge, dailyChallenges, eduMaterials, eduSections, quizQuestions, quizzes, users } from './schema';

type Db = ReturnType<typeof createDb>['db'];

const TAXONOMY: { name: string; materials: string[] }[] = [
  { name: 'الرياضيات', materials: ['الجبر', 'الهندسة', 'التفاضل والتكامل', 'الإحصاء والاحتمالات'] },
  { name: 'العلوم', materials: ['الفيزياء', 'الكيمياء', 'الأحياء', 'علوم الأرض'] },
  { name: 'اللغات', materials: ['اللغة العربية', 'اللغة الإنجليزية', 'اللغة الفرنسية', 'اللغة الإسبانية'] },
  { name: 'الدراسات الاجتماعية', materials: ['التاريخ', 'الجغرافيا', 'الاقتصاد', 'علم النفس'] },
  { name: 'الحاسب والتقنية', materials: ['البرمجة', 'تقنية المعلومات', 'الذكاء الاصطناعي'] },
  { name: 'مهارات عامة', materials: ['مهارات الدراسة', 'التفكير النقدي'] },
];

type Q = {
  type: 'mc' | 'tf' | 'multi' | 'short';
  prompt: string;
  options?: string[];
  answer: number | number[] | string[];
  explanation?: string;
  topic?: string;
};

const QUIZZES: {
  title: string;
  description: string;
  section: string;
  material: string;
  difficulty: 'easy' | 'medium' | 'hard';
  durationSec: number;
  questions: Q[];
}[] = [
  {
    title: 'أساسيات الجبر',
    description: 'معادلات الدرجة الأولى والقوى والتبسيط.',
    section: 'الرياضيات',
    material: 'الجبر',
    difficulty: 'easy',
    durationSec: 600,
    questions: [
      {
        type: 'mc',
        prompt: 'ما قيمة س إذا كان 2س + 6 = 14؟',
        options: ['3', '4', '5', '8'],
        answer: 1,
        explanation: '2س = 8 إذن س = 4',
        topic: 'المعادلات الخطية',
      },
      {
        type: 'mc',
        prompt: 'ناتج 3² × 3³ يساوي:',
        options: ['3⁵', '3⁶', '9⁵', '6⁵'],
        answer: 0,
        explanation: 'عند ضرب القوى ذات الأساس نفسه نجمع الأسس.',
        topic: 'القوى',
      },
      { type: 'tf', prompt: '(أ + ب)² = أ² + ب²', options: ['صح', 'خطأ'], answer: 1, explanation: '(أ + ب)² = أ² + 2أب + ب²', topic: 'المتطابقات' },
      { type: 'multi', prompt: 'أي مما يلي أعداد أولية؟', options: ['2', '9', '11', '15'], answer: [0, 2], explanation: '9 = 3×3 و15 = 3×5', topic: 'الأعداد' },
      { type: 'short', prompt: 'بسّط: 5س - 2س', answer: ['3س', '3 س'], explanation: 'نطرح المعاملات: 5 - 2 = 3', topic: 'التبسيط' },
    ],
  },
  {
    title: 'الخلية والوراثة',
    description: 'مراجعة سريعة لتركيب الخلية وأساسيات الوراثة.',
    section: 'العلوم',
    material: 'الأحياء',
    difficulty: 'medium',
    durationSec: 480,
    questions: [
      {
        type: 'mc',
        prompt: 'أي عضية مسؤولة عن إنتاج الطاقة في الخلية؟',
        options: ['النواة', 'الميتوكوندريا', 'الريبوسوم', 'جهاز جولجي'],
        answer: 1,
        topic: 'تركيب الخلية',
      },
      {
        type: 'mc',
        prompt: 'يحمل الحمض النووي DNA المعلومات الوراثية داخل:',
        options: ['الغشاء البلازمي', 'السيتوبلازم فقط', 'النواة', 'الفجوة العصارية'],
        answer: 2,
        topic: 'الوراثة',
      },
      { type: 'tf', prompt: 'الخلايا النباتية تحتوي على جدار خلوي.', options: ['صح', 'خطأ'], answer: 0, topic: 'تركيب الخلية' },
      { type: 'mc', prompt: 'عدد الكروموسومات في الخلية الجسدية للإنسان:', options: ['23', '44', '46', '48'], answer: 2, topic: 'الوراثة' },
    ],
  },
  {
    title: 'English Grammar Basics',
    description: 'Tenses, articles and common mistakes.',
    section: 'اللغات',
    material: 'اللغة الإنجليزية',
    difficulty: 'easy',
    durationSec: 420,
    questions: [
      { type: 'mc', prompt: 'She ___ to school every day.', options: ['go', 'goes', 'going', 'gone'], answer: 1, topic: 'Present simple' },
      {
        type: 'mc',
        prompt: 'Choose the correct article: ___ apple a day keeps the doctor away.',
        options: ['A', 'An', 'The', 'No article'],
        answer: 1,
        topic: 'Articles',
      },
      {
        type: 'tf',
        prompt: '"I have went" is grammatically correct.',
        options: ['True', 'False'],
        answer: 1,
        explanation: 'The past participle is "gone": "I have gone".',
        topic: 'Present perfect',
      },
      { type: 'short', prompt: 'Write the past tense of "buy".', answer: ['bought'], topic: 'Irregular verbs' },
    ],
  },
  {
    title: 'الحركة والقوة',
    description: 'قوانين نيوتن والسرعة والتسارع.',
    section: 'العلوم',
    material: 'الفيزياء',
    difficulty: 'medium',
    durationSec: 600,
    questions: [
      { type: 'mc', prompt: 'وحدة قياس القوة في النظام الدولي:', options: ['الجول', 'النيوتن', 'الواط', 'الباسكال'], answer: 1, topic: 'الوحدات' },
      {
        type: 'mc',
        prompt: 'سيارة قطعت 120 كم في ساعتين. سرعتها المتوسطة:',
        options: ['40 كم/س', '60 كم/س', '120 كم/س', '240 كم/س'],
        answer: 1,
        explanation: 'السرعة = المسافة ÷ الزمن = 120 ÷ 2',
        topic: 'السرعة',
      },
      {
        type: 'tf',
        prompt: 'ينص قانون نيوتن الثالث على أن لكل فعل رد فعل مساوٍ له في المقدار ومعاكس في الاتجاه.',
        options: ['صح', 'خطأ'],
        answer: 0,
        topic: 'قوانين نيوتن',
      },
      {
        type: 'mc',
        prompt: 'إذا أثرت قوة 10 نيوتن على جسم كتلته 2 كجم فإن تسارعه:',
        options: ['2 م/ث²', '5 م/ث²', '12 م/ث²', '20 م/ث²'],
        answer: 1,
        explanation: 'ت = ق ÷ ك = 10 ÷ 2',
        topic: 'قوانين نيوتن',
      },
    ],
  },
];

const DAILY_BANK: { title: string; question: string; options: string[]; answer: number }[] = [
  { title: 'تحدي الرياضيات', question: 'ما ناتج 15% من 200؟', options: ['15', '20', '30', '35'], answer: 2 },
  {
    title: 'تحدي العلوم',
    question: 'ما الغاز الذي تمتصه النباتات في عملية البناء الضوئي؟',
    options: ['الأكسجين', 'ثاني أكسيد الكربون', 'النيتروجين', 'الهيدروجين'],
    answer: 1,
  },
  { title: 'تحدي اللغة', question: 'ما جمع كلمة "كتاب"؟', options: ['كتابات', 'كُتب', 'كتّاب', 'مكاتب'], answer: 1 },
  { title: 'تحدي الجغرافيا', question: 'ما أطول نهر في العالم؟', options: ['الأمازون', 'النيل', 'المسيسيبي', 'اليانغتسي'], answer: 1 },
  { title: 'تحدي المنطق', question: 'ما العدد التالي في المتتابعة: 2، 4، 8، 16، ...؟', options: ['18', '24', '32', '64'], answer: 2 },
  { title: 'تحدي الكيمياء', question: 'ما الرمز الكيميائي للصوديوم؟', options: ['S', 'So', 'Na', 'Sd'], answer: 2 },
  { title: 'English challenge', question: 'Which word is a synonym of "rapid"?', options: ['slow', 'quick', 'heavy', 'quiet'], answer: 1 },
  { title: 'تحدي الهندسة', question: 'مجموع زوايا المثلث الداخلية يساوي:', options: ['90°', '180°', '270°', '360°'], answer: 1 },
  { title: 'تحدي التاريخ', question: 'في أي قارة تقع مصر بشكل رئيسي؟', options: ['آسيا', 'أوروبا', 'أفريقيا', 'أستراليا'], answer: 2 },
  { title: 'تحدي الفيزياء', question: 'سرعة الضوء في الفراغ تقريبًا:', options: ['300 كم/ث', '3000 كم/ث', '300,000 كم/ث', '3,000,000 كم/ث'], answer: 2 },
  { title: 'تحدي البرمجة', question: 'أي مما يلي ليس لغة برمجة؟', options: ['Python', 'Go', 'HTML', 'Rust'], answer: 2 },
  { title: 'تحدي الأحياء', question: 'كم عدد حجرات قلب الإنسان؟', options: ['2', '3', '4', '5'], answer: 2 },
  { title: 'تحدي الحساب', question: 'ما الجذر التربيعي للعدد 144؟', options: ['11', '12', '13', '14'], answer: 1 },
  {
    title: 'تحدي المذاكرة',
    question: 'أي أسلوب يساعد أكثر على تثبيت المعلومة على المدى الطويل؟',
    options: ['إعادة القراءة فقط', 'الاسترجاع النشط والتكرار المتباعد', 'المذاكرة ليلة الامتحان', 'تظليل النص كله'],
    answer: 1,
  },
];

async function seedTaxonomy(db: Db) {
  const [{ n } = { n: 0 }] = await db.select({ n: count() }).from(eduSections);
  if (n > 0) return { skipped: true };
  for (const [i, s] of TAXONOMY.entries()) {
    const [section] = await db.insert(eduSections).values({ name: s.name, sort: i }).returning({ id: eduSections.id });
    await db.insert(eduMaterials).values(s.materials.map((name, j) => ({ sectionId: section!.id, name, sort: j })));
  }
  return { skipped: false };
}

async function seedQuizzes(db: Db, createdBy: string | null) {
  const [{ n } = { n: 0 }] = await db.select({ n: count() }).from(quizzes);
  if (n > 0) return { skipped: true };
  const sections = await db.select().from(eduSections);
  const materials = await db.select().from(eduMaterials);
  for (const q of QUIZZES) {
    const section = sections.find((s) => s.name === q.section);
    const material = materials.find((m) => m.name === q.material && m.sectionId === section?.id);
    await db.transaction(async (tx) => {
      const [quiz] = await tx
        .insert(quizzes)
        .values({
          title: q.title,
          description: q.description,
          searchTitle: normalizeSearch(`${q.title} ${q.description}`),
          sectionId: section?.id ?? null,
          materialId: material?.id ?? null,
          difficulty: q.difficulty,
          durationSec: q.durationSec,
          questionCount: q.questions.length,
          createdBy,
        })
        .returning({ id: quizzes.id });
      await tx.insert(quizQuestions).values(
        q.questions.map((qq, position) => ({
          quizId: quiz!.id,
          position,
          type: qq.type,
          prompt: qq.prompt,
          options: qq.options ?? [],
          answer: qq.answer,
          explanation: qq.explanation ?? null,
          topic: qq.topic ?? null,
        })),
      );
    });
  }
  return { skipped: false };
}

async function seedDaily(db: Db, days = 30) {
  const today = dayKey(Date.now(), 'UTC');
  let created = 0;
  for (let i = 0; i < days; i++) {
    const day = addDays(today, i);
    const item = DAILY_BANK[(Number(day.replaceAll('-', '')) + i) % DAILY_BANK.length]!;
    const res = await db
      .insert(dailyChallenges)
      .values({ day, type: 'quiz', title: item.title, description: '', question: item.question, options: item.options, answer: item.answer, xp: 15 })
      .onConflictDoNothing()
      .returning({ day: dailyChallenges.day });
    created += res.length;
  }
  return { created };
}

async function seedKnowledge(db: Db) {
  const [{ n } = { n: 0 }] = await db.select({ n: count() }).from(assistantKnowledge);
  if (n > 0) return { skipped: true, count: n };
  const here = path.dirname(fileURLToPath(import.meta.url));
  // Same relative location in the source tree (src/db) and in the bundle (dist).
  const file = path.join(here, 'seed-data/assistant-knowledge.json');
  const rows = JSON.parse(readFileSync(file, 'utf8')) as { question: string; answer: string; tags: string[]; language: string; link: string | null }[];
  for (let i = 0; i < rows.length; i += 100) {
    await db
      .insert(assistantKnowledge)
      .values(rows.slice(i, i + 100).map((k) => ({ ...k, searchText: normalizeSearch(`${k.question} ${k.tags.join(' ')} ${k.answer.slice(0, 300)}`) })));
  }
  return { skipped: false, count: rows.length };
}

async function upsertUser(db: Db, email: string, password: string, values: Partial<typeof users.$inferInsert> & { displayName: string }) {
  const normalized = email.trim().toLowerCase();
  const [existing] = await db.select({ id: users.id }).from(users).where(eq(users.email, normalized));
  if (existing) return existing.id;
  const [row] = await db
    .insert(users)
    .values({
      email: normalized,
      passwordHash: await hashPassword(password),
      emailVerifiedAt: new Date(),
      searchName: normalizeSearch(values.displayName),
      onboardingDone: true,
      ...values,
    })
    .returning({ id: users.id });
  return row!.id;
}

export async function seed(databaseUrl: string, env: Record<string, string | undefined> = process.env) {
  const { db, sql } = createDb(databaseUrl, 2);
  try {
    let adminId: string | null = null;
    if (env.SEED_ADMIN_EMAIL && env.SEED_ADMIN_PASSWORD) {
      if (env.SEED_ADMIN_PASSWORD.length < 10) throw new Error('SEED_ADMIN_PASSWORD must be at least 10 characters');
      adminId = await upsertUser(db, env.SEED_ADMIN_EMAIL, env.SEED_ADMIN_PASSWORD, { displayName: 'Qubedu Admin', role: 'root', accountType: 'teacher' });
    }
    if (env.SEED_DEMO === 'true' && env.NODE_ENV !== 'production') {
      await upsertUser(db, 'student@qubedu.local', 'qubedu-demo-123', { displayName: 'طالب تجريبي', username: 'demo_student' });
      await upsertUser(db, 'teacher@qubedu.local', 'qubedu-demo-123', { displayName: 'معلم تجريبي', username: 'demo_teacher', accountType: 'teacher' });
    }
    const result = {
      taxonomy: await seedTaxonomy(db),
      quizzes: await seedQuizzes(db, adminId),
      daily: await seedDaily(db),
      knowledge: await seedKnowledge(db),
      admin: adminId ? 'ready' : 'skipped (set SEED_ADMIN_EMAIL and SEED_ADMIN_PASSWORD)',
    };
    return result;
  } finally {
    await sql.end({ timeout: 5 });
  }
}

const isMain = process.argv[1] && /seed\.(ts|js|mjs)$/.test(process.argv[1]);
if (isMain) {
  const url = process.env.DATABASE_URL ?? 'postgres://qubedu:qubedu@localhost:5432/qubedu';
  try {
    await runMigrations(url, process.env.MIGRATIONS_DIR || undefined);
    console.info(JSON.stringify(await seed(url), null, 2));
    process.exit(0);
  } catch (err) {
    console.error(err);
    process.exit(1);
  }
}
