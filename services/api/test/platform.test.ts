import { describe, expect, it } from 'vitest';
import type {
  EventDto,
  ExploreDto,
  HashtagPageDto,
  Page,
  PlaylistDto,
  PostDto,
  StoryDto,
  StoryGroupDto,
  StudioOverviewDto,
  TrendingTagDto,
  UploadResultDto,
  VideoChannelDto,
  VideoCommentDto,
  VideoDto,
} from '@qubedu/shared';
import { call, newUser } from './helpers';

// Minimal MP4 header (ftyp box) and PNG signature are enough for the server's magic-byte sniffing.
const MP4 = new Uint8Array([0, 0, 0, 24, 0x66, 0x74, 0x79, 0x70, 0x69, 0x73, 0x6f, 0x6d, 0, 0, 2, 0, 0x69, 0x73, 0x6f, 0x6d, 0, 0, 0, 0, 1, 2, 3, 4]);
const PNG = new Uint8Array([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a, 0, 0, 0, 0]);

async function upload(token: string, bytes: Uint8Array, name: string, type: string, purpose: string) {
  const form = new FormData();
  form.set('file', new Blob([bytes], { type }), name);
  form.set('purpose', purpose);
  const res = await call<UploadResultDto>('POST', '/uploads', { token, form });
  expect(res.status).toBe(201);
  return res.body;
}

async function publish(token: string, over: Record<string, unknown> = {}) {
  const v = await upload(token, MP4, 'lesson.mp4', 'video/mp4', 'video');
  const t = await upload(token, PNG, 'thumb.png', 'image/png', 'thumbnail');
  const res = await call<VideoDto>('POST', '/videos', {
    token,
    body: {
      title: 'Intro to algebra',
      description: 'Solving linear equations #algebra',
      videoUrl: v.url,
      thumbnailUrl: t.url,
      durationSec: 120,
      tags: ['Math'],
      ...over,
    },
  });
  return res;
}

