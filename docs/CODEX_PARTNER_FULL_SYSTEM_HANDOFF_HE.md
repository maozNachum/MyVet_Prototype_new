# MyVet — מסמך חפיפה מלא ל־GPT/Codex של ניסן

> עודכן לפי מצב המאגר ביום 31 באוגוסט 2026. המסמך מיועד לסוכן פיתוח נוסף שעובד על אותו מאגר. הוא אינו מכיל סיסמאות, מפתחות או ערכי Secrets.

## 1. מטרת המסמך וכלל הדיוק

MyVet היא מערכת לניהול מרפאה וטרינרית, תיק רפואי לבעלי חיים ופורטל לבעלי חיות מחמד. המסמך מרכז את הארכיטקטורה, מסכי המערכת, מודל הנתונים, Supabase, VetBot ויכולות ה־AI, החיבורים החיצוניים, סביבת העבודה, הבדיקות והפערים הידועים.

העיקרון החשוב ביותר: **המאגר והיסטוריית המיגרציות הם מקור האמת**. מסמכי תכנון עלולים להתיישן. לפני כל שינוי יש לאמת שוב את הקוד, השאילתות והמיגרציות הרלוונטיים. אין להסיק שמיגרציה מקומית כבר הוחלה ב־Production.

## 2. מה לקרוא לפני עבודה

לפי הסדר:

1. `AGENTS.md` — כללי העבודה המחייבים לכל המאגר.
2. `docs/PROJECT_CONTEXT_HE.md` — הקשר מוצרי ומבנה הפרויקט.
3. `docs/SUPABASE_ARCHITECTURE_HE.md` — מבנה Supabase והרשאות.
4. `docs/CODEX_HANDOFF_STAGE_0_TO_9_HE.md` — היסטוריית שכבת ה־AI.
5. `docs/PRODUCTION_RUNBOOK_HE.md` — תפעול, פריסה ובדיקות.
6. `docs/VETBOT_PRIVACY_DPIA_HE.md` — פרטיות, סיכוני AI ונקודות לאישור משפטי.
7. `docs/PRODUCTION_READINESS_ACTION_PLAN_2026-08-30.md` — תוכנית המשימות העדכנית לקראת מוצר מסחרי.
8. `docs/MYVET_PRODUCTION_READINESS_AUDIT_FINAL_2026-08-28.md` ו־`docs/COMMERCIAL_CRITICAL_GATES_SUPPLEMENT_2026-08-30.md` — ראיות בדיקה ופערים קריטיים.

## 3. כללי עבודה שאסור לעקוף

- ענף האינטגרציה הפעיל הוא `Full_Demo`, אלא אם מעוז בוחר במפורש ענף אחר.
- לפני עבודה: לבדוק ענף, `git status`, את הקבצים הרלוונטיים ואת ה־diff הקיים.
- אין למחוק, לאפס, לדרוס או לעשות stash לשינויים של משתמש אחר.
- אין merge ל־`master`, אין push, אין Deploy ואין שינוי Production ללא אישור מפורש.
- אין להריץ SQL, מיגרציות או שינויי נתונים על פרויקט Supabase שלא זוהה ואושר במפורש.
- אין להכניס Secret ל־Git, לצ'אט, למסמך או למשתנה `VITE_*`.
- כל שינוי מסד חייב להיות מיגרציה מתוארכת תחת `supabase/migrations`, עם בדיקת RLS והרשאות.
- יש להעדיף שינוי ממוקד, הפיך ותואם לאחור על פני Refactor רחב.
- הממשק בעברית וב־RTL. אין להוסיף למשתמש טקסט טכני או מטא־הסברים.

## 4. הרשאות וחיבורים שניסן צריך

### 4.1 GitHub והמאגר

- הרשאת גישה למאגר MyVet.
- הרשאת כתיבה נדרשת רק אם ניסן אמור לדחוף ענפים. לקריאה ובדיקה בלבד מספיקה הרשאת Read.
- עליו למשוך את הענף העדכני שנבחר לעבודה, בדרך כלל `Full_Demo`.
- אסור לשתף Personal Access Token בתוך קובץ או הודעה. יש להשתמש בהתחברות המאובטחת של GitHub Desktop, Git Credential Manager או SSH.

### 4.2 סביבת פיתוח מקומית

- Node.js תואם לפרויקט ו־npm.
- התקנה באמצעות `npm install` מתוך שורש המאגר.
- קובץ מקומי שאינו עולה ל־Git עם שמות המשתנים:
  - `VITE_SUPABASE_URL`
  - `VITE_SUPABASE_ANON_KEY`
- את הערכים יש לקבל ממעוז או ממנהל הפרויקט בערוץ מאובטח. מפתח `anon` מיועד לדפדפן, אך עדיין אין לפרסם אותו במסמך ציבורי.
- Docker Desktop נדרש כאשר רוצים להפעיל Supabase Local ואת חבילת בדיקות הבסיס המקומית. הוא אינו נדרש לכל שינוי Frontend.

### 4.3 Supabase

יש להוסיף את ניסן לארגון/פרויקט Supabase הרלוונטי בעקרון הרשאה מינימלית:

- לעבודת Frontend רגילה: לרוב אין צורך בגישת Dashboard, אלא רק במשתני ה־Frontend המאושרים.
- לבדיקת סכמות, Logs ו־Edge Functions: הרשאת מפתח/Developer בפרויקט בדיקה.
- לשינוי Auth settings, Secrets, Policies, Deploy או Production: רק הרשאה מתאימה ולאחר אישור מפורש ממעוז.
- `SUPABASE_SERVICE_ROLE_KEY` הוא Secret שרת בלבד. אין להכניס אותו ל־Frontend, לקובץ `.env` של Vite או למסמך.
- לפני שימוש ב־CLI יש לוודא לאיזה Project Ref הוא מקושר. אין להסתמך על קישור ישן.
- סביבת Staging/Local חייבת להשתמש בנתונים סינתטיים בלבד.

