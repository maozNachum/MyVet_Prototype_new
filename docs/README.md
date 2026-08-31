# MyVet — אינדקס התיעוד הרשמי

עודכן: 31.08.2026

מטרת הקובץ היא למנוע שימוש במסמך היסטורי כאילו הוא מתאר את מצב המערכת הנוכחי. במקרה של סתירה, הקוד, המיגרציות ומצב הסביבה המאומת גוברים על מסמך תכנון.

## סדר קריאה מומלץ

1. [`../AGENTS.md`](../AGENTS.md) — כללי עבודה מחייבים.
2. [`CODEX_PARTNER_FULL_SYSTEM_HANDOFF_HE.md`](CODEX_PARTNER_FULL_SYSTEM_HANDOFF_HE.md) — מפת המערכת המלאה והעדכנית ביותר לסוכן חדש.
3. [`PRODUCTION_READINESS_ACTION_PLAN_2026-08-30.md`](PRODUCTION_READINESS_ACTION_PLAN_2026-08-30.md) — תוכנית המשימות לקראת לקוחות אמיתיים.
4. [`MYVET_PRODUCTION_READINESS_AUDIT_FINAL_2026-08-28.md`](MYVET_PRODUCTION_READINESS_AUDIT_FINAL_2026-08-28.md) — ביקורת Production המלאה האחרונה.
5. [`COMMERCIAL_CRITICAL_GATES_SUPPLEMENT_2026-08-30.md`](COMMERCIAL_CRITICAL_GATES_SUPPLEMENT_2026-08-30.md) — בדיקות עומק משלימות וחסמים מסחריים.
6. [`STAGING_ACCEPTANCE_EVIDENCE_2026-08-29.md`](STAGING_ACCEPTANCE_EVIDENCE_2026-08-29.md) — ראיות הקבלה המאוחרות מסביבת Staging.
7. [`PRODUCTION_RUNBOOK_HE.md`](PRODUCTION_RUNBOOK_HE.md) — נוהל תפעול, אימות ופריסה.

## תיעוד מוצר וארכיטקטורה

- [`PROJECT_CONTEXT_HE.md`](PROJECT_CONTEXT_HE.md) — הקשר מוצרי; יש לאמת פרטים טכניים מול מסמך החפיפה והקוד.
- [`SUPABASE_ARCHITECTURE_HE.md`](SUPABASE_ARCHITECTURE_HE.md) — מבנה Supabase והרשאות.
- [`COLLABORATION_HE.md`](COLLABORATION_HE.md) — עבודה מקבילה; הגדרות Vercel החיות נבדקות לפני כל פריסה.
- [`VETBOT_ACTIONS_HANDOFF_HE.md`](VETBOT_ACTIONS_HANDOFF_HE.md) — פעולות VetBot והבנת עברית.
- [`VETBOT_PRIVACY_DPIA_HE.md`](VETBOT_PRIVACY_DPIA_HE.md) — בסיס הנדסי לפרטיות; אינו ייעוץ משפטי.
- [`DEMO_SCENARIO_HE.md`](DEMO_SCENARIO_HE.md) — תרחיש הצגה בלבד, לא שער Production.

## תיעוד ממוקד ליכולות AI

המסמכים הבאים מתארים את תכנון ומימוש היכולות. סטטוסי הפריסה שבהם הם snapshots היסטוריים; מצב הסביבה הנוכחי נקבע לפי הדוחות המאוחרים וה־Runbook.

- [`ai-architecture.md`](ai-architecture.md)
- [`ai-data-security.md`](ai-data-security.md)
- [`ai-data-retention-policy.md`](ai-data-retention-policy.md)
- [`ai-visit-summary.md`](ai-visit-summary.md)
- [`ai-digitalcare.md`](ai-digitalcare.md)
- [`ai-rag.md`](ai-rag.md)
- [`ai-document-ocr.md`](ai-document-ocr.md)
- [`ai-client-summary.md`](ai-client-summary.md)
- [`ai-follow-up-suggestions.md`](ai-follow-up-suggestions.md)
- [`ai-rollout-plan.md`](ai-rollout-plan.md)
- [`ai-rollback-plan.md`](ai-rollback-plan.md)

## מסמכים היסטוריים

הקבצים הבאים נשמרים לצורכי עקיבות בלבד. אין להשתמש בהם לקביעת מצב Production, מספר הבדיקות הנוכחי או מצב Staging:

- [`ai-current-state-audit.md`](ai-current-state-audit.md)
- [`ai-regression-baseline.md`](ai-regression-baseline.md)
- [`ai-stage2-acceptance.md`](ai-stage2-acceptance.md)
- [`stage5-preview-acceptance.md`](stage5-preview-acceptance.md)
- [`final-ai-hardening-report.md`](final-ai-hardening-report.md)
- [`final-gap-analysis.md`](final-gap-analysis.md)
- [`CODEX_HANDOFF_STAGE_0_TO_9_HE.md`](CODEX_HANDOFF_STAGE_0_TO_9_HE.md)
- [`PROJECT_CHANGES_STAGE_0_TO_9_HE.md`](PROJECT_CHANGES_STAGE_0_TO_9_HE.md)
- [`PHASE0_IMPLEMENTATION_HANDOFF_HE.md`](PHASE0_IMPLEMENTATION_HANDOFF_HE.md)
- [`MYVET_PRODUCTION_READINESS_AUDIT.md`](MYVET_PRODUCTION_READINESS_AUDIT.md)
- [`demo-readiness-checklist.md`](demo-readiness-checklist.md)
- [`demo-runbook.md`](demo-runbook.md)
- [`production-deployment-checklist.md`](production-deployment-checklist.md)

## תוצרים שאינם מקור אמת

- `PROPOSAL_NOT_IMPLEMENTED_MYVET_LANDING_REVIEW_HE.docx` — הצעת מחקר לאתר נחיתה, הכוללת placeholders ורעיונות שלא בהכרח יושמו.
- `../output/pdf/MyVet_Production_Readiness_Action_Plan_HE.pdf` — עותק PDF של תוכנית המשימות; קובץ ה־MD הוא המקור שמתעדכן.
- קובצי `CODEX_AUTO_RESUME_*` בשורש המאגר שייכים לכלי עזר מקומי ואינם תיעוד מוצר MyVet.

## כללי תחזוקה

- לכל snapshot חדש יש להוסיף תאריך, סביבת בדיקה וסטטוס ברור.
- מסמך שהוחלף מקבל אזהרת `מסמך היסטורי` בראשו וקישור למקור החדש.
- אין לכתוב ערכי Secrets, Project passwords או מידע רפואי אמיתי בתיעוד.
- אין לסמן פעולה כ־PASS בסביבה חיה אם נבדקה רק Local, Mock או Static analysis.
- לאחר שינוי ארכיטקטורה יש לעדכן קודם את מסמך החפיפה, את האינדקס ואת ה־Runbook.