describe('watch (videos & shorts)', () => {
  it('publishes, lists, counts unique views and serves ranges', async () => {
    const creator = await newUser({ name: 'Teacher', accountType: 'teacher' });
    const fan = await newUser({ name: 'Fan' });
    const created = await publish(creator.token);
    expect(created.status).toBe(201);
    const video = created.body;
    expect(video.tags).toEqual(['math']);
    expect(video.owner.id).toBe(creator.user.id);

    // Guests can browse and watch public videos.
    const guestList = await call<Page<VideoDto>>('GET', '/videos?feed=new');
    expect(guestList.status).toBe(200);
    expect(guestList.body.items.some((x) => x.id === video.id)).toBe(true);
    expect((await call('GET', `/videos/${video.id}`)).status).toBe(200);

    // A view counts once per viewer per day.
    expect((await call<{ counted: boolean }>('POST', `/videos/${video.id}/view`, { token: fan.token })).body.counted).toBe(true);
    expect((await call<{ counted: boolean }>('POST', `/videos/${video.id}/view`, { token: fan.token })).body.counted).toBe(false);
    expect((await call<VideoDto>('GET', `/videos/${video.id}`)).body.views).toBe(1);

    // Local files support HTTP Range so players can seek.
    const key = /\/files\/(public\/[^?]+)/.exec(video.videoUrl)![1]!;
    const { app } = await (await import('./helpers')).setupApp();
    const ranged = await app.request(`/files/${key}`, { headers: { range: 'bytes=4-7' } });
    expect(ranged.status).toBe(206);
    expect(ranged.headers.get('content-range')).toBe(`bytes 4-7/${MP4.length}`);
    expect(new Uint8Array(await ranged.arrayBuffer())).toEqual(MP4.slice(4, 8));
    expect((await app.request(`/files/${key}`, { headers: { range: 'bytes=999-1000' } })).status).toBe(416);
  });

  it('rejects media that is not the creator’s own upload', async () => {
    const a = await newUser();
    const b = await newUser();
    const theirs = await upload(a.token, MP4, 'a.mp4', 'video/mp4', 'video');
    const stolen = await call('POST', '/videos', { token: b.token, body: { title: 'x', videoUrl: theirs.url, durationSec: 10 } });
    expect(stolen.status).toBe(400);
    const external = await call('POST', '/videos', { token: b.token, body: { title: 'x', videoUrl: 'https://evil.example/v.mp4', durationSec: 10 } });
    expect(external.status).toBe(400);
    const png = await upload(b.token, PNG, 'p.png', 'image/png', 'thumbnail');
    expect((await call('POST', '/videos', { token: b.token, body: { title: 'x', videoUrl: png.url, durationSec: 10 } })).status).toBe(400);
  });

  it('likes, comments with replies, pinning and permissions', async () => {
    const creator = await newUser();
    const fan = await newUser({ name: 'Fan' });
    const other = await newUser();
    const { body: video } = await publish(creator.token);

    const like = await call<{ likes: number; dislikes: number; myReaction: number }>('PUT', `/videos/${video.id}/reaction`, {
      token: fan.token,
      body: { value: 1 },
    });
    expect(like.body).toMatchObject({ likes: 1, dislikes: 0, myReaction: 1 });
    const flip = await call<{ likes: number; dislikes: number }>('PUT', `/videos/${video.id}/reaction`, { token: fan.token, body: { value: -1 } });
    expect(flip.body).toMatchObject({ likes: 0, dislikes: 1 });
    expect((await call<VideoDto>('GET', `/videos/${video.id}`, { token: fan.token })).body.myReaction).toBe(-1);

    const root = await call<VideoCommentDto>('POST', `/videos/${video.id}/comments`, { token: fan.token, body: { text: 'Great lesson' } });
    expect(root.status).toBe(201);
    const reply = await call<VideoCommentDto>('POST', `/videos/${video.id}/comments`, {
      token: creator.token,
      body: { text: 'Thanks!', parentId: root.body.id },
    });
    // Replying to a reply attaches to the thread root.
    const nested = await call<VideoCommentDto>('POST', `/videos/${video.id}/comments`, {
      token: fan.token,
      body: { text: '@Teacher more please', parentId: reply.body.id },
    });
    expect(nested.body.parentId).toBe(root.body.id);

    const top = await call<Page<VideoCommentDto>>('GET', `/videos/${video.id}/comments`);
    expect(top.body.items).toHaveLength(1);
    expect(top.body.items[0]!.replyCount).toBe(2);
    const replies = await call<Page<VideoCommentDto>>('GET', `/videos/${video.id}/comments?parentId=${root.body.id}`);
    expect(replies.body.items.map((r) => r.text)).toEqual(['Thanks!', '@Teacher more please']);
    expect((await call<VideoDto>('GET', `/videos/${video.id}`)).body.commentCount).toBe(3);

    const liked = await call<{ likes: number }>('PUT', `/videos/${video.id}/comments/${root.body.id}/like`, { token: creator.token, body: { liked: true } });
    expect(liked.body.likes).toBe(1);

    expect((await call('PUT', `/videos/${video.id}/comments/${root.body.id}/pin`, { token: fan.token, body: { pinned: true } })).status).toBe(403);
    expect((await call('PUT', `/videos/${video.id}/comments/${root.body.id}/pin`, { token: creator.token, body: { pinned: true } })).status).toBe(200);
    expect((await call('DELETE', `/videos/${video.id}/comments/${root.body.id}`, { token: other.token })).status).toBe(403);
    // The video owner can delete a thread; replies go with it.
    expect((await call('DELETE', `/videos/${video.id}/comments/${root.body.id}`, { token: creator.token })).status).toBe(200);
    expect((await call<VideoDto>('GET', `/videos/${video.id}`)).body.commentCount).toBe(0);

    const off = await call<VideoDto>('PATCH', `/videos/${video.id}`, { token: creator.token, body: { allowComments: false } });
    expect(off.body.allowComments).toBe(false);
    expect((await call('POST', `/videos/${video.id}/comments`, { token: fan.token, body: { text: 'hi' } })).status).toBe(403);
  });

  it('enforces visibility', async () => {
    const owner = await newUser();
    const other = await newUser();
    const priv = (await publish(owner.token, { visibility: 'private' })).body;
    const unlisted = (await publish(owner.token, { visibility: 'unlisted' })).body;
    expect((await call('GET', `/videos/${priv.id}`)).status).toBe(404);
    expect((await call('GET', `/videos/${priv.id}`, { token: other.token })).status).toBe(404);
    expect((await call('GET', `/videos/${priv.id}`, { token: owner.token })).status).toBe(200);
    expect((await call('GET', `/videos/${unlisted.id}`)).status).toBe(200);
    const list = await call<Page<VideoDto>>('GET', `/videos?feed=new&ownerId=${owner.user.id}`, { token: other.token });
    expect(list.body.items.map((v) => v.id)).not.toContain(unlisted.id);
    expect(list.body.items.map((v) => v.id)).not.toContain(priv.id);
  });

  it('subscriptions feed, watch history/resume, watch later, related and shorts limits', async () => {
    const creator = await newUser({ name: 'Creator' });
    const viewer = await newUser();
    const a = (await publish(creator.token, { title: 'Algebra one', tags: ['algebra'] })).body;
    const b = (await publish(creator.token, { title: 'Algebra two', tags: ['algebra'] })).body;

    expect((await call('GET', '/videos?feed=subscriptions')).status).toBe(403);
    await call('POST', `/users/${creator.user.id}/follow`, { token: viewer.token });
    const subs = await call<Page<VideoDto>>('GET', '/videos?feed=subscriptions', { token: viewer.token });
    expect(subs.body.items.map((v) => v.id).sort()).toEqual([a.id, b.id].sort());
    expect(subs.body.items[0]!.subscribed).toBe(true);

    await call('PUT', `/videos/${a.id}/progress`, { token: viewer.token, body: { progressSec: 45 } });
    expect((await call<VideoDto>('GET', `/videos/${a.id}`, { token: viewer.token })).body.progressSec).toBe(45);
    const hist = await call<Page<{ video: VideoDto; progressSec: number }>>('GET', '/videos/me/history', { token: viewer.token });
    expect(hist.body.items[0]).toMatchObject({ progressSec: 45 });
    expect(hist.body.items[0]!.video.id).toBe(a.id);
    await call('PUT', `/videos/${a.id}/progress`, { token: viewer.token, body: { progressSec: 120, completed: true } });
    expect((await call<VideoDto>('GET', `/videos/${a.id}`, { token: viewer.token })).body.progressSec).toBe(0);
    await call('DELETE', '/videos/me/history', { token: viewer.token });
    expect((await call<Page<unknown>>('GET', '/videos/me/history', { token: viewer.token })).body.items).toHaveLength(0);

    await call('PUT', `/videos/${b.id}/watch-later`, { token: viewer.token, body: { on: true } });
    const later = await call<Page<VideoDto>>('GET', '/videos/me/watch-later', { token: viewer.token });
    expect(later.body.items.map((v) => v.id)).toEqual([b.id]);
    expect(later.body.items[0]!.watchLater).toBe(true);

    const related = await call<{ items: VideoDto[] }>('GET', `/videos/${a.id}/related`, { token: viewer.token });
    expect(related.body.items.map((v) => v.id)).toContain(b.id);
    expect(related.body.items.map((v) => v.id)).not.toContain(a.id);

    const tooLong = await publish(creator.token, { kind: 'short', durationSec: 300 });
    expect(tooLong.status).toBe(400);
    const short = await publish(creator.token, { kind: 'short', durationSec: 30, title: 'Quick tip' });
    expect(short.status).toBe(201);
    const shorts = await call<Page<VideoDto>>('GET', '/videos?feed=home&kind=short');
    expect(shorts.body.items.every((v) => v.kind === 'short')).toBe(true);
  });

  it('search, hashtags, trending and the home ranking work end to end', async () => {
    const creator = await newUser();
    const viewer = await newUser();
    const v = (await publish(creator.token, { title: 'Photosynthesis explained', tags: ['biology'] })).body;
    const found = await call<Page<VideoDto>>('GET', '/videos?q=photosynthesis', { token: viewer.token });
    expect(found.body.items.map((x) => x.id)).toContain(v.id);
    const byTag = await call<Page<VideoDto>>('GET', '/videos?tag=biology');
    expect(byTag.body.items.map((x) => x.id)).toContain(v.id);
    expect((await call('GET', '/videos?feed=home', { token: viewer.token })).status).toBe(200);
    expect((await call('GET', '/videos?feed=trending')).status).toBe(200);
    expect((await call('GET', '/videos?feed=liked', { token: viewer.token })).status).toBe(200);

    const tag = await call<HashtagPageDto>('GET', '/explore/tag/biology', { token: viewer.token });
    expect(tag.body.videoCount).toBeGreaterThanOrEqual(1);
    expect(tag.body.videos.map((x) => x.id)).toContain(v.id);
    expect((await call('GET', '/explore/tag/a', { token: viewer.token })).status).toBe(400);
  });

  it('playlists and channel/studio views', async () => {
    const owner = await newUser({ name: 'Owner' });
    const viewer = await newUser();
    const v1 = (await publish(owner.token, { title: 'One' })).body;
    const v2 = (await publish(owner.token, { title: 'Two' })).body;

    const pl = await call<PlaylistDto>('POST', '/playlists', { token: owner.token, body: { title: 'Course' } });
    expect(pl.status).toBe(201);
    await call('POST', `/playlists/${pl.body.id}/items`, { token: owner.token, body: { videoId: v1.id } });
    await call('POST', `/playlists/${pl.body.id}/items`, { token: owner.token, body: { videoId: v2.id } });
    await call('POST', `/playlists/${pl.body.id}/items`, { token: owner.token, body: { videoId: v2.id } });
    const got = await call<{ playlist: PlaylistDto; videos: VideoDto[] }>('GET', `/playlists/${pl.body.id}`, { token: viewer.token });
    expect(got.body.videos.map((v) => v.id)).toEqual([v1.id, v2.id]);
    expect(got.body.playlist.itemCount).toBe(2);
    await call('PUT', `/playlists/${pl.body.id}/order`, { token: owner.token, body: { videoIds: [v2.id, v1.id] } });
    expect((await call<{ videos: VideoDto[] }>('GET', `/playlists/${pl.body.id}`, { token: viewer.token })).body.videos.map((v) => v.id)).toEqual([
      v2.id,
      v1.id,
    ]);
    expect((await call('POST', `/playlists/${pl.body.id}/items`, { token: viewer.token, body: { videoId: v1.id } })).status).toBe(403);

    const mine = await call<{ items: PlaylistDto[] }>('GET', `/playlists/mine?videoId=${v1.id}`, { token: owner.token });
    expect(mine.body.items[0]!.hasVideo).toBe(true);
    await call('PATCH', `/playlists/${pl.body.id}`, { token: owner.token, body: { visibility: 'private' } });
    expect((await call('GET', `/playlists/${pl.body.id}`, { token: viewer.token })).status).toBe(404);

    const ch = await call<VideoChannelDto>('GET', `/channels/${owner.user.id}`, { token: viewer.token });
    expect(ch.body.videoCount).toBe(2);
    expect(ch.body.playlists).toHaveLength(0); // private list hidden from others
    expect((await call<VideoChannelDto>('GET', `/channels/${owner.user.id}`, { token: owner.token })).body.playlists).toHaveLength(1);

    await call('POST', `/videos/${v1.id}/view`, { token: viewer.token });
    const studio = await call<StudioOverviewDto>('GET', '/studio/overview', { token: owner.token });
    expect(studio.body.totals.videos).toBe(2);
    expect(studio.body.totals.views).toBe(1);
    expect(studio.body.viewsByDay).toHaveLength(28);
    expect(studio.body.viewsByDay.at(-1)!.views).toBe(1);
    expect(studio.body.topVideos[0]!.id).toBe(v1.id);
    expect((await call('GET', '/studio/overview')).status).toBe(401);
  });
});

