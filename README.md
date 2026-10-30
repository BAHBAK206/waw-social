# Qubedu

An **educational platform** where every feature serves learning: study tools, classrooms and live classes, video lessons, a study hall for questions and notes, study groups and a pronunciation lab — on the **web**, **Android** and **iOS**, in **Arabic, English, French and Spanish**.

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

- **Study hall**: discussions, **questions** with a subject, ranked answers, *helpful* votes, teacher badges and a best answer that rewards the helper with XP, plus shared **study notes**; class polls, study tips (24 h), study groups and subject communities, chat, profiles, top learners, bookmarks.
- **Video lessons**: lessons and one-minute lessons by subject, a clickable **lesson outline** from timestamps, a **checkpoint quiz** offered when the lesson ends, **private timestamped notes**, lesson series, study-later, teaching studio analytics, workshops and revision sessions with RSVP.
- **Pronunciation lab**: listen (normal/slow), speak, get a word-by-word score in Arabic, English, French or Spanish (re-scored on the server, XP and weak-word tracking); **read aloud** on posts, answers, quiz questions, flashcards and tutor replies (web and mobile).
- **Learning**: quizzes/tests/exams with server-side grading and smart practice, flashcards (spaced repetition), study planner, Pomodoro, mastery tracking, AI tutor and math solver, document/sheet/slide workspace with Office export, forms builder, library.
- **Classrooms**: courses, assignments, grades, attendance, announcements, **live classes** (WebRTC mesh, screen share, whiteboard, hand raise, moderation, recording).
- **Languages**: 4 locales with ICU plurals (all six Arabic forms) and RTL.
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
| `services/api` (47 tests) | Auth, study hall Q&A, chat privacy, groups, school, live, quizzes, video lessons (linked quiz, notes), pronunciation, admin |
| `packages/*` (51 tests) | Schemas, XP/levels, pronunciation scoring, lesson outlines, 96 theme contrasts, 4-language key parity + plurals, API client |
| `services/realtime` | Hub, presence, authorization (`go test -race`) |
| `services/ai` (22 tests) | Math solver, retrieval, essay grading |
| `apps/web` (13 tests) | Formula engine, formatting, redirects |
| `tests/e2e` (37 tests) | Auth, languages & RTL, themes, study hall Q&A + best answer, pronunciation lab, polls, study tips, workshops, groups, video lesson upload + playback, lesson outline/notes/checkpoint quiz, quiz editor, shorts, quizzes, forms, classroom with grading, flashcards, workspace docs + spreadsheet formulas, planner, library moderation, admin console, **two-browser chat**, **WebRTC live class**, notifications, phone layout, every route |
| CI (`.github/workflows/ci.yml`) | All of the above + web/API builds + Expo bundles + Docker images |

More: [Architecture](docs/ARCHITECTURE.md) · [Features](docs/FEATURES.md) · [Deployment](docs/DEPLOYMENT.md) · [Security](docs/SECURITY.md)

---

# قبيدو

منصة **تعليمية** كل ميزة فيها تخدم التعلّم: أدوات مذاكرة، فصول دراسية وحصص مباشرة، دروس مرئية بأقسام واختبار بعد الدرس وملاحظات، ساحة نقاش للأسئلة والملخصات مع أفضل إجابة، مجموعات مذاكرة، ومعمل للنطق — على **الويب** و**أندرويد** و**iOS** بأربع لغات: **العربية والإنجليزية والفرنسية والإسبانية**.

## تشغيل سريع

```bash
pnpm install
pnpm dev     # قاعدة البيانات + Redis + الـ API + السيرفر اللحظي + الذكاء الاصطناعي + الموقع
```

افتح <http://localhost:5173>. للتشغيل الكامل بـ Docker: انسخ `.env.example` إلى `.env` ثم `docker compose up -d --build`.

التفاصيل الكاملة في [docs/](docs/).
