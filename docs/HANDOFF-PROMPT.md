# برومت لبدء شات جديد (انسخه كله كما هو)

أنت بتكمّل شغل على مشروع **Qubedu**: منصة تعليمية (ويب + موبايل Expo + API) للطلبة والمعلمين وأولياء الأمور والمدارس، بأربع لغات (en/ar/fr/es). صاحب المشروع مستخدم عربي على الموبايل، فاكتب له ردودك بالعربي المصري البسيط والمختصر، والنتيجة أولاً.

## المصدر
- المستودع: `BAHBAK206/waw-social`، الفرع `claude/app-rebuild-complete-4g5wqw` (الشغل الأساسي). نسخة مرتبة منه في `BAHBAK206/qubedu-2`.
- لا تفتح Pull Request إلا لو طلب. بعد كل commit اعمل push بـ `git push -u origin claude/app-rebuild-complete-4g5wqw` (أعد المحاولة بتأخير 2/4/8/16 ثانية لو فشل الاتصال).
- نهاية كل commit: السطرين اللي في تعليمات النظام (Co-Authored-By وClaude-Session).
- ملف `docs/FEATURES.md` فيه قائمة المميزات، و`docs/REPORT-AR.md` التقرير الكامل بالعربي، و`docs/DEPLOYMENT.md` للنشر.

## البنية
- مونوريبو pnpm: `packages/shared` (zod + منطق نقي + vitest)، `packages/i18n` (4 لغات + أدلة الاستخدام، وتستخدم صيغة `{{var}}`، والجمع ICU `{count, plural, ...}`)، `packages/api-client`، `services/api` (Hono + Drizzle + Postgres)، `services/ai` (FastAPI)، `services/realtime` (Go)، `apps/web` (Vite React)، `apps/mobile` (Expo Router)، `tests/e2e` (Playwright).
- الهجرات: من `services/api` شغّل `pnpm -s db:generate --name X`. تتطبق عند تشغيل السيرفر. لا تعيد توليد هجرة بعد ما تتطبق على قاعدة التطوير.
- بيئة محلية: `bash scripts/local-services.sh start` (Postgres/Redis). اختبارات السيرفر: `cd services/api && DATABASE_URL=postgres://postgres@localhost:5432/qubedu_test npx vitest run`. فحص قبل أي commit: `pnpm -s format && pnpm -s lint && pnpm typecheck`.
- كل ميزة جديدة تحتاج: جدول/هجرة، API، api-client، واجهة ويب، واجهة موبايل (أو فتح الشاشة الثقيلة في متصفح داخل التطبيق عبر `openWebSignedIn`)، ترجمة بالأربع لغات، دليل استخدام (لو فيها صفحة)، اختبارات، وسطر في FEATURES.md.

## اللي اتعمل
كل المجموعات من G1 إلى K8 خلصت واتجرّبت (اختبارات السيرفر 132، المشتركة 100، اللغات 21، الذكاء الاصطناعي 33، المتصفح 83). آخرها: K6 الأمان والرفاهية، K7 الدخل والنمو (كوبونات، دروس خصوصية مدفوعة، باقات مدارس، ملف إنجاز عام، دعوة أصدقاء)، K8 الإتاحة والتشغيل (اختبارات بدون نت، بحث صوتي، صحة النظام، توفير بيانات، نسخة احتياطية للمدرسة).

## شغل جولة L1 (أمان وأخطاء) — اتعمل ومش متختبر كله
عدّلت ومرّت عليها الاختبارات الموجودة (132) لكن **لسه ما كتبتش اختبارات جديدة ليها**:
1. `services/api/src/lib/http.ts`: صندوق الشكاوى السرية (`/wellbeing/complaints`) مستثنى من فلتر المحتوى، لأن الطفل لازم يقدر يكرّر تهديد اتقال له.
2. `lib/growth.ts` + `routes/catalog.ts`: `claimCouponUse` ذرّية، عشان طالبين متزامنين ما ياخدوش آخر استخدام لكود 100%.
3. هجرة `0034_lesson_payer.sql` وعمود `private_lessons.payer_id`: لو دفع وصل بعد ما الموعد اتحرّر، يرجع للدافع لو لسه فاضي، وإلا يتبلّغ ويتسجّل (نوع إشعار جديد `lesson_payment_issue` مترجم).
4. `routes/offline.ts`: تنزيل اختبار تابع لفصل ممنوع إلا بعد ما الطالب يخلّصه مرة (عشان ما يشوفش الإجابات قبل الواجب).
**اكتب اختبارات** لـ 1–4 (في `services/api/test/growth.test.ts` و`offline.test.ts`)، وشغّل كل الاختبارات، وبعدين commit وpush.
جملة تهديد يمنعها الفلتر للاختبار: `just kill yourself`.

