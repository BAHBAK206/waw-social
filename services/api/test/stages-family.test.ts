import type { AuthResult, ChildReportDto, CourseDto, FamilyDto, Me, Page, UserSummary } from '@qubedu/shared';
import { describe, expect, it } from 'vitest';
import { call, newUser, setupApp } from './helpers';

let n = 0;
async function reg(body: Record<string, unknown>) {
  n += 1;
  const email = (body.email as string | undefined) ?? `kid${Date.now()}${n}@qubedu.test`;
  const r = await call<AuthResult>('POST', '/auth/register', {
    body: { email, password: 'Password#123', displayName: `Person ${n}`, accountType: 'student', ...body },
    headers: { 'x-client': 'mobile' },
  });
  return { status: r.status, token: r.body.accessToken, user: r.body.user, email };
}

describe('school stages and age protection', () => {
  it('an under-13 student starts in classes-only mode', async () => {
    const kid = await reg({ gradeLevel: 'p4', displayName: 'Little Lina' });
    expect(kid.status).toBe(201);
    const me = (await call<Me>('GET', '/me', { token: kid.token })).body;
    expect(me).toMatchObject({
      gradeLevel: 'p4',
      ageTier: 'child',
      isMinor: true,
      parentalControls: { messages: 'classes', publicPosts: false, joinGroups: false, ai: true },
    });

    // No public posting, no joining groups by themselves.
    expect((await call('POST', '/posts', { token: kid.token, body: { text: 'Hello everyone' } })).body).toMatchObject({ error: { code: 'parent_restricted' } });
    expect((await call('POST', '/groups', { token: kid.token, body: { name: 'My group', privacy: 'public' } })).status).toBe(403);

    // Messages only with their class: a stranger adult and a stranger child are refused, their teacher is allowed.
    const stranger = await newUser({ name: 'Stranger' });
    const otherKid = await reg({ gradeLevel: 'p5' });
    expect((await call('POST', '/chat/conversations/direct', { token: stranger.token, body: { userId: kid.user.id } })).status).toBe(403);
    expect((await call('POST', '/chat/conversations/direct', { token: otherKid.token, body: { userId: kid.user.id } })).status).toBe(403);
    const teacher = await newUser({ accountType: 'teacher', name: 'Ms Huda' });
    const course = await call<CourseDto>('POST', '/school/courses', { token: teacher.token, body: { title: 'Arabic 4' } });
    await call('POST', '/school/join', { token: kid.token, body: { code: course.body.joinCode } });
    expect((await call('POST', '/chat/conversations/direct', { token: teacher.token, body: { userId: kid.user.id } })).status).toBe(201);

    // Strangers don't find under-13s in people search; classmates and teachers do.
    const hits = (who: { token: string }) =>
      call<Page<UserSummary>>('GET', '/users?q=Little%20Lina', { token: who.token }).then((r) => r.body.items.some((u) => u.id === kid.user.id));
    expect(await hits(stranger)).toBe(false);
    expect(await hits(teacher)).toBe(true);
    // Someone with no birth year and no school year is not treated as a child: strangers still find them.
    const plain = await newUser({ name: 'Plain Omar' });
    const found = await call<Page<UserSummary>>('GET', '/users?q=Plain%20Omar', { token: stranger.token });
    expect(found.body.items.some((u) => u.id === plain.user.id)).toBe(true);
  });

  it('the stricter of birth year and school year applies; minors cannot become teachers or parents', async () => {
    const y = new Date().getUTCFullYear();
    const teen = await reg({ birthYear: y - 15, gradeLevel: 'uni' });
    expect((await call<Me>('GET', '/me', { token: teen.token })).body.ageTier).toBe('teen');
    expect((await reg({ birthYear: y - 15, accountType: 'teacher' })).status).toBe(400);
    expect((await call('PATCH', '/me', { token: teen.token, body: { accountType: 'teacher' } })).status).toBe(403);
    // Teens post publicly by default.
    expect((await call('POST', '/posts', { token: teen.token, body: { text: 'Question about photosynthesis' } })).status).toBe(201);
  });
});

