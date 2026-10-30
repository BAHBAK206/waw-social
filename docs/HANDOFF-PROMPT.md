# البرومت الكامل لبدء شات جديد (انسخه كله كما هو)

أنت بتكمّل شغل على مشروع **Qubedu**: منصة تعليمية (ويب + موبايل Expo + API) للطلبة والمعلمين وأولياء الأمور والمدارس بأربع لغات (en/ar/fr/es). صاحب المشروع مستخدم عربي على الموبايل واللابتوب، ومعاه ميزانية صغيرة جداً. اكتب له بالعربي المصري البسيط والمختصر، والنتيجة أولاً، وخطوات التشغيل أمر واحد في كل رسالة وهو ينسخه ويلصقه، ولا تسأله أسئلة فنية.

## المصدر والقواعد
- المستودع `BAHBAK206/waw-social`، الفرع `claude/app-rebuild-complete-4g5wqw` (الشغل الأساسي). نسخة مرتبة في `BAHBAK206/qubedu-2`.
- لا Pull Request إلا لو طلب. بعد كل commit: `git push -u origin claude/app-rebuild-complete-4g5wqw` (أعد المحاولة بتأخير 2/4/8/16 ثانية). نهاية رسالة كل commit: سطرا Co-Authored-By وClaude-Session اللي في تعليمات النظام.
- لا تطلب ولا تكتب أسرار (`.env`، مفاتيح Paymob/FCM/Cloudflare) في أي ملف أو رسالة.
- الأسماء الثابتة لا تتغير بدون موافقته: معرّف التطبيق `app.qubedu.mobile`، الدومين `qubedu.com`.
- الملفات المرجعية: `docs/FEATURES.md` (المميزات)، `docs/REPORT-AR.md` (التقرير بالعربي)، `docs/DEPLOYMENT.md` (النشر)، `infra/cloudflare/`، `apps/mobile/store/STORE-AR.md`.

## البنية
مونوريبو pnpm: `packages/shared` (zod + منطق نقي + vitest)، `packages/i18n` (4 لغات + الأدلة؛ `{{var}}` للمتغيرات، والجمع ICU `{count, plural, ...}` داخل المفتاح فقط)، `packages/api-client`، `services/api` (Hono + Drizzle + Postgres)، `services/ai` (FastAPI)، `services/realtime` (Go)، `apps/web` (Vite React)، `apps/mobile` (Expo Router)، `tests/e2e` (Playwright).
- الهجرات: من `services/api` شغّل `pnpm -s db:generate --name X`. تتطبق عند تشغيل السيرفر. لا تعيد توليد هجرة بعد ما اتطبقت على قاعدة التطوير.
- بيئة محلية: `bash scripts/local-services.sh start`. اختبارات السيرفر: `cd services/api && DATABASE_URL=postgres://postgres@localhost:5432/qubedu_test npx vitest run`. e2e: شغّل المكدس ثم `cd tests/e2e && npx playwright test`. قبل أي commit: `pnpm -s format && pnpm -s lint && pnpm typecheck`.
- كل ميزة جديدة تحتاج: جدول/هجرة، API، api-client، واجهة ويب، واجهة موبايل (أو فتح الشاشة الثقيلة في متصفح داخل التطبيق عبر `openWebSignedIn`)، ترجمة بالأربع لغات، دليل استخدام لو فيها صفحة، اختبارات، وسطر في FEATURES.md.

## اللي خلص (G1 حتى K8)
كل المجموعات اتنفذت واتجرّبت: اختبارات السيرفر 132، المشتركة 100، اللغات 21، الذكاء الاصطناعي 33، المتصفح 83. آخر ثلاث مجموعات: K6 الأمان والرفاهية، K7 الدخل والنمو، K8 الإتاحة والتشغيل.

## المرحلة أ: إنهاء جولة L1 (أمان وأخطاء)
اتعمل في الكود وعدّت عليه الاختبارات الموجودة، **لكن لسه ما اتكتبتش له اختبارات**:
1. صندوق الشكاوى السرية (`/wellbeing/complaints`) مستثنى من فلتر المحتوى في `lib/http.ts` (الطفل لازم يكرّر التهديد). اختبر بجملة `just kill yourself`.
2. `claimCouponUse` ذرّية في `lib/growth.ts` ومستخدمة في `routes/catalog.ts` (طالبين متزامنين على آخر استخدام لكود 100%).
3. الهجرة `0034_lesson_payer.sql` وعمود `payer_id`: دفع متأخر بعد تحرير الموعد يرجع للدافع أو يتبلّغ (إشعار `lesson_payment_issue`).
4. `routes/offline.ts`: لا تنزيل لاختبار تابع لفصل إلا بعد ما الطالب يخلّصه.
اكتب اختبارات لها في `services/api/test/growth.test.ts` و`offline.test.ts`، ثم شغّل كل الاختبارات وcommit وpush.
ثم أكمل التدقيق الأمني للمسارات الجديدة: IDOR، الصلاحيات، حدود المعدّل، السباقات (race)، مسارات `GET /portfolio/public/:slug` و`/offline` و`/lessons` و`/coupons` و`/schools/:id/export`. قيد معروف: قفل وقت الاستخدام للطفل (`UsageGuard`) من جهة الواجهة فقط.

