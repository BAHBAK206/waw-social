# تجهيز Qubedu للمتاجر (Google Play و App Store)

هذا الملف يجمع كل ما تحتاجه لرفع التطبيق: الإعدادات، نصوص صفحة المتجر بأربع لغات، وإجابات نماذج الخصوصية، وملاحظات المراجعة.

## 1. قبل أول بناء

1. أنشئ حساب Expo ثم نفّذ داخل `apps/mobile`:
   - `npx eas init` (يضيف معرّف المشروع، وهو لازم للإشعارات).
2. في لوحة EAS ← Environment variables أضف:
   - `QUBEDU_API_URL` = عنوان الـ API العام (مثل `https://api.example.edu`).
   - `QUBEDU_WEB_URL` = عنوان الموقع (مثل `https://example.edu`).
   - `EAS_PROJECT_ID` = المعرّف الناتج من الخطوة 1.
   - بناء `production` يتوقف برسالة واضحة إذا كان `QUBEDU_API_URL` غير مضبوط، حتى لا يصدر تطبيق يشير إلى localhost.
3. الإشعارات:
   - Android: ارفع ملف FCM (google-services) في EAS ← Credentials.
   - iOS: يُنشئ EAS مفتاح APNs تلقائيًا عند أول بناء.
4. البناء والرفع:
   - تجربة داخلية (APK): `npx eas build -p android --profile preview`
   - إصدار المتجر: `npx eas build -p android --profile production` و `npx eas build -p ios --profile production`
   - الرفع: `npx eas submit -p android` و `npx eas submit -p ios`
   - رقم الإصدار يزيد تلقائيًا مع كل بناء production.

## 2. ما تم تجهيزه في الكود

- معرّف الحزمة: `app.qubedu.mobile` (Android و iOS). غيّره في `app.json` إذا كان لديك نطاق آخر قبل أول رفع، لأنه لا يتغيّر بعد النشر.
- نصوص أذونات الكاميرا والصور والميكروفون والتعرف على الكلام بالعربية والإنجليزية والفرنسية والإسبانية (`locales/*.json`).
- ملف خصوصية Apple (Privacy Manifest) بأسباب استخدام الواجهات المطلوبة، ولا تتبّع إعلاني.
- `usesNonExemptEncryption: false` (التطبيق يستخدم HTTPS فقط)، فلا يُطلب منك نموذج التشفير في كل إصدار.
- منع أذونات Android غير اللازمة (التخزين القديم، الظهور فوق التطبيقات، حالة الهاتف).
- حذف الحساب من داخل التطبيق: الإعدادات ← البيانات. وصفحة الخصوصية العامة تشرح الحذف دون التطبيق (مطلوب من Google).
- أدوات المحتوى الذي ينشئه المستخدمون (شرط Apple 1.2): الإبلاغ عن المنشورات والتعليقات والرسائل والملفات الشخصية، والحظر، وقائمة المحظورين، وفلتر الكلمات، وإخفاء تلقائي بعد عدة بلاغات، ومراجعة المشرفين.

## 3. نصوص صفحة المتجر

### العربية
- **الاسم (30 حرفًا كحد أقصى):** Qubedu – تعلّم وصفّك
- **الوصف القصير (80):** صفوف ودروس فيديو واختبارات وبطاقات مراجعة ومساعد دراسة في مكان واحد
- **الوصف الكامل:**
  Qubedu منصة تعليمية للطلاب والمعلمين وأولياء الأمور.
  • الصف: واجبات وتسليم ودرجات وحضور وإعلانات، واستيراد قائمة الطلاب من ملف CSV.
  • دروس الفيديو: فصول وترجمة ونص كامل قابل للبحث واختبار بعد الدرس، وتنزيل الدروس للمشاهدة دون إنترنت.
  • المذاكرة: بطاقات مراجعة ذكية تعمل دون اتصال، وخطة يومية، وامتحانات، ومؤقّت تركيز.
  • مختبر النطق: اقرأ بصوتك واحصل على تقييم فوري.
  • للمعلم: مساعد يقترح اختبارات وملخصات من الدرس، ولوحة «من يحتاج مساعدة».
  • لوليّ الأمر: تقرير أسبوعي عن وقت المذاكرة والواجبات والنتائج بعد موافقة الطالب.
  • دوري أسبوعي وشهادات قابلة للتحقق.
  • أمان: حماية خاصة لمن هم دون 18 عامًا، وإبلاغ وحظر وفلتر محتوى.
  • تباين عالٍ وخط مناسب لعسر القراءة، وأربع لغات.

