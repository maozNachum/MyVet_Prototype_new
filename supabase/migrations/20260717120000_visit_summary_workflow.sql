-- Stage 3: atomic workflow for AI-generated visit-summary drafts.
-- Generation can only create a protected draft. Only an authenticated active
-- veterinarian may create an edited/approved/rejected version.

create or replace function private.myvet_is_valid_visit_summary(candidate jsonb)
returns boolean
language plpgsql
immutable
set search_path = ''
as $$
declare
  field_name text;
  item jsonb;
  list_fields text[] := array[
    'symptoms', 'relevant_history', 'examination_findings', 'tests', 'treatments',
    'medications', 'follow_up', 'warnings', 'unresolved_items'
  ];
  allowed_fields text[] := array[
    'chief_complaint', 'symptoms', 'relevant_history', 'examination_findings',
    'tests', 'clinical_assessment', 'treatments', 'medications', 'follow_up',
    'warnings', 'unresolved_items', 'source_references'
  ];
begin
  if jsonb_typeof(candidate) <> 'object'
    or (select count(*) from jsonb_object_keys(candidate)) <> cardinality(allowed_fields)
    or exists (select 1 from jsonb_object_keys(candidate) as key where not (key = any(allowed_fields))) then
    return false;
  end if;

  if jsonb_typeof(candidate -> 'chief_complaint') <> 'string'
    or char_length(candidate ->> 'chief_complaint') > 2000
    or jsonb_typeof(candidate -> 'clinical_assessment') <> 'string'
    or char_length(candidate ->> 'clinical_assessment') > 4000 then
    return false;
  end if;

  foreach field_name in array list_fields loop
    if jsonb_typeof(candidate -> field_name) <> 'array'
      or jsonb_array_length(candidate -> field_name) > 20 then
      return false;
    end if;
    for item in select value from jsonb_array_elements(candidate -> field_name) loop
      if jsonb_typeof(item) <> 'string' or char_length(item #>> '{}') > 700 then
        return false;
      end if;
    end loop;
  end loop;

  if jsonb_typeof(candidate -> 'source_references') <> 'array'
    or jsonb_array_length(candidate -> 'source_references') > 6
    or exists (
      select 1 from jsonb_array_elements_text(candidate -> 'source_references') as source(value)
      where source.value not in (
        'medical_visit', 'physical_exam', 'medical_problems',
        'differential_diagnoses', 'prescriptions', 'lab_orders'
      )
    ) then
    return false;
  end if;

  return true;
exception when others then
  return false;
end;
$$;

create or replace function public.myvet_create_visit_summary_draft(
  requested_actor_user_id uuid,
  requested_visit_id bigint,
  requested_content jsonb,
  requested_request_id uuid,
  requested_provider text,
  requested_model_version text,
  requested_prompt_version text,
  requested_latency_ms integer,
  requested_input_tokens integer,
  requested_output_tokens integer
)
returns table(artifact_id uuid, status text, content jsonb, version_number integer)
language plpgsql
security definer
set search_path = ''
as $$
declare
  target_clinic_id uuid;
  target_pet_id bigint;
  target_owner_id text;
  actor_staff_id uuid;
  new_operation_id uuid;
  new_artifact_id uuid;
  next_version integer;
  existing_record record;
begin
  if requested_actor_user_id is null or requested_visit_id is null
    or requested_request_id is null
    or not private.myvet_is_valid_visit_summary(requested_content) then
    raise exception 'VISIT_SUMMARY_INPUT_INVALID';
  end if;

  select visit.clinic_id, visit.pet_id, pet.owner_id, staff.staff_id
  into target_clinic_id, target_pet_id, target_owner_id, actor_staff_id
  from public.medical_visits as visit
  join public.patients as pet
    on pet.clinic_id = visit.clinic_id and pet.pet_id = visit.pet_id
  join public.staff as staff
    on staff.clinic_id = visit.clinic_id
   and staff.auth_user_id = requested_actor_user_id
   and staff.is_active = true
   and staff.role = 'vet'
  where visit.visit_id = requested_visit_id;

  if target_clinic_id is null then raise exception 'VISIT_SUMMARY_ACCESS_DENIED'; end if;
  if exists (
    select 1 from public.ai_feature_flags
    where clinic_id = target_clinic_id and capability = 'visit_summary'
      and (not enabled or kill_switch)
  ) then
    raise exception 'AI_FEATURE_DISABLED';
  end if;

  perform pg_advisory_xact_lock(hashtextextended('visit-summary:' || requested_visit_id::text, 0));

  select artifact.artifact_id, artifact.status, artifact.content, artifact.version_number
  into existing_record
  from public.ai_artifacts as artifact
  where artifact.clinic_id = target_clinic_id
    and artifact.visit_id = requested_visit_id
    and artifact.artifact_type = 'visit_summary'
    and artifact.status in ('generating', 'draft', 'edited')
    and artifact.deleted_at is null
  order by artifact.version_number desc
  limit 1;

  if existing_record.artifact_id is not null then
    return query select existing_record.artifact_id, existing_record.status,
      existing_record.content, existing_record.version_number;
    return;
  end if;

  insert into public.ai_operations(
    clinic_id, capability, actor_user_id, actor_staff_id, owner_id, pet_id, visit_id,
    status, idempotency_key, provider, model_version, prompt_version, schema_version,
    latency_ms, input_tokens, output_tokens, started_at, completed_at
  ) values (
    target_clinic_id, 'visit_summary', requested_actor_user_id, actor_staff_id,
    target_owner_id, target_pet_id, requested_visit_id, 'succeeded',
    'visit-summary:' || requested_request_id::text, left(requested_provider, 80),
    left(requested_model_version, 120), left(requested_prompt_version, 120),
    '2026-07-17.1', greatest(requested_latency_ms, 0),
    greatest(requested_input_tokens, 0), greatest(requested_output_tokens, 0), now(), now()
  )
  on conflict (clinic_id, capability, idempotency_key) where idempotency_key is not null
  do update set updated_at = public.ai_operations.updated_at
  returning operation_id into new_operation_id;

  select coalesce(max(artifact.version_number), 0) + 1 into next_version
  from public.ai_artifacts as artifact
  where artifact.clinic_id = target_clinic_id
    and artifact.visit_id = requested_visit_id
    and artifact.artifact_type = 'visit_summary';

  insert into public.ai_artifacts(
    clinic_id, operation_id, owner_id, pet_id, visit_id, artifact_type, status,
    content, created_by, model_version, prompt_version, version_number
  ) values (
    target_clinic_id, new_operation_id, target_owner_id, target_pet_id,
    requested_visit_id, 'visit_summary', 'draft', requested_content,
    requested_actor_user_id, left(requested_model_version, 120),
    left(requested_prompt_version, 120), next_version
  ) returning public.ai_artifacts.artifact_id into new_artifact_id;

  insert into public.ai_sources(
    clinic_id, artifact_id, source_type, source_record_id
  ) values (target_clinic_id, new_artifact_id, 'medical_visit', requested_visit_id::text);

  insert into public.ai_approval_history(
    clinic_id, artifact_id, action, actor_user_id, actor_staff_id,
    previous_status, new_status, change_summary
  ) values (
    target_clinic_id, new_artifact_id, 'submitted', requested_actor_user_id,
    actor_staff_id, null, 'draft', jsonb_build_object('generated_by_ai', true)
  );

  insert into public.ai_audit_events(
    clinic_id, actor_user_id, operation_id, capability, event_type, outcome,
    provider, model_version, prompt_version, schema_version, latency_ms,
    input_tokens, output_tokens
  ) values (
    target_clinic_id, requested_actor_user_id, new_operation_id, 'visit_summary',
    'draft_created', 'success', left(requested_provider, 80),
    left(requested_model_version, 120), left(requested_prompt_version, 120),
    '2026-07-17.1', greatest(requested_latency_ms, 0),
    greatest(requested_input_tokens, 0), greatest(requested_output_tokens, 0)
  );

  return query select new_artifact_id, 'draft'::text, requested_content, next_version;
end;
$$;

create or replace function public.myvet_record_visit_summary_failure(
  requested_actor_user_id uuid,
  requested_visit_id bigint,
  requested_request_id uuid,
  requested_provider text,
  requested_model_version text,
  requested_prompt_version text,
  requested_error_code text,
  requested_latency_ms integer
)
returns void
language plpgsql
security definer
set search_path = ''
as $$
declare
  target_clinic_id uuid;
  target_pet_id bigint;
  target_owner_id text;
  actor_staff_id uuid;
  failed_operation_id uuid;
begin
  select visit.clinic_id, visit.pet_id, pet.owner_id, staff.staff_id
  into target_clinic_id, target_pet_id, target_owner_id, actor_staff_id
  from public.medical_visits as visit
  join public.patients as pet on pet.clinic_id = visit.clinic_id and pet.pet_id = visit.pet_id
  join public.staff as staff on staff.clinic_id = visit.clinic_id
    and staff.auth_user_id = requested_actor_user_id and staff.is_active and staff.role = 'vet'
  where visit.visit_id = requested_visit_id;
  if target_clinic_id is null then return; end if;

  insert into public.ai_operations(
    clinic_id, capability, actor_user_id, actor_staff_id, owner_id, pet_id, visit_id,
    status, idempotency_key, provider, model_version, prompt_version, schema_version,
    latency_ms, error_code, started_at, completed_at
  ) values (
    target_clinic_id, 'visit_summary', requested_actor_user_id, actor_staff_id,
    target_owner_id, target_pet_id, requested_visit_id, 'failed',
    'visit-summary:' || requested_request_id::text, left(requested_provider, 80),
    left(requested_model_version, 120), left(requested_prompt_version, 120),
    '2026-07-17.1', greatest(requested_latency_ms, 0),
    case when requested_error_code ~ '^[A-Z0-9_]{1,80}$' then requested_error_code else 'AI_PROVIDER_UNAVAILABLE' end,
    now(), now()
  )
  on conflict (clinic_id, capability, idempotency_key) where idempotency_key is not null
  do nothing returning operation_id into failed_operation_id;

  if failed_operation_id is not null then
    insert into public.ai_audit_events(
      clinic_id, actor_user_id, operation_id, capability, event_type, outcome,
      provider, model_version, prompt_version, schema_version, latency_ms, error_code
    ) values (
      target_clinic_id, requested_actor_user_id, failed_operation_id, 'visit_summary',
      'provider_failed', 'failed', left(requested_provider, 80),
      left(requested_model_version, 120), left(requested_prompt_version, 120),
      '2026-07-17.1', greatest(requested_latency_ms, 0),
      case when requested_error_code ~ '^[A-Z0-9_]{1,80}$' then requested_error_code else 'AI_PROVIDER_UNAVAILABLE' end
    );
  end if;
end;
$$;

create or replace function public.myvet_transition_visit_summary(
  requested_artifact_id uuid,
  requested_action text,
  requested_content jsonb default null,
  requested_rejection_reason text default null
)
returns table(artifact_id uuid, status text, content jsonb, version_number integer)
language plpgsql
security definer
set search_path = ''
as $$
declare
  current_record record;
  actor_staff_id uuid;
  next_status text;
  next_action text;
  next_artifact_id uuid;
  next_version integer;
  next_content jsonb;
begin
  if (select auth.uid()) is null or requested_action not in ('save', 'approve', 'reject') then
    raise exception 'VISIT_SUMMARY_ACTION_INVALID';
  end if;

  select artifact.* into current_record
  from public.ai_artifacts as artifact
  join public.staff as staff on staff.clinic_id = artifact.clinic_id
    and staff.auth_user_id = (select auth.uid()) and staff.is_active and staff.role = 'vet'
  where artifact.artifact_id = requested_artifact_id
    and artifact.artifact_type = 'visit_summary'
    and artifact.deleted_at is null
  for update of artifact;

  if current_record.artifact_id is null then raise exception 'VISIT_SUMMARY_ACCESS_DENIED'; end if;
  select staff.staff_id into actor_staff_id
  from public.staff as staff
  where staff.clinic_id = current_record.clinic_id
    and staff.auth_user_id = (select auth.uid())
    and staff.is_active and staff.role = 'vet';
  if current_record.status not in ('draft', 'edited') then raise exception 'VISIT_SUMMARY_NOT_EDITABLE'; end if;
  if exists (
    select 1 from public.ai_artifacts as newer
    where newer.clinic_id = current_record.clinic_id
      and newer.visit_id = current_record.visit_id
      and newer.artifact_type = 'visit_summary'
      and newer.version_number > current_record.version_number
      and newer.deleted_at is null
  ) then raise exception 'VISIT_SUMMARY_VERSION_CONFLICT'; end if;
  if exists (
    select 1 from public.ai_feature_flags
    where clinic_id = current_record.clinic_id and capability = 'visit_summary'
      and (not enabled or kill_switch)
  ) then raise exception 'AI_FEATURE_DISABLED'; end if;

  perform pg_advisory_xact_lock(hashtextextended('visit-summary:' || current_record.visit_id::text, 0));
  next_content := coalesce(requested_content, current_record.content);
  if requested_action in ('save', 'approve') and not private.myvet_is_valid_visit_summary(next_content) then
    raise exception 'VISIT_SUMMARY_INPUT_INVALID';
  end if;
  if requested_action = 'reject' and char_length(coalesce(requested_rejection_reason, '')) > 500 then
    raise exception 'VISIT_SUMMARY_REJECTION_TOO_LONG';
  end if;

  next_status := case requested_action when 'save' then 'edited' when 'approve' then 'approved' else 'rejected' end;
  next_action := case requested_action when 'save' then 'edited' when 'approve' then 'approved' else 'rejected' end;
  next_version := current_record.version_number + 1;

  update public.ai_artifacts set status = 'superseded', updated_at = now()
  where public.ai_artifacts.artifact_id = current_record.artifact_id;

  insert into public.ai_artifacts(
    clinic_id, operation_id, owner_id, pet_id, visit_id, appointment_id,
    artifact_type, status, content, created_by, approved_by, approved_at,
    model_version, prompt_version, version_number, supersedes_artifact_id
  ) values (
    current_record.clinic_id, current_record.operation_id, current_record.owner_id,
    current_record.pet_id, current_record.visit_id, current_record.appointment_id,
    'visit_summary', next_status, next_content, (select auth.uid()),
    case when requested_action = 'approve' then actor_staff_id else null end,
    case when requested_action = 'approve' then now() else null end,
    current_record.model_version, current_record.prompt_version, next_version,
    current_record.artifact_id
  ) returning public.ai_artifacts.artifact_id into next_artifact_id;

  insert into public.ai_approval_history(
    clinic_id, artifact_id, action, actor_user_id, actor_staff_id,
    previous_status, new_status, change_summary
  ) values (
    current_record.clinic_id, next_artifact_id, next_action, (select auth.uid()),
    actor_staff_id, current_record.status, next_status,
    case when requested_action = 'reject'
      then jsonb_build_object('rejection_reason', left(coalesce(requested_rejection_reason, ''), 500))
      else jsonb_build_object('content_reviewed', true)
    end
  );

  insert into public.ai_audit_events(
    clinic_id, actor_user_id, operation_id, capability, event_type, outcome,
    model_version, prompt_version, schema_version
  ) values (
    current_record.clinic_id, (select auth.uid()), current_record.operation_id,
    'visit_summary', 'approval_recorded', 'success', current_record.model_version,
    current_record.prompt_version, '2026-07-17.1'
  );

  return query select next_artifact_id, next_status, next_content, next_version;
end;
$$;

revoke all on function private.myvet_is_valid_visit_summary(jsonb) from public, anon, authenticated, service_role;
revoke all on function public.myvet_create_visit_summary_draft(uuid,bigint,jsonb,uuid,text,text,text,integer,integer,integer) from public, anon, authenticated;
revoke all on function public.myvet_record_visit_summary_failure(uuid,bigint,uuid,text,text,text,text,integer) from public, anon, authenticated;
revoke all on function public.myvet_transition_visit_summary(uuid,text,jsonb,text) from public, anon;

grant execute on function public.myvet_create_visit_summary_draft(uuid,bigint,jsonb,uuid,text,text,text,integer,integer,integer) to service_role;
grant execute on function public.myvet_record_visit_summary_failure(uuid,bigint,uuid,text,text,text,text,integer) to service_role;
grant execute on function public.myvet_transition_visit_summary(uuid,text,jsonb,text) to authenticated, service_role;

comment on function public.myvet_transition_visit_summary(uuid,text,jsonb,text) is
  'Stage 3: creates immutable reviewed versions. Approval is veterinarian-only and never occurs during AI generation.';
