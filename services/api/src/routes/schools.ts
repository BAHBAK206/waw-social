import { randomInt } from 'node:crypto';
import { and, asc, count, eq, ilike, inArray, isNull, or, sql } from 'drizzle-orm';
import { Hono } from 'hono';
import {
  hasPermission,
  normalizeSearch,
  randomCode,
  schoolClassSchema,
  schoolImportSchema,
  schoolInputSchema,
  schoolMemberUpdateSchema,
  type GradeLevel,
  type SchoolClassDto,
  type SchoolDto,
  type SchoolImportResultDto,
  type SchoolMemberDto,
  type SchoolReportCardsDto,
} from '@qubedu/shared';
import { z } from 'zod';
import { courseMembers, courses, guardianLinks, schoolMembers, schools, users } from '../db/schema';
import type { AppEnv, AuthUser, Deps } from '../lib/context';
import { hashPassword } from '../lib/crypto';
import { audit } from '../lib/audit';
import { badRequest, conflict, forbidden, notFound } from '../lib/errors';
import { body, param, query, requireUser } from '../lib/http';
import { summaryColumns, toSummary } from '../lib/mappers';
import { notify } from '../lib/notify';
import { checkRate } from '../middleware';
import { sendEmailToken } from './auth';
import { createLink, inviteGuardian } from './family';
import { reportCard } from './gradebook';

type Role = SchoolMemberDto['role'];
const PASSWORD_ALPHABET = 'abcdefghjkmnpqrstuvwxyzABCDEFGHJKLMNPQRSTUVWXYZ23456789';
const firstPassword = () => Array.from({ length: 10 }, () => PASSWORD_ALPHABET[randomInt(PASSWORD_ALPHABET.length)]).join('');
/** Sign-in name for a student without an email: ali.hassan.4821@ab12cd.school.invalid (the .invalid domain never receives mail). */
const loginFor = (name: string, code: string) => {
  const slug =
    normalizeSearch(name)
      .normalize('NFKD')
      .replace(/[^a-z0-9]+/g, '.')
      .replace(/^\.+|\.+$/g, '')
      .slice(0, 24) || 'student';
  return `${slug}.${randomInt(1000, 10000)}@${code}.school.invalid`;
};
export const isSchoolLogin = (email: string) => email.endsWith('.school.invalid');

async function membership(deps: Deps, schoolId: string, userId: string) {
  const [m] = await deps.db
    .select()
    .from(schoolMembers)
    .where(and(eq(schoolMembers.schoolId, schoolId), eq(schoolMembers.userId, userId)));
  return m ?? null;
}

/** Active member with one of the roles; site staff with classes.manage count as admins. */
async function requireSchoolRole(deps: Deps, schoolId: string, user: AuthUser, roles: Role[]): Promise<Role> {
  const [school] = await deps.db.select({ id: schools.id }).from(schools).where(eq(schools.id, schoolId));
  if (!school) throw notFound('school_not_found');
  const m = await membership(deps, schoolId, user.id);
  if (m?.status === 'active' && roles.includes(m.role)) return m.role;
  if (roles.includes('admin') && hasPermission(user.role, user.permissions, 'classes.manage')) return 'admin';
  throw m?.status === 'active' ? forbidden('school_admins_only') : notFound('school_not_found');
}

async function schoolDto(deps: Deps, schoolId: string, viewerId: string): Promise<SchoolDto> {
  const [s] = await deps.db.select().from(schools).where(eq(schools.id, schoolId));
  if (!s) throw notFound('school_not_found');
  const m = await membership(deps, schoolId, viewerId);
  const roles = await deps.db
    .select({ role: schoolMembers.role, status: schoolMembers.status, n: count() })
    .from(schoolMembers)
    .where(eq(schoolMembers.schoolId, schoolId))
    .groupBy(schoolMembers.role, schoolMembers.status);
  const n = (r: Role) => roles.filter((x) => x.role === r && x.status === 'active').reduce((a, x) => a + x.n, 0);
  const [cls] = await deps.db.select({ n: count() }).from(courses).where(eq(courses.schoolId, schoolId));
  const sections = await deps.db
    .selectDistinct({ s: schoolMembers.section })
    .from(schoolMembers)
    .where(and(eq(schoolMembers.schoolId, schoolId), sql`${schoolMembers.section} is not null`))
    .orderBy(asc(schoolMembers.section));
  return {
    id: s.id,
    name: s.name,
    system: s.system,
    address: s.address,
    phone: s.phone,
    logoUrl: s.logoUrl,
    principal: s.principal,
    myRole: m?.role ?? null,
    myStatus: m?.status ?? null,
    counts: {
      admins: n('admin'),
      teachers: n('teacher'),
      students: n('student'),
      parents: n('parent'),
      classes: cls?.n ?? 0,
      invited: roles.filter((x) => x.status === 'invited').reduce((a, x) => a + x.n, 0),
    },
    sections: sections.map((x) => x.s!).filter(Boolean),
    createdAt: s.createdAt.getTime(),
  };
}

