# MyVet – סיכום סדר בקוד וחיבור Supabase

## מה כבר מחובר
- `src/app/pages/Patients.tsx` כבר עובד מול Supabase עבור `owners` ו־`patients`.
- החיבור ל־Supabase נמצא ב־`src/services/supabaseClient.ts`.

## בעיות שמצאתי בקוד המקורי
1. `supabaseClient.ts` הדפיס את ה־API key ל־Console. זה הוסר.
2. `ClientPortal.tsx` היה עדיין מבוסס על נתוני דמה: `const pets`, `portalNotifications`, ושם קבוע "משפחת ישראלי".
3. `OwnerBookAppointment.tsx` היה מבוסס על חיות דמה ולא כתב תור ל־Supabase.
4. `AppointmentStore.tsx`, `MedicalStore.tsx`, `LabStore.tsx` עדיין עובדים עם localStorage / נתוני דמה.
5. `Navbar.tsx`, `Dashboard.tsx`, `AppointmentsTable.tsx` עדיין מייבאים `data/patients.ts`, כלומר עדיין לא מחוברים למטופלים האמיתיים במסד.

## מה שונה בחבילת Phase 1
### ClientPortal.tsx
- טוען בעלים מטבלת `owners`.
- טוען חיות מטבלת `patients` לפי `owner_id`.
- מחליף את "משפחת ישראלי" בשם אמיתי מהמסד.
- מציג את החיות של אותו בעלים באזור האישי.
- טוען תורים עתידיים מטבלת `appointments` לפי `pet_id`.
- מעביר ל־`OwnerBookAppointment` את החיות האמיתיות של הבעלים.

### OwnerBookAppointment.tsx
- מקבל רשימת חיות אמיתית מה־ClientPortal.
- בעת קביעת תור, מוסיף רשומה לטבלת `appointments`.
- משתמש בעמודות:
  - `pet_id`
  - `start_time`
  - `end_time`
  - `department`
  - `vet_name`
  - `room`
  - `appointment_type`
  - `color`
  - `notes`

### supabaseClient.ts
- הוסרו `console.log` של ה־URL והמפתח.

## איך לבדוק את האזור האישי
1. החלף את הקבצים בפרויקט.
2. הרץ מחדש:
   ```bash
   npm run dev
   ```
3. פתח:
   ```txt
   /portal
   ```
4. אם יש כמה בעלים ואתה רוצה לבדוק בעלים ספציפי:
   ```txt
   /portal?ownerId=123456789
   ```

## Policies שאולי תצטרך ב־Supabase
אם יש שגיאת הרשאות ב־ClientPortal:

```sql
create policy "Allow anon read owners"
on public.owners
for select
to anon
using (true);

create policy "Allow anon read patients"
on public.patients
for select
to anon
using (true);

create policy "Allow anon read appointments"
on public.appointments
for select
to anon
using (true);

create policy "Allow anon insert appointments"
on public.appointments
for insert
to anon
with check (true);

create policy "Allow anon update appointments"
on public.appointments
for update
to anon
using (true)
with check (true);

create policy "Allow anon delete appointments"
on public.appointments
for delete
to anon
using (true);
```

הערה: זה מתאים לדמו/פיתוח. במערכת אמיתית רפואית צריך Auth אמיתי ו־RLS לפי משתמש.

## השלב הבא המומלץ
לא להמשיך לקפוץ בין קבצים. סדר נכון:
1. `ClientPortal + OwnerBookAppointment` — אזור אישי ותורים לבעלים.
2. `AppointmentStore + AppointmentSchedule + NewAppointment` — להעביר את כל יומן התורים ל־Supabase.
3. `MedicalStore + TreatmentModal + ClientMedicalReports` — תיק רפואי אמיתי.
4. `LabStore + LabOrderModal + LabResultsPanel` — בדיקות מעבדה.
5. `Dashboard + Navbar` — להפסיק להשתמש ב־`data/patients.ts`.
