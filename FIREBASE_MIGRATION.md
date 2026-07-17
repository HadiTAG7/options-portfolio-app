# الهجرة إلى Firebase — دليل التنفيذ

الهدف: نقل الباكيند كاملاً من Supabase إلى Firebase **مع الحفاظ على كل
البيانات، وكل حسابات الدخول بنفس الإيميلات ونفس كلمات المرور** (استيراد
bcrypt)، وبنفس معرّفات الحسابات — فربط الشركاء بحساباتهم يبقى كما هو.

الترتيب مهم. Supabase يبقى شغالاً وبدون أي تعديل طوال العملية — هو خطة
الرجوع حتى نتأكد من كل شيء.

---

## المرحلة ١ — إنشاء مشروع Firebase (٥ دقائق)

1. افتح <https://console.firebase.google.com> → **Add project**.
2. الاسم: مثلاً `alghanim-options` → عطّل Google Analytics (غير مطلوب) →
   **Create project**.
3. من القائمة اليسرى: **Build → Authentication → Get started** →
   تبويب **Sign-in method** → فعّل **Email/Password** → Save.
4. **Build → Firestore Database → Create database** →
   **Production mode** → اختر أقرب موقع يظهر لك (مثل `me-central1`
   الدوحة أو `europe-west1`) → Enable.
5. انشر قواعد الأمان: **Firestore Database → Rules** → احذف الموجود
   والصق محتوى ملف [`firestore.rules`](./firestore.rules) من هذا
   المستودع → **Publish**.

## المرحلة ٢ — مفاتيح الربط

6. **إعدادات المشروع (⚙️ Project settings) → General → Your apps →
   أيقونة الويب `</>`** → سجّل تطبيق ويب (بدون Firebase Hosting) →
   انسخ كائن `firebaseConfig` الظاهر (apiKey, authDomain, projectId,
   …) **وأرسله في المحادثة** — هذه القيم ليست سرّية (مفاتيح ويب علنية
   بطبيعتها، الحماية في قواعد الأمان).
7. **Project settings → Service accounts → Generate new private key** →
   ينزل ملف JSON.
   ⚠️ **هذا الملف سرّي جداً — لا تلصقه في أي محادثة أبداً.** مكانه
   الوحيد: خانة أسرار GitHub (الخطوة التالية).

## المرحلة ٣ — أسرار GitHub (٥ دقائق)

في المستودع: **Settings → Secrets and variables → Actions →
New repository secret**، أضف ثلاثة أسرار:

| اسم السر | القيمة | من أين |
|---|---|---|
| `SUPABASE_SERVICE_ROLE_KEY` | مفتاح service_role | Supabase → Project Settings → API keys → service_role → Reveal |
| `FIREBASE_SERVICE_ACCOUNT` | **محتوى** ملف الـ JSON كاملاً (افتحه بمحرر نصوص وانسخ الكل) | ملف الخطوة ٧ |
| `AUTH_USERS_JSON` | ناتج استعلام التصدير (يبدأ بـ `[` وينتهي بـ `]`) | شغّل [`scripts/export-auth-users.sql`](./scripts/export-auth-users.sql) في Supabase → SQL Editor وانسخ ناتج `users_json` |

(سر `SUPABASE_URL` موجود مسبقاً من إعداد الـ APK.)

## المرحلة ٤ — تشغيل الترحيل (ضغطة زر)

8. **Actions → Migrate to Firebase → Run workflow**.
9. افتح سجل التشغيل وتأكد أن آخر سطر:
   `✓ MIGRATION COMPLETE — all checks passed`
   (التقرير يطابق عدد الصفوف ومجاميع الأرصدة والأرباح رقماً رقماً).
   أعد تشغيله بأمان لو فشل — إعادة التشغيل آمنة.

## المرحلة ٥ — تبديل الكود والتحويل (عليّ أنا)

بعد نجاح الترحيل وإرسال `firebaseConfig`:

- أبدّل طبقة البيانات في التطبيق إلى Firebase (الجلب، الحفظ، تسجيل
  الدخول، مسارات الأدمن). **محرك الأرباح والرسوم لا يتغير حرف.**
- نجمّد العمليات ساعة (بدون إيداع/سحب/تثبيت)، أعيد تشغيل الترحيل
  ليلقط أي حركة أخيرة، ثم ننشر النسخة الجديدة (الويب + APK جديد).
- الشركاء يدخلون **بنفس الإيميل ونفس كلمة المرور** — بس يعيدون تسجيل
  الدخول مرة واحدة.

## بعد الاستقرار (أسبوعان)

- نوقف مشروع Supabase (أو نبقيه مجمداً كأرشيف).
- بدّل مفتاح service_role في Supabase (Rotate) — استُخدم في الترحيل
  وانتهى دوره.
- احذف أسرار `SUPABASE_*` و`AUTH_USERS_JSON` من GitHub.

## خطة الرجوع

في أي لحظة قبل إيقاف Supabase: إعادة نشر النسخة السابقة من التطبيق
(commit ما قبل التبديل) تعيد كل شيء لـ Supabase فوراً — بياناته لم
تُمَس.
