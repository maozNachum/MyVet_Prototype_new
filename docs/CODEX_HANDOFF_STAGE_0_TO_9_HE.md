# MyVet — Handoff מחייב ל־Codex לאחר שלבים 0–9

עודכן: 17.07.2026

מטרת הקובץ: לאפשר ל־Codex חדש או לשותף בפרויקט להבין את מצב המערכת בלי להסתמך על היסטוריית השיחה הקודמת.

## 1. הוראות פתיחה לסוכן הבא

לפני כל שינוי:

1. קרא את `AGENTS.md` במלואו.
2. קרא את `docs/PROJECT_CHANGES_STAGE_0_TO_9_HE.md` — זהו הסיכום המלא של כל השינויים.
3. קרא את `docs/PROJECT_CONTEXT_HE.md`.
4. קרא את `docs/SUPABASE_ARCHITECTURE_HE.md`.
5. קרא את `docs/COLLABORATION_HE.md`.
6. למשימת AI קרא גם את מסמך השלב הרלוונטי תחת `docs/ai-*.md`.
7. בדוק `git branch --show-current`, ‏`git status` ו־`git log --oneline -10`.
8. אל תניח שמיגרציה הוחלה או ש־Edge Function נפרסה רק משום שהקוד קיים בריפו.

## 2. Snapshot נוכחי

- ענף האינטגרציה: `Full_Demo`.
- Commit שלב 8: `87d40dc`.
- Commit שלב 9: `93b8f8b`.
- סטטוס הקבלה: **CONDITIONAL PASS**.
- ליבת MyVet ויכולות VetBot הקיימות עברו את חבילת הבדיקות המקומית.
- יכולות AI של שלבים 3–8 קיימות בקוד אך לא אומתו מקצה לקצה על Supabase Preview וספק AI אמיתי.
- אין לבצע Merge ל־`master`, Push או Deploy ל־Production ללא הוראה מפורשת.

## 3. מה הושלם

### שלב 0

- מיפוי VetBot, הבוט לקביעת תורים, Auth, Supabase, Prompts, Tool Calls וזרימות קיימות.
- קו בסיס לרגרסיה ותיעוד סיכונים.

### שלב 1

- AI Gateway מרכזי.
- Provider Adapters.
- Prompt Registry עם גרסאות.
- Input/Output Schemas קשיחים.
- Feature Flags ו־Kill Switches.
- Timeout, Retry בטוח, Rate Limit, Redaction, Prompt Injection Protection ו־metadata-only audit.
- שכבת תאימות ל־VetBot ולבוט התורים.

### שלב 2

- מודל Tenant לפי `clinic_id`.
- טבלאות AI לתפעול, artifacts, sources, approvals, audit, consent, documents, chunks, embeddings, flags ו־rate limits.
- RLS, `FORCE ROW LEVEL SECURITY`, Foreign Keys מרוכבים ו־Triggers לבידוד מרפאות.
- Buckets רפואיים פרטיים ו־Signed URLs.
- RPCs ו־`SECURITY DEFINER` מוקשחים.

### שלב 3

- טיוטת סיכום ביקור מובנית.
- עריכה, versioning, אישור ודחייה על ידי וטרינר.
- אין כתיבה לתיק הרפואי לפני אישור.

### שלב 4

- DigitalCare עם הסכמה מתועדת, שמע זמני, תמלול וטיוטת סיכום.
- Google Meet ממשיך לעבוד גם כאשר AI כבוי.
- Retention configurable ו־Storage פרטי.

### שלב 5

- RAG מאובטח לתיק הרפואי.
- Embedding Provider נפרד ו־Mock דטרמיניסטי.
- Chunks, `content_hash`, pgvector dimension 768 ו־HNSW מתוכנן.
- סינון הרשאות בתוך שאילתת הווקטורים.
- הגנות Prompt Injection וחוסר מידע ללא המצאה.

### שלב 6

- OCR וחילוץ מובנה למדבקות חיסון ולמסמכים.
- JPEG/PNG/PDF, בדיקת Magic Bytes וגודל.
- טיוטה ניתנת לעריכה, ללא שמירה אוטומטית.
- בדיקת כפילות ושימוש בטבלת `vaccinations` הקיימת.

### שלב 7

- סיכום פשוט ללקוח מתוך סיכום רפואי מאושר בלבד.
- Grounding לתרופות, מינונים, תאריכים ואזהרות.
- אישור ושחרור הם פעולות נפרדות.
- פורטל הלקוח מציג רק תוצר מאושר ומשוחרר של חיה משויכת.

### שלב 8

- הצעות לביקורת חוזרת, חיסון עתידי ומעקב כללי.
- תאריך יחסי מחושב בשרת; תאריך עמום דורש השלמה ידנית.
- AI מציע בלבד. רק אישור וטרינר יוצר רשומה ב־`public.reminders`.
- מניעת כפילויות באמצעות בדיקה אטומית ואישור שני.

