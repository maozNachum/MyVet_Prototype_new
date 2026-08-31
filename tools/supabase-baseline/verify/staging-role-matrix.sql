\set ON_ERROR_STOP on

begin;

insert into auth.users (id, aud, role, email, encrypted_password, email_confirmed_at,
  raw_app_meta_data, raw_user_meta_data, created_at, updated_at)
values
  ('51000000-0000-4000-8000-000000000001', 'authenticated', 'authenticated', 'staging-vet-a@example.invalid', '', now(), '{}', '{}', now(), now()),
  ('51000000-0000-4000-8000-000000000002', 'authenticated', 'authenticated', 'staging-vet-b@example.invalid', '', now(), '{}', '{}', now(), now()),
  ('51000000-0000-4000-8000-000000000003', 'authenticated', 'authenticated', 'staging-secretary-a@example.invalid', '', now(), '{}', '{}', now(), now()),
  ('51000000-0000-4000-8000-000000000004', 'authenticated', 'authenticated', 'staging-owner-a@example.invalid', '', now(), '{}', '{}', now(), now()),
  ('51000000-0000-4000-8000-000000000005', 'authenticated', 'authenticated', 'staging-owner-b@example.invalid', '', now(), '{}', '{}', now(), now());

insert into public.clinics (clinic_id, slug, display_name)
values
  ('52000000-0000-4000-8000-000000000001', 'staging-matrix-a', 'Synthetic Matrix Clinic A'),
  ('52000000-0000-4000-8000-000000000002', 'staging-matrix-b', 'Synthetic Matrix Clinic B');

insert into public.staff (staff_id, name, full_name, email, role, auth_user_id, clinic_id)
values
  ('53000000-0000-4000-8000-000000000001', 'Synthetic Vet A', 'Synthetic Vet A', 'staging-vet-a@example.invalid', 'vet', '51000000-0000-4000-8000-000000000001', '52000000-0000-4000-8000-000000000001'),
  ('53000000-0000-4000-8000-000000000002', 'Synthetic Vet B', 'Synthetic Vet B', 'staging-vet-b@example.invalid', 'vet', '51000000-0000-4000-8000-000000000002', '52000000-0000-4000-8000-000000000002'),
  ('53000000-0000-4000-8000-000000000003', 'Synthetic Secretary A', 'Synthetic Secretary A', 'staging-secretary-a@example.invalid', 'secretary', '51000000-0000-4000-8000-000000000003', '52000000-0000-4000-8000-000000000001');

insert into public.owners (owner_id, owner_first_name, owner_last_name, email, auth_user_id, clinic_id)
values
  ('staging-owner-a', 'Synthetic', 'Owner A', 'staging-owner-a@example.invalid', '51000000-0000-4000-8000-000000000004', '52000000-0000-4000-8000-000000000001'),
  ('staging-owner-b', 'Synthetic', 'Owner B', 'staging-owner-b@example.invalid', '51000000-0000-4000-8000-000000000005', '52000000-0000-4000-8000-000000000002');

insert into public.patients (pet_id, pet_name, species, owner_id, weight, clinic_id)
values
  (910001, 'Synthetic Pet A', 'dog', 'staging-owner-a', 7, '52000000-0000-4000-8000-000000000001'),
  (910002, 'Synthetic Pet B', 'cat', 'staging-owner-b', 8, '52000000-0000-4000-8000-000000000002');

insert into public.clinic_booking_hours
  (clinic_id, weekday, is_open, opens_at, closes_at, slot_minutes, max_bookings)
values
  ('52000000-0000-4000-8000-000000000001', 1, true, '08:00', '17:00', 30, 18),
  ('52000000-0000-4000-8000-000000000002', 1, true, '08:00', '17:00', 30, 18);

insert into public.appointments
  (appointment_id, clinic_id, pet_id, start_time, end_time, appointment_type, status)
overriding system value
values
  (920001, '52000000-0000-4000-8000-000000000001', 910001, '2030-01-07 08:00+00', '2030-01-07 08:30+00', 'full_exam', 'scheduled'),
  (920002, '52000000-0000-4000-8000-000000000002', 910002, '2030-01-07 09:00+00', '2030-01-07 09:30+00', 'full_exam', 'scheduled');