## اللي لسه (بالترتيب)
- **L1 تكملة**: تدقيق أمان ثاني للمسارات الجديدة (IDOR، صلاحيات، حدود معدّل، سباقات)، ومعروف إن قفل الوقت للأطفال (`UsageGuard`) يتجاوز بتعديل الواجهة (قيد معروف).
- **L2 أساس أقوى**: فهارس قاعدة البيانات، استعلامات N+1، معالجة الأخطاء، اختبارات ناقصة، ومراجعة الأداء.
- **L3 مميزات جديدة للطالب**: اقترح قائمة قصيرة على صاحب المشروع، ثم نفّذها.
- **L4 تغذية الذكاء الاصطناعي المحلي**: بمحتوى المنهج والمصطلحات وامتحانات السنين اللي فاتت ومعرفة الفصول (`services/api/src/db/seed-data/assistant-knowledge.json` وجدول المعرفة).
- في الآخر: حدّث `docs/FEATURES.md` و`docs/REPORT-AR.md`، وابنِ ملفات التسليم (`pnpm -s build:cloudflare` ثم ضغط `apps/web/dist`، و`git archive --format=zip --prefix=qubedu/ -o qubedu-source.zip HEAD`).

## قرارات مفتوحة مع صاحب المشروع (لا تغيّرها من غير ما يوافق)
1. **ملفات Firebase** (مشروع `qubedu-com`، للإشعارات فقط): سجّلها بأسماء `Qubedu.com.app` (أندرويد) و`Qubedu` (آيفون)، بينما التطبيق اسمه `app.qubedu.mobile`. الاسم بيتثبت للأبد عند النشر. الموصى به: يسجّل تطبيقين جداد في Firebase باسم `app.qubedu.mobile` ويبعتلك الملفين، وبعدها اربطهم في `apps/mobile/app.config.ts` (`googleServicesFile`). Firebase Analytics لا تُفعَّل (تطبيق فيه أطفال). ومفتاح FCM v1 يُرفع على EAS من صاحب المشروع.
2. **الاستضافة**: ما عندوش فلوس لسيرفر. الخطة المؤقتة المجانية: جهاز ويندوز (12 جيجا رام) + Docker Desktop + `docker compose up -d --build` + Cloudflare Tunnel من دومين `qubedu.com` لـ `http://localhost:8080` (خادم nginx في الـ compose بيقدّم الموقع والـ API معاً، فمش محتاج Cloudflare Pages). في `.env` اضبط `APP_URL` و`API_PUBLIC_URL` على `https://qubedu.com` و`REALTIME_PUBLIC_URL=wss://qubedu.com/ws` و`CORS_ORIGINS` و`TRUST_PROXY_HOPS=2`. من غير SMTP رسائل التفعيل ونسيان كلمة السر مش بتتبعت.
3. **ملف APK**: ما اتبنّاش لأن الوصول لـ `dl.google.com` ممنوع في بيئة العمل.

## ملاحظات صريحة
- دفع Paymob اتجرّب بسيرفر محاكاة فقط، وتصحيح الأوراق بالصور (OCR) محتاج tesseract (في Dockerfile ولم يُجرَّب هنا).
- على الآيفون الدفع داخل التطبيق مخفي (قواعد Apple).
- ملفات `.env` والمفاتيح أسرار: لا تطلبها ولا تكتبها في أي ملف يُرفع.
