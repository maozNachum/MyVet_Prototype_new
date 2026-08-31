# MyVet — עבודה מקבילה והעברת משימות

> יש לאמת ב־Vercel וב־Git את ענף ה־Production ויצירת ה־Preview לפני כל Push או Merge. ההצהרות בהמשך מתארות את תהליך העבודה שנקבע, לא בדיקה חיה של הגדרות Vercel.

## 1. בסיס משותף

שני המפתחים צריכים לעבוד מאותו repository ובסיס עדכני:

```bash
git fetch origin
git switch Full_Demo
git pull --ff-only origin Full_Demo
```

לפני כל משימה יש לוודא:

```bash
git status
git log -3 --oneline
```

## 2. ענף לכל משימה

אין לעבוד במקביל ישירות על אותם קבצים ב-`Full_Demo`.

דוגמאות:

```bash
git switch -c codex/partner-portal-mobile
git switch -c codex/maoz-dashboard-polish
```

כל ענף צריך לטפל בנושא אחד. לאחר build ובדיקות מבצעים PR או merge מבוקר ל-`Full_Demo`.

## 3. חלוקת אזורים מומלצת

כדי לצמצם conflicts:

- מפתח א׳: דשבורד, יומן, תורים וזמינות.
- מפתח ב׳: פורטל לקוחות ודיגיטל.
- שינוי משותף ב-`theme.css`, `routes.tsx`, migrations או stores מתואם מראש.
- רק אדם אחד משנה migration/Edge Function בזמן נתון.

## 4. Supabase משותף

שניכם יכולים לעבוד מול אותו פרויקט, אבל:

- כל אחד מתחבר עם חשבון אישי ומורשה.
- אין לשתף access token, password, service role או Gemini key בצ׳אט.
- frontend `.env` מועבר בערוץ פרטי ונשאר מקומי.
- secret של Edge Function מוגדר ב-Supabase Dashboard/CLI בלבד.
- לפני migration: מודיעים לשותף, מבצעים dry-run ובודקים שהענף עדכני.
- לאחר migration: commit של קובץ המיגרציה ו-push מיד, כדי שהצד השני לא יעבוד על schema ישן.

## 5. התחלת Codex חדש

פתח task חדש בשורש הריפו ושלח:

> קרא במלואם את AGENTS.md ואת כל מסמכי `docs/*_HE.md` הרלוונטיים. לאחר מכן סרוק את `package.json`, `src/app/routes.tsx`, `src/services`, `supabase/migrations`, `supabase/functions` והבדיקות. אל תשנה דבר עדיין. הצג סיכום של הארכיטקטורה, תפקידי המשתמש, זרימות התורים והדיגיטל, VetBot, RLS והסיכונים. ציין את הענף וה-commit שעליהם אתה נמצא.

רק לאחר שהסיכום תואם למערכת נותנים ל-Codex משימת שינוי.

## 6. תבנית handoff בין מפתחים

בסוף כל משימה שולחים:

```text
ענף:
commit:
מטרה:
קבצים ששונו:
שינויים ב-Supabase:
בדיקות שעברו:
מה לא נבדק:
סיכונים/הערות:
צעד הבא:
```

## 7. לפני merge

```bash
npm run test:vetbot
npm run build
git diff --check
```

אם יש שינוי Supabase, יש לבצע גם את בדיקות ה-runbook.

Checklist:

- [ ] אין `.env` או secret ב-diff.
- [ ] אין נתוני לקוח אמיתיים ב-test fixture או screenshot.
- [ ] אין הרשאת anon חדשה.
- [ ] RLS עדיין מגביל owner לרשומות שלו.
- [ ] mobile ו-desktop נבדקו במסך שהשתנה.
- [ ] empty/loading/error states עובדים.
- [ ] לא נוצרו כפילויות בדשבורד או בפורטל.

## 8. Vercel

- push לענף feature/`Full_Demo` יוצר Preview בהתאם להגדרות Vercel.
- אתר Production מחובר ל-`master` לפי תצורת הפרויקט הנוכחית.
- אין לבצע merge ל-`master` רק כדי “לראות שינוי”; משתמשים ב-Preview.
- משתני Production/Preview מנוהלים ב-Vercel ואינם נכנסים ל-Git.

## 9. פתרון conflict

- לא להשתמש ב-`git reset --hard` או checkout דורסני.
- להבין את שני הצדדים של הקונפליקט, במיוחד ב-`ClientPortal.tsx`, `DigitalCare.tsx`, `Dashboard.tsx` ו-migrations.
- לאחר פתרון conflict להריץ שוב את כל הבדיקות.
- אם שני ענפים שינו schema, מאחדים את סדר המיגרציות לפני פריסה.

