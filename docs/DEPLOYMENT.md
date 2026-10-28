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

**Egypt (Paymob):** courses priced in EGP can also be paid by card (Meeza, Visa, Mastercard) and mobile wallets through Paymob. Set `PAYMOB_SECRET_KEY`, `PAYMOB_PUBLIC_KEY`, `PAYMOB_HMAC_SECRET` and the integration ids `PAYMOB_CARD_INTEGRATION_ID` / `PAYMOB_WALLET_INTEGRATION_ID` (Paymob dashboard → Developers). Set the transaction processed callback to `https://<api>/webhooks/paymob`; a payment is accepted only when the callback's HMAC and amount match.

**Manual transfers (no payment company needed):** in a paid course's settings the teacher adds an InstaPay address, wallet number and/or bank account. Students send the transfer, then upload the receipt (kept private) with the transaction number; the teacher approves it (the student joins the course) or refuses it with a reason.

## WhatsApp and SMS for parents

Parent accounts can confirm a phone number (6-digit code) and get the weekly report and instant alerts (absence, a grade below half; at most 5 a day) on WhatsApp or by SMS. Students' numbers are never collected.

- **WhatsApp (Meta WhatsApp Business Cloud API):** set `WHATSAPP_TOKEN` and `WHATSAPP_PHONE_NUMBER_ID`. WhatsApp only delivers business-started messages through approved templates, so create three templates in WhatsApp Manager and set their names:
  - `WHATSAPP_TEMPLATE_CODE` — an *Authentication* template (one value: the code, with a copy-code button).
  - `WHATSAPP_TEMPLATE_WEEKLY` — *Utility*, five values: child's name, study minutes, quiz average, missing assignments, link.
  - `WHATSAPP_TEMPLATE_ALERT` — *Utility*, one value: the alert text.
  Create each template in the languages your parents use (ar, en, fr, es); the parent's app language is used.
- **SMS (Twilio):** set `TWILIO_ACCOUNT_SID`, `TWILIO_AUTH_TOKEN` and either `TWILIO_FROM` (a number or alphanumeric sender) or `TWILIO_MESSAGING_SERVICE_SID`.
- Without either provider the section tells parents it isn't available. In development, messages are printed to the API log instead.

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

## Web on Cloudflare Pages

The web app can be hosted on Cloudflare Pages while the server keeps running with Docker Compose.
Everything is in `infra/cloudflare/` (worker, headers, wrangler config) and
`.github/workflows/cloudflare-pages.yml`; the steps are in `infra/cloudflare/README.md`.
Build locally with `pnpm build:cloudflare`.
