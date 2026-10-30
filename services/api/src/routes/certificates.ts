import { randomInt } from 'node:crypto';
import { and, desc, eq, inArray, isNull, sql } from 'drizzle-orm';
import { Hono } from 'hono';
import { issueCertificatesSchema, type CertificateDto, type CertificateVerifyDto } from '@qubedu/shared';
import { certificates, courseMembers, courses, users } from '../db/schema';
import type { AppEnv, Deps } from '../lib/context';
import { forbidden, notFound } from '../lib/errors';
import { body, param, requireUser } from '../lib/http';
import { pickSummary, summaryColumns, toSummary } from '../lib/mappers';
import { notify } from '../lib/notify';
import { checkRate } from '../middleware';
import { requireRole } from './school';

const ALPHABET = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789';
const newCode = () => Array.from({ length: 10 }, () => ALPHABET[randomInt(ALPHABET.length)]).join('');
const holderCols = Object.fromEntries(Object.entries(summaryColumns).map(([k, v]) => [`h${k[0]!.toUpperCase()}${k.slice(1)}`, v])) as Record<string, never>;

async function dtos(deps: Deps, where: ReturnType<typeof eq>): Promise<CertificateDto[]> {
  const rows = await deps.db
    .select({ x: certificates, courseTitle: courses.title, ...holderCols })
    .from(certificates)
    .innerJoin(users, eq(users.id, certificates.userId))
    .leftJoin(courses, eq(courses.id, certificates.courseId))
    .where(where)
    .orderBy(desc(certificates.issuedAt))
    .limit(500);
  return rows.map((r) => ({
    id: r.x.id,
    code: r.x.code,
    title: r.x.title,
    holder: toSummary(pickSummary('h', r as unknown as Record<string, unknown>)),
    courseId: r.x.courseId,
    courseTitle: (r.courseTitle as string | null) ?? null,
    issuerName: r.x.issuerName,
    grade: r.x.grade,
    issuedAt: r.x.issuedAt.getTime(),
    revoked: !!r.x.revokedAt,
  }));
}

export const certificateRoutes = new Hono<AppEnv>()
  /** Anyone (an employer, a university) can check a certificate by its code. No sign-in. */
  .get('/verify/:code', async (c) => {
    await checkRate(c, { bucket: 'cert-verify', limit: 120, windowSec: 600 });
    const deps = c.get('deps');
    const code = (c.req.param('code') ?? '').toUpperCase().replace(/[^A-Z0-9]/g, '');
    const [r] = await deps.db
      .select({ x: certificates, name: users.displayName, courseTitle: courses.title })
      .from(certificates)
      .innerJoin(users, eq(users.id, certificates.userId))
      .leftJoin(courses, eq(courses.id, certificates.courseId))
      .where(eq(certificates.code, code));
    if (!r) throw notFound('certificate_not_found');
    return c.json({
      valid: !r.x.revokedAt,
      revoked: !!r.x.revokedAt,
      holderName: r.name,
      title: r.x.title,
      courseTitle: r.courseTitle ?? null,
      issuerName: r.x.issuerName,
      grade: r.x.grade,
      issuedAt: r.x.issuedAt.getTime(),
    } satisfies CertificateVerifyDto);
  })
  .get('/mine', async (c) => {
    const user = requireUser(c);
    return c.json({ items: await dtos(c.get('deps'), eq(certificates.userId, user.id)) });
  })
  .get('/course/:id', async (c) => {
    const user = requireUser(c);
    const deps = c.get('deps');
    const id = param(c, 'id');
    await requireRole(deps, id, user, ['teacher', 'assistant']);
    return c.json({ items: await dtos(deps, eq(certificates.courseId, id)) });
  })
  /** The teacher issues certificates to chosen students, or to everyone whose average grade reaches `minGrade`. */
  .post('/course/:id', async (c) => {
    const user = requireUser(c);
    const deps = c.get('deps');
    const id = param(c, 'id');
    await requireRole(deps, id, user, ['teacher']);
    const input = await body(c, issueCertificatesSchema);
    const [course] = await deps.db.select({ title: courses.title }).from(courses).where(eq(courses.id, id));
    const averages = await deps.db.execute<{ student_id: string; avg: number | null }>(sql`
      select m.user_id as student_id,
             (select round(avg(s.grade / nullif(a.points, 0) * 100))::int from submissions s join assignments a on a.id = s.assignment_id
              where s.student_id = m.user_id and a.course_id = ${id} and s.grade is not null) as avg
      from course_members m where m.course_id = ${id} and m.role = 'student'`);
    const avgOf = new Map(averages.map((a) => [a.student_id, a.avg === null ? null : Number(a.avg)]));
    const targets = input.studentIds?.length
      ? input.studentIds.filter((s) => avgOf.has(s))
      : [...avgOf].filter(([, avg]) => avg !== null && avg >= (input.minGrade ?? 0)).map(([s]) => s);
    if (!targets.length) return c.json({ issued: 0 });
    // One live certificate per student and course.
    const existing = await deps.db
      .select({ userId: certificates.userId })
      .from(certificates)
      .where(and(eq(certificates.courseId, id), inArray(certificates.userId, targets), isNull(certificates.revokedAt)));
    const have = new Set(existing.map((e) => e.userId));
    const fresh = targets.filter((t) => !have.has(t));
    if (!fresh.length) return c.json({ issued: 0 });
    const title = input.title?.trim() || course?.title || '';
    const rows = await deps.db
      .insert(certificates)
      .values(
        fresh.map((userId) => ({
          code: newCode(),
          userId,
          courseId: id,
          title,
          issuerId: user.id,
          issuerName: user.displayName,
          grade: avgOf.get(userId) ?? null,
        })),
      )
      .returning({ userId: certificates.userId, code: certificates.code });
    await notify(
      deps,
      rows.map((r) => ({
        userId: r.userId,
        type: 'certificate_issued',
        icon: 'award',
        actorId: user.id,
        link: `/certificate/${r.code}`,
        data: { name: user.displayName, title },
        pref: 'school' as const,
      })),
    );
    return c.json({ issued: rows.length }, 201);
  })
  .delete('/:id', async (c) => {
    const user = requireUser(c);
    const deps = c.get('deps');
    const [cert] = await deps.db
      .select()
      .from(certificates)
      .where(eq(certificates.id, param(c, 'id')));
    if (!cert) throw notFound('certificate_not_found');
    const [m] = cert.courseId
      ? await deps.db
          .select({ role: courseMembers.role })
          .from(courseMembers)
          .where(and(eq(courseMembers.courseId, cert.courseId), eq(courseMembers.userId, user.id)))
      : [];
    if (cert.issuerId !== user.id && m?.role !== 'teacher') throw forbidden();
    await deps.db.update(certificates).set({ revokedAt: new Date() }).where(eq(certificates.id, cert.id));
    return c.json({ ok: true });
  });
