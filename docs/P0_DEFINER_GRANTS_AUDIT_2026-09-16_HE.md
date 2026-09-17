# ביקורת הרשאות פונקציות P0 — 16.09.2026

## היקף וראיות

ביקורת קריאה בלבד ב־Preview/Staging `fajwhkgafbjgnbgwsumt`, מול קוד `Full_Demo` המקומי. Production לא נבדק ולא שונה. נבדקו הגדרות פונקציות בפועל דרך pg_get_functiondef, הרשאות אפקטיביות, search_path וה־tenant write triggers.

נמצאו **32 פונקציות public ועוד 4 private** מסוג SECURITY DEFINER הנגישות ל־authenticated. בכל 36 הפונקציות anon חסום ו־search_path ריק וקבוע. אין להסיק מעצם הרשאת EXECUTE שיש פרצה. הגופים תואמים למיגרציות האחרונות המקומיות: 34 לאחר נרמול סופי שורות; שתי פונקציות onboarding תואמות לאחר נרמול רווחים (פורמט בלבד).

בדיקת הקטלוג [definer-grants.sql](../tools/supabase-baseline/verify/definer-grants.sql) הורצה ב־Preview והחזירה 36 PASS. היא מכילה חתימות מלאות ובודקת גם service_role; אינה מבצעת שינוי. ה־allowlist מתעד את שטח ה־API שנבדק, **אינו אישור גורף לשחרור**. בדיקת behavior חדשה לא הורצה כחלק מביקורת זו.

## ממצאים

### G-01 — MFA אינו נבדק בנתיב replay רפואי

ב־`myvet_save_medical_entry(uuid,jsonb)` בחירת actor דורשת צוות רפואי פעיל, אך אינה בודקת MFA. כאשר נמצאה הגשה קודמת עם אותו submission_id, מטופל, תור ו־hash של payload, הפונקציה מחזירה את פרטי הביקור לפני כתיבה כלשהי. לכן trigger הכתיבה לא מופעל, וחשבון vet/clinic_admin ב־aal1 יכול לקבל תשובת ביקור באמצעות replay ידוע. זהו פער קונקרטי מול מדיניות ה־MFA; נדרש check לאחר בחירת actor ולפני חיפוש/החזרת ביקור, עם בדיקת regression ל־replay ב־aal1. נמצא בניתוח גוף חי ומקומי; לא בוצעה התקפת בדיקה על נתונים.

### G-02 — בקשת VetBot אינה קשורה מספיק למרפאה בזמן ביצוע

ב־`myvet_execute_vetbot_inventory_create` וב־`myvet_execute_vetbot_action_v2` התפקיד נבחר לפי auth_user_id ו־is_active עם LIMIT 1 ללא clinic_id. במסלול יצירת מלאי INSERT אינו קובע clinic_id ולכן ברירת המחדל היא המרפאה הפעילה בזמן הביצוע, לא request_row.clinic_id. משתמש מורשה בשתי מרפאות יכול להכין פעולה באחת ולהחליף מרפאה לפני אישור. tenant trigger מגביל לחברות במרפאה אך אינו מבטיח שהפעולה תבוצע במרפאה שאושרה. גם ה־delegate הישן לפעולות שאינן תורים משתמש בתפקיד גלובלי. נדרש לקשור בדיקת תפקיד, יעד הפעולה וה־INSERT למרפאת הבקשה, ולבדוק החלפת מרפאה ותפקידים שונים בין מרפאות. זהו ממצא ניתוח; לא נטען ניצול חי.

### G-03 — בדיקת שם פריט מלאי חוצה מרפאות

`myvet_execute_vetbot_inventory_create` בודקת שם קיים מול כל public.inventory תחת SECURITY DEFINER, בלי clinic_id. שם במרפאה אחרת עשוי לחסום יצירה ולהיחשף כ־INVENTORY_ITEM_ALREADY_EXISTS. נדרש לסנן למרפאת הבקשה. ה־trigger אינו מתקן זאת משום שהבדיקה נעשית לפני INSERT.

### מגבלות שחרור קיימות

