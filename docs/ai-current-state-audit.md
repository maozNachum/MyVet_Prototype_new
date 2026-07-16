# MyVet — מיפוי מצב קיים של שכבת ה־AI

עודכן: 16.07.2026  
שלב: 0 — Audit בלבד  
ענף: `Full_Demo`  
Commit שנבדק: `c993acc`  
סביבת Supabase שנבדקה: `Nisan&Maoz-my-vet` (`eu-west-1`, PostgreSQL 17)  

## 1. גבולות הבדיקה

בשלב זה בוצעו קריאת קוד, שאילתות מטא־דאטה לקריאה בלבד, קריאת לוגים, בדיקות אוטומטיות ובניית Production. לא שונה קוד פונקציונלי, לא הופעלה Migration, לא שונתה Policy, לא נפרסה Edge Function ולא נכתב מידע עסקי למסד הנתונים.

ערכי סודות, טוקנים ונתוני משתמשים לא נקראו ולא תועדו. נבדקו רק שמות משתני סביבה, מבנה סכימה, ספירות ומטא־דאטה.

## 2. מפת המערכת

### Frontend

- React 18, Vite 6.3.5, React Router 7.13, TypeScript ו־Tailwind 4.
- אזור צוות: דשבורד, תורים, לקוחות, מטופלים ותיק רפואי, מלאי, DigitalCare, אשפוזים, מעבדה, מחירון ודוחות.
- אזור בעלים: `/portal` ו־`/owner-preview` דרך `ClientPortal.tsx`.
- Supabase client יחיד נוצר ב־`src/services/supabaseClient.ts` באמצעות `VITE_SUPABASE_URL` ו־`VITE_SUPABASE_ANON_KEY`.
- אין Vercel AI SDK בפרויקט. הקריאה לספק המודל נעשית ישירות מ־Supabase Edge Function.

### Auth ותפקידים

- צוות מאומת מול `staff.auth_user_id` ותומך ב־`clinic_admin`, `vet`, `nurse`, `secretary`.
- בעלים מאומת מול `owners.auth_user_id` ומקבל תפקיד `owner` רק במצב `portal`.
- ה־Edge Function אינה סומכת על התפקיד שנשלח מהדפדפן ומכריעה אותו מחדש בשרת.
- הסכימה הנוכחית היא למעשה של מרפאה אחת: אין `clinic_id` בטבלאות הליבה ואין הפרדת tenant בין מרפאות. לכן לא ניתן כרגע להוכיח בדיקת “מרפאה א׳ מול מרפאה ב׳” שנדרשת במפרט העתידי.

### Supabase

- נמצאו 31 טבלאות ב־`public`; RLS מסומן כפעיל בכולן.
- טבלאות AI קיימות: `vetbot_action_requests`, `vetbot_audit_logs`, `vetbot_feedback`, `vetbot_knowledge`.
- Buckets קיימים: `documents`, `chat-attachments`; שניהם פרטיים.
- אין כיום טבלאות תמלול, הקלטות, הסכמות AI, chunks או embeddings.
- הרחבת `vector` אינה מותקנת. חיפוש הידע הקיים אינו RAG אלא חיפוש מילות מפתח על עד 30 רשומות ב־`vetbot_knowledge`.

## 3. מפת VetBot הקיים

### נקודות כניסה

VetBot משולב בדשבורד, יומן תורים, מלאי, DigitalCare, תיק רפואי, לקוחות, דוחות ופורטל הבעלים. בנוסף הוא משמש למיפוי כותרות בקובץ ייבוא בעלי חיים, כאשר שורות הנתונים עצמן אינן אמורות להישלח.

### זרימת מידע

1. `aiContextBuilder.ts` בונה הקשר בהתאם למסך ולתפקיד.
2. `aiProactiveEngine.ts` יוצר תדריך מקומי ללא ספק חיצוני.
3. `aiSanitizer.ts` מסיר מזהים בדפדפן.
4. `aiClient.ts` קורא ל־`ai-assistant` עם JWT המשתמש.
5. הפונקציה מאמתת משתמש ותפקיד, מסירה מזהים שוב ומפעילה שאילתות עם הקשר ה־JWT ולכן תחת RLS.
6. הפונקציה קוראת ל־Gemini ומבקשת JSON מובנה.
7. הפלט מנורמל ומושחר לפני הצגה.
8. נשמר audit metadata בלבד; לא נשמרים prompt או response.

### ספק ומודלים