### 4.4 Vercel

- נדרשת גישה לפרויקט Vercel רק לעבודה על Environment Variables, Preview או Deploy.
- חיבור Git ל־Vercel גורם בדרך כלל לבניית Preview לענפים ול־Production Deploy לענף שהוגדר בפרויקט; יש לבדוק את הגדרת הפרויקט בפועל לפני push.
- אין לבצע Promote/Deploy ל־Production ללא אישור.
- `vercel.json` מכיל כרגע rewrite של כל הנתיבים ל־`index.html` עבור React Router. אין בו כרגע הגדרות Security Headers.

### 4.5 ספק AI

- ה־Frontend אינו צריך מפתח Gemini.
- `GEMINI_API_KEY` מוגדר כ־Secret של Edge Functions בלבד.
- מודל, fallback, timeouts, rate limit ודגלי יכולת נבחרים בצד השרת.
- גישה לחשבון Google/Gemini נדרשת רק למי שמנהל את הספק, החיוב או ה־Secrets. אין לשתף מפתח אמיתי עם GPT/Codex.

### 4.6 הרשאות שאינן נדרשות כברירת מחדל

- אין צורך לתת לסוכן AI הרשאת Production רחבה כדי לקרוא או לערוך קוד.
- אין צורך לתת `service_role` כדי להריץ Frontend.
- אין צורך בגישה לחשבון Vercel או Supabase של מעוז אם המשימה מקומית בלבד.
- אין לתת גישה למסמכים רפואיים אמיתיים לצורך בדיקות.

## 5. מחסנית הטכנולוגיה

- React 18 + TypeScript.
- Vite 6 לבנייה ולשרת הפיתוח.
- React Router 7 עם `createBrowserRouter` וטעינה עצלה של מסכים.
- Tailwind CSS 4.
- Lucide React לאייקונים.
- Sonner להודעות Toast.
- React Hook Form ו־Zod בחלק מהטפסים; במסכים ממוקדים קיימת גם ולידציה מקומית.
- Supabase JS: Auth, PostgreSQL, Realtime, Storage, RPC ו־Edge Functions.
- `xlsx` לייצוא/עבודה עם קובצי גיליון במסכים הרלוונטיים.
- Heebo כגופן הראשי, נטען מ־Google Fonts.
- Vercel לאירוח ה־SPA.

אין כרגע script של Lint, ולכן אסור לטעון ש־Lint הורץ או להוסיף Linter רק לצורך משימה לא קשורה.

## 6. מבנה האפליקציה

```text
src/main.tsx
  -> src/app/App.tsx
       -> src/app/routes.tsx
            -> מסכי צוות תחת Layout
            -> פורטל בעלים
            -> כניסה, פרטיות ונגישות

Layout
  -> אימות משתמש צוות מול Supabase Auth וטבלת staff
  -> MedicalStore + AppointmentStore + LabStore
  -> Navbar + CommandCenter + Footer
  -> AiAssistantShell (VetBot)
  -> Outlet של React Router
```

תיקיות מרכזיות:

- `src/app/pages` — מסכי Route.
- `src/app/components` — רכיבים משותפים ורכיבי תחום.
- `src/app/components/ai` — מעטפת VetBot, שיחה, הקשר, Sanitization, Policy ותשובות מובנות.
- `src/app/data` — Context Stores, הרשאות תצוגה וקבועים משותפים.
- `src/app/hooks` — Hooks לניווט, חיפוש וייצוא.
- `src/services` — שירותים חוזרים מול Supabase, RPC ו־Edge Functions.
- `supabase/functions` — פונקציות שרת.
- `supabase/functions/_shared/ai` — AI Gateway, Adapters, Schemas, Prompts, Feature Flags, Rate Limit ושגיאות.
- `supabase/migrations` — היסטוריית שינויים למסד.
- `supabase/rollback` — הוראות/SQL חזרה כאשר קיים.
- `tests` — בדיקות אבטחה, AI, תורים, ביקורים והרשמה.
- `tools/supabase-baseline` — סביבת clean-room לבדיקת סכמת Supabase; אסור לקשר אותה בטעות ל־Production.

## 7. Routes ומסכים

| נתיב | מסך | קהל/מטרה |
|---|---|---|
| `/login` | `Login.tsx` | כניסה והרשמת בעלים |
| `/` | `Dashboard.tsx` | מרכז העבודה של צוות המרפאה |
| `/appointments` | `AppointmentSchedule.tsx` | יומן תורים יומי/שבועי/חודשי, סינון וניהול סטטוס |
| `/appointments/new` | `NewAppointment.tsx` | יצירת תור מצד הצוות |
| `/clients` | `Clients.tsx` | בעלי חיות, חובות, חיות ומידע קשור |
| `/patients` | `Patients.tsx` | בעלי חיים, תיק רפואי, חיסונים, ביקורים ומסמכים |
| `/inventory` | `Inventory.tsx` | מלאי, כמויות, סף מלאי וקטגוריות |
| `/reports` | `Reports.tsx` | דוחות תפעוליים/כספיים לפי תפקיד |
| `/digital-care` | `DigitalCare.tsx` | שיחות דיגיטליות, הודעות, קבצים, ארכיון ווידאו |
| `/hospitalizations` | `Hospitalizations.tsx` | אשפוזים פעילים וסיום אשפוז |
| `/lab-orders` | `LabOrders.tsx` | בדיקות מעבדה, דחיפות, סטטוס ותוצאות |
| `/price-list` | `PriceList.tsx` | קטלוג שירותים ותמחור |
| `/portal` | `ClientPortal.tsx` | פורטל בעלים Mobile-first |
| `/owner-preview` | `ClientPortal.tsx` | תצוגת פורטל דרך אותו Route component |
| `/privacy` | `PrivacyPolicy.tsx` | מדיניות פרטיות |
| `/accessibility` | `AccessibilityStatement.tsx` | הצהרת נגישות |

