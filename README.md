# MyVet

מערכת מידע לניהול מרפאה וטרינרית ותיק רפואי דיגיטלי, עם ממשק עברי מלא בכיוון RTL. המערכת מרכזת את עבודת צוות המרפאה ואת השירות לבעלי חיות המחמד: תורים, לקוחות ומטופלים, ביקורים רפואיים, חיסונים, מעבדה, אשפוזים, מלאי, שירות דיגיטלי, דוחות ו־VetBot.

> **סטטוס הפרויקט:** MyVet פותחה כפרויקט גמר המדמה מוצר אמיתי. פעולות רפואיות משמעותיות דורשות אישור אנושי, ותהליך התשלום בפורטל הוא הדגמה בלבד ואינו מחובר לספק סליקה אמיתי.

## קישורים מהירים

- [מאגר הקוד ב־GitHub](https://github.com/maozNachum/MyVet_Prototype_new)
- [הקשר המוצר והמערכת](docs/PROJECT_CONTEXT_HE.md)
- [ארכיטקטורת Supabase](docs/SUPABASE_ARCHITECTURE_HE.md)
- [תרחיש ההדגמה](docs/DEMO_SCENARIO_HE.md)
- [נוהל ההכנה ל־Production](docs/PRODUCTION_RUNBOOK_HE.md)
- [תסקיר הפרטיות של VetBot](docs/VETBOT_PRIVACY_DPIA_HE.md)

## התחלה מהירה

### דרישות מוקדמות

- Node.js ו־npm
- פרויקט Supabase מוגדר ונגיש
- ערכי הסביבה הציבוריים של הפרויקט

### התקנה והפעלה

```bash
git clone https://github.com/maozNachum/MyVet_Prototype_new.git
cd MyVet_Prototype_new
npm install
```

צרו קובץ `.env` על בסיס `.env.example` והגדירו בו:

```env
VITE_SUPABASE_URL=https://YOUR_PROJECT_REF.supabase.co
VITE_SUPABASE_ANON_KEY=YOUR_SUPABASE_PUBLISHABLE_OR_ANON_KEY
```

לאחר מכן הפעילו את סביבת הפיתוח:

```bash
npm run dev
```

Vite יציג במסוף את הכתובת המקומית של האתר.

> אין להוסיף לקוד הלקוח, לקובצי `VITE_*` או ל־Git מפתחות כמו `GEMINI_API_KEY`, מפתח `service_role`, סיסמת מסד נתונים או סודות אחרים. סודות צד השרת נשמרים ב־Supabase Edge Function Secrets.

## יכולות מרכזיות

### סביבת צוות המרפאה

- דשבורד תפעולי עם תורים, פניות, בדיקות ונושאים הדורשים טיפול.
- יומן תורים בתצוגות יום, שבוע וחודש, כולל זמינות, קיבולת וחסימות.
- ניהול לקוחות ובעלי חיים, לרבות שיוכים, פרטי זיהוי ותיק רפואי.
- תיעוד ביקורים, חיסונים, בדיקות מעבדה, אשפוזים ומסמכים רפואיים.
- ניהול מלאי, ספי מלאי, התראות ומחירון שירותים.
- DigitalCare לניהול שיחות, קבצים וקישורי וידאו.
- דוחות ומדדים תפעוליים בהתאם להרשאות המשתמש.
- ייבוא וייצוא נתונים רפואיים נתמכים בקובצי CSV ו־Excel.

### פורטל בעלי חיות

- צפייה בבעלי החיים המשויכים לחשבון ובמידע ששוחרר עבורם.
- קביעת תור מתוך השעות הפנויות שהמרפאה הגדירה.
- צפייה בתורים, חיסונים, מסמכים, תזכורות והתראות.
- פתיחת פנייה ל־DigitalCare ומעקב אחר השיחה.
- ניהול פרופיל ותצוגת חיובים ותשלומים לצורכי הדגמה.
- ממשק Mobile-first המותאם לשימוש בטלפון.

### VetBot ויכולות AI

- עוזר בעברית המותאם לתפקיד המשתמש ולהקשר של המסך הפעיל.
- הצגת תמונת מצב והכוונה לנושאים הדורשים בדיקה.
- הכנת פעולות תפעוליות לאישור, ובהן ניהול תורים, מלאי, שיחות דיגיטליות וחסימות ביומן.
- ניווט למסכים והכנת טיוטות בלי לקבל החלטות רפואיות עצמאיות.
- מנגנון התאוששות מקומי לפעולות נתמכות כאשר ספק ה־AI אינו זמין.
- צמצום והשחרת מידע רגיש לפני העברת הקשר לספק AI חיצוני.

יכולות AI מתקדמות נוספות קיימות בקוד ומוגנות באמצעות Feature Flags ו־Kill Switches. יש לאמת כל יכולת בסביבת היעד ומול ספק אמיתי לפני הפעלה ב־Production.

## משתמשים והרשאות

| תפקיד | מזהה במערכת | שימוש מרכזי |
| --- | --- | --- |
| מנהל/ת מרפאה | `clinic_admin` | ניהול המרפאה, הצוות, ההגדרות והתפעול |
| וטרינר/ית | `vet` | תיק רפואי, ביקורים, מעבדה, אשפוזים ואישור תוכן רפואי |
| אח/ות | `nurse` | תמיכה בטיפול, אשפוז, חיסונים ומעקב |
| מזכיר/ה | `secretary` | לקוחות, בעלי חיים, תורים ושירות שוטף |
| בעל/ת חיה | `owner` | גישה לפורטל ולמידע השייך לחשבון בלבד |

הזדהות המשתמשים מבוססת על Supabase Auth. הרשאות הנתונים נאכפות באמצעות Row Level Security, פונקציות מסד ופעולות שרת בהתאם למימוש של כל זרימה.

## טכנולוגיות

| שכבה | טכנולוגיות |
| --- | --- |
| Frontend | React 18, TypeScript, Vite 6 |
| ניווט וממשק | React Router 7, Tailwind CSS 4, Lucide, Sonner |
| טפסים ואימות | React Hook Form, Zod |
| Backend ונתונים | Supabase Auth, PostgreSQL, RLS, Realtime, Storage ו־RPC |
| קוד שרת ו־AI | Supabase Edge Functions, AI Gateway ו־Provider Adapters |
| קובצי נתונים | SheetJS ל־CSV ול־Excel |
| בדיקות | Node.js test runner, בדיקות אינטגרציה ו־PGlite לבדיקות SQL מקומיות |
| פריסה | Vercel לממשק ו־Supabase לשירותי ה־Backend |

## ארכיטקטורה בקצרה

```text
React + TypeScript + Vite
            │
            ├── Supabase Auth
            ├── PostgreSQL + RLS + RPC
            ├── Realtime
            ├── Private Storage
            └── Edge Functions ── AI Gateway ── Provider Adapter
```

- ה־Frontend משתמש בלקוח Supabase מרכזי ובמפתח ציבורי המיועד לדפדפן.
- זהות המשתמש, תפקידו ושיוכו למרפאה או לבעלים נבדקים בצד השרת ובמסד הנתונים.
- פעולות רגישות וקריאות לספק AI אינן מבוצעות ישירות מרכיבי React.
- שינויי סכמת Supabase מתועדים בקובצי Migration; לפני הפעלה יש לבדוק אילו Migrations כבר הוחלו בסביבה המקושרת.
- קבצים רפואיים רגישים מיועדים לאחסון פרטי ולגישה באמצעות Signed URLs קצרי תוקף.

## מבנה הפרויקט

```text
src/
├── app/
│   ├── pages/           מסכי המערכת
│   ├── components/      רכיבים משותפים ורכיבי תחום
│   ├── components/ai/   VetBot, הקשר, פעולות ותשובות מובנות
│   ├── data/            Context stores, הרשאות ומידע משותף
│   ├── hooks/           hooks משותפים
│   └── routes.tsx       הגדרת הנתיבים
├── services/            שירותי Supabase ושירותי אפליקציה
└── styles/              עיצוב גלובלי

supabase/
├── migrations/          שינויי סכמה, RPC, Triggers ו־RLS
├── rollback/            הוראות Rollback עבור שינויים רלוונטיים
└── functions/           Edge Functions וקוד AI משותף

tests/                   בדיקות יחידה, אבטחה, SQL ורגרסיה
docs/                    תיעוד מוצר, ארכיטקטורה, אבטחה ותפעול
```

## נתיבים מרכזיים

| נתיב | מסך |
| --- | --- |
| `/login` | התחברות והרשמת בעלי חיות |
| `/` | דשבורד צוות המרפאה |
| `/appointments` | יומן תורים |
| `/appointments/new` | יצירת תור חדש |
| `/clients` | לקוחות |
| `/patients` | בעלי חיים ותיקים רפואיים |
| `/lab-orders` | בדיקות מעבדה |
| `/hospitalizations` | אשפוזים |
| `/inventory` | מלאי |
| `/price-list` | מחירון שירותים |
| `/digital-care` | DigitalCare |
| `/reports` | דוחות למשתמשים מורשים |
| `/portal` | פורטל בעלי החיות |
| `/privacy` | מדיניות פרטיות |
| `/accessibility` | הצהרת נגישות |

## פקודות שימושיות

הפקודות הבאות מוגדרות בפועל ב־`package.json`:

| פקודה | מטרה |
| --- | --- |
| `npm run dev` | הפעלת סביבת הפיתוח המקומית |
| `npm run build` | בניית גרסת Production באמצעות Vite |
| `npm run typecheck:ai` | בדיקת טיפוסים ממוקדת לתשתית ה־AI המשותפת |
| `npm run test:vetbot` | חבילת בדיקות VetBot, אבטחה, מסד ורגרסיה |
| `npm run test:frontend-secrets` | בדיקה שאין סודות AI בקוד ה־Frontend |
| `npm run test:accessibility` | בדיקות תשתית הנגישות |
| `npm run test:anon-access` | בדיקת גישה אנונימית והרשאות Supabase |

לפני מסירה או מיזוג מומלץ להריץ:

```bash
npm run test:vetbot
npm run test:frontend-secrets
npm run build
git diff --check
```

לפרויקט אין כרגע פקודת `lint` ב־`package.json`.

## אבטחה ופרטיות

- הגישה למידע מוגבלת לפי תפקיד, מרפאה ובעלות על בעל החיים.
- פורטל בעלי החיות אינו אמור לחשוף מידע של בעלים או בעל חיים אחרים.
- פעולות עסקיות רגישות עוברות אימות והרשאה בצד השרת.
- מידע מזהה ורגיש עובר צמצום והשחרה לפני פנייה לספק AI.
- אירועי Audit של VetBot שומרים מטא־דאטה תפעולית ולא אמורים לשמור תוכן רפואי מלא.
- VetBot אינו מאבחן, קובע מינונים או משנה מידע רפואי ללא אישור אנושי.
- יכולת AI אחת ניתנת להשבתה בלי להשבית את שאר המערכת.

פירוט נוסף נמצא ב־[תסקיר הפרטיות של VetBot](docs/VETBOT_PRIVACY_DPIA_HE.md), ב־[ארכיטקטורת Supabase](docs/SUPABASE_ARCHITECTURE_HE.md) וב־[נוהל ה־Production](docs/PRODUCTION_RUNBOOK_HE.md).

## תיעוד הפרויקט

- [הוראות עבודה בריפו](AGENTS.md)
- [הקשר המוצר והמערכת](docs/PROJECT_CONTEXT_HE.md)
- [ארכיטקטורת Supabase](docs/SUPABASE_ARCHITECTURE_HE.md)
- [שיתוף פעולה והעברת משימות](docs/COLLABORATION_HE.md)
- [סיכום תוכנית ה־AI — שלבים 0–9](docs/CODEX_HANDOFF_STAGE_0_TO_9_HE.md)
- [סיכום השינויים בשלבים 0–9](docs/PROJECT_CHANGES_STAGE_0_TO_9_HE.md)
- [פעולות VetBot](docs/VETBOT_ACTIONS_HANDOFF_HE.md)
- [תרחיש הדגמה](docs/DEMO_SCENARIO_HE.md)
- [בדיקת מוכנות לדמו](docs/demo-readiness-checklist.md)
- [מדריך הפעלת הדמו](docs/demo-runbook.md)
- [נוהל Production](docs/PRODUCTION_RUNBOOK_HE.md)
- [תסקיר פרטיות VetBot](docs/VETBOT_PRIVACY_DPIA_HE.md)

## ענפים ופריסה

- `master` הוא ענף היעד של סביבת Production בהתאם להגדרות הפריסה בפועל.
- `NewDemo` הוא הענף הפעיל לניסוי ולשיפורים הנוכחיים.
- `Full_Demo` נשמר כענף אינטגרציה קודם ואינו הענף הפעיל במסמך זה.
- אין למזג, לדחוף או לפרוס שינוי ל־Production לפני בדיקות ואישור מפורש.

לפני פריסה יש לוודא מהו הענף המחובר בפועל ל־Vercel, אילו Migrations הוחלו, אילו Edge Functions נפרסו ואילו Secrets מוגדרים בסביבת Supabase המתאימה.

## מגבלות והבהרות

- המערכת היא כלי לניהול מידע ולסיוע לצוות המרפאה ואינה מחליפה שיקול דעת מקצועי של וטרינר.
- התשלומים הקיימים הם תרחיש הדגמה; סליקה אמיתית דורשת ספק תשלומים ו־webhook מאומת.
- יכולות AI שלא אומתו מול ספק אמיתי ובסביבת יעד מתאימה צריכות להישאר כבויות.
- בדיקות מקומיות אינן מחליפות בדיקות הרשאה, אבטחה ו־RLS בסביבת Supabase חיה שאינה Production.
