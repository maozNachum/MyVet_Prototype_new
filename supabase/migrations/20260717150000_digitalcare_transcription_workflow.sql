-- Stage 4: secure DigitalCare capture/transcription workflow.
-- All three capabilities are disabled by default. Existing video sessions keep
-- working when this migration is present or when every AI flag is disabled.

alter table public.video_sessions
  add column if not exists appointment_id bigint,
  add column if not exists visit_id bigint,
  add column if not exists transcription_status text not null default 'idle',
  add column if not exists recording_status text not null default 'disabled',
  add column if not exists recording_document_id uuid,
  add column if not exists transcript_artifact_id uuid,
  add column if not exists consent_notice_version text,
  add column if not exists ai_updated_at timestamptz;

do $$
begin
  if not exists (select 1 from pg_constraint where conname = 'video_sessions_clinic_session_key') then
    alter table public.video_sessions add constraint video_sessions_clinic_session_key unique (clinic_id, session_id);
  end if;
  if not exists (select 1 from pg_constraint where conname = 'video_sessions_appointment_fkey') then
    alter table public.video_sessions add constraint video_sessions_appointment_fkey
      foreign key (clinic_id, appointment_id)
      references public.appointments(clinic_id, appointment_id) on delete restrict;
  end if;
  if not exists (select 1 from pg_constraint where conname = 'video_sessions_visit_fkey') then
    alter table public.video_sessions add constraint video_sessions_visit_fkey
      foreign key (clinic_id, visit_id)
      references public.medical_visits(clinic_id, visit_id) on delete restrict;
  end if;
  if not exists (select 1 from pg_constraint where conname = 'video_sessions_recording_document_fkey') then
    alter table public.video_sessions add constraint video_sessions_recording_document_fkey
      foreign key (clinic_id, recording_document_id)
      references public.ai_documents(clinic_id, document_id) on delete restrict;
  end if;
  if not exists (select 1 from pg_constraint where conname = 'video_sessions_transcript_artifact_fkey') then
    alter table public.video_sessions add constraint video_sessions_transcript_artifact_fkey
      foreign key (clinic_id, transcript_artifact_id)
      references public.ai_artifacts(clinic_id, artifact_id) on delete restrict;
  end if;
  if not exists (select 1 from pg_constraint where conname = 'video_sessions_transcription_status_check') then
    alter table public.video_sessions add constraint video_sessions_transcription_status_check
      check (transcription_status in ('idle','consent_pending','capturing','processing','ready','failed','deleted'));
  end if;
  if not exists (select 1 from pg_constraint where conname = 'video_sessions_recording_status_check') then
    alter table public.video_sessions add constraint video_sessions_recording_status_check
      check (recording_status in ('disabled','consent_pending','recording','stored','failed','deleted'));
  end if;
end $$;

create index if not exists video_sessions_appointment_idx
  on public.video_sessions (clinic_id, appointment_id) where appointment_id is not null;
create index if not exists video_sessions_transcription_status_idx
  on public.video_sessions (clinic_id, transcription_status, ai_updated_at desc);

alter table public.ai_consent_records
  add column if not exists appointment_id bigint,
  add column if not exists video_session_id bigint;

do $$
begin
  if not exists (select 1 from pg_constraint where conname = 'ai_consent_records_appointment_fkey') then
    alter table public.ai_consent_records add constraint ai_consent_records_appointment_fkey
      foreign key (clinic_id, appointment_id)
      references public.appointments(clinic_id, appointment_id) on delete restrict;
  end if;
  if not exists (select 1 from pg_constraint where conname = 'ai_consent_records_video_session_fkey') then
    alter table public.ai_consent_records add constraint ai_consent_records_video_session_fkey
      foreign key (clinic_id, video_session_id)
      references public.video_sessions(clinic_id, session_id) on delete restrict;
  end if;
end $$;

drop index if exists public.ai_consent_records_one_active_idx;
create unique index if not exists ai_consent_records_one_active_context_idx
  on public.ai_consent_records (
    clinic_id, owner_id, purpose,
    coalesce(appointment_id, 0), coalesce(video_session_id, 0)
  ) where status = 'granted';
create index if not exists ai_consent_records_session_idx
  on public.ai_consent_records (clinic_id, video_session_id, purpose, created_at desc)
  where video_session_id is not null;

