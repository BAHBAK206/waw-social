import type { ConfigContext, ExpoConfig } from 'expo/config';

/**
 * Build-time settings on top of app.json. For store builds set (in EAS → Environment variables):
 *   QUBEDU_API_URL   https://api.your-domain   (the API the app talks to)
 *   QUBEDU_WEB_URL   https://your-domain        (links, web tools, calendar pages)
 *   EAS_PROJECT_ID   from `npx eas init`        (needed for push notifications)
 */
export default ({ config }: ConfigContext): ExpoConfig => {
  const extra = (config.extra ?? {}) as Record<string, unknown>;
  const projectId = process.env.EAS_PROJECT_ID;
  // A store build that still points at localhost would ship a broken app: stop the build with a clear message.
  if (process.env.EAS_BUILD_PROFILE === 'production' && !process.env.QUBEDU_API_URL) {
    throw new Error('Set QUBEDU_API_URL (and QUBEDU_WEB_URL) in EAS environment variables before a production build.');
  }
  return {
    ...(config as ExpoConfig),
    extra: {
      ...extra,
      apiUrl: process.env.QUBEDU_API_URL ?? extra.apiUrl,
      webUrl: process.env.QUBEDU_WEB_URL ?? extra.webUrl,
      ...(projectId ? { eas: { projectId } } : {}),
    },
  };
};