describe('parent account', () => {
  it('links by request + approval, sets controls, contacts the teacher, and stays limited', async () => {
    const kid = await reg({ gradeLevel: 'p6', displayName: 'Omar' });
    const parent = await newUser({ accountType: 'parent', name: 'Omar’s mum' });
    // The parent asks; the answer doesn't reveal whether the account exists.
    expect((await call('POST', '/family/request', { token: parent.token, body: { who: 'nobody@nowhere.test' } })).status).toBe(201);
    expect((await call('POST', '/family/request', { token: parent.token, body: { who: kid.email } })).status).toBe(201);
    const fam = await call<FamilyDto>('GET', '/family', { token: kid.token });
    const incoming = fam.body.requests.find((r) => r.direction === 'incoming')!;
    expect(incoming.person?.id).toBe(parent.user.id);
    // Only the recipient can accept.
    expect((await call('POST', `/family/requests/${incoming.id}/accept`, { token: parent.token })).status).toBe(403);
    expect((await call('POST', `/family/requests/${incoming.id}/accept`, { token: kid.token })).status).toBe(200);
    expect((await call<FamilyDto>('GET', '/family', { token: parent.token })).body.children.map((c) => c.id)).toEqual([kid.user.id]);

    // Controls: the parent allows public posts; the child can post now. The child can't change their own school year.
    const ctl = await call<{ controls: { publicPosts: boolean } }>('PUT', `/family/children/${kid.user.id}/controls`, {
      token: parent.token,
      body: { publicPosts: true, ai: false },
    });
    expect(ctl.body.controls.publicPosts).toBe(true);
    expect((await call('POST', '/posts', { token: kid.token, body: { text: 'Can someone explain fractions?' } })).status).toBe(201);
    expect((await call('GET', '/assistant/threads', { token: kid.token })).body).toMatchObject({ error: { code: 'parent_restricted' } });
    expect((await call('PATCH', '/me', { token: kid.token, body: { gradeLevel: 'uni' } })).body).toMatchObject({ error: { code: 'ask_parent' } });
    const report = await call<ChildReportDto>('GET', `/family/children/${kid.user.id}`, { token: parent.token });
    expect(report.body).toMatchObject({ gradeLevel: 'p6', ageTier: 'child', controls: { publicPosts: true, ai: false } });
    // Someone else can't change them.
    const other = await newUser({ accountType: 'parent' });
    expect((await call('PUT', `/family/children/${kid.user.id}/controls`, { token: other.token, body: { ai: true } })).status).toBe(403);

    // The parent can message the child's teacher even when the teacher only takes messages from people they follow.
    const teacher = await newUser({ accountType: 'teacher' });
    await call('PATCH', '/me/prefs', { token: teacher.token, body: { privacy: { allowMessages: 'following' } } });
    const course = await call<CourseDto>('POST', '/school/courses', { token: teacher.token, body: { title: 'Science 6' } });
    await call('POST', '/school/join', { token: kid.token, body: { code: course.body.joinCode } });
    expect((await call('POST', '/chat/conversations/direct', { token: parent.token, body: { userId: teacher.user.id } })).status).toBe(201);
    expect((await call('POST', '/chat/conversations/direct', { token: other.token, body: { userId: teacher.user.id } })).status).toBe(403);
    // Parents follow classes through the child, not as class members.
    expect((await call('POST', '/school/join', { token: parent.token, body: { code: course.body.joinCode } })).body).toMatchObject({
      error: { code: 'parents_cannot_join' },
    });
  });

  it('a student invites a parent by email at sign-up; the emailed link links them', async () => {
    const { deps } = await setupApp();
    const parentEmail = `mum${Date.now()}@family.test`;
    const before = deps.mailer.outbox.length;
    const kid = await reg({ gradeLevel: 'm1', parentEmail });
    const mail = deps.mailer.outbox.slice(before).find((m) => m.to === parentEmail)!;
    const token = /invite=([\w-]+)/.exec(mail.text)![1]!;
    const parent = await newUser({ accountType: 'parent', email: parentEmail });
    // A student account can't use it; the parent can, once.
    const student = await newUser();
    expect((await call('POST', '/family/invite/accept', { token: student.token, body: { token } })).status).toBe(403);
    const ok = await call<{ child: UserSummary }>('POST', '/family/invite/accept', { token: parent.token, body: { token } });
    expect(ok.body.child.id).toBe(kid.user.id);
    expect((await call('POST', '/family/invite/accept', { token: parent.token, body: { token } })).status).toBe(400);
  });
});

describe('second parent for a minor', () => {
  it('needs the approval of a parent who is already linked; removing a link tells the other side', async () => {
    const reg = await call<AuthResult>('POST', '/auth/register', {
      body: { email: `minor${Date.now()}@qubedu.test`, password: 'Password#123', displayName: 'Minor Mona', accountType: 'student', gradeLevel: 'm2' },
      headers: { 'x-client': 'mobile' },
    });
    const kid = { token: reg.body.accessToken, user: reg.body.user, email: '' };
    const mom = await newUser({ accountType: 'parent', name: 'Real Mom' });
    const stranger = await newUser({ accountType: 'parent', name: 'Stranger Sam' });
    // First parent: the child approves alone.
    await call('POST', '/family/request', { token: mom.token, body: { who: (await call<Me>('GET', '/me', { token: kid.token })).body.email } });
    let fam = await call<FamilyDto>('GET', '/family', { token: kid.token });
    expect((await call<{ held: boolean }>('POST', `/family/requests/${fam.body.requests[0]!.id}/accept`, { token: kid.token })).body.held).toBe(false);

    // A second "parent": the child says yes, but it waits for Mom.
    await call('POST', '/family/request', { token: stranger.token, body: { who: (await call<Me>('GET', '/me', { token: kid.token })).body.email } });
    fam = await call<FamilyDto>('GET', '/family', { token: kid.token });
    const req = fam.body.requests.find((r) => r.person?.id === stranger.user.id)!;
    expect((await call<{ held: boolean }>('POST', `/family/requests/${req.id}/accept`, { token: kid.token })).body.held).toBe(true);
    expect((await call('GET', `/family/children/${kid.user.id}`, { token: stranger.token })).status).toBe(403);
    // The child cannot approve it again; Mom sees it with the child's name and declines.
    const momFam = await call<FamilyDto>('GET', '/family', { token: mom.token });
    const approval = momFam.body.requests.find((r) => r.child?.id === kid.user.id)!;
    expect(approval).toMatchObject({ direction: 'incoming', awaitingGuardian: true, person: { id: stranger.user.id } });
    expect((await call('POST', `/family/requests/${approval.id}/accept`, { token: kid.token })).status).toBe(403);
    expect((await call('POST', `/family/requests/${approval.id}/accept`, { token: stranger.token })).status).toBe(403);
    expect((await call<FamilyDto>('GET', '/family', { token: kid.token })).body.requests.some((r) => r.id === approval.id)).toBe(false);
    await call('DELETE', `/family/requests/${approval.id}`, { token: mom.token });
    expect((await call('GET', `/family/children/${kid.user.id}`, { token: stranger.token })).status).toBe(403);

    // Removing a link notifies the parent.
    await call('DELETE', `/family/${mom.user.id}`, { token: kid.token });
    const notes = await call<Page<{ type: string }>>('GET', '/notifications', { token: mom.token });
    expect(notes.body.items.some((n) => n.type === 'guardian_removed')).toBe(true);
  });
});
