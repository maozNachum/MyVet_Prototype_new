# MyVet — Checklist לפריסת Production

> **Checklist היסטורי מ־19.07.2026 — אין להשתמש בו לביצוע פריסה נוכחית.** רשימת המיגרציות, הפונקציות ותיבות הסימון מתארות את מצב אותה נקודת זמן. המקורות הנוכחיים הם `PRODUCTION_RUNBOOK_HE.md` ו־`PRODUCTION_READINESS_ACTION_PLAN_2026-08-30.md`.

עודכן: 19.07.2026

מסמך זה אינו אישור לפריסה.

## לפני Preview

- [ ] Commit נקי, Review של שני חברי הצוות ו־`git diff --check`.
- [ ] אין Secrets, מידע אמיתי או קובצי `.env` ב־Git.
- [ ] Build, Type Check וכל הבדיקות עוברים.
- [ ] נוצר Supabase Preview Branch מבודד וגיבוי/נקודת שחזור.
- [ ] קיימים משתמשים ונתונים סינתטיים בלבד.

## סדר Migrations שהוחל על פרויקט Supabase המקושר

הוחל ב־19.07.2026 לאחר אישור מפורש. כל יכולות ה־AI החדשות נשארו כבויות.

1. `20260716213752_ai_tenant_foundation.sql`
2. `20260716213800_ai_data_model.sql`
3. `20260716213806_ai_rls_and_rpc_hardening.sql`
4. `20260716213812_ai_storage_security.sql`
5. `20260717120000_visit_summary_workflow.sql`
6. `20260717145900_allow_trusted_migration_tenant_writes.sql`
7. `20260717150000_digitalcare_transcription_workflow.sql`
8. `20260717160000_secure_medical_record_rag.sql`
9. `20260717160500_secure_medical_record_rag_rpc.sql`
10. `20260717173000_client_summary_workflow.sql`
11. `20260717180000_follow_up_suggestion_workflow.sql`
12. `20260717190000_ai_feature_flag_fail_closed.sql`
13. `20260718230634_vetbot_inventory_create_action.sql`
14. `20260719123000_secure_owner_signup.sql`
15. `20260719150000_allow_supabase_auth_owner_signup.sql`
16. `20260719151000_sanitize_owner_signup_metadata.sql`

- [x] `migration list` תואם ואין drift.
- [x] `db push --dry-run` עבר.
- [ ] pgvector ו־HNSW אומתו בקטלוג וב־`EXPLAIN`.
- [x] RLS ו־FORCE RLS פעילים בכל טבלת AI רגישה.
- [x] אין Policy רחבה בטבלאות הרגישות; Grants של RPC מצומצמים.
- [x] Advisors של Security ו־Performance נבדקו; אזהרות legacy/הגדרות Auth נשארו לתיעוד.
- [x] הרשמת בעלים יוצרת/מקשרת פרופיל רק בצד השרת ורק לאחר אימות אימייל; עבר smoke טרנזקציוני ללא שמירת נתוני בדיקה.
- [x] אין SELECT או INSERT אנונימי ישיר לטבלת `owners` במהלך הרשמה.
- [x] הרשמה נבדקה דרך הממשק מול Supabase המקושר: יצירת Auth, קישור פרופיל, כניסה לפורטל וניקוי metadata עברו; נתוני הבדיקה נמחקו.

## Edge Functions שנפרסו לפרויקט המקושר

- [ ] `ai-assistant` — התאמת הגרסה החיה לקוד ו־smoke של שני הבוטים.
- [x] `visit-summary`
- [x] `digitalcare-transcription`
- [x] `medical-record-rag`
- [x] `document-ocr`
- [x] `client-summary`
- [x] `follow-up-suggestions`

לכולן: `verify_jwt=true`; בדיקת smoke ללא JWT החזירה `401`. בדיקת E2E עם משתמש מחובר עדיין נדרשת לפני הפעלת יכולת חדשה.

## משתני Environment — שמות בלבד

### Frontend

- `VITE_SUPABASE_URL`
- `VITE_SUPABASE_ANON_KEY`

### Server / Supabase Edge Secrets

