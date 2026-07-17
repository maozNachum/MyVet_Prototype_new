# MyVet — סיכום מלא של שלבים 0–9 והמשך הדרך

עודכן: 17.07.2026

ענף עבודה: `Full_Demo`

סטטוס כללי: **CONDITIONAL PASS לדמו של ליבת המערכת; יכולות AI חדשות נשארות כבויות עד אימות Preview וספק אמיתי**

## 1. מטרת המסמך

מסמך זה מרכז במקום אחד את העבודה שבוצעה בתוכנית הטמעת ה־AI של MyVet, החל ממיפוי המערכת בשלב 0 ועד ל־Hardening והכנת הדמו בשלב 9.

המסמך מפרט:

- מה היה קיים לפני תחילת התוכנית.
- מה נוסף או שונה בכל שלב.
- אילו רכיבי Frontend, Edge Functions, שירותים, Migrations, Policies ובדיקות נוספו.
- אילו יכולות נבדקו מקומית ואילו לא אומתו מול Supabase או ספק AI אמיתי.
- מה נשאר כבוי ומדוע.
- מה עוד נדרש כדי להגיע מדמו יציב ל־Preview מאומת ול־Production.

המסמך אינו מהווה אישור משפטי, אישור אבטחה ל־Production או הוכחה שמיגרציות שלא הוחלו על Supabase חי אכן פועלות בסביבה החיה.

## 2. תמונת מצב לפני שלב 0

MyVet כבר כללה מערכת מלאה למרפאה וטרינרית:

- פורטל צוות ופורטל לקוחות.
- ניהול בעלים ובעלי חיים.
- תיק רפואי, ביקורים, חיסונים ותוצאות מעבדה.
- תורים פיזיים ותורי וידאו.
- DigitalCare וקישורי Google Meet.
- אשפוזים, מלאי, דוחות ותשלומים.
- VetBot כללי ובוט קביעת תורים.
- Supabase Auth, Database, RLS, Storage ו־Edge Functions.

VetBot הקיים כבר כלל:

- צמצום והשחרת מידע רגיש בדפדפן ובשרת.
- תשובות מובנות.
- כלי קריאה בלבד לקבלת הקשר מצומצם.
- פעולות מערכת שמחייבות Preview ואישור אנושי.
- Audit מסוג metadata-only.
- שמירת Secrets בצד השרת בלבד.

העיקרון המרכזי לאורך כל השלבים היה לשמור על היכולות הקיימות ולא להעביר את כולן בבת אחת למסלול חדש שעלול לשבור את הדמו.

## 3. שלב 0 — מיפוי המערכת וקו בסיס לרגרסיה

### מה בוצע

- מופו כל נקודות הכניסה של VetBot והבוט לקביעת תורים.
- מופו רכיבי Frontend, Edge Functions, Prompts, ספקים, מודלים ו־Tool Calls קיימים.
- מופו Auth, תפקידי צוות, שיוך בעלים וחיות, טבלאות Supabase ו־Storage.
- תועדו פעולות קריאה ופעולות עסקיות קיימות המחייבות אישור אנושי.
- נוצר קו בסיס התנהגותי וטכני לבדיקות רגרסיה.
- לא בוצעו שינויים פונקציונליים או שינויי מסד נתונים בשלב זה.

### ממצאים מרכזיים

- היו Policies היסטוריות רחבות או מבלבלות, במיוחד סביב `insights`.
- זוהתה Edge Function ישנה שאינה בהכרח תואמת לקוד המקומי.
- ל־VetBot לא היה Gateway מרכזי מלא עם Timeout, Provider Adapters ו־Schemas אחידים.
- חלק מבדיקות האבטחה היו סטטיות בלבד ולא בדיקות הרשאה חיות.
- לא היו תשתיות מאוחדות לתוצרי AI, אישורים, הסכמות, תמלולים, RAG או OCR.

### תוצרים

- `docs/ai-current-state-audit.md`
- `docs/ai-regression-baseline.md`

