-- Save a complete medical entry and complete its linked appointment atomically.
-- Depends on 20260805185316_appointment_status_workflow.sql.

do $$
begin
  if not exists (
    select 1
    from information_schema.columns
    where table_schema = 'public'
      and table_name = 'appointments'
      and column_name = 'status'
  ) then
    raise exception 'APPOINTMENT_STATUS_MIGRATION_REQUIRED';
  end if;
end
$$;

do $$
begin
  if not exists (
    select 1
    from pg_index as index_metadata
    where index_metadata.indrelid = 'public.staff'::regclass
      and index_metadata.indisunique = true
      and index_metadata.indpred is null
      and index_metadata.indnkeyatts = 2
      and (
        select array_agg(attribute_metadata.attname::text order by key_metadata.ordinality)
        from unnest(index_metadata.indkey::smallint[]) with ordinality
          as key_metadata(attnum, ordinality)
        join pg_attribute as attribute_metadata
          on attribute_metadata.attrelid = index_metadata.indrelid
         and attribute_metadata.attnum = key_metadata.attnum
        where key_metadata.ordinality <= index_metadata.indnkeyatts
      ) = array['clinic_id', 'staff_id']::text[]
  ) then
    create unique index staff_clinic_staff_key
      on public.staff (clinic_id, staff_id);
  end if;
end
$$;

alter table public.medical_visits
  add column if not exists submission_id uuid,
  add column if not exists submission_hash text,
  add column if not exists submitted_by uuid;

do $$
begin
  if not exists (
    select 1
    from pg_constraint
    where conname = 'medical_visits_clinic_submitted_by_fkey'
      and conrelid = 'public.medical_visits'::regclass
  ) then
    alter table public.medical_visits
      add constraint medical_visits_clinic_submitted_by_fkey
      foreign key (clinic_id, submitted_by)
      references public.staff (clinic_id, staff_id);
  end if;
end
$$;

create unique index if not exists medical_visits_clinic_submission_key
  on public.medical_visits (clinic_id, submitted_by, submission_id)
  where submission_id is not null and submitted_by is not null;

comment on column public.medical_visits.submission_id is
  'Client-generated idempotency key for atomic medical-entry creation.';

comment on column public.medical_visits.submission_hash is
  'Server-generated fingerprint used to reject reuse of an idempotency key with different content.';

comment on column public.medical_visits.submitted_by is
  'Server-derived staff member associated with an idempotent medical-entry request.';

create or replace function public.myvet_save_medical_entry(
  requested_submission_id uuid,
  requested_payload jsonb
)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  actor record;
  patient record;
  appointment record;
  existing_visit public.medical_visits%rowtype;
  created_visit public.medical_visits%rowtype;
  item jsonb;
  target_pet_id bigint;
  target_appointment_id bigint;
  visit_at timestamptz;
  target_visit_type text;
  target_urgency text;
  target_reason text;
  target_diagnosis text;
  target_treatment text;
  target_notes text;
  target_follow_up_required boolean;
  target_follow_up_notes text;
  target_entry_data jsonb;
  target_submission_hash text;
  target_weight numeric;
  vaccination jsonb;
  physical_exam jsonb;
  problems jsonb;
  differentials jsonb;
  prescriptions jsonb;
  labs jsonb;
  vaccine_given_date date;
  vaccine_next_due_date date;
  prescription_start_date date;
  lab_test_date date;