insert into public.documents
  (document_id, clinic_id, owner_id, pet_id, file_name, file_path, category, uploaded_by_role)
values
  (930001, '52000000-0000-4000-8000-000000000001', 'staging-owner-a', 910001, 'synthetic-a.pdf', '52000000-0000-4000-8000-000000000001/910001/medical/synthetic-a.pdf', 'medical_summary', 'system'),
  (930002, '52000000-0000-4000-8000-000000000002', 'staging-owner-b', 910002, 'synthetic-b.pdf', '52000000-0000-4000-8000-000000000002/910002/medical/synthetic-b.pdf', 'medical_summary', 'system');

insert into storage.objects (id, bucket_id, name, owner, metadata)
values
  ('94000000-0000-4000-8000-000000000001', 'documents', '52000000-0000-4000-8000-000000000001/910001/medical/synthetic-a.pdf', '51000000-0000-4000-8000-000000000001', '{}'),
  ('94000000-0000-4000-8000-000000000002', 'documents', '52000000-0000-4000-8000-000000000002/910002/medical/synthetic-b.pdf', '51000000-0000-4000-8000-000000000002', '{}');

insert into public.ai_operations
  (operation_id, clinic_id, capability, actor_user_id, actor_staff_id, owner_id, pet_id, status)
values
  ('95000000-0000-4000-8000-000000000001', '52000000-0000-4000-8000-000000000001', 'client_explanation', '51000000-0000-4000-8000-000000000001', '53000000-0000-4000-8000-000000000001', 'staging-owner-a', 910001, 'succeeded'),
  ('95000000-0000-4000-8000-000000000002', '52000000-0000-4000-8000-000000000002', 'client_explanation', '51000000-0000-4000-8000-000000000002', '53000000-0000-4000-8000-000000000002', 'staging-owner-b', 910002, 'succeeded');

insert into public.ai_artifacts
  (artifact_id, clinic_id, operation_id, owner_id, pet_id, artifact_type, status,
   content, approved_by, approved_at, released_to_owner, released_at)
values
  ('96000000-0000-4000-8000-000000000001', '52000000-0000-4000-8000-000000000001', '95000000-0000-4000-8000-000000000001', 'staging-owner-a', 910001, 'client_explanation', 'draft', '{}', null, null, false, null),
  ('96000000-0000-4000-8000-000000000002', '52000000-0000-4000-8000-000000000001', '95000000-0000-4000-8000-000000000001', 'staging-owner-a', 910001, 'client_explanation', 'approved', '{}', '53000000-0000-4000-8000-000000000001', now(), true, now()),
  ('96000000-0000-4000-8000-000000000003', '52000000-0000-4000-8000-000000000001', '95000000-0000-4000-8000-000000000001', 'staging-owner-a', 910001, 'transcript', 'approved', '{}', '53000000-0000-4000-8000-000000000001', now(), false, null),
  ('96000000-0000-4000-8000-000000000004', '52000000-0000-4000-8000-000000000002', '95000000-0000-4000-8000-000000000002', 'staging-owner-b', 910002, 'client_explanation', 'approved', '{}', '53000000-0000-4000-8000-000000000002', now(), true, now());

set local role authenticated;
select set_config('request.jwt.claim.role', 'authenticated', true);
select set_config('request.jwt.claim.sub', '51000000-0000-4000-8000-000000000001', true);

do $$
begin
  if (select count(*) from public.patients) <> 1
    or exists (select 1 from public.patients where clinic_id = '52000000-0000-4000-8000-000000000002') then
    raise exception 'VET_A_PATIENT_ISOLATION_FAILED';
  end if;
  if (select count(*) from public.appointments) <> 1
    or exists (select 1 from public.appointments where appointment_id = 920002) then
    raise exception 'VET_A_APPOINTMENT_ISOLATION_FAILED';
  end if;
  if (select count(*) from public.ai_artifacts) <> 3
    or exists (select 1 from public.ai_artifacts where clinic_id = '52000000-0000-4000-8000-000000000002') then
    raise exception 'VET_A_AI_ISOLATION_FAILED';
  end if;
  if (select count(*) from storage.objects where bucket_id = 'documents') <> 1
    or exists (select 1 from storage.objects where name like '52000000-0000-4000-8000-000000000002/%') then
    raise exception 'VET_A_STORAGE_ISOLATION_FAILED';
  end if;
