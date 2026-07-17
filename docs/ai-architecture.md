# MyVet — ארכיטקטורת תשתית AI מרכזית

## Stage 6 — document extraction

Document OCR enters through the authenticated `document-ocr` Edge Function and central `runDocumentExtractionGateway`. Provider-specific multimodal handling stays in `GeminiDocumentExtractionAdapter`; prompts and strict schemas are versioned shared infrastructure. OCR flags default off and are independent of RAG and VetBot. The reviewed vaccination draft is saved only after explicit confirmation into the existing vaccination schema and private storage. See `docs/ai-document-ocr.md`.

עודכן: 17.07.2026  
שלב: 1 הושלם בקוד; שלב 2 מוכן מקומית ולא הוחל על Production  
ענף: `Full_Demo`

## 1. מטרת הארכיטקטורה

שכבת ה־AI החדשה מרכזת בחירת ספק, מודל, Prompt, סכמות, timeout, retry, rate limit, דגלים, שגיאות ו־audit בצד השרת. חוזה ה־Frontend לא השתנה: כל המסכים ממשיכים לקרוא ל־Supabase Edge Function בשם `ai-assistant`, ואין ב־Frontend אפשרות לבחור ספק, מודל, Prompt או הרשאות.

לא נוספו יכולות רפואיות או עסקיות חדשות ולא שונה פורטל הלקוחות. שלב 2 מוסיף בקוד המקומי schema, RLS ו־Storage מאובטחים; הם טרם הוחלו על Production.

## 2. הזרימה הפעילה

```text
Frontend קיים
  -> ai-assistant (JWT + CORS + מגבלת גודל)
  -> אימות משתמש ותפקיד מול Supabase
  -> סכמת קלט קשיחה והסרת שדות לא מורשים
  -> כלי קריאה קיימים תחת RLS
  -> AI Gateway
       -> Feature Flags / Kill Switch
       -> Rate Limit לפי משתמש מאומת ויכולת
       -> Data Minimization + Redaction נוספת
       -> Prompt Registry ו-Model Configuration שרתיים
       -> Gemini Provider Adapter
       -> Timeout / fallback / retry בטוח בלבד
       -> סכמת פלט קשיחה
       -> Telemetry ו-Audit metadata-only
  -> נרמול הפלט הקיים
  -> הצעת פעולה קיימת, Validation ואישור אנושי נפרד
  -> תשובה בחוזה הקיים ל-Frontend
```

זהות המשתמש נקבעת באמצעות `getUser()`; התפקיד נקבע מחדש מול `staff` או `owners`. ערכי `userRole`, מזהים או הקשר שמגיעים מהדפדפן אינם משמשים כמקור הרשאה.

## 3. רכיבי התשתית

| רכיב | קובץ | אחריות |
|---|---|---|
| Gateway | `supabase/functions/_shared/ai/gateway.ts` | תזמור מאובטח, redaction, flags, rate limit, provider, telemetry |
| Provider contract | `supabase/functions/_shared/ai/types.ts` | ממשק אחיד ל־Provider Adapters ולתוצאות |
| Gemini adapter | `supabase/functions/_shared/ai/providers/gemini.ts` | קריאת REST קיימת, timeout, fallback, usage ו־structured output |
| Prompt Registry | `supabase/functions/_shared/ai/prompts.ts` | Prompt שרתי עם גרסה ו־retry suffix |
| Model Configuration | `supabase/functions/_shared/ai/config.ts` | מודל ראשי, fallback, timeout, retry ו־rate limit |
| Schemas | `supabase/functions/_shared/ai/schemas.ts` | סכמת קלט ופלט קשיחה ו־runtime validation |
| Feature Flags | `supabase/functions/_shared/ai/featureFlags.ts` | Kill Switch כללי ולכל משפחת יכולת |
| Rate Limit | `supabase/functions/_shared/ai/rateLimit.ts` | מכסה לדקה לפי משתמש מאומת ויכולת, ברמת Edge isolate |
| Errors | `supabase/functions/_shared/ai/errors.ts` | קודים ומסרים ציבוריים ללא פרטי ספק/Stack Trace |
| Compatibility | `supabase/functions/ai-assistant/index.ts` | שימור endpoint וחוזה קיים ונתיב rollback ישן |

## 4. בחירת Provider, Model ו־Prompt