- `myvet_owner_settle_demo_payment(bigint)` מאפשרת לבעלים לסמן תשלום שלו כמשולם ללא סליקה אמיתית. זהו מימוש דמו מכוון וקיים, לא רגרסיה חדשה. אין להשתמש במסלול זה לחיובים אמיתיים לפני החלפה/חסימה בשרת.
- מספר פונקציות ותיקות בוחרות שיוך ראשון ולא מרפאה פעילה, למשל ניהול פרטיות ושמירה רפואית. זה עלול לדחות פעולה לגיטימית במרפאה שנייה. לא נמצאה בכך לבדה הוכחת קריאה למרפאה בלתי מורשית.
- חלק מבדיקות MFA מבוצעות ב־tenant trigger. אין להסיר trigger זה מתוך הנחה ש־RLS מספיק לפונקציית DEFINER.
- מנגנון grant משנת אוגוסט משתמש בשם פונקציה; בדיקת הקטלוג החדשה בודקת חתימה מלאה כדי לזהות overload עתידי.

## מטריצת חתימות ובקרות

כל שורה להלן דורשת authenticated; anon חסום. עמודת service מציינת הרשאת EXECUTE בפועל, לא עקיפת בדיקות גוף הפונקציה.

| חתימה מלאה | service | בקרת זהות/תפקיד/מרפאה/ישות |
|---|---|---|
| `private.myvet_current_clinic_id()` | כן | auth.uid; שיוך פעיל ומותר/MFA או בעלות; מחזיר מרפאה בלבד. |
| `private.myvet_is_clinic_staff(uuid, text[])` | כן | auth.uid; staff פעיל במרפאה המבוקשת, תפקיד מבוקש ו־MFA; boolean בלבד. |
| `private.myvet_owner_owns_pet(uuid, bigint)` | כן | auth.uid; pet+owner באותה מרפאה ומשתמש בעלים; boolean בלבד. |
| `private.myvet_user_has_clinic_access(uuid)` | כן | auth.uid; חברות צוות פעילה עם MFA או בעלות באותה מרפאה; boolean בלבד. |
| `public.claim_owner_profile()` | כן | Auth מאומת ואימייל שרת תואם; התאמה יחידה; נעילת אימייל; ללא tenant מהלקוח. |
| `public.myvet_accept_clinic_invitation(text, text, text, text, text)` | לא | אימייל Auth מאומת + token תקף לאימייל; clinic/role מתוך ההזמנה; חריג bootstrap מתועד. |
| `public.myvet_available_slots(date, date)` | כן | auth.uid; מרפאה נגזרת מהשיוך; טווח 31 יום; זמינות בלבד. |
| `public.myvet_booked_slots(timestamp with time zone, timestamp with time zone)` | כן | auth.uid; מרפאה נגזרת מהשיוך; זמנים בלבד, ללא פרטי מטופל. |
| `public.myvet_conversation_owned(text)` | כן | conversation->owner עם clinic תואם ו־auth.uid; boolean. |
| `public.myvet_create_clinic(text, text)` | לא | auth.uid; חסימת owner/צוות לא מנהל; יוצר מרפאה חדשה ומנהל עצמי בלבד; bootstrap AAL1 מכוון. |
| `public.myvet_create_clinic_invitation(uuid, text, text, text, text, timestamp with time zone)` | לא | מנהל פעיל במרפאת ההזמנה ו־MFA; tenant מפורש ומאומת. |
| `public.myvet_current_owner_id()` | כן | owner לפי auth.uid; מזהה עצמי בלבד. |
| `public.myvet_delete_patient(bigint)` | כן | מנהל פעיל במרפאת המטופל; מחיקה ופעולות תלויות עוברות tenant trigger/MFA. |
| `public.myvet_execute_vetbot_action_v2(uuid)` | כן | actor_id של הבקשה; pending/expiry/role; תורים דרך RPC ייעודיים; ראו G-02 לתפקיד הגלובלי. |
| `public.myvet_execute_vetbot_inventory_create(uuid)` | כן | actor_id/pending/expiry/type; tenant-write guard; ראו G-02/G-03. |
| `public.myvet_is_active_staff()` | כן | auth.uid; צוות פעיל כלשהו + MFA; boolean ללא נתוני מרפאה. |
| `public.myvet_manage_privacy_request(uuid, text, text)` | כן | מנהל פעיל + MFA; בקשה במרפאת המנהל בלבד; בקשה סגורה בלתי ניתנת לשינוי. |
| `public.myvet_owner_book_appointment(bigint, timestamp with time zone, timestamp with time zone, text, text, text)` | כן | pet->owner תואמי clinic ו־auth.uid; זמינות ונעילות; tenant trigger. |
| `public.myvet_owner_cancel_appointment(bigint)` | לא | appointment->pet->owner ו־auth.uid; נעילת תור וסטטוס. |
| `public.myvet_owner_matches(text)` | כן | owner_id + auth.uid; boolean. |
| `public.myvet_owner_reschedule_appointment(bigint, timestamp with time zone, timestamp with time zone)` | לא | appointment->pet->owner ו־auth.uid; זמינות ונעילות. |
| `public.myvet_owner_settle_demo_payment(bigint)` | כן | בעלות על התשלום ו־tenant trigger; הרשאת דמו בלבד, ראו מגבלת שחרור. |
| `public.myvet_pet_owned(text)` | כן | pet->owner תואמי clinic ו־auth.uid; boolean. |
| `public.myvet_revoke_clinic_invitation(uuid)` | לא | מרפאת ההזמנה + מנהל פעיל ו־MFA. |
| `public.myvet_save_medical_entry(uuid, jsonb)` | לא | צוות רפואי פעיל; patient+appointment באותה מרפאה; ראו G-01 ל־replay לפני MFA. |
| `public.myvet_set_active_clinic(uuid)` | לא | auth.uid; גישה מאומתת למרפאה; העדפה נשמרת למשתמש עצמו. |
| `public.myvet_slot_is_bookable(timestamp with time zone, timestamp with time zone, bigint)` | כן | auth.uid; מרפאה נגזרת מגישה; זמינות בלבד. |
| `public.myvet_staff_book_appointment(bigint, timestamp with time zone, timestamp with time zone, text, text, text, text, text, text, text)` | לא | מרפאה פעילה + צוות פעיל/MFA; מטופל באותה מרפאה. |
| `public.myvet_staff_cancel_appointment(bigint)` | לא | מרפאה פעילה + צוות פעיל/MFA; תור באותה מרפאה. |
| `public.myvet_staff_reschedule_appointment(bigint, timestamp with time zone, timestamp with time zone)` | לא | מרפאה פעילה + צוות פעיל/MFA; תור באותה מרפאה. |
| `public.myvet_staff_settle_payment(bigint, text, numeric)` | כן | תשלום במרפאת צוות פעיל; admin/vet/secretary + MFA; נעילה. |
| `public.myvet_staff_update_appointment(bigint, timestamp with time zone, timestamp with time zone, text, text, text, text, text, text, text)` | לא | מרפאה פעילה + צוות פעיל/MFA; תור באותה מרפאה. |
| `public.myvet_submit_privacy_request(text, text)` | כן | owner מ־auth.uid; clinic מהבעלים; סוג/אורך/כפילות; אין מזהי tenant חיצוניים. |
| `public.myvet_transition_client_summary(uuid, text, jsonb, text)` | כן | וטרינר פעיל במרפאת artifact; מקור מאושר ומצב; כתיבות דרך tenant/MFA trigger. |
| `public.myvet_transition_follow_up_suggestion(uuid, text, jsonb, text, boolean)` | כן | וטרינר פעיל במרפאת artifact; מקור מאושר ומצב; כתיבות דרך tenant/MFA trigger. |
| `public.myvet_transition_visit_summary(uuid, text, jsonb, text)` | כן | וטרינר פעיל במרפאת artifact; גרסה ומצב; כתיבות דרך tenant/MFA trigger. |

