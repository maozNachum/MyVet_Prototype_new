# MyVet — Supabase, אבטחה ונתונים

עודכן: 16.07.2026  
מסמך זה מתאר את המימוש הנמצא בריפו. אין להכניס לכאן project secrets, סיסמאות או ערכי `.env`.

> הערת עדכון 31.08.2026: המסמך נשמר כמדריך ארכיטקטורה, אך תמונת המיגרציות, הסביבות והפערים העדכנית נמצאת ב־`CODEX_PARTNER_FULL_SYSTEM_HANDOFF_HE.md`, ב־`STAGING_ACCEPTANCE_EVIDENCE_2026-08-29.md` וב־`PRODUCTION_READINESS_ACTION_PLAN_2026-08-30.md`.

## 1. חיבור

ה-frontend יוצר client ב-`src/services/supabaseClient.ts` באמצעות:

- `VITE_SUPABASE_URL`
- `VITE_SUPABASE_ANON_KEY`

אלו משתני frontend. אין להשתמש ב-`service_role` ב-Vite.

Edge Function מקבלת אוטומטית/דרך Supabase:

- `SUPABASE_URL`
- `SUPABASE_ANON_KEY`

סודות VetBot בצד השרת בלבד:

- `GEMINI_API_KEY`
- `GEMINI_MODEL` — אופציונלי ונבחר בצד השרת. אין ברירת מחדל אוניברסלית אחת: `ai-assistant` וה־Gateway המשותף מגדירים ברירות מחדל ורשימות fallback שונות, ולכן יש לבדוק את הפונקציה והסביבה הרלוונטיות.
- `ALLOWED_ORIGINS`

## 2. Auth ותפקידים

### צוות

`Layout.tsx` קורא `supabase.auth.getUser()` ואז מאתר רשומה פעילה ב-`staff` לפי `auth_user_id`.

תפקידים נתמכים:

- `clinic_admin`
- `vet`
- `nurse`
- `secretary`

### בעלים

בעלים מקושר לרשומה ב-`owners` לפי `auth_user_id`. פונקציית `claim_owner_profile()` יכולה לחבר רשומת owner לא משויכת רק לפי email מאומת מתוך JWT.

אין להשתמש ב-`user_metadata` לצורך authorization.

## 3. טבלאות ליבה המוגנות במיגרציית RLS

המיגרציה `202607150002_myvet_rls_hardening.sql` מגינה, אם הטבלה קיימת, על:

- זהויות: `staff`, `owners`, `patients`.
- תורים וחיוב: `appointments`, `payments`, `payment_items`.
- רפואי: `medical_visits`, `physical_exams`, `medical_problems`, `differential_diagnoses`, `prescriptions`, `vaccinations`, `documents`.
- תפעול: `lab_orders`, `hospitalizations`, `inventory`, `service_catalog`.
- דיגיטל: `conversations`, `messages`, `message_attachments`, `video_sessions`.
- פורטל: `notifications`, `reminders`.

המיגרציה מפעילה RLS, מסירה הרשאות `anon`, מוסיפה policy לצוות פעיל ו-policies של owner לפי בעלות.

## 4. טבלאות שהמיגרציות בריפו מוסיפות

### VetBot

- `vetbot_audit_logs` — metadata בלבד: actor, role, mode, כלים, תוצאת קריאה, ספק/מודל וסיכום השחרה. אסור להוסיף prompt או response.
- `vetbot_feedback` — משוב שימושיות ללא תוכן רגיש.
- `vetbot_knowledge` — ידע מרפאה מאושר לצוות/VetBot.

### זמינות תורים

- `clinic_booking_hours` — שעות שבועיות, פתוח/סגור, משך slot וקיבולת יומית.
- `clinic_booking_blocks` — סגירה חד-פעמית ליום שלם או טווח שעות.

## 5. פונקציות DB מרכזיות

### פונקציות בעלות והרשאה

- `myvet_is_active_staff()`
- `myvet_current_owner_id()`
- `myvet_owner_matches(text)`
- `myvet_pet_owned(text)`
- `myvet_conversation_owned(text)`
- `claim_owner_profile()`

### פונקציות תורים

- `myvet_slot_is_bookable(start, end, excluded_id)` — בודקת שעות פתיחה, חסימות, חפיפות וקיבולת לפי `Asia/Jerusalem`.
- `myvet_available_slots(start_date, end_date)` — מחזירה רק timestamps פנויים, בלי מידע על לקוחות אחרים.
- `myvet_owner_book_appointment(...)` — מאמתת בעלות, נועלת transaction לפי שעה, בודקת זמינות ושומרת atomically.
- `myvet_booked_slots(...)` — פונקציה ישנה יותר הקיימת לצורכי תאימות; פורטל ההזמנה החדש משתמש ב-`myvet_available_slots`.