- ה־Provider הפעיל בשלב 1 הוא `gemini`, דרך `GeminiProviderAdapter`.
- ה־Frontend אינו שולח ואינו יכול לבחור Provider, Model, System Prompt, clinic, actor או role.
- המודל הראשי נקבע רק ב־Edge Secrets באמצעות `GEMINI_MODEL` או ברירת המחדל הקיימת `gemini-3.5-flash`.
- fallbacks נשמרו בסדר מרכזי: `gemini-3.5-flash`, ואז `gemini-2.5-flash`, עם אפשרות שרתית מצומצמת להגדיר רשימה אחרת.
- ה־Prompt הקיים הועבר ללא שינוי מהותי ל־Prompt Registry תחת גרסה `2026-07-16.1`.
- סכמת הפלט גרסה `2026-07-16.1`.
- `AI_GATEWAY_ENABLED=false` מעביר זמנית את הבוט לנתיב הישן שנשמר לצורך rollback בלבד.

## 5. Feature Flags ו־Kill Switches

כל הדגלים הם משתני שרת בלבד. ברירת המחדל בשלב התאימות היא enabled כדי לא לשנות התנהגות קיימת.

| משתנה | השפעה |
|---|---|
| `AI_GATEWAY_ENABLED` | מעבר בין ה־Gateway החדש לנתיב הישן לצורך rollback |
| `AI_GLOBAL_ENABLED` | השבתת קריאות AI חיצוניות של VetBot |
| `AI_VETBOT_ENABLED` | השבתת הבוט הכללי בלי לשנות את שאר המערכת |
| `AI_VETBOT_ACTIONS_ENABLED` | השבתת יצירה/אישור של פעולות VetBot; שאלות רגילות ממשיכות לעבוד |
| `AI_VETBOT_APPOINTMENT_ACTIONS_ENABLED` | השבתה ממוקדת של קביעה, שינוי וביטול תור דרך VetBot בלבד |

דחיית הצעת פעולה עקב Kill Switch מחזירה מצב `blocked` ומאפשרת למשתמש להמשיך ידנית. דחיית בקשת אישור קיימת עדיין מותרת כדי לא להשאיר בקשה תלויה; אישור ביצוע נחסם.

## 6. אימות קלט ופלט

סכמת הקלט מאפשרת רק את השדות הקיימים: mode, question, context, history, memory summary, metadata פרטיות ו־action decision. שדות כגון `provider`, `model`, `systemPrompt`, `clinic_id` או זהות אחרת נדחים.

סכמת הפלט בודקת:

- שדות חובה וסוגים.
- enums של urgency, confidence, action type וערכי פעולה.
- מגבלות אורך וכמות.
- איסור שדות לא מוכרים.
- `requiresConfirmation=true` לכל פעולה מוצעת.
- action type מתוך allowlist בלבד; אין SQL, קוד או כלי שרירותי.

לאחר ה־Validation נשמר גם הנרמול הקיים של נתיבים, תפקידים, אורך והשחרת פלט.

## 7. פרטיות והגנה מפני Prompt Injection

- ההשחרה הקיימת בדפדפן נשמרה.
- `ai-assistant` מבצע השחרה בצד השרת.
- ה־Gateway מבצע שכבת minimization נוספת גם על תוצאות כלים וידע לפני ספק חיצוני.
- actor id, role verification, API keys, service role, URLs פרטיים ומזהים פנימיים אינם נשלחים לספק.
- טקסט משתמש, היסטוריה, הקשר ותוכן ידע נעטפים כנתונים לא מהימנים; ה־System Prompt קובע שאין לפרש אותם כהוראות מערכת.
- פלט ספק אינו מפעיל פעולה ישירות. הצעת פעולה עוברת schema, allowlist, `prepareVetBotAction`, preview, אישור אנושי ו־RPC קיים.

זו בקרת הנדסה ואינה הצהרת תאימות משפטית. שערי ה־DPIA והבדיקה המשפטית ב־`docs/VETBOT_PRIVACY_DPIA_HE.md` נשארו בתוקף.

## 8. Timeout, Retry ו־Rate Limit

- timeout לבקשת ספק: 8 שניות כברירת מחדל.
- deadline כולל: 24 שניות כברירת מחדל.
- retry אחד כברירת מחדל רק על generation בטוח לחזרה, בעיקר פלט JSON לא תקין; פעולת DB אינה נשלחת מחדש.
- סטטוסי ספק זמניים עוברים ל־fallback מאושר.
- Rate Limit: 20 בקשות לדקה למשתמש מאומת וליכולת כברירת מחדל.
- במקרה 429 מוחזר `Retry-After` ללא פרטי תשתית.