כל נתיבי הצוות מורכבים דרך `Layout.tsx`. נתיב הדוחות כולל guard בצד ה־Frontend, אך הגנת מידע אמיתית חייבת תמיד להיאכף גם ב־RLS/RPC.

## 8. מודולים עסקיים וזרימות עיקריות

### 8.1 משתמשים, מרפאות והרשאות

- Supabase Auth מספק את זהות המשתמש.
- רשומת `staff` מחברת משתמש Auth למרפאה ולתפקיד צוות.
- רשומת `owners` מחברת משתמש Auth לבעלים.
- תפקידי צוות קיימים: `clinic_admin`, `vet`, `nurse`, `secretary`; פורטל הבעלים משתמש ב־`owner` במודל ההרשאות.
- `Layout.tsx` מאמת משתמש צוות פעיל ומצפה כרגע לרשומה יחידה באמצעות `maybeSingle()`.
- `staffAuth.ts` מספק הרשאות תצוגה מקומיות, למשל עריכת תיק, מחיקת מטופל ודוחות. הן אינן תחליף ל־RLS.
- המבנה במסד כולל `clinic_id` ברוב הישויות ו־RLS לבידוד בין מרפאות.

### 8.2 דשבורד ותור עבודה

- הדשבורד משלב תורים להיום, שיחות פתוחות, בדיקות מעבדה, אשפוזים, חובות ומלאי נמוך.
- `SmartWorklist.tsx` ו־`ClinicFlowboard.tsx` בונים תמונת מצב תפעולית.
- Realtime וטעינה מחדש משמשים לעדכון חלק מהנתונים.
- לחיצה על תור יכולה להעביר לזרימת טיפול/תיק המטופל בהתאם למימוש המסך.

### 8.3 תורים וזמינות

- `AppointmentStore.tsx` טוען תורים, בעלי חיים ובעלים ומנהל state משותף.
- `AppointmentSchedule.tsx` מציג תצוגה יומית, שבועית וחודשית.
- `NewAppointment.tsx` יוצר תור מצד צוות.
- `OwnerBookAppointment.tsx` מאפשר לבעלים לבחור תור זמין.
- VetBot יכול להציע/לבצע פעולות תורים רק דרך פעולות שרת מאומתות ודגלים מתאימים.
- `appointmentMutations.ts` משתמש ב־RPC אטומי ליצירה, עדכון, הזזה וביטול.
- שעות ברירת המחדל המוגדרות בזרימה: ראשון–חמישי 08:00–17:00, שישי 08:00–14:00, שבת סגור; משך משבצת ברירת מחדל 30 דקות. טבלאות `clinic_booking_hours` ו־`clinic_booking_blocks` מאפשרות התאמה וחסימות.
- סטטוסי תור בקוד: `scheduled`, `arrived`, `in_progress`, `completed`, `cancelled`.
- מחלקות המופיעות ביומן: פנימית, כירורגיה, שיניים, עור, חירום; גם הדמיה מוגדרת לתצוגת סינון/צבע.
- חדרים מוגדרים: חדרים 1–3, חדר ניתוח וחדר חירום.

### 8.4 בעלי חיים ותיק רפואי

- `Patients.tsx` הוא המסך הראשי לניהול חיות ותיק רפואי.
- `MedicalStore.tsx` טוען ומנהל ביקורים רפואיים.
- `PatientMedicalTimeline.tsx` מציג ציר זמן רפואי.
- `TreatmentModal.tsx` מנהל יצירת טיפול/ביקור.
- `medicalVisitMutations.ts` משתמש ב־RPC `myvet_save_medical_entry` לשמירה אטומית של רשומה רפואית והרכיבים הנלווים.
- ישויות רפואיות כוללות ביקורים, בעיות, בדיקה גופנית, אבחנות מבדלות, מרשמים, חיסונים, בדיקות מעבדה ומסמכים.
- פעולת מחיקת מטופל עוברת דרך RPC ייעודי ומוגבלת למנהל מרפאה בקוד וברמת השרת.

### 8.5 לקוחות/בעלים

- `Clients.tsx` מרכז בעלי חיות, פרטי קשר, חיות, חובות ומידע רפואי קשור.
- `OwnerDebtPanel.tsx` משמש לצפייה וסגירת תשלום מצד הצוות.
- הלקוח משויך לחיות דרך `patients.owner_id` והקשר המרפאתי.

### 8.6 פורטל בעלים

- `ClientPortal.tsx` הוא מסך Mobile-first גדול המאגד חיות, תורים, מידע רפואי משוחרר, תשלומים, הודעות, התראות ותזכורות.
- בעלים יכול לדרוש שיוך לפרופיל קיים דרך RPC `claim_owner_profile()`.
- קביעת תור משתמשת ב־`myvet_available_slots` וב־`myvet_owner_book_appointment`.
- תשלום בפורטל הוא **תשלום דמו** דרך `myvet_owner_settle_demo_payment`; אין כרגע ספק סליקה אמיתי או Webhook של חברת תשלומים.
- שיחות הפורטל משתמשות באותן טבלאות `conversations`, `messages` ו־`message_attachments` של DigitalCare, בכפוף להרשאות.

### 8.7 DigitalCare

