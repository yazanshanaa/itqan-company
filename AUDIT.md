# AUDIT — Performance / SEO / Accessibility pass

> الفرع: `perf/seo-pass` · التاريخ: 2026-10-02
> القاعدة الحاكمة: **صفر تغيير بصري**. لم يتم تغيير أي لون أو خط أو layout أو نص تسويقي ظاهر.

---

## 0. فحص البيئة (قبل أي تعديل)

| البند | النتيجة |
|---|---|
| الـ Stack | Node.js + Express 4 يخدم صفحة واحدة ثابتة `public/index.html` (CSS/JS inline) + لوحة تحكم `public/itqan-cp9x.html` + API (`/api/data`, `/api/auth`, `/api/contact`) مع MongoDB |
| Build system | **لا يوجد** — لا bundler ولا build script. "الـ build" عمليًا = `npm ci` + تشغيل السيرفر |
| Tests | Playwright E2E في `tests/e2e/` + `test/qa.js`. كلها تحتاج MongoDB حقيقي |
| Auto-deploy | يوجد `vercel.json` (`@vercel/node`, كل المسارات → `server.js`) + commit بعنوان "Add Vercel configuration for server deployment" ⇒ **Vercel Git integration من main**. GitHub Actions (`playwright.yml`) يشغّل الاختبارات فقط ولا ينشر |
| القرار | **لم يتم أي push على main.** كل العمل على `perf/seo-pass` مع Pull Request |