describe('stories', () => {
  it('tray ordering, views, reactions, viewers list and expiry', async () => {
    const author = await newUser({ name: 'Author' });
    const friend = await newUser({ name: 'Friend' });
    const stranger = await newUser();
    await call('POST', `/users/${author.user.id}/follow`, { token: friend.token });

    const s1 = await call<StoryDto>('POST', '/stories', { token: author.token, body: { mediaKind: 'text', text: 'Exam tomorrow!', bgColor: '#6c5ce7' } });
    expect(s1.status).toBe(201);
    const photo = await upload(author.token, PNG, 'p.png', 'image/png', 'story');
    const s2 = await call<StoryDto>('POST', '/stories', { token: author.token, body: { mediaKind: 'image', mediaUrl: photo.url } });
    expect(s2.status).toBe(201);
    expect((await call('POST', '/stories', { token: author.token, body: { mediaKind: 'image' } })).status).toBe(400);
    expect((await call('POST', '/stories', { token: author.token, body: { mediaKind: 'text', text: '' } })).status).toBe(400);

    const tray = await call<{ items: StoryGroupDto[] }>('GET', '/stories', { token: friend.token });
    expect(tray.body.items).toHaveLength(1);
    expect(tray.body.items[0]!.stories).toHaveLength(2);
    expect(tray.body.items[0]!.allViewed).toBe(false);
    expect((await call<{ items: StoryGroupDto[] }>('GET', '/stories', { token: stranger.token })).body.items).toHaveLength(0);
    const mine = await call<{ items: StoryGroupDto[] }>('GET', '/stories', { token: author.token });
    expect(mine.body.items[0]!.isMine).toBe(true);

    await call('POST', `/stories/${s1.body.id}/view`, { token: friend.token });
    await call('POST', `/stories/${s1.body.id}/view`, { token: friend.token });
    const r = await call('PUT', `/stories/${s1.body.id}/reaction`, { token: friend.token, body: { emoji: '🔥' } });
    expect(r.status).toBe(200);
    const viewers = await call<{ items: { user: { id: string }; reaction: string | null }[] }>('GET', `/stories/${s1.body.id}/viewers`, {
      token: author.token,
    });
    expect(viewers.body.items).toHaveLength(1);
    expect(viewers.body.items[0]).toMatchObject({ reaction: '🔥' });
    expect(viewers.body.items[0]!.user.id).toBe(friend.user.id);
    expect((await call('GET', `/stories/${s1.body.id}/viewers`, { token: friend.token })).status).toBe(403);
    const after = await call<{ items: StoryGroupDto[] }>('GET', '/stories', { token: author.token });
    expect(after.body.items[0]!.stories.find((s) => s.id === s1.body.id)!.viewCount).toBe(1);

    const { deps } = await (await import('./helpers')).setupApp();
    await deps.sql`update stories set expires_at = now() - interval '1 minute' where id = ${s2.body.id}`;
    expect((await call<{ items: StoryGroupDto[] }>('GET', '/stories', { token: friend.token })).body.items[0]!.stories).toHaveLength(1);
    expect((await call('DELETE', `/stories/${s1.body.id}`, { token: friend.token })).status).toBe(403);
    expect((await call('DELETE', `/stories/${s1.body.id}`, { token: author.token })).status).toBe(200);
  });
});

