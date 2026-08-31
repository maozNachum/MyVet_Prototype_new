-- PREVIEW-ONLY ACCEPTANCE TEST.
-- Uses fixed synthetic identifiers and example.invalid addresses, asserts the
-- atomic medical-entry contract, then removes every synthetic row it created.
-- Canonical psql execution MUST use: --no-psqlrc -v ON_ERROR_STOP=1
-- (A psql meta-command is intentionally omitted because PGlite also executes
-- this fixture directly in the repository integration tests.)

begin;

do $acceptance$
declare
  clinic_a constant uuid := 'a1000000-0000-4000-8000-000000000001';
  clinic_b constant uuid := 'b1000000-0000-4000-8000-000000000002';
  auth_vet_a constant uuid := 'a2000000-0000-4000-8000-000000000001';
  auth_vet_b constant uuid := 'b2000000-0000-4000-8000-000000000002';
  auth_secretary constant uuid := 'a2000000-0000-4000-8000-000000000003';
  staff_vet_a constant uuid := 'a3000000-0000-4000-8000-000000000001';
  staff_vet_b constant uuid := 'b3000000-0000-4000-8000-000000000002';
  staff_secretary constant uuid := 'a3000000-0000-4000-8000-000000000003';
  submission_ok constant uuid := 'a4000000-0000-4000-8000-000000000001';
  submission_bad constant uuid := 'a4000000-0000-4000-8000-000000000002';
  appointment_a bigint;
  appointment_bad bigint;
  pet_a bigint;
  pet_b bigint;
  result jsonb;
  payload jsonb;
  changed_payload jsonb;
  caught boolean;
  row_count integer;
  table_name text;
