# MyVet

מערכת מידע למרפאה וטרינרית הכוללת פורטל צוות, פורטל לקוחות, יומן תורים, תיק רפואי, אשפוזים, מעבדה, מלאי, מרפאה דיגיטלית, דוחות ו-VetBot.

## התחלה מהירה

```bash
npm install
npm run dev
```

לפני ההפעלה יש ליצור `.env` מקומי לפי `.env.example`. אין להכניס סודות ל-Git.

בדיקות לפני מסירה:

```bash
npm run test:vetbot
npm run build
```

## תיעוד הפרויקט

- [הוראות ל-Codex](AGENTS.md)
- [הקשר וארכיטקטורת המוצר](docs/PROJECT_CONTEXT_HE.md)
- [Supabase, RLS ו-VetBot](docs/SUPABASE_ARCHITECTURE_HE.md)
- [עבודה מקבילה והעברת משימות](docs/COLLABORATION_HE.md)
- [תרחיש הדגמה](docs/DEMO_SCENARIO_HE.md)
- [נוהל Production](docs/PRODUCTION_RUNBOOK_HE.md)
- [תסקיר פרטיות VetBot](docs/VETBOT_PRIVACY_DPIA_HE.md)

## ענפים ופריסה

- `Full_Demo` — ענף האינטגרציה וה-Preview הפעיל.
- `master` — ענף Production ב-Vercel.
- עבודה חדשה נעשית בענף קצר שיוצא מ-`Full_Demo`, ולאחר בדיקות מתמזגת אליו.

## טכנולוגיות

- React + TypeScript + Vite
- Tailwind CSS
- Supabase Auth, Postgres, RLS, Realtime, Storage ו-Edge Functions
- Gemini דרך Edge Function של Supabase בלבד
- Vercel לפריסת frontend