- כולל שיחות בין צוות לבעלים, הודעות, עדיפות, סטטוס, ארכיון וקבצים.
- `video_sessions` מקשר שיחת וידאו לתור, בעלים, חיה, איש צוות וביקור.
- המערכת פותחת/שומרת קישורי Google Meet. הקוד פותח `https://meet.google.com/new` ומאמת קישור מודבק; לא נמצאה אינטגרציית Google API שיוצרת פגישה דרך חשבון שירות.
- `DigitalCareTranscriptionPanel.tsx` ושירות `digitalCareTranscription.ts` מחברים תמלול/סיכום דרך Edge Function כאשר הדגלים פעילים.
- גם כאשר AI כבוי, זרימת השיחה והווידאו צריכה להמשיך לעבוד.

### 8.8 חיסונים ו־OCR

- `VaccinationBook.tsx` מנהל פנקס חיסונים ידני.
- OCR עובר דרך `document-ocr` ו־`documentOcr.ts`; אין קריאה ישירה לספק מתוך React.
- פלט החילוץ הוא טיוטה ניתנת לעריכה ואינו נשמר אוטומטית כחיסון.
- יש בדיקת כפילות לפני שמירה לפי הנתונים הזמינים.
- יכולת OCR תלויה ב־Feature Flags ובספק אמיתי; אין להציג אותה כמאומתת Production רק בגלל שקיימות בדיקות Mock.

### 8.9 אשפוזים

- `Hospitalizations.tsx` ו־`HospitalizationModal.tsx` מנהלים אשפוז פעיל, סטטוס, חיה ובעלים.
- סיום/עדכון אשפוז יכול ליצור רשומה רפואית בהתאם לזרימה הקיימת.

### 8.10 מעבדה

- `LabStore.tsx` מרכז state של הזמנות מעבדה.
- `LabOrders.tsx`, `LabOrderModal.tsx` ו־`LabResultsPanel.tsx` מנהלים יצירה, דחיפות, קטגוריה, סטטוס ותוצאות.
- קטגוריות: דם, שתן, הדמיה, ביופסיה ואחר.

### 8.11 מלאי

- `Inventory.tsx` מנהל פריטים, כמות, סף מלאי נמוך וקטגוריה.
- קטגוריות מרכזיות: תרופות, ציוד רפואי וציוד מתכלה.
- VetBot יכול להציע פעולות מלאי דרך orchestration בצד השרת; אין לאפשר למודל לבצע mutation לא מאומת ישירות.

### 8.12 תשלומים וקטלוג שירותים

- `service_catalog` ו־`PriceList.tsx` מנהלים שירותים ומחירים.
- `VisitCheckoutModal.tsx` בונה חיוב מפריטי שירות/מלאי, יוצר `payments` ו־`payment_items` ומשתמש ב־RPC לסגירה.
- קיימים `payment_transactions`, אך המימוש הנוכחי אינו מערכת סליקה מסחרית מלאה.

### 8.13 דוחות

- `Reports.tsx` ורכיבי `components/reports` מציגים דוחות תפעוליים וכספיים.
- מנהל מרפאה, וטרינר ומזכירה יכולים להיכנס למסך לפי guard הקיים; דוחות כספיים מוגבלים בקוד למנהל/וטרינר.
- VetBot של המערכת הוא מעטפת משותפת; אין ליצור בוט נוסף לכל עמוד ללא צורך.

### 8.14 התראות ותזכורות

- `portalNotifications.ts` עובד מול `notifications` ו־`reminders`.
- הצעות AI למעקב אינן יוצרות תזכורת אמיתית לפני אישור משתמש מורשה.
- לקוח אמור לראות רק תוכן ששוחרר אליו ולחיות שבבעלותו.

## 9. State, Hooks ושירותים

### Context Stores

- `MedicalStore` — ביקורים ותיק רפואי.
- `AppointmentStore` — תורים, מטופלים ובעלים הדרושים ליומן.
- `LabStore` — הזמנות ותוצאות מעבדה.

### Hooks מרכזיים

- `useAppointmentActions` — פעולות תור.
- `useCalendarNav` — ניווט תאריכים ביומן.
- `useSearchFilter` — חיפוש וסינון.
- `useExportMedicalRecord`, `useExportOwnerRecord`, `useExportLabResults` — ייצוא מידע.

### Services מרכזיים

- `supabaseClient.ts` — יצירת Client הדפדפן היחיד.
- `appointmentMutations.ts` — RPC אטומי לתורים.
- `medicalVisitMutations.ts` — RPC אטומי לשמירת ביקור.
- `clinicAvailability.ts` — זמינות וחסימות.
- `portalNotifications.ts` — התראות ותזכורות.
- `visitSummary.ts`, `digitalCareTranscription.ts`, `medicalRecordRag.ts`, `documentOcr.ts`, `clientSummary.ts`, `followUpSuggestions.ts` — לקוחות Edge Functions.

## 10. Supabase — מודל נתונים

בסכמת הבסיס שנבדקה קיימות 43 טבלאות Public:

### ליבה ומרפאה

- `clinics`
- `staff`
- `owners`
- `patients`
- `appointments`
- `clinic_booking_hours`
- `clinic_booking_blocks`

### תיק רפואי

- `medical_visits`
- `medical_problems`
- `physical_exams`
- `differential_diagnoses`
- `prescriptions`
- `vaccinations`
- `documents`
- `lab_orders`
- `hospitalizations`

### תקשורת ווידאו

- `conversations`
- `messages`
- `message_attachments`
- `video_sessions`
- `notifications`
- `reminders`

### תפעול, מלאי וכספים

- `inventory`
- `service_catalog`
- `payments`
- `payment_items`
- `payment_transactions`
- `insights`

### VetBot ו־AI

- `vetbot_action_requests`
- `vetbot_audit_logs`
- `vetbot_feedback`
- `vetbot_knowledge`
- `ai_operations`
- `ai_artifacts`
- `ai_sources`
- `ai_approval_history`
- `ai_audit_events`
- `ai_consent_records`
- `ai_documents`
- `ai_document_chunks`
- `ai_document_embeddings`
- `ai_feature_flags`
- `ai_rate_limit_windows`

