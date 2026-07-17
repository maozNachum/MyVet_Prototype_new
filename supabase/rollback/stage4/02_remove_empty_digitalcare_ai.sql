-- Preview/development-only structural rollback.
-- Run only after 01_disable_digitalcare_ai.sql and only when Stage 4 contains
-- no consent, document, transcript, summary-source or session linkage data.
do $$
begin
  if exists (
    select 1 from public.video_sessions
    where appointment_id is not null or visit_id is not null
      or recording_document_id is not null or transcript_artifact_id is not null
      or transcription_status <> 'idle' or recording_status <> 'disabled'
  ) or exists (
    select 1 from public.ai_consent_records where video_session_id is not null
  ) or exists (
    select 1 from public.ai_operations
    where capability in ('digitalcare_transcription','digitalcare_recording','digitalcare_summary')
  ) then
    raise exception 'STAGE4_ROLLBACK_REQUIRES_EMPTY_DATA';
  end if;
end $$;

drop function if exists public.myvet_begin_digitalcare_capture(uuid,bigint,bigint,text,boolean,boolean,boolean,text,text,bigint);
drop function if exists public.myvet_complete_digitalcare_transcript(uuid,bigint,text,text,uuid,text,text,integer,integer,integer);
drop function if exists public.myvet_ensure_digitalcare_visit(uuid,bigint);
drop function if exists public.myvet_link_digitalcare_summary_source(uuid,bigint,uuid);
drop function if exists public.myvet_mark_digitalcare_failure(uuid,bigint,text,text);
drop trigger if exists myvet_digitalcare_summary_provenance on public.ai_artifacts;
drop function if exists private.myvet_carry_digitalcare_summary_provenance();

delete from public.ai_feature_flags
where capability in ('digitalcare_transcription','digitalcare_recording','digitalcare_summary');

drop index if exists public.ai_consent_records_one_active_context_idx;
drop index if exists public.ai_consent_records_session_idx;
create unique index if not exists ai_consent_records_one_active_idx
  on public.ai_consent_records (clinic_id, owner_id, purpose)
  where status = 'granted';

alter table public.ai_consent_records
  drop constraint if exists ai_consent_records_video_session_fkey,
  drop constraint if exists ai_consent_records_appointment_fkey,
  drop column if exists video_session_id,
  drop column if exists appointment_id;

drop index if exists public.video_sessions_appointment_idx;
drop index if exists public.video_sessions_transcription_status_idx;
alter table public.video_sessions
  drop constraint if exists video_sessions_transcript_artifact_fkey,
  drop constraint if exists video_sessions_recording_document_fkey,
  drop constraint if exists video_sessions_visit_fkey,
  drop constraint if exists video_sessions_appointment_fkey,
  drop constraint if exists video_sessions_recording_status_check,
  drop constraint if exists video_sessions_transcription_status_check,
  drop constraint if exists video_sessions_clinic_session_key,
  drop column if exists ai_updated_at,
  drop column if exists consent_notice_version,
  drop column if exists transcript_artifact_id,
  drop column if exists recording_document_id,
  drop column if exists recording_status,
  drop column if exists transcription_status,
  drop column if exists visit_id,
  drop column if exists appointment_id;

alter table public.ai_operations drop constraint if exists ai_operations_capability_check;
alter table public.ai_operations add constraint ai_operations_capability_check check (capability in (
  'vetbot', 'visit_summary', 'digitalcare_transcription', 'record_qa',
  'document_ocr', 'client_explanation', 'reminder_suggestion'
));
alter table public.ai_feature_flags drop constraint if exists ai_feature_flags_capability_check;
alter table public.ai_feature_flags add constraint ai_feature_flags_capability_check check (capability in (
  'vetbot', 'vetbot_actions', 'appointment_actions', 'visit_summary',
  'digitalcare_transcription', 'record_qa', 'document_ocr',
  'client_explanation', 'reminder_suggestion'
));
alter table public.ai_audit_events drop constraint if exists ai_audit_events_event_type_check;
alter table public.ai_audit_events add constraint ai_audit_events_event_type_check check (event_type in (
  'request_received', 'provider_completed', 'provider_failed', 'output_rejected',
  'draft_created', 'approval_recorded', 'release_recorded', 'access_denied',
  'rate_limited', 'feature_disabled'
));

-- Restore the Stage 3 validator exactly (without the Stage 4 source label).
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
        'differential_diagnoses', 'prescriptions', 'lab_orders'
      )
    ) then return false; end if;
  return true;
exception when others then return false;
end;
$$;

revoke all on function private.myvet_is_valid_visit_summary(jsonb) from public, anon, authenticated, service_role;
