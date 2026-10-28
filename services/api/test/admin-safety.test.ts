import type { AdminOverviewDto, AdminUserDto, AuthResult, Page, PostDto, ReportDto } from '@qubedu/shared';
import { describe, expect, it } from 'vitest';
import { call, newUser, rootUser } from './helpers';

describe('moderation console: safety filters', () => {
  it('flags reports that involve students under 18 and filters users by age group and verification', async () => {
    const root = await rootUser();
    const kidReg = await call<AuthResult>('POST', '/auth/register', {
      body: { email: `teen${Date.now()}@qubedu.test`, password: 'Password#123', displayName: 'Teen Tamer', accountType: 'student', gradeLevel: 's1' },
      headers: { 'x-client': 'mobile' },
    });
    const teen = { token: kidReg.body.accessToken, user: kidReg.body.user };
    const adult = await newUser({ name: 'Adult Reporter' });
    const post = await call<PostDto>('POST', '/posts', { token: teen.token, body: { text: 'My homework question' } });
    const adultPost = await call<PostDto>('POST', '/posts', { token: adult.token, body: { text: 'Adult post' } });
    await call('POST', '/reports', { token: adult.token, body: { targetType: 'post', targetId: post.body.id, reason: 'spam' } });
    const other = await newUser();
    await call('POST', '/reports', { token: other.token, body: { targetType: 'post', targetId: adultPost.body.id, reason: 'spam' } });

    const minorOnly = await call<Page<ReportDto>>('GET', '/admin/reports?minors=1&targetType=post', { token: root.token });
    const ids = minorOnly.body.items.map((r) => r.targetId);
    expect(ids).toContain(post.body.id);
    expect(ids).not.toContain(adultPost.body.id);
    const row = minorOnly.body.items.find((r) => r.targetId === post.body.id)!;
    expect(row).toMatchObject({ minorInvolved: true, targetAuthor: { id: teen.user.id } });

    const overview = await call<AdminOverviewDto>('GET', '/admin/overview', { token: root.token });
    expect(overview.body.safety.minorReports).toBeGreaterThanOrEqual(1);
    expect(overview.body.safety.teens).toBeGreaterThanOrEqual(1);

    const minors = await call<Page<AdminUserDto>>('GET', `/admin/users?age=minor&q=${encodeURIComponent('Teen Tamer')}`, { token: root.token });
    expect(minors.body.items.map((u) => u.id)).toContain(teen.user.id);
    expect(minors.body.items[0]).toMatchObject({ ageTier: 'teen', gradeLevel: 's1' });
    const unverified = await newUser({ accountType: 'teacher', verified: false, name: 'Unverified Umar' });
    const list = await call<Page<AdminUserDto>>('GET', `/admin/users?verified=no&q=${encodeURIComponent('Unverified Umar')}`, { token: root.token });
    expect(list.body.items.map((u) => u.id)).toEqual([unverified.user.id]);
  });
});