### קשרים מרכזיים

- `clinics` היא ישות ה־Tenant. רוב הרשומות נושאות `clinic_id` ומקושרות אליה.
- `owners` שייך למרפאה; `patients` שייך למרפאה ולבעלים.
- `appointments` שייך למרפאה ולחיה.
- `medical_visits` שייך למרפאה ולחיה, ויכול להיות מקושר לתור.
- חיסונים, מעבדה, מרשמים, בעיות, בדיקות גופניות ומסמכים מקושרים לחיה ובחלקם גם לביקור.
- שיחה מקושרת למרפאה, בעלים וחיה; הודעות וקבצים מקושרים לשיחה.
- תשלום מקושר למרפאה ולבעלים, ויכול להיות מקושר לחיה, תור וביקור.
- ישויות AI מקושרות בצמדי מפתחות הכוללים `clinic_id` כדי לצמצם ערבוב בין מרפאות.

## 11. בידוד מרפאות ומצב Multi-tenant

הסכמה תוכננה כ־Shared Database + Shared Schema עם `clinic_id`, RLS ומפתחות זרים. לא נוצר מסד נפרד לכל מרפאה. זהו דפוס מקובל שמאפשר לגדול מעבר לעשר מרפאות, בתנאי שכל שאילתה ו־Policy שומרות על גבול Tenant.

פונקציות עזר פרטיות מרכזיות:

- `private.myvet_current_clinic_id()` — פותר את המרפאה של המשתמש הפעיל.
- `private.myvet_is_clinic_staff(...)` — בדיקת צוות מרפאה.
- `private.myvet_user_has_clinic_access(...)` — בדיקת גישה למרפאה.
- `private.myvet_owner_owns_pet(...)` — בדיקת בעלות על חיה.

מצב נוכחי חשוב:

- האפליקציה מצפה כרגע לשיוך צוות יחיד ושיוך בעלים יחיד לפי `auth_user_id`.
- אין בורר מרפאה ואין UI למשתמש בעל כמה שיוכים.
- `myvet_current_clinic_id()` כולל fallback למרפאה הפעילה היחידה כאשר אין שיוך; זה מתאים למעבר הדרגתי אך דורש בחינה לפני Multi-clinic מסחרי מלא.
- תהליך הרשמת בעלים חדש כולל כרגע תלות ב־slug `myvet-primary` כאשר אין פרופיל קיים.
- לכן: **הסכמה מוכנה חלקית ל־Multi-tenant, אך זרימת ההצטרפות והחלפת מרפאה עדיין אינן מוצר Multi-clinic מלא.**

## 12. RLS, RPC ופעולות אטומיות

- בסביבת הבדיקות שנבנתה הופעל RLS על 43 טבלאות Public ונבדקו Policies מפורשות.
- פעולות רגישות נעשות דרך RPC/Edge Function מאומתים ולא באמצעות אמון ב־`clinic_id`, `owner_id`, `pet_id`, `role` או `user_id` מהדפדפן.
- פונקציות `SECURITY DEFINER` רגישות צריכות `search_path` בטוח ו־GRANT מצומצם.
- RPC עיקריים בשימוש האפליקציה:
  - `myvet_staff_book_appointment`
  - RPC לעדכון/הזזה/ביטול תור מתוך `appointmentMutations.ts`
  - `myvet_staff_update_appointment`
  - `myvet_available_slots`
  - `myvet_owner_book_appointment`
  - `myvet_save_medical_entry`
  - `myvet_delete_patient`
  - `claim_owner_profile`
  - `myvet_staff_settle_payment`
  - `myvet_owner_settle_demo_payment`
- אין להמציא חתימה או פרמטרים של RPC; יש לפתוח את השירות והמיגרציה המדויקים לפני שינוי.

## 13. Storage וקבצים פרטיים

Buckets שאומתו במבנה:

- `documents`
- `chat-attachments`
- `ai-medical-documents`
- `ai-recordings`

כולם מיועדים להיות פרטיים. קבצים רפואיים מוצגים באמצעות Signed URL קצר־תוקף. נתיב הקובץ כולל הפרדה מרפאתית/בעלים/חיה לפי ה־Policy הרלוונטית. אסור להפוך Bucket רפואי לציבורי או להציג כתובת Storage פנימית קבועה.

## 14. Realtime

האפליקציה משתמשת ב־Supabase Realtime בחלק מה־Stores והמסכים כדי לרענן תורים ונתונים תפעוליים. לפני הוספת Subscription יש לבדוק:

- שהטבלה נמצאת ב־publication המתאים.
- שה־filter כולל את ההקשר המותר.
- שיש cleanup ב־`useEffect` כדי לא לצבור channels.
- שכשל Realtime אינו משבית טעינה רגילה/רענון ידני.

## 15. VetBot וארכיטקטורת AI

### Frontend

`src/app/components/ai` כולל:

- `AiAssistantShell`, `AiAssistantDrawer`, `AiAssistantCard` — מעטפת ותצוגת VetBot.
- `aiClient.ts` — קריאות מאומתות ל־`ai-assistant`.
- `aiContextBuilder.ts` — בניית הקשר מצומצם מהמערכת.
- `aiConversationStorage.ts` — שמירת שיחה מקומית לפי משתמש עד התנתקות.
- `aiSanitizer.ts` ו־`aiPolicy.ts` — צמצום מידע וכללי תצוגה/פעולה.
- `AiStructuredAnswer.tsx` — הצגת תשובה מובנית ופעולות.
- `aiProactiveEngine.ts` — תובנות/התראות יזומות.