### שלב 9

- Hardening ובדיקות רגרסיה מקיפות.
- יכולות לא מאומתות הוגדרו fail-closed.
- נוספה זריעת Feature Flags כבויים לכל מרפאה ומניעת מחיקתם.
- נוספו בדיקות Hardening, מסמכי דמו, Gap Analysis ו־Production checklist.

## 4. ארכיטקטורה שעל הסוכן לשמור

```text
React UI
  -> Service מצומצם
  -> Supabase Edge Function עם JWT
  -> auth.getUser()
  -> גזירת role/clinic/pet/owner מהשרת
  -> Feature Flag + Kill Switch
  -> AI Gateway
  -> Redaction + Prompt Version + Schema
  -> Provider Adapter
  -> Validation נוסף
  -> טיוטה / Preview
  -> אישור משתמש מורשה
  -> פעולה עסקית או שחרור ללקוח
```

אסור לעקוף שכבה בשרשרת זו.

## 5. כללים שאסור לשבור

- Frontend אינו בוחר Provider, Model, Prompt, role או `clinic_id`.
- אין לסמוך על `user_id`, `clinic_id`, `owner_id`, `pet_id`, `visit_id` או `appointment_id` מהלקוח ללא אימות שרת.
- אין לחשוף `service_role`, secret key או מפתח ספק ב־Frontend, Git, Logs או צ׳אט.
- אין לשמור Prompt מלא, תשובת AI מלאה, תמלול, תיק רפואי או PII בלוג רגיל.
- AI אינו מאבחן, משנה טיפול, תרופה, מינון, תאריך או אזהרה.
- AI אינו יוצר פעולה עסקית לפני Preview ואישור אנושי מתאים.
- בעלים אינו רואה טיוטות, תמלולים, Audit, Prompts, גרסאות שנדחו או מידע של חיה אחרת.
- עובד שאינו וטרינר אינו מאשר תוכן רפואי.
- כל Bucket רפואי פרטי; אין URL ציבורי קבוע.
- `SECURITY DEFINER` מחייב `search_path` בטוח, אימות מפורש, `REVOKE` מ־PUBLIC ו־Grant מצומצם.
- אין `using (true)` או `with check (true)` בטבלאות רגישות.
- אין חיפוש RAG גלובלי ואחריו סינון באפליקציה.

## 6. Flags שחייבים להישאר כבויים

עד Preview וספק אמיתי:

```text
AI_RAG_INDEX_ENABLED=false
AI_RAG_QA_ENABLED=false
AI_DOCUMENT_OCR_ENABLED=false
AI_VACCINATION_OCR_ENABLED=false
AI_CLIENT_SUMMARY_ENABLED=false
AI_FOLLOW_UP_SUGGESTIONS_ENABLED=false
AI_ALLOW_MOCK_PROVIDER=false
AI_VISIT_SUMMARY_ENABLED=false
AI_DIGITALCARE_TRANSCRIPTION_ENABLED=false
AI_DIGITALCARE_RECORDING_ENABLED=false
AI_DIGITALCARE_SUMMARY_ENABLED=false
```

Kill Switches נשארים `false` במצב רגיל. באירוע תקלה מפעילים רק את Kill Switch של היכולת הרלוונטית. אין להפוך משתנים אלה ל־`VITE_*`.

## 7. סדר Migrations המחייב

לא הוכח שהרשימה הבאה הוחלה על Supabase חי. בסביבת Preview בלבד יש להריץ לפי הסדר:

1. `20260716213752_ai_tenant_foundation.sql`
2. `20260716213800_ai_data_model.sql`
3. `20260716213806_ai_rls_and_rpc_hardening.sql`
4. `20260716213812_ai_storage_security.sql`
5. `20260717120000_visit_summary_workflow.sql`
6. `20260717150000_digitalcare_transcription_workflow.sql`
7. `20260717160000_secure_medical_record_rag.sql`
8. `20260717160500_secure_medical_record_rag_rpc.sql`
9. `20260717173000_client_summary_workflow.sql`
10. `20260717180000_follow_up_suggestion_workflow.sql`
11. `20260717190000_ai_feature_flag_fail_closed.sql`

OCR אינו דורש Migration נפרדת.

## 8. Edge Functions שטרם אומתו ב־Preview

- `visit-summary`
- `digitalcare-transcription`
- `medical-record-rag`
- `document-ocr`
- `client-summary`
- `follow-up-suggestions`

בנוסף יש לאמת שהגרסה החיה של `ai-assistant` תואמת לקוד בריפו.

אין לפרוס Functions אלה ל־Production לפני Preview, בדיקות הרשאה ו־Go מפורש.

## 9. מצב הבדיקות האחרון

