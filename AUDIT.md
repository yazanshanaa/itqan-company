# AUDIT: Performance / SEO / Accessibility

> الفرع: `perf/seo-pass` · PR: yazanshanaa/itqan-company#1 · آخر تحديث: 2026-10-02
> الجولة 1: تحسينات بدون أي تغيير بصري. الجولة 2: تنفيذ القرارات الـ 17 التي وافقت عليها.
> لم يتم أي push على `main`.

---

## ⚠️ قبل الدمج: خطوات مطلوبة منك (مرتبة)

1. **`SESSION_SECRET` في Vercel لازم يكون "معقد".** مكتبة `connect-mongo` تشفّر الجلسات عبر kruptein، وهذه ترفض بصمت أي secret ليس فيه: **حرفان كبيران + حرفان صغيران + رقمان + رمزان** (`!@#$%^&*` …). النتيجة لو لم يتحقق: تسجيل الدخول للوحة التحكم ينجح ظاهريًا، ثم كل طلب بعده يرجع غير مسجّل. هذا بالضبط ما أفشل CI عندي، وأصلحته هناك. السيرفر الآن يطبع تحذيرًا واضحًا عند التشغيل إن كان الـ secret ضعيفًا.
   - مشكلة ثانية من نفس النوع أصلحتها في الكود: kruptein 3.4.0 (أحدث نسخة، وكانت ستُثبَّت تلقائيًا في production) غير متوافقة مع connect-mongo 5.1.0، وتكسر قراءة كل جلسة بعد تسجيل الدخول. ثبّتُّها على 3.3.0 عبر `overrides` في `package.json`، وجرّبت الحفظ والقراءة الحقيقيين على كل النسخ.
2. **`MONGODB_URI` في Vercel.** بعد إصلاح `npm ci` سيتمكن Vercel لأول مرة من نشر تغييرات MongoDB الموجودة على main (sessions + data). بدون `MONGODB_URI` السيرفر لن يعمل.
3. **الدومين `itqantech.io` في Vercel.** الكود يستخدم الآن `https://itqantech.io` تلقائيًا في canonical و hreflang و Open Graph و JSON-LD و sitemap على production و preview، فلم يعد `SITE_URL` ضروريًا (يبقى متاحًا كـ override). المطلوب منك فقط: ربط `itqantech.io` بمشروع Vercel، وجعل `www.itqantech.io` يحوّل إليه (redirect) حتى لا تُفهرس نسختان.
4. **محتوى قاعدة البيانات.** `lib/seed.js` يملأ القاعدة فقط إن كانت فارغة. إن كان فيها محتوى قديم فما زال يقول "هايتك / HiTech"، فعدّل الاسم من لوحة التحكم: معلومات الشركة + النصوص + آراء العملاء.
5. **بيانات تواصل حقيقية** (هاتف، واتساب، روابط السوشال). أدخلها من لوحة التحكم، وستظهر تلقائيًا في الـ structured data (`telephone`, `sameAs`) وفي روابط `tel:`. القيم الوهمية الحالية (`+970 59 000 0000` و `https://facebook.com`) مستبعدة عمدًا.

---

## 0. البيئة

| البند | النتيجة |
|---|---|
| الـ Stack | Node.js + Express 4، صفحة واحدة `public/index.html` (CSS/JS مضمّن) + لوحة تحكم `public/itqan-cp9x.html` + API مع MongoDB |
| Build | لا يوجد build step. "البناء" = `npm ci` + تشغيل السيرفر + `vercel build` |
| Tests | Playwright E2E (`tests/e2e/`): **146 ناجح، 0 فاشل** (3 brute-force مُعطّلة عمدًا في الريبو خلف `RUN_LOCKOUT_TESTS=1`). **CI أخضر على GitHub** ضد MongoDB حقيقي، لأول مرة في الريبو |
| Deploy | `vercel.json` (legacy `builds` + `routes`). تنبيه: لم يظهر أي deployment status من Vercel على الـ PR، فربما ربط Vercel بـ GitHub غير مفعّل لهذا الريبو والنشر يتم يدويًا |
| CI | GitHub Actions يشغّل الاختبارات فقط ولا ينشر |

---

## 1. طريقة التحقق

