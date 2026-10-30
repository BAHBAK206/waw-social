# Qubedu web on Cloudflare Pages

Cloudflare Pages hosts the **web app**. The server part (API, live classes hub, AI, database) still runs on
your own server with `docker compose` (see `docs/DEPLOYMENT.md`). A small worker (`_worker.js`) sends
`/api`, `/files`, `/ws` and `/webhooks` to that server, so the browser sees one address and sign-in,
uploads and live classes work as on a single server.

```
browser ──► your-site.pages.dev ──┬─ web app (static files on Cloudflare)
                                  └─ /api /files /ws /webhooks ──► BACKEND_ORIGIN (your server)
```

## Option A — GitHub Actions (recommended)

1. Cloudflare dashboard → Workers & Pages → Create → Pages → **Direct upload** → name the project `qubedu`
   (upload any file once; the workflow replaces it).
2. In the project: Settings → Variables and Secrets → add `BACKEND_ORIGIN` = `https://your-server-address`.
3. GitHub repository → Settings → Secrets and variables → Actions → add the secrets
   `CLOUDFLARE_API_TOKEN` (token with *Cloudflare Pages: Edit*) and `CLOUDFLARE_ACCOUNT_ID`.
4. Push to `main` (or run **Deploy web to Cloudflare Pages** from the Actions tab). The workflow
   `.github/workflows/cloudflare-pages.yml` builds and publishes.

## Option B — Connect the repository in Cloudflare

Workers & Pages → Create → Pages → **Connect to Git** → pick the repository, then:

| Setting | Value |
| --- | --- |
| Framework preset | None |
| Build command | `npx pnpm@10.28.0 install --frozen-lockfile --filter "@qubedu/web..." && npx pnpm@10.28.0 build:cloudflare` |
| Build output directory | `apps/web/dist` |
| Environment variables | `NODE_VERSION=22`, `SKIP_DEPENDENCY_INSTALL=1`, `BACKEND_ORIGIN=https://your-server-address` |

## Option C — Upload the ready folder by hand

`pnpm build:cloudflare` (or use the zip from the release) and upload the contents of `apps/web/dist`
with `npx wrangler pages deploy apps/web/dist --project-name qubedu`. Drag-and-drop in the dashboard also
works for the files; set `BACKEND_ORIGIN` in the project settings.

## On the server

In the server's `.env` set `APP_URL` and `CORS_ORIGINS` to the Pages address (for example
`https://qubedu.pages.dev` or your own domain), so emails link to the right site.
Leave `REALTIME_PUBLIC_URL` empty: live classes then connect through `/ws` on the Pages address.
In the server's `.env` also set `TRUST_PROXY_HOPS=2` (Cloudflare + nginx), so rate limits see each visitor's real address.
