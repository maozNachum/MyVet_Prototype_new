# MyVet AI — שלב 4: DigitalCare מאובטח

> **הערת תחזוקה 31.08.2026:** זרימת ההרשאות וההסכמה נשארת תיעוד שימושי; סטטוס הפריסה המתואר בהמשך הוא snapshot היסטורי ואינו הוכחה למצב פונקציה או Feature Flag בסביבה נוכחית.

## סטטוס

שלב 4 מיושם בקוד בלבד ואינו מופעל אוטומטית. לא הוחלו migrations על סביבת Supabase חיה ולא בוצעה פריסה. שלושת ה־Feature Flags נוצרים ככבויים, וגם משתני הסביבה כבויים כברירת מחדל.

## הזרימה

1. הווטרינר נכנס לשיחת Google Meet הקיימת. הווידאו אינו תלוי בשירות AI.
2. Edge Function מאמתת JWT באמצעות `auth.getUser()`, טוענת את `video_sessions` דרך RLS ומוודאת שהמשתמש הוא וטרינר פעיל באותה מרפאה.
3. התור חייב להיות מסוג `video`, וכל קשרי התור, החיה, הבעלים והשיחה נבדקים בצד השרת.
4. ללא הסכמה מפורשת אין capture ואין הרשאת העלאה. נשמרים הבעלים שהסכים, המשתמש שתיעד, הזמן, המטרה, גרסת הנוסח, התור וה־video session.
5. שמע זמני מועלה ל־`ai-recordings` הפרטי באמצעות Signed Upload Token לנתיב אטום שהשרת יצר.
6. Provider Adapter מתמלל. התמלול נשמר כ־`ai_artifacts` מסוג `transcript`, במצב `draft`, ומסומן אוטומטי ולא מאושר.
7. ללא בחירת שמירת הקלטה, קובץ השמע נמחק מיד לאחר תמלול מוצלח. שמירה דורשת הסכמה נפרדת.
8. הסיכום משתמש ב־AI Gateway וב־Schema של שלב 3. נוצרת רשומת ביקור ריקה מתוכן AI, והסיכום נשמר כטיוטה מוגנת.
9. רק וטרינר יכול לערוך, לדחות או לאשר. רק לאחר אישור נשמר ברשומת הביקור סימון לתוצר הרשמי, וה־provenance מועתק לגרסה המאושרת.

## הרשאות ופרטיות

- לקוח אינו מקבל גישה לתמלול, טיוטה, Audit או הקלטה.
- רק וטרינר פעיל באותה מרפאה יכול להפעיל את הזרימה או לקבל Signed URL.
- `clinic_id`, `owner_id`, `pet_id`, זהות ותפקיד נגזרים בשרת; ה־Frontend אינו בוחר provider, model, prompt או הרשאות.
- RPCs משנות נתונים הן `SECURITY DEFINER`, עם `search_path = ''`, ביטול הרשאה מתפקידי הדפדפן והרשאה ל־`service_role` בלבד.
- אין prompt, transcript, שמע או תוכן רפואי ב־logs הרגילים. `ai_audit_events` שומר metadata בלבד.
- ה־bucket פרטי. הורדה מתבצעת ב־Signed URL של 60 שניות ונרשם `file_accessed`.

## Feature Flags ו־Kill Switches

| יכולת | DB capability | משתנה סביבה | ברירת מחדל |
|---|---|---|---|
| תמלול | `digitalcare_transcription` | `AI_DIGITALCARE_TRANSCRIPTION_ENABLED` | כבוי |
| שמירת הקלטה | `digitalcare_recording` | `AI_DIGITALCARE_RECORDING_ENABLED` | כבוי |
| טיוטת סיכום | `digitalcare_summary` | `AI_DIGITALCARE_SUMMARY_ENABLED` | כבוי |

לכל אחת משלוש היכולות קיים גם Kill Switch עצמאי בצד השרת:
`AI_DIGITALCARE_TRANSCRIPTION_KILL_SWITCH`, `AI_DIGITALCARE_RECORDING_KILL_SWITCH` ו־`AI_DIGITALCARE_SUMMARY_KILL_SWITCH`. ברירת המחדל שלהם `false`; הפעלת אחד מהם חוסמת רק את היכולת המתאימה.