- `SUPABASE_URL`
- `SUPABASE_ANON_KEY`
- `SUPABASE_SERVICE_ROLE_KEY`
- `GEMINI_API_KEY`
- `GEMINI_MODEL`
- `ALLOWED_ORIGINS`
- `AI_GATEWAY_ENABLED`
- `AI_GLOBAL_ENABLED`
- `AI_VETBOT_ENABLED`
- `AI_VETBOT_ACTIONS_ENABLED`
- `AI_VETBOT_APPOINTMENT_ACTIONS_ENABLED`
- `AI_VISIT_SUMMARY_ENABLED`
- `AI_VISIT_SUMMARY_KILL_SWITCH`
- `AI_DIGITALCARE_TRANSCRIPTION_ENABLED`
- `AI_DIGITALCARE_TRANSCRIPTION_KILL_SWITCH`
- `AI_DIGITALCARE_RECORDING_ENABLED`
- `AI_DIGITALCARE_RECORDING_KILL_SWITCH`
- `AI_DIGITALCARE_SUMMARY_ENABLED`
- `AI_DIGITALCARE_SUMMARY_KILL_SWITCH`
- `AI_RAG_INDEX_ENABLED`
- `AI_RAG_INDEX_KILL_SWITCH`
- `AI_RAG_QA_ENABLED`
- `AI_RAG_QA_KILL_SWITCH`
- `AI_ALLOW_MOCK_PROVIDER`
- `AI_DOCUMENT_OCR_ENABLED`
- `AI_DOCUMENT_OCR_KILL_SWITCH`
- `AI_VACCINATION_OCR_ENABLED`
- `AI_VACCINATION_OCR_KILL_SWITCH`
- `AI_CLIENT_SUMMARY_ENABLED`
- `AI_CLIENT_SUMMARY_KILL_SWITCH`
- `AI_FOLLOW_UP_SUGGESTIONS_ENABLED`
- `AI_FOLLOW_UP_SUGGESTIONS_KILL_SWITCH`
- משתני timeout, rate, embedding ו־retention המתועדים ב־`ai-architecture.md`.

אין להגדיר Secret או בחירת Provider/Model/Prompt תחת `VITE_`.

## שערי הרשאה

- [ ] שתי מרפאות אינן רואות זו את זו.
- [ ] בעלים רואה רק חיות משויכות ורק תוכן מאושר ומשוחרר.
- [ ] בעלים אינו רואה טיוטות, תמלולים, Audit או מסמך לא משוחרר.
- [ ] עובד שאינו וטרינר אינו מאשר תוכן רפואי.
- [ ] זיוף `clinic_id`, `owner_id`, `pet_id`, `visit_id`, `source_id` ו־role נכשל.
- [ ] RPC service-only אינו זמין ל־anon/authenticated.
- [ ] Buckets רפואיים פרטיים ו־Signed URLs קצרי תוקף.

## שערי ספק ו־AI

- [ ] ספק אמיתי נבדק עם נתונים סינתטיים בלבד.
- [ ] DPA, ZDR/אי־אימון, Retention ותתי־מעבדים אושרו.
- [ ] Timeout, 429, 5xx ופלט לא תקין נכשלים סגור.
- [ ] Prompt Injection וחשיפת Prompt/Secret נחסמו.
- [ ] אין אבחון, מינון, טיפול או פעולה עסקית ללא אישור.
- [ ] RAG ו־OCR כוילו; מקורות וסתירות מוצגים נכון.
- [ ] Mock כבוי: `AI_ALLOW_MOCK_PROVIDER=false`.

## הפעלה מדורגת

1. כל היכולות החדשות כבויות.
2. מפעילים DB flag ו־Environment רק ליכולת אחת ובמרפאת Preview אחת.
3. מריצים בדיקות חיוביות ושליליות ומנטרים latency/errors/audit metadata.
4. מכבים שוב לאחר הבדיקה.
5. Production דורש בקשה מפורשת, חלון שינוי, גיבוי, Rollback וניטור.

## Rollback

- השבתת Enabled או הפעלת Kill Switch של היכולת בלבד.
- עצירת Edge Function המתאימה בלי להשבית ליבה או VetBot אחר.
- שימוש ב־`supabase/rollback/stageN` לפי התיעוד, ללא מחיקת מידע רפואי.
- שחזור קוד באמצעות `git revert` בלבד.
- במקרה חשד לסוד: Rotation מיידי ותהליך אירוע; Rollback קוד אינו מספיק.

## דרישות Production חיצוניות

- [ ] בדיקת חדירה, נגישות ועומס.
- [ ] DPIA וייעוץ משפטי סופיים.
- [ ] Retention scheduler, ניטור, SIEM/alerts ו־runbook אירוע.
- [ ] גיבוי, שחזור ו־Disaster Recovery שנבדקו.
- [ ] אישור בעלי המוצר והפרטיות לפני מידע אמיתי.