- **Visual regression:** لقطات full-page (عربي/إنجليزي × 1440px/390px) قبل وبعد كل commit، ومقارنة بكسل ببكسل. كل تغييرات الجولة 1 + Font Awesome + الخطوط + `/en/` + Vercel CDN = **مطابقة بالبكسل**. الفروق الوحيدة هي ما وافقت عليه: اسم البراند، ألوان التباين الثلاثة، اللوغو (AVIF بدل PNG، مطابق بالعين).
- **الاختبارات:** كل الـ suite ضد السيرفر الحقيقي مع MongoDB in-memory محليًا، وضد **MongoDB حقيقي في CI** (service `mongo:7`).
- **Vercel:** `vercel build` محلي حقيقي + تشغيل مخرجاته عبر router الخاص بـ Vercel CLI: أماكن الملفات، الـ routes، الـ headers، محتوى الـ function bundle، ولقطات مطابقة.
- **مراجعة مستقلة:** خمسة مراجعين (server/security، frontend JS، SEO، design/a11y، tests/CI)، وكل ملاحظة تحقق منها مُراجِع ثانٍ يحاول نقضها بإعادة إنتاجها. كل الـ 15 ملاحظة تأكدت، وكلها أُصلحت (القسم 2-ب).

---

## 2. ما تم تنفيذه

### الجولة 1 (بدون أي تغيير بصري)
- **صور:** اللوغو AVIF/WebP بـ `<picture>` + fallback PNG، `width`/`height` + `aspect-ratio` (صفر CLS)، lazy loading لما تحت الـ fold.
- **خطوط:** self-host لـ Cairo/Syne بنفس ملفات Google، `preload` + `font-display: swap`.
- **Cache headers** للخطوط والصور، MIME لـ AVIF، حذف CSS غير مستخدم.
- **SEO:** meta description، canonical، Open Graph، Twitter cards، JSON-LD (Organization + LocalBusiness + WebSite)، `robots.txt`، `sitemap.xml`، `noindex` للوحة التحكم.
- **A11y:** `<main>` + skip link، ترتيب headings، labels، ARIA للأزرار، `:focus-visible`، `prefers-reduced-motion`.

### الجولة 2: القرارات الـ 17

| # | القرار | الحالة | ماذا تم |
|---|---|---|---|
| 1 | إصلاح `connect-mongo` + lockfile | ✅ | `^5.1.1` (غير موجودة) → `^5.1.0`، lockfile متزامن، `npm ci` ينجح. CI يعمل الآن مع MongoDB حقيقي وبيانات اختبار عشوائية لكل تشغيل |
| 2 | الدومين | ✅ | `https://itqantech.io` هو الأصل الافتراضي على production/preview (و `SITE_URL` override اختياري). كرت الكود في الـ hero يعرض `itqantech.io` |
| 3 | اسم البراند | ✅ | "هايتك/HiTech" → "إتقان تك/Itqan Tech" في الصفحة، الـ DEFAULT، لوحة التحكم، `data/site.json`. الدومين الوهمي `hitech.ps` في كرت الكود → `itqantech.io` |
| 4 | بيانات التواصل | ✅ جزئي | روابط `tel:` / `mailto:`، والبيانات الحقيقية من لوحة التحكم تدخل الـ JSON-LD تلقائيًا. البيانات نفسها مطلوبة منك |
| 5 | Font Awesome | ✅ | subset ذاتي: 26 أيقونة solid + 7 brands، **375 KB → 9.4 KB**، مطابق بالبكسل. أيقونة خارج الـ subset تُختار من لوحة التحكم تحمّل النسخة الكاملة تلقائيًا |
| 6 | Vercel CDN | ✅ | الصور والخطوط والـ favicons تُخدم من CDN بدل الـ serverless function |
| 7 | التباين | ✅ | زر واتساب + زر "تواصل" بالمنتجات: نفس الأخضر، والأيقونة/النص `#050B18` (لون النص الداكن المستخدم أصلًا على كل الأزرار الفاتحة): 1.98 → **9.92:1**. تعليق الكود: `#475569` → `#7A8BA3` (2.28 → 4.98:1) |
| 8 | صورة OG | ✅ | 1200×630، 58 KB، بألوان وخط وشعار الموقع ونص الـ hero الموجود أصلًا |
| 9 | Favicon | ✅ | `favicon.ico` (16/32/48) + `apple-touch-icon` من مكعّب اللوغو |
| 10 | Title بكلمات مفتاحية | ✅ | «إتقان تك \| تطوير مواقع وتطبيقات وأتمتة n8n في جنين» |
| 11 | نسخة إنجليزية برابط مستقل | ✅ | `/en/` يُرسم من السيرفر: `lang=en dir=ltr`، title/description/canonical/OG إنجليزية، والنصوص الإنجليزية جاهزة قبل الـ JS. `hreflang` (ar/en/x-default) + sitemap بالنسختين. زر اللغة يغيّر الرابط والعنوان بدون reload |
| 12 | تنظيف | ✅ | `orginal.png` → `logo.png` (ضغط lossless −18%) + redirect 301 من الاسم القديم، حذف النسخة المكررة، نسخة 677w لشاشات 3x، لوحة التحكم تستخدم AVIF |
| 13 | الاختبارات الفاشلة | ✅ | 23 فشل موجود مسبقًا → **0**. لم يتم تخطي أو إضعاف أي اختبار. كشفت الاختبارات 3 أخطاء حقيقية وتم إصلاحها: id مكرر (`f-email`)، حقول بدون `required`، وزر التبويب AR/EN في لوحة التحكم كان يخفي القوائم |
| 14 | meta http-equiv | ✅ | حذف `X-Frame-Options` / `X-Content-Type-Options` / `frame-ancestors` من `<meta>` (المتصفح يتجاهلها، والسيرفر يرسلها كـ headers) + تضييق CSP |
| 15 | Minification | ❌ لم يُنفّذ | القياس الفعلي: **1.4 KB brotli فقط (~7%)**، وليس 10–15% كما قدّرت. التكلفة: binary بحجم 11.6 MB في الـ function + 80–200ms لكل cold start (أبطأ)، أو build step + dependency. الخسارة أكبر من الربح. أنفّذه كـ build-time script إن أردت |
| 16 | قائمة الجوال | ✅ | focus ينتقل للقائمة، Tab يدور داخلها، Escape يغلقها ويعيد الـ focus. لا يظهر focus ring لمستخدمي الماوس |
| 17 | التراخيص | ✅ | OFL لـ Cairo و Syne + ترخيص Font Awesome في `public/fonts/` |