### English
- **Name:** Qubedu – Learn & Class
- **Short description:** Classes, video lessons, quizzes, flashcards and a study helper in one app
- **Full description:**
  Qubedu is a learning platform for students, teachers and parents.
  • Classes: homework, submissions, grades, attendance, announcements, and class lists imported from CSV.
  • Video lessons: chapters, captions, a searchable transcript, a quiz after the lesson, and downloads for offline viewing.
  • Study: smart flashcards that work offline, a daily plan, exams and a focus timer.
  • Pronunciation lab: read aloud and get instant feedback.
  • For teachers: an assistant that drafts quizzes and summaries from a lesson, and a “who needs help” view.
  • For parents: a weekly report on study time, homework and results, with the student’s consent.
  • Weekly leagues and verifiable certificates.
  • Safety: extra protection for under-18s, reporting, blocking and a content filter.
  • High contrast, a dyslexia-friendly font, and four languages.

### Français
- **Nom :** Qubedu – Apprendre en classe
- **Description courte :** Classes, leçons vidéo, quiz, cartes de révision et aide aux devoirs
- **Description complète :**
  Qubedu est une plateforme d’apprentissage pour élèves, enseignants et parents.
  • Classes : devoirs, rendus, notes, présences, annonces et import de listes d’élèves en CSV.
  • Leçons vidéo : chapitres, sous-titres, transcription consultable, quiz après la leçon et téléchargement hors ligne.
  • Révisions : cartes intelligentes hors ligne, plan du jour, examens et minuteur de concentration.
  • Labo de prononciation : lisez à voix haute et obtenez un retour immédiat.
  • Pour les enseignants : un assistant qui prépare quiz et résumés, et la vue « qui a besoin d’aide ».
  • Pour les parents : un bilan hebdomadaire avec l’accord de l’élève.
  • Ligues hebdomadaires et certificats vérifiables.
  • Sécurité : protection des moins de 18 ans, signalement, blocage et filtre de contenu.
  • Contraste élevé, police adaptée à la dyslexie, quatre langues.

### Español
- **Nombre:** Qubedu – Aprende en clase
- **Descripción breve:** Clases, lecciones en vídeo, cuestionarios, tarjetas y ayuda para estudiar
- **Descripción completa:**
  Qubedu es una plataforma de aprendizaje para estudiantes, docentes y familias.
  • Clases: tareas, entregas, notas, asistencia, avisos e importación de listas de alumnos en CSV.
  • Lecciones en vídeo: capítulos, subtítulos, transcripción con búsqueda, cuestionario final y descarga para ver sin conexión.
  • Estudio: tarjetas inteligentes sin conexión, plan diario, exámenes y temporizador de concentración.
  • Laboratorio de pronunciación: lee en voz alta y recibe una valoración al instante.
  • Para docentes: un asistente que prepara cuestionarios y resúmenes, y la vista «quién necesita ayuda».
  • Para familias: un informe semanal con el consentimiento del estudiante.
  • Ligas semanales y certificados verificables.
  • Seguridad: protección para menores de 18, denuncias, bloqueo y filtro de contenido.
  • Alto contraste, letra para dislexia y cuatro idiomas.

**التصنيف:** تعليم (Education). **الكلمات المفتاحية (iOS):** تعليم,صف,واجبات,اختبار,مذاكرة,بطاقات,نطق,معلم,طالب,دروس

## 4. نموذج «أمان البيانات» في Google Play