## المرحلة ب: أساس قوي وتنظيم
- **البنية والتنظيم:** راجع تقسيم الملفات الكبيرة (مثل `routes/quizzes.ts` و`db/schema.ts` و`locales/en.ts`)، وحدّد حدود واضحة بين المسارات والمنطق، وأزل الكود الميت والتكرار، ووحّد أسماء المفاتيح والمسارات.
- **التصميم:** راجع اتساق التصميم بين الويب والموبايل (الألوان، المسافات، الحالات الفارغة، الأخطاء، التحميل)، والوصولية (تباين، قارئ الشاشة، RTL)، وجرّب الأربع لغات.
- **الأداء:** فهارس قاعدة البيانات، استعلامات N+1، التخزين المؤقت، حجم حزمة الويب، تحميل الصور.
- **الاعتماديات والتحديث:** `pnpm audit`، حدّث الحزم الآمنة (بشرط عمر الحزمة أسبوعين على الأقل)، وثبّت الإصدارات، وراجع GitHub Actions (`.github/workflows`).
- **الجودة:** غطّ الاختبارات الناقصة، وأضف اختبارات تكامل لمسارات الدفع والـ webhooks، واختبار حمل بسيط (k6 أو autocannon).

## المرحلة ج: مميزات جديدة للطالب (اقترح قائمة قصيرة ثم نفّذ)
أفكار: مراجعة قبل الامتحان بخطة تلقائية حسب الأضعف، تحدي يومي، تتبّع الأهداف والعادات، سجل أخطاء قابل للبحث، ملاحظات مرتبطة بالدروس، بطاقات مذاكرة من الأسئلة الغلط تلقائياً، مجتمعات مواد، شاشة "اليوم" واحدة تجمع كل شيء، إشعارات ذكية قبل الامتحان، وضع مذاكرة ليلي، وتقارير تقدّم للأهل بسيطة. نفّذ بالترتيب اللي يختاره صاحب المشروع.

## المرحلة د: تغذية الذكاء الاصطناعي المحلي
غذّ المساعد بمحتوى المنهج (`curriculum`)، والمصطلحات (`glossary`)، وامتحانات السنين السابقة، ومعرفة كل فصل (المواد المرفوعة)، والأسئلة الشائعة. المكان: `services/api/src/db/seed-data/assistant-knowledge.json` وجدول المعرفة وواجهة إدارة معرفة المساعد. اختبر جودة الإجابات (أسئلة ذهبية بنتائج متوقعة) في `services/ai` و`services/api/test`.

## المرحلة هـ: اختبارات نهائية للأمان والتشغيل (قبل أي نشر حقيقي)
- **أمان:** قائمة OWASP (حقن، XSS، CSRF، SSRF، IDOR، رفع الملفات، المصادقة والجلسات والـ 2FA، حدود المعدّل، رؤوس الأمان وCSP)، فحص الأسرار في الـ git، `pnpm audit`، فحص صور Docker (trivy لو متاح)، وحماية الأطفال (تحت 13 و18).
- **تشغيل:** النسخ الاحتياطي والاستعادة تجربة فعلية (`scripts/backup.sh` و`restore.sh`)، إعادة تشغيل الخدمات، سلوك السيرفر عند وقوع قاعدة البيانات أو Redis أو خدمة الذكاء، فحص `/health`، لوحة صحة النظام في الإدارة.
- **اختبارات شاملة:** كل الاختبارات (السيرفر، المشتركة، اللغات، الذكاء Python، e2e الكامل)، وتطابق اللغات، وتجربة يدوية للمسارات الأساسية (طالب، معلم، ولي أمر، مدير مدرسة، مدير منصة).
- سجّل النتائج في `docs/REPORT-AR.md` بأرقام حقيقية وصراحة عن اللي ما اتجرّبش.