begin
  if (select auth.uid()) is null then
    raise exception 'AUTH_REQUIRED' using errcode = '42501';
  end if;

  if requested_submission_id is null
     or requested_payload is null
     or jsonb_typeof(requested_payload) <> 'object' then
    raise exception 'INVALID_MEDICAL_ENTRY' using errcode = '22023';
  end if;

  target_submission_hash := md5(requested_payload::text);

  select
    staff.staff_id,
    staff.clinic_id,
    coalesce(nullif(btrim(staff.full_name), ''), nullif(btrim(staff.name), ''), 'צוות רפואי') as display_name,
    staff.role
  into actor
  from public.staff as staff
  where staff.auth_user_id = (select auth.uid())
    and staff.is_active = true
    and staff.role in ('clinic_admin', 'vet', 'nurse')
  limit 1;

  if not found then
    raise exception 'MEDICAL_STAFF_REQUIRED' using errcode = '42501';
  end if;

  -- Serialize retries that reuse the same idempotency key.
  perform pg_advisory_xact_lock(
    hashtextextended(actor.clinic_id::text || ':' || requested_submission_id::text, 0)
  );

  if coalesce(requested_payload ->> 'petId', '') !~ '^[1-9][0-9]*$' then
    raise exception 'INVALID_PET_ID' using errcode = '22023';
  end if;
  target_pet_id := (requested_payload ->> 'petId')::bigint;

  select pet.pet_id, pet.owner_id, pet.clinic_id
  into patient
  from public.patients as pet
  where pet.pet_id = target_pet_id
    and pet.clinic_id = actor.clinic_id
  for key share;

  if not found then
    raise exception 'PET_NOT_FOUND' using errcode = 'P0002';
  end if;

  if nullif(btrim(coalesce(requested_payload ->> 'appointmentId', '')), '') is not null then
    if (requested_payload ->> 'appointmentId') !~ '^[1-9][0-9]*$' then
      raise exception 'INVALID_APPOINTMENT_ID' using errcode = '22023';
    end if;
    target_appointment_id := (requested_payload ->> 'appointmentId')::bigint;
  end if;

  select visit.*
  into existing_visit
  from public.medical_visits as visit
  where visit.clinic_id = actor.clinic_id
    and visit.submitted_by = actor.staff_id
    and visit.submission_id = requested_submission_id
  limit 1;

  if found then
    if existing_visit.pet_id is distinct from target_pet_id
       or existing_visit.appointment_id is distinct from target_appointment_id
       or existing_visit.submission_hash is distinct from target_submission_hash then
      raise exception 'IDEMPOTENCY_KEY_REUSED' using errcode = '22023';
    end if;

    return jsonb_build_object(
      'visitId', existing_visit.visit_id,
      'patientId', existing_visit.pet_id,
      'appointmentId', existing_visit.appointment_id,
      'visitDate', existing_visit.visit_date,
      'vetName', existing_visit.vet_name,
      'reason', existing_visit.reason,
      'diagnosis', existing_visit.diagnosis,
      'treatment', existing_visit.treatment,
      'notes', existing_visit.notes,
      'visitType', existing_visit.visit_type,
      'urgencyLevel', existing_visit.urgency_level,
      'finalDiagnosis', existing_visit.final_diagnosis,
      'followUpRequired', existing_visit.follow_up_required,
      'followUpNotes', existing_visit.follow_up_notes,
      'entryData', existing_visit.entry_data,
      'idempotentReplay', true
    );
  end if;

  if target_appointment_id is not null then
    select a.appointment_id, a.pet_id, a.clinic_id, a.status
    into appointment
    from public.appointments as a
    where a.appointment_id = target_appointment_id
      and a.clinic_id = actor.clinic_id
    for update;

    if not found then
      raise exception 'APPOINTMENT_NOT_FOUND' using errcode = 'P0002';
    end if;
    if appointment.pet_id is distinct from target_pet_id then
      raise exception 'APPOINTMENT_PET_MISMATCH' using errcode = '42501';
    end if;
    if appointment.status = 'cancelled' then
      raise exception 'APPOINTMENT_CANCELLED' using errcode = '22023';
    end if;
    if appointment.status = 'completed' then
      raise exception 'APPOINTMENT_ALREADY_COMPLETED' using errcode = '22023';
    end if;
    if exists (
      select 1
      from public.medical_visits as visit
      where visit.clinic_id = actor.clinic_id
        and visit.appointment_id = target_appointment_id
    ) then
      raise exception 'APPOINTMENT_VISIT_ALREADY_EXISTS' using errcode = '23505';
    end if;
  end if;

  if nullif(btrim(coalesce(requested_payload ->> 'visitDate', '')), '') is null then
    raise exception 'INVALID_VISIT_DATE' using errcode = '22007';
  end if;

  begin
    visit_at := (requested_payload ->> 'visitDate')::timestamptz;
  exception when others then
    raise exception 'INVALID_VISIT_DATE' using errcode = '22007';
  end;

  if visit_at is null then
    raise exception 'INVALID_VISIT_DATE' using errcode = '22007';
  end if;

  target_visit_type := btrim(coalesce(requested_payload ->> 'visitType', ''));
  target_urgency := btrim(coalesce(requested_payload ->> 'urgencyLevel', 'normal'));
  target_reason := btrim(coalesce(requested_payload ->> 'reason', ''));
  target_diagnosis := btrim(coalesce(requested_payload ->> 'diagnosis', ''));
  target_treatment := btrim(coalesce(requested_payload ->> 'treatment', ''));
  target_notes := btrim(coalesce(requested_payload ->> 'notes', ''));
  target_follow_up_required := coalesce((requested_payload ->> 'followUpRequired')::boolean, false);
  target_follow_up_notes := btrim(coalesce(requested_payload ->> 'followUpNotes', ''));
  target_entry_data := requested_payload -> 'entryData';

  if target_visit_type not in ('full_exam', 'vaccination', 'weight_check', 'prescription_only', 'lab', 'follow_up', 'note') then
    raise exception 'INVALID_VISIT_TYPE' using errcode = '22023';
  end if;
  if target_urgency not in ('normal', 'serious', 'critical') then
    raise exception 'INVALID_URGENCY_LEVEL' using errcode = '22023';
  end if;
  if target_reason = '' or char_length(target_reason) > 2000
     or char_length(target_diagnosis) > 4000
     or target_treatment = '' or char_length(target_treatment) > 10000
     or char_length(target_notes) > 10000
     or char_length(target_follow_up_notes) > 4000 then
    raise exception 'INVALID_MEDICAL_ENTRY_DETAILS' using errcode = '22023';
  end if;
  if target_entry_data is not null
     and target_entry_data <> 'null'::jsonb
     and jsonb_typeof(target_entry_data) <> 'object' then
    raise exception 'INVALID_ENTRY_DATA' using errcode = '22023';
  end if;

  vaccination := requested_payload -> 'vaccination';
  physical_exam := requested_payload -> 'physicalExam';
  problems := coalesce(requested_payload -> 'problems', '[]'::jsonb);
  differentials := coalesce(requested_payload -> 'differentials', '[]'::jsonb);
  prescriptions := coalesce(requested_payload -> 'prescriptions', '[]'::jsonb);
  labs := coalesce(requested_payload -> 'labs', '[]'::jsonb);

  if jsonb_typeof(problems) <> 'array' or jsonb_array_length(problems) > 50
     or jsonb_typeof(differentials) <> 'array' or jsonb_array_length(differentials) > 50
     or jsonb_typeof(prescriptions) <> 'array' or jsonb_array_length(prescriptions) > 50
     or jsonb_typeof(labs) <> 'array' or jsonb_array_length(labs) > 50 then
    raise exception 'INVALID_MEDICAL_ENTRY_COLLECTIONS' using errcode = '22023';
  end if;

  if nullif(btrim(coalesce(requested_payload ->> 'weight', '')), '') is not null then
    begin
      target_weight := (requested_payload ->> 'weight')::numeric;
    exception when others then
      raise exception 'INVALID_WEIGHT' using errcode = '22023';
    end;
    if target_weight <= 0 or target_weight > 500 then
      raise exception 'INVALID_WEIGHT' using errcode = '22023';
    end if;
  end if;

  if target_visit_type = 'weight_check' and target_weight is null then
    raise exception 'WEIGHT_REQUIRED' using errcode = '22023';
  end if;
  if target_weight is not null and target_visit_type <> 'weight_check' then
    raise exception 'UNEXPECTED_WEIGHT' using errcode = '22023';
  end if;
  if target_visit_type = 'vaccination'
     and (vaccination is null or vaccination = 'null'::jsonb or jsonb_typeof(vaccination) <> 'object') then
    raise exception 'VACCINATION_REQUIRED' using errcode = '22023';
  end if;
  if vaccination is not null and vaccination <> 'null'::jsonb and target_visit_type <> 'vaccination' then
    raise exception 'UNEXPECTED_VACCINATION' using errcode = '22023';
  end if;
  if physical_exam is not null
     and physical_exam <> 'null'::jsonb
     and jsonb_typeof(physical_exam) <> 'object' then
    raise exception 'INVALID_PHYSICAL_EXAM' using errcode = '22023';
  end if;
  if physical_exam is not null and physical_exam <> 'null'::jsonb and target_visit_type <> 'full_exam' then
    raise exception 'UNEXPECTED_PHYSICAL_EXAM' using errcode = '22023';
  end if;
  if jsonb_array_length(problems) > 0 and target_visit_type <> 'full_exam'
     or jsonb_array_length(differentials) > 0 and target_visit_type <> 'full_exam'
     or jsonb_array_length(prescriptions) > 0 and target_visit_type not in ('full_exam', 'prescription_only')
     or jsonb_array_length(labs) > 0 and target_visit_type not in ('full_exam', 'lab') then
    raise exception 'UNEXPECTED_MEDICAL_ENTRY_COLLECTION' using errcode = '22023';
  end if;

  insert into public.medical_visits (
    appointment_id, pet_id, visit_date, vet_name, reason, diagnosis, treatment,
    notes, attachments, visit_type, urgency_level, chief_complaint,
    final_diagnosis, follow_up_required, follow_up_notes, entry_data,
    clinic_id, submission_id, submission_hash, submitted_by
  ) values (
    target_appointment_id, target_pet_id, visit_at, actor.display_name, target_reason,
    nullif(target_diagnosis, ''), target_treatment, nullif(target_notes, ''), '0',
    target_visit_type, target_urgency, target_reason, nullif(target_diagnosis, ''),
    target_follow_up_required, nullif(target_follow_up_notes, ''),
    case when target_entry_data = 'null'::jsonb then null else target_entry_data end,
    actor.clinic_id, requested_submission_id, target_submission_hash, actor.staff_id
  )
  returning * into created_visit;

  if vaccination is not null and vaccination <> 'null'::jsonb then
    if btrim(coalesce(vaccination ->> 'vaccineName', '')) = ''
       or char_length(vaccination ->> 'vaccineName') > 250 then
      raise exception 'INVALID_VACCINATION' using errcode = '22023';
    end if;
    begin
      vaccine_given_date := coalesce(nullif(vaccination ->> 'givenDate', '')::date, visit_at::date);
      vaccine_next_due_date := nullif(vaccination ->> 'nextDueDate', '')::date;
    exception when others then
      raise exception 'INVALID_VACCINATION_DATE' using errcode = '22007';
    end;

    insert into public.vaccinations (
      pet_id, owner_id, visit_id, vaccine_name, given_date, next_due_date,
      administered_by, entry_method, notes, clinic_id
    ) values (
      target_pet_id, patient.owner_id, created_visit.visit_id,
      btrim(vaccination ->> 'vaccineName'), vaccine_given_date, vaccine_next_due_date,
      actor.display_name, 'manual', nullif(btrim(coalesce(vaccination ->> 'notes', '')), ''),
      actor.clinic_id
    );
  end if;

  if physical_exam is not null and physical_exam <> 'null'::jsonb
     and btrim(coalesce(physical_exam ->> 'findings', '')) <> '' then
    if char_length(physical_exam ->> 'findings') > 10000 then
      raise exception 'INVALID_PHYSICAL_EXAM' using errcode = '22023';
    end if;
    insert into public.physical_exams (visit_id, pet_id, exam_date, findings, clinic_id)
    values (
      created_visit.visit_id, target_pet_id, visit_at,
      btrim(physical_exam ->> 'findings'), actor.clinic_id
    );
  end if;

  for item in select value from jsonb_array_elements(problems) loop
    if btrim(coalesce(item ->> 'problemText', '')) = ''
       or char_length(item ->> 'problemText') > 2000
       or coalesce(item ->> 'severity', '') not in ('normal', 'serious', 'critical')
       or coalesce(item ->> 'status', '') not in ('active', 'improved', 'resolved')
       or char_length(coalesce(item ->> 'notes', '')) > 4000 then
      raise exception 'INVALID_MEDICAL_PROBLEM' using errcode = '22023';
    end if;
    insert into public.medical_problems (
      visit_id, pet_id, problem_text, severity, status, notes, clinic_id
    ) values (
      created_visit.visit_id, target_pet_id, btrim(item ->> 'problemText'),
      item ->> 'severity', item ->> 'status',
      nullif(btrim(coalesce(item ->> 'notes', '')), ''), actor.clinic_id
    );
  end loop;

  for item in select value from jsonb_array_elements(differentials) loop
    if btrim(coalesce(item ->> 'diagnosisText', '')) = ''
       or char_length(item ->> 'diagnosisText') > 2000
       or coalesce(item ->> 'likelihood', '') not in ('low', 'possible', 'likely')
       or char_length(coalesce(item ->> 'notes', '')) > 4000 then
      raise exception 'INVALID_DIFFERENTIAL_DIAGNOSIS' using errcode = '22023';
    end if;
    insert into public.differential_diagnoses (
      visit_id, pet_id, diagnosis_text, likelihood, notes, clinic_id
    ) values (
      created_visit.visit_id, target_pet_id, btrim(item ->> 'diagnosisText'),
      item ->> 'likelihood', nullif(btrim(coalesce(item ->> 'notes', '')), ''),
      actor.clinic_id
    );
  end loop;

  for item in select value from jsonb_array_elements(prescriptions) loop
    if btrim(coalesce(item ->> 'medication', '')) = ''
       or btrim(coalesce(item ->> 'dosage', '')) = ''
       or btrim(coalesce(item ->> 'frequency', '')) = ''
       or btrim(coalesce(item ->> 'duration', '')) = ''
       or char_length(item ->> 'medication') > 500
       or char_length(item ->> 'dosage') > 500
       or char_length(item ->> 'frequency') > 500
       or char_length(item ->> 'duration') > 500 then
      raise exception 'INVALID_PRESCRIPTION' using errcode = '22023';
    end if;
    begin
      prescription_start_date := coalesce(nullif(item ->> 'startDate', '')::date, visit_at::date);
    exception when others then
      raise exception 'INVALID_PRESCRIPTION_DATE' using errcode = '22007';
    end;
    insert into public.prescriptions (
      visit_id, pet_id, medication, dosage, frequency, duration,
      start_date, prescribed_by, clinic_id
    ) values (
      created_visit.visit_id, target_pet_id, btrim(item ->> 'medication'),
      btrim(item ->> 'dosage'), btrim(item ->> 'frequency'),
      btrim(item ->> 'duration'), prescription_start_date, actor.staff_id, actor.clinic_id
    );
  end loop;

  for item in select value from jsonb_array_elements(labs) loop
    if btrim(coalesce(item ->> 'testName', '')) = ''
       or char_length(item ->> 'testName') > 500
       or coalesce(item ->> 'category', '') not in ('blood', 'urine', 'imaging', 'biopsy', 'other')
       or char_length(coalesce(item ->> 'notes', '')) > 4000 then
      raise exception 'INVALID_LAB_ORDER' using errcode = '22023';
    end if;
    begin
      lab_test_date := nullif(item ->> 'testDate', '')::date;
    exception when others then
      raise exception 'INVALID_LAB_DATE' using errcode = '22007';
    end;
    insert into public.lab_orders (
      pet_id, visit_id, test_name, category, status, ordered_date,
      ordered_by, notes, is_urgent, test_date, clinic_id
    ) values (
      target_pet_id, created_visit.visit_id, btrim(item ->> 'testName'),
      item ->> 'category', 'ordered', visit_at, actor.staff_id,
      nullif(btrim(coalesce(item ->> 'notes', '')), ''),
      coalesce((item ->> 'urgent')::boolean, false), lab_test_date, actor.clinic_id
    );
  end loop;

  if target_weight is not null then
    update public.patients
    set weight = target_weight
    where pet_id = target_pet_id
      and clinic_id = actor.clinic_id;
  end if;

  if target_appointment_id is not null then
    update public.appointments
    set status = 'completed'
    where appointment_id = target_appointment_id
      and clinic_id = actor.clinic_id;
  end if;

  return jsonb_build_object(
    'visitId', created_visit.visit_id,
    'patientId', created_visit.pet_id,
    'appointmentId', created_visit.appointment_id,
    'visitDate', created_visit.visit_date,
    'vetName', created_visit.vet_name,
    'reason', created_visit.reason,
    'diagnosis', created_visit.diagnosis,
    'treatment', created_visit.treatment,
    'notes', created_visit.notes,
    'visitType', created_visit.visit_type,
    'urgencyLevel', created_visit.urgency_level,
    'finalDiagnosis', created_visit.final_diagnosis,
    'followUpRequired', created_visit.follow_up_required,
    'followUpNotes', created_visit.follow_up_notes,
    'entryData', created_visit.entry_data,
    'idempotentReplay', false
  );
end;
$$;

revoke all on function public.myvet_save_medical_entry(uuid, jsonb)
  from public, anon, authenticated, service_role;
grant execute on function public.myvet_save_medical_entry(uuid, jsonb) to authenticated;

comment on function public.myvet_save_medical_entry(uuid, jsonb) is
  'Atomically saves a tenant-scoped medical entry and completes its linked appointment.';