VetBot משותף בין דפי הצוות ומקבל הקשר של העמוד/הישות. פורטל הבעלים עטוף גם הוא ב־`AiAssistantShell` עם `area="portal"`. אין לחבר Component ישירות ל־Gemini.

### Server

Edge Functions:

| פונקציה | תפקיד |
|---|---|
| `ai-assistant` | VetBot, תשובות מובנות ו־action orchestration |
| `visit-summary` | טיוטת סיכום ביקור ואישור |
| `digitalcare-transcription` | הסכמה, תמלול וסיכום שיחת וידאו |
| `medical-record-rag` | אינדוקס ושאלות על תיק רפואי מורשה |
| `document-ocr` | חילוץ מסמך/מדבקת חיסון לטיוטה |
| `client-summary` | סיכום פשוט לבעלים מתוך סיכום מאושר |
| `follow-up-suggestions` | הצעות מעקב ותזכורת מתוך מקור מאושר |

כל שבע הפונקציות מוגדרות עם `verify_jwt = true` ב־`supabase/config.toml`.

השכבה המשותפת `supabase/functions/_shared/ai` כוללת:

- Gateway מרכזי.
- Provider Adapters לטקסט, Embeddings, OCR ותמלול.
- Prompt Registry וגרסאות.
- Input/Output Schemas קשיחים.
- Feature Flags ו־Kill Switches.
- Timeout, retries בטוחים ו־rate limiting.
- Redaction, Data Minimization והגנת Prompt Injection בסיסית.
- Audit metadata בלי לשמור תוכן רפואי מלא בלוג רגיל.
- Mock Provider לבדיקות בלבד, שמותר רק כאשר `AI_ALLOW_MOCK_PROVIDER=true` בסביבה שאינה Production.

### מודלים

- הספק הממומש הוא Gemini דרך Adapters בצד השרת.
- אין להניח מודל יחיד קבוע: `ai-assistant` וה־Gateway המשותף כוללים ברירות מחדל/fallback שונות בקוד, ו־`GEMINI_MODEL` יכול להחליף אותן.
- Embeddings מוגדרים בנפרד, כרגע במבנה של 768 ממדים. שינוי מודל/ממדים מחייב תוכנית re-indexing ומיגרציה מתאימה.

### כלל אישור

AI רשאי להכין טיוטה או הצעת פעולה. הוא אינו רשאי לשמור תוכן רפואי מאושר, לשחרר תוכן ללקוח, ליצור תזכורת רפואית או לבצע mutation מסוכן בלי validation ואישור מתאים בצד השרת.

## 16. Feature Flags ו־Secrets

שמות Server Environment חשובים, ללא ערכים:

### בסיס Supabase/AI

- `SUPABASE_URL`
- `SUPABASE_ANON_KEY`
- `SUPABASE_SERVICE_ROLE_KEY` — Secret; שרת בלבד.
- `ALLOWED_ORIGINS`
- `GEMINI_API_KEY` — Secret; שרת בלבד.
- `GEMINI_MODEL`
- `AI_GEMINI_FALLBACK_MODELS`
- `AI_REQUEST_TIMEOUT_MS`
- `AI_TOTAL_TIMEOUT_MS`
- `AI_MAX_SAFE_RETRIES`
- `AI_RATE_LIMIT_PER_MINUTE`

### דגלי ליבה

- `AI_GLOBAL_ENABLED`
- `AI_GATEWAY_ENABLED`
- `AI_VETBOT_ENABLED`
- `AI_VETBOT_ACTIONS_ENABLED`
- `AI_VETBOT_APPOINTMENT_ACTIONS_ENABLED`

### יכולות מתקדמות

- `AI_VISIT_SUMMARY_ENABLED` / `AI_VISIT_SUMMARY_KILL_SWITCH`
- `AI_DIGITALCARE_RECORDING_ENABLED` / `AI_DIGITALCARE_RECORDING_KILL_SWITCH`
- `AI_DIGITALCARE_TRANSCRIPTION_ENABLED` / `AI_DIGITALCARE_TRANSCRIPTION_KILL_SWITCH`
- `AI_DIGITALCARE_SUMMARY_ENABLED` / `AI_DIGITALCARE_SUMMARY_KILL_SWITCH`
- `AI_RAG_INDEX_ENABLED` / `AI_RAG_INDEX_KILL_SWITCH`
- `AI_RAG_QA_ENABLED` / `AI_RAG_QA_KILL_SWITCH`
- `AI_DOCUMENT_OCR_ENABLED` / `AI_DOCUMENT_OCR_KILL_SWITCH`
- `AI_VACCINATION_OCR_ENABLED` / `AI_VACCINATION_OCR_KILL_SWITCH`
- `AI_CLIENT_SUMMARY_ENABLED` / `AI_CLIENT_SUMMARY_KILL_SWITCH`
- `AI_FOLLOW_UP_SUGGESTIONS_ENABLED` / `AI_FOLLOW_UP_SUGGESTIONS_KILL_SWITCH`
- `AI_ALLOW_MOCK_PROVIDER`

### RAG/Embeddings

- `AI_EMBEDDING_PROVIDER`
- `AI_EMBEDDING_MODEL`
- `AI_EMBEDDING_VERSION`
- `AI_EMBEDDING_TIMEOUT_MS`
- `AI_RAG_MAX_CHUNKS_PER_SOURCE`
- `AI_RAG_MAX_RESULTS`
- `AI_RAG_MINIMUM_SIMILARITY`

Production חייב להיות Fail-closed: יכולת שלא אומתה מול ספק אמיתי או סביבת Supabase מאושרת נשארת כבויה.

## 17. אינטגרציות חיצוניות מאומתות

