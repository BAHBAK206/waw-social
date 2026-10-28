import { teacherVerificationSchema, verificationDecisionSchema, type TeacherVerificationDto } from '@qubedu/shared';
import { and, desc, eq } from 'drizzle-orm';
import { Hono } from 'hono';
import { teacherVerifications, users } from '../db/schema';
import { audit } from '../lib/audit';
import type { AppEnv, Deps } from '../lib/context';
import { badRequest, conflict, forbidden, notFound } from '../lib/errors';
import { body, param, requirePerm, requireUser } from '../lib/http';
import { ms, summaryColumns, toSummary } from '../lib/mappers';
import { notify } from '../lib/notify';
import { checkRate } from '../middleware';

const toDto = (r: typeof teacherVerifications.$inferSelect, user: TeacherVerificationDto['user']): TeacherVerificationDto => ({
  id: r.id,
  user,
  institution: r.institution,
  subject: r.subject,
  note: r.note,
  proofUrl: r.proofUrl,
  status: r.status,
  reason: r.reason,
  createdAt: r.createdAt.getTime(),
  reviewedAt: ms(r.reviewedAt),
});

async function latestOf(deps: Deps, userId: string) {
  const [r] = await deps.db
    .select()
    .from(teacherVerifications)
    .where(eq(teacherVerifications.userId, userId))
    .orderBy(desc(teacherVerifications.createdAt))
    .limit(1);
  return r ?? null;
}

/** A teacher's own request: GET the latest, POST a new one (one pending at a time). */
export const myVerificationRoutes = new Hono<AppEnv>()
  .get('/', async (c) => {
    const user = requireUser(c);
    const deps = c.get('deps');
    const r = await latestOf(deps, user.id);
    const [me] = await deps.db.select(summaryColumns).from(users).where(eq(users.id, user.id));
    return c.json({ verified: user.verifiedTeacher, request: r ? toDto(r, toSummary(me!)) : null });
  })
  .post('/', async (c) => {
    const user = requireUser(c);
    await checkRate(c, { bucket: 'teacher-verify', limit: 5, windowSec: 24 * 3600, by: 'user' });
    const deps = c.get('deps');
    if (user.accountType !== 'teacher') throw forbidden('teachers_only');
    if (user.verifiedTeacher) throw conflict('already_verified');
    const last = await latestOf(deps, user.id);
    if (last?.status === 'pending') throw conflict('verification_pending');
    const input = await body(c, teacherVerificationSchema);
    const [row] = await deps.db
      .insert(teacherVerifications)
      .values({ userId: user.id, institution: input.institution, subject: input.subject, note: input.note, proofUrl: input.proofUrl ?? null })
      .returning();
    const [me] = await deps.db.select(summaryColumns).from(users).where(eq(users.id, user.id));
    return c.json(toDto(row!, toSummary(me!)), 201);
  });

/** Moderators with users.manage review requests and can remove a verification. */
export const verificationAdminRoutes = new Hono<AppEnv>()
  .get('/', async (c) => {
    requirePerm(c, 'users.view');
    const deps = c.get('deps');
    const status = (c.req.query('status') ?? 'pending') as 'pending' | 'approved' | 'rejected';
    if (!['pending', 'approved', 'rejected'].includes(status)) throw badRequest('invalid_status');
    const rows = await deps.db
      .select({ r: teacherVerifications, ...summaryColumns, email: users.email })
      .from(teacherVerifications)
      .innerJoin(users, eq(users.id, teacherVerifications.userId))
      .where(eq(teacherVerifications.status, status))
      .orderBy(status === 'pending' ? teacherVerifications.createdAt : desc(teacherVerifications.reviewedAt))
      .limit(200);
    return c.json({ items: rows.map((x) => toDto(x.r, { ...toSummary(x), email: x.email })) });
  })
  .post('/:id/approve', async (c) => {
    const actor = requirePerm(c, 'users.manage');
    const deps = c.get('deps');
    const [r] = await deps.db
      .select()
      .from(teacherVerifications)
      .where(and(eq(teacherVerifications.id, param(c, 'id')), eq(teacherVerifications.status, 'pending')));
    if (!r) throw notFound('request_not_found');
    const [u] = await deps.db.select({ type: users.accountType }).from(users).where(eq(users.id, r.userId));
    if (u?.type !== 'teacher') throw badRequest('teachers_only');
    await deps.db.transaction(async (tx) => {
      await tx.update(teacherVerifications).set({ status: 'approved', reviewedBy: actor.id, reviewedAt: new Date() }).where(eq(teacherVerifications.id, r.id));
      await tx.update(users).set({ teacherVerifiedAt: new Date(), institution: r.institution }).where(eq(users.id, r.userId));
    });
    await audit(deps.db, actor.id, 'teacher.verify', 'user', r.userId, { institution: r.institution });
    await notify(deps, { userId: r.userId, type: 'teacher_verified', icon: 'badge-check', link: '/settings?tab=account', data: {}, pref: 'system' });
    return c.json({ ok: true });
  })
  .post('/:id/reject', async (c) => {
    const actor = requirePerm(c, 'users.manage');
    const deps = c.get('deps');
    const { reason } = await body(c, verificationDecisionSchema);
    const [r] = await deps.db
      .update(teacherVerifications)
      .set({ status: 'rejected', reason, reviewedBy: actor.id, reviewedAt: new Date() })
      .where(and(eq(teacherVerifications.id, param(c, 'id')), eq(teacherVerifications.status, 'pending')))
      .returning();
    if (!r) throw notFound('request_not_found');
    await audit(deps.db, actor.id, 'teacher.reject', 'user', r.userId, { reason });
    await notify(deps, { userId: r.userId, type: 'teacher_rejected', icon: 'badge-x', link: '/settings?tab=account', data: { reason }, pref: 'system' });
    return c.json({ ok: true });
  })
  /** Removes a teacher's verification (e.g. they left the school). */
  .delete('/users/:id', async (c) => {
    const actor = requirePerm(c, 'users.manage');
    const deps = c.get('deps');
    const id = param(c, 'id');
    await deps.db.update(users).set({ teacherVerifiedAt: null }).where(eq(users.id, id));
    await audit(deps.db, actor.id, 'teacher.unverify', 'user', id, {});
    return c.json({ ok: true });
  });