## 4. שלב 1 — תשתית AI מרכזית ומאובטחת

### מה נוסף

נוספה שכבת AI משותפת תחת `supabase/functions/_shared/ai`:

- `gateway.ts` — נקודת הפעלה מרכזית ליכולות AI.
- `types.ts` — ממשקים כלליים לספקים וליכולות.
- `schemas.ts` — אימות קלט ופלט מובנה.
- `prompts.ts` — Prompt Registry עם גרסאות.
- `config.ts` — בחירת Provider, Model ופרמטרים בצד השרת.
- `featureFlags.ts` — Feature Flags ו־Kill Switches.
- `errors.ts` — שגיאות ציבוריות אחידות ללא חשיפת פרטי ספק או Stack Trace.
- `rateLimit.ts` — Rate Limiting בסיסי.
- `providers/gemini.ts` — Adapter ייעודי ל־Gemini.
- Adapters נוספים לתמלול, Embeddings וחילוץ מסמכים בשלבים המאוחרים יותר.

### בקרות רוחביות

- Timeout מבוקר.
- Retry רק עבור פעולות בטוחות לחזרה.
- Redaction ו־Data Minimization לפני ספק AI.
- הגנה בסיסית מפני Prompt Injection.
- Audit וטלמטריה ללא Prompt מלא, תשובה מלאה או תוכן רפואי בלוגים רגילים.
- מדידת זמן תגובה, סטטוס, Tokens וגרסאות Provider/Model/Prompt.
- Frontend אינו יכול לבחור Provider, Model, System Prompt או הרשאות.
- נשמרה שכבת תאימות ל־VetBot הקיים ולבוט קביעת התורים.

### בדיקות שנוספו

- Timeout וכשל ספק.
- Output Validation.
- Feature Flags ו־Kill Switches.
- מניעת Secrets בחבילת Frontend.
- תאימות VetBot ובוט התורים.
- Retry בטוח ו־Rate Limit.

## 5. שלב 2 — מודל נתונים, RLS ואבטחת Storage

### Migrations שנוספו

1. `20260716213752_ai_tenant_foundation.sql`
2. `20260716213800_ai_data_model.sql`
3. `20260716213806_ai_rls_and_rpc_hardening.sql`
4. `20260716213812_ai_storage_security.sql`

### מודל Tenant והרשאות

- `clinics` הפכה למקור האמת להפרדת מרפאות.
- `clinic_id` נדרש ברשומות AI ובקשרים הרגישים.
- נוספו Foreign Keys מרוכבים שמונעים חיבור חיה, בעלים, ביקור, תור או עובד למרפאה אחרת.
- זהות המשתמש, תפקידו והמרפאה נגזרים בצד השרת ולא ממזהים שהדפדפן שולח.
- משתמש בעל שיוך לא חד־משמעי נכשל במצב סגור.

### טבלאות AI שנוספו

- `ai_operations` — מחזור חיים ומדדים של פעולת AI.
- `ai_audit_events` — Audit append-only מסוג metadata-only.
- `ai_artifacts` — טיוטות ותוצרים מובנים.
- `ai_sources` — קישורים בין תוצר למקורות.
- `ai_approval_history` — היסטוריית אישור ושחרור.
- `ai_documents` — Registry לקבצים ומדיניות שמירה.
- `ai_document_chunks` — Chunks למסמכים ו־RAG.
- `ai_document_embeddings` — Embeddings ומחזור החיים שלהם.
- `ai_consent_records` — תיעוד הסכמה לפי מטרה וגרסה.
- `ai_feature_flags` — דגלים ו־Kill Switches ברמת מרפאה.
- `ai_rate_limit_windows` — תשתית למכסות מבוזרות.

### RLS והקשחה