מגבלה: ה־Rate Limiter בשלב 1 הוא best-effort בזיכרון של Edge isolate, משום שלא הותר שינוי schema בשלב זה. מכסה מבוזרת ועמידה דורשת תשתית קיימת מתאימה או datastore ייעודי ותועבר לשלב 2/Hardening לאחר החלטת ארכיטקטורה.

## 9. Error Handling

השרת מחזיר רק קודים בטוחים כגון:

- `AI_FEATURE_DISABLED`
- `AI_RATE_LIMITED`
- `AI_CONFIGURATION_ERROR`
- `AI_INPUT_INVALID`
- `AI_PROVIDER_TIMEOUT`
- `AI_PROVIDER_UNAVAILABLE`
- `AI_OUTPUT_INVALID`

לא מוחזרים שם secret, endpoint, model failure detail, response body של הספק או stack trace. ה־Frontend ממפה קודים אלה להודעות קצרות בעברית.

## 10. Audit ו־Telemetry

נמדדים metadata בלבד:

- request id אקראי.
- capability.
- provider/model שנבחרו בצד השרת.
- prompt/schema version.
- outcome וקוד שגיאה בטוח.
- latency, מספר ניסיונות ושימוש token אם הספק החזיר usage metadata.
- סטטוס של פעולה מקומית ואישור/דחייה.

המידע נרשם ללוג התפעולי כ־`AI_GATEWAY_AUDIT` ול־`vetbot_audit_logs` דרך tags ב־`tool_names`, כדי לא לבצע שינוי schema בשלב 1. אין שמירה של prompt, response, תמלול, רשומה רפואית או טקסט אישי.

שיפור schema ייעודי למדדי telemetry נדחה לשלב 2; אין להוסיף עמודות תוכן.

## 11. תאימות ויכולות קיימות

עברו דרך ה־Gateway החדש, ללא שינוי endpoint או UI:

- הבוט הכללי בכל המצבים.
- בוט קביעת התורים דרך mode `schedule`.
- הצעות הפעולה הקיימות, לרבות תורים, לפני מנגנון האישור הקיים.
- VetBot בדוחות, DigitalCare, מלאי, תיק רפואי ופורטל.
- מיפוי כותרות ייבוא חיות המשתמש ב־`ai-assistant`.

נשארו מחוץ ל־Gateway בכוונה:

- כלי הקריאה ל־Supabase: נשארו ב־`ai-assistant` ותחת JWT/RLS; רק תוצאתם המצומצמת נכנסת ל־Gateway.
- מנוע ביצוע הפעולות: נשאר deterministic ומבוסס approval/RPC; אסור להעבירו לשליטת מודל.
- `ai-insights-chat` הישן בסביבת Production: אין לו מקור בריפו ואין לו consumer בקוד הנוכחי. לא שונה או הושבת בשלב זה כדי לא לבצע שינוי חי ללא מקור ו־rollback מאומת. יש להסדירו בנפרד לפני Production rollout.
- `callGeminiLegacy`: נשמר זמנית בקוד לצורך rollback ומופעל רק כאשר `AI_GATEWAY_ENABLED=false`.

## 12. משתני Environment — שמות בלבד

קיימים:

- `GEMINI_API_KEY`
- `GEMINI_MODEL`
- `SUPABASE_URL`
- `SUPABASE_ANON_KEY`
- `SUPABASE_SERVICE_ROLE_KEY`
- `ALLOWED_ORIGINS`

חדשים ואופציונליים:

- `AI_GATEWAY_ENABLED`
- `AI_GLOBAL_ENABLED`
- `AI_VETBOT_ENABLED`
- `AI_VETBOT_ACTIONS_ENABLED`
- `AI_VETBOT_APPOINTMENT_ACTIONS_ENABLED`
- `AI_GEMINI_FALLBACK_MODELS`
- `AI_REQUEST_TIMEOUT_MS`
- `AI_TOTAL_TIMEOUT_MS`
- `AI_MAX_SAFE_RETRIES`
- `AI_RATE_LIMIT_PER_MINUTE`
- `AI_DIGITALCARE_TRANSCRIPTION_ENABLED` (Stage 4; server only; default off)
- `AI_DIGITALCARE_RECORDING_ENABLED` (Stage 4; server only; default off)
- `AI_DIGITALCARE_SUMMARY_ENABLED` (Stage 4; server only; default off)

### Stage 4 — DigitalCare

