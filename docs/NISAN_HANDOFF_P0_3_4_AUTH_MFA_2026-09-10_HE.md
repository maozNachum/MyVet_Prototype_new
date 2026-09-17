# מסירה לניסן — P0 3.4 הקשחת Auth ו־MFA

**תאריך:** 10.09.2026

**סטטוס:** PASS הנדסי ב־Preview; מסירת אימייל דרך SMTP עדיין תנאי לפני Production

**סביבה חיה שנבדקה:** `p0-completion-3-2-3-4-3-6` / `gvdjgktrutpikognuocm`

**Production:** לא שונה

ענף ה־Preview נמחק לאחר שמירת הראיות כדי לעצור חיוב נוסף. הגדרת SMTP עתידית תיבדק בענף חדש ומבודד.

## מה נסגר

- סיסמה חדשה או מאופסת דורשת 12 תווים, אות גדולה, אות קטנה, מספר וסימן מיוחד.
- הגנת HaveIBeenPwned הופעלה ב־Preview. הבדיקה דורשת במפורש שגיאת `weak_password` עם הסיבה `pwned`; שגיאת Auth כללית אינה נחשבת הצלחה.
- Refresh token rotation, תוקף JWT, timebox של 12 שעות וניתוק לאחר שעה ללא פעילות הוגדרו ב־Preview.
- TOTP מחויב למנהל מרפאה ולווטרינר. `aal1` נחסם ב־RLS ובכל שבע פונקציות ה־Edge; `aal2` מתקבל לאחר challenge ואימות.
- שינוי תפקיד, השבתת עובד, מחיקת עובד או שינוי משתמש Auth משויך מבטלים sessions בצד השרת.
- מסלול הזמנה נבדק עד אימות token, הגדרת סיסמה וכניסה.
- מסלול שחזור נבדק עד אימות token, קביעת סיסמה חדשה וכניסה איתה.
- `medical-record-rag` תוקן כך שדרישת MFA נבדקת לפני חיפוש משאב מטופל, כדי לא לחשוף הבדל תגובה לפני אימות חזק.

## קבצים ומימוש

- `supabase/migrations/20260909073817_harden_staff_auth_and_mfa.sql`
- `src/services/authSecurity.ts`
- `src/app/pages/StaffMfa.tsx`
- `src/app/pages/Login.tsx`
- `src/app/pages/Layout.tsx`
- `supabase/functions/medical-record-rag/index.ts`
- `scripts/verify-auth-lifecycle.mjs`
- `tests/authHardening.test.ts`
- `docs/AUTH_HARDENING_POLICY_HE.md`
- `tools/supabase-baseline/verify-p0-preview.ps1`

## ראיות קבלה

- `auth_hardening_passed` — RLS, תפקידים, `aal1`/`aal2` וביטול sessions.
- `edge_mfa_preview_passed:7` — ללא JWT התקבל 401; ב־`aal1` התקבל `MFA_REQUIRED`; token ב־`aal2` עבר את מחסום ה־MFA.
- `auth_invite_recovery_preview_passed` — מסלולי token של הזמנה ושחזור עברו.
- `auth_lifecycle_preview_passed` — שינוי תפקיד, כניסה מחדש, השבתה ו־refresh revocation עברו.
- Supabase Security Advisor אינו מציג עוד את `auth_leaked_password_protection`.

## מה עדיין נדרש לפני Production

אין SMTP מאומת ותיבת קבלה ייעודית, ולכן לא הוכחה מסירת האימייל בפועל להרשמה, הזמנה ושחזור. יש להגדיר ספק SMTP, SPF/DKIM/DMARC וכתובת בדיקה, ואז לבדוק קבלה, קישור, תפוגה, שימוש חוזר ושגיאת כתובת לא קיימת. מאחר שענף ה־Preview נמחק, יש גם להפעיל ולאמת מחדש את leaked-password protection ואת יתר הגדרות Hosted ב־Staging קבועה. אין להפעיל את ההגדרות ב־Production לפני בדיקות אלה ואישור מפורש.

Gate B נשאר NO-GO עד השלמת SMTP וכן משימות 3.3 ו־3.5 ובדיקת onboarding, invite/revoke ובידוד שתי מרפאות על release candidate משותף.
