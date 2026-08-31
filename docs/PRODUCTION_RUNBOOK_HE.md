# נוהל העלאה מבוקרת — MyVet / VetBot

עודכן: 29.08.2026

## מצב נוכחי

ב־15.07.2026 מיגרציית ההקשחה `202607150002_myvet_rls_hardening.sql` נפרסה בהצלחה. מיד לאחר הפריסה שומר הסף האנונימי עבר ואישר שאין נראות אנונימית של שורות בטבלאות הליבה שנבדקו. יש להריץ את שומר הסף מחדש לפני כל שחרור Production.

## סדר פריסה מחייב

1. לעבוד מתיקיית הפרויקט הראשית בלבד. אין לבצע `link` או `db push` מתוך `tools/supabase-baseline`.
2. לקבע את כלי Supabase לגרסה המאומתת: `npx --yes supabase@2.116.0`. אין להשתמש ב־`@latest` בזמן release.
3. להגדיר בכתב את סביבת היעד ואת ה־project ref שאושר. עבור Production נדרש אישור מפורש נפרד; ללא אישור עוצרים.
4. להתחבר עם חשבון ניהול מורשה בלבד:
   `npx --yes supabase@2.116.0 login`
5. לקשר רק ליעד שאושר:
   `npx --yes supabase@2.116.0 link --project-ref <APPROVED_PROJECT_REF>`
6. להציג ולשמור את היסטוריית המיגרציות של היעד:
   `npx --yes supabase@2.116.0 migration list --linked`
7. להריץ תצוגה מקדימה ללא שינוי ולבדוק ידנית שכל קובץ צפוי:
   `npx --yes supabase@2.116.0 db push --linked --dry-run`
8. ב־Staging: להחיל את המיגרציות, להריץ catalog acceptance, role matrix, תרחישי תור/ביקור, Storage ו־HNSW, ולשמור evidence. כשל כלשהו עוצר את התהליך.
9. לפני Production: לוודא גיבוי תקין ונקודת שחזור, לתעד rollback, לקבל אישור שינוי, ולוודא שה־release candidate זהה לזה שנבדק ב־Staging.
10. רק לאחר כל השערים ובאישור מפורש, להחיל על היעד המאושר:
    `npx --yes supabase@2.116.0 db push --linked`
11. בדיקת `npm run test:anon-access` תקפה רק אם `VITE_SUPABASE_URL` ו־`VITE_SUPABASE_ANON_KEY` מצביעים במפורש לאותו יעד שנפרס. יש להציג את ה־URL ולאשר התאמה לפני הריצה; אין להסתמך על `.env` ישן.
12. לבדוק משתמשים מורשים ולא מורשים: מנהל, וטרינר, אח/ות, מזכירות ובעלים, כולל ניסיונות גישה בין מרפאות.
13. להגדיר `GEMINI_API_KEY`, `GEMINI_MODEL` ו־`ALLOWED_ORIGINS` בסודות Supabase בלבד. אין להוסיף אותם לקובץ `.env` של Vite.
14. לפרוס Edge Functions רק ליעד שאושר ובגרסה שנבדקה. אין לפרוס פונקציה בודדת בלי לבדוק את התאימות למיגרציות שלה.
15. להריץ `npm run test:vetbot`, ‏`npm run typecheck:edge`, ‏`npm run build` ו־smoke test עם משתמש מחובר.

אם dry-run, בדיקת Staging או בדיקת הרשאות נכשלת, עוצרים את הפריסה ולא משתמשים במידע אישי. אין לתקן היסטוריית מיגרציות באמצעות `migration repair` בלי להבין תחילה את הפער בין המאגר החי לקבצים המקומיים.

## הגדרות ספק AI

- חשבון בתשלום והסכם עיבוד מתאים.
- ביטול שיתוף לוגים ודאטה עם הספק.
- בדיקת זכאות ל־Zero Data Retention.
- ללא Search/Maps grounding, File API או cache חיצוני ב־VetBot.
- תיעוד עילת העברה לחו״ל והתחייבויות הספק.

## בדיקות קבלה

