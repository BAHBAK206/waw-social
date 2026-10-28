# رفع موقع Qubedu على Cloudflare Pages

Cloudflare Pages بيستضيف **الموقع** نفسه. أما جزء السيرفر (الـ API والحصص المباشرة والذكاء الاصطناعي وقاعدة البيانات)
فبيفضل شغال على سيرفرك بـ `docker compose`. فيه ملف صغير اسمه `_worker.js` بيحوّل `/api` و`/files` و`/ws` و`/webhooks`
للسيرفر بتاعك، فالمتصفح يشوف عنوان واحد، وتسجيل الدخول ورفع الملفات والحصص المباشرة يشتغلوا عادي.

## الطريقة 1 — من GitHub تلقائيًا (الأسهل)

1. في Cloudflare: ‏Workers & Pages ← Create ← Pages ← ‏**Direct upload** وسمّي المشروع `qubedu` (ارفع أي ملف مرة واحدة، وبعدين GitHub هيستبدله).
2. في المشروع: ‏Settings ← Variables and Secrets ← أضف `BACKEND_ORIGIN` = عنوان سيرفرك (مثل `https://server.example.com`).
3. في مستودع GitHub ‏(qubedu-2): ‏Settings ← Secrets and variables ← Actions ← أضف:
   - `CLOUDFLARE_API_TOKEN`: توكن من Cloudflare بصلاحية *Cloudflare Pages: Edit*
   - `CLOUDFLARE_ACCOUNT_ID`: رقم حسابك في Cloudflare
4. اعمل push على `main` أو شغّل **Deploy web to Cloudflare Pages** من تبويب Actions، وهيتبني ويترفع لوحده.

## الطريقة 2 — ربط المستودع من Cloudflare مباشرة

‏Workers & Pages ← Create ← Pages ← ‏**Connect to Git** ← اختر المستودع، وبعدين:

| الإعداد | القيمة |
| --- | --- |
| Framework preset | None |
| Build command | `npx pnpm@10.28.0 install --frozen-lockfile --filter "@qubedu/web..." && npx pnpm@10.28.0 build:cloudflare` |
| Build output directory | `apps/web/dist` |
| Environment variables | `NODE_VERSION=22` و`SKIP_DEPENDENCY_INSTALL=1` و`BACKEND_ORIGIN=https://عنوان-سيرفرك` |

## الطريقة 3 — رفع الملفات الجاهزة يدويًا

فك ضغط `qubedu-web-cloudflare.zip` وارفع محتواه، أو استخدم:
`npx wrangler pages deploy <المجلد> --project-name qubedu`
وماتنساش تضيف `BACKEND_ORIGIN` في إعدادات المشروع.

## على السيرفر

في ملف `.env` على السيرفر خلّي `APP_URL` و`CORS_ORIGINS` = عنوان موقعك على Cloudflare (مثل `https://qubedu.pages.dev` أو دومينك)،
واترك `REALTIME_PUBLIC_URL` فاضي عشان الحصص المباشرة تتصل من خلال `/ws` على نفس العنوان.
وكمان في `.env` على السيرفر خلّي `TRUST_PROXY_HOPS=2` (Cloudflare + nginx) عشان حماية التكرار تشوف عنوان كل زائر الحقيقي.