async function schoolCode(deps: Deps) {
  for (let i = 0; i < 8; i++) {
    const code = randomCode(6).toLowerCase();
    const [taken] = await deps.db.select({ id: schools.id }).from(schools).where(eq(schools.code, code));
    if (!taken) return code;
  }
  throw conflict('try_again');
}

export const schoolsRoutes = new Hono<AppEnv>()
  /** Schools I belong to, and invitations waiting for me. */
  .get('/', async (c) => {
    const user = requireUser(c);
    const deps = c.get('deps');
    const rows = await deps.db.select({ id: schoolMembers.schoolId }).from(schoolMembers).where(eq(schoolMembers.userId, user.id));
    const items = await Promise.all(rows.map((r) => schoolDto(deps, r.id, user.id)));
    return c.json({ items, canCreate: user.verifiedTeacher || hasPermission(user.role, user.permissions, 'classes.manage') });
  })
  .post('/', async (c) => {
    const user = requireUser(c);
    await checkRate(c, { bucket: 'school-create', limit: 5, windowSec: 86_400, by: 'user' });
    const deps = c.get('deps');
    // A school speaks for many families: verified teachers and site staff only.
    if (!user.verifiedTeacher && !hasPermission(user.role, user.permissions, 'classes.manage')) throw forbidden('verified_teacher_required');
    const input = await body(c, schoolInputSchema);
    const [s] = await deps.db
      .insert(schools)
      .values({ ...input, code: await schoolCode(deps), createdBy: user.id })
      .returning({ id: schools.id });
    await deps.db.insert(schoolMembers).values({ schoolId: s!.id, userId: user.id, role: 'admin', status: 'active' });
    await audit(deps.db, user.id, 'school.create', 'school', s!.id, { name: input.name });
    return c.json(await schoolDto(deps, s!.id, user.id), 201);
  })
  .get('/:id', async (c) => {
    const user = requireUser(c);
    const deps = c.get('deps');
    const id = param(c, 'id');
    const m = await membership(deps, id, user.id);
    if (!m && !hasPermission(user.role, user.permissions, 'classes.manage')) throw notFound('school_not_found');
    return c.json(await schoolDto(deps, id, user.id));
  })
  .patch('/:id', async (c) => {
    const user = requireUser(c);
    const deps = c.get('deps');
    const id = param(c, 'id');
    await requireSchoolRole(deps, id, user, ['admin']);
    const input = await body(c, schoolInputSchema.partial());
    await deps.db
      .update(schools)
      .set({ ...input, updatedAt: new Date() })
      .where(eq(schools.id, id));
    return c.json(await schoolDto(deps, id, user.id));
  })
  /** An invited person joins (or declines with DELETE /:id/membership). */
  .post('/:id/accept', async (c) => {
    const user = requireUser(c);
    const deps = c.get('deps');
    const id = param(c, 'id');
    const [m] = await deps.db
      .update(schoolMembers)
      .set({ status: 'active' })
      .where(and(eq(schoolMembers.schoolId, id), eq(schoolMembers.userId, user.id), eq(schoolMembers.status, 'invited')))
      .returning();
    if (!m) throw notFound('invite_not_found');
    if (m.role === 'student' && m.section) await enrollSection(deps, id, m.section, [user.id]);
    return c.json(await schoolDto(deps, id, user.id));
  })
  .delete('/:id/membership', async (c) => {
    const user = requireUser(c);
    const deps = c.get('deps');
    const id = param(c, 'id');
    const m = await membership(deps, id, user.id);
    if (!m) throw notFound();
    if (m.role === 'admin' && m.status === 'active') {
      const [{ n } = { n: 0 }] = await deps.db
        .select({ n: count() })
        .from(schoolMembers)
        .where(and(eq(schoolMembers.schoolId, id), eq(schoolMembers.role, 'admin'), eq(schoolMembers.status, 'active')));
      if (n <= 1) throw badRequest('last_admin');
    }
    await deps.db.delete(schoolMembers).where(and(eq(schoolMembers.schoolId, id), eq(schoolMembers.userId, user.id)));
    return c.json({ ok: true });
  })
  /** People: admins see everyone (with emails); teachers see students and teachers. */
  .get('/:id/members', async (c) => {
    const user = requireUser(c);
    const deps = c.get('deps');
    const id = param(c, 'id');
    const role = await requireSchoolRole(deps, id, user, ['admin', 'teacher']);
    const q = query(
      c,
      z.object({
        role: z.enum(['admin', 'teacher', 'student', 'parent']).optional(),
        section: z.string().max(20).optional(),
        q: z.string().max(80).optional(),
      }),
    );
    const rows = await deps.db
      .select({ m: schoolMembers, email: users.email, gradeLevel: users.gradeLevel, ...summaryColumns })
      .from(schoolMembers)
      .innerJoin(users, eq(users.id, schoolMembers.userId))
      .where(
        and(
          eq(schoolMembers.schoolId, id),
          isNull(users.deletedAt),
          q.role ? eq(schoolMembers.role, q.role) : undefined,
          role === 'teacher' ? inArray(schoolMembers.role, ['student', 'teacher', 'admin']) : undefined,
          q.section ? eq(schoolMembers.section, q.section) : undefined,
          q.q ? or(ilike(users.searchName, `%${normalizeSearch(q.q)}%`), ilike(schoolMembers.studentNumber, `%${q.q}%`)) : undefined,
        ),
      )
      .orderBy(asc(schoolMembers.role), asc(schoolMembers.section), asc(users.displayName))
      .limit(2000);
    const items: SchoolMemberDto[] = rows.map((r) => ({
      user: { ...toSummary(r), ...(role === 'admin' ? { email: r.email } : {}) },
      role: r.m.role,
      status: r.m.status,
      section: r.m.section,
      studentNumber: r.m.studentNumber,
      gradeLevel: (r.gradeLevel as GradeLevel | null) ?? null,
      managed: r.m.managed,
      joinedAt: r.m.createdAt.getTime(),
    }));
    return c.json({ items });
  })
  /**
   * Bulk add from the school's spreadsheet. New people get an account and a first password (returned once, to print);
   * people who already have an account are invited and join only if they accept — a school can't take over anyone's
   * account or children. New students' parents are linked when the school creates the parent account too; an existing
   * parent account gets a request to confirm.
   */
  .post('/:id/import', async (c) => {
    const user = requireUser(c);
    await checkRate(c, { bucket: 'school-import', limit: 20, windowSec: 3600, by: 'user' });
    const deps = c.get('deps');
    const id = param(c, 'id');
    await requireSchoolRole(deps, id, user, ['admin']);
    const [school] = await deps.db.select().from(schools).where(eq(schools.id, id));
    const { rows } = await body(c, schoolImportSchema);
    const [me] = await deps.db.select({ appearance: users.appearance }).from(users).where(eq(users.id, user.id));
    const language = ((me?.appearance as { language?: string } | undefined)?.language ?? 'ar') as string;
    const out: SchoolImportResultDto = { created: [], invited: 0, parents: 0, skipped: [] };
    const touched: { userId: string; section: string }[] = [];

    const createAccount = async (name: string, email: string | null, accountType: 'student' | 'teacher' | 'parent', gradeLevel: string | null) => {
      const login = email ?? loginFor(name, school!.code);
      const password = firstPassword();
      const [u] = await deps.db
        .insert(users)
        .values({
          email: login,
          passwordHash: await hashPassword(password),
          displayName: name,
          searchName: normalizeSearch(name),
          accountType,
          gradeLevel: accountType === 'student' ? gradeLevel : null,
          appearance: { language },
          // The school stands in for the parents' approval of accounts it creates.
          consentAt: new Date(),
        })
        .returning({ id: users.id });
      if (email) await sendEmailToken(deps, { id: u!.id, email, language }, 'verify').catch((err) => deps.log.warn({ err }, 'school welcome email failed'));
      return { id: u!.id, login, password };
    };

    for (const [i, r] of rows.entries()) {
      try {
        const accountType = r.role === 'student' ? 'student' : r.role === 'parent' ? 'parent' : 'teacher';
        if (r.role !== 'student' && !r.email) {
          out.skipped.push({ row: i + 1, name: r.name, reason: 'email_required' });
          continue;
        }
        const [existing] = r.email ? await deps.db.select({ id: users.id, type: users.accountType }).from(users).where(eq(users.email, r.email)) : [];
        let userId: string;
        let fresh = false;
        if (existing) {
          if (existing.id === user.id && r.role !== 'admin') {
            out.skipped.push({ row: i + 1, name: r.name, reason: 'yourself' });
            continue;
          }
          const already = await membership(deps, id, existing.id);
          if (already) {
            out.skipped.push({ row: i + 1, name: r.name, reason: 'already_member' });
            continue;
          }
          userId = existing.id;
          await deps.db.insert(schoolMembers).values({
            schoolId: id,
            userId,
            role: r.role,
            status: 'invited',
            section: r.section ?? null,
            studentNumber: r.studentNumber ?? null,
            invitedBy: user.id,
          });
          await notify(deps, {
            userId,
            type: 'school_invite',
            icon: 'school',
            actorId: user.id,
            link: '/schools',
            data: { school: school!.name },
            pref: 'school',
          });
          out.invited++;
        } else {
          const acc = await createAccount(r.name, r.email ?? null, accountType, r.gradeLevel ?? null);
          userId = acc.id;
          fresh = true;
          await deps.db.insert(schoolMembers).values({
            schoolId: id,
            userId,
            role: r.role,
            status: 'active',
            section: r.section ?? null,
            studentNumber: r.studentNumber ?? null,
            managed: true,
            invitedBy: user.id,
          });
          out.created.push({
            name: r.name,
            login: acc.login,
            password: acc.password,
            role: r.role,
            section: r.section ?? null,
            studentNumber: r.studentNumber ?? null,
          });
          if (r.role === 'student' && r.section) touched.push({ userId, section: r.section });
        }
        // Parents only for students the school just created (never for someone else's existing account).
        if (fresh && r.role === 'student' && r.parentEmail) {
          const [parent] = await deps.db.select({ id: users.id, type: users.accountType }).from(users).where(eq(users.email, r.parentEmail));
          if (!parent) {
            const p = await createAccount(r.parentName || r.parentEmail.split('@')[0]!, r.parentEmail, 'parent', null);
            await deps.db
              .insert(schoolMembers)
              .values({ schoolId: id, userId: p.id, role: 'parent', status: 'active', managed: true, invitedBy: user.id })
              .onConflictDoNothing();
            await createLink(deps, { id: p.id, displayName: r.parentName || r.parentEmail }, userId);
            out.created.push({ name: r.parentName || r.parentEmail, login: p.login, password: p.password, role: 'parent', section: null, studentNumber: null });
          } else if (parent.type === 'parent') {
            await inviteGuardian(deps, { id: userId, displayName: r.name }, r.parentEmail);
          }
          out.parents++;
        }
      } catch (err) {
        deps.log.warn({ err }, 'school import row failed');
        out.skipped.push({ row: i + 1, name: r.name, reason: 'error' });
      }
    }
    for (const section of new Set(touched.map((t) => t.section)))
      await enrollSection(
        deps,
        id,
        section,
        touched.filter((t) => t.section === section).map((t) => t.userId),
      );
    await audit(deps.db, user.id, 'school.import', 'school', id, { created: out.created.length, invited: out.invited });
    return c.json(out);
  })
  .patch('/:id/members/:userId', async (c) => {
    const user = requireUser(c);
    const deps = c.get('deps');
    const id = param(c, 'id');
    await requireSchoolRole(deps, id, user, ['admin']);
    const target = param(c, 'userId');
    const input = await body(c, schoolMemberUpdateSchema);
    const m = await membership(deps, id, target);
    if (!m) throw notFound();
    if (input.role && input.role !== m.role && (input.role === 'student' || m.role === 'student' || input.role === 'parent' || m.role === 'parent'))
      throw badRequest('role_change_not_allowed');
    await deps.db
      .update(schoolMembers)
      .set(input)
      .where(and(eq(schoolMembers.schoolId, id), eq(schoolMembers.userId, target)));
    if (m.role === 'student' && m.status === 'active' && input.section) await enrollSection(deps, id, input.section, [target]);
    return c.json({ ok: true });
  })
  .delete('/:id/members/:userId', async (c) => {
    const user = requireUser(c);
    const deps = c.get('deps');
    const id = param(c, 'id');
    await requireSchoolRole(deps, id, user, ['admin']);
    const target = param(c, 'userId');
    if (target === user.id) throw badRequest('use_leave');
    await deps.db.delete(schoolMembers).where(and(eq(schoolMembers.schoolId, id), eq(schoolMembers.userId, target)));
    return c.json({ ok: true });
  })
  /** A new first password for an account this school created (a student who forgot it has no email to reset). */
  .post('/:id/members/:userId/password', async (c) => {
    const user = requireUser(c);
    await checkRate(c, { bucket: 'school-password', limit: 60, windowSec: 3600, by: 'user' });
    const deps = c.get('deps');
    const id = param(c, 'id');
    await requireSchoolRole(deps, id, user, ['admin']);
    const target = param(c, 'userId');
    const m = await membership(deps, id, target);
    if (!m?.managed || m.role === 'admin') throw forbidden('not_managed');
    const password = firstPassword();
    const [u] = await deps.db
      .update(users)
      .set({ passwordHash: await hashPassword(password), tokenVersion: sql`${users.tokenVersion} + 1`, updatedAt: new Date() })
      .where(eq(users.id, target))
      .returning({ email: users.email });
    await audit(deps.db, user.id, 'school.reset_password', 'user', target, { school: id });
    return c.json({ login: u!.email, password });
  })
  /** Class subjects for a section: a course taught by a school teacher, with every student of the section enrolled. */
  .get('/:id/classes', async (c) => {
    const user = requireUser(c);
    const deps = c.get('deps');
    const id = param(c, 'id');
    await requireSchoolRole(deps, id, user, ['admin', 'teacher']);
    const rows = await deps.db
      .select({ c: courses, ...summaryColumns })
      .from(courses)
      .innerJoin(users, eq(users.id, courses.ownerId))
      .where(eq(courses.schoolId, id))
      .orderBy(asc(courses.schoolSection), asc(courses.subjectCode), asc(courses.title));
    const items: SchoolClassDto[] = rows.map((r) => ({
      id: r.c.id,
      title: r.c.title,
      section: r.c.schoolSection,
      subjectCode: r.c.subjectCode,
      term: r.c.term,
      teacher: toSummary(r),
      memberCount: r.c.memberCount,
    }));
    return c.json({ items });
  })
  .post('/:id/classes', async (c) => {
    const user = requireUser(c);
    const deps = c.get('deps');
    const id = param(c, 'id');
    await requireSchoolRole(deps, id, user, ['admin']);
    const input = await body(c, schoolClassSchema);
    const t = await membership(deps, id, input.teacherId);
    if (!t || t.status !== 'active' || (t.role !== 'teacher' && t.role !== 'admin')) throw badRequest('teacher_not_in_school');
    if ((input.passMarks ?? 50) > (input.maxMarks ?? 100)) throw badRequest('pass_above_total');
    let code = randomCode(7);
    for (let i = 0; i < 5; i++) {
      const [taken] = await deps.db.select({ id: courses.id }).from(courses).where(eq(courses.joinCode, code));
      if (!taken) break;
      code = randomCode(7);
    }
    const [course] = await deps.db
      .insert(courses)
      .values({
        title: input.title,
        searchTitle: normalizeSearch(input.title),
        ownerId: input.teacherId,
        joinCode: code,
        memberCount: 1,
        schoolId: id,
        schoolSection: input.section,
        subjectCode: input.subjectCode ?? null,
        maxMarks: input.maxMarks ?? 100,
        passMarks: input.passMarks ?? 50,
        term: input.term ?? null,
      })
      .returning({ id: courses.id });
    await deps.db.insert(courseMembers).values({ courseId: course!.id, userId: input.teacherId, role: 'teacher' });
    await enrollSection(deps, id, input.section);
    if (input.teacherId !== user.id)
      await notify(deps, {
        userId: input.teacherId,
        type: 'school_class',
        icon: 'school',
        actorId: user.id,
        link: `/school/${course!.id}`,
        data: { title: input.title, section: input.section },
        pref: 'school',
      });
    return c.json({ id: course!.id }, 201);
  })
  /**
   * Official report cards: one student (`studentId`: the student, a linked parent, or the school's staff) or a whole
   * section (staff), with the school's details for printing.
   */
  .get('/:id/report-cards', async (c) => {
    const user = requireUser(c);
    const deps = c.get('deps');
    const id = param(c, 'id');
    const q = query(c, z.object({ section: z.string().max(20).optional(), studentId: z.string().uuid().optional(), term: z.string().max(80).optional() }));
    let ids: string[];
    if (q.studentId) {
      const own = q.studentId === user.id;
      const [link] = own
        ? [true]
        : await deps.db
            .select({ x: guardianLinks.studentId })
            .from(guardianLinks)
            .where(and(eq(guardianLinks.guardianId, user.id), eq(guardianLinks.studentId, q.studentId)));
      if (!link) await requireSchoolRole(deps, id, user, ['admin', 'teacher']);
      const m = await membership(deps, id, q.studentId);
      if (!m || m.status !== 'active' || m.role !== 'student') throw notFound('student_not_found');
      ids = [q.studentId];
    } else {
      await requireSchoolRole(deps, id, user, ['admin', 'teacher']);
      if (!q.section) throw badRequest('section_required');
      ids = (
        await deps.db
          .select({ id: schoolMembers.userId })
          .from(schoolMembers)
          .innerJoin(users, eq(users.id, schoolMembers.userId))
          .where(
            and(eq(schoolMembers.schoolId, id), eq(schoolMembers.role, 'student'), eq(schoolMembers.status, 'active'), eq(schoolMembers.section, q.section)),
          )
          .orderBy(asc(schoolMembers.studentNumber), asc(users.displayName))
          .limit(80)
      ).map((r) => r.id);
    }
    const meta = ids.length
      ? await deps.db
          .select({ id: schoolMembers.userId, section: schoolMembers.section, number: schoolMembers.studentNumber, grade: users.gradeLevel })
          .from(schoolMembers)
          .innerJoin(users, eq(users.id, schoolMembers.userId))
          .where(and(eq(schoolMembers.schoolId, id), inArray(schoolMembers.userId, ids)))
      : [];
    const byId = new Map(meta.map((m) => [m.id, m]));
    const cards: SchoolReportCardsDto['cards'] = [];
    const terms = new Set<string>();
    for (const sid of ids) {
      const card = await reportCard(deps, sid, q.term ?? null, id);
      card.terms.forEach((t) => terms.add(t));
      const m = byId.get(sid);
      cards.push({ ...card, section: m?.section ?? null, studentNumber: m?.number ?? null, gradeLevel: (m?.grade as GradeLevel | null) ?? null });
    }
    return c.json({ school: await schoolDto(deps, id, user.id), term: q.term ?? null, terms: [...terms].sort(), cards } satisfies SchoolReportCardsDto);
  });

/** Puts the section's active students (or just `only`) into every class of that section. */
async function enrollSection(deps: Deps, schoolId: string, section: string, only?: string[]) {
  const classes = await deps.db
    .select({ id: courses.id })
    .from(courses)
    .where(and(eq(courses.schoolId, schoolId), eq(courses.schoolSection, section), eq(courses.archived, false)));
  if (!classes.length) return;
  const students = only?.length
    ? only
    : (
        await deps.db
          .select({ id: schoolMembers.userId })
          .from(schoolMembers)
          .where(
            and(
              eq(schoolMembers.schoolId, schoolId),
              eq(schoolMembers.role, 'student'),
              eq(schoolMembers.status, 'active'),
              eq(schoolMembers.section, section),
            ),
          )
      ).map((r) => r.id);
  for (const cl of classes) {
    if (!students.length) continue;
    const added = await deps.db
      .insert(courseMembers)
      .values(students.map((userId) => ({ courseId: cl.id, userId, role: 'student' as const })))
      .onConflictDoNothing()
      .returning();
    if (added.length)
      await deps.db
        .update(courses)
        .set({ memberCount: sql`${courses.memberCount} + ${added.length}` })
        .where(eq(courses.id, cl.id));
  }
}