### مشاكل موجودة مسبقًا على main (ليست من هذا الـ PR)
1. **`npm ci` يفشل على main**: `package.json` يطلب `connect-mongo@^5.1.1` وهذه النسخة غير موجودة على npm (آخر 5.x هي 5.1.0)، و`package-lock.json` لا يحتوي `connect-mongo` ولا `mongodb` أصلًا. ⇒ الـ CI أحمر، وغالبًا آخر deploys على Vercel فشلت أيضًا (انظر القرار #1).
2. **17 من 70** اختبار E2E (homepage + navigation) تفشل على main بسبب أخطاء في الاختبارات نفسها (مثلًا strict-mode: `a[href="#contact"]` يطابق عنصرين داخل navbar).

---

## 1. طريقة التحقق بعد كل مجموعة تعديلات

بما أنه لا يوجد build ولا MongoDB متاح في بيئة العمل، تم التحقق محليًا (بدون تعديل أي ملف في المشروع) بـ:

1. `npm install --no-save connect-mongo@5.1.0` (محليًا فقط — `package.json` و lockfile لم يُلمسا).
2. `node --check` لكل ملفات JS + تحقق أن JSON-LD يُحلَّل بشكل صحيح.
3. تشغيل `server.js` الحقيقي مع stub لـ MongoDB (البيانات تُقرأ من `data/site.json`).
4. **Visual regression**: screenshots كاملة للصفحة (عربي/إنجليزي × desktop 1440px / mobile 390px) قبل وبعد، ومقارنة pixel-by-pixel.
   - النتيجة النهائية: **مطابقة 100% لكل البكسلات** خارج صورة اللوغو. اللوغو نفسه يختلف فقط بإعادة الـ resampling (AVIF مصغّر بدل PNG كبير يصغّره المتصفح) وهو بصريًا مطابق.
   - تم التأكد أن الخطوط self-hosted تعطي rendering مطابق بالبكسل للخطوط من Google.
5. اختبارات Playwright (homepage + navigation، Desktop + Mobile): **نفس النتيجة بالضبط كـ main** (53 pass / 17 fail موجودة مسبقًا، ولا فشل جديد).

---

## 2. ما تم تنفيذه

### Performance
| التغيير | التفاصيل |
|---|---|
| صور WebP/AVIF مع fallback | اللوغو داخل `<picture>`: AVIF ← WebP ← PNG الأصلي. نسخ 178w و356w (1x/2x) بنفس نسبة العرض للارتفاع |
| width/height لكل صورة | `width="677" height="369"` + `aspect-ratio` على `.site-logo-img` ⇒ لا CLS ولا حتى إزاحة sub-pixel |
| Lazy loading | لوغو الـ footer + صور الخدمات/المشاريع/المنتجات (المضافة من لوحة التحكم) `loading="lazy" decoding="async"`. لوغو الـ navbar `fetchpriority="high"` |
| الخطوط | Self-host لـ Cairo و Syne (نفس ملفات woff2 الـ variable ونفس unicode-ranges التي يرسلها Google). `preload` لـ Cairo Arabic + Latin، و`font-display: swap` |
| Third-party | حذف الاعتماد على `fonts.googleapis.com` و`fonts.gstatic.com` (stylesheet حاجب للـ render + اتصالين DNS/TLS). إضافة `preconnect` لـ cdnjs |
| Caching | `Cache-Control` للخطوط: سنة + `immutable` (أسماء الملفات فيها رقم النسخة). للصور: 7 أيام + `stale-while-revalidate` |
| MIME | تسجيل `image/avif` (Express 4 كان يرسله `application/octet-stream`) |
| CSS غير مستخدم | حذف `.nav-logo-icon`, `.nav-logo-text` (القواعد الوحيدة غير المستخدمة في الصفحة) |

### SEO
| التغيير | التفاصيل |
|---|---|
| Title / description | الـ title موجود وفريد لكل صفحة (لم يُغيَّر — اختبار E2E يتحقق منه). أُضيف `meta description` فريد للرئيسية وللوحة التحكم |
| Canonical + Open Graph + Twitter | `og:*` كاملة (`ar_AR` + `en_US`)، `twitter:card=summary_large_image` |
| Structured data | JSON-LD `@graph`: **Organization** + **LocalBusiness** باسم `إتقان تك - Itqan Tech`، العنوان برطعة / جنين / PS، `areaServed` برطعة وجنين، و`OfferCatalog` بالخدمات: تطوير المواقع، تطوير التطبيقات، أتمتة n8n، الأمن السيبراني، التسويق الرقمي. + **WebSite** |
| robots.txt / sitemap.xml | `routes/seo.js` يولّدهما ديناميكيًا. `robots.txt` يمنع `/api/` ويشير للـ sitemap. لوحة التحكم **غير مذكورة** في robots.txt عمدًا (حتى لا يُكشف مسارها) ومحمية بـ `noindex` |
| Absolute URLs | الدومين غير موجود في الريبو، لذلك `canonical/og:url/og:image/JSON-LD/sitemap` تُبنى من متغير البيئة الاختياري `SITE_URL`، وإن لم يوجد فمن الـ Host للطلب (مع validation ضد Host-header injection) |
| lang / dir | `<html lang="ar" dir="rtl">` صحيحة؛ والتبديل للإنجليزية يغيّرها لـ `en/ltr` (موجود ومُختبر) |
| لوحة التحكم | `<meta name="robots" content="noindex, nofollow">` إضافة إلى `X-Robots-Tag` الموجود |

### Accessibility
| التغيير | التفاصيل |
|---|---|
| alt | لوغو الموقع ولوحة التحكم: `إتقان تك - Itqan Tech` (كان `Itqan`) |
| HTML دلالي | `<main>` + skip link (يظهر فقط عند Tab) + `aria-label` للـ nav وقائمة الجوال |
| ترتيب headings | h1 ← h2 (الأقسام) ← h3 (عناوين البطاقات: خدمات، مراحل، مشاريع، منتجات). عناوين الـ footer من h4 إلى h2 (كان هناك قفز من h2 إلى h4). نفس الـ classes ⇒ نفس الشكل |
| Forms | `label for` مربوط بكل حقل، `autocomplete`، `aria-required`، `type="button"` |
| أزرار بأيقونات فقط | أسماء مقروءة لـ hamburger (+`aria-expanded`)، إغلاق القائمة، أزرار اللغة (+`aria-pressed`)، روابط السوشال، زر واتساب |
| أيقونات زخرفية | `aria-hidden="true"` لكل أيقونات Font Awesome، كرت الكود، علامة الاقتباس. النجوم تُقرأ `5/5` |
| Focus | `:focus-visible` بلون `--primary` الموجود (يظهر فقط مع الكيبورد، لا يظهر مع الماوس) |
| Motion | `prefers-reduced-motion` يوقف الأنيميشن لمن فعّل الخيار في نظامه فقط |
| أخرى | `rel="noopener noreferrer"` لروابط `target=_blank`، الـ toast `role="status"` |
| التباين | تم القياس فقط — **لم يُغيَّر أي لون**. النتائج في القرار #7 |

---

## 3. قياسات قبل / بعد

### أحجام الملفات
| الملف | قبل | بعد | الفرق |
|---|---:|---:|---:|
| لوغو (يُحمَّل في الصفحة، شاشة 1x) | 119,605 B (PNG) | 3,580 B (AVIF) | **−97.0%** |
| لوغو (شاشة 2x/retina) | 119,605 B | 8,609 B (AVIF) / 12,920 B (WebP) | −92.8% |
| Google Fonts CSS (حاجب للـ render) | 17,733 B | 0 B | −100% |
| ملفات الخطوط woff2 | 99,300 B | 99,324 B | نفس الملفات (أصبحت same-origin) |
| `index.html` raw | 74,021 B | 83,974 B | +9,953 B |
| `index.html` gzip -9 | 17,832 B | 20,070 B | +2,238 B (JSON-LD + meta + `@font-face`) |

### الصفحة كاملة (Chromium، أول زيارة، بدون cache)
| | قبل | بعد | الفرق |
|---|---:|---:|---:|
| إجمالي الحجم — عربي | 700,995 B | 577,349 B | **−17.6%** |
| إجمالي الحجم — إنجليزي | 717,635 B | 593,997 B | −17.2% |
| عدد الطلبات — عربي | 10 | 9 | −1 |
| Origins خارجية | 3 (googleapis, gstatic, cdnjs) | 1 (cdnjs) | −2 |
| موارد حاجبة للـ render | 2 stylesheets خارجية | 1 (Font Awesome) | −1 |

> ملاحظة: الأرقام raw (بدون gzip/brotli). أكبر وزن متبقٍّ هو Font Awesome: **375 KB** من 577 KB (القرار #5).

---

## 4. ما تبقى ويحتاج قرارك (مرتب بالأولوية)

1. **🔴 إصلاح `connect-mongo@^5.1.1` → `^5.1.0` وتحديث lockfile.** بدونه `npm ci` يفشل (CI أحمر وغالبًا deploy على Vercel فاشل). ⚠️ انتبه: إصلاحه سيجعل Vercel ينشر لأول مرة كل تغييرات MongoDB الأخيرة على main (sessions + data في Mongo) — تأكد أن `MONGODB_URI` مضبوط في Vercel قبل الدمج. لم أصلحه هنا لأنه قرار نشر وليس تحسين أداء. الـ CI على هذا الـ PR سيفشل لنفس السبب.
2. **🔴 ضبط `SITE_URL` في Vercel** (مثلًا `https://<الدومين>`). بدونه الروابط المطلقة تعتمد على Host الطلب، وهذا يعمل لكن قد يُظهر دومين `*.vercel.app` في canonical/sitemap إن زار أحد الموقع عبره.
3. **🟠 اسم البراند في المحتوى**: النصوص الظاهرة والبيانات (`data/site.json` + `DEFAULT` في الصفحة) تقول **"هايتك / HiTech"** و`hitech.ps`، بينما العنوان والـ structured data "إتقان تك - Itqan Tech". هذا تضارب في هوية الكيان عند Google. لم ألمسه لأنه نص تسويقي — يمكن تعديله من لوحة التحكم.
4. **🟠 بيانات تواصل placeholder**: الهاتف `+970 59 000 0000`، روابط السوشال تشير لـ `facebook.com` الرئيسية، العنوان في البيانات "فلسطين" فقط. لذلك **لم أضع** `telephone` ولا `sameAs` ولا `geo` ولا ساعات العمل في LocalBusiness (وضع بيانات وهمية يضر). زوّدني بالبيانات الحقيقية لإضافتها، وأيضًا لتحويل روابط الـ footer إلى `tel:` و`mailto:`.
5. **🟠 Font Awesome (375 KB)**: CSS 102 KB + solid 157 KB + brands 117 KB من أجل ~35 أيقونة. الحل: subset أو SVG sprite. **لكن** لوحة التحكم تسمح باختيار أي اسم أيقونة FA للخدمات، فالـ subset سيقيّد هذا. يحتاج قرارك.
6. **🟠 Vercel يمرر كل الملفات الثابتة عبر الـ serverless function** (`builds` + route `/(.*)` → `server.js`). نقل `public/` ليُخدم من CDN مباشرة سيحسّن TTFB بشكل كبير، لكنه تغيير في إعداد النشر.
7. **🟡 تباين ألوان (WCAG AA)** — لم أغيّر أي لون:
   - زر واتساب العائم: أيقونة بيضاء على `#25D366` = **1.98:1** (المطلوب 3:1 لعناصر الواجهة).
   - زر "تواصل" في بطاقات المنتجات: نص أبيض 14px على `#128C7E` = **4.14:1** (المطلوب 4.5:1).
   - تعليق الكود في كرت الـ hero `#475569` = 2.28:1 (أصبح `aria-hidden` لأنه زخرفي).
   - باقي الألوان الأساسية تنجح (النص الرمادي 6.3–7.6:1، الأزرق 8–9:1).
8. **🟡 صورة Open Graph مخصصة 1200×630** بدل اللوغو (أفضل شكل عند المشاركة على واتساب/فيسبوك) — أصل تصميمي يحتاج موافقتك.
9. **🟡 Favicon** غير موجود (`/favicon.ico` يرجع 404 في كل زيارة). يحتاج أصل بصري معتمد.
10. **🟡 Title الرئيسية**: يمكن إضافة كلمات مفتاحية/موقع (مثل "تطوير مواقع وتطبيقات في جنين"). لم ألمسه لأنه نص تسويقي ومُثبّت في اختبار E2E.
11. **🟡 النسخة الإنجليزية** على نفس الرابط وتُبدَّل بالـ JS فقط ⇒ Google لا يفهرسها كنسخة مستقلة ولا يمكن استخدام `hreflang`. الحل يحتاج روابط منفصلة (`/en/`).
12. **🟢 تنظيف**: `img/orginal.png` في جذر الريبو نسخة مكررة غير مستخدمة (السيرفر يخدم `public/` فقط) + خطأ إملائي في الاسم. لوحة التحكم ما زالت تستخدم PNG الكبير (غير مُفهرسة، أثرها محدود).
13. **🟢 اختبارات E2E**: إصلاح الـ 17 اختبار الفاشلة مسبقًا (locators غير محددة بدقة).
14. **🟢 `<meta http-equiv="X-Frame-Options">` و `frame-ancestors`** داخل `<meta>` يتجاهلهما المتصفح (تحذيرات console). السيرفر يرسلهما كـ headers أصلًا، فيمكن حذفهما.
15. **🟢 Minification للـ CSS/JS المضمّن**: يحتاج إضافة build step/dependency — المكسب صغير (~10–15% من HTML بعد gzip).
16. **🟢 قائمة الجوال**: إضافة focus trap وإغلاق بـ Escape (تحسين سلوكي بسيط).
17. **🟢 Licenses**: خطوط Cairo و Syne مرخّصة OFL (تسمح بالاستضافة الذاتية). يُستحسن إضافة ملف الترخيص في `public/fonts/`.

---

## 5. ملفات تم تغييرها
- `public/index.html` — كل تحسينات الأداء/SEO/الوصول (بدون تغيير بصري)
- `public/itqan-cp9x.html` — alt + meta description + robots noindex
- `public/img/logo-178|356.{avif,webp}` — جديد
- `public/fonts/*.woff2` — جديد (Cairo, Syne)
- `server.js` — cache headers + AVIF mime + تسجيل `routes/seo.js`
- `routes/seo.js` — جديد: `/`, `/robots.txt`, `/sitemap.xml`

**لم يتم**: إضافة أي dependency، لمس `.env*` أو أي secrets، تعديل `package.json`/lockfile/`vercel.json`، أو push على main.