describe('polls, shares, hashtags, for-you', () => {
  it('polls count one vote per user and respect single/multi choice', async () => {
    const author = await newUser();
    const voter = await newUser();
    const created = await call<PostDto>('POST', '/posts', {
      token: author.token,
      body: { text: 'Best subject? #poll', poll: { options: ['Math', 'Physics', 'Biology'], multiple: false } },
    });
    expect(created.status).toBe(201);
    const poll = created.body.poll!;
    expect(poll.options.map((o) => o.text)).toEqual(['Math', 'Physics', 'Biology']);
    expect(created.body.hashtags).toEqual(['poll']);

    const two = await call('PUT', `/posts/${created.body.id}/vote`, { token: voter.token, body: { optionIds: [poll.options[0]!.id, poll.options[1]!.id] } });
    expect(two.status).toBe(400);
    const vote = await call<PostDto>('PUT', `/posts/${created.body.id}/vote`, { token: voter.token, body: { optionIds: [poll.options[1]!.id] } });
    expect(vote.body.poll).toMatchObject({ totalVotes: 1, myVotes: [poll.options[1]!.id] });
    expect(vote.body.poll!.options[1]!.votes).toBe(1);
    expect((await call('PUT', `/posts/${created.body.id}/vote`, { token: voter.token, body: { optionIds: [poll.options[0]!.id] } })).status).toBe(409);
    expect(
      (await call('PUT', `/posts/${created.body.id}/vote`, { token: voter.token, body: { optionIds: ['00000000-0000-4000-8000-000000000000'] } })).status,
    ).toBe(400);

    const multi = await call<PostDto>('POST', '/posts', {
      token: author.token,
      body: { text: 'Pick several', poll: { options: ['A', 'B'], multiple: true, durationHours: 1 } },
    });
    const mv = await call<PostDto>('PUT', `/posts/${multi.body.id}/vote`, {
      token: voter.token,
      body: { optionIds: multi.body.poll!.options.map((o) => o.id) },
    });
    expect(mv.body.poll!.totalVotes).toBe(1);
    expect(mv.body.poll!.options.map((o) => o.votes)).toEqual([1, 1]);

    const { deps } = await (await import('./helpers')).setupApp();
    const closed = await call<PostDto>('POST', '/posts', {
      token: author.token,
      body: { text: 'Closed soon', poll: { options: ['A', 'B'], durationHours: 1 } },
    });
    await deps.sql`update polls set ends_at = now() - interval '1 minute' where post_id = ${closed.body.id}`;
    expect((await call('PUT', `/posts/${closed.body.id}/vote`, { token: voter.token, body: { optionIds: [closed.body.poll!.options[0]!.id] } })).status).toBe(
      409,
    );
    expect((await call('POST', '/posts', { token: author.token, body: { text: 'bad', poll: { options: ['only one'] } } })).status).toBe(400);
  });

  it('shares a post once, never as a chain, and survives deletion of the original', async () => {
    const a = await newUser({ name: 'Original' });
    const b = await newUser({ name: 'Sharer' });
    const c3 = await newUser({ name: 'Third' });
    const orig = (await call<PostDto>('POST', '/posts', { token: a.token, body: { text: 'Study tips' } })).body;
    const share = await call<PostDto>('POST', '/posts', { token: b.token, body: { text: 'Worth reading', sharedPostId: orig.id } });
    expect(share.status).toBe(201);
    expect(share.body.shared).toMatchObject({ id: orig.id, text: 'Study tips', available: true });
    const reshare = await call<PostDto>('POST', '/posts', { token: c3.token, body: { text: '', sharedPostId: share.body.id } });
    expect(reshare.body.shared!.id).toBe(orig.id);
    expect((await call<PostDto>('GET', `/posts/${orig.id}`, { token: b.token })).body.shareCount).toBe(2);
    await call('DELETE', `/posts/${orig.id}`, { token: a.token });
    const after = await call<PostDto>('GET', `/posts/${share.body.id}`, { token: c3.token });
    expect(after.body.shared!.available).toBe(false);
    expect((await call('POST', '/posts', { token: b.token, body: { text: 'x', sharedPostId: orig.id } })).status).toBe(404);
  });

  it('indexes hashtags, ranks trending tags and builds the explore page', async () => {
    const u = await newUser();
    const viewer = await newUser();
    const uniq = `tag${Date.now().toString(36)}`;
    await call('POST', '/posts', { token: u.token, body: { text: `one #${uniq} #دراسة` } });
    const second = await call<PostDto>('POST', '/posts', { token: u.token, body: { text: `two #${uniq}` } });
    await call('POST', '/posts', { token: u.token, body: { text: `not a tag: https://x.test/page#${uniq}x` } });

    const trending = await call<{ items: TrendingTagDto[] }>('GET', '/explore/tags', { token: viewer.token });
    expect(trending.body.items.find((t) => t.tag === uniq)).toMatchObject({ count: 2, growth: null });

    const page = await call<HashtagPageDto>('GET', `/explore/tag/${uniq}`, { token: viewer.token });
    expect(page.body.postCount).toBe(2);
    expect(page.body.posts).toHaveLength(2);
    expect((await call<HashtagPageDto>('GET', `/explore/tag/${encodeURIComponent('دراسة')}`, { token: viewer.token })).body.postCount).toBeGreaterThanOrEqual(
      1,
    );

    const filtered = await call<Page<PostDto>>('GET', `/posts?tag=${uniq}`, { token: viewer.token });
    expect(filtered.body.items).toHaveLength(2);
    const sug = await call<{ items: { tag: string }[] }>('GET', `/explore/tags/suggest?q=${uniq.slice(0, 6)}`, { token: viewer.token });
    expect(sug.body.items.map((t) => t.tag)).toContain(uniq);

    // Editing the text re-indexes; deleting removes the tag.
    await call('PATCH', `/posts/${second.body.id}`, { token: u.token, body: { text: 'no tags now' } });
    expect((await call<HashtagPageDto>('GET', `/explore/tag/${uniq}`, { token: viewer.token })).body.postCount).toBe(1);

    const explore = await call<ExploreDto>('GET', '/explore', { token: viewer.token });
    expect(explore.status).toBe(200);
    expect(explore.body.tags.length).toBeGreaterThan(0);
    expect(explore.body.people.every((p) => p.id !== viewer.user.id)).toBe(true);
  });

  it('"for you" ranks engaged posts above quiet ones and pages without repeats', async () => {
    const author = await newUser();
    const viewer = await newUser();
    const quiet = (await call<PostDto>('POST', '/posts', { token: author.token, body: { text: 'quiet fy' } })).body;
    const hot = (await call<PostDto>('POST', '/posts', { token: author.token, body: { text: 'hot fy' } })).body;
    for (let i = 0; i < 3; i++) {
      const fan = await newUser();
      await call('PUT', `/posts/${hot.id}/reaction`, { token: fan.token, body: { reaction: 'love' } });
      await call('POST', `/posts/${hot.id}/comments`, { token: fan.token, body: { text: 'nice' } });
    }
    const p1 = await call<Page<PostDto>>('GET', '/posts?scope=foryou&limit=1', { token: viewer.token });
    expect(p1.body.items[0]!.id).toBe(hot.id);
    const seen = new Set([p1.body.items[0]!.id]);
    let cursor = p1.body.nextCursor;
    let guard = 0;
    while (cursor && guard++ < 50) {
      const p = await call<Page<PostDto>>('GET', `/posts?scope=foryou&limit=20&cursor=${cursor}`, { token: viewer.token });
      for (const it of p.body.items) {
        expect(seen.has(it.id)).toBe(false);
        seen.add(it.id);
      }
      cursor = p.body.nextCursor;
    }
    expect(seen.has(quiet.id)).toBe(true);
  });
});

