# MyVet Production Readiness Audit

> **מסמך היסטורי:** זהו snapshot מ־25 באוגוסט 2026. מקור האמת העדכני לאחר בדיקות Supabase Local, תיקון ה־baseline ועדכון התלויות הוא `docs/MYVET_PRODUCTION_READINESS_AUDIT_FINAL_2026-08-28.md`.

**תאריך הביקורת:** 25 באוגוסט 2026  
**ענף שנבדק:** `Full_Demo`  
**Commit שנבדק:** `12584a1`  
**סוג הביקורת:** קריאה, הרצת בדיקות מקומיות וניתוח סטטי בלבד — ללא שינוי קוד, ללא SQL מרוחק וללא פריסה.

> המסמך בוחן מוכנות לקוח אמיתי ולא רק מוכנות להצגת פרויקט גמר. קביעות על Supabase חי, גיבויים, הגדרות Auth, ספקי AI ודין מסומנות כלא־מאומתות כאשר לא הייתה בדיקה בסביבה מבודדת. הפרק המשפטי אינו ייעוץ משפטי.

## מתודולוגיה ומגבלות

- נסרקו מבנה הפרויקט, קוד ה־Frontend, Edge Functions, migrations, RLS, Storage, מסמכי התפעול והבדיקות.
- בוצעו בדיקות מקומיות: build, type check של תשתית AI, 185 בדיקות VetBot, בדיקת Secrets בחבילת Frontend, בדיקת diff ותלויות.
- הופעל שרת מקומי ונבדקה טעינת `/login` ב־HTTP. לא התאפשרה בדיקת דפדפן מלאה או E2E חזותי בסשן זה.
- לא נקראה תכולת `.env`, לא נעשה שימוש בפרטי לקוחות ולא בוצעה פעולה ב־Production.
- `test:anon-access` ו־`test:ai-data-integration` לא הורצו, משום שלא הייתה סביבת Supabase Preview מבודדת ומאומתת.
- לא הותקן Deno, ולכן קובצי הכניסה של Edge Functions לא עברו type check מלא. ממצא OCR בפרק 7 ממחיש את חשיבות הפער.
- ביקורת האבטחה והנתונים בוצעה במבנה היררכי של מפקח־על, מפקח תחום וסוכני בדיקה. סבב המוצר/QA הושלם על ידי מפקח־העל לאחר שמכסת הסוכנים הסתיימה.

---

## 1. Executive Summary

MyVet הוא מוצר רחב ובעל בסיס מרשים לפרויקט גמר: מערכת React בעברית וב־RTL, Supabase כמערכת Backend, פורטל צוות, פורטל בעלים, תורים, תיק רפואי, DigitalCare, מלאי, מעבדה, אשפוזים, דוחות ותשתית AI מודולרית. ה־build והבדיקות המקומיות עוברות, קיימות שכבות RLS משמעותיות, פעולות בעלים רגישות אחדות עברו ל־RPC, קבצים רפואיים מתוכננים כפרטיים, ורוב יכולות ה־AI החדשות כבויות כברירת מחדל.

עם זאת, המערכת **אינה מוכנה עדיין להפעלה עם מרפאה אמיתית ומידע רפואי אמיתי**. ארבעת החסמים העיקריים הם:

1. אין baseline מלא ומוכח שמאפשר להקים את מסד הנתונים מאפס מהריפו בלבד.
2. מצב ה־RLS, ה־grants, ה־migrations, ה־Storage וה־Edge Functions לא אומת בפועל בסביבת Supabase Preview נקייה.
3. אין תהליך גיבוי ושחזור מוכח עם RPO/RTO ותרגול שחזור.
4. חסרות השלמות משפטיות ותפעוליות מהותיות לפרטיות, שמירת מידע, ספקי משנה, אירועי אבטחה וזכויות נושאי מידע.

קיימים גם סיכוני יישום חשובים: שמירת ביקור רפואי במספר כתיבות ללא טרנזקציה, מרוץ בקביעת תור מצד צוות, הזזה וביטול תור בעלים שלא עוברים RPC אטומי, OCR עם שגיאת import והרשאת שמירה רחבה מדי כאשר הדגל יופעל, rate limit בזיכרון מקומי בלבד, Retention של DigitalCare ללא scheduler אמין, וללא observability מרכזי.

**מסקנה:** מוכנות טובה לדמו סינתטי מבוקר; מוכנות **לא מספקת לפיילוט עם לקוח אמיתי**. לאחר השלמת Phase 0 ו־Phase 1 שבפרק 22, הארכיטקטורה הקיימת יכולה לשרת בבטחה 5–10 מרפאות ראשונות בלי מעבר למיקרו־שירותים.

---

## 2. Current Architecture

### 2.1 מבנה בפועל

- **Frontend:** React 18 + TypeScript + Vite, ניתוב עם React Router, Tailwind CSS, React Hook Form ו־Zod.
- **Backend:** Supabase — PostgreSQL, Auth, RLS, RPC, Storage, Realtime ו־Edge Functions.
- **AI:** Edge Functions עם AI Gateway משותף, Provider Adapters, Prompt Registry, Schemas, Feature Flags ו־Audit metadata.
- **Hosting:** Vercel עבור SPA; `vercel.json` כולל rewrite ל־`index.html`.
- **State/Data:** contexts ו־stores בצד הלקוח, לצד קריאות ישירות ל־Supabase מתוך pages, components ו־services.

### 2.2 גבולות אמון

```text
דפדפן צוות/בעלים
  ├─ Supabase Auth
  ├─ PostgREST + RLS
  ├─ RPC עבור פעולות אטומיות נבחרות
  ├─ Storage פרטי + Signed URLs
  └─ Edge Functions מאומתות JWT
       └─ AI Gateway / Providers
```

RLS ופונקציות השרת הן גבול האבטחה האמיתי. guards המבוססים על `localStorage`, לדוגמה הרשאת מסך דוחות, הם חוויית משתמש בלבד ואינם יכולים להיחשב הרשאה.

### 2.3 התאמה להיקף ראשון

הארכיטקטורה מתאימה ל־5–10 לקוחות ראשונים, בתנאי שמחזקים isolation, migrations, observability, backup ופעולות רפואיות אטומיות. אין הצדקה כעת למיקרו־שירותים, Kubernetes או message broker נפרד.

---

## 3. What Already Works Well