- **Supabase** — Auth, PostgreSQL, RLS, RPC, Realtime, Storage ו־Edge Functions.
- **Gemini API** — רק מתוך Provider Adapters/פונקציות שרת.
- **Vercel** — אירוח ובניית SPA.
- **Google Meet** — פתיחת דף יצירת פגישה ושמירת קישור; לא אינטגרציית API מלאה.
- **Google Fonts** — טעינת Heebo.
- **Unsplash** — תמונות חיצוניות במסך הכניסה ובפורטל; זהו נכס חיצוני ולא Storage רפואי.
- **XLSX** — ייצוא/עבודה מקומית עם קובצי גיליון.

לא אומתו בקוד ספק SMS, ספק דוא"ל, WhatsApp API, ספק סליקה אמיתי, Active Directory או מערכת ERP חיצונית. אין להציג אותם כחלק פעיל מהמוצר.

## 18. מיגרציות ומצב סביבות

במאגר קיימות 32 מיגרציות מתוארכות. לפי בדיקות המוכנות האחרונות:

- Production תיעד 25 מיגרציות עד `20260719195338_secure_patient_deletion.sql`.
- שבע המיגרציות המאוחרות הבאות קיימות מקומית ונבדקו בסביבת בדיקה, אך אין להניח שהן כבר ב־Production:
  - `20260805185316_appointment_status_workflow.sql`
  - `20260825191948_atomic_appointment_mutations.sql`
  - `20260826093922_enforce_staff_appointment_capacity.sql`
  - `20260826143000_atomic_medical_visit_save.sql`
  - `20260828190000_fix_rag_vector_operator.sql`
  - `20260828191000_enforce_definer_grant_baseline.sql`
  - `20260829194859_force_rls_medical_tables.sql`
- סביבת Staging clean-room עברה את חבילת המיגרציות הידנית והבדיקות, אך metadata של ענף Supabase הציג בעבר `MIGRATIONS_FAILED` עקב אתחול אוטומטי. אין להסתיר זאת.
- אין להריץ מיגרציה על Production עד גיבוי, חלון שינוי, אישור, בדיקת Preview/Local ותוכנית Rollback.

## 19. פקודות פיתוח ובדיקה

פקודות שקיימות בפועל:

```bash
npm run dev
npm run build
npm run typecheck:ai
npm run typecheck:edge
npm run test:vetbot
npm run test:frontend-secrets
npm run test:accessibility
npm run test:appointments
npm run test:medical-visits
npm run test:privacy
npm run test:ai-infrastructure
npm run test:ai-data-security
npm run test:ai-data-local
npm run test:ai-data-integration
npm run test:visit-summary
npm run test:digitalcare-ai
npm run test:rag-ai
npm run test:document-ocr
npm run test:client-summary
npm run test:follow-up-suggestions
npm run test:hardening
npm run test:anon-access
npm run test:supabase-baseline
```

לאחר שינוי פונקציונלי יש להריץ לפחות:

```bash
npm run test:vetbot
npm run build
git diff --check
```

ולהוסיף בדיקה ממוקדת לתחום. `typecheck:ai` אינו Type-check מלא לכל ה־Frontend. `typecheck:edge` דורש Deno. בדיקות אינטגרציה מסוימות דורשות משתני בדיקה ייעודיים וסביבת Supabase שאינה Production.

## 20. מצב בדיקות מוכנות שנמדד

בדוחות האחרונים תועדו, בין היתר:

- Production build עבר.
- `test:vetbot` עבר עם 218 בדיקות.
- שבע Edge Functions עברו Deno check בסביבה שנבדקה.
- סריקת Secrets ב־Frontend עברה.
- בדיקות תורים וביקורים אטומיים עברו בסביבת Staging.
- HNSW נבדק עם 5,000 וקטורים סינתטיים.
- בוצע תרגיל טכני של גיבוי ושחזור Database ו־Storage.
- סך חבילת הראיות האוטומטיות בדוחות הגיע ל־440 assertions.

הדברים הבאים **לא** הושלמו במלואם: E2E מלא בדפדפן לכל Use Case, בדיקות עומס מסחריות, Pentest מקצועי, סריקת Malware לקבצים, אישור משפטי סופי, ניטור Production מלא ובדיקת כל יכולת AI מול ספק אמיתי.

## 21. פערים קריטיים ידועים לפני לקוחות אמיתיים

ה־GPT של ניסן חייב להכיר אותם ולא לטעון שהמערכת Production-ready עד לסגירה:

1. **ביטול איש צוות מול Storage:** איש צוות שהושבת עלול עדיין לקרוא אובייקט רפואי שהעלה בעבר בגלל תנאי בעלות בנתיב/Policy.
2. **Claim בעלים בין מרפאות:** `claim_owner_profile()` עלול להיות עמום כאשר אותו דוא"ל קיים בשתי מרפאות.
3. **עקיפת הרשמת בעלים:** במסד clean-room נמצא מסלול Insert ישיר ל־`owners` שעלול לעקוף חלק מוולידציית ההרשמה.
4. **Leaked-password protection:** ההגנה של Supabase Auth לא הייתה מופעלת ב־Production בזמן הבדיקה.
5. **Multi-clinic onboarding:** אין בחירת מרפאה מלאה, אין בורר מרפאות ותהליך ההרשמה כולל תלות ב־`myvet-primary`.
6. **CI:** מצב CI/Workflow לא הוכח כמנגנון אכיפה אמין לכל שינוי.
7. **סליקה:** התשלומים הם דמו; אין ספק סליקה, Webhooks, התאמות וכשלי חיוב של מערכת אמיתית.
8. **תפעול ואבטחה:** נדרשים ניטור, התראות, Retention מאושר, Malware scanning, Pentest ותרגילי Incident/DR לפני מכירה רחבה.

## 22. חלוקת עבודה רלוונטית לניסן