### 2-ب. نتائج المراجعة المستقلة (كلها أُصلحت)

| الخطورة | المشكلة | الإصلاح |
|---|---|---|
| أمني | `X-Forwarded-Proto` كان يُكتب بدون تنظيف داخل canonical/OG/JSON-LD، فيمكن حقن `<script>` عبر header | قبول `http`/`https` فقط، واستبدال آمن من رموز `$` |
| أمني/SEO | مسارات مثل `//index.html` و `/%69ndex.html` كانت تعرض القالب الخام بـ `__SITE_URL__` | أي مسار ينتهي بـ `/index.html` يُحوَّل إلى `/` |
| SEO | `robots.txt` كان يمنع `/api/data`، فـ Google يرى المحتوى الافتراضي لا الحقيقي | `Allow: /api/data` |
| SEO/JS | الـ pre-render لـ `/en/` كان يعدّل كود JS المضمّن، فزر "View Demo" يبقى إنجليزيًا بعد التبديل للعربي | التعديل على الـ markup فقط |
| SEO | `/EN/` و `/En/` كانت تُعرض إنجليزي ثم تنقلب عربي | redirect 301 إلى `/en/` |
| SEO | ترتيب عناصر sitemap يخالف schema 0.9 | تصحيح الترتيب |
| SEO | شعار JSON-LD (نص أبيض على شفاف) يختفي على خلفية Google البيضاء | `logo-schema.jpg` بخلفية الموقع الداكنة |
| A11y | نص skip link و aria-labels عربية على الصفحة الإنجليزية | تتبع لغة الصفحة |
| A11y | زر Back يترك الرابط واللغة غير متطابقين | مزامنة عند `popstate` |
| A11y/UX | زر الإغلاق (×) في قائمة الجوال لا يستجيب للمس، لأن الـ navbar فوقه (موجود أصلًا على main) | الـ navbar يمرر اللمس وهي مفتوحة + اختبار جديد يفشل على main |
| Tests | اختبار تبديل اللغة كان يقبل `/en/` على أنه `/` | مقارنة الرابط بالضبط + اختبار Back |
| Tests | اختبارات CRUD في لوحة التحكم تترك بيانات اختبار في القاعدة | snapshot قبلها واسترجاع بعدها |

---

## 3. قياسات قبل / بعد (main ← HEAD)

### الصفحة كاملة (Chromium، أول زيارة، بدون cache، أحجام raw)
| | main | HEAD | الفرق |
|---|---:|---:|---:|
| إجمالي الحجم: عربي | 700,995 B | 218,327 B | **−68.9%** |
| إجمالي الحجم: إنجليزي | 717,635 B | 234,975 B | **−67.3%** |
| عدد الطلبات: عربي | 10 | 8 | −2 |
| Origins خارجية | 3 (googleapis, gstatic, cdnjs) | **0** | −3 |
| Stylesheets خارجية حاجبة للـ render | 2 | **0** | −2 |