- כל שבע Edge Functions מוגדרות עם `verify_jwt = true` ב־`supabase/config.toml`.
- פונקציות שרת מרכזיות משתמשות ב־`auth.getUser()` ובהקשר תפקיד/מרפאה שמתקבל מהשרת.
- אין `service_role` או API key רגיש בחבילת Frontend שנבדקה.
- migrations כוללות RLS, `FORCE ROW LEVEL SECURITY`, `search_path` מוגדר, revoke מ־`public` ו־grants מצומצמים בחלק גדול מפונקציות האבטחה.
- קיימת תשתית tenant עם `clinic_id` וקשרים מורכבים בין מרפאה, בעלים, חיה ורשומות AI.
- הזמנת תור חדשה של בעלים מתבצעת ב־`myvet_owner_book_appointment` עם ownership, זמינות ונעילה ברמת טרנזקציה.
- קבצי AI/DigitalCare/מסמכים מתוכננים ל־Storage פרטי ול־Signed URLs קצרי תוקף.
- AI Gateway כולל validation, timeout, טיפול בכשל, Prompt Registry, adapters ואישור אנושי לפני פעולות רפואיות.
- Audit של AI הוא metadata-only והיסטוריית אישורים מוגנת משינוי.
- יכולות RAG, OCR, client summary ו־follow-up כבויות כברירת מחדל במסלול הדמו הבטוח.
- ממשק עברי ו־RTL עקבי ברוב המערכת, Heebo, מצבי loading/error/empty, focus-visible, skip links ו־reduced motion.
- פורטל הלקוחות בנוי mobile-first ומונע הצגת טיוטות AI לפי התכנון וה־policies המקומיים.
- קיימת קליטת CSV/XLS/XLSX לחיות ומידע רפואי נלווה — בסיס שימושי לאונבורדינג ידני.
- מסך התורים הנוכחי כבר כולל חיווי טווח, מסננים פעילים ואיפוס, תצוגות מותאמות ומקשי זמן גלויים; חלק מממצאי UX ישנים כבר תוקנו.
- 185 בדיקות VetBot עוברות, production build עובר ו־dependency tree תקין.

---

## 4. Critical Blockers

| ID | חסם | מדוע הוא חוסם לקוח אמיתי | תנאי סגירה |
|---|---|---|---|
| B-01 | אין baseline מלא למסד | לא ניתן לשחזר מערכת חדשה או סביבת DR מהריפו בלבד | schema dump נקי, migrations מסודרים והרצה מאפס ב־Preview |
| B-02 | אין אימות Supabase חי מבודד | RLS, grants, Storage ו־RPC עלולים להיות שונים מהקוד | פרויקט Preview נפרד + negative tests לכל תפקיד/tenant |
| B-03 | גיבוי ושחזור לא הוכחו | אובדן מידע רפואי או קבצים ללא דרך שחזור בדוקה | מדיניות, RPO/RTO, גיבוי DB+Storage ותרגיל restore מתועד |
| B-04 | שערים משפטיים/פרטיות פתוחים | המערכת מטפלת במידע אישי ורפואי רגיש ובהעברות לספקים | DPA, מיפוי מידע, retention, זכויות, אירועים וחוות דעת משפטית |
| B-05 | פעולות ליבה רפואיות אינן אטומיות | שמירת ביקור יכולה להסתיים ברשומה חלקית | RPC/transaction שרתית, idempotency ובדיקות failure injection |

---

## 5. Security Findings

### 5.1 ממצאים מרכזיים

- **הרשאות OCR:** `supabase/functions/document-ocr/index.ts` מאפשר גם לבעלים מורשה לעבור למסלול `save`, ואז משתמש ב־service-role לכתיבה ל־`vaccinations`. הדגל כבוי ולכן זהו סיכון חבוי, אך חובה להפריד extraction מ־clinical approval לפני הפעלה.
- **Owner appointment mutations:** פורטל הבעלים מזיז תור ב־`UPDATE` ומבטל ב־`DELETE` ישיר. ה־RLS בודק ownership וזמינות, אך update מאפשר שדות מעבר לתאריך והביטול מוחק היסטוריה. יש להעביר ל־RPC ייעודי עם allowlist שדות, נעילה אטומית ו־status=`cancelled`.
- **Magic bytes:** OCR בודק תוכן קובץ; DigitalCare מסתמך בעיקר על MIME/metadata מוצהרים. נדרש sniffing, quarantine ומגבלות אחידות.
- **Rate limiting:** `supabase/functions/_shared/ai/rateLimit.ts` מבוסס `Map` בזיכרון instance ולכן אינו rate limit מבוזר.
- **Audit:** קיימים לוגי AI, אבל אין audit תפעולי מלא לקריאה/שינוי ברשומות רפואיות, שינוי הרשאות ופעולות מנהל.
- **Auth hardening:** הטופס דורש מינימום שש תווים, אות באנגלית ומספר. MFA, CAPTCHA, lockout ובקרות Supabase Dashboard לא אומתו.
- **Security headers:** אין בקוד הגדרת CSP, frame-ancestors, Referrer-Policy או Permissions-Policy.
- **Frontend role guards:** מידע תפקיד ב־`localStorage` אינו חסם אבטחה; כל מסך חייב להישען על RLS/שרת. מצב זה לא אומת מול מסד חי.

### 5.2 פרטיות ודין

