-- تصدير حسابات الدخول (مع تشفير كلمات المرور bcrypt) لاستيرادها في Firebase.
--
-- الاستخدام:
--   1. Supabase → SQL Editor → New query → الصق هذا الملف → Run
--   2. انسخ ناتج العمود users_json كاملاً (يبدأ بـ [ وينتهي بـ ])
--   3. أضفه كسر (Secret) في GitHub باسم AUTH_USERS_JSON
--      (Repo → Settings → Secrets and variables → Actions → New repository secret)
--
-- ⚠️ لا تلصق هذا الناتج في أي محادثة أو ملف داخل المستودع —
--    مكانه الوحيد: خانة الأسرار في GitHub.

select json_agg(json_build_object(
  'localId',       id,
  'email',         email,
  'passwordHash',  encrypted_password,
  'emailVerified', email_confirmed_at is not null
)) as users_json
from auth.users;
