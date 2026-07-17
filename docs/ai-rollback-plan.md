# MyVet — תוכנית Rollback מדויקת לתשתית AI, שלבים 1–2

עודכן: 17.07.2026  
מטרה: להחזיר את VetBot למסלול הקודם בלי לפגוע בשאר המערכת

## 1. מתי לבצע Rollback

- עלייה מהותית ב־timeouts או 5xx.
- פלט שאינו עובר schema באופן חוזר.
- פגיעה בבוט הכללי או בבוט קביעת התורים.
- פעולה כפולה, פעולה ללא אישור או action type לא צפוי.
- דליפת PII, prompt, response, secret או internal detail ללוג/Frontend.
- חוסר יכולת להפריד בין capabilities באמצעות Kill Switch.

בחשד לדליפת secret יש גם לבצע rotation לפי נוהל האירוע; Rollback לבדו אינו מספיק.

## 2. Rollback תפעולי ללא פריסת קוד

### בעיה בפעולות תורים בלבד

1. להגדיר `AI_VETBOT_APPOINTMENT_ACTIONS_ENABLED=false` ב־Supabase Edge Function Secrets.
2. לוודא ששאלות VetBot רגילות עדיין עובדות.
3. לוודא שקביעה, שינוי וביטול תור דרך VetBot חסומים, אך יומן התורים הידני עובד.

### בעיה בכל פעולות VetBot

1. להגדיר `AI_VETBOT_ACTIONS_ENABLED=false`.
2. שאלות קריאה צריכות להישאר פעילות.
3. בקשת reject קיימת מותרת; approve חייב להיחסם.

### בעיה בבוט כולו אך לא ב־Gateway

1. להגדיר `AI_VETBOT_ENABLED=false`.
2. לוודא שיתר MyVet עובד ללא תלות בבוט.

### רגרסיה ב־Gateway החדש

1. להגדיר `AI_GATEWAY_ENABLED=false`.
2. אין צורך לשנות Frontend או endpoint; `ai-assistant` יעביר קריאות ל־`callGeminiLegacy`.
3. לבצע smoke test לבוט הכללי ולבוט התורים.
4. להשאיר את הנתיב הישן פעיל לזמן קצר בלבד; אין בו timeout/rate limit/validation המלאים של Stage 1.

### אירוע פרטיות או אבטחה

1. להגדיר `AI_GLOBAL_ENABLED=false` וגם `AI_VETBOT_ACTIONS_ENABLED=false`.
2. אם קיים חשש למפתח ספק — לבטל/לסובב אותו ב־Supabase Secrets ובחשבון הספק.
3. לשמור metadata תפעולי בלבד ולפתוח תהליך incident לפי ה־runbook. אין להעתיק תוכן רגיש לצ'אט או ל־issue.

## 3. Rollback קוד

יש לבצע רק אם rollback תפעולי אינו מספיק:

1. לזהות את commit של Stage 1.
2. ליצור commit הפוך באמצעות `git revert <STAGE_1_COMMIT>` בענף תיקון; אין להשתמש ב־`reset --hard`.
3. לא למחוק migration — בשלב 1 לא נוצרה migration.
4. להריץ:
   - `npm run test:vetbot`
   - `npm run build`
   - `npm run test:frontend-secrets`
   - `git diff --check`
5. לפרוס מחדש את `ai-assistant` בלבד לאחר אישור מפורש.
6. לא לבצע merge ל־`master` או Production בלי בקשה מפורשת.

## 4. אימות לאחר Rollback

- VetBot נפתח מכל נקודות הכניסה הקיימות.
- שאלה רגילה מחזירה תשובה.
- בוט התורים מבקש פרטים חסרים.
- לא נוצר תור ללא approval.
- תור מאושר נוצר פעם אחת בלבד.
- אין stack trace או פרטי ספק בתשובה.
- אין Secret בחבילת Frontend.
- יתר המערכת, לרבות עבודה ידנית ביומן, נשארת זמינה.

## 5. שחזור ה־Gateway

1. לתקן את התקלה בענף נפרד.
2. להריץ את מלוא הבדיקות ואת תרחישי Preview.
3. להגדיר `AI_GATEWAY_ENABLED=true` בסביבת בדיקות.
4. לבצע canary בסביבת Preview.
5. להפעיל Production רק לאחר אישור מפורש ושערי rollout מלאים.

## 6. נתונים ומסד נתונים

שלב 1 לא שינה schema, RLS או Storage ולכן אין rollback למסד הנתונים. רשומות `vetbot_action_requests` ו־`vetbot_audit_logs` ממשיכות להשתמש במבנה הקיים. אין למחוק audit או action requests כחלק מ־rollback.

## 7. Rollback מדויק לשלב 2

### לפני החלה

- אם הקבצים עדיין לא הוחלו: אין שינוי במסד; מסירים אותם מה־commit באמצעות revert רגיל בלבד.
- Preview Branch: במקרה כשל מוחקים את ה־branch המבודד. אין לבצע `migration repair` על Production.

### לאחר החלה, ללא נתוני AI

1. להריץ `supabase/rollback/stage2/01_quarantine_ai_data.sql` כדי להשבית את כל הדגלים ולבטל גישת דפדפן.
2. לוודא שאין אובייקטים ב־Buckets החדשים ולהריץ `02_remove_empty_ai_storage.sql`.
3. רק ב־Preview/Pre-production ריק להריץ `03_remove_empty_ai_schema.sql`.
4. להשאיר את הקשחת ה־tenant, ה־RLS והסרת `anon` במקומן; אין להחזיר Policies מסוכנות כחלק מ־rollback.

### לאחר שנוצר מידע אמיתי

- אין להריץ DROP לטבלאות או לעמודות tenant.
- מבצעים quarantine באמצעות קובץ 01, משביתים את יכולת ה־AI הרלוונטית ב־Edge Secrets, ושומרים את הנתונים לצורך בדיקה.
- אם שינוי ה־tenant/RLS פגע בזרימה קיימת, השחזור המדויק הוא לנקודת השחזור שנלקחה מיד לפני ההחלה או forward-fix מאושר. SQL חלקי שמסיר `clinic_id` עלול ליצור ערבוב מרפאות ולכן אסור.
- לאחר כל שחזור מריצים `npm run test:vetbot`, `npm run build`, בדיקות שני tenants ובדיקות Storage שליליות.

## 8. מגבלות

- `AI_GATEWAY_ENABLED=false` מחזיר זמנית קוד ישן שאינו כולל את כל בקרות Stage 1; זהו מצב התאוששות, לא מצב יעד.
- `ai-insights-chat` החי אינו מנוהל בריפו ולא שונה. אירוע בו דורש טיפול נפרד לאחר אימות בעלות ושימוש.
- שינוי secrets זמין לפונקציות ללא redeploy לפי תיעוד Supabase, אך יש לבצע smoke test מיד לאחר כל שינוי.
