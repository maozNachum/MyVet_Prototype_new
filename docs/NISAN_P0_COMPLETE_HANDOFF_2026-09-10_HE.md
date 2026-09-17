# MyVet — דוח P0 מאוחד למסירה לניסן

**עדכון אחרון:** 16.09.2026

**ענף קוד:** `Full_Demo`

**סביבת קבלה:** Supabase Preview קבוע `myvet-staging` (`fajwhkgafbjgnbgwsumt`)

**Production:** `bavpqmopcrhtrwatmyng` לא שונה ולא שימש יעד לבדיקה

**מצב מסחרי:** `NO-GO` ללקוחות אמיתיים עד השלמת השער המשפטי, SMTP ויתר שערי ההשקה שמחוץ ל־P0 ההנדסי.

## 1. תמונת מצב מנהלית

משימות 3.1–3.5 הושלמו בקוד ועברו קבלה טכנית בסביבה מבודדת. משימה 3.6 כוללת תשתית פרטיות הנדסית ובדיקות תקינות, אך אינה יכולה להיסגר משפטית באמצעות קוד או QA בלבד.

| משימה | נושא | מצב |
|---|---|---|
| 3.1 / F-022 | שלילת Storage מעובד מושבת | `PASS` ב־Preview, כולל Storage HTTP וקישורים חתומים |
| 3.2 / F-023 | מניעת שיוך בעלים עמום | `PASS` ב־Preview, כולל שני חיבורי PostgreSQL עצמאיים |
| 3.3 / F-024 | הרשמת בעלים דרך מסלול שרת בלבד | `PASS` בקוד ובבדיקות; בדיקת Hosted השלילית כלולה בהרצת הקבלה הסופית |
| 3.4 / F-026, F-007 | Auth, סיסמאות, MFA וניתוק sessions | `PASS` הנדסי ב־Preview; מסירת אימייל אמיתית ב־SMTP עדיין פתוחה |
| 3.5 / F-006 | Onboarding רב־מרפאתי | `PASS` ב־Preview לשתי מרפאות והזמנות צוות/בעלים |
| 3.6 / F-003 | פרטיות, זכויות ו־retention | `PASS` הנדסי; `NO-GO` משפטי ותפעולי עד אישור מקצועי |

`PASS` במסמך זה הוא ראיית קבלה טכנית בלבד. הוא אינו אישור לפריסה ל־Production או לעיבוד מידע אמיתי.

## 2. 3.1 — שלילת Storage מעובד מושבת

### מה הושלם

- Policies של Storage רפואי דורשות חברות צוות פעילה במרפאה.
- בעלות טכנית על אובייקט אינה עוקפת `is_active=false`.
- נבדקו buckets פרטיים `documents` ו־`chat-attachments` דרך Storage API אמיתי.
- עובד פעיל העלה, הוריד ויצר Signed URL בהצלחה.
- לאחר שינוי תפקיד והשבתה נחסמו הורדה, חתימה, עדכון ומחיקה.
- מחיקה מסוננת שנראתה כהצלחה נבדקה מול bytes קיימים כדי לוודא שהאובייקט לא נמחק.
- Signed URL שכבר הונפק נבדק עד תפוגתו; לא נטען שהוא מתבטל מיד בעת השבתת העובד.
- נתוני הבדיקה נוקו בהרשאת מפעיל רק בסביבת ה־Preview.

### ראיות וקבצים

- `supabase/migrations/20260908115631_revoke_inactive_staff_storage_access.sql`
- `scripts/verify-auth-lifecycle.mjs`
- `tools/supabase-baseline/verify/inactive-staff-storage.sql`
- פלט קבלה: `storage_revoke_http_and_short_url_expiry_passed`

**מסקנה:** תנאי הקבלה ההנדסיים של 3.1 עברו.

## 3. 3.2 — שיוך בעלים חד־משמעי

### מה הושלם

- `claim_owner_profile()` משתמש רק בזהות ובאימייל המאומתים מה־JWT ומה־Auth.
- הפונקציה אינה מקבלת `clinic_id` או `owner_id` מהדפדפן.
- אפס התאמות אינו משנה מידע.
- התאמה יחידה נקשרת באופן idempotent.
- יותר מהתאמה אחת נכשלת עם `OWNER_PROFILE_AMBIGUOUS` ללא שינוי רשומה.
- רשומה שמשויכת למשתמש אחר אינה ניתנת להשתלטות.
- נעילת advisory טרנזקציונית משותפת ל־claim ולכל INSERT/UPDATE של אימייל בעלים סוגרת מרוץ מול התאמה חדשה.
- בדיקת קבלה חדשה מפעילה שני חיבורי PostgreSQL עצמאיים: חיבור אחד מחזיק INSERT באותו אימייל, והחיבור השני מנסה claim. ה־claim ממתין ולאחר ה־commit רואה את שתי ההתאמות ונכשל בבטחה.

