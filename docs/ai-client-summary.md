# Stage 7 — סיכום מאושר לבעל חיית המחמד

## זרימה

1. רק וטרינר פעיל במרפאת הביקור יכול לפתוח את היכולת.
2. מקור היצירה הוא `visit_summary` במצב `approved` בלבד.
3. `client-summary` מאמת את המשתמש באמצעות `getUser()`, גוזר את המרפאה והביקור בצד השרת וקורא ל־AI Gateway.
4. הפלט עובר Schema קשיח ובדיקת Grounding. תרופות, מינונים, תאריכים, טיפול, מעקב ואזהרות חייבים להיות ערכים זהים למקור המאושר.
5. התוצר נשמר כ־`ai_artifacts.artifact_type = 'client_explanation'` במצב `draft`. אפשר לערוך, לדחות או לאשר אותו.
6. אישור אינו מציג את התוצר לבעלים. נדרשת פעולת `release` נפרדת שמגדירה `released_to_owner=true`.
7. פורטל הלקוח קורא ישירות תחת RLS רק תוצרים `approved` ששוחררו ושייכים לחיה של הבעלים.

## סטטוסים וגרסאות

נעשה שימוש במנגנון הקיים: `draft`, `edited`, `approved`, `rejected`, `superseded`. מצב `released` מיוצג באמצעות תוצר מאושר עם `released_to_owner=true` ו־`released_at`; כך לא נוצר מנגנון סטטוסים מקביל. כל עריכה, אישור או דחייה יוצרים גרסה חדשה ובלתי־תלויה. ביטול שחרור אינו מוחק תוכן.

## אבטחה ופרטיות

- ה־Frontend אינו שולח או בוחר `clinic_id`, `owner_id`, `pet_id`, provider, model או prompt.
- פעולות כתיבה עוברות RPC עם בדיקת `auth.uid()`, וטרינר פעיל, אותה מרפאה ומקור מאושר.
- פונקציות `SECURITY DEFINER` משתמשות ב־`search_path=''`, נשללו מ־PUBLIC/anon והוענקו רק לתפקיד הנדרש.
- בעלים אינו מקבל טיוטות, גרסאות שנדחו, Audit, Prompts או תמלולים.
- Audit וטלמטריה הם metadata-only.

## Feature flags

- `AI_CLIENT_SUMMARY_ENABLED=false` — ברירת מחדל סגורה.
- `AI_CLIENT_SUMMARY_KILL_SWITCH=false` — כאשר `true`, חוסם יצירה ושינויים ביכולת בלבד.
- נדרש גם capability ברמת המרפאה: `client_explanation` בטבלת `ai_feature_flags` אם הוגדרה רשומה עבורה.
- דגלי RAG ו־OCR לא שונו ונשארים כבויים.

## הפעלה

יש להחיל את `20260717173000_client_summary_workflow.sql`, לפרוס את Edge Function `client-summary`, ולהגדיר את שני הדגלים ב־Edge Secrets בלבד. אין להגדיר אותם תחת `VITE_`. לאחר בדיקות עם ספק אמיתי ניתן להפעיל Preview באופן נקודתי; בשלב זה הדגל נשאר כבוי.

## Rollback

1. להגדיר `AI_CLIENT_SUMMARY_ENABLED=false` או `AI_CLIENT_SUMMARY_KILL_SWITCH=true`.
2. להסיר או להשבית את `client-summary` Edge Function.
3. אם נדרש ביטול DB, להריץ `supabase/rollback/stage7/01_remove_client_summary_workflow.sql`.

ה־rollback מסיר רק את נקודות הכתיבה ושומר את כל התוצרים והמקורות ההיסטוריים. הוא אינו משנה סיכומים רפואיים מקוריים ואינו מוחק מידע רפואי.

## מגבלה לפני Production

ה־Gateway וה־Mock Provider נבדקו מקומית. לא בוצעה קריאת ספק AI אמיתית ולא בוצעה פריסה לסביבת Supabase חיה במסגרת שלב זה, לכן הדגל נשאר כבוי עד בדיקת Preview/ספק.