השבתת יכולת אחת אינה משביתה Google Meet, VetBot, בוט התורים או יכולת DigitalCare אחרת.

## Retention וניקוי

- שמע זמני: מחיקה מיד לאחר הצלחה; fallback עד יום אחד אם המחיקה נכשלת.
- הקלטה: 7 ימים כברירת מחדל, configurable ומוגבל ל־1–30 ימים.
- תמלול גולמי: 30 ימים כברירת מחדל, configurable ומוגבל ל־1–90 ימים.
- טיוטה וגרסה מאושרת: מדיניות שלב 3 והרשומה הרפואית.
- Audit: metadata בלבד לפי מדיניות שלב 2.

ה־Edge Function מבצעת ניקוי opportunistic בכל בקשת Stage 4 מורשית. לפני Production נדרש scheduler מנוטר כדי להבטיח SLA למחיקה גם בתקופות ללא שימוש.

## כשלים ומניעת כפילויות

- כשל הרשאה או הסכמה נכשל סגור לפני capture.
- כשל מיקרופון, upload, ספק תמלול או AI אינו סוגר Google Meet ואינו מוחק הערות ידניות.
- תמלול חלקי אינו מקבל סטטוס מאושר.
- retry קיים רק לקריאת ספק בטוחה; idempotency ו־advisory locks מונעים מסמך או תמלול כפולים.
- הודעות למשתמש כלליות ואינן חושפות provider response, SQL או כתובת Storage פנימית.

## מגבלות Preview ונושאים לבדיקה משפטית

- המימוש המקומי משתמש ב־`MediaRecorder` על מיקרופון המכשיר. הוא אינו אינטגרציית Google Meet רשמית ואינו מבטיח קליטה מלאה של הצד המרוחק.
- ההסכמה היא `staff_assisted`: הבעלים המזוהה נשמר כמי שהסכים והווטרינר כמי שתיעד. נדרש אישור משפטי לנוסח, לאופן ההצגה, למשיכת הסכמה ולשאלה אם נדרשת הסכמה מכל משתתף.
- יש לאשר הסכם עיבוד עם ספק התמלול: מיקום עיבוד, שימוש לאימון, מחיקה, אירועי אבטחה והעברות מחוץ לישראל.
- תקופות retention הן ברירות מחדל מצמצמות, לא החלטה משפטית סופית.
- אין טענה שהמימוש לבדו עומד בכל דרישות הדין. לפני Production נדרשים ייעוץ משפטי, DPIA מעודכן, בדיקת אבטחה ונגישות.

מקורות רשמיים לעיון: [חוק הגנת הפרטיות](https://www.gov.il/BlobFolder/legalinfo/legislation/en/Protection-of-Privacy-Law57411981unofficialtranslatioup.pdf), [תקנות הגנת הפרטיות (אבטחת מידע)](https://www.gov.il/BlobFolder/legalinfo/data_security_regulation/en/PROTECTION%20OF%20PRIVACY%20REGULATIONS.pdf). אלה אינם תחליף לייעוץ משפטי.

## Rollout ו־Rollback

Rollout: Preview בלבד, flags כבויים, בדיקת שתי מרפאות, אישור משפטי/ספק, canary לתמלול, אחריו summary, ורק לבסוף recording אם קיים צורך מאושר.

Rollback מדויק:

1. הרץ `supabase/rollback/stage4/01_disable_digitalcare_ai.sql` להשבתה מיידית תוך שימור נתונים.
2. בטל את פריסת `digitalcare-transcription` והחזר את ה־Frontend לגרסה קודמת.
3. אל תמחק הקלטות, הסכמות, Audit או רשומות רפואיות בלי החלטת retention ומשפטית.
4. רק ב־Preview ריק ניתן להריץ `02_remove_empty_digitalcare_ai.sql`; הוא נכשל במפורש אם קיימים נתוני Stage 4.