### ראיות וקבצים

- `supabase/migrations/20260906120000_harden_owner_profile_claim.sql`
- `supabase/migrations/20260915130000_harden_owner_profile_claim_concurrency.sql`
- `tests/ownerProfileClaimDatabaseIntegration.test.mjs`
- `scripts/verify-auth-lifecycle.mjs`
- `tools/supabase-baseline/verify/owner-claim-concurrency.sql`
- פלט ב־Local וב־Preview משני חיבורים: `owner_claim_independent_connections_passed`

**מסקנה:** המימוש והתחרות בשני חיבורים עצמאיים עברו גם ב־Preview; תנאי הקבלה ההנדסיים של 3.2 הושלמו.

## 4. 3.3 — הרשמת בעלים דרך השרת בלבד

### מה הושלם

- הוסר INSERT כללי של `authenticated` אל `public.owners`.
- יצירת וקישור owner נעשים בזרימה שרתית ומוגנת המבוססת Auth או הזמנה חתומה.
- המרפאה נגזרת מהזמנה מאומתת; הדפדפן אינו בוחר tenant שרירותי.
- נבדקים אימייל מאומת, מזהה בעלים, טלפון, שם וגרסת תנאים.
- כשל באימות מאוחר אינו משאיר owner מקושר, ו־retry לאחר תיקון מאומת יוצר שיוך יחיד.
- ניסיון INSERT ישיר מצד משתמש דפדפן מאומת נכשל ונבדק שאין רשומה שנשמרה.
- הזרימה אינה משתמשת עוד ב־`myvet-primary` עבור onboarding חדש; האזכור נשאר רק במיגרציות היסטוריות ישנות.

### ראיות וקבצים

- `supabase/migrations/20260915120000_multi_clinic_onboarding_and_secure_owner_signup.sql`
- `supabase/migrations/20260915180000_make_owner_signup_auth_transaction_safe.sql`
- `supabase/migrations/20260915190000_bind_owner_signup_to_auth_transaction.sql`
- `supabase/migrations/20260915200000_move_owner_invitation_acceptance_out_of_auth_trigger.sql`
- `supabase/migrations/20260915210000_allow_verified_owner_invitation_acceptance.sql`
- `tests/ownerSignupDatabaseIntegration.test.mjs`
- `tests/multiClinicOnboardingDatabaseIntegration.test.mjs`
- `scripts/verify-multi-clinic-onboarding.mjs`

**מסקנה:** תנאי הקבלה ההנדסיים של 3.3 הושלמו.

## 5. 3.4 — הקשחת Auth ו־MFA

### מה הושלם ב־Preview

- מינימום 12 תווים ודרישת אותיות גדולות/קטנות, ספרות וסימנים.
- `Prevent use of leaked passwords` הופעל ונבדק מול סיסמה ידועה כדולפת.
- Secure password change, refresh rotation ומדיניות session הוגדרו.
- TOTP ו־AAL2 נדרשים למנהל מרפאה ולווטרינר.
- שבע פונקציות Edge נבדקו ללא JWT, עם AAL1 ועם AAL2.
- AAL1 מקבל `MFA_REQUIRED` לפני גישה למשאב או לספק AI.
- שינוי תפקיד והשבתת עובד מבטלים session refresh ומסירים גישה למסד ול־Storage.
- invite ו־recovery נבדקו עד אימות token, קביעת סיסמה וכניסה.

### פונקציות Edge שנבדקו

- `ai-assistant`
- `client-summary`
- `digitalcare-transcription`
- `follow-up-suggestions`
- `medical-record-rag`
- `visit-summary`
- `document-ocr`

הגרסאות שהיו ב־Preview לא כולן תאמו לקוד `Full_Demo`; שבע הפונקציות נפרסו מחדש ל־Preview בלבד ונבדקו. Production לא שונה.

### מה עדיין פתוח

- אין ראיית מסירה לתיבת אימייל אמיתית עבור הרשמה, הזמנה ושחזור.
- יש להגדיר ספק SMTP ודומיין שולח, ולאמת SPF, DKIM ו־DMARC.
- בדיקות `generateLink` מאמתות token ו־redirect, אך אינן הוכחת deliverability.

**מסקנה:** הקשחת Auth ו־MFA עברה הנדסית; SMTP הוא חסם תפעולי נפרד.

## 6. 3.5 — Onboarding רב־מרפאתי

### מה הושלם