- RLS ו־`FORCE ROW LEVEL SECURITY` הופעלו בטבלאות AI הרגישות.
- לא נוצרו Policies מסוג `using (true)` או `with check (true)` בטבלאות הרגישות.
- לקוח אינו רואה טיוטות, תמלולים, Audit, Prompts או מידע פנימי.
- רק וטרינר פעיל באותה מרפאה רשאי לאשר תוכן רפואי.
- `SECURITY DEFINER` משתמש ב־`search_path = ''`, אימות מפורש ו־Grants מצומצמים.
- אין כתיבה ישירה מהדפדפן לטבלאות AI.

### Storage

- נשמרו ה־Buckets הקיימים `documents` ו־`chat-attachments` כפרטיים.
- נוספו `ai-medical-documents` ו־`ai-recordings` כ־Buckets פרטיים.
- נתיבים כוללים הפרדה לפי מרפאה וחיה ושם קובץ אטום.
- אין URL ציבורי קבוע; הצפייה נעשית באמצעות Signed URL קצר.
- לקוח אינו מקבל גישה ישירה ל־Buckets הרפואיים החדשים.

### Rollback

נוספו סקריפטים תחת `supabase/rollback/stage2`. ברירת המחדל היא quarantine או השבתה. סקריפטי הסרה מותרים רק בסביבת Preview ריקה ואינם מיועדים למחיקת מידע רפואי קיים.

## 6. שלב 3 — סיכום ביקור מובנה ומאושר

### רכיבים שנוספו

- `src/app/components/VisitAiSummaryPanel.tsx`
- `src/services/visitSummary.ts`
- `supabase/functions/visit-summary/index.ts`
- `20260717120000_visit_summary_workflow.sql`
- `tests/visitSummarySecurity.test.ts`

### הזרימה

1. וטרינר פעיל פותח ביקור קיים.
2. השרת מאמת JWT, תפקיד, מרפאה, ביקור ו־Feature Flag.
3. רק עובדות מצומצמות מהביקור נשלחות ל־Gateway.
4. מתקבלת טיוטה מובנית עם Schema קשיח.
5. הטיוטה נשמרת כ־AI artifact ולא נכתבת אוטומטית לתיק הרפואי.
6. כל עריכה יוצרת גרסה; ניתן לאשר או לדחות.
7. רק אישור מפורש של וטרינר יוצר תוצר מאושר.

### בטיחות

- אין עדכון אוטומטי של `medical_visits` בזמן generation.
- Timeout או פלט לא תקין אינם יוצרים תוצר רפואי.
- Idempotency, Advisory Locks ו־Version Checks מונעים כפילויות.
- `AI_VISIT_SUMMARY_ENABLED` נכשל סגור כאשר הוא חסר.
- נוסף `AI_VISIT_SUMMARY_KILL_SWITCH` עצמאי.

## 7. שלב 4 — DigitalCare, הסכמה, תמלול וסיכום

### רכיבים שנוספו

- `src/app/components/DigitalCareTranscriptionPanel.tsx`
- שילוב ב־`src/app/pages/DigitalCare.tsx`
- `src/services/digitalCareTranscription.ts`
- `supabase/functions/digitalcare-transcription/index.ts`
- `20260717150000_digitalcare_transcription_workflow.sql`
- `tests/digitalCareAiSecurity.test.ts`

### הזרימה

- Google Meet ו־DigitalCare ממשיכים לפעול גם כאשר AI כבוי או נכשל.
- אין תמלול או הקלטה לפני הסכמה מתועדת.
- נשמרים סוג ההסכמה, גרסת הנוסח, הזמן, התור והמשתמש שתיעד אותה.
- שמע זמני מועלה ל־Storage פרטי באמצעות Signed Upload Token.
- תמלול נשמר כטיוטה לא מאושרת.
- טיוטת סיכום נוצרת דרך מנגנון שלב 3.
- רק וטרינר יכול לערוך, לאשר או לדחות.

### Retention

