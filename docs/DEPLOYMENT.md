# Deployment

## Docker Compose (single host)

1. `cp .env.example .env` and set at least `JWT_SECRET`, `INTERNAL_TOKEN` (`openssl rand -base64 48`), `POSTGRES_PASSWORD`, `ROOT_ADMIN_EMAIL`.
2. Set the public URLs (`APP_URL`, `API_PUBLIC_URL`, `REALTIME_PUBLIC_URL`, `CORS_ORIGINS`) to your domain.
3. `docker compose up -d --build`. The API runs migrations on start (`MIGRATE_ON_START=false` to disable).
4. Put TLS in front (Caddy, Traefik, a cloud load balancer). Forward WebSocket upgrades on `/ws`.
5. Optional: `docker compose run --rm api node dist/seed.js` for demo content.

Persistent data lives in the named volumes `pgdata`, `redisdata`, `miniodata`, `apidata`.

## Backups and alerts

- The `backup` service in `docker-compose.yml` dumps PostgreSQL every night and keeps the last copies; restore with `scripts/restore.sh <file>`. The admin overview shows the time of the last backup. Also back up the object store.
- Set `ALERT_WEBHOOK_URL` (Slack/Discord/any webhook) to be told about server errors and failed backups (rate-limited).

## Video and CDN

The API image includes `ffmpeg`: uploaded lessons are converted in the background into 360p/720p/1080p HLS, and players switch quality with the connection. Set `PUBLIC_FILES_URL` (or `S3_PUBLIC_URL`) to a CDN in front of the files.

## Payments

Paid courses use Stripe Checkout. Set `STRIPE_SECRET_KEY` and `STRIPE_WEBHOOK_SECRET`, and add a Stripe webhook to `https://<api>/webhooks/stripe` (event `checkout.session.completed`). The nginx config already forwards `/webhooks/`. Without Stripe, courses can still be unlocked with school vouchers.

## Notifications

Phone notifications go through Expo (set the EAS project id in the app build). Browser notifications use VAPID keys: leave `VAPID_*` empty and the API generates a pair once and stores it, or set your own.

## Cloud storage and email

Point `S3_*` at AWS S3, Cloudflare R2, etc. (set `S3_PUBLIC_URL` to a CDN). Set `SMTP_*` for verification/reset emails; without SMTP the API logs them (fine for development only).

## Live classes behind strict NATs

Mesh WebRTC works on most networks with STUN. For corporate/mobile carriers, run a TURN relay (`docker compose --profile turn up -d`) and set `TURN_URLS`, `TURN_USERNAME`, `TURN_CREDENTIAL`.

## Scaling

- API and realtime hub are stateless; run several replicas behind the load balancer. Redis carries pub/sub and presence between them.
- Postgres is the only stateful core; use a managed instance and a connection pooler for large installations (`DATABASE_POOL`).
- For classes larger than ~8 simultaneous cameras, put an SFU (LiveKit/mediasoup) behind the same signaling channel.

## Mobile release

```bash
cd apps/mobile
npx eas init   # once: sets the project id used for push notifications
QUBEDU_API_URL=https://api.your-domain QUBEDU_WEB_URL=https://your-domain npx eas build --platform all --profile production
```

Store listing texts (4 languages), data-safety and privacy-label answers and review notes are in `apps/mobile/store/STORE-AR.md`.

## Health checks

`GET /health` on the API (db/redis/storage status) and the realtime hub; both images ship a Docker `HEALTHCHECK`.