- יצירת מרפאה חדשה והקמת מנהל ראשון.
- TOTP לפני הפעלת הקשר המרפאה למנהל בעל הרשאה גבוהה.
- הזמנת צוות והזמנת בעלים עם token חד־פעמי ותפוגה.
- binding של ההזמנה לאימייל המאומת.
- שימוש חוזר בהזמנה נכשל.
- משתמש עם אימייל שגוי אינו יכול לקבל הזמנה.
- משתמש יכול להשתייך למספר מרפאות דרך `user_clinic_preferences` ו־active clinic מאומת.
- מעבר למרפאה זרה נכשל.
- צוות ובעלים רואים רק את המרפאות שלהם.
- redirect דינמי לכניסת צוות ו־redirect לפורטל הבעלים נבדקו.
- שתי מרפאות נוצרו בפועל ב־Preview, נבדקו ונוקו.

### ראיות וקבצים

- `src/app/pages/ClinicManagement.tsx`
- `src/app/pages/Login.tsx`
- `src/app/components/Navbar.tsx`
- `supabase/migrations/20260915120000_multi_clinic_onboarding_and_secure_owner_signup.sql` ועד `20260915210000_allow_verified_owner_invitation_acceptance.sql`
- `tests/multiClinicOnboardingSecurity.test.ts`
- `tests/multiClinicOnboardingDatabaseIntegration.test.mjs`
- `scripts/verify-multi-clinic-onboarding.mjs`
- פלט: `multi_clinic_onboarding_preview_passed`
- תרחישים: `redirects, staff_invite, owner_invite, single_use, email_binding, mfa, clinic_switch, tenant_isolation`

**מסקנה:** תנאי הקבלה ההנדסיים של 3.5 עברו.

## 7. 3.6 — פרטיות, זכויות ו־retention

### מה הושלם הנדסית

- בקשות עיון, תיקון, ייצוא, מחיקה וביטול הסכמה נשמרות במסלול RPC מאומת.
- זהות הבעלים והמרפאה נגזרות בצד השרת.
- בקשות פתוחות כפולות מתכנסות לרשומה אחת גם בתחרות.
- בעלים רואה רק את בקשותיו; מנהל AAL2 מנהל רק את מרפאתו.
- דוח retention הוא read-only ואינו מוחק מידע.
- fixtures מכסים לפני הגבול, בדיוק בגבול, אחרי הגבול, מועד חסר וכבר נמחק.
- קיימים DPIA, מפת מידע, רישום ספקים, מדיניות retention ונוהל תפעולי.

### מה אינו יכול להיסגר בבדיקת קוד

- אישור משפטי של מדיניות פרטיות, תנאי שימוש, הסכמות ו־DPA.
- החלטה סופית על Controller/Processor, סיווג המאגר וחובות רישום/הודעה.
- אישור ספקי משנה והעברות מידע לחו״ל, לרבות Supabase וספק AI.
- אישור תקופות retention והפעלת מנגנון אכיפה בפועל.
- תרגיל תפעולי מלא של בקשת זכויות ואירוע אבטחה.

**מסקנה:** התשתית ההנדסית עברה; השער המשפטי והמסחרי נשאר `NO-GO` עד אישור גורם מקצועי.

## 8. חבילת הקבלה שהורצה

### Preview קבוע

הפקודה המוגנת `tools/supabase-baseline/verify-p0-preview.ps1` מאמתת מראש שהיעד הוא `fajwhkgafbjgnbgwsumt` ושאינו Production. היא הריצה:

- קטלוג: 46 טבלאות ציבוריות, 80 Policies, ‏14 Storage Policies, ‏HNSW אחד ו־4 buckets פרטיים.
- מטריצת תפקידים ושתי מרפאות.
- Auth hardening ברמת המסד.
- Auth lifecycle, סיסמאות, invite, recovery ו־session revoke.
- MFA לכל שבע פונקציות Edge.
- Storage HTTP וקישורים חתומים.
- onboarding לשתי מרפאות.
- בדיקת תחרות אמיתית בין שני חיבורי PostgreSQL נפרדים ל־owner claim.
- ניסיון INSERT ישיר ל־`owners` ממשתמש מאומת, שנחסם כמצופה.
- חסימת גישה אנונימית לטבלאות הרגישות.
- ניקוי אוטומטי של משתמשים, הזמנות, מרפאות וקבצים סינתטיים.

פלט סופי: `P0 Preview acceptance passed; Production was not targeted.`

### בדיקות מאגר

| בדיקה | תוצאה |
|---|---|
| `npm run test:vetbot` | `PASS` — 200 בדיקות מקור וכל חבילות אינטגרציית המסד |
| `npm run test:supabase-baseline` | `PASS` — שתי הקמות נקיות, 26 מיגרציות, Auth/Storage ו־DB lint |
| `npm run test:accessibility` | `PASS` — 7/7 |
| `npm run typecheck:ai` | `PASS` |
| `npm run typecheck:edge` | `PASS` באמצעות Deno זמני; לא נוספה תלות לפרויקט |
| `npm run test:frontend-secrets` | `PASS` |
| `npm run build` | `PASS`; קיימת רק אזהרת chunk size מוכרת |
| `git diff --check` | `PASS`; אזהרות CRLF בלבד |

