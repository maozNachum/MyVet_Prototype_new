-- PREVIEW-ONLY FIXTURE.
-- Creates the legacy medical tables that are absent from the dedicated
-- MyVet-Appointment-Preview project. Never add this file to the Production
-- migration chain; Production already owns these tables.

create table if not exists public.medical_visits (
  visit_id bigint generated always as identity primary key,
  appointment_id bigint references public.appointments (appointment_id),
  pet_id bigint references public.patients (pet_id),
  visit_date timestamptz,
  vet_name text,
  reason text,
  diagnosis text,
  treatment text,
  notes text,
  attachments text,
  visit_type text,
  urgency_level text not null default 'normal',
  chief_complaint text,
  final_diagnosis text,
  follow_up_required boolean not null default false,
  follow_up_notes text,
  entry_data jsonb,
  clinic_id uuid not null references public.clinics (clinic_id)
);

create table if not exists public.vaccinations (
  vaccination_id bigint generated always as identity primary key,
  pet_id bigint not null references public.patients (pet_id),
  owner_id text references public.owners (owner_id),
  visit_id bigint references public.medical_visits (visit_id),
  vaccine_name text not null,
  given_date date not null,
  next_due_date date,
  administered_by text,
  entry_method text not null,
  notes text,
  clinic_id uuid not null references public.clinics (clinic_id)
);

create table if not exists public.physical_exams (
  physical_exam_id bigint generated always as identity primary key,
  visit_id bigint references public.medical_visits (visit_id),
  pet_id bigint not null references public.patients (pet_id),
  exam_date timestamptz not null,
  findings text not null,
  clinic_id uuid not null references public.clinics (clinic_id)
);

create table if not exists public.medical_problems (
  problem_id bigint generated always as identity primary key,
  visit_id bigint references public.medical_visits (visit_id),
  pet_id bigint not null references public.patients (pet_id),
  problem_text text not null,
  severity text not null,
  status text not null,
  notes text,
  clinic_id uuid not null references public.clinics (clinic_id)
);

create table if not exists public.differential_diagnoses (
  diagnosis_id bigint generated always as identity primary key,
  visit_id bigint references public.medical_visits (visit_id),
  pet_id bigint not null references public.patients (pet_id),
  diagnosis_text text not null,
  likelihood text not null,
  notes text,
  clinic_id uuid not null references public.clinics (clinic_id)
);

create table if not exists public.prescriptions (
  prescription_id bigint generated always as identity primary key,
  visit_id bigint references public.medical_visits (visit_id),
  pet_id bigint references public.patients (pet_id),
  medication text,
  dosage text,
  frequency text,
  duration text,
  start_date date,
  prescribed_by uuid references public.staff (staff_id),
  clinic_id uuid not null references public.clinics (clinic_id)
);

create table if not exists public.lab_orders (
  lab_order_id bigint generated always as identity primary key,
  pet_id bigint references public.patients (pet_id),
  visit_id bigint references public.medical_visits (visit_id),
  test_name text,
  category text,
  status text,
  ordered_date timestamptz,
  ordered_by uuid references public.staff (staff_id),
  notes text,
  is_urgent boolean,
  test_date date,
  clinic_id uuid not null references public.clinics (clinic_id)
);

do $fixture$
declare
  table_name text;
begin
  foreach table_name in array array[
    'medical_visits', 'vaccinations', 'physical_exams', 'medical_problems',
    'differential_diagnoses', 'prescriptions', 'lab_orders'
  ] loop
    execute format('alter table public.%I enable row level security', table_name);
    execute format('alter table public.%I force row level security', table_name);
    execute format('revoke all on table public.%I from public, anon, authenticated', table_name);
    execute format('grant select on table public.%I to authenticated', table_name);
    execute format(
      'create policy %I on public.%I for select to authenticated using (' ||
      'clinic_id = (select private.myvet_current_clinic_id()) and exists (' ||
      'select 1 from public.staff s where s.auth_user_id = (select auth.uid()) ' ||
      'and s.clinic_id = %I.clinic_id and s.is_active = true))',
      table_name || '_preview_staff_select',
      table_name,
      table_name
    );
  end loop;
end
$fixture$;

comment on table public.medical_visits is
  'Synthetic Preview baseline only; not a replacement for the Production schema.';