- שמע זמני נמחק לאחר הצלחה או בתוך חלון fallback מצומצם.
- ברירת מחדל להקלטה: 7 ימים, configurable.
- ברירת מחדל לתמלול גולמי: 30 ימים, configurable.
- נדרש Scheduler מנוטר לפני Production.

### מגבלה חשובה

המימוש משתמש ב־`MediaRecorder` על המיקרופון המקומי ואינו אינטגרציית הקלטה רשמית של Google Meet. נוסח ההסכמה, משיכתה, Retention והעברת מידע לספק דורשים בדיקה משפטית לפני Production.

## 8. שלב 5 — RAG מאובטח לתיק הרפואי

### רכיבים שנוספו

- `src/app/components/MedicalRecordRagPanel.tsx`
- שילוב במסך המטופלים.
- `src/services/medicalRecordRag.ts`
- `supabase/functions/medical-record-rag/index.ts`
- `providers/geminiEmbedding.ts`
- `providers/mockEmbedding.ts`
- `20260717160000_secure_medical_record_rag.sql`
- `20260717160500_secure_medical_record_rag_rpc.sql`
- `scripts/calibrate-rag-similarity.mjs`
- `tests/ragSecurity.test.ts`

### מקורות שהוכנו לאינדוקס

- ביקורים רפואיים.
- חיסונים.
- תוצאות מעבדה.
- metadata והערות מאושרות של מסמכים.
- סיכומי ביקור מאושרים.
- סיכומי DigitalCare מאושרים.

### אבטחה והפרדת מידע

- חיפוש הווקטורים מסנן `clinic_id`, `pet_id`, תפקיד, בעלות, אישור ושחרור בתוך שאילתת החיפוש עצמה.
- אין חיפוש גלובלי ולאחריו סינון באפליקציה.
- Chunks נחשבים קלט לא מהימן ולא הוראות למודל.
- מקור מקבל מזהה ארעי כמו `S1`; UUID פנימי אינו נשלח לספק.
- בקשות לחשיפת Prompt, Secret או תיק אחר נחסמות.
- כאשר אין מקור מספיק מוחזרת תשובת חוסר מידע ללא המצאה.

### Embeddings ו־HNSW

- Embedding dimension נקבע ל־768.
- `content_hash` מונע יצירה חוזרת כאשר המקור לא השתנה.
- שינוי או מחיקה של מקור מסמנים Chunks ו־Embeddings ישנים כ־`superseded`.
- תוכנן HNSW עם cosine distance ואינדקסי B-tree למסנני tenant/status/model.

### סטטוס

המימוש והבדיקות המקומיות קיימים, אך pgvector, HNSW, RLS, Indexing ו־Q&A לא אומתו על Supabase Preview או ספק אמיתי. לכן:

- `AI_RAG_INDEX_ENABLED=false`
- `AI_RAG_QA_ENABLED=false`
- `AI_ALLOW_MOCK_PROVIDER=false`

ממשק Q&A ללקוח לא הופעל. אין להחליש הרשאות כדי להוסיף אותו.

## 9. שלב 6 — OCR וחילוץ נתונים ממסמכים

### רכיבים שנוספו

- הרחבה של `src/app/components/VaccinationBook.tsx`.
- `src/services/documentOcr.ts`
- `supabase/functions/document-ocr/index.ts`
- `providers/geminiDocumentExtraction.ts`
- Schemas ו־Gateway לחילוץ מסמכים.
- `tests/documentOcrSecurity.test.ts`

### סוגי מסמכים

- מדבקת חיסון.
- פנקס חיסונים.
- מסמך רפואי.
- סיכום ביקור.
- תוצאת בדיקה.

### זרימת החיסון