### בדיקות Supabase Advisor ו־DB lint ב־Preview

- `supabase db lint --level warning`: ‏`PASS` — לא נמצאו שגיאות סכימה.
- Security Advisor: נמצאה אזהרה אחת על `public.set_updated_at()` ללא `search_path` קבוע. זו פונקציית trigger ותיקה; יש להקשיח אותה במיגרציה additive לפני Production.
- Security Advisor: ‏32 פונקציות `SECURITY DEFINER` חשופות ל־`authenticated`. מרביתן RPC מכוונים של המוצר ונבדקו בהרשאות, tenant isolation ו־MFA; לפני Production יש לבצע allowlist סופי של grants ולוודא שאין פונקציה עודפת.
- חמש טבלאות פנימיות עם RLS וללא policy דווחו ברמת `INFO`. הגישה הישירה אליהן חסומה במכוון והמסלולים המאושרים עוברים דרך RPC/שרת.
- Performance Advisor: ‏44 foreign keys ללא אינדקס מכסה, 34 קבוצות של policies permissive מקבילים ו־62 אינדקסים שלא נצפו בשימוש בסביבת Preview הצעירה. אלו ממצאי ביצועים ל־P1 ולא כשל קבלה פונקציונלי; אין למחוק אינדקסים על בסיס Preview בלבד.
- Auth משתמש כרגע בהקצאה קבועה של עד 10 חיבורי DB. לפני הגדלת compute יש לעבור להקצאה באחוזים בהתאם להנחיית Supabase.

קישורי תיקון: [search path](https://supabase.com/docs/guides/database/database-linter?lint=0011_function_search_path_mutable), [SECURITY DEFINER grants](https://supabase.com/docs/guides/database/database-linter?lint=0029_authenticated_security_definer_function_executable), [RLS ללא policy](https://supabase.com/docs/guides/database/database-linter?lint=0008_rls_enabled_no_policy), [אינדקסים ל־foreign keys](https://supabase.com/docs/guides/database/database-linter?lint=0001_unindexed_foreign_keys), [policies מקבילים](https://supabase.com/docs/guides/database/database-linter?lint=0006_multiple_permissive_policies), [Production checklist](https://supabase.com/docs/guides/deployment/going-into-prod).

## 9. שינויים שבוצעו בסביבת ה־Preview בלבד

- הופעלה הגנה מפני סיסמאות שדלפו.
- נפרסו מחדש שבע פונקציות Edge מהקוד הנוכחי של `Full_Demo` כדי ליישר את שכבת MFA.
- נוצרו ונוקו fixtures סינתטיים של Auth, Storage ושתי מרפאות.
- לא הוחל SQL ולא נפרסה פונקציה ל־Production.

## 10. מה עדיין חוסם לקוחות אמיתיים

1. SMTP ודומיין שולח מאומתים, כולל בדיקת מסירה אמיתית להרשמה, הזמנה ושחזור.
2. אישור משפטי כתוב למסמכי הפרטיות, ההסכמות, DPA ותקופות retention.
3. מנגנון אכיפת retention ותרגיל זכויות מלא לאחר אישור המדיניות.
4. CI ירוק על commit קפוא, הגנת `master` ו־release candidate משותף.
5. ניטור, התראות, backup/restore, נוהל אירוע ו־promotion rehearsal.
6. E2E עסקי מלא על הגרסה המדויקת שתהיה מועמדת ל־Production.
7. סגירת אזהרת `search_path` של `public.set_updated_at()` וביקורת allowlist סופית ל־grants של פונקציות `SECURITY DEFINER`.

אלו אינם מבטלים את תוצאות P0 ההנדסיות, אך הם מונעים עדיין הכרזה שהמערכת מוכנה למכירה ולעבודה עם מידע אמיתי.

## 11. מצב Git והפצה

- כל שינויי הקוד נמצאים ב־`Full_Demo` בלבד.
- קיימים שינויים מקומיים שטרם בוצע להם commit.
- לא בוצעו commit, push, merge ל־`master` או פריסה ל־Production בסבב זה.
- ה־working tree הקיים נשמר; לא בוצעו reset, stash או מחיקה של עבודת משתמש.

## 12. מסקנה לניסן

החסמים ההנדסיים של 3.1–3.5 אינם עוד בגדר המלצה בלבד: הם מומשו ונבדקו ב־Supabase Local וב־Preview מבודד. 3.6 הושלמה ברמת התשתית והבדיקות, אך נותרה תלויה בהחלטות ואישורים משפטיים ותפעוליים. לפני לקוח אמיתי יש להשלים את שבעת הסעיפים בפרק 10 ולבצע קבלת release candidate אחת סופית. אין עדיין אישור ל־merge ל־`master` או לפריסה ל־Production.