## المرحلة و: تكملة التثبيت والنشر (بعد ما الكود يخلص)
**حالة التثبيت الحالية:** صاحب المشروع ما عندوش سيرفر مدفوع. بيجرّب التشغيل المجاني على لابتوب ويندوز بنسخة **Windows 10 Enterprise LTSC 21H2 (build 19044)** و12 جيجا رام. Docker Desktop رفض التثبيت (يشترط 22H2). فمشينا على WSL2:
- اتفعّل `Microsoft-Windows-Subsystem-Linux` و`VirtualMachinePlatform` وعُمل Restart، واتنفّذ `wsl --set-default-version 2` بنجاح، و`wsl --update --web-download` اتنفّذ.
- **الخطوة المتوقفة:** تثبيت Ubuntu بـ `wsl --install -d Ubuntu --web-download` (انقطع الشحن في نص الطريق). ابدأ بطلب نتيجة `wsl --list --verbose`.
- بعد ظهور Ubuntu وتعيين اسم مستخدم وباسورد: داخل Ubuntu شغّل `sudo apt update && curl -fsSL https://get.docker.com | sudo sh && sudo usermod -aG docker $USER` (وافتح نافذة جديدة)، وفعّل systemd عبر `/etc/wsl.conf` (`[boot]` ثم `systemd=true`) و`wsl --shutdown`.
- نزّل المشروع داخل Ubuntu (`git clone` أو من ZIP) وشغّل `bash scripts/linux-setup.sh qubedu.com <إيميله>` (يكتب `.env` بأسرار عشوائية ويشغّل `docker compose up -d --build`)، وجرّب `http://localhost:8080`.
- اربط الدومين بـ **Cloudflare Tunnel** (مجاني): نزّل `cloudflared` لويندوز، Zero Trust ← Networks ← Tunnels ← Public hostname `qubedu.com` ← `http://localhost:8080`. شغّل `wsl -d Ubuntu -e sleep infinity` كمهمة عند الدخول (Task Scheduler) عشان WSL مايقفلش، وخلّي ويندوز مايناميش.
- `.env` على السيرفر: `APP_URL` و`API_PUBLIC_URL=https://qubedu.com` و`REALTIME_PUBLIC_URL=wss://qubedu.com/ws` و`CORS_ORIGINS` و`TRUST_PROXY_HOPS=2`. بدون SMTP رسائل التفعيل ونسيان كلمة السر لا تصل: اقترح مزوّد بريد بخطة مجانية.
- الخيارات الدائمة بعدين: Oracle Cloud Always Free (مجاني لو متاح)، أو VPS رخيص (Hetzner CX بحوالي 4–6 يورو، تأكد من السعر)، وانقل البيانات بـ `scripts/backup.sh` و`restore.sh`.

**الموبايل والإشعارات:**
- **Firebase** (مشروع `qubedu-com`، للإشعارات فقط): الملفات اللي بعتها مسجّلة بـ `Qubedu.com.app` (أندرويد) و`Qubedu` (آيفون) وده يختلف عن `app.qubedu.mobile`. الموصى به: يسجّل تطبيقين جداد في Firebase بالمعرّف `app.qubedu.mobile` ويبعتلك الملفين، وتربطهم في `apps/mobile/app.config.ts` (`googleServicesFile`). لا تفعّل Firebase Analytics (التطبيق فيه أطفال). ومفتاح FCM v1 يرفعه صاحب المشروع بنفسه على EAS.
- **ملف APK:** ما اتبنّاش لأن `dl.google.com` ممنوع في بيئة العمل. يبنيه من جهازه: `cd apps/mobile && npx eas init` ثم `QUBEDU_API_URL=https://qubedu.com QUBEDU_WEB_URL=https://qubedu.com npx eas build --platform android --profile preview`. المتاجر: جوجل بلاي رسم مرة واحدة تقريباً 25 دولار، وآبل تقريباً 99 دولار في السنة (تأكد منها). على الآيفون الدفع داخل التطبيق مخفي بحسب قواعد Apple.
- **الدفع:** مفاتيح Paymob الحقيقية و`PLATFORM_TRANSFER_INFO` لباقات المدارس. Paymob اتجرّب بسيرفر محاكاة فقط.
- **الذكاء:** `ANTHROPIC_API_KEY` اختياري. تصحيح الورق بالصور (OCR) محتاج tesseract (في Dockerfile ولم يُجرَّب).

## ختام كل مرحلة
حدّث `docs/FEATURES.md` و`docs/REPORT-AR.md`، وابنِ ملفات التسليم: `pnpm -s build:cloudflare` ثم ضغط `apps/web/dist`، و`git archive --format=zip --prefix=qubedu/ -o qubedu-source.zip HEAD`، وابعتها له، وردّ بالعربي مختصراً مع ذكر أي قيود (مثل: APK، Paymob، OCR، شاشات المدير على الموبايل بتفتح في متصفح داخل التطبيق).