- JPEG, PNG ו־PDF נתמכים.
- MIME ו־Magic Bytes נבדקים בצד השרת.
- גודל מרבי: 8 MiB.
- הנתונים שחולצו מוצגים כטיוטה הניתנת לעריכה.
- שדה שלא זוהה נשאר ריק.
- אין שמירה אוטומטית.
- שמירה דורשת אישור מפורש ובדיקת הרשאה מחודשת.
- נבדקת כפילות לפי חיה, שם חיסון, אצווה ותאריך.
- כפילות אפשרית דורשת אישור שני.
- נשמרת טבלת `vaccinations` הקיימת; לא נוצר מודל חיסונים מקביל.
- הזנה ידנית, ברקוד ומצלמה ממשיכים לפעול גם כאשר OCR כבוי.

### סטטוס

לא נדרשה Migration חדשה. היכולת נבדקה באמצעות Mock ולא מול ספק OCR אמיתי, ולכן נשארת כבויה:

- `AI_DOCUMENT_OCR_ENABLED=false`
- `AI_VACCINATION_OCR_ENABLED=false`

## 10. שלב 7 — סיכום פשוט ומאושר ללקוח

### רכיבים שנוספו

- `src/app/components/ClientSummaryPanel.tsx`
- שילוב ב־`VisitAiSummaryPanel.tsx`.
- שילוב תצוגה ב־`src/app/pages/ClientPortal.tsx`.
- `src/services/clientSummary.ts`
- `supabase/functions/client-summary/index.ts`
- `20260717173000_client_summary_workflow.sql`
- `tests/clientSummarySecurity.test.ts`

### הזרימה

- המקור חייב להיות סיכום רפואי מאושר.
- המודל רשאי לפשט ולארגן בלבד.
- תרופות, מינונים, תאריכים, אזהרות וטיפול חייבים להתאים בדיוק למקור.
- הפלט נשמר כ־`client_explanation` במצב `draft`.
- אישור ושחרור הם שתי פעולות נפרדות.
- רק תוצר `approved` עם `released_to_owner=true` מוצג בפורטל.
- ביטול שחרור אינו מוחק את ההיסטוריה.
- לקוח רואה רק סיכומים של החיות המשויכות אליו.

### סטטוס

נבדק מקומית באמצעות Mock בלבד. נדרש להחיל Migration ולפרוס Edge Function ב־Preview לפני הפעלה. הדגל נשאר כבוי:

- `AI_CLIENT_SUMMARY_ENABLED=false`

## 11. שלב 8 — הצעות מעקב ותזכורות

### רכיבים שנוספו

- `src/app/components/FollowUpSuggestionsPanel.tsx`
- שילוב ב־`VisitAiSummaryPanel.tsx`.
- `src/services/followUpSuggestions.ts`
- `supabase/functions/follow-up-suggestions/index.ts`
- `20260717180000_follow_up_suggestion_workflow.sql`
- `tests/followUpSuggestionsSecurity.test.ts`

### הזרימה

- המקור הוא סיכום ביקור מאושר בלבד.
- קיימים שלושה סוגים: ביקורת חוזרת, חיסון עתידי ומעקב רפואי כללי.
- AI יוצר הצעה בלבד ולא תור או תזכורת אמיתית.
- ההצעה נשמרת כ־`reminder_suggestion`.
- תאריך מוחלט נשמר כפי שנכתב.
- תאריך יחסי ברור מחושב ביחס לתאריך המקור.
- תאריך עמום נשאר ריק ומסומן `requires_manual_date=true`.
- רק אישור מפורש של וטרינר יוצר רשומה ב־`public.reminders` הקיימת.
- לקוח רואה רק Reminder שאושר ושוחרר עבור חיה השייכת לו.
- מנגנון Advisory Lock ובדיקת מקור/חיה/סוג/תאריך מונעים כפילות אוטומטית.

### סטטוס

נבדק מקומית עם Mock בלבד. הדגל נשאר כבוי:

- `AI_FOLLOW_UP_SUGGESTIONS_ENABLED=false`

Commit נקודת השמירה: `87d40dc`.

## 12. שלב 9 — Hardening, רגרסיה והכנת דמו

### תיקוני P0