describe('events', () => {
  it('creates, lists upcoming/mine, RSVP counts and permissions', async () => {
    const host = await newUser({ name: 'Host' });
    const guest = await newUser({ name: 'Guest' });
    const start = Date.now() + 3 * 86_400_000;
    const created = await call<EventDto>('POST', '/events', {
      token: host.token,
      body: {
        title: 'Revision night',
        description: 'Bring questions',
        startsAt: start,
        endsAt: start + 7_200_000,
        location: 'Library',
        onlineUrl: 'https://meet.example/abc',
      },
    });
    expect(created.status).toBe(201);
    expect(created.body).toMatchObject({ goingCount: 1, myStatus: 'going', canEdit: true });
    expect((await call('POST', '/events', { token: host.token, body: { title: 'bad', startsAt: start, endsAt: start - 1 } })).status).toBe(400);

    const list = await call<Page<EventDto>>('GET', '/events?scope=upcoming', { token: guest.token });
    expect(list.body.items.map((e) => e.id)).toContain(created.body.id);
    expect((await call<Page<EventDto>>('GET', '/events?scope=mine', { token: guest.token })).body.items).toHaveLength(0);

    const going = await call<{ myStatus: string; goingCount: number }>('PUT', `/events/${created.body.id}/rsvp`, {
      token: guest.token,
      body: { status: 'going' },
    });
    expect(going.body).toMatchObject({ myStatus: 'going', goingCount: 2 });
    const interested = await call<{ goingCount: number; interestedCount: number }>('PUT', `/events/${created.body.id}/rsvp`, {
      token: guest.token,
      body: { status: 'interested' },
    });
    expect(interested.body).toMatchObject({ goingCount: 1, interestedCount: 1 });
    expect((await call<Page<EventDto>>('GET', '/events?scope=mine', { token: guest.token })).body.items).toHaveLength(1);
    const attendees = await call<{ items: { status: string }[] }>('GET', `/events/${created.body.id}/attendees`, { token: host.token });
    expect(attendees.body.items).toHaveLength(2);

    expect((await call('PATCH', `/events/${created.body.id}`, { token: guest.token, body: { title: 'hijack', startsAt: start } })).status).toBe(403);
    const edited = await call<EventDto>('PATCH', `/events/${created.body.id}`, {
      token: host.token,
      body: { title: 'Revision night v2', startsAt: start + 3_600_000 },
    });
    expect(edited.body.title).toBe('Revision night v2');
    expect((await call('DELETE', `/events/${created.body.id}`, { token: host.token })).status).toBe(200);
    expect((await call('GET', `/events/${created.body.id}`, { token: guest.token })).status).toBe(404);
  });

  it('keeps group events private to members of private groups', async () => {
    const owner = await newUser();
    const outsider = await newUser();
    const g = await call<{ id: string }>('POST', '/groups', { token: owner.token, body: { kind: 'group', name: 'Secret study', privacy: 'private' } });
    const start = Date.now() + 86_400_000;
    const ev = await call<EventDto>('POST', '/events', { token: owner.token, body: { title: 'Members only', startsAt: start, groupId: g.body.id } });
    expect(ev.status).toBe(201);
    expect((await call('GET', `/events/${ev.body.id}`, { token: outsider.token })).status).toBe(404);
    expect((await call<Page<EventDto>>('GET', '/events', { token: outsider.token })).body.items.map((e) => e.id)).not.toContain(ev.body.id);
    expect((await call('POST', '/events', { token: outsider.token, body: { title: 'Sneak', startsAt: start, groupId: g.body.id } })).status).toBe(403);
  });
});