| النوع | يُجمع؟ | الغرض | ملاحظات |
|---|---|---|---|
| الاسم والبريد ومعرّف المستخدم | نعم | إدارة الحساب، وظائف التطبيق | مطلوب |
| الصور والفيديو والملفات | نعم (اختياري) | وظائف التطبيق | ما يرفعه المستخدم فقط |
| التسجيلات الصوتية | نعم (اختياري) | وظائف التطبيق | الملاحظات الصوتية؛ تقييم النطق يتم على الجهاز |
| الرسائل داخل التطبيق | نعم | وظائف التطبيق | |
| المحتوى الذي ينشئه المستخدم | نعم | وظائف التطبيق | |
| سجل الدفع | نعم (للدورات المدفوعة) | وظائف التطبيق | بيانات البطاقة لدى Stripe فقط |
| نشاط التطبيق (التقدم، النتائج) | نعم | وظائف التطبيق، التحليلات داخل المنصة | لا يُشارك للإعلانات |
| سجلات الأعطال | نعم | التشخيص | دون محتوى الرسائل |
| معرّفات الجهاز | رمز الإشعارات فقط | الإشعارات | |
| الموقع، جهات الاتصال، الإعلانات | لا | — | |

- البيانات مشفّرة أثناء النقل: **نعم**.
- يمكن طلب حذف البيانات: **نعم** (داخل التطبيق وعبر صفحة التواصل).
- مشاركة مع أطراف ثالثة لأغراض إعلانية: **لا**.
- رابط الحذف المطلوب: `https://<موقعك>/privacy` (قسم «تحكّمك في بياناتك»).

## 5. ملصقات الخصوصية في App Store

- **بيانات مرتبطة بالمستخدم:** معلومات الاتصال (الاسم، البريد)، المحتوى (صور، فيديو، صوت، رسائل، محتوى آخر)، المشتريات، المعرّفات (معرّف المستخدم)، بيانات الاستخدام (تفاعل داخل المنتج)، التشخيص (أعطال).
- **التتبّع:** لا.
- **الغرض:** وظائف التطبيق، وللتشخيص فقط ضمن «تحليلات» داخلية.

## 6. التصنيف العمري والمراجعة

- Google (IARC): تعليم، يحتوي محتوى ينشئه المستخدمون مع تواصل بين المستخدمين، وأدوات إشراف وإبلاغ وحظر. لا عنف ولا مقامرة.
- Apple: 12+ غالبًا بسبب التواصل بين المستخدمين (أجب: «محتوى غير مقيّد ينشئه المستخدمون»: نعم مع الإشراف).
- إذا استهدفت الأطفال دون 13 كفئة أساسية فستنطبق سياسات «العائلات/الأطفال» الأشد؛ الأنسب اختيار جمهور 13+ مع حماية القُصّر الموجودة.

**ملاحظات للمراجِع (App Review notes):**
> Demo accounts: student `review.student@your-domain` and teacher `review.teacher@your-domain`, password `…` (create them before submitting).
> Report: long-press a message or use the ⋯ menu on posts, comments and profiles. Block: profile ⋯ → Block. Blocked list: Settings → Privacy.
> Account deletion: Settings → Data → Delete account.
> The iOS app does not sell anything: paid courses can't be bought on iPhone (only a school or teacher code can be entered).

> الدفع: Apple تشترط الشراء داخل التطبيق للمحتوى الرقمي، لذلك زر الشراء **مخفي على iPhone** ويظهر بدلًا منه سطر يشرح أنه لا يمكن الشراء من التطبيق، مع بقاء خانة رمز المدرسة. على Android يعمل الدفع عبر Stripe في المتصفح. (ملاحظة: Google قد تطلب «Google Play Billing» للمحتوى الرقمي في بعض الدول؛ راجع سياسة الدفع قبل تفعيل الدورات المدفوعة على Android.)

## 7. قائمة لقطات الشاشة

هاتف (1080×1920 أو أعلى) لكل لغة تريدها: الرئيسية، الصف، درس فيديو مع الترجمة، البطاقات، مختبر النطق، تقرير وليّ الأمر، الدوري، الإعدادات (التباين العالي). جهاز لوحي iPad إذا أبقيت `supportsTablet`.