end;
$$;

select set_config('request.jwt.claim.sub', '51000000-0000-4000-8000-000000000003', true);
do $$
begin
  if (select count(*) from public.patients) <> 1 then
    raise exception 'SECRETARY_PATIENT_ACCESS_FAILED';
  end if;
  if (select count(*) from public.ai_artifacts) <> 0 then
    raise exception 'SECRETARY_AI_DRAFT_ACCESS_FAILED';
  end if;
  if (select count(*) from storage.objects where bucket_id = 'documents') <> 0 then
    raise exception 'SECRETARY_CLINICAL_STORAGE_ACCESS_FAILED';
  end if;
end;
$$;

select set_config('request.jwt.claim.sub', '51000000-0000-4000-8000-000000000004', true);
do $$
declare
  protected_count integer;
begin
  if (select count(*) from public.owners) <> 1
    or (select owner_id from public.owners limit 1) <> 'staging-owner-a' then
    raise exception 'OWNER_A_PROFILE_ISOLATION_FAILED';
  end if;
  if (select count(*) from public.patients) <> 1
    or exists (select 1 from public.patients where pet_id = 910002) then
    raise exception 'OWNER_A_PATIENT_ISOLATION_FAILED';
  end if;
  if (select count(*) from public.ai_artifacts) <> 1
    or not exists (select 1 from public.ai_artifacts where artifact_id = '96000000-0000-4000-8000-000000000002')
    or exists (select 1 from public.ai_artifacts where artifact_type = 'transcript' or status = 'draft') then
    raise exception 'OWNER_A_RELEASED_ARTIFACT_FILTER_FAILED';
  end if;
  if (select count(*) from storage.objects where bucket_id = 'documents') <> 1
    or exists (select 1 from storage.objects where name like '52000000-0000-4000-8000-000000000002/%') then
    raise exception 'OWNER_A_STORAGE_ISOLATION_FAILED';
  end if;
  begin
    select count(*) into protected_count from public.ai_audit_events;
    if protected_count <> 0 then
      raise exception 'OWNER_A_AUDIT_ACCESS_FAILED';
    end if;
  exception when insufficient_privilege then
    null;
  end;
  begin
    select count(*) into protected_count from public.ai_document_chunks;
    if protected_count <> 0 then
      raise exception 'OWNER_A_RAW_CHUNK_ACCESS_FAILED';
    end if;
  exception when insufficient_privilege then
    null;
  end;
end;
$$;

select set_config('request.jwt.claim.sub', '51000000-0000-4000-8000-000000000005', true);
do $$
begin
  if (select count(*) from public.patients) <> 1
    or exists (select 1 from public.patients where pet_id = 910001) then
    raise exception 'OWNER_B_PATIENT_ISOLATION_FAILED';
  end if;
  if (select count(*) from public.ai_artifacts) <> 1
    or not exists (select 1 from public.ai_artifacts where artifact_id = '96000000-0000-4000-8000-000000000004') then
    raise exception 'OWNER_B_RELEASED_ARTIFACT_FILTER_FAILED';
  end if;
end;
$$;

reset role;
rollback;

do $$
begin
  if exists (select 1 from public.clinics where slug like 'staging-matrix-%')
    or exists (select 1 from auth.users where email like 'staging-%@example.invalid')
    or exists (select 1 from storage.objects where name like '52000000-0000-4000-8000-00000000000%/%') then
    raise exception 'STAGING_ROLE_MATRIX_CLEANUP_FAILED';
  end if;
end;
$$;

select 'staging_role_matrix_passed' as result;