- אין שורות נגישות עם מפתח `anon` בלבד.
- בעלים רואה רק את הכרטיס, החיות, התורים, השיחות והמסמכים שלו.
- צוות פעיל בלבד מקבל גישה, לפי התפקיד המאומת בשרת.
- VetBot משחיר מזהים, אינו שומר תוכן בלוג ואינו מבצע שינוי רפואי או שליחה עצמאית.
- תשלום הדגמה אינו משנה רשומות חיוב; תשלום אמיתי יעודכן רק מ־webhook מאומת של ספק סליקה.

## Staging קבוע

- סביבת הבדיקות הקבועה היא Supabase branch בשם `myvet-staging`, ללא נתוני Production.
- אין להשתמש בפרטי לקוחות אמיתיים. כל תרחישי הקבלה חייבים להשתמש בנתונים סינתטיים ולהסתיים ב־`ROLLBACK` או בניקוי מפורש.
- החלת SQL נעשית מחבילת `tools/supabase-baseline` ורק לאחר אימות שה־URL הוא של Staging.
- לאחר כל שינוי יש להריץ מתיקיית השורש: `powershell -NoProfile -ExecutionPolicy Bypass -File tools/supabase-baseline/verify-staging.ps1 -Execute`. ה־wrapper מקבע את branch id ואת project ref של Staging, מאמת את ה־URL שהוחזר, מסרב ל־Production ומריץ catalog, role matrix, ביקור רפואי, RAG runtime ו־HNSW בסדר קבוע.
- את בדיקת הביקור יש להריץ ב־`psql` עם עצירה קשיחה בשגיאה: `psql "$StagingPostgresUrl" --no-psqlrc -v ON_ERROR_STOP=1 -f tests/fixtures/previewMedicalVisitAcceptance.sql`. לפני ההרצה יש לוודא ש־`$StagingPostgresUrl` שייך ל־project ref של Staging ואינו מכיל את ה־project ref של Production. הקובץ הוא Preview-only, משתמש בנתונים סינתטיים ומסתיים ב־`ROLLBACK`.
- בדיקת HNSW מכניסה 5,000 וקטורים סינתטיים בתוך transaction, מריצה `ANALYZE` ודורשת שה־planner יבחר באינדקס ללא כפיית `enable_seqscan`; בסיום מתבצע `ROLLBACK` ונבדק שלא נשארו נתונים.
- סטטוס הענף בממשק Supabase עשוי להמשיך להציג את כשל האתחול האוטומטי המקורי גם לאחר החלה ידנית תקינה. מקור האמת לקבלה הוא רשימת המיגרציות בפועל ותוצאות בדיקות הקבלה; יש לפתוח פנייה ל־Supabase אם הסטטוס אינו מתנקה.

## תרגיל שחזור DB ו־Storage

התרגיל האחרון הושלם ב־29.08.2026 מול Staging בלבד ובסביבת Docker מקומית מבודדת. הוא אינו מהווה אישור לגעת ב־Production.

סדר השחזור המחייב:

1. ליצור dump לוגי של סכמת Staging לקובץ זמני.
2. להקים Supabase Local נקי, ללא migrations אוטומטיות של הפרויקט.
3. לשחזר את סכמת האפליקציה.
4. לשחזר בנפרד את מטא־דאטת `storage.buckets`.
5. להחיל את `tools/supabase-baseline/supabase/migrations/20260714000002_storage_policies.sql` כדי לשחזר את Policies של Storage.
6. להחיל את `20260828191000_enforce_definer_grant_baseline.sql`. שלב זה חובה: שחזור לוגי עלול ליצור פונקציות עם הרשאות ברירת מחדל רחבות עד להחלת ה־allowlist.
7. להריץ `tools/supabase-baseline/verify/acceptance.sql` ולוודא: 0 פונקציות `SECURITY DEFINER` ל־`anon`, כל הטבלאות עם RLS, ארבעה Buckets פרטיים, 14 Storage Policies ואינדקס HNSW אחד.
8. להריץ `db lint` ולוודא שאין שגיאות סכמה.
9. עבור קבצי Storage, לבצע העלאה של קובץ סינתטי פרטי, הורדה ובדיקת SHA-256, מחיקה, שחזור, בדיקת SHA-256 חוזרת וניקוי.

ה־dump הלוגי של בסיס הנתונים אינו מגבה את תוכן הקבצים עצמו. לכן Production מחייב מדיניות גיבוי נפרדת לאובייקטים ב־Storage, בדיקת שחזור תקופתית ו־RPO/RTO מאושרים.
