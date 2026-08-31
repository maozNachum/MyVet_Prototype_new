# MyVet — בדיקות עומק משלימות לחסמי עבודה עם לקוחות אמיתיים

**תאריך:** 30 באוגוסט 2026  
**ענף:** `Full_Demo`  
**מסקנה:** **FAIL — קיימים חסמי אבטחה ותפעול לפני שימוש בנתוני לקוחות אמיתיים**  
**Production:** קריאה בלבד. לא הוחל SQL, לא שונה מידע, לא נפרסה פונקציה ולא בוצע Deploy.  
**סביבת בדיקה:** Supabase Staging קבוע `myvet-staging`, Supabase Local נקי ודפדפן מקומי. נעשה שימוש בנתונים סינתטיים בלבד וב־rollback.

## מטרת המסמך

הדוח הראשי מכסה את תוכנית ה־Production Readiness המקורית. מסמך זה מרכז תרחישי תקיפה ותפעול עמוקים שנוספו מעבר לרשימת התרחישים המפורשת: השבתת עובד לאחר שכבר העלה קובץ, זהות בעלים עמומה בין מרפאות, ניסיון לעקוף את טופס ההרשמה, תקינות CI על checkout נקי ובדיקות Advisor חיות. תוצאות הנושאים החופפים עודכנו גם בדוח הראשי.

## סטטוס כללי

| שער משלים | סביבה | תוצאה | משמעות |
|---|---|---|---|
| שלילת גישת קבצים מעובד מושבת | Staging, JWT סינתטי | **FAIL** | עובד עם `is_active=false` עדיין ראה קובץ רפואי שהעלה |
| שיוך בעלים עם אימייל זהה בשתי מרפאות | Staging, transaction + rollback | **FAIL** | `claim_owner_profile()` קישר רשומה אחת במקום להיכשל באופן בטוח |
| עקיפת ולידציית הרשמה בכתיבה ישירה | Supabase Local נקי | **FAIL** | משתמש Auth חדש הוסיף רשומת `owners` לא תקינה ללא טופס/תנאים |
| בידוד בסיסי בין שתי מרפאות ובעלים | Staging, JWT matrix | PASS | תרחישי הקריאה הבסיסיים שנבדקו נחסמו כראוי |
| גישה אנונימית לטבלאות ליבה | Production, read-only | PASS | שבע טבלאות ליבה לא ניתנות לקריאה ל־anon |
| תורים וביקור רפואי אטומיים | Staging/Local | PASS | חפיפות, retry, rollback, isolation ו־idempotency עברו |
| HNSW טבעי | Staging, 5,000 וקטורים סינתטיים | PASS | `EXPLAIN` בחר באינדקס הווקטורי ללא כפיית planner |
| הקמה נקייה מהמיגרציות | Local + Staging | PASS | 43 טבלאות, 78 policies, 14 Storage policies ו־4 buckets פרטיים |
| הגנת סיסמאות שדלפו | Production Advisor, read-only | **FAIL** | ההגנה כבויה |
| CI על checkout נקי | סקירת repository | **FAIL** | workflow אינו tracked וסורק `dist` לפני build |
| בדיקת אינטגרציה Stage 2 | Local command | BLOCKED | חסרים משתני `STAGE2_TEST_SUPABASE_*`; לא נספרה כ־PASS |

## 1. עובד מושבת ממשיך לקרוא קובץ רפואי

### מה נבדק

נוצרו משתמש וצוות סינתטיים וקובץ רפואי פרטי ב־Staging. נבדקה הקריאה לפני ואחרי שינוי `staff.is_active` ל־`false`.

### תוצאה

- לפני השבתה: אובייקט אחד נראה — צפוי.
- לאחר השבתה: אותו אובייקט עדיין נראה — לא צפוי.
- הנתונים הסינתטיים בוטלו ב־rollback.

### שורש הבעיה