-- Extend only the Stage 2 registries needed by Stage 4.
alter table public.ai_operations drop constraint if exists ai_operations_capability_check;
alter table public.ai_operations add constraint ai_operations_capability_check check (capability in (
  'vetbot', 'visit_summary', 'digitalcare_transcription', 'digitalcare_recording',
  'digitalcare_summary', 'record_qa', 'document_ocr', 'client_explanation',
  'reminder_suggestion'
));

alter table public.ai_feature_flags drop constraint if exists ai_feature_flags_capability_check;
alter table public.ai_feature_flags add constraint ai_feature_flags_capability_check check (capability in (
  'vetbot', 'vetbot_actions', 'appointment_actions', 'visit_summary',
  'digitalcare_transcription', 'digitalcare_recording', 'digitalcare_summary',
  'record_qa', 'document_ocr', 'client_explanation', 'reminder_suggestion'
));

alter table public.ai_audit_events drop constraint if exists ai_audit_events_event_type_check;
alter table public.ai_audit_events add constraint ai_audit_events_event_type_check check (event_type in (
  'request_received', 'provider_completed', 'provider_failed', 'output_rejected',
  'draft_created', 'approval_recorded', 'release_recorded', 'access_denied',
  'rate_limited', 'feature_disabled', 'consent_recorded', 'capture_started',
  'capture_stopped', 'transcript_created', 'file_accessed', 'retention_deleted'
));