### الملفات
| الملف | main | HEAD |
|---|---:|---:|
| اللوغو (شاشة 1x) | 119,605 B PNG | 3,580 B AVIF (−97%) |
| اللوغو PNG (fallback/OG) | 119,605 B | 98,084 B (lossless) |
| Font Awesome (CSS + خطوط) | 375,706 B | 9,369 B (−97.5%) |
| Google Fonts CSS | 17,733 B | 0 |
| `index.html` كما يُرسل: raw / gzip / brotli | 74,021 / 17,825 / 14,967 | 93,831 / 23,271 / 19,371 |

> HTML نفسه زاد ~4.4 KB brotli، والسبب: JSON-LD، و meta tags، و `@font-face`، و CSS الأيقونات المضمّن (بدل ملف 102 KB خارجي)، و JS الجديد (لغة/رابط، قائمة الجوال، structured data). المحصلة على الصفحة: −483 KB.

---

## 4. ما تبقى ويحتاج قرارك (مرتب بالأولوية)

1. 🔴 **الخطوات الخمس في أعلى الملف** (SESSION_SECRET، MONGODB_URI، ربط الدومين، محتوى القاعدة، بيانات التواصل).
2. 🟠 **آراء العملاء والأرقام والمشاريع** (6 آراء بأسماء عامة، "50+ مشروع"، "98% رضا"، مشاريع مثل "متجر الأزياء الفلسطيني") تبدو بيانات قالب. عرض آراء غير حقيقية كأنها حقيقية يضر بالثقة وقد يُعتبر مضللًا. استبدلها بآراء وأرقام حقيقية أو احذفها. لم أضف لها `Review` schema لهذا السبب.
3. 🟠 **`npm audit`:** ثغرات في `body-parser` و `qs` (عبر Express) و `nodemailer` (high). موجودة مسبقًا، والترقية قرار منفصل (nodemailer تحتاج major).
4. 🟡 **ألوان اللوحة:** ملف هوية البراند (brand registry) يحدد `#10233F / #1A3A6B / #4FC3F7`، والموقع يستخدم `#060D1F / #38BDF8 / #818CF8`. لم ألمس ألوان الموقع حسب تعليماتك. قرّر أي واحدة هي المعتمدة.
5. 🟡 **`env: {NODE_ENV: production}` في `vercel.json`** لا يظهر في إعدادات الـ function الناتجة عن `vercel build`. تأكد أن `NODE_ENV=production` مضبوط في إعدادات مشروع Vercel، فهو يتحكم في `secure` cookies و HSTS و `trust proxy`.
6. 🟡 **سنة حقوق النشر** في الـ footer ما زالت `© 2025`.
7. 🟢 **Minification** (القرار 15): كـ build-time script إن أردت، والمكسب ~1.4 KB لكل تحميل HTML.
8. 🟢 **إعدادات Vercel القديمة (`builds`/`routes`)**: تعمل وتم التحقق منها، لكن Vercel يصنّفها legacy. الانتقال لـ zero-config يحتاج نقل الـ HTML خارج `public/` أولًا.

---

## 5. الملفات المتغيرة (main..HEAD)
- `public/index.html`: كل تحسينات الأداء/SEO/الوصول + القرارات المعتمدة
- `public/itqan-cp9x.html`: alt، favicon، noindex، AVIF، إصلاح التبويبات، اسم البراند
- `routes/seo.js` (جديد): `/`, `/en/`, `robots.txt`, `sitemap.xml`
- `server.js`: cache headers، AVIF mime، redirect للوغو، حماية القالب الخام، تحذير SESSION_SECRET
- `vercel.json`: CDN للأصول الثابتة
- `package.json` / `package-lock.json`: إصلاح connect-mongo + تثبيت kruptein 3.3.0 (dependency موجودة أصلًا بشكل غير مباشر)، **بدون أي dependency جديدة**
- `.github/workflows/playwright.yml`: MongoDB service + بيانات اختبار عشوائية
- `tests/e2e/*`: إصلاحات + `seo.spec.js` جديد
- `data/site.json`: اسم البراند
- `public/img/*`, `public/fonts/*`, `public/favicon.ico`, `public/apple-touch-icon.png`: أصول جديدة

**لم يتم:** لمس `.env*` أو أي secrets حقيقية، إضافة dependencies، أو push على main.
