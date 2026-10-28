/**
 * Cloudflare Pages "advanced mode" worker for Qubedu.
 *
 * Serves the web app from Pages and forwards the server paths (/api, /files, /ws, /webhooks) to your
 * Qubedu server, so the browser talks to one origin: sign-in cookies, uploads and live classes keep working.
 *
 * Set BACKEND_ORIGIN in the Pages project settings (Settings → Variables and Secrets), for example
 * https://server.example.com — the address of the server running `docker compose` (its web container).
 */
const SERVER_PATHS = /^\/(api|files|ws|webhooks)(\/|$)/;

function json(status, body) {
  return new Response(JSON.stringify(body), { status, headers: { 'content-type': 'application/json; charset=utf-8' } });
}

export default {
  async fetch(request, env) {
    const url = new URL(request.url);

    if (SERVER_PATHS.test(url.pathname)) {
      const origin = (env.BACKEND_ORIGIN || '').trim();
      if (!origin) {
        return json(503, {
          error: { code: 'backend_not_configured', message: 'Set BACKEND_ORIGIN in the Cloudflare Pages settings to your Qubedu server address.' },
        });
      }
      const target = new URL(url.pathname + url.search, origin);
      const headers = new Headers(request.headers);
      headers.set('x-forwarded-host', url.host);
      headers.set('x-forwarded-proto', url.protocol.replace(':', ''));
      const ip = request.headers.get('cf-connecting-ip');
      if (ip) headers.set('x-forwarded-for', ip);
      const hasBody = !['GET', 'HEAD'].includes(request.method);
      // WebSocket upgrades (live classes, chat) pass straight through: fetch() returns the 101 response.
      // The body is streamed (large uploads are not held in memory); `duplex` is required by some runtimes and ignored by others.
      return fetch(target.toString(), { method: request.method, headers, body: hasBody ? request.body : undefined, duplex: 'half', redirect: 'manual' });
    }

    const res = await env.ASSETS.fetch(request);
    // Single-page app: unknown paths without a file extension get index.html (the app's router shows the page or "not found").
    if (res.status === 404 && (request.method === 'GET' || request.method === 'HEAD') && !/\.[a-z0-9]+$/i.test(url.pathname)) {
      return env.ASSETS.fetch(new Request(new URL('/index.html', url), request));
    }
    return res;
  },
};