begin
  insert into auth.users (
    id, aud, role, email, encrypted_password, email_confirmed_at,
    raw_app_meta_data, raw_user_meta_data, created_at, updated_at
  ) values
    (auth_vet_a, 'authenticated', 'authenticated', 'preview-vet-a@example.invalid', '', now(),
      '{"provider":"email","providers":["email"]}'::jsonb, '{}'::jsonb, now(), now()),
    (auth_vet_b, 'authenticated', 'authenticated', 'preview-vet-b@example.invalid', '', now(),
      '{"provider":"email","providers":["email"]}'::jsonb, '{}'::jsonb, now(), now()),
    (auth_secretary, 'authenticated', 'authenticated', 'preview-secretary@example.invalid', '', now(),
      '{"provider":"email","providers":["email"]}'::jsonb, '{}'::jsonb, now(), now());

  insert into public.clinics (clinic_id, slug, display_name)
  values
    (clinic_a, 'preview-medical-a', 'Preview Medical A'),
    (clinic_b, 'preview-medical-b', 'Preview Medical B');

  insert into public.staff (staff_id, name, role, auth_user_id, email, full_name, clinic_id)
  values
    (staff_vet_a, 'Preview Vet A', 'vet', auth_vet_a, 'preview-vet-a@example.invalid', 'Preview Vet A', clinic_a),
    (staff_vet_b, 'Preview Vet B', 'vet', auth_vet_b, 'preview-vet-b@example.invalid', 'Preview Vet B', clinic_b),
    (staff_secretary, 'Preview Secretary', 'secretary', auth_secretary, 'preview-secretary@example.invalid', 'Preview Secretary', clinic_a);

  insert into public.owners (owner_id, owner_first_name, owner_last_name, clinic_id)
  values
    ('preview-owner-a', 'Preview', 'Owner A', clinic_a),
    ('preview-owner-b', 'Preview', 'Owner B', clinic_b);

  insert into public.patients (pet_name, species, owner_id, weight, clinic_id)
  values ('Preview Pet A', 'dog', 'preview-owner-a', 7, clinic_a)
  returning pet_id into pet_a;
  insert into public.patients (pet_name, species, owner_id, weight, clinic_id)
  values ('Preview Pet B', 'cat', 'preview-owner-b', 9, clinic_b)
  returning pet_id into pet_b;

  insert into public.clinic_booking_hours (
    clinic_id, weekday, is_open, opens_at, closes_at, slot_minutes, max_bookings
  ) values
    (clinic_a, 1, true, '08:00', '17:00', 30, 18),
    (clinic_a, 2, true, '08:00', '17:00', 30, 18),
    (clinic_b, 1, true, '08:00', '17:00', 30, 18);

  insert into public.appointments (pet_id, start_time, end_time, appointment_type, clinic_id, status)
  values (pet_a, '2030-01-07 10:00:00+00', '2030-01-07 10:30:00+00', 'full_exam', clinic_a, 'scheduled')
  returning appointment_id into appointment_a;
  insert into public.appointments (pet_id, start_time, end_time, appointment_type, clinic_id, status)
  values (pet_a, '2030-01-08 10:00:00+00', '2030-01-08 10:30:00+00', 'full_exam', clinic_a, 'scheduled')
  returning appointment_id into appointment_bad;
  insert into public.appointments (pet_id, start_time, end_time, appointment_type, clinic_id, status)
  values (pet_b, '2030-01-07 11:00:00+00', '2030-01-07 11:30:00+00', 'full_exam', clinic_b, 'scheduled');

  perform set_config('request.jwt.claim.sub', auth_vet_a::text, true);
  payload := jsonb_build_object(
    'petId', pet_a,
    'appointmentId', appointment_a,
    'visitDate', '2030-01-07T10:00:00.000Z',
    'visitType', 'full_exam',
    'urgencyLevel', 'normal',
    'reason', 'Synthetic preview examination',
    'diagnosis', 'Synthetic approved diagnosis',
    'treatment', 'Synthetic documented treatment',
    'notes', 'Synthetic data only',
    'followUpRequired', true,
    'followUpNotes', 'Synthetic follow-up',
    'entryData', jsonb_build_object('entryType', 'full_exam'),
    'physicalExam', jsonb_build_object('findings', 'Synthetic findings'),
    'problems', jsonb_build_array(jsonb_build_object(
      'problemText', 'Synthetic problem', 'severity', 'normal', 'status', 'active', 'notes', '')),
    'differentials', jsonb_build_array(jsonb_build_object(
      'diagnosisText', 'Synthetic differential', 'likelihood', 'possible', 'notes', '')),
    'prescriptions', jsonb_build_array(jsonb_build_object(
      'medication', 'Synthetic medication', 'dosage', '1 unit',
      'frequency', 'once daily', 'duration', '7 days', 'startDate', '2030-01-07')),
    'labs', jsonb_build_array(jsonb_build_object(
      'testName', 'Synthetic blood test', 'category', 'blood',
      'testDate', '2030-01-08', 'urgent', false, 'notes', '')),
    'weight', null
  );

  result := public.myvet_save_medical_entry(submission_ok, payload);
  if coalesce((result ->> 'idempotentReplay')::boolean, true) then
    raise exception 'ACCEPTANCE_INITIAL_SAVE_FAILED';
  end if;
  if (select status from public.appointments where appointment_id = appointment_a) <> 'completed' then
    raise exception 'ACCEPTANCE_APPOINTMENT_NOT_COMPLETED';
  end if;

  foreach table_name in array array[
    'medical_visits', 'physical_exams', 'medical_problems',
    'differential_diagnoses', 'prescriptions', 'lab_orders'
  ] loop
    execute format('select count(*) from public.%I where clinic_id = $1', table_name)
      into row_count using clinic_a;
    if row_count <> 1 then
      raise exception 'ACCEPTANCE_CHILD_COUNT_FAILED: % = %', table_name, row_count;
    end if;
  end loop;

  result := public.myvet_save_medical_entry(submission_ok, payload);
  if not coalesce((result ->> 'idempotentReplay')::boolean, false) then
    raise exception 'ACCEPTANCE_IDEMPOTENT_REPLAY_FAILED';
  end if;
  if (select count(*) from public.medical_visits where submission_id = submission_ok) <> 1 then
    raise exception 'ACCEPTANCE_DUPLICATE_VISIT_CREATED';
  end if;

  changed_payload := jsonb_set(payload, '{treatment}', '"Changed synthetic treatment"'::jsonb);
  caught := false;
  begin
    perform public.myvet_save_medical_entry(submission_ok, changed_payload);
  exception when others then
    caught := sqlerrm like '%IDEMPOTENCY_KEY_REUSED%';
  end;
  if not caught then
    raise exception 'ACCEPTANCE_IDEMPOTENCY_REUSE_NOT_REJECTED';
  end if;

  caught := false;
  begin
    perform public.myvet_save_medical_entry(
      'a4000000-0000-4000-8000-000000000003'::uuid,
      jsonb_set(jsonb_set(payload, '{appointmentId}', 'null'::jsonb), '{petId}', to_jsonb(pet_b))
    );
  exception when others then
    caught := sqlerrm like '%PET_NOT_FOUND%';
  end;
  if not caught then
    raise exception 'ACCEPTANCE_CROSS_CLINIC_NOT_REJECTED';
  end if;

  perform set_config('request.jwt.claim.sub', auth_secretary::text, true);
  caught := false;
  begin
    perform public.myvet_save_medical_entry(
      'a4000000-0000-4000-8000-000000000004'::uuid,
      jsonb_set(payload, '{appointmentId}', 'null'::jsonb)
    );
  exception when others then
    caught := sqlerrm like '%MEDICAL_STAFF_REQUIRED%';
  end;
  if not caught then
    raise exception 'ACCEPTANCE_SECRETARY_NOT_REJECTED';
  end if;

  perform set_config('request.jwt.claim.sub', auth_vet_a::text, true);
  caught := false;
  begin
    perform public.myvet_save_medical_entry(
      submission_bad,
      jsonb_set(
        jsonb_set(payload, '{appointmentId}', to_jsonb(appointment_bad)),
        '{problems,0,severity}',
        '"unsupported"'::jsonb
      )
    );
  exception when others then
    caught := sqlerrm like '%INVALID_MEDICAL_PROBLEM%';
  end;
  if not caught then
    raise exception 'ACCEPTANCE_INVALID_CHILD_NOT_REJECTED';
  end if;
  if exists (select 1 from public.medical_visits where submission_id = submission_bad)
     or (select status from public.appointments where appointment_id = appointment_bad) <> 'scheduled' then
    raise exception 'ACCEPTANCE_ATOMIC_ROLLBACK_FAILED';
  end if;

  if has_function_privilege('anon', 'public.myvet_save_medical_entry(uuid,jsonb)', 'EXECUTE')
     or not has_function_privilege('authenticated', 'public.myvet_save_medical_entry(uuid,jsonb)', 'EXECUTE') then
    raise exception 'ACCEPTANCE_FUNCTION_GRANTS_FAILED';
  end if;
  if not exists (
    select 1 from pg_proc
    where oid = 'public.myvet_save_medical_entry(uuid,jsonb)'::regprocedure
      and prosecdef = true
      and exists (
        select 1 from unnest(coalesce(proconfig, array[]::text[])) as config(value)
        where config.value ~ '^search_path=(""|)$'
      )
  ) then
    raise exception 'ACCEPTANCE_FUNCTION_HARDENING_FAILED';
  end if;
  if not exists (
    select 1 from pg_constraint
    where conname = 'medical_visits_clinic_submitted_by_fkey'
      and conrelid = 'public.medical_visits'::regclass
  ) then
    raise exception 'ACCEPTANCE_TENANT_STAFF_FK_MISSING';
  end if;
  if (
    select count(*)
    from pg_indexes
    where schemaname = 'public'
      and tablename = 'staff'
      and indexdef like '%(clinic_id, staff_id)%'
  ) <> 1 then
    raise exception 'ACCEPTANCE_DUPLICATE_STAFF_TENANT_INDEX';
  end if;
  if not exists (
    select 1 from pg_indexes
    where schemaname = 'public'
      and indexname = 'medical_visits_clinic_submission_key'
  ) then
    raise exception 'ACCEPTANCE_IDEMPOTENCY_INDEX_MISSING';
  end if;

  foreach table_name in array array[
    'medical_visits', 'vaccinations', 'physical_exams', 'medical_problems',
    'differential_diagnoses', 'prescriptions', 'lab_orders'
  ] loop
    if not exists (
      select 1 from pg_class c join pg_namespace n on n.oid = c.relnamespace
      where n.nspname = 'public' and c.relname = table_name
        and c.relrowsecurity = true and c.relforcerowsecurity = true
    ) then
      raise exception 'ACCEPTANCE_RLS_NOT_FORCED: %', table_name;
    end if;
  end loop;

end
$acceptance$;

rollback;