1. `visit-summary.generate` שונה מברירת מחדל פתוחה ל־fail-closed.
2. נוספה הבטחה שלכל מרפאה קיימים כל דגלי ה־AI החדשים במצב כבוי.
3. תוקנה רגרסיה בהסתעפות Kill Switch של סיכום לקוח והצעות מעקב.

### Migration חדשה

- `20260717190000_ai_feature_flag_fail_closed.sql`

ה־Migration:

- יוצרת את תשעת דגלי היכולת הנדרשים לכל מרפאה קיימת וחדשה.
- מגדירה אותם ככבויים.
- מונעת מחיקה מקרית של שורות דגל מוגנות.
- שוללת `EXECUTE` מהתפקידים שאינם אמורים להפעיל את פונקציות העזר.

### בדיקות Hardening

- כל Edge Function משתמשת ב־JWT וב־`auth.getUser()`.
- לא נמצאו Policies רחבות מסוג `using (true)` או `with check (true)`.
- כל `SECURITY DEFINER` שנסרק כולל `search_path` קבוע.
- לא נמצא Grant ל־`PUBLIC` או `anon` בפונקציות הרגישות.
- אין Provider Keys או Service Role ב־Frontend.
- Buckets רפואיים פרטיים ו־Signed URLs קצרים.
- אין כתיבת פלט AI ישירות לתיק רפואי ללא אישור.

### תוצאות הבדיקה הסופיות

- Production Build: עבר, 1,828 modules.
- `test:vetbot`: ‏120/120 עברו.
- Type Check: עבר.
- Frontend Secrets: עבר.
- Hardening: ‏5/5.
- PGlite migration/RLS: ‏11/11.
- DigitalCare: ‏33/33.
- RAG: ‏10/10.
- סיכום לקוח: ‏18/18.
- הצעות מעקב: ‏19/19.
- `git diff --check`: עבר.
- Lint אינו מוגדר בפרויקט ולא נוסף כלי חדש.

לא נותר P0 ידוע בקוד המקומי.

Commit נקודת השמירה: `93b8f8b`.

## 13. מפת רכיבים סופית

### Edge Functions

| Function | תפקיד | מצב נוכחי |
|---|---|---|
| `ai-assistant` | VetBot והמסלול הקיים | נשמר; התאמת הגרסה החיה טרם אומתה |
| `visit-summary` | יצירת טיוטת סיכום ביקור | קוד מוכן, כבוי, לא נפרס ב־Preview |
| `digitalcare-transcription` | הסכמה, upload, תמלול וסיכום | קוד מוכן, כבוי, לא נפרס ב־Preview |
| `medical-record-rag` | Indexing ו־Q&A על תיק רפואי | קוד מוכן, כבוי, לא נפרס ב־Preview |
| `document-ocr` | חילוץ נתונים ממסמכים | קוד מוכן, כבוי, לא נבדק עם ספק אמיתי |
| `client-summary` | סיכום פשוט ללקוח | קוד מוכן, כבוי, לא נפרס ב־Preview |
| `follow-up-suggestions` | הצעות מעקב ותזכורות | קוד מוכן, כבוי, לא נפרס ב־Preview |

### רכיבי UI עיקריים שנוספו

- `VisitAiSummaryPanel.tsx`
- `DigitalCareTranscriptionPanel.tsx`
- `MedicalRecordRagPanel.tsx`
- הרחבת `VaccinationBook.tsx`
- `ClientSummaryPanel.tsx`
- `FollowUpSuggestionsPanel.tsx`

### שירותי Frontend שנוספו

- `visitSummary.ts`
- `digitalCareTranscription.ts`
- `medicalRecordRag.ts`
- `documentOcr.ts`
- `clientSummary.ts`
- `followUpSuggestions.ts`

### Migrations לפי סדר ההרצה

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

Migration ייעודית ל־OCR לא נדרשה משום שנעשה שימוש בטבלת החיסונים וב־Storage הקיימים.

## 14. מצב Feature Flags הבטוח

היכולות הבאות חייבות להישאר כבויות עד לבדיקת Preview וספק אמיתי:

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