תיקון 13 לחוק הגנת הפרטיות הרחיב את ההגדרות ואת כלי האכיפה; פטור מרישום מאגר אינו פוטר מחובות אבטחה, שקיפות ושימוש כדין. ראו [שאלות ותשובות רשמיות — תיקון 13](https://www.gov.il/he/pages/tikun13_qa?chapterIndex=6) ו־[חוק הגנת הפרטיות](https://main.knesset.gov.il/Activity/Legislation/Laws/pages/lawprimary.aspx?lawitemid=2000234).

לפני Production נדרשים לכל הפחות:

- מיפוי מטרות עיבוד, קטגוריות מידע, מורשי גישה וספקי משנה.
- בחינה של העברת מידע מחוץ לישראל ושל ספקי AI/Hosting; ראו [הנחיית הרשות להעברת מידע לחו״ל](https://www.gov.il/BlobFolder/legalinfo/infoabroad/he/infoabroad.pdf).
- DPIA מלא וסקירה משפטית; כלי הרשות הוא כלי עזר ואינו תחליף לחוות דעת: [כלי DPIA](https://mojforms.justice.gov.il/mojaemprivacyprotectionauthority/dpiaform.html).
- מסמך הגדרות מאגר, סקר סיכונים, ניהול הרשאות ולוגים בהתאם להנחיות האכיפה: [פעולות אכיפה](https://www.gov.il/he/pages/enforcementact?chapterindex=5) ו־[שאלות אבטחת מידע](https://www.gov.il/he/pages/data_security_fqa?chapterIndex=7).

---

## 6. Database & Migration Findings

### חוזקות

- 26 migrations מתועדות בריפו.
- קיימים constraints, foreign keys, indexes, RLS ו־tenant-aware RPC משמעותיים.
- פונקציות booking המאוחרות מסננות `clinic_id` בתוך השאילתה ולא לאחריה.
- `appointments.status` נוסף עם constraint ו־trigger שמונע מבעלים לשנות status.

### פערים

1. **אין schema baseline מלא.** מסמכי הפרויקט עצמם מציינים שה־migrations אינם dump היסטורי מלא. migrations רבים משתמשים ב־`if exists` או מניחים טבלאות legacy.
2. **מצב applied לא מוכח.** קיימות הצהרות במסמכי handoff על migrations שהוחלו, אך לא בוצע אימות עצמאי מול Preview/Production.
3. **שמירת ביקור אינה טרנזקציה אחת.** `TreatmentModal.tsx` כותב visit, vaccinations, exams, problems, diagnoses, prescriptions, lab orders ומשקל במספר בקשות, ואז מבצע rollback ידני.
4. **Staff booking הוא check-then-insert.** `AppointmentStore.tsx` בודק חפיפה ואז מבצע insert נפרד; שני משתמשים יכולים לעבור את הבדיקה במקביל.
5. **Owner reschedule אינו אטומי.** ה־policy מפעיל `myvet_slot_is_bookable`, אך אין advisory lock כמו ב־booking RPC.
6. **Owner cancellation מוחק.** `ClientPortal.tsx` מוחק appointment במקום לשמר audit/status.
7. **status עלול להתרחק מהמציאות.** הדשבורד מסיק טיפול לפי `medical_visits.appointment_id`, בעוד היומן קורא `appointments.status`; שמירת ביקור לא מעדכנת status באותה טרנזקציה.
8. **הגירת נתונים רחבה חסרה.** import קיים הוא UI רב־שלבי ולא job idempotent, ניתן לחידוש ובעל דוח שגיאות.

### שינויי Supabase עדכניים שיש להביא בחשבון

לפי [Supabase Changelog](https://supabase.com/changelog), טבלאות חדשות אינן נחשפות אוטומטית ל־Data/GraphQL API בסביבות חדשות. לכן כל migration צריך לכלול באופן מפורש grants והגדרות Data API, ולא להסתמך על default של פרויקט ישן.

---

## 7. Backend Findings

- אין backend REST נפרד; Edge Functions, RPC ו־RLS הם ה־backend העסקי. זה תקין להיקף הנוכחי, אך מחייב שכל mutation רגיש ייכנס ל־RPC או Edge Function.
- `document-ocr/index.ts` מייבא `runtimeEnv` מ־`featureFlags.ts`, שאינו מייצא אותו. הייצוא נמצא ב־`gateway.ts`. הפונקציה צפויה להיכשל בטעינה/פריסה.
- `tsconfig.ai-infrastructure.json` אינו כולל את קובצי `index.ts` של Edge Functions; לכן ה־type check עבר למרות שגיאת OCR.
- OCR משתמש בדגלי environment בלבד ולא ב־feature flag ברמת מרפאה. הפעלה סביבתית עלולה לפתוח את היכולת לכל ה־tenants.
- DigitalCare retention מתבצע best-effort בבקשות עתידיות מאותה מרפאה, עד עשר רשומות; אין cron/scheduler, retry או alert.
- ב־DigitalCare קיימת אפשרות למרוץ בין יצירת path מקומי לבין session קיים שה־RPC מחזיר; חתימת URL צריכה להסתמך על path סופי מהשרת.
- VetBot כולל compatibility fallback שקורא ישירות לספק מתוך Edge Function במקום לעבור בכל מסלול ה־Gateway המשותף.
- טיפול בשגיאות בצד הלקוח אינו אחיד; יש שימוש נרחב ב־`console.error` ו־toast, ללא error codes וקורלציה חוצת שכבות.

---

## 8. Frontend Findings

### חוזקות

- lazy loading של routes ורכיבים משותפים.
- RTL ושפה עברית ברוב המסכים.
- מצבי loading, empty, success ו־error קיימים בזרימות מרכזיות.
- אין secrets ב־bundle שנבדק.

### פערים

- `index.html` מוגדר `lang="en"` והכותרת היא `MyVet_Prototype`; נדרש `he`, `dir="rtl"` ושם מוצר Production.
- אין `ErrorBoundary`/`errorElement` ברמת האפליקציה. חריגת render עלולה להפיל מסך שלם.
- רכיבים מרכזיים גדולים מאוד: `ClientPortal.tsx` מעל 3,000 שורות, `DigitalCare.tsx` מעל 2,700, ורכיבי טיפול/לקוחות/מטופלים מעל 1,300. זה מגדיל סיכון לרגרסיה וקושי בבדיקה.
- אין guard לאובדן עריכות, autosave או `beforeunload` בטפסים רפואיים ארוכים.
- קיימת תלות ב־Google Fonts ובתמונות Unsplash חיצוניות; יש סיכון פרטיות, זמינות וביצועים.
- build מציג chunks מעל 500KB; `xlsx` וה־main bundle דורשים lazy loading מדויק יותר.
- אין ספריית E2E/בדיקות UI התנהגותיות. רוב בדיקות ה־Frontend הן static/source assertions.
- guards של מסכים לפי `localStorage` עלולים ליצור UX לא עקבי כאשר הפרופיל משתנה; האבטחה חייבת להישאר בשרת.

---

## 9. UX/UI Findings

### מצב טוב

- מסך התורים מציג במפורש “תמונת מצב היום”; הוא אינו מתיימר לתאר את טווח היומן.
- מסננים פעילים מוצגים עם מונה ואפשרות איפוס.
- משבצות זמן פנויות נגישות כלחצנים גם ללא hover.
- קיימות תצוגות יום/שבוע/חודש ומבנה mobile מותאם יותר מגרסאות קודמות.
- בפורטל יש touch targets סבירים, ניווט נייד ו־RTL.

### פערים לפני לקוח אמיתי

- אין בדיקת דפדפן מלאה לרוחבי מסך, zoom 200%, reader/keyboard ו־screen reader בסבב זה.
- אין ניהול טיוטה או אזהרת יציאה מטפסי ביקור; אובדן מידע הוא סיכון UX ותפעול.
- הודעות שגיאה רבות ממפות סוגי כשל שונים להודעה כללית; משתמש אינו יודע אם מדובר בהרשאה, זמינות, רשת או validation.
- `lang="en"` פוגע בהקראת עברית ובנגישות.
- שימוש בתמונות חיצוניות ובמסכי ענק מעלה סיכון לזמני טעינה חלשים ברשת מרפאה.
- נדרש smoke test ידני על desktop, tablet ושני רוחבי mobile לפני כל release.

---

## 10. Workflow/Product Findings

### תורים

- שלוש זרימות קיימות: צוות, בעלים ו־VetBot.
- booking של בעלים ו־VetBot משתמש בפעולות שרת מאומתות; booking צוות עדיין אינו אטומי.
- reschedule בעלים מבצע update ישיר; cancel מבצע delete ישיר. נדרש workflow של reschedule/cancel עם audit ו־status.
- יצירת medical visit אינה משלימה באותה פעולה את appointment status, ולכן דשבורד ויומן עלולים להציג מצבים שונים.

### תיק רפואי

- המודל עשיר וכולל ביקור, בדיקה, אבחנות, מרשמים, מעבדה וחיסונים.
- שמירה מרובת־שלבים ללא טרנזקציה היא הסיכון התפעולי הגדול ביותר.
- אין audit כללי שמציג מי צפה או שינה רשומה רפואית.

### DigitalCare

- שיחת וידאו יכולה להמשיך כאשר AI כבוי — תכנון נכון.
- הסכמה, תמלול וסיכום בנויים כזרימות מאושרות, אך לא אומתו מול ספק אמיתי ו־Storage חי.
- retention דורש scheduler אמין.

### אונבורדינג ותפעול מרפאה

- אין מסך מלא ליצירת מרפאה, הזמנת אנשי צוות, בחירת tenant וניהול roles.
- הרשמת בעלים מקושרת hard-coded ל־slug `myvet-primary`; זה חוסם SaaS multi-clinic אמיתי.
- יש import של חיות מקובץ, אך אין job מבוקר לכל נתוני מרפאה, preview מפורט, idempotency ו־rollback שרתי.
- אין billing/subscription/trial. תשלום הפורטל מסומן במפורש כהדגמה בלבד.

---

## 11. AI Findings

### בשלות טובה בקוד

- Gateway, adapters, prompt versions, model configuration, schemas, timeout, retries בטוחים, feature flags ו־kill switches.
- Data minimization ו־redaction בדפדפן ובשרת.
- human-in-the-loop עבור תוכן רפואי ופעולות עסקיות.
- metadata-only audit ומניעת prompt/response רפואי בלוג רגיל.
- הפרדה בין Visit Summary, DigitalCare, RAG, OCR, Client Summary ו־Follow-up.

### פערים

- RAG לא אומת מול pgvector/HNSW/Provider אמיתי; עליו להישאר כבוי.
- OCR אינו נטען בשל import שגוי, לא אומת מול ספק אמיתי וקיימת הרשאת save בעייתית.
- Client Summary ו־Follow-up Suggestions נבדקו עם mock בלבד; עליהן להישאר כבויות.
- rate limiter אינו מבוזר.
- compatibility fallback של VetBot עוקף חלק ממסלול Gateway.
- אין מדדי איכות קליניים מאושרים, dataset הערכה, hallucination rate או sign-off רפואי.
- אין חוזה ספק AI/DPA/retention מאומת.

### מצב דגלים מומלץ עד לסגירת פערים

```text
AI_RAG_INDEX_ENABLED=false
AI_RAG_QA_ENABLED=false
AI_DOCUMENT_OCR_ENABLED=false
AI_VACCINATION_OCR_ENABLED=false
AI_CLIENT_SUMMARY_ENABLED=false
AI_FOLLOW_UP_SUGGESTIONS_ENABLED=false
AI_ALLOW_MOCK_PROVIDER=false
```

---

## 12. Infrastructure & Deployment Findings

- Vercel מותאם ל־SPA rewrite בלבד; אין headers מאובטחים בקובץ ההגדרות.
- אין CI/CD בריפו, אין branch protection מתועד ואין required checks.
- אין Docker/Compose או bootstrap מלא למסד מקומי.
- אין health/readiness endpoint.
- אין תצורת IaC או רישום מוכח של Dev/Staging/Production נפרדים.
- Edge Functions וה־migrations דורשים פריסה ידנית; אין pipeline שמוודא סדר, drift ו־rollback.
- Node המקומי הוא 22.14.0, התואם לשינוי ש־Supabase פרסמה לגבי סיום תמיכת Node 20 ב־`supabase-js` לאחר 30 ביוני 2026.
- נדרש lock על גרסת Node ב־CI/hosting והפרדת secrets מלאה בין סביבות.

---

## 13. Testing & QA Findings

### תוצאות בפועל

| בדיקה | תוצאה |
|---|---|
| `npm run test:vetbot` | PASS — 185/185 |
| `npm run typecheck:ai` | PASS |
| `npm run test:frontend-secrets` | PASS |
| `npm run build` | PASS — 1,831 modules; אזהרת chunks גדולים |
| `git diff --check` | PASS |
| `npm ls` | PASS |
| טעינת `/login` בשרת מקומי | PASS ברמת HTTP/HTML |
| בדיקת דפדפן E2E | NOT RUN — כלי browser לא היה זמין |
| `test:anon-access` | NOT RUN — אין Preview מבודד |
| `test:ai-data-integration` | NOT RUN — אין Preview מבודד |
| Edge Functions type check מלא | NOT RUN — Deno אינו מותקן וה־tsconfig אינו כולל entrypoints |

### איכות הכיסוי

- בדיקות רבות משתמשות ב־Node test, mocks, regex וקריאת קוד; הן מועילות לרגרסיה אך אינן מוכיחות behavior בדפדפן או RLS חי.
- PGlite משמש בחלק מבדיקות SQL, אך אינו תחליף ל־Supabase Auth/RLS/Storage מלא.
- אין Playwright/Cypress/Vitest/React Testing Library בריפו.
- אין failure injection לפעולות רפואיות מרובות כתיבות.
- אין בדיקות concurrency לתורים, no-double-booking ו־reschedule.
- אין load test, soak test או baseline ביצועים.

### Dependencies

`npm audit --omit=dev` מצא חולשה ישירה בדרגת High ב־`react-router@7.18.1` עם תיקון ב־7.18.2. האזהרה מתייחסת ל־RSC; הפרויקט משתמש ב־BrowserRouter ולא נמצא RSC, אך יש לעדכן ולבדוק לפני Production. ראו [GHSA-qwww-vcr4-c8h2](https://github.com/advisories/GHSA-qwww-vcr4-c8h2).

ב־dev dependencies נמצאו גם advisories ב־nanoid, tar ו־postcss: [GHSA-2v37-7h3g-55p8](https://github.com/advisories/GHSA-2v37-7h3g-55p8), [GHSA-r292-9mhp-454m](https://github.com/advisories/GHSA-r292-9mhp-454m), [GHSA-fxqj-rqcc-2cmp](https://github.com/advisories/GHSA-fxqj-rqcc-2cmp).

---

## 14. Monitoring & Logging

### קיים

- AI request IDs, latency, status ו־metadata מצומצם.
- console logs ושגיאות מקומיות.
- Vercel/Supabase מספקים לוגי פלטפורמה, אך הגדרתם לא אומתה.

### חסר

- Error tracking מרכזי עם release/version, route, tenant pseudonym ו־correlation ID.
- dashboard לזמינות, error rate, latency, Edge failures, DB saturation ו־Storage failures.
- alerts עם owner ו־runbook.
- audit תפעולי לרשומות רפואיות והרשאות.
- מדדי SLO ו־uptime.
- מדיניות log retention והוכחה שאין PII/PHI בלוגים.

**דרישת מינימום לפיילוט:** Sentry או חלופה, Vercel/Supabase alerts, מזהה בקשה חוצה שכבות, runbook אירועים ו־on-call מוגדר.

---

## 15. Backup & Disaster Recovery

אין ראיה לביצוע שחזור אמיתי. checklist או “backup דרך dashboard” אינם תרגיל DR.

### מצב נדרש

- גיבוי DB אוטומטי ובדיקת PITR בהתאם לתוכנית Supabase.
- גיבוי/שחזור ל־Storage רפואי, לא רק למסד.
- רישום secrets/config/migrations הדרושים להקמה מחדש.
- תרגיל restore לסביבה מבודדת, כולל בדיקת tenant isolation לאחר השחזור.
- runbook עם אנשי קשר, סדר פעולות, rollback ותקשורת ללקוח.

### יעדי MVP מומלצים

- **RPO יעד:** עד שעה אחת למידע קליני פעיל.
- **RTO יעד:** עד ארבע שעות.

אלה יעדי עסק מומלצים, **לא יכולת נוכחית מאומתת**. יש לאשר עלות ותמיכת ספק לפני התחייבות חוזית.

---

## 16. Multi-Tenancy

### קיים

- `clinic_id` נוסף לרוב הישויות הרגישות.
- פונקציות `private.myvet_current_clinic_id` ו־`private.myvet_is_clinic_staff` משמשות לסינון שרתי.
- booking המאוחר מסנן זמינות, חסימות ותורים לפי clinic בתוך השאילתה.
- owner access מקושר ל־`auth_user_id`, owner ו־pet.

### פערים

- אין מבחן חי שבו צוות מרפאה א׳ מנסה לקרוא/לשנות כל ישות של מרפאה ב׳.
- hard-coded clinic slug בהרשמת בעלים מונע onboarding תקין של tenant חדש.
- אין clinic switch/admin UI ואין lifecycle של tenant.
- אין audit על שינוי role ושיוך מרפאה.
- owner update/delete על appointments רחב מדי ברמת הפעולה.
- migrations היסטוריים מותנים עלולים להשאיר tenant gaps אם סדר/מצב המסד שונה.

---

## 17. Data Migration / Customer Onboarding

### מה קיים

- import חיות מקובצי CSV/XLS/XLSX.
- mapping לשדות בסיסיים ולחלק מהיסטוריה רפואית, חיסונים ומעבדה.
- preview ו־rollback ידני בחלק מהזרימה.

### מה חסר ללקוח אמיתי

- תבנית import רשמית, dictionary שדות ודוגמאות אנונימיות.
- validation report לפני כתיבה.
- job שרתי idempotent עם progress, resume ו־audit.
- deduplication לבעלים/חיות/חיסונים.
- transaction או staging tables.
- התאמת קבצים ומסמכים רפואיים ל־Storage.
- reconciliation report לאחר import ואישור המרפאה.
- onboarding checklist: clinic, staff, roles, hours, services, inventory, templates ו־privacy notices.

לפיילוט ראשון ניתן לבצע onboarding ידני ומפוקח, אך אין להציג כרגע self-service onboarding.

---

## 18. Documentation

### חוזקות

- קיימים מסמכי context, Supabase architecture, collaboration, AI handoff, demo, production runbook ו־DPIA.
- AGENTS.md מגדיר היטב כללי פרטיות, UX, תורים ו־Definition of Done.

### פערים ואי־דיוקים

- README מציין Vitest, אך הסקריפטים בפועל משתמשים ב־Node `--test`.
- README מציג migrations כמקור אמת מלא, בעוד מסמכים אחרים מציינים שאין baseline היסטורי מלא.
- מסמכי Production שונים אינם מסכימים על מספר migrations/functions שהוחלו.
- אין ADRs להחלטות tenant, audit, booking ו־clinical transaction.
- אין API/RPC catalog, data dictionary או ERD מעודכן.
- אין deployment manifest שמציג גרסת Frontend, migrations ו־Edge Functions יחד.
- אין runbook מפורט ל־incident, backup restore, user offboarding ו־data subject requests.

---

## 19. Production Readiness Scores

| תחום | ציון | הסבר קצר |
|---|---:|---|
| Architecture | 62 | stack מתאים והפרדת שכבות סבירה; חסרים baseline, transactional workflows וגבולות שירות עקביים |
| Backend | 53 | RPC/Edge טובים בחלק מהזרימות; OCR שבור, retention לא אמין ופעולות רגישות ישירות |
| Frontend | 60 | מוצר רחב ושימושי; רכיבים ענקיים, אין ErrorBoundary/E2E/unsaved guard |
| Database | 45 | RLS ו־constraints עשירים; אין הקמה נקייה מוכחת ואין טרנזקציה לביקור |
| Security | 50 | עקרונות טובים; אימות חי, audit, headers, OCR ו־rate limit עדיין פתוחים |
| Authentication | 57 | Supabase Auth ואימות שרת קיימים; MFA/anti-abuse/policy חי לא אומתו |
| Authorization | 49 | tenant-aware RLS בקוד; owner mutations ו־live negative tests חסרים |
| UX/UI | 69 | עברית/RTL, mobile ותורים ברמה טובה; נגישות חיה ושמירת טיוטות חסרות |
| Workflow/Product | 55 | כיסוי מוצר רחב; atomicity, onboarding, status consistency ו־billing חסרים |
| AI | 58 | ארכיטקטורה אחראית; רוב היכולות לא אומתו אמיתית ו־OCR אינו deployable |
| Testing | 52 | 185 בדיקות עוברות; אין E2E/live RLS/concurrency/failure injection |
| DevOps | 29 | build deployable; אין CI/CD, environment promotion או drift control |
| Monitoring | 24 | AI metadata קיים; אין error tracking, SLO, alerts או health checks |
| Backup & DR | 18 | מסמכי checklist בלבד, ללא restore drill או RPO/RTO מוכחים |
| Documentation | 70 | תיעוד רב; קיימות סתירות וחסר operational source of truth |
| **Overall** | **49** | מוכן לדמו מבוקר, לא ללקוח אמיתי לפני סגירת חסמי Phase 0/1 |

---

## 20. Pilot Readiness – YES/NO

### לקוח אמיתי עם מידע אמיתי: **NO**

הסיבות: baseline DB חסר, RLS/Storage לא אומתו ב־Preview, גיבוי/שחזור לא נבדקו, workflow ביקור אינו אטומי ושערי פרטיות/משפט פתוחים.

### דמו סינתטי ומפוקח: **YES, בתנאים**

- להשתמש בנתונים סינתטיים בלבד.
- להשאיר RAG/OCR/client summary/follow-up כבויים.
- לא להציג payment כסליקה אמיתית.
- לא להציג יכולות ספק AI כמאומתות אם הופעלו עם mock.
- לא להחיל migrations או לפרוס Edge Functions ל־Production במסגרת הדמו.

---

## 21. Minimum Requirements for First Customer

1. יצירת Supabase Staging/Preview נפרד וטעינת baseline מלא מאפס.
2. הרצת כל migrations ו־Edge Functions ב־Preview והפקת deployment manifest.
3. RLS negative matrix בפועל: staff roles, owner, cross-clinic, cross-pet, storage paths ו־RPC tampering.
4. הפיכת שמירת ביקור רפואי לטרנזקציה שרתית idempotent.
5. RPC אטומי ל־staff booking ול־owner reschedule/cancel; ביטול כ־status ולא delete.
6. תיקון OCR והשארתו כבוי עד בדיקת ספק והרשאות.
7. גיבוי DB+Storage ותרגיל שחזור מתועד.
8. error tracking, alerts, correlation ID ו־incident runbook.
9. MFA למנהלים/וטרינרים, hardening Auth ו־staff invite lifecycle.
10. DPA, privacy notice, retention, ספקי משנה, transfer review ו־legal sign-off.
11. E2E קריטי: login, appointment, visit save, owner portal, DigitalCare ללא AI.
12. תיקון `lang/dir/title`, security headers ועדכון react-router.
13. onboarding ידני מתועד למרפאה הראשונה ובדיקת import על עותק אנונימי.
14. release checklist ו־rollback שאינם תלויים בזיכרון של המפתחים.

---

## 22. Prioritized Roadmap

### Phase 0 — Blockers

| משימה | עדיפות | סיכון | תלות | מורכבות | בעלים | חוסם |
|---|---|---|---|---|---|---|
| baseline schema מלא והרצה מאפס ב־Preview | P0 | אובדן יכולת שחזור/drift | פרויקט Preview | L | DB/Platform | כן |
| בדיקות RLS/Storage/RPC שליליות חיות | P0 | דליפת tenant/מידע | baseline | L | Security/DB | כן |
| טרנזקציה שרתית לשמירת ביקור | P0 | רשומה רפואית חלקית | schema מאומת | L | Backend/DB | כן |
| backup DB+Storage ותרגיל restore | P0 | אובדן מידע | Preview/backup plan | L | Platform | כן |
| פרטיות, DPA, retention ו־legal gate | P0 | חשיפה משפטית | מיפוי ספקים | M | Legal/Security | כן |
| תיקון OCR import והרשאת save | P0 לפני הפעלה | כתיבה רפואית לא מורשית | Edge tests | M | Backend/Security | כן להפעלת OCR |

### Phase 1 — Pilot Ready

| משימה | עדיפות | סיכון | תלות | מורכבות | בעלים | חוסם |
|---|---|---|---|---|---|---|
| RPC אטומי ל־staff booking/reschedule/cancel | P1 | double booking/מחיקת audit | DB Preview | M | Backend/DB | כן |
| סנכרון appointment status עם ביקור | P1 | מצב תפעולי שגוי | RPC ביקור | S | Backend/Product | כן |
| CI: build, tests, secrets, migrations, Edge typecheck | P1 | רגרסיה בפריסה | baseline | M | DevOps | כן |
| E2E לזרימות קריטיות | P1 | תקלות UX לא מזוהות | Preview users | L | QA | כן |
| Sentry/observability/alerts | P1 | תקלה ללא גילוי | env separation | M | Platform | כן |
| Auth hardening + MFA + staff invites | P1 | השתלטות חשבון | admin workflow | M | Security/Product | כן |
| ErrorBoundary + unsaved-changes guard | P1 | קריסה/אובדן טופס | ללא | M | Frontend | לא |
| HTML locale, headers ו־dependency patch | P1 | נגישות/hardening | test suite | S | Frontend/DevOps | לא |
| onboarding ידני ותהליך import מאומת | P1 | נתוני לקוח שגויים | staging copy | M | Product/Data | כן |

### Phase 2 — Production Ready

| משימה | עדיפות | סיכון | תלות | מורכבות | בעלים | חוסם |
|---|---|---|---|---|---|---|
| audit תפעולי מלא לרשומות והרשאות | P2 | חוסר עקיבות | retention policy | L | Security/DB | לא לפיילוט מוגבל |
| distributed rate limiting | P2 | abuse/cost | shared store | M | Backend | לא |
| scheduler אמין ל־retention | P2 | שמירה מעבר למדיניות | cron/queue | M | Platform | לא |
| import jobs idempotent + reconciliation | P2 | onboarding ידני בלבד | baseline | L | Data/Backend | לא |
| performance budgets ו־bundle split | P2 | חוויית רשת חלשה | E2E | M | Frontend | לא |
| self-service clinic onboarding | P2 | עומס תפעולי | tenant lifecycle | L | Product | לא |
| billing/subscription | P2 | אין מוניטיזציה אוטומטית | commercial model | L | Product/Finance | לא לפיילוט ללא חיוב |

### Phase 3 — Scale

| משימה | עדיפות | סיכון | תלות | מורכבות | בעלים | חוסם |
|---|---|---|---|---|---|---|
| load/soak tests ו־capacity planning | P3 | bottlenecks | telemetry | M | Platform/QA | לא |
| DR exercise מחזורי ו־multi-region review | P3 | אסון אזורי | stable production | L | Platform | לא |
| enterprise SSO ו־advanced RBAC | P3 | לקוחות גדולים | customer demand | XL | Security/Product | לא |
| analytics warehouse אנונימי | P3 | עומס על OLTP | data governance | XL | Data | לא |
| אימות קליני מתקדם ליכולות AI | P3 | איכות רפואית | legal/provider approval | XL | Clinical/AI | לא |

---

## 23. Recommended Architecture for First 5–10 Customers

### להישאר עם הארכיטקטורה הקיימת

- React/Vite ב־Vercel.
- Supabase Auth + PostgreSQL + RLS + Storage + Edge Functions.
- מסד multi-tenant משותף עם `clinic_id`, constraints ו־RLS — לא DB נפרד לכל לקוח בשלב זה.
- RPC/Edge Function לכל mutation רפואי, הרשאה, תשלום, booking או פעולה מרובת טבלאות.
- קריאות read פשוטות יכולות להמשיך דרך Supabase client כאשר RLS מכסה אותן.

### להוסיף שכבת תפעול מינימלית

- שלושה פרויקטים/סביבות מבודדים: Development, Staging, Production.
- pipeline חד־כיווני: migrations → Edge Functions → Frontend, עם manifest ו־rollback.
- CI חובה לפני merge.
- error tracking, metrics, alerts ו־correlation IDs.
- backup/PITR ו־restore drills.
- distributed rate limit ו־scheduled retention.
- feature flags server-side לכל tenant.

### לא לפצל עדיין

אין צורך במיקרו־שירותים, Kubernetes, Kafka, data lake או צוות SRE ייעודי. המורכבות העיקרית כרגע היא correctness ואבטחה, לא throughput.

---

## 24. Things We Should Explicitly NOT Build Yet

- אפליקציות iOS/Android native.
- agents רפואיים אוטונומיים או פעולות AI ללא אישור אדם.
- הרחבת RAG/OCR לפני אימות ספק, הרשאות ודיוק.
- אבחון, מינון או מרשם אוטומטי.
- multi-region active-active.
- microservices, Kubernetes או message broker נפרד.
- data warehouse ו־BI enterprise.
- marketplace, white-label או עשרות סוגי תפקידים.
- מנוע אופטימיזציה מתקדם לתורים.
- billing מורכב לפני שמודל מסחרי אושר.
- התאמות ייחודיות לכל מרפאה לפני בניית תהליך onboarding בסיסי יציב.

---

## 25. Final Recommendation

**לא להעלות כרגע מידע של מרפאה אמיתית ל־MyVet.** יש להמשיך להשתמש במערכת כדמו סינתטי ולהקפיא את יכולות ה־AI שלא אומתו. במקביל יש להשלים Phase 0 בסביבת Preview מבודדת ולא ב־Production.

הארכיטקטורה אינה דורשת שכתוב. הדרך הנכונה היא hardening ממוקד:

1. להפוך את מסד הנתונים לשחזור ומאומת.
2. להעביר פעולות רפואיות ותורים קריטיות לטרנזקציות שרתיות.
3. להוכיח isolation, backup ו־restore.
4. להוסיף observability ו־E2E.
5. לסגור את שערי הפרטיות והחוזים.

לאחר השלמת התנאים האלה וביצוע שבוע pilot פנימי עם נתונים סינתטיים, ניתן לבצע פיילוט מוגבל במרפאה אחת, עם onboarding ידני, תמיכה צמודה ויכולות AI מתקדמות כבויות.

---

## Findings Register

| ID | ממצא | תחום | חומרה | למה חשוב | מיקום/ראיה | המלצה |
|---|---|---|---|---|---|---|
| F-001 | אין baseline schema מלא | DB | BLOCKER | אין שחזור או הקמה נקייה מוכחים | `supabase/migrations`, מסמכי architecture/handoff | schema dump + clean-room migration test |
| F-002 | מצב RLS/Storage/Grants חי לא אומת | Security | BLOCKER | isolation עשוי להיות שונה מהריפו | בדיקות Preview שלא הורצו | פרויקט Preview + negative matrix |
| F-003 | אין restore drill | DR | BLOCKER | סכנת אובדן מידע רפואי | `docs/PRODUCTION_RUNBOOK_HE.md` | DB+Storage restore exercise |
| F-004 | שערים משפטיים פתוחים | Privacy | BLOCKER | עיבוד מידע אישי ורפואי ללא אישור מלא | `docs/VETBOT_PRIVACY_DPIA_HE.md` | DPA, retention, DPIA, counsel |
| F-005 | שמירת ביקור אינה אטומית | Clinical DB | CRITICAL | רשומה רפואית חלקית | `src/app/components/TreatmentModal.tsx` | RPC transaction + idempotency |
| F-006 | OCR save זמין גם לבעלים מורשה | Authorization | CRITICAL בעת הפעלה | בעלים יכול לכתוב vaccination דרך service role | `supabase/functions/document-ocr/index.ts` | extraction לבעלים; save רק staff/vet approval |
| F-007 | OCR import שבור | Backend | HIGH | Edge Function עלולה לא לעלות | `document-ocr/index.ts:3` | import מ־gateway + Edge typecheck |
| F-008 | OCR flag אינו tenant-aware | Multi-tenancy | HIGH | הפעלה סביבתית לכל המרפאות | `document-ocr/index.ts` | `ai_feature_flags` לפי clinic |
| F-009 | staff booking check-then-insert | Workflow | HIGH | double booking במקביל | `src/app/data/AppointmentStore.tsx` | atomic RPC/advisory lock |
| F-010 | owner reschedule update ישיר | Workflow | HIGH | race ושדות רחבים מדי | `ClientPortal.tsx:1340-1377` | owner reschedule RPC עם allowlist |
| F-011 | owner cancel מוחק תור | Audit | HIGH | אובדן היסטוריה | `ClientPortal.tsx:1396-1403` | status cancelled + audit |
| F-012 | appointment status לא מסונכרן לביקור | Product | HIGH | יומן ודשבורד חלוקים | `Dashboard.tsx`, `TreatmentModal.tsx` | עדכון status באותה טרנזקציה |
| F-013 | rate limit בזיכרון instance | AI/Security | HIGH | עקיפה ב־scale/cold start | `_shared/ai/rateLimit.ts` | distributed limiter |
| F-014 | retention תלוי בבקשות עתידיות | Privacy/Backend | HIGH | קבצים נשמרים מעבר למדיניות | `digitalcare-transcription/index.ts` | scheduled job + retries/alerts |
| F-015 | אין audit תפעולי מלא | Security | HIGH | אין עקיבות לרשומות והרשאות | migrations/logging | immutable operational audit |
| F-016 | signup קשור ל־`myvet-primary` | Multi-tenancy | HIGH | אין onboarding למרפאה נוספת | `20260719123000_secure_owner_signup.sql` | invite/clinic-bound signup token |
| F-017 | DigitalCare ללא magic-byte validation מלא | File Security | HIGH | קובץ מזויף/מסוכן | `digitalcare-transcription/index.ts` | sniffing + quarantine/scanning |
| F-018 | AI Edge entrypoints לא ב־typecheck | QA | HIGH | build ירוק עם function שבורה | `tsconfig.ai-infrastructure.json` | Deno check לכל function |
| F-019 | אין E2E דפדפן | QA | HIGH | זרימות UI לא מוכחות | `package.json`, `tests` | Playwright critical journeys |
| F-020 | אין CI/CD | DevOps | HIGH | שחרור ידני ורגרסיות | אין `.github/workflows` | required pipeline/checks |
| F-021 | אין observability מרכזי | Operations | HIGH | תקלות אינן נראות בזמן | console usage בלבד | error tracking + alerts + SLO |
| F-022 | אין MFA/anti-abuse מוכח | Auth | HIGH | סיכון השתלטות חשבון | `Login.tsx`, Dashboard לא נבדק | MFA staff/admin + CAPTCHA/rate limit |
| F-023 | אין unsaved changes protection | UX | HIGH | אובדן עבודה קלינית | חיפוש בקוד לא מצא guard | draft/autosave/navigation guard |
| F-024 | אין ErrorBoundary | Frontend | MEDIUM | חריגה מפילה route | routes/app | global + route boundaries |
| F-025 | `lang="en"` וכותרת prototype | Accessibility | MEDIUM | הקראה ומיתוג שגויים | `index.html` | `he`, RTL, title Production |
| F-026 | Security headers לא מוגדרים | Web Security | MEDIUM | clickjacking/XSS hardening חלש | `vercel.json` | CSP/frame/referrer/permissions |
| F-027 | components גדולים מאוד | Maintainability | MEDIUM | רגרסיות וקושי בבדיקה | `ClientPortal.tsx`, `DigitalCare.tsx` ועוד | extraction הדרגתי לפי workflow |
| F-028 | bundle chunks גדולים | Performance | MEDIUM | זמן טעינה ברשת חלשה | build output | lazy load xlsx/heavy flows |
| F-029 | assets חיצוניים | Privacy/UX | MEDIUM | tracking/זמינות | `Login.tsx`, `ClientPortal.tsx`, styles | self-host fonts/images |
| F-030 | README ומסמכי deployment סותרים | Docs | MEDIUM | טעויות תפעול | `README.md`, docs | single release manifest/source of truth |
| F-031 | VetBot fallback עוקף Gateway משותף | AI | MEDIUM | מדיניות לא אחידה | `ai-assistant/index.ts` | compatibility adapter בתוך Gateway |
| F-032 | advisory ב־react-router | Dependencies | MEDIUM | חוב אבטחה ישיר | `package-lock.json` | עדכון ל־7.18.2+ ובדיקות |
| F-033 | import לקוחות אינו job idempotent | Onboarding | MEDIUM | כפילויות/partial import | `Clients.tsx`, `petImport*` | staging + server job + reconciliation |
| F-034 | payment הוא demo בלבד | Product | LOW לפיילוט חינמי | אין סליקה אמיתית | `ClientPortal.tsx`, AGENTS.md | לא להציג כסליקה; לדחות billing |

---

## TOP 10 — הפעולות המיידיות החשובות ביותר

1. להקים Supabase Preview מבודד ולבנות אותו מאפס מ־baseline מלא.
2. להריץ מטריצת RLS/Storage/RPC שלילית בין שתי מרפאות, שני בעלים ותפקידים שונים.
3. להפוך שמירת ביקור רפואי ל־RPC טרנזקציוני ו־idempotent.
4. להגדיר גיבוי DB+Storage ולבצע restore drill עם RPO/RTO מתועדים.
5. להעביר staff booking ו־owner reschedule/cancel ל־RPC אטומי ולשמר ביטולים כ־status.
6. לתקן את OCR import והרשאת save ולהשאיר את הדגל כבוי עד אימות ספק.
7. להוסיף CI מלא: build, tests, secrets, migrations ו־Deno check לכל Edge Function.
8. להוסיף E2E ל־login, booking, visit save, owner portal ו־DigitalCare ללא AI.
9. להוסיף monitoring, error tracking, alerts, correlation IDs ו־incident runbook.
10. להשלים DPA, retention, DPIA, מדיניות פרטיות, העברות לספקים ואישור משפטי לפני מידע אמיתי.

---

## Rollback של הביקורת

הביקורת לא שינתה קוד, מסד נתונים, secrets או סביבות. הקובץ היחיד שנוסף הוא מסמך זה. אין rollback תפעולי; ניתן להסיר את קובץ ה־Markdown אם אינו רצוי.
