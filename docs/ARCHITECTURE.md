# Architecture

```
            ┌────────────┐      HTTPS /api, /files        ┌──────────────┐     ┌────────────┐
 Browser ──▶│ nginx (web)│───────────────────────────────▶│  API (Hono)  │────▶│ PostgreSQL │
 Phone  ───▶│  React SPA │─ WebSocket /ws ─┐              │  Drizzle ORM │────▶│   Redis    │
            └────────────┘                 ▼              │              │────▶│  S3/minio  │
                                    ┌──────────────┐ pub/sub (Redis)     │      └────────────┘
                                    │ Realtime hub │◀─────────────────────┤
                                    │     (Go)     │── authz/presence ───▶│──▶ AI service (FastAPI)
                                    └──────────────┘                      └─────────────────────────
```

## Principles

- **The server is the authority.** Quiz answers are never sent to the client before submission; grading, XP, levels and achievements are computed server-side. The client sends answers, the server returns the result.
- **One contract.** `packages/shared` holds zod schemas, DTO types and domain rules (XP curve, planner, mastery, grading helpers). The API validates with them; web and mobile import the same types through `packages/api-client`.
- **One design system.** `packages/tokens` resolves *design × skin × mode* into concrete colors. Web turns them into CSS variables (`data-design/skin/theme`), mobile reads the same values. A test checks WCAG-AA contrast for all 96 combinations.
- **One vocabulary.** `packages/i18n` is typed (`t('quiz.start')` is checked at compile time) and a parity test guarantees ar/en/fr/es have identical keys. RTL is derived from the language.

## API

- Hono app mounted at `/api/v1`; files at `/files` (HTTP Range supported for video).
- Auth: Argon2id passwords, short-lived access JWT + rotating refresh token (httpOnly cookie on web, secure storage on mobile), per-IP/per-user rate limits, session list and revocation.
- Pagination: opaque, millisecond-precision cursors; ranked feeds use bounded offset cursors.
- Realtime fan-out: the API publishes to Redis (`qubedu:rt`); the Go hub subscribes and delivers to WebSocket channels (`user:`, `conv:`, `group:`, `live:`, `course:`, `site`). Channel access is checked against the API (`/internal/authorize`).
- Storage: local disk or any S3-compatible bucket; uploads are validated by magic bytes, not file extension.

## Realtime hub

Authenticates the WebSocket with the same JWT, enforces per-channel authorization and event allow-lists (clients may only publish typing/hand/whiteboard/etc.), tracks presence (written back to Redis with TTL), and relays WebRTC `signal` messages by connection id. Live classes use a full mesh (good for ~8 simultaneous senders); the signaling protocol is the same one an SFU would use.

## Web app

React Router data router with lazy routes per page; TanStack Query for server state; Zustand for session, appearance and UI state. Heavy dependencies (TipTap editors, `exceljs`, `pptxgenjs`) load on demand. A Workbox service worker precaches the shell and caches media.

## Mobile app

Expo Router file-based routes. Tokens, i18n, schemas and the API client are shared with web. Refresh tokens live in the OS keychain/keystore. Live classes use the full web room (native WebRTC needs a custom dev client).
