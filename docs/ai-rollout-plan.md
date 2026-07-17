# MyVet — תוכנית Rollout לתשתית AI, שלבים 1–2

עודכן: 17.07.2026  
סטטוס: הקוד מוכן מקומית; לא בוצעה פריסת Production

## 1. עקרונות

- פריסה מדורגת של `ai-assistant` בלבד.
- אין migration, אין שינוי RLS/Storage ואין שינוי Frontend contract.
- `AI_GATEWAY_ENABLED` מאפשר מעבר מיידי בין הנתיב החדש לישן.
- כל יכולת ניתנת להשבתה בנפרד.
- אין להפעיל Production לפני מעבר כל השערים במסמך זה.

## 2. הכנה

1. לוודא שהענף הוא `Full_Demo` ושה־commit כולל את כל קבצי Stage 1.
2. להריץ:
   - `npm run typecheck:ai`
   - `npm run test:vetbot`
   - `npm run build`
   - `npm run test:frontend-secrets`
   - `git diff --check`
3. לוודא ש־Lint אינו מוגדר בפרויקט; אם יתווסף בעתיד, להפוך אותו לשער חובה.
4. לבצע בדיקת secrets בשמות בלבד. אין להעתיק ערכים ללוג, commit או מסמך.
5. לוודא `verify_jwt=true` עבור `ai-assistant` ו־CORS allowlist תקין.
6. לתאם חלון בדיקה עם שני חברי הפרויקט; אין לפרוס במקביל Edge Function אחרת.

## 3. Preview / סביבת בדיקות

1. להגדיר ב־Supabase Secrets, ללא ערכים בקוד:
   - `AI_GATEWAY_ENABLED=true`
   - `AI_GLOBAL_ENABLED=true`
   - `AI_VETBOT_ENABLED=true`
   - `AI_VETBOT_ACTIONS_ENABLED=true`
   - `AI_VETBOT_APPOINTMENT_ACTIONS_ENABLED=true`
2. להשאיר timeout/rate defaults או להגדירם רק לאחר בדיקת עומס.
3. לפרוס את `ai-assistant` לסביבת Preview/בדיקות בלבד.
4. לבצע smoke tests עם נתונים סינתטיים:
   - פתיחת VetBot מכל mode.
   - שאלה רגילה וקבלת תשובה במבנה הקיים.
   - שאלה בדוחות.
   - שאלה בבוט התורים עם פרטים חסרים.
   - הצעת תור, preview, reject.
   - הצעת תור, approve, ורק אז יצירת תור יחיד.
   - timeout מדומה וכשל ספק.
   - פלט לא תקין והודעה ידידותית.
5. לבדוק `vetbot_audit_logs` ולוג `AI_GATEWAY_AUDIT` ולוודא שאין prompt/response/PII.

## 4. בדיקת Kill Switches

כל שינוי מבוצע בנפרד ומוחזר ל־true לאחר הבדיקה:

1. `AI_VETBOT_APPOINTMENT_ACTIONS_ENABLED=false`:
   - שאלה רגילה חייבת לעבוד.
   - פעולה שאינה תור חייבת להישאר זמינה.
   - קביעה/שינוי/ביטול תור חייבים להיחסם עם אפשרות עבודה ידנית.
2. `AI_VETBOT_ACTIONS_ENABLED=false`:
   - שאלות רגילות חייבות לעבוד.
   - יצירה ואישור של כל action plan חייבים להיחסם.
3. `AI_VETBOT_ENABLED=false`:
   - VetBot מוחזר כלא זמין.
   - יתר המערכת ממשיכה לעבוד.
4. `AI_GATEWAY_ENABLED=false`:
   - אותו endpoint עובד דרך הנתיב הישן לצורך rollback.

## 5. Canary

הפרויקט אינו כולל כרגע מערכת cohorts שרתית. לכן canary מבוצע לפי סביבת Preview, לא לפי אחוז משתמשים. אין להמציא `clinic_id` או cohort מה־Frontend.

לאחר 30 תרחישי בדיקה מוצלחים לפחות:

- שיעור הצלחה ללא שגיאת schema: לפחות 95%.
- latency p95 מתחת ל־24 שניות.
- אין 504 של 150 שניות כפי שנמצא בשלב 0.
- אין פעולה כפולה.
- אין PII בלוגים.
- אין דליפת secrets בחבילת Frontend.

אם אחד השערים נכשל — לבצע rollback לפי `docs/ai-rollback-plan.md`.

## 6. Production

Production דורש בקשה מפורשת ואינו חלק מביצוע שלב 1 הנוכחי.