Kill Switches נשארים `false` במצב רגיל. במקרה תקלה מפעילים רק את Kill Switch של היכולת הבעייתית. אין לחשוף Flags, Provider, Model או Kill Switch ל־Frontend.

## 15. מה מוכן כרגע לדמו

מסלול הליבה המומלץ:

1. התחברות כווטרינר.
2. דשבורד, תור הבא ותורים שעברו.
3. מעבר מתור לתיק החיה.
4. תיק רפואי, ביקור, חיסונים ומסמכים.
5. יומן וזמינות המרפאה.
6. DigitalCare ו־Google Meet ללא תמלול AI.
7. הזנה ידנית, מצלמה וברקוד בפנקס החיסונים.
8. VetBot הכללי ללא מידע אמיתי.
9. בוט קביעת תורים והצגת שעות פנויות בלבד.
10. פורטל בעלים המציג רק מידע ששייך לבעלים ואושר להצגה.
11. הוכחה שטיוטות, תמלולים ו־Audit אינם נחשפים ללקוח.

שלבים 3–8 קיימים בקוד אך אין להציג אותם כתכונות חיות מול ספק אמיתי לפני בדיקת Preview. אם רוצים להציג את הארכיטקטורה, ניתן להראות את המסכים וה־Feature Flags הכבויים ולהסביר את מנגנון האישור האנושי.

## 16. מה עדיין חסר — מקצה לקצה

### P1 — נדרש כדי לאמת את היכולות החדשות

1. ליצור Supabase Preview Branch או פרויקט בדיקות נפרד.
2. להחיל בו את 11 ה־Migrations לפי הסדר.
3. להריץ RLS חי עם שתי מרפאות, שני וטרינרים, עובד, שני בעלים וחיות סינתטיות.
4. לאמת Storage פרטי, Signed Upload ו־Signed URL בפועל.
5. לאמת `pgvector`, ממד 768, HNSW ושימוש באינדקס באמצעות `EXPLAIN`.
6. לפרוס את שש Edge Functions החדשות ל־Preview.
7. להגדיר Secrets של Preview בלבד, ללא `VITE_`.
8. לבדוק כל יכולת מול ספק אמיתי:
   - סיכום ביקור.
   - תמלול וסיכום DigitalCare.
   - Embeddings ו־RAG.
   - OCR.
   - סיכום ללקוח.
   - הצעות מעקב.
9. לכייל איכות OCR ו־`AI_RAG_MINIMUM_SIMILARITY` עם נתונים סינתטיים.
10. לבצע E2E מלא בדפדפן ב־desktop ובנייד.
11. לאמת drift בין `ai-assistant` וה־Functions החיות לבין הקוד המקומי.
12. להחליף Rate Limiter בזיכרון בפתרון מבוזר לפני עומס אמיתי.
13. להוסיף Scheduler מנוטר למחיקת הקלטות, תמלולים וקבצים זמניים.

### P2 — נדרש לפני Production אמיתי

- בדיקת חדירה וביקורת הרשאות חיצונית.
- DPIA סופי וייעוץ משפטי בנושא מידע רפואי, הקלטה, תמלול והעברה לספקי AI.
- DPA עם Supabase וספקי AI, כולל מיקום מידע, תתי־מעבדים, ZDR ואי־אימון.
- מדיניות Retention ומחיקה מאושרת.
- ניטור, התראות, SIEM, Runbooks ורוטציית סודות.
- גיבוי, שחזור ו־Disaster Recovery עם תרגיל שחזור.
- בדיקות עומס, quota, עלויות ו־failover ספק.
- נגישות מלאה ובדיקות שימושיות רשמיות.
- סריקת תלויות ותיקון מבוקר ללא `audit fix --force`.

### החלטות מוצר שעדיין נדרשות