insert into public.ai_feature_flags (clinic_id, capability, enabled, kill_switch, configuration)
select clinic.clinic_id, capability.name, false, false, capability.configuration
from public.clinics as clinic
cross join (values
  ('digitalcare_transcription'::text, '{"retention_days":30}'::jsonb),
  ('digitalcare_recording'::text, '{"retention_days":7,"max_bytes":10485760}'::jsonb),
  ('digitalcare_summary'::text, '{"requires_veterinarian_approval":true}'::jsonb)
) as capability(name, configuration)
on conflict (clinic_id, capability) do nothing;

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
    or char_length(candidate ->> 'clinical_assessment') > 4000 then return false; end if;
  foreach field_name in array list_fields loop
    if jsonb_typeof(candidate -> field_name) <> 'array'
      or jsonb_array_length(candidate -> field_name) > 20 then return false; end if;
    for item in select value from jsonb_array_elements(candidate -> field_name) loop
      if jsonb_typeof(item) <> 'string' or char_length(item #>> '{}') > 700 then return false; end if;
    end loop;
  end loop;
  if jsonb_typeof(candidate -> 'source_references') <> 'array'
    or jsonb_array_length(candidate -> 'source_references') > 6
    or exists (
      select 1 from jsonb_array_elements_text(candidate -> 'source_references') as source(value)
      where source.value not in (
        'medical_visit', 'physical_exam', 'medical_problems',
        'differential_diagnoses', 'prescriptions', 'lab_orders',
        'digitalcare_transcript'
      )
    ) then return false; end if;
  return true;
exception when others then return false;
end;
$$;

create or replace function public.myvet_begin_digitalcare_capture(
  requested_actor_user_id uuid,
  requested_video_session_id bigint,
  requested_appointment_id bigint,
  requested_notice_version text,
  requested_transcription_consent boolean,
  requested_recording_consent boolean,
  requested_recording_enabled boolean,
  requested_object_path text,
  requested_mime_type text,
  requested_size_limit bigint
)
returns table(
  clinic_id uuid, pet_id bigint, owner_id text, appointment_id bigint,
  video_session_id bigint, recording_document_id uuid, object_path text,
  recording_retention_until timestamptz
)
language plpgsql
security definer
set search_path = ''
as $$
declare
  target record;
  target_document_id uuid;
  retention_days integer;
  operation_id uuid;
begin
  if requested_actor_user_id is null or requested_video_session_id is null
    or requested_appointment_id is null or requested_transcription_consent is not true
    or char_length(coalesce(requested_notice_version, '')) not between 1 and 80 then
    raise exception 'DIGITALCARE_CONSENT_REQUIRED';
  end if;
  if requested_recording_enabled and requested_recording_consent is not true then
    raise exception 'DIGITALCARE_RECORDING_CONSENT_REQUIRED';
  end if;

  select session.clinic_id, session.session_id, session.appointment_id as linked_appointment_id,
    session.owner_id, session.pet_id, appointment.appointment_id,
    appointment.appointment_mode, staff.staff_id
  into target
  from public.video_sessions as session
  join public.appointments as appointment
    on appointment.clinic_id = session.clinic_id
   and appointment.appointment_id = requested_appointment_id
   and appointment.pet_id = session.pet_id
  join public.patients as pet
    on pet.clinic_id = session.clinic_id and pet.pet_id = session.pet_id
   and pet.owner_id = session.owner_id
  join public.staff as staff
    on staff.clinic_id = session.clinic_id
   and staff.auth_user_id = requested_actor_user_id
   and staff.is_active = true and staff.role = 'vet'
  where session.session_id = requested_video_session_id
    and session.status in ('scheduled','active','completed');

  if target.clinic_id is null or lower(coalesce(target.appointment_mode, '')) <> 'video'
    or (target.linked_appointment_id is not null and target.linked_appointment_id <> requested_appointment_id) then
    raise exception 'DIGITALCARE_ACCESS_DENIED';
  end if;
  if not exists (
    select 1 from public.ai_feature_flags
    where ai_feature_flags.clinic_id = target.clinic_id
      and capability = 'digitalcare_transcription' and enabled and not kill_switch
  ) then raise exception 'AI_FEATURE_DISABLED'; end if;
  if requested_recording_enabled and not exists (
    select 1 from public.ai_feature_flags
    where ai_feature_flags.clinic_id = target.clinic_id
      and capability = 'digitalcare_recording' and enabled and not kill_switch
  ) then raise exception 'AI_FEATURE_DISABLED'; end if;

  perform pg_advisory_xact_lock(hashtextextended('digitalcare:' || requested_video_session_id::text, 0));
  update public.video_sessions set appointment_id = requested_appointment_id,
    transcription_status = 'capturing',
    recording_status = case when requested_recording_enabled then 'recording' else 'disabled' end,
    consent_notice_version = requested_notice_version, ai_updated_at = now()
  where session_id = requested_video_session_id;

  insert into public.ai_consent_records(
    clinic_id, owner_id, purpose, notice_version, status, capture_source,
    granted_at, created_by, appointment_id, video_session_id
  ) values (
    target.clinic_id, target.owner_id, 'transcription', requested_notice_version,
    'granted', 'staff_assisted', now(), requested_actor_user_id,
    requested_appointment_id, requested_video_session_id
  ) on conflict do nothing;
  if requested_recording_enabled then
    insert into public.ai_consent_records(
      clinic_id, owner_id, purpose, notice_version, status, capture_source,
      granted_at, created_by, appointment_id, video_session_id
    ) values (
      target.clinic_id, target.owner_id, 'recording', requested_notice_version,
      'granted', 'staff_assisted', now(), requested_actor_user_id,
      requested_appointment_id, requested_video_session_id
    ) on conflict do nothing;
  end if;

  if requested_object_path !~ ('^' || target.clinic_id::text || '/' || target.pet_id::text || '/digitalcare/[0-9]+/[0-9a-f-]+[.]webm$')
    or requested_mime_type not in ('audio/webm','audio/ogg','audio/mp4','audio/mpeg','audio/wav')
    or requested_size_limit not between 1 and 10485760 then
    raise exception 'DIGITALCARE_STORAGE_INPUT_INVALID';
  end if;
  if requested_recording_enabled then
    select greatest(1, least(30, coalesce((configuration ->> 'retention_days')::integer, 7)))
      into retention_days from public.ai_feature_flags
      where ai_feature_flags.clinic_id = target.clinic_id and capability = 'digitalcare_recording';
  end if;
  insert into public.ai_documents(
    clinic_id, owner_id, pet_id, appointment_id, document_kind, bucket_id,
    object_path, mime_type, size_bytes, status, uploaded_by, retention_until
  ) values (
    target.clinic_id, target.owner_id, target.pet_id, requested_appointment_id,
    case when requested_recording_enabled then 'recording' else 'transcript_source' end,
    'ai-recordings', requested_object_path, requested_mime_type,
    requested_size_limit, 'pending', requested_actor_user_id,
    now() + make_interval(days => case when requested_recording_enabled then coalesce(retention_days, 7) else 1 end)
  ) returning document_id into target_document_id;
  update public.video_sessions set recording_document_id = target_document_id
    where session_id = requested_video_session_id;

  insert into public.ai_operations(
    clinic_id, capability, actor_user_id, actor_staff_id, owner_id, pet_id,
    appointment_id, status, idempotency_key, started_at
  ) values (
    target.clinic_id, case when requested_recording_enabled then 'digitalcare_recording' else 'digitalcare_transcription' end,
    requested_actor_user_id, target.staff_id, target.owner_id, target.pet_id,
    requested_appointment_id, 'running', 'digitalcare-capture:' || requested_video_session_id::text,
    now()
  ) on conflict (clinic_id, capability, idempotency_key) where idempotency_key is not null
    do update set updated_at = now() returning public.ai_operations.operation_id into operation_id;
  insert into public.ai_audit_events(
    clinic_id, actor_user_id, operation_id, capability, event_type, outcome
  ) values
    (target.clinic_id, requested_actor_user_id, operation_id, 'digitalcare_transcription', 'consent_recorded', 'success'),
    (target.clinic_id, requested_actor_user_id, operation_id, 'digitalcare_transcription', 'capture_started', 'success');

  return query select target.clinic_id, target.pet_id, target.owner_id,
    requested_appointment_id, requested_video_session_id, target_document_id,
    requested_object_path,
    (select retention_until from public.ai_documents where document_id = target_document_id);
end;
$$;

create or replace function public.myvet_complete_digitalcare_transcript(
  requested_actor_user_id uuid,
  requested_video_session_id bigint,
  requested_transcript text,
  requested_language text,
  requested_request_id uuid,
  requested_provider text,
  requested_model_version text,
  requested_latency_ms integer,
  requested_input_tokens integer,
  requested_output_tokens integer
)
returns table(artifact_id uuid, status text, content jsonb, visit_id bigint)
language plpgsql
security definer
set search_path = ''
as $$
declare
  target record;
  operation_id uuid;
  transcript_id uuid;
  transcript_content jsonb;
  retention_days integer;
  existing_id uuid;
begin
  if requested_actor_user_id is null or requested_request_id is null
    or char_length(trim(coalesce(requested_transcript, ''))) not between 1 and 300000
    or char_length(coalesce(requested_language, '')) not between 2 and 20 then
    raise exception 'DIGITALCARE_TRANSCRIPT_INVALID';
  end if;
  select session.*, staff.staff_id into target
  from public.video_sessions as session
  join public.staff as staff on staff.clinic_id = session.clinic_id
    and staff.auth_user_id = requested_actor_user_id and staff.is_active and staff.role = 'vet'
  where session.session_id = requested_video_session_id
    and session.appointment_id is not null
    and session.transcription_status in ('capturing','processing','ready');
  if target.clinic_id is null or not exists (
    select 1 from public.ai_consent_records
    where clinic_id = target.clinic_id and owner_id = target.owner_id
      and purpose = 'transcription' and status = 'granted'
      and appointment_id = target.appointment_id and video_session_id = target.session_id
  ) then raise exception 'DIGITALCARE_ACCESS_DENIED'; end if;

  perform pg_advisory_xact_lock(hashtextextended('digitalcare-transcript:' || requested_video_session_id::text, 0));
  select source.artifact_id into existing_id from public.ai_sources as source
    join public.ai_artifacts as artifact on artifact.clinic_id = source.clinic_id and artifact.artifact_id = source.artifact_id
    where source.clinic_id = target.clinic_id and source.source_type = 'digitalcare'
      and source.source_record_id = 'transcript:' || requested_video_session_id::text
      and artifact.artifact_type = 'transcript' and artifact.deleted_at is null limit 1;
  if existing_id is not null then
    return query select artifact.artifact_id, artifact.status, artifact.content, artifact.visit_id
      from public.ai_artifacts as artifact where artifact.artifact_id = existing_id;
    return;
  end if;

  select greatest(1, least(90, coalesce((configuration ->> 'retention_days')::integer, 30)))
    into retention_days from public.ai_feature_flags
    where ai_feature_flags.clinic_id = target.clinic_id and capability = 'digitalcare_transcription';
  insert into public.ai_operations(
    clinic_id, capability, actor_user_id, actor_staff_id, owner_id, pet_id,
    appointment_id, status, idempotency_key, provider, model_version,
    schema_version, latency_ms, input_tokens, output_tokens, started_at, completed_at
  ) values (
    target.clinic_id, 'digitalcare_transcription', requested_actor_user_id,
    target.staff_id, target.owner_id, target.pet_id, target.appointment_id,
    'succeeded', 'digitalcare-transcript:' || requested_request_id::text,
    left(requested_provider, 80), left(requested_model_version, 120),
    '2026-07-17.1', greatest(requested_latency_ms, 0),
    greatest(requested_input_tokens, 0), greatest(requested_output_tokens, 0), now(), now()
  ) returning public.ai_operations.operation_id into operation_id;
  transcript_content := jsonb_build_object(
    'text', trim(requested_transcript), 'language', requested_language,
    'automatic', true, 'approved', false
  );
  insert into public.ai_artifacts(
    clinic_id, operation_id, owner_id, pet_id, appointment_id, artifact_type,
    status, content, created_by, model_version, prompt_version, retention_until
  ) values (
    target.clinic_id, operation_id, target.owner_id, target.pet_id,
    target.appointment_id, 'transcript', 'draft', transcript_content,
    requested_actor_user_id, left(requested_model_version, 120),
    'digitalcare-transcription-2026-07-17.1',
    now() + make_interval(days => coalesce(retention_days, 30))
  ) returning public.ai_artifacts.artifact_id into transcript_id;
  insert into public.ai_sources(clinic_id, artifact_id, source_type, source_record_id, document_id)
  values (target.clinic_id, transcript_id, 'digitalcare',
    'transcript:' || requested_video_session_id::text, target.recording_document_id);
  update public.video_sessions set transcript_artifact_id = transcript_id,
    transcription_status = 'ready', recording_status = case when recording_document_id is null then recording_status else 'stored' end,
    ai_updated_at = now() where session_id = requested_video_session_id;
  insert into public.ai_audit_events(
    clinic_id, actor_user_id, operation_id, capability, event_type, outcome,
    provider, model_version, prompt_version, schema_version, latency_ms,
    input_tokens, output_tokens
  ) values (
    target.clinic_id, requested_actor_user_id, operation_id,
    'digitalcare_transcription', 'transcript_created', 'success',
    left(requested_provider, 80), left(requested_model_version, 120),
    'digitalcare-transcription-2026-07-17.1', '2026-07-17.1',
    greatest(requested_latency_ms, 0), greatest(requested_input_tokens, 0),
    greatest(requested_output_tokens, 0)
  );
  return query select transcript_id, 'draft'::text, transcript_content, null::bigint;
end;
$$;

create or replace function public.myvet_ensure_digitalcare_visit(
  requested_actor_user_id uuid,
  requested_video_session_id bigint
)
returns bigint
language plpgsql
security definer
set search_path = ''
as $$
declare
  target record;
  target_visit_id bigint;
begin
  select session.*, staff.staff_id, coalesce(staff.full_name, staff.name, 'וטרינר') as staff_name,
    conversation.subject
  into target
  from public.video_sessions as session
  join public.staff as staff on staff.clinic_id = session.clinic_id
    and staff.auth_user_id = requested_actor_user_id and staff.is_active and staff.role = 'vet'
  left join public.conversations as conversation on conversation.clinic_id = session.clinic_id
    and conversation.conversation_id = session.conversation_id
  where session.session_id = requested_video_session_id and session.appointment_id is not null
    and session.transcription_status = 'ready';
  if target.clinic_id is null then raise exception 'DIGITALCARE_ACCESS_DENIED'; end if;
  if not exists (select 1 from public.ai_feature_flags where clinic_id = target.clinic_id
    and capability = 'digitalcare_summary' and enabled and not kill_switch) then
    raise exception 'AI_FEATURE_DISABLED';
  end if;
  perform pg_advisory_xact_lock(hashtextextended('digitalcare-visit:' || requested_video_session_id::text, 0));
  select visit_id into target_visit_id from public.medical_visits
    where clinic_id = target.clinic_id and appointment_id = target.appointment_id
    order by visit_id limit 1;
  if target_visit_id is null then
    insert into public.medical_visits(
      clinic_id, appointment_id, pet_id, visit_date, vet_name, reason,
      treatment, notes, attachments, visit_type, urgency_level,
      chief_complaint, follow_up_required, entry_data
    ) values (
      target.clinic_id, target.appointment_id, target.pet_id, coalesce(target.ended_at, now()),
      target.staff_name, coalesce(nullif(target.subject, ''), 'שיחת DigitalCare'),
      null, 'נוצרה רשומת ביקור ללא תוכן AI; טיוטת הסיכום ממתינה לאישור וטרינר.',
      '0', 'video_consultation', 'normal', coalesce(nullif(target.subject, ''), 'שיחת DigitalCare'),
      false, jsonb_build_object('entryType','video_consultation','source','digital-care',
        'videoSessionId',requested_video_session_id,'aiContentApproved',false)
    ) returning visit_id into target_visit_id;
  end if;
  update public.video_sessions set visit_id = target_visit_id, ai_updated_at = now()
    where session_id = requested_video_session_id;
  return target_visit_id;
end;
$$;

create or replace function public.myvet_link_digitalcare_summary_source(
  requested_actor_user_id uuid,
  requested_video_session_id bigint,
  requested_summary_artifact_id uuid
)
returns void
language plpgsql
security definer
set search_path = ''
as $$
declare target record;
begin
  select session.*, staff.staff_id into target
  from public.video_sessions as session
  join public.staff as staff on staff.clinic_id = session.clinic_id
    and staff.auth_user_id = requested_actor_user_id and staff.is_active and staff.role = 'vet'
  where session.session_id = requested_video_session_id;
  if target.clinic_id is null or target.transcript_artifact_id is null or target.visit_id is null
    or not exists (select 1 from public.ai_artifacts where artifact_id = requested_summary_artifact_id
      and clinic_id = target.clinic_id and visit_id = target.visit_id and artifact_type = 'visit_summary') then
    raise exception 'DIGITALCARE_ACCESS_DENIED';
  end if;
  insert into public.ai_sources(clinic_id, artifact_id, source_type, source_record_id)
  values (target.clinic_id, requested_summary_artifact_id, 'digitalcare',
    'transcript-artifact:' || target.transcript_artifact_id::text)
  on conflict do nothing;
end;
$$;

create or replace function public.myvet_mark_digitalcare_failure(
  requested_actor_user_id uuid,
  requested_video_session_id bigint,
  requested_stage text,
  requested_error_code text
)
returns void
language plpgsql
security definer
set search_path = ''
as $$
declare target record;
begin
  if requested_stage not in ('recording','upload','transcription','summary') then return; end if;
  select session.*, staff.staff_id into target from public.video_sessions as session
  join public.staff as staff on staff.clinic_id = session.clinic_id
    and staff.auth_user_id = requested_actor_user_id and staff.is_active and staff.role = 'vet'
  where session.session_id = requested_video_session_id;
  if target.clinic_id is null then return; end if;
  update public.video_sessions set
    recording_status = case when requested_stage in ('recording','upload') then 'failed' else recording_status end,
    transcription_status = case when requested_stage in ('transcription','summary') then 'failed' else transcription_status end,
    ai_updated_at = now() where session_id = requested_video_session_id;
  insert into public.ai_audit_events(clinic_id, actor_user_id, capability, event_type, outcome, error_code)
  values (target.clinic_id, requested_actor_user_id,
    case when requested_stage in ('recording','upload') then 'digitalcare_recording'
      when requested_stage = 'summary' then 'digitalcare_summary' else 'digitalcare_transcription' end,
    'provider_failed', 'failed',
    case when requested_error_code ~ '^[A-Z0-9_]{1,80}$' then requested_error_code else 'DIGITALCARE_OPERATION_FAILED' end);
end;
$$;

revoke all on function private.myvet_is_valid_visit_summary(jsonb) from public, anon, authenticated, service_role;
revoke all on function public.myvet_begin_digitalcare_capture(uuid,bigint,bigint,text,boolean,boolean,boolean,text,text,bigint) from public, anon, authenticated;
revoke all on function public.myvet_complete_digitalcare_transcript(uuid,bigint,text,text,uuid,text,text,integer,integer,integer) from public, anon, authenticated;
revoke all on function public.myvet_ensure_digitalcare_visit(uuid,bigint) from public, anon, authenticated;
revoke all on function public.myvet_link_digitalcare_summary_source(uuid,bigint,uuid) from public, anon, authenticated;
revoke all on function public.myvet_mark_digitalcare_failure(uuid,bigint,text,text) from public, anon, authenticated;
grant execute on function public.myvet_begin_digitalcare_capture(uuid,bigint,bigint,text,boolean,boolean,boolean,text,text,bigint) to service_role;
grant execute on function public.myvet_complete_digitalcare_transcript(uuid,bigint,text,text,uuid,text,text,integer,integer,integer) to service_role;
grant execute on function public.myvet_ensure_digitalcare_visit(uuid,bigint) to service_role;
grant execute on function public.myvet_link_digitalcare_summary_source(uuid,bigint,uuid) to service_role;
grant execute on function public.myvet_mark_digitalcare_failure(uuid,bigint,text,text) to service_role;

comment on function public.myvet_begin_digitalcare_capture(uuid,bigint,bigint,text,boolean,boolean,boolean,text,text,bigint) is
  'Stage 4 service-only gate: derives tenant/pet/owner from a verified video appointment and requires explicit consent.';
comment on function public.myvet_ensure_digitalcare_visit(uuid,bigint) is
  'Creates only an empty DigitalCare visit shell. Generated clinical content remains in an AI draft until veterinarian approval.';
