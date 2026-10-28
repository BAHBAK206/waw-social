import type { SavedItemDto } from '@qubedu/shared';
import { Linking } from 'react-native';
import { appPath } from './links';

const ROUTES: Partial<Record<SavedItemDto['itemType'], string>> = {
  post: '/post/',
  quiz: '/quiz/',
  group: '/group/',
  user: '/user/',
  course: '/course/',
};

/** Where a saved item opens on the phone: its screen, a mapped web link, or the browser for external links. */
export function openSaved(i: SavedItemDto, push: (href: string) => void) {
  const route = ROUTES[i.itemType];
  if (route && i.refId) return push(`${route}${i.refId}`);
  if (i.itemType === 'library') return push('/library');
  const mapped = appPath(i.url);
  if (mapped) return push(mapped);
  if (i.url && /^https?:/.test(i.url)) void Linking.openURL(i.url);
}
