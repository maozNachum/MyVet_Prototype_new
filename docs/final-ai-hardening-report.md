# MyVet — דוח Hardening סופי לשכבת ה־AI

> **מסמך היסטורי מ־17.07.2026.** הסטטוס `CONDITIONAL PASS`, מספרי הבדיקות והטענה שאין Preview משקפים את זמן הכתיבה בלבד. ראו את דוחות אוגוסט 2026.

עודכן: 17.07.2026

ענף: `Full_Demo`
סטטוס: **CONDITIONAL PASS**

## תקציר

שלבים 1–8 קיימים בקוד ועוברים Build, Type Check, בדיקות יחידה, בדיקות PGlite ובדיקות רגרסיה. לא בוצעו Merge, Push, Deploy או שינוי Production. לא קיימת סביבת Supabase Preview מחוברת, ולכן Migrations, RLS, pgvector/HNSW, Edge Functions וספקי AI חדשים לא אומתו בסביבה חיה.

יכולות שלא אומתו מול ספק אמיתי נשארות כבויות. VetBot הקיים ובוט התורים נשמרו במסלול התאימות שלהם.

## P0 שנמצאו ותוקנו

1. `visit-summary.generate` השתמש בברירת מחדל פתוחה כאשר `AI_VISIT_SUMMARY_ENABLED` לא הוגדר. התיקון הופך את היכולת ל־fail-closed ומוסיף `AI_VISIT_SUMMARY_KILL_SWITCH` עצמאי.
2. לא הייתה הבטחה שלכל מרפאה קיימת שורת `ai_feature_flags` לכל יכולת חדשה. נוסף `20260717190000_ai_feature_flag_fail_closed.sql`, שמזריע דגלים כבויים למרפאות קיימות וחדשות ומונע מחיקה מקרית של דגל מוגן.
3. חבילת הרגרסיה זיהתה הסתעפות חסרה עבור סיכום לקוח והצעות מעקב לאחר איחוד ה־Kill Switches. ההסתעפות תוקנה לפני הסיום והבדיקות הייעודיות חזרו לעבור.

לא נותר P0 ידוע בקוד המקומי.

## בקרות שנבדקו

- כל Edge Function בריפו מוגדרת עם `verify_jwt=true` וקוראת `auth.getUser()`.
- לא נמצאו `using (true)` או `with check (true)` במיגרציות.
- כל `SECURITY DEFINER` שנסרק כולל `search_path` קבוע; לא נמצא Grant ל־`PUBLIC` או `anon`.
- ה־Frontend אינו מכיל מפתח ספק, Service Role, כתובת Gemini או Kill Switch שרתי.
- Buckets רפואיים נשארים פרטיים; הצפייה משתמשת בקישורים חתומים קצרים.
- פלטי AI נשמרים כטיוטות/תוצרים מוגנים ואינם מבצעים פעולה עסקית לפני אישור מורשה.
- טלמטריה ו־Audit הם metadata-only.
- RAG מסנן הרשאה בתוך ה־RPC; OCR, סיכום לקוח ומעקב עוברים Schema קשיח ו־Gateway מרכזי.

## תוצאות בדיקה מקומיות

| שער | תוצאה |
|---|---|
| Production Build | PASS — 1,828 modules |
| Full `test:vetbot` regression | PASS — 120/120 |
| AI Type Check | PASS |
| Frontend secret boundary | PASS |
| Stage 9 hardening tests | PASS — 5/5 |
| PGlite migration/RLS integration | PASS — 11/11 |
| DigitalCare suite | PASS — 33/33 |
| RAG suite | PASS — 10/10 |
| Client summary suite | PASS — 18/18 |
| Follow-up suite | PASS — 19/19 |
| `git diff --check` | PASS; אזהרות CRLF בלבד |
| Lint | לא מוגדר בפרויקט |
| Supabase Preview / Provider E2E | לא בוצע |

הריצה הסופית הסתיימה עם 120 בדיקות שעברו, 0 כשלונות ו־0 דילוגים.

## יכולות לפי רמת אימות

### נבדקו מקומית עם Mock/Adapters דטרמיניסטיים

- Gateway, Timeout, Retry בטוח, Rate Limit מקומי ו־Output Validation.
- סיכום ביקור, תמלול/סיכום DigitalCare, RAG, OCR, סיכום לקוח והצעות מעקב.
- Prompt Injection, ניסיון חשיפת Prompt/Secret והיעדר מקור מספיק.
- הפרדת שתי מרפאות ושני בעלים ב־PGlite.

### לא נבדקו מול ספק אמיתי במשימה זו

- סיכום ביקור, תמלול, RAG/Embeddings/Q&A, OCR, סיכום לקוח והצעות מעקב.
- אין לטעון לאיכות רפואית או יציבות ספק על בסיס Mock.

### לא נבדקו על Supabase חי

- Migrations שלבים 2–9, RLS בפועל, Grants בפועל, Storage Policies, Signed Upload, pgvector/HNSW ו־Edge runtime.
- `test:ai-data-integration` לא הורץ משום שאין משתני Preview ייעודיים.
- `test:anon-access` לא הורץ במשימה זו, כדי לא לכוון את הבדיקה לפרויקט Production שמוגדר ב־`.env` המקומי.

## Edge Functions ומיגרציות

לא אומתה פריסה של: `visit-summary`, `digitalcare-transcription`, `medical-record-rag`, `document-ocr`, `client-summary`, `follow-up-suggestions`. גם התאמת גרסת `ai-assistant` החיה לקוד הנוכחי לא אומתה.

לפי מסמך הקבלה האחרון, Production מסתיים לפני Migrations שלבים 2–9. הרשימה המדויקת נמצאת ב־`production-deployment-checklist.md` ואין להחיל אותה על Production ללא Preview, גיבוי ואישור מפורש.

## Rollback

1. השבת את דגל ה־Enabled של היכולת הבעייתית או הפעל את ה־Kill Switch שלה.
2. אל תמחק תוצרים, תמלולים, תזכורות, Chunks, Embeddings או מידע רפואי.
3. Stage 9: הרץ `supabase/rollback/stage9/01_disable_unverified_ai_capabilities.sql` רק בסביבה המורשית. הוא משבית יכולות ושומר את בקרת fail-closed.
4. עבור שלבים 2–8 השתמש בקובץ המתאים תחת `supabase/rollback/stageN`; סקריפטי Drop מותרים רק ב־Preview ריק ובתנאים המתועדים.
5. קוד מוחזר באמצעות `git revert` של Commit ייעודי, לעולם לא `reset --hard`.

## מסקנה

הקוד המקומי מתאים לדמו של ליבת MyVet ושל VetBot הקיים. היכולות החדשות מתאימות להצגה רק לאחר Preview smoke test; עד אז הן נשארות כבויות ואינן תנאי למסלול הדמו היציב.
