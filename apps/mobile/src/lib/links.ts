/**
 * Maps a web link from the API (inbox items, notifications) to the matching mobile screen,
 * or null when the app has no screen for it.
 */
export function appPath(link: string | null | undefined): string | null {
  if (!link) return null;
  const [path = '', search = ''] = link.split('?');
  const qs = search ? `?${search}` : '';
  const m = (re: RegExp) => re.exec(path);
  let r: RegExpExecArray | null;
  if (path === '/watch/library') return '/watch-library';
  if ((r = m(/^\/watch\/([\w-]+)$/))) return `/video/${r[1]}${qs}`;
  if (path === '/shorts' || path.startsWith('/shorts/')) return '/shorts';
  if ((r = m(/^\/channel\/([\w-]+)$/))) return `/channel/${r[1]}`;
  if ((r = m(/^\/playlist\/([\w-]+)$/))) return `/playlist/${r[1]}`;
  if ((r = m(/^\/c\/([\w-]+)$/))) return `/collection/${r[1]}`;
  if ((r = m(/^\/explore\/tag\/([^/]+)$/))) return `/tag/${r[1]}`;
  if (path === '/explore') return '/explore';
  if (['/help', '/about', '/privacy', '/terms', '/contact'].includes(path)) return `/info${path}`;
  if ((r = m(/^\/post\/([\w-]+)$/))) return `/post/${r[1]}`;
  if ((r = m(/^\/(?:groups|group)\/([\w-]+)$/))) return `/group/${r[1]}`;
  if ((r = m(/^\/(?:chat|messages)\/([\w-]+)$/))) return `/chat/${r[1]}`;
  if ((r = m(/^\/(?:u|user|profile)\/([\w-]+)$/))) return `/user/${r[1]}`;
  if (path === '/quiz' && /(^|&)adaptive=1/.test(search)) {
    const topic = new URLSearchParams(search).get('topic');
    return `/quiz/adaptive${topic ? `?topic=${encodeURIComponent(topic)}` : ''}`;
  }
  if (path === '/quiz' || path.startsWith('/quiz/')) return '/learn';
  if (path === '/academic') {
    const tab = new URLSearchParams(search).get('tab');
    return `/study${tab ? `?tab=${tab}` : ''}`;
  }
  if ((r = m(/^\/school\/assignments\/([\w-]+)$/))) return `/assignment/${r[1]}`;
  if ((r = m(/^\/school\/([\w-]+)$/))) {
    const a = new URLSearchParams(search).get('assignment');
    return a ? `/assignment/${a}` : `/course/${r[1]}`;
  }
  if (path === '/school') return '/school';
  if (path === '/organizer') return '/organizer';
  if ((r = m(/^\/events\/([\w-]+)$/))) return `/event/${r[1]}`;
  if (path === '/events') return '/events';
  if (path === '/library') return '/library';
  if ((r = m(/^\/f\/([\w-]+)$/))) return `/form/${r[1]}`;
  if (path === '/lab') return '/lab';
  if (path === '/live' || path.startsWith('/live/')) return '/live';
  return null;
}