מדיניות Storage מאפשרת לבעל האובייקט (`storage.objects.owner = auth.uid()`) לקרוא את הקובץ גם כאשר חברות הצוות במרפאה כבר אינה פעילה. בעלות טכנית על אובייקט אינה צריכה לגבור על lifecycle ההרשאה העסקית של קובץ רפואי.

### תנאי סגירה

1. לחייב חברות פעילה במרפאה בכל מסלול קריאה של קובץ רפואי.
2. להסיר או לצמצם את חריג ה־owner עבור buckets רפואיים.
3. להוסיף בדיקת רגרסיה: העלאה כעובד, השבתה, SELECT/Download/Signed URL חייבים להיחסם.

## 2. שיוך בעלים עמום בין מרפאות

### מה נבדק

נוצרו שתי רשומות בעלים לא מקושרות, בשתי מרפאות שונות, עם אותו אימייל מאומת. הופעלה `claim_owner_profile()` בזהות משתמש סינתטית.

### תוצאה

הפונקציה קישרה אחת משתי הרשומות במקום להחזיר מצב עמום ולדרוש הכרעה. זהו כשל fail-open בגבול Multi-Tenancy.

### תנאי סגירה

1. לבצע claim רק כאשר קיימת התאמה יחידה ומוכחת.
2. כאשר יש יותר מהתאמה אחת — לא לשנות נתונים ולהחזיר שגיאה עסקית בטוחה.
3. להשתמש בהזמנה חד־פעמית או בהקשר מרפאה מאומת בצד השרת; לא להסתמך על אימייל לבדו.

## 3. עקיפת ולידציית ההרשמה

### מה נבדק

ב־Supabase Local נקי, עם מרפאה פעילה אחת, נוצר משתמש Auth סינתטי ללא `staff` או `owner`. המשתמש ניסה להוסיף ישירות ל־`public.owners` רשומה עם שמות ריקים ופרטי קשר לא תקינים, ללא תהליך תנאים או טופס.

### תוצאה

ה־INSERT התקבל. המשמעות היא שהוולידציה ב־React אינה גבול אבטחה וניתן לעקוף אותה באמצעות בקשה ישירה.

### תנאי סגירה

1. לבטל הרשאת INSERT ישיר ל־`owners` מהדפדפן.
2. להעביר הרשמה ל־RPC או Edge Function אטומי.
3. לאמת בצד השרת clinic, שדות חובה, תקינות אימייל/טלפון, הסכמה ומניעת כפילות.
4. להוסיף בדיקות שליליות לבקשות PostgREST ישירות.

## 4. Supabase Advisors

### Production — קריאה בלבד

- Security Advisor: ‏23 ממצאים.
  - 3 טבלאות AI עם RLS וללא Policy — fail-closed מכוון עבור שירותי שרת.
  - `public.set_updated_at` עם `search_path` mutable.
  - 18 אזהרות על פונקציות `SECURITY DEFINER` שניתנות להרצה ל־authenticated; נדרשת סקירה לפי פונקציה, לא ביטול גורף.
  - leaked-password protection כבוי — ממצא HIGH מאומת.
- Performance Advisor: ‏196 ממצאים.
  - 41 foreign keys ללא אינדקס תומך.
  - 118 אינדקסים שלא נצפו בשימוש.
  - 36 קבוצות של multiple permissive policies.
  - אזהרת חיבורי Auth אבסולוטיים.

### Staging

- Security Advisor: ‏29 ממצאים.
- Performance Advisor: ‏146 ממצאים.
- המספרים אינם כשלעצמם הוכחת חולשה; הם רשימת עבודה. אין למחוק אינדקסים או policies באופן אוטומטי ללא מדידות וסקירת הרשאות.

## 5. CI ו־Release Candidate

### ממצאים

