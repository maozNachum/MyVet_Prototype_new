# MyVet Stage 5 — RAG מאובטח לתיק הרפואי

## גבולות השלב

שלב 5 מוסיף שאלות ותשובות מבוססות תיק במסך התיק הרפואי לצוות מורשה. הוא אינו מוסיף ידע רפואי חיצוני, OCR, חיפוש אינטרנט, אבחון, מרשם, שינוי רשומה או שמירת תשובת Q&A בתיק. ממשק לקוח לא הופעל בשלב זה; תשתית החיפוש יודעת לאכוף בעלות ושחרור מפורש, אך חוויית הלקוח נדחתה עד לאישור מוצרי/משפטי של משמעות `release_to_client`.

## הזרימה

1. הדפדפן שולח ל־`medical-record-rag` רק פעולה, `petId` ושאלה.
2. ה־Edge Function מאמת JWT ומעביר ל־RPC את `authData.user.id`; אין קבלת מרפאה, בעלים, תפקיד, ספק, מודל או filters מהלקוח.
3. `myvet_rag_status` גוזר מרפאה, תפקיד ובעלות מתוך `staff`, `owners` ו־`patients`.
4. לצוות מורשה (`clinic_admin`, `vet`, `nurse`) האינדקס מסנכרן מקורות מאושרים. מזכירות אינה מקבלת הרשאת מידע רפואי.
5. הטקסט מחולק לעד 24 chunks מצומצמים, ושמות ידועים, טלפון, אימייל, כתובת, מזהים וקישורים מושחרים לפני שמירת ה־chunk ולפני הספק. `content_hash` מונע embedding חוזר כאשר התוכן והמודל לא השתנו.
6. Embedding נוצר דרך `EmbeddingProviderAdapter`; ברירת המחדל היא Gemini, וקיים Mock דטרמיניסטי לבדיקות.
7. `myvet_rag_search` מסנן מרפאה, חיה, תפקיד, אישור ושחרור בתוך אותה שאילתת vector, לפני דירוג/limit.
8. אם אין מקורות מספקים מוחזרת תשובת חוסר מידע בלי קריאה למודל תשובה.
9. המקורות מקבלים מזהים ארעיים `S1`–`S8` לפני ספק ה־AI. המודל אינו מקבל UUID או מזהה רשומה אמיתי.
10. רק מקורות שהמודל סימן ושעברו validation מול קבוצת המקורות שנשלפה מוצגים למשתמש.

## מקורות

| מקור | תנאי קליטה | שחרור ללקוח בשלב 5 |
|---|---|---|
| ביקור רפואי | רשומה באותה מרפאה ובאותה חיה | לא |
| חיסון | רשומה באותה מרפאה ובאותה חיה | לא |
| תוצאת מעבדה | סטטוס completed/ready מקביל | לא |
| מסמך רפואי | metadata/הערות מאושרות בלבד | לא |
| סיכום ביקור מאושר | `ai_artifacts.status=approved` | רק אם `released_to_owner=true` |
| סיכום DigitalCare מאושר | סיכום מאושר עם מקור `digitalcare` | רק אם `released_to_owner=true` |
| חילוץ מסמך עתידי | allowlist מוכן, ללא OCR בשלב 5 | דורש שחרור מפורש |

קובץ מסמך אינו עובר OCR או חילוץ טקסט בשלב זה. רק שם, קטגוריה והערות מאושרות ניתנים לאינדוקס. תוכן מסמכים מלא יתווסף רק בשלב OCR נפרד ובאישור מתאים.

## מודל הנתונים והווקטורים

- `ai_document_chunks` הורחבה ב־tenant/source metadata, `approval_status` ו־`release_to_client`.
- `ai_document_embeddings` הורחבה ב־`extensions.vector(768)` וב־`embedding_version`.
- HNSW עם cosine distance משמש לחיפוש; אינדקס B-tree מקדים את מסנני tenant/model/status.
- הממד קבוע ל־768. שינוי מודל בעל ממד שונה מחייב migration ו־re-index מלא; אין לערבב ממדים.
- `ai_document_chunks_active_source_idx` מונע שני סטים פעילים לאותו מקור/index.
- שינוי או מחיקת מקור מסמנים מיד chunks ו־embeddings כ־`superseded`. יצירת embeddings חדשה נשארת פעולה שרתית ואינה מתבצעת מתוך trigger.

## הרשאות

| פעולה | מנהל מרפאה | וטרינר | אח/ות | מזכירות | בעלים |
|---|---:|---:|---:|---:|---:|
| סנכרון אינדקס | כן | כן | כן | לא | לא |
| Q&A על חיה במרפאה | כן | כן | כן | לא | לא דרך UI |
| חיפוש חיית לקוח משויך | — | — | — | — | תשתית בלבד |
| מקור פנימי/טיוטה/תמלול | לפי מקור מאושר בלבד | לפי מקור מאושר בלבד | לפי מקור מאושר בלבד | לא | לא |
| Audit / vectors גולמיים | לא מהדפדפן | לא מהדפדפן | לא מהדפדפן | לא | לא |

