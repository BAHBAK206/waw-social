# Qubedu

An educational **social learning platform**: study tools, classrooms and live classes, plus a community with video, stories, groups and chat — on the **web**, **Android** and **iOS**, in **Arabic, English, French and Spanish**.

[العربية ↓](#قبيدو)

| Surface | Stack |
| --- | --- |
| Web app (`apps/web`) | React 19, Vite 7, Tailwind 4, React Router 7, TanStack Query, TipTap, PWA (offline shell) |
| Mobile app (`apps/mobile`) | Expo SDK 58 / React Native 0.88, Expo Router, secure token storage |
| API (`services/api`) | Hono, Drizzle ORM, PostgreSQL 16, Redis, S3-compatible storage, Argon2id + JWT with refresh rotation |
| Realtime hub (`services/realtime`) | Go — WebSocket channels, presence, WebRTC signaling |
| AI service (`services/ai`) | Python / FastAPI — SymPy step-by-step math, Arabic-aware retrieval, optional Claude |
| Shared (`packages/*`) | `shared` (schemas, DTOs, domain rules), `tokens` (design system), `i18n` (4 languages), `api-client` |

## What is inside

- **Social**: feed (For-You ranking, hashtags, polls, shares), stories, groups and communities with channels, direct/group chat (typing, read receipts, replies, reactions, files, voice notes), profiles, leaderboards, saved collections.
- **Video**: Watch (home, trending, subscriptions), Shorts, channels, playlists, watch history/later, comments, Creator Studio analytics, events with RSVP.
- **Learning**: quizzes/tests/exams with server-side grading and smart practice, flashcards (spaced repetition), study planner, Pomodoro, mastery tracking, AI tutor and math solver, document/sheet/slide workspace with Office export, forms builder, library.
- **Classrooms**: courses, assignments, grades, attendance, announcements, **live classes** (WebRTC mesh, screen share, whiteboard, hand raise, moderation, recording).
- **Design system**: 6 designs × 8 skins × light/dark (96 combinations, WCAG-AA validated), Tajawal font, RTL, text size and reduced motion.
- **Admin**: permission-gated console — users, reports, announcements/ads, subjects, daily challenges, library approvals, assistant knowledge, feature controls, site settings, error monitor, audit log.

## Quick start (development)

Requirements: Node 22+, pnpm 10, Go 1.24+ (realtime hub), Python 3.12 (optional, AI service), PostgreSQL 16 and Redis (or let the script start local ones).

```bash
pnpm install
pnpm dev            # postgres + redis → API :8787 → realtime :8788 → AI :8790 → web :5173
```

Open <http://localhost:5173>. Seed demo content with `pnpm db:seed`. Useful flags: `node scripts/dev.mjs --no-ai`, `--no-services`.

Mobile: `pnpm --filter @qubedu/mobile start` (set `EXPO_PUBLIC_API_URL` when the API is not on your LAN host).

## Everything in Docker

```bash
cp .env.example .env     # set JWT_SECRET, INTERNAL_TOKEN, ROOT_ADMIN_EMAIL
docker compose up -d --build
docker compose run --rm api node dist/seed.js   # optional demo data
```

Open <http://localhost:8080>. The web container proxies `/api`, `/files` and `/ws`. Add `--profile turn` for a TURN relay.

## Quality gates

```bash
pnpm check          # typecheck + lint + unit/integration tests
pnpm test:e2e       # Playwright against a running stack (pnpm dev)
```

| Suite | What it covers |
| --- | --- |
| `services/api` (44 tests) | Auth, social, chat privacy, groups, school, live, quizzes, platform features, admin |
| `packages/*` (40 tests) | Schemas, XP/levels, 96 theme contrasts, 4-language key parity, API client |
| `services/realtime` | Hub, presence, authorization (`go test -race`) |
| `services/ai` (22 tests) | Math solver, retrieval, essay grading |
| `apps/web` (13 tests) | Formula engine, formatting, redirects |
| `tests/e2e` (33 tests) | Auth, languages & RTL, themes, feed, polls, stories, events, groups, video upload + playback, shorts, quizzes, forms, classroom, workspace docs + spreadsheet formulas, planner, library moderation, admin console, **two-browser chat**, **WebRTC live class**, notifications, phone layout, every route |
| CI (`.github/workflows/ci.yml`) | All of the above + web/API builds + Expo bundles + Docker images |

More: [Architecture](docs/ARCHITECTURE.md) · [Features](docs/FEATURES.md) · [Deployment](docs/DEPLOYMENT.md) · [Security](docs/SECURITY.md)

---

# قبيدو

منصة **تعليمية اجتماعية**: أدوات مذاكرة، فصول دراسية وحصص مباشرة، ومجتمع فيه فيديو وقصص ومجموعات ومحادثات — على **الويب** و**أندرويد** و**iOS** بأربع لغات: **العربية والإنجليزية والفرنسية والإسبانية**.

## تشغيل سريع

```bash
pnpm install
pnpm dev     # قاعدة البيانات + Redis + الـ API + السيرفر اللحظي + الذكاء الاصطناعي + الموقع
```

افتح <http://localhost:5173>. للتشغيل الكامل بـ Docker: انسخ `.env.example` إلى `.env` ثم `docker compose up -d --build`.

التفاصيل الكاملة في [docs/](docs/).
