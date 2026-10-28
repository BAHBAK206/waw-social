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

/** Security headers for the app's pages (in advanced mode the worker sets them itself; keep in sync with _headers). */
const PAGE_HEADERS = {
  'Content-Security-Policy':
    "default-src 'self'; script-src 'self'; style-src 'self' 'unsafe-inline'; img-src 'self' data: blob: https:; media-src 'self' blob: https:; font-src 'self' data:; connect-src 'self' https: wss:; worker-src 'self' blob:; manifest-src 'self'; frame-src 'none'; object-src 'none'; base-uri 'self'; form-action 'self'; frame-ancestors 'self'; upgrade-insecure-requests",
  'X-Content-Type-Options': 'nosniff',
  'Referrer-Policy': 'strict-origin-when-cross-origin',
  'X-Frame-Options': 'SAMEORIGIN',
  'Strict-Transport-Security': 'max-age=31536000; includeSubDomains',
  'Permissions-Policy': 'camera=(self), microphone=(self), display-capture=(self), geolocation=()',
};

function withPageHeaders(res) {
  if (!(res.headers.get('content-type') || '').includes('text/html')) return res;
  const out = new Response(res.body, res);
  for (const [k, v] of Object.entries(PAGE_HEADERS)) out.headers.set(k, v);
  return out;
}

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
      return withPageHeaders(await env.ASSETS.fetch(new Request(new URL('/index.html', url), request)));
    }
    return withPageHeaders(res);
  },
};