הטבלאות הגולמיות נשללו מ־`anon` ומ־`authenticated`. כל RPC של Stage 5 הוא `SECURITY DEFINER`, עם `search_path=''`, `REVOKE` מ־public/anon/authenticated ו־`GRANT EXECUTE` ל־service_role בלבד.

## Prompt Injection ובטיחות רפואית

- כל chunk מוגדר כמידע לא מהימן ולא כהוראה.
- שאלה, system instructions ומקורות מופרדים.
- סוגי המקורות הם allowlist קשיח במסד ובשרת.
- למודל אין יכולת לשנות filters, לקרוא SQL או להפעיל tools.
- בקשות לחשיפת prompt/secret/תיק אחר נחסמות לפני הספק ונרשמות כ־metadata בלבד.
- הפלט אינו יכול לאבחן, להמליץ על טיפול/מינון חדש, ליצור מרשם או לקבוע שאין דחיפות.
- אין מספיק מידע: מחזירים הודעה קבועה ומקורות ריקים.
- סתירה: status `conflict` והצגה מפורשת של אי־התאמה.

## Feature Flags ו־Kill Switch

שתי היכולות מתחילות כבויות גם ב־Environment וגם במסד:

- `rag.index` / `AI_RAG_INDEX_ENABLED` / DB capability `rag_index`.
- `rag.answer` / `AI_RAG_QA_ENABLED` / DB capability `record_qa`.

השבתת אחת אינה משביתה VetBot, בוט התורים, סיכומי ביקור או DigitalCare. השבתת index משאירה חיפוש על vectors תקינים קיימים; השבתת Q&A חוסמת תשובות בלבד.

## Environment — שמות בלבד

- `AI_RAG_INDEX_ENABLED`
- `AI_RAG_QA_ENABLED`
- `AI_EMBEDDING_PROVIDER`
- `AI_ALLOW_MOCK_PROVIDER` (בדיקות בלבד; אין להפעיל ב־Production)
- `AI_EMBEDDING_MODEL`
- `AI_EMBEDDING_VERSION`
- `AI_EMBEDDING_TIMEOUT_MS`
- `AI_RAG_MAX_CHUNKS_PER_SOURCE`
- `AI_RAG_MAX_RESULTS`
- `AI_RAG_MINIMUM_SIMILARITY`
- `GEMINI_API_KEY` (קיים, server only)

אין להגדיר אף אחד מהמשתנים כ־`VITE_*`.

## Audit ועלות

`ai_operations` ו־`ai_audit_events` שומרים רק request id, capability, outcome, provider/model/version, latency, token counts ו־error code. אין שמירת שאלה, תשובה, prompt מלא, chunk, תוכן רפואי או מזהה ספק פרטי בלוג רגיל.

## Rollout

1. להחיל לפי הסדר `20260717160000_secure_medical_record_rag.sql` ואז `20260717160500_secure_medical_record_rag_rpc.sql` ב־Preview.
2. להגדיר משתני server בלבד ולפרוס `medical-record-rag`.
3. להפעיל תחילה `rag_index` במרפאת Preview וב־Environment, לסנכרן חיה סינתטית ולבדוק duplicate prevention.
4. להפעיל `record_qa` ו־Environment Q&A רק לאחר בדיקות cross-tenant, owner release, injection וכשלי ספק.
5. להריץ את מלוא הרגרסיה של VetBot, תורים, סיכום ביקור ו־DigitalCare.
6. Production דורש בקשה מפורשת, גיבוי, בדיקת Advisors וניטור. שלב זה לא פרס ולא שינה DB חי.

## Rollback

1. להגדיר `AI_RAG_INDEX_ENABLED=false` ו־`AI_RAG_QA_ENABLED=false`.
2. להריץ `supabase/rollback/stage5/01_disable_medical_record_rag.sql` — הפיך ולא מוחק מידע.
3. להסיר/להחזיר את Edge Function באמצעות revert של commit Stage 5; יתר MyVet ממשיך לעבוד.
4. רק בסביבת Preview ריקה, ולאחר שהוכח שאין `source_type` ב־chunks, להריץ `02_remove_empty_medical_record_rag.sql`. הסקריפט עוצר אם קיים מידע מאונדקס.
5. כאשר קיים מידע אמיתי אין לבצע DROP; משאירים quarantine ומבצעים forward-fix או שחזור מגיבוי מאושר.

## מגבלות שנותרו

- לא בוצעה החלה על Supabase חי ולא בדיקת vector/RLS מול Preview מחובר.
- אין job/queue מתוזמן; הסנכרון מתבצע בבקשת צוות ובעדכון מקורות מפורש. triggers מבטיחים שמקור ששונה אינו ממשיך להופיע.
- אין OCR או חילוץ PDF בשלב זה.
- ממשק Q&A ללקוח נדחה; אין להפעילו על ידי החלשת הרשאות.
- ערכי similarity, retention והפעלת ספק דורשים כיול עסקי, אבטחה ובדיקת פרטיות לפני Production. זה אינו אישור משפטי.