`digitalcare-transcription` is the authenticated server entry point for audio,
transcription and transcript-based summary drafts. It reuses
`ai_consent_records`, `ai_documents`, `ai_artifacts`, `ai_sources`, the private
`ai-recordings` bucket, the central Gateway and the Stage 3 veterinarian
approval workflow. Provider/model/prompt selection remains server-owned and all
three Stage 4 capabilities default to off. The complete flow, retention,
rollback and legal gates are documented in `docs/ai-digitalcare.md`.

אין להגדיר משתנים אלה ב־Vite או בשם שמתחיל `VITE_`.

### Stage 5 — Medical record RAG

`medical-record-rag` הוא endpoint מאומת נפרד המשתמש ב־Gateway הקיים וב־Embedding Provider Adapter. הוא מרחיב את registries של שלב 2, אינו משנה את VetBot, ומבצע similarity search רק בתוך scope שנגזר בצד השרת. הממד קבוע ל־768 והאינדקס הוא HNSW/cosine. מזהי chunks מוחלפים במזהים ארעיים לפני ספק ה־AI; citations אמיתיים נבנים רק בשרת לאחר validation.

ה־RAG מוסיף דגלים נפרדים ל־index ול־answer, נכשל במצב סגור כשאין מקור, ואינו שומר תשובה בתיק. התכנון המלא, מקורות, Matrix הרשאות, Environment ו־rollback מתועדים ב־`docs/ai-rag.md`.

משתני Stage 5, שמות בלבד: `AI_RAG_INDEX_ENABLED`, `AI_RAG_QA_ENABLED`, `AI_EMBEDDING_PROVIDER`, `AI_ALLOW_MOCK_PROVIDER` (בדיקות בלבד), `AI_EMBEDDING_MODEL`, `AI_EMBEDDING_VERSION`, `AI_EMBEDDING_TIMEOUT_MS`, `AI_RAG_MAX_CHUNKS_PER_SOURCE`, `AI_RAG_MAX_RESULTS`, `AI_RAG_MINIMUM_SIMILARITY`.

## 13. עדכון שלב 2 — שכבת נתונים והרשאות

שלב 2 מוסיף שכבת tenant אמיתית באמצעות `clinics` ו־`clinic_id` חובה בכל טבלה עסקית וחדשה. ה־Frontend אינו מקור לזהות המרפאה; ההקשר נגזר מ־`auth.uid()` והקשרים המאומתים ב־`staff`/`owners`. במקרה של שיוך עמום המערכת נכשלת במצב סגור.

נתוני AI מחולקים לשלוש שכבות:

1. metadata תפעולי: `ai_operations`, `ai_audit_events`, `ai_rate_limit_windows`.
2. תוכן פנימי רגיש: `ai_artifacts`, `ai_documents`, `ai_document_chunks`, `ai_sources`.
3. ממשל: `ai_approval_history`, `ai_consent_records`, `ai_feature_flags`.

טבלאות AI אינן ניתנות לכתיבה מהדפדפן. לקוח יכול לקרוא רק תוצר במצב `approved`, שסומן `released_to_owner`, ששייך לחיה שלו, ושאינו תמלול או חילוץ מסמך גולמי. אישור ושחרור מחייבים וטרינר פעיל באותה מרפאה. Audit והיסטוריית אישורים הם append-only ואינם שומרים prompt, תשובה, תמלול או טקסט רפואי.

Storage רפואי נשאר פרטי. Buckets עתידיים משתמשים בנתיב tenant קשיח ובבדיקת חיה באותה מרפאה. פירוט מלא, Matrix הרשאות ו־Buckets נמצא ב־`docs/ai-data-security.md`; מדיניות שימור מוצעת נמצאת ב־`docs/ai-data-retention-policy.md`.

ה־Gateway של שלב 1 עדיין אינו כותב לטבלאות החדשות ואינו קורא דגלים מהן, כדי לא לשנות את התנהגות הבוט הכללי או בוט התורים בשלב זה. החיבור השרתִי יבוצע בשלב הבא המתאים עם שכבת תאימות ובדיקות רגרסיה.

## 14. נושאים שנדחו לאחר שלב 2

- schema ייעודי ל־AI telemetry, retention ו־audit מורחב.
- rate limit מבוזר ועמיד.
- tenant/`clinic_id` אמיתי והפרדת מרפאות.
- תיקון Policies/RLS קיימים, לרבות ממצא `insights` משלב 0.
- consent, retention records ו־approval schema עתידי.
- הסדרת/השבתת `ai-insights-chat` לאחר אימות בעלות ושימוש.
- כל RAG, OCR, תמלול, סיכום ביקור או תזכורת AI.