- Production Build: PASS, ‏1,828 modules.
- `npm run test:vetbot`: PASS, ‏120/120.
- Type Check: PASS.
- Frontend secrets: PASS.
- Hardening: ‏5/5.
- PGlite migration/RLS: ‏11/11.
- DigitalCare: ‏33/33.
- RAG: ‏10/10.
- Client summary: ‏18/18.
- Follow-up suggestions: ‏19/19.
- `git diff --check`: PASS.
- Lint אינו מוגדר.

חשוב: בדיקות אלה אינן תחליף ל־Supabase Preview, RLS חי, Storage חי או ספק AI אמיתי.

## 10. הפערים שנותרו

### לפני הפעלת AI חדש

- Supabase Preview נפרד מ־Production.
- החלת 11 Migrations.
- נתונים סינתטיים לשתי מרפאות ושני בעלים.
- בדיקות cross-tenant, owner isolation, role escalation ו־Storage.
- פריסת Edge Functions ל־Preview.
- בדיקת ספק אמיתי וכשל ספק לכל יכולת.
- כיול OCR ו־RAG.
- E2E בדפדפן ב־desktop ובנייד.

### לפני Production

- בדיקת חדירה.
- DPIA וייעוץ משפטי סופיים.
- DPA והתחייבויות ספק לגבי אימון, מחיקה ומיקום מידע.
- Retention scheduler, ניטור ורוטציית סודות.
- גיבוי, שחזור ו־Disaster Recovery.
- בדיקות עומס, עלויות, quota ו־failover.

## 11. הפעולה הבאה המומלצת

הפעולה הבאה היחידה היא להקים Supabase Preview נפרד, ללא מידע אמיתי, ולהחיל בו את 11 ה־Migrations לפי הסדר כאשר כל ה־Flags עדיין כבויים.

לאחר מכן:

1. בדיקות RLS ו־Storage.
2. פריסת Functions.
3. הפעלת יכולת אחת בכל פעם ב־Preview.
4. ספק אמיתי ונתונים סינתטיים בלבד.
5. כיבוי מחדש עד החלטת Go.

## 12. פקודות אימות לאחר שינוי

```powershell
npm run typecheck:ai
npm run test:vetbot
npm run build
git diff --check
```

אם השינוי נוגע ל־Supabase, יש להריץ גם את בדיקות שלב הנתונים והרשאות בסביבת בדיקות מאושרת. אין להריץ בדיקות נגד כתובת Production מתוך `.env` מקומי.

## 13. מסלול דמו בטוח

- הצג את ליבת MyVet, דשבורד, תיק רפואי, תורים, DigitalCare ללא AI, חיסונים, פורטל בעלים ו־VetBot הקיים.
- השתמש רק בנתונים סינתטיים.
- אל תפעיל את שלבים 3–8 כיכולות חיות עד Preview מאומת.
- אם ספק AI נכשל, הצג fallback והמשך בזרימה הידנית.
- אל תזייף תשובה או הצלחת DB.

המסלול המלא נמצא ב־`docs/demo-runbook.md`.

## 14. Rollback

- השבת יכולת באמצעות `ENABLED=false` או Kill Switch עצמאי.
- אל תמחק מידע רפואי, artifacts, reminders, transcripts, chunks או embeddings.
- השתמש בסקריפטים תחת `supabase/rollback/stage2` עד `stage9`.
- החזרת קוד נעשית באמצעות `git revert` של Commit ממוקד, לא `reset --hard`.
- Drop מותר רק ב־Preview ריק ובכפוף לבדיקות ההגנה שבסקריפט.

## 15. מסמכים מרכזיים להמשך

- `docs/PROJECT_CHANGES_STAGE_0_TO_9_HE.md` — הסיכום המלא.
- `docs/final-ai-hardening-report.md` — תוצאות Hardening.
- `docs/final-gap-analysis.md` — P0/P1/P2.
- `docs/demo-readiness-checklist.md` — שערי הדמו.
- `docs/demo-runbook.md` — תרחיש הפעלה.
- `docs/production-deployment-checklist.md` — Preview ו־Production.
- `docs/ai-rollback-plan.md` — Rollback לפי יכולת.
- `docs/VETBOT_PRIVACY_DPIA_HE.md` — פרטיות ונקודות משפטיות.

## 16. כלל אמינות לסוכן הבא

הפרד תמיד בין המצבים הבאים בדיווח:

- קיים בקוד.
- עבר בדיקה מקומית עם Mock.
- עבר בדיקת PGlite.
- הוחל על Supabase Preview.
- נבדק עם ספק אמיתי.
- נפרס ל־Production.

נכון ל־Snapshot זה, יכולות שלבים 3–8 נמצאות בשלוש הקטגוריות הראשונות בלבד. אין לטעון שהן אומתו ב־Preview, אצל ספק אמיתי או ב־Production.
