# Deployment

## Docker Compose (single host)

1. `cp .env.example .env` and set at least `JWT_SECRET`, `INTERNAL_TOKEN` (`openssl rand -base64 48`), `POSTGRES_PASSWORD`, `ROOT_ADMIN_EMAIL`.
2. Set the public URLs (`APP_URL`, `API_PUBLIC_URL`, `REALTIME_PUBLIC_URL`, `CORS_ORIGINS`) to your domain.
3. `docker compose up -d --build`. The API runs migrations on start (`MIGRATE_ON_START=false` to disable).
4. Put TLS in front (Caddy, Traefik, a cloud load balancer). Forward WebSocket upgrades on `/ws`.
5. Optional: `docker compose run --rm api node dist/seed.js` for demo content.

Persistent data lives in the named volumes `pgdata`, `redisdata`, `miniodata`, `apidata`. Back up PostgreSQL (`pg_dump`) and the object store.

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
EXPO_PUBLIC_API_URL=https://your-domain EXPO_PUBLIC_WEB_URL=https://your-domain npx eas build --platform all
```

## Health checks

`GET /health` on the API (db/redis/storage status) and the realtime hub; both images ship a Docker `HEALTHCHECK`.