בכל `SECURITY DEFINER` יש לשמור על ארבעה תנאים:

1. בדיקת `auth.uid()` והרשאה עסקית.
2. `set search_path` מוגדר.
3. `revoke` מ-`public`.
4. `grant execute` רק לתפקיד הנדרש.

## 6. RLS לפי סוג משתמש

### צוות פעיל

Policy בשם `myvet_active_staff_all` מאפשר פעולות לפי `myvet_is_active_staff()` בטבלאות הליבה הקיימות.

### בעלים

- רואה ומעדכן רק את פרופיל `owners` שלו.
- רואה חיות ורשומות רפואיות רק כאשר `owner_id`/`pet_id` שייכים לו.
- רואה שיחות והודעות רק בשיחה שבבעלותו.
- הודעת owner חדשה חייבת להיות `sender_type='owner'` ולהתאים ל-owner המחובר.
- יצירת תור אינה insert ישיר; היא עוברת דרך RPC אטומי.

### אנונימי

ל-`anon` אין גישה לטבלאות הליבה המוגנות. יש להריץ `npm run test:anon-access` לפני Production.

## 7. Realtime

המערכת נרשמת ל-`postgres_changes` במספר stores ומסכים, בין היתר:

- תורים.
- רשומות רפואיות/מעבדה לפי הרכיב.
- דשבורד ו-flowboard.

Realtime אינו עוקף RLS; האירועים המתקבלים תלויים בהרשאות המשתמש.

## 8. Storage

המיגרציה מקשיחה buckets קיימים ומגדירה policies ל-storage objects:

- צוות פעיל מנהל קבצים לפי הצורך.
- בעלים קורא מסמכים רק בנתיב של חיה שבבעלותו.
- קבצי chat מוגבלים לשיחה שבבעלות המשתמש.
- העלאות owner מוגבלות לנתיבים ולשיחות שלו.

בצד הלקוח יש להשתמש ב-`createSignedUrl` לקובץ רפואי פרטי. אין להחזיר `getPublicUrl` למסמכים רפואיים.

## 9. Edge Function — `ai-assistant`

הגדרה: `verify_jwt = true` ב-`supabase/config.toml`.

הפונקציה:

1. מאמתת Authorization Bearer ו-`getUser()`.
2. מאמתת role מול `staff` או `owners`; אינה סומכת על role שנשלח מהדפדפן.
3. מגבילה גודל request ומצבי VetBot מותרים.
4. משחירה מזהים באמצעות `_shared/privacy.ts`.
5. מפעילה כלי קריאה בלבד: סדרי עדיפות, עומס יומן, מלאי, דיגיטל וחיפוש ידע.
6. שולחת payload מצומצם ל-Gemini ומבקשת JSON מובנה.
7. מנרמלת נתיבים ופעולות לפי allowlist ותפקיד.
8. משחירה את הפלט ושומרת audit metadata בלבד.

## 10. סדר המיגרציות בריפו

1. `202607150001_vetbot_privacy.sql`
2. `202607150002_myvet_rls_hardening.sql`
3. `20260716145453_clinic_booking_availability.sql`
4. `20260716145745_appointments_booking_policy_cleanup.sql`

אין לשנות מיגרציה שכבר נפרסה. שינוי חדש מקבל migration חדשה.

חשוב: קבצים אלה אינם schema dump מלא של הפרויקט ההיסטורי. לפני הקמת סביבת Supabase חדשה מאפס יש להפיק/לתעד גם את schema הבסיסי של הטבלאות שקדמו להם.

## 11. תהליך שינוי בטוח

1. בצע login/link לפרויקט הנכון.
2. בדוק `migration list` וודא שאין drift.
3. צור migration דרך Supabase CLI; אל תמציא timestamp ידנית.
4. בדוק SQL בסביבת פיתוח.
5. בדוק RLS עם לפחות: admin, vet, nurse, secretary, owner ו-anon.
6. הרץ advisors ובדיקות anon/VetBot.
7. בצע `db push --dry-run` לפני push אמיתי.
8. תעד מה השתנה במסמך/commit.

הוראות Production המלאות נמצאות ב-`docs/PRODUCTION_RUNBOOK_HE.md`.

## 12. פרטיות וישראל

היישום כולל בקרות privacy-by-design, אך מסמכי הקוד אינם אישור משפטי. לפני שימוש אמיתי במידע יש להשלים את שערי הפריסה, הסכמי הספק, סיווג המאגר ותהליכי זכויות משתמש ב-`docs/VETBOT_PRIVACY_DPIA_HE.md`.

