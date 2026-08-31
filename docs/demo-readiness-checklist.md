# MyVet — Checklist מוכנות לדמו

> **Checklist היסטורי מ־17.07.2026.** מספרי הבדיקות ומצב הסביבות בו אינם עדכניים. השתמשו בו רק לתרחיש ההצגה, לא כשער Production.

עודכן: 17.07.2026

## שערים אוטומטיים

- [x] `npm run build`
- [x] `npm run typecheck:ai`
- [x] `npm run test:vetbot` — 120/120
- [x] `npm run test:frontend-secrets`
- [x] `npm run test:ai-data-local`
- [x] `npm run test:hardening`
- [x] `git diff --check`
- [x] אין Lint מוגדר; לא נוסף כלי חדש
- [x] אין Secret, Service Role, Token או נתון לקוח אמיתי ב־Diff
- [ ] E2E דפדפן עם שני משתמשי דמו — פעולה ידנית
- [ ] Supabase Preview מחובר — חסר
- [ ] ספק AI אמיתי ליכולות החדשות — חסר

## מצב בטוח לפני הדמו

יש לוודא בצד השרת בלבד:

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

ה־Kill Switches נשארים `false` במצב רגיל. באירוע תקלה מפעילים רק את ה־Kill Switch של היכולת הרלוונטית.

## נתוני ומשתמשי דמו

- [ ] משתמש וטרינר סינתטי פעיל, עם `role=vet` ושיוך למרפאת הדמו.
- [ ] משתמש בעלים סינתטי המקושר רק לחיות הדמו שלו.
- [ ] חיה סינתטית עם ביקור, חיסון, תור עתידי ורשומה רפואית.
- [ ] שיחת DigitalCare סינתטית וקישור Meet שאינו מכיל מידע אמיתי.
- [ ] פריט מלאי, תוצאת מעבדה ואשפוז לדוגמה.
- [ ] אין שמות, טלפונים, כתובות, ת״ז, פרטי תשלום או מסמכים אמיתיים.
- [ ] הסיסמאות נשמרות מחוץ ל־Git ומחוץ למסמך זה.

## Smoke test ידני לפני הכניסה למבחן

- [ ] התחברות וניתוב לפי role.
- [ ] דשבורד נטען בלי שגיאות; תור שעבר מעומעם והתור הבא מודגש.
- [ ] פתיחת תור מהדשבורד מובילה לתיק החיה.
- [ ] תיק רפואי, ביקור וחיסון ידני נפתחים ונשמרים.
- [ ] קביעת תור בעלים מציגה רק שעות פנויות.
- [ ] תור וידאו נשמר, נשלח ונפתח ל־DigitalCare.
- [ ] DigitalCare ממשיך לעבוד כאשר כל AI חדש כבוי.
- [ ] פורטל בעלים מציג רק חיה ורשומות משוחררות שלו.
- [ ] VetBot כללי ובוט התורים עובדים; אם הספק נכשל מוצגת הודעה ידידותית/fallback.
- [ ] אין טיוטות AI, תמלול או Audit בפורטל הבעלים.

## החלטת Go/No-Go

- Go למסלול הדמו היציב: כל הסעיפים האוטומטיים ו־Smoke test הליבה עברו.
- No-Go ליכולת AI חדשה: אין Preview, מיגרציה, Edge Function או בדיקת ספק אמיתי מתועדת.
- אין להפעיל Mock דרך Frontend או ב־Production.