## מקורות המימוש המקומיים

- [20260915120000_multi_clinic_onboarding_and_secure_owner_signup.sql](../supabase/migrations/20260915120000_multi_clinic_onboarding_and_secure_owner_signup.sql)
- [20260909073817_harden_staff_auth_and_mfa.sql](../supabase/migrations/20260909073817_harden_staff_auth_and_mfa.sql)
- [20260716213752_ai_tenant_foundation.sql](../supabase/migrations/20260716213752_ai_tenant_foundation.sql)
- [20260915130000_harden_owner_profile_claim_concurrency.sql](../supabase/migrations/20260915130000_harden_owner_profile_claim_concurrency.sql)
- [20260915170000_allow_verified_staff_invitation_acceptance.sql](../supabase/migrations/20260915170000_allow_verified_staff_invitation_acceptance.sql)
- [20260716213806_ai_rls_and_rpc_hardening.sql](../supabase/migrations/20260716213806_ai_rls_and_rpc_hardening.sql)
- [20260915160000_complete_secure_clinic_bootstrap.sql](../supabase/migrations/20260915160000_complete_secure_clinic_bootstrap.sql)
- [20260719195338_secure_patient_deletion.sql](../supabase/migrations/20260719195338_secure_patient_deletion.sql)
- [20260825191948_atomic_appointment_mutations.sql](../supabase/migrations/20260825191948_atomic_appointment_mutations.sql)
- [20260718230634_vetbot_inventory_create_action.sql](../supabase/migrations/20260718230634_vetbot_inventory_create_action.sql)
- [20260909221500_harden_privacy_request_workflow.sql](../supabase/migrations/20260909221500_harden_privacy_request_workflow.sql)
- [20260826143000_atomic_medical_visit_save.sql](../supabase/migrations/20260826143000_atomic_medical_visit_save.sql)
- [20260717173000_client_summary_workflow.sql](../supabase/migrations/20260717173000_client_summary_workflow.sql)
- [20260717180000_follow_up_suggestion_workflow.sql](../supabase/migrations/20260717180000_follow_up_suggestion_workflow.sql)
- [20260717120000_visit_summary_workflow.sql](../supabase/migrations/20260717120000_visit_summary_workflow.sql)

