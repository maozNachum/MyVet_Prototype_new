# מסירה לניסן — P0 3.2 שיוך בעלים חד־משמעי

**תאריך:** 10.09.2026

**סטטוס:** PASS הנדסי ב־Local וב־Supabase Preview

**סביבה חיה שנבדקה:** `p0-completion-3-2-3-4-3-6` / `gvdjgktrutpikognuocm`

**Production:** לא שונה

ענף ה־Preview נמחק לאחר שמירת הראיות כדי לעצור חיוב נוסף.

## מה נסגר

- `claim_owner_profile()` מקשר משתמש רק כאשר אימייל Auth מאומת תואם לרשומת בעלים יחידה.
- אפס התאמות מחזיר `null` ללא שינוי נתונים.
- יותר מהתאמה אחת מחזירה `OWNER_PROFILE_AMBIGUOUS` ללא קישור של אף רשומה.
- רשומה שכבר נקשרה למשתמש אחר נדחית; ניסיון חוזר של אותו משתמש נשאר idempotent.
- הפונקציה נועלת את רשומות ההתאמה ומונעת claim מקביל לא עקבי.
- אין לפונקציה פרמטר `clinic_id`, `owner_id` או מזהה tenant אחר שהדפדפן יכול לבחור.
- `anon` ו־`public` אינם רשאים להריץ את הפונקציה; ההרשאה ניתנה ל־`authenticated` ול־`service_role` בלבד.

## קבצים ומימוש

- `supabase/migrations/20260906120000_harden_owner_profile_claim.sql`
- `tools/supabase-baseline/supabase/migrations/20260906120000_harden_owner_profile_claim.sql`
- `tests/ownerProfileClaimSecurity.test.ts`
- `tests/ownerProfileClaimDatabaseIntegration.test.mjs`
- `scripts/verify-auth-lifecycle.mjs`

## ראיות קבלה

- בסיס של 16 מיגרציות הוחל על Preview מבודד.
- מטריצת שתי מרפאות עברה: `staging_role_matrix_passed`.
- נוצרו שתי רשומות בעלים בשתי מרפאות עם אותו אימייל מאומת; הקריאה החזירה `OWNER_PROFILE_AMBIGUOUS` ושתי הרשומות נשארו ללא `auth_user_id`.
- חבילת הקבלה הסתיימה ב־`auth_lifecycle_preview_passed` וב־`P0 Preview acceptance passed; Production was not targeted.`

## מסקנה ותלות

תנאי הקבלה ההנדסיים של 3.2 הושלמו ב־Local וב־Preview. אין בכך אישור Production או סגירה של Gate A, שתלוי גם ב־3.1 וב־3.3. משימה 3.5 עדיין צריכה להחליף התאמה לפי אימייל בתהליך onboarding והזמנה מאומתים למוצר רב־מרפאתי, אך היא אינה מבטלת את מנגנון ה־fail-closed שהושלם כאן.
