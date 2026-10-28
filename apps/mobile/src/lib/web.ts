import Constants from 'expo-constants';
import * as WebBrowser from 'expo-web-browser';

/** The web app's base URL (for pages that only exist on the web, like the workspace editors or admin). */
export const WEB_URL = (
  process.env.EXPO_PUBLIC_WEB_URL ??
  (Constants.expoConfig?.extra as { webUrl?: string } | undefined)?.webUrl ??
  'http://localhost:5173'
).replace(/\/$/, '');

export const openWeb = (path: string) => WebBrowser.openBrowserAsync(`${WEB_URL}${path.startsWith('/') ? path : `/${path}`}`);

/** Opens a web page in the browser already signed in (one-time handoff code), e.g. to print or save a PDF. */
export async function openWebSignedIn(path: string) {
  const { api } = await import('./api');
  const { code } = await api.auth.handoff();
  const target = new URL(path.startsWith('/') ? path : `/${path}`, WEB_URL);
  target.searchParams.set('handoff', code);
  await WebBrowser.openBrowserAsync(target.toString());
}