## תיקון מקומי בעקבות הביקורת — 17.09.2026

נוצרה מיגרציה אטומית `20260916182805_harden_definer_mfa_and_action_scope.sql`, עם עותק baseline זהה והוראות rollback. היא משמרת חתימות והרשאות ומתקנת ארבעה גופי פונקציות:

- שמירה רפואית בודקת MFA לפני נתיב ה־replay; הפער הקודם שוחזר בבדיקת PGlite עם גוף הפונקציה הישן, ואותו replay נחסם אחרי המיגרציה בעוד AAL2 מצליח.
- יצירת מלאי דורשת מרפאה פעילה זהה לבקשה וצוות מורשה באותה מרפאה; סינון שמות והכנסה משתמשים במרפאת הבקשה במפורש.
- מבצע VetBot v2 וה־delegate הפנימי שלו בודקים מרפאת בקשה, תפקיד ו־MFA באותה מרפאה. פעולות מלאי/שיחה/מעבדה של ה־delegate מסוננות למרפאה; חסימת זמן נכתבת עם clinic מפורש.
- ה־delegate נשאר חסום לקריאה ישירה. מחרוזות ברירת מחדל בעברית שוחזרו ממיגרציית המקור המקומית; ב־snapshot החי הישן נמצאה פגימת קידוד.

`tests/definerBoundaryDatabaseIntegration.test.mjs` מכסה replay/MFA, החלפת מרפאה ללא כתיבה, שם מלאי זהה במרפאה זרה, הרשאת צוות במרפאת הבקשה, scope של delegate, grants מדויקים ו־drift של הקטלוג. בדיקת הקטלוג כעת נכשלת בחריגה באמצעות exception, כולל הרשאת anon בלבד לפונקציה לא צפויה; היא נבדקה שוב ב־Preview בקריאה בלבד.

אינדקסי staff_auth_user_id_unique ו־staff_auth_user_id_unique_all עדיין קיימים ב־baseline; לכן לא שונתה בחירת actor רפואי מעבר להוספת MFA במשימה זו. בדיקות תפקידים מרובים כוללות הגנה גם לקראת שינוי עתידי באילוץ זה.

## תנאי סגירה

עדכון 17.09: G-01–G-03 תוקנו, המיגרציה הוחלה ב־myvet-staging בלבד והקבלה עברה ב־baseline מלא פעמיים וב־Staging. נבדקו גם יצירת ביקור ו־replay בפועל, סירוב AAL1, החלפת מרפאה, יצירת מלאי עם שם במרפאה אחרת וחסימת delegate לישות זרה. פרטים ב[דוח הסגירה](P0_CLOSURE_STATUS_2026-09-17_HE.md). אין צורך לבטל באופן גורף את 32 הרשאות ה־RPC. אין בכך אישור מסחרי או בדיקת כל מסלול אפשרי.