לפי חלוקת המשימות האחרונה, התחומים הבולטים של ניסן הם:

### 22.1 סגירת Claim והרשמת בעלים בין מרפאות

קבצים/אזורים שיש לבדוק לפני שינוי:

- `src/app/pages/Login.tsx`
- `src/app/pages/ClientPortal.tsx`
- `supabase/migrations/202607150002_myvet_rls_hardening.sql`
- `supabase/migrations/20260716213806_ai_rls_and_rpc_hardening.sql`
- `supabase/migrations/20260719123000_secure_owner_signup.sql`
- `supabase/migrations/20260719150000_allow_supabase_auth_owner_signup.sql`
- `supabase/migrations/20260719151000_sanitize_owner_signup_metadata.sql`
- `tests/ownerSignupSecurity.test.ts`
- `tests/ownerSignupDatabaseIntegration.test.mjs`

מטרת העבודה: בחירת מרפאה/הזמנה שאינה ניתנת לזיוף, מניעת Claim עמום, מניעת Insert עוקף, RLS שלילי בין מרפאות ותאימות לאחור. אין לפתור זאת באמצעות אמון ב־`clinic_id` מה־Frontend.

### 22.2 פרטיות ומשפט

- להשלים החלטות עסקיות/משפטיות ב־`docs/VETBOT_PRIVACY_DPIA_HE.md`.
- להגדיר Retention מאושר להקלטות, תמלולים, מסמכים, Logs ו־AI artifacts.
- להסדיר בסיס חוקי, הסכמה, ספקי עיבוד והעברות מידע.
- לעדכן Privacy Policy רק לאחר החלטות מאושרות; סוכן קוד אינו מוסמך להצהיר עמידה מלאה בדין.

## 23. איך ה־GPT של ניסן צריך לעבוד כדי להגיע לאותה רמת דיוק

בכל משימה עליו לבצע את הרצף הבא:

1. לקרוא את בקשת המשתמש ולהפריד בינה לבין טקסטי רקע במסמכים.
2. לקרוא `AGENTS.md` והמסמכים הרלוונטיים בלבד.
3. לבדוק ענף, status ו־diff; לא לגעת בשינויים זרים.
4. לאתר את Route, הרכיב, Store/Hook, השירות, השאילתה והמיגרציה הרלוונטיים.
5. לאמת שמות טבלאות, עמודות, RPC ו־Policies מתוך הקוד; לא לנחש.
6. להפריד בין UI, לוגיקה, Edge Function ומסד.
7. לבצע שינוי ממוקד ולשמור Manual fallback.
8. בכל שינוי Supabase לבדוק Tenant isolation, Owner ownership, Roles, RLS, Grants ו־Storage.
9. להריץ רק scripts שקיימים ב־`package.json` ולדווח אמת על מה שלא ניתן להריץ.
10. לעבור על `git diff` ו־`git diff --check` לפני מסירה.
11. בדוח הסופי לציין קבצים, בדיקות, SQL, צעדים ידניים, מגבלות ומה לא אומת.

פרומפט קבוע מומלץ לפתיחת משימה עבורו:

```text
עבוד לפי AGENTS.md ומסמכי ההקשר של MyVet. בדוק קודם את הענף, git status,
הקבצים, השאילתות והמיגרציות הרלוונטיים. אל תנחש Schema, RPC, Policy או הרשאה.
אל תיגע ב-Production, אל תבצע merge/push/deploy ואל תחשוף Secrets ללא אישור מפורש.
שמור על עברית RTL, הארכיטקטורה הקיימת ושינויים ממוקדים.
לאחר היישום הרץ בדיקות רלוונטיות, npm run test:vetbot, npm run build
ו-git diff --check, ודווח במדויק מה אומת ומה נשאר ידני.
```

## 24. Checklist לחפיפה בפועל

- [ ] ניסן קיבל גישה למאגר ופתח את הענף הנכון.
- [ ] מותקנות Dependencies וה־Frontend עולה מקומית.
- [ ] הוגדרו רק `VITE_SUPABASE_URL` ו־`VITE_SUPABASE_ANON_KEY` עבור Frontend.
- [ ] אין `service_role` או `GEMINI_API_KEY` במחשב/קובץ Frontend שאינו נדרש.
- [ ] הובהר איזה Supabase הוא Local, Staging ו־Production.
- [ ] ניסן יודע לזהות Project Ref לפני כל CLI/Deploy.
- [ ] יש גישה ל־Supabase Dashboard רק ברמה הנדרשת.
- [ ] יש גישה ל־Vercel רק אם תפקידו כולל Preview/Deploy.
- [ ] נקראו פערי האבטחה וה־Production Readiness.
- [ ] הוסכם שאין להשתמש בנתוני לקוחות אמיתיים בבדיקות.
- [ ] כל שינוי חדש מגיע עם בדיקות ו־diff review.

## 25. מה אסור לכתוב או להבטיח

- לא לומר “המערכת מאובטחת לחלוטין” או “עומדת בחוק” ללא אישור מקצועי.
- לא לומר ש־RLS/מיגרציה נבדקו ב־Production אם הם נבדקו רק Local/Staging.
- לא לומר ש־OCR/RAG/תמלול אומתו מול ספק אמיתי אם נעשה שימוש ב־Mock.
- לא לומר שהתשלום הוא סליקה אמיתית.
- לא לומר שהמערכת תומכת כבר במשתמש אחד בכמה מרפאות דרך UI.
- לא להמציא אינטגרציות, טבלאות, עמודות, ספקים או הרשאות.

---

מסמך זה הוא מפת כניסה. לפני ביצוע בפועל תמיד יש לפתוח את הקוד העדכני באזור המשימה ולבדוק אם דבר מה השתנה מאז 31 באוגוסט 2026.