- האם לאפשר Q&A רפואי לבעלים ובאיזה היקף.
- נוסח ההסכמה להקלטה ותמלול ואופן משיכת ההסכמה.
- מי רשאי לשחרר או לבטל שחרור של סיכום ותזכורת ללקוח.
- רף האיכות המינימלי להפעלת OCR ו־RAG.
- תקופות Retention סופיות לכל סוג מידע.

## 17. סדר העבודה המומלץ מכאן

### הפעולה הבאה היחידה

להקים Supabase Preview נפרד מ־Production ולהחיל בו את 11 ה־Migrations לפי הסדר.

### לאחר מכן

1. להשאיר את כל ה־Flags כבויים.
2. ליצור נתונים ומשתמשים סינתטיים לשתי מרפאות.
3. להריץ בדיקות RLS ו־Storage שליליות וחיוביות.
4. לפרוס את Edge Functions ל־Preview.
5. להפעיל יכולת אחת בכל פעם, תחילה בסביבת Preview בלבד.
6. להתחיל מסיכום ביקור, אחריו סיכום לקוח ומעקב, לאחר מכן OCR, ורק לבסוף DigitalCare AI ו־RAG.
7. לכבות כל יכולת לאחר הבדיקה עד להחלטת Go מפורשת.
8. לא לבצע Merge ל־`master` או Deploy ל־Production ללא אישור מפורש.

## 18. Rollback כללי

- השבתה מיידית: `ENABLED=false` או Kill Switch של היכולת הרלוונטית.
- אין למחוק תוצרים, תמלולים, תזכורות, Chunks, Embeddings או מידע רפואי.
- סקריפטים ייעודיים קיימים תחת `supabase/rollback/stage2` עד `stage9`.
- Rollback של שלב 9 משתמש ב־`stage9/01_disable_unverified_ai_capabilities.sql` ומשאיר את בקרת fail-closed.
- Rollback קוד נעשה באמצעות `git revert` של Commit ממוקד, לא `reset --hard`.
- Drop של מבנים מותר רק ב־Preview ריק ולאחר שהסקריפט הוכיח שאין מידע.

## 19. Commits מרכזיים

| שלב | Commit |
|---|---|
| תשתית, נתונים וסיכום ביקור | `1eea414` |
| DigitalCare | `32a2d88` |
| RAG | `272b080` |
| OCR | `65a211e` |
| סיכום ללקוח | `9023d46` |
| הצעות מעקב | `87d40dc` |
| Hardening והכנת דמו | `93b8f8b` |

## 20. מסמכי מקור משלימים

- `docs/ai-current-state-audit.md`
- `docs/ai-regression-baseline.md`
- `docs/ai-architecture.md`
- `docs/ai-data-security.md`
- `docs/ai-visit-summary.md`
- `docs/ai-digitalcare.md`
- `docs/ai-rag.md`
- `docs/ai-document-ocr.md`
- `docs/ai-client-summary.md`
- `docs/ai-follow-up-suggestions.md`
- `docs/final-ai-hardening-report.md`
- `docs/demo-readiness-checklist.md`
- `docs/final-gap-analysis.md`
- `docs/demo-runbook.md`
- `docs/production-deployment-checklist.md`

## 21. מסקנה

ליבת MyVet, VetBot הקיים ובוט קביעת התורים נשמרו ועברו את חבילת הרגרסיה המקומית. שכבת AI מרכזית, מאובטחת ו־Provider-agnostic נוספה בקוד, יחד עם מודל נתונים, RLS, Storage פרטי, סיכומי ביקור, DigitalCare AI, RAG, OCR, סיכום ללקוח והצעות מעקב.

עם זאת, יכולות AI חדשות אינן נחשבות מאומתות מקצה לקצה עד להחלת ה־Migrations, פריסת ה־Edge Functions ובדיקת ספק אמיתי בסביבת Preview נפרדת. לכן מצב המערכת הוא Conditional Pass: מוכנה לדמו של הליבה, אך לא להפעלה קלינית מלאה של היכולות החדשות ולא ל־Production.