- `.github/workflows/ci.yml` קיים רק כקובץ untracked ולכן אינו מגן בפועל על הענף ב־GitHub.
- ב־checkout נקי `dist/` אינו קיים, אך ה־workflow מריץ `test:frontend-secrets` לפני `build`; הסקריפט דורש `dist` ולכן הסדר צפוי להיכשל.
- חבילת `tools/supabase-baseline` אינה tracked ואינה gate ב־CI.
- `deno.lock` אינו tracked, בעוד בדיקת Edge משתמשת במצב frozen.
- אין full frontend type-check, browser E2E, migration/schema gate, dependency audit gate או Staging smoke gate.
- `.codex-auto-resume/` אינו מוחרג ב־`.gitignore` ואסור שייכנס ל־release candidate.

### תנאי סגירה

1. להכניס ל־Git רק קבצי release שנבדקו, בלי `.codex-auto-resume` ובלי credentials.
2. להריץ build לפני סריקת bundle, או לפצל את הסריקה ל־source ו־bundle.
3. להוסיף baseline/schema gate ו־negative authorization tests.
4. להגן על `master` כך שמיזוג ידרוש CI ירוק וסקירה.

## 6. חבילת בדיקות שהורצה

### PASS

- Production build — 1,833 מודולים.
- `typecheck:ai`.
- Deno check לכל 7 Edge Functions.
- `test:vetbot` — 218/218.
- Privacy — 4/4.
- AI infrastructure — 19/19.
- AI data security — 14/14.
- AI data local — 11/11.
- Visit summary — 36/36.
- DigitalCare AI — 35/35.
- RAG AI — 11/11.
- Document OCR — 10/10.
- Appointments — 16/16.
- Medical visits — 17/17.
- Client summary — 18/18.
- Follow-up suggestions — 19/19.
- Hardening — 6/6.
- Accessibility foundation — 6/6.
- Anonymous access — 7/7 טבלאות ליבה חסומות.
- Frontend secrets scan.
- `npm audit --omit=dev` — 0 חולשות בחבילת Production.
- `git diff --check` — ללא שגיאות; אזהרות line endings בלבד.
- Local clean-room baseline — שתי הקמות מלאות.
- Guarded Staging acceptance — catalog, role matrix, ביקור, RAG runtime, HNSW וניקיון.

### FAIL

- שלילת Storage מעובד מושבת.
- owner claim כאשר אותו אימייל קיים בשתי מרפאות.
- חסימת INSERT ישיר ולא תקין ל־`owners`.
- leaked-password protection ב־Production.
- CI פעיל ותקין על checkout נקי.

### BLOCKED או חלקי

- `test:ai-data-integration` — חסרים משתני Preview ייעודיים.
- browser E2E מלא — לא קיימת חבילה אוטומטית; smoke מקומי היה חלקי בלבד.
- בדיקות עומס, חדירה מקצועית, malware scanning, retention scheduler ו־Production restore — לא בוצעו.

## 7. מצב סביבות ו־Feature Flags

- Production לא שונה.
- Staging מכיל נתונים סינתטיים בלבד; בדיקות ה־transaction בוטלו ולא נשארו רשומות הבדיקה שנוצרו לצורך תרחישי התקיפה.
- Supabase Local נעצר לאחר הבדיקות.
- יכולות AI שלא אומתו עם ספק אמיתי נשארות כבויות לפי דוח המוכנות הראשי.
- לא בוצעו commit, push, merge או deploy.

## 8. החלטת שער מסחרי

**המערכת אינה מוכנה עדיין ללקוחות אמיתיים.** לפני Pilot עם מידע רפואי אמיתי יש לסגור לפחות:

1. F-022 — revoke מלא לעובד מושבת ב־Storage.
2. F-023 — claim בעלים חד־משמעי ו־fail-closed.
3. F-024 — הרשמה בצד השרת ללא INSERT ישיר ל־`owners`.
4. F-026 — leaked-password protection וסקירת Auth/MFA.
5. CI תקין על release candidate נקי.
6. ניטור, DR, משפט/פרטיות ו־E2E כפי שמפורט בדוח הראשי.

לאחר תיקון שלושת חסמי ההרשאה יש להריץ מחדש את אותן בדיקות שליליות ב־Staging, ורק אז לעדכן את סטטוס השער.