לפני פריסה:

1. לאמת מי הבעלים של `ai-insights-chat`, האם יש consumer חיצוני, ומה תוכנית ההשבתה שלו.
2. להשלים בדיקת ספק, DPA, retention, העברה מחוץ לישראל ו־ZDR לפי DPIA. אין לראות בקוד אישור משפטי.
3. לוודא שאין drift בין Edge Function בריפו לגרסה החיה.
4. לפרוס `ai-assistant` בלבד.
5. לבצע מיד regression לבוט הכללי ולבוט התורים.
6. לעקוב 60 דקות אחרי outcome, latency, rate limit ו־provider errors.

## 7. מדדים שאוספים

- הצלחה/כשל/disabled/rate-limited.
- latency.
- attempts.
- token usage אם הוחזר.
- provider/model/prompt/schema version.
- action proposed/approved/rejected/failed.

אין לאסוף prompt, answer, תמלול, medical text, כתובות, פרטי קשר, תשלום או signed URL.

## 8. ממצאי Dependency Audit שאינם חלק משינוי ה־AI

`npm audit --omit=dev` מצא שתי תלויות Production קיימות בסיכון גבוה:

- `react-router` בגרסת הפרויקט; קיימת גרסת תיקון חדשה יותר, אך שדרוג ובדיקת נתיבים הם משימה נפרדת כדי לא לערבב refactor עם Stage 1.
- `xlsx` בגרסת הפרויקט; npm אינו מציע תיקון אוטומטי. עד לבחינת שדרוג או חלופה יש להתייחס לקובצי ייבוא כלא מהימנים, להגביל גודל ולהימנע מעיבוד בצד שרת בעל הרשאות.

לא בוצע `npm audit fix` או `--force`, משום שהדבר חורג מתשתית AI ועלול לשנות התנהגות קיימת.

## 9. Rollout לשלב 2

שלב 2 אינו מיועד להחלה ישירה על Production. סדר ההפעלה המחייב:

1. ליצור Supabase Preview Branch מבודד לאחר אישור העלות המוצגת ב־Supabase.
2. להחיל לפי הסדר את ארבעת קובצי `20260716213*_ai_*.sql`.
3. להריץ `npm run test:ai-data-integration` עם שלושת משתני `STAGE2_TEST_SUPABASE_*` של ה־Preview בלבד.
4. לאמת שני tenants סינתטיים: מנהל/וטרינר/אח/לקוח בכל אחד, ניסיונות החלפת מזהים, RPC ו־Storage.
5. להריץ Advisors של Security ו־Performance ולפתור כל ממצא חדש לפני Production.
6. לבצע smoke test מלא לבוט הכללי ולבוט התורים. ה־Gateway אינו אמור לשנות התנהגות בשלב 2.
7. לקחת גיבוי/נקודת שחזור מיד לפני Production ולתעד את migration versions.
8. להחיל Production רק לאחר בקשה ואישור מפורשים וחלון ניטור.

ה־dry-run מול הפרויקט החי נעצר משום ששתי גרסאות migration מרוחקות אינן קיימות בשם זה בריפו המקומי. אין להריץ `migration repair` ללא בירור והתאמה מכוונים; זו אינה פעולת תיקון אוטומטית בטוחה.

## 10. יציאה מה־Rollout

Stage 1 נחשב יציב רק לאחר:

- כל הבדיקות האוטומטיות עוברות.
- smoke tests של שני הבוטים עוברות בסביבה מחוברת.
- Kill Switch עצמאי הוכח.
- rollback הוכח.
- לא נמצאה דליפת מידע.
- הסיכון של rate limit מקומי בלבד התקבל או הוחלף בתשתית מבוזרת מאושרת.

לאחר מכן עוצרים. אין להתחיל Stage 2 בלי משימה נפרדת.

## 11. Rollout לשלב 5

שלב 5 נשאר כבוי כברירת מחדל. סדר ההפעלה הוא migration schema, migration RPC, פריסת `medical-record-rag`, הפעלת index בלבד ב־Preview, בדיקות tenant/owner/duplicate/injection, ורק אז הפעלת Q&A. אין להפעיל Q&A ללקוח בשלב זה. ההוראות וה־gates המלאים נמצאים ב־`docs/ai-rag.md`.

Production מחייב בקשה מפורשת, גיבוי, Supabase Security/Performance Advisors, בדיקה עם pgvector אמיתי והרצת כל regression. אין deploy או שינוי DB חי כחלק משלב 5 המקומי.