- ספק: Google Gemini Developer API, קריאת REST ישירה מ־Edge Function.
- משתני שרת: `GEMINI_API_KEY`, `GEMINI_MODEL`, `ALLOWED_ORIGINS`, וכן משתני Supabase המנוהלים בשרת.
- ברירת מחדל: `gemini-3.5-flash`; fallback: `gemini-2.5-flash`.
- `gemini-3.5-flash` הוא מודל Stable עדכני ותומך structured outputs לפי [Google AI Models](https://ai.google.dev/gemini-api/docs/models/gemini-3.5-flash) ו־[Structured outputs](https://ai.google.dev/gemini-api/docs/structured-output?lang=rest).
- לא נמצא מנגנון timeout, rate limit, budget, token accounting, kill switch או feature flag לקריאות החיצוניות.

### כלי קריאה

| כלי | שימוש | נתונים עיקריים |
|---|---|---|
| `clinic_priorities` | דשבורד ודוחות | ספירות תורים, אשפוזים, פניות, חיובים ומעבדה לפי תפקיד |
| `schedule_pressure` | תורים | עומס שבעה ימים ושיבוצים חסרים |
| `inventory_alerts` | מלאי | ספירות מלאי נמוך וקריטי |
| `digital_triage` | DigitalCare | ספירת פניות פתוחות ודחופות |
| `clinic_knowledge` | ידע | התאמת מילות מפתח לידע מרפאה מאושר |

### פעולות מותרות עם אישור אנושי

- קביעת תור, שינוי מועד וביטול תור.
- שינוי כמות מלאי.
- ארכוב/שחזור שיחה ושינוי דחיפות רגיל/דחוף.
- שינוי דחיפות תפעולית של בדיקת מעבדה.
- חסימת יום או טווח שעות לקביעת תורים.

המודל יוצר הצעה בלבד. השרת יוצר `vetbot_action_requests` לעשר דקות, וה־RPC `myvet_execute_vetbot_action` בודק מחדש משתמש, תפקיד, בעלות, תוקף ומצב עדכני לפני כתיבה. פעולות תשלום, מחיקת בעלים/מטופל, שינוי הרשאות, אבחון, מרשם או מינון, שינוי רשומה רפואית, שחרור מאשפוז ושליחת הודעה בפועל חסומות.

## 4. מה כבר מוגן היטב

- `ai-assistant` החיה היא גרסה 16 עם `verify_jwt=true`.
- יש אימות `getUser()` ואימות role בצד השרת.
- מפתח Gemini ו־service role אינם נמצאים ב־Frontend או בקבצים tracked.
- קיימת השחרה כפולה, מגבלת גודל בקשה, allowlist למסכים ולנתיבי ניווט ו־JSON schema לפלט.
- CORS של הפונקציה החדשה מבוסס allowlist ונכשל סגור עבור מקור Production שלא הוגדר.
- פעולות כתיבה עוברות preview, אישור, תפוגה ובדיקה מחודשת ב־RPC עם `search_path` סגור.
- `vetbot_audit_logs` שומר metadata בלבד ולא כולל עמודות prompt/response.
- שני Buckets רפואיים/דיגיטליים פרטיים.
- לא נמצא Secret בפומבי ב־Git; הקובץ היחיד tracked הוא `.env.example` עם placeholders.

## 5. ממצאים וסיכונים

### גבוה — `insights` פתוחה ל־anon לקריאה וכתיבה מלאה

במסד החי ל־`anon` יש `SELECT`, `INSERT`, `UPDATE` ו־`DELETE` על `public.insights`, יחד עם Policies מסוג `USING (true)`/`WITH CHECK (true)`. נמצאו 14 רשומות; בבדיקה המצומצמת לא נמצאו בהן כרגע קישורים ל־owner, pet, appointment, lab או payment.

הסיכון הוא שינוי/מחיקה אנונימיים של תובנות, השחתת דוחות והזרקת תוכן שעלול להגיע להקשר AI. בדיקת `test:anon-access` לא בודקת את הטבלה הזו ולכן עברה למרות החשיפה.

### גבוה — Edge Function ישנה פעילה מחוץ לריפו

בסביבת Production פעילה גם `ai-insights-chat` גרסה 8, אך אין לה מקור בריפו ואין אליה קריאה בקוד הנוכחי. היא אמנם עם `verify_jwt=true`, אך בתוך הפונקציה אין אימות role, אין RLS context, אין השחרת מידע, CORS הוא `*`, הקלט מהלקוח נכנס ישירות ל־prompt, ושגיאות ספק מוחזרות עם `details`.

כל משתמש מאומת שיכול לקרוא לכתובת הפונקציה עשוי לשלוח אליה תוכן arbitrary לספק החיצוני. זוהי גם סטיית תצורה: פונקציה חיה שאין לה lifecycle, tests או rollback בריפו.

### גבוה — זמינות VetBot אינה יציבה ואין timeout

לוגי 24 השעות האחרונות כוללים הצלחות של `ai-assistant` ב־4.5–16.4 שניות, אך גם מספר 502 וקריאת גרסה 16 שהסתיימה ב־504 לאחר 150,664ms. הקוד עשוי לבצע עד שתי בקשות לכל אחד מעד שלושה מודלים ללא `AbortController` או deadline כולל.

התוצאה האפשרית היא המתנה ארוכה, 504, עלות עודפת ועומס מצטבר. fallback מקומי קיים בחלק מהמסכים, אך אינו מחליף תשובה מלאה ואינו מבטיח fallback בדוחות.

### גבוה — קו הגבול של מידע חיצוני עדיין חלקי

השחרת שמות, ת״ז, טלפון, דוא״ל, כתובת, URL, UUID ושדות רגישים קיימת. עם זאת, מזהים מספריים כגון `selectedPatientRef` ו־`conversationRef` אינם מוסרים באופן כללי, והקשר תיק רפואי כולל reason, treatment ו־notes לאחר הסרת מזהים ישירים. לכן מדובר ב־pseudonymization ולא באנונימיזציה מלאה.

אין בקוד הוכחה לכך שחשבון Gemini הוא Paid, שאין שימוש לאימון, מהי מדיניות retention בפועל, שהושלם DPA או שאושרה העברה מחוץ לישראל. לפי [Google ZDR](https://ai.google.dev/gemini-api/docs/zdr), Paid Services אינם משמשים לשיפור המוצרים, אך עדיין קיימים מצבי retention שיש לבדוק ולהגדיר. עד להשלמת הבדיקה אין לשלוח מידע אמיתי רגיש.

### בינוני–גבוה — בדיקות האבטחה הן ברובן בדיקות טקסט סטטיות

רוב `vetbotSecurity.test.ts` מאמת נוכחות של מחרוזות ומבנים בקבצים. הוא אינו מפעיל את Edge Function, אינו בודק את ה־RPC עם משתמשים שונים, אינו בודק prompt injection, replay, malformed output, race condition או גישה בין בעלי חשבון.

בדיקת anon החיה בודקת SELECT בלבד ורק בשבע טבלאות. היא אינה בודקת `insights`, `vaccinations`, כתיבה אנונימית או RPC אנונימיים.

### בינוני — Policies ו־RPC ישנים נשארו פתוחים או מבלבלים

Advisors מצאו Policies permissive ישנות ב־`owners`, `patients`, `vaccinations` ו־`insights`. ב־owners/patients/vaccinations הרשאות הטבלה ל־anon מוסרות כרגע, ולכן בדיקת SELECT בפועל חסומה; עם זאת Policies מסוכנות נשארו ויחזרו להיות פעילות אם grant ישתנה.

נמצאו כמה `SECURITY DEFINER` עם `anon_execute=true`, ובהם helpers של בעלות וזמינות. חלקם מחזירים מידע מצומצם או בודקים `auth.uid()`, אך ההרשאות רחבות מהנדרש ומגדילות attack surface. `myvet_execute_vetbot_action` ופעולות התשלום כן חסומות ל־anon.

### בינוני — חסרות בקרות תפעול ומעקב גרסאות

- אין rate limit לפי משתמש/תפקיד/IP.
- אין kill switch או feature flag לפי יכולת.
- אין `prompt_version` או גרסת schema מפורשת ב־audit.
- אין תיעוד latency, token usage או cost.
- אין idempotency key חיצוני להצעת פעולה; ה־RPC מגן מפני ביצוע חוזר של אותו request, אך אין מנגנון אחיד לכל יכולת עתידית.
- שמות שתי migrations במסד תואמים לריפו אך timestamps שונים; התאמת תוכן מלאה לא הוכחה.

### פערי יכולת מול המפרט העתידי

לא קיימים עדיין: AI Gateway מרכזי עם provider abstraction, תמלול/הקלטה והסכמה, סיכום ביקור כטיוטה מאושרת עם diff וגרסאות, RAG מאובטח, OCR, הסבר פשוט ללקוח, המלצות תזכורת, retention אוטומטי ומודל tenant לפי `clinic_id`. אלה פערי roadmap ולא תקלות רגרסיה של המימוש הקיים.

## 6. מסקנת Audit

ל־MyVet קיימת שכבת VetBot משמעותית: אימות role בשרת, צמצום מידע, structured output, כלים תפעוליים ופעולות מאושרות עם boundary טוב יחסית. עם זאת, אין עדיין בסיס בטוח להרחבת AI על מידע אמיתי לפני סגירת שתי חשיפות Production (`insights` ו־`ai-insights-chat`), הוספת בקרות זמינות/קצב והרחבת בדיקות ההרשאה החיות.

## 7. תוכנית מוצעת לשלב 1 — אבטחת התשתית

1. לאמת שאין consumer ל־`ai-insights-chat`, לתעד rollback ואז להשבית או להחליף אותה בפונקציה המרכזית.
2. להסיר grants ו־Policies אנונימיות מ־`insights`, לנקות Policies דמו ישנות ולהקשיח EXECUTE של RPC לפי הצורך.
3. להוסיף test gate חי לכל טבלאות `public`, לכל פעולות CRUD ול־RPC, כולל owner מול owner ותפקידי צוות.
4. להוסיף timeout כולל, rate limits, concurrency/budget guard, feature flags ו־kill switch.
5. להוסיף `prompt_version`, `schema_version`, latency, token/cost metadata וסטטוס provider ל־audit בלי לשמור תוכן.
6. להגדיר שכבת provider מרכזית עם structured validation קשיח ו־fallback מבוקר; רק לאחר מכן לבחון יכולות חדשות.
7. לאמת תכנית Gemini, DPA, retention, ZDR, subprocessors והעברה מחוץ לישראל עם גורם משפטי/פרטיות לפני מידע אמיתי.

אין להמשיך לשלב 2 או ליכולות רפואיות חדשות לפני שכל שערי שלב 1 עוברים.
