-- Stage 7: veterinarian-reviewed owner-facing summaries derived only from an
-- approved visit summary. Reuses ai_artifacts and its existing owner RLS.

alter table public.ai_sources drop constraint if exists ai_sources_source_type_check;
alter table public.ai_sources add constraint ai_sources_source_type_check check (source_type in (
  'medical_visit', 'appointment', 'document', 'document_chunk', 'digitalcare', 'manual_note', 'ai_artifact'
));

create or replace function private.myvet_json_text_array_subset(candidate jsonb, allowed jsonb)
returns boolean language sql immutable set search_path = '' as $$
  select jsonb_typeof(candidate) = 'array'
    and jsonb_array_length(candidate) <= 20
    and not exists (
      select 1 from jsonb_array_elements(candidate) item
      where jsonb_typeof(item) <> 'string'
        or char_length(item #>> '{}') > 700
        or not (allowed @> jsonb_build_array(item))
    );
$$;

create or replace function private.myvet_json_text_array_valid(candidate jsonb)
returns boolean language sql immutable set search_path = '' as $$
  select jsonb_typeof(candidate) = 'array' and jsonb_array_length(candidate) <= 20
    and not exists (select 1 from jsonb_array_elements(candidate) item
      where jsonb_typeof(item) <> 'string' or char_length(item #>> '{}') > 700);
$$;

create or replace function private.myvet_is_valid_client_summary(candidate jsonb, approved jsonb)
returns boolean language plpgsql immutable set search_path = '' as $$
declare
  allowed_fields text[] := array[
    'reason_for_visit','what_was_found','treatment_given','medications_and_instructions',
    'home_care','follow_up','warning_signs','next_steps'
  ];
begin
  if jsonb_typeof(candidate) <> 'object'
    or (select count(*) from jsonb_object_keys(candidate)) <> cardinality(allowed_fields)
    or exists (select 1 from jsonb_object_keys(candidate) key where not (key = any(allowed_fields)))
    or jsonb_typeof(candidate -> 'reason_for_visit') <> 'string'
    or char_length(candidate ->> 'reason_for_visit') > 2000 then return false; end if;

  return private.myvet_json_text_array_valid(candidate -> 'what_was_found')
    and private.myvet_json_text_array_subset(candidate -> 'treatment_given', coalesce(approved -> 'treatments','[]'::jsonb))
    and private.myvet_json_text_array_subset(candidate -> 'medications_and_instructions', coalesce(approved -> 'medications','[]'::jsonb))
    and private.myvet_json_text_array_subset(candidate -> 'home_care', coalesce(approved -> 'follow_up','[]'::jsonb))
    and private.myvet_json_text_array_subset(candidate -> 'follow_up', coalesce(approved -> 'follow_up','[]'::jsonb))
    and private.myvet_json_text_array_subset(candidate -> 'warning_signs', coalesce(approved -> 'warnings','[]'::jsonb))
    and private.myvet_json_text_array_subset(candidate -> 'next_steps', coalesce(approved -> 'unresolved_items','[]'::jsonb));
exception when others then return false;
end;
$$;

create or replace function public.myvet_create_client_summary_draft(
  requested_actor_user_id uuid,
  requested_approved_artifact_id uuid,
  requested_content jsonb,
  requested_request_id uuid,
  requested_provider text,
  requested_model_version text,
  requested_prompt_version text,
  requested_latency_ms integer,
  requested_input_tokens integer,
  requested_output_tokens integer,
  requested_generated_by_ai boolean default true
)
returns table(artifact_id uuid,status text,content jsonb,version_number integer,released_to_owner boolean)
language plpgsql security definer set search_path = '' as $$
declare
  source_record record; actor_staff_id uuid; operation_id uuid; new_id uuid; next_version integer; existing record;
begin
  select source.*, staff.staff_id into source_record
  from public.ai_artifacts source
  join public.staff staff on staff.clinic_id = source.clinic_id
    and staff.auth_user_id = requested_actor_user_id and staff.is_active and staff.role = 'vet'
  where source.artifact_id = requested_approved_artifact_id
    and source.artifact_type = 'visit_summary' and source.status = 'approved'
    and source.deleted_at is null;
  actor_staff_id := source_record.staff_id;
  if source_record.artifact_id is null then raise exception 'CLIENT_SUMMARY_APPROVED_SOURCE_REQUIRED'; end if;
  if requested_request_id is null
    or not private.myvet_is_valid_client_summary(requested_content, source_record.content) then
    raise exception 'CLIENT_SUMMARY_INPUT_INVALID'; end if;
  if exists (select 1 from public.ai_feature_flags where clinic_id = source_record.clinic_id
    and capability = 'client_explanation' and (not enabled or kill_switch)) then
    raise exception 'AI_FEATURE_DISABLED'; end if;

  perform pg_advisory_xact_lock(hashtextextended('client-summary:' || source_record.visit_id::text,0));
  select artifact.* into existing from public.ai_artifacts artifact
  where artifact.clinic_id = source_record.clinic_id and artifact.visit_id = source_record.visit_id
    and artifact.artifact_type = 'client_explanation' and artifact.status in ('draft','edited')
    and artifact.deleted_at is null order by artifact.version_number desc limit 1;
  if existing.artifact_id is not null then
    return query select existing.artifact_id,existing.status,existing.content,existing.version_number,existing.released_to_owner;
    return;
  end if;

  insert into public.ai_operations(
    clinic_id,capability,actor_user_id,actor_staff_id,owner_id,pet_id,visit_id,status,
    idempotency_key,provider,model_version,prompt_version,schema_version,latency_ms,input_tokens,
    output_tokens,started_at,completed_at
  ) values (
    source_record.clinic_id,'client_explanation',requested_actor_user_id,actor_staff_id,
    source_record.owner_id,source_record.pet_id,source_record.visit_id,'succeeded',
    'client-summary:' || requested_request_id::text,left(requested_provider,80),left(requested_model_version,120),
    left(requested_prompt_version,120),'2026-07-17.1',greatest(requested_latency_ms,0),
    greatest(requested_input_tokens,0),greatest(requested_output_tokens,0),now(),now()
  ) on conflict (clinic_id,capability,idempotency_key) where idempotency_key is not null
  do update set updated_at = public.ai_operations.updated_at returning public.ai_operations.operation_id into operation_id;

  select coalesce(max(artifact.version_number),0)+1 into next_version from public.ai_artifacts artifact
  where artifact.clinic_id=source_record.clinic_id and artifact.visit_id=source_record.visit_id
    and artifact.artifact_type='client_explanation';
  insert into public.ai_artifacts(
    clinic_id,operation_id,owner_id,pet_id,visit_id,artifact_type,status,content,created_by,
    model_version,prompt_version,version_number
  ) values (
    source_record.clinic_id,operation_id,source_record.owner_id,source_record.pet_id,source_record.visit_id,
    'client_explanation','draft',requested_content,requested_actor_user_id,left(requested_model_version,120),
    left(requested_prompt_version,120),next_version
  ) returning public.ai_artifacts.artifact_id into new_id;
  insert into public.ai_sources(clinic_id,artifact_id,source_type,source_record_id)
    values(source_record.clinic_id,new_id,'ai_artifact',source_record.artifact_id::text);
  insert into public.ai_approval_history(clinic_id,artifact_id,action,actor_user_id,actor_staff_id,previous_status,new_status,change_summary)
    values(source_record.clinic_id,new_id,'submitted',requested_actor_user_id,actor_staff_id,null,'draft',
      jsonb_build_object('generated_by_ai',requested_generated_by_ai));
  insert into public.ai_audit_events(clinic_id,actor_user_id,operation_id,capability,event_type,outcome,provider,model_version,prompt_version,schema_version,latency_ms,input_tokens,output_tokens)
    values(source_record.clinic_id,requested_actor_user_id,operation_id,'client_explanation','draft_created','success',
      left(requested_provider,80),left(requested_model_version,120),left(requested_prompt_version,120),'2026-07-17.1',
      greatest(requested_latency_ms,0),greatest(requested_input_tokens,0),greatest(requested_output_tokens,0));
  return query select new_id,'draft'::text,requested_content,next_version,false;
end;
$$;

create or replace function public.myvet_transition_client_summary(
  requested_artifact_id uuid, requested_action text, requested_content jsonb default null,
  requested_rejection_reason text default null
)
returns table(artifact_id uuid,status text,content jsonb,version_number integer,released_to_owner boolean)
language plpgsql security definer set search_path = '' as $$
declare
  current_record record; source_content jsonb; actor_staff_id uuid; next_status text; next_id uuid; next_version integer; next_content jsonb;
begin
  if (select auth.uid()) is null or requested_action not in ('save','approve','reject','release','revoke_release') then
    raise exception 'CLIENT_SUMMARY_ACTION_INVALID'; end if;
  select artifact.*,staff.staff_id into current_record from public.ai_artifacts artifact
  join public.staff staff on staff.clinic_id=artifact.clinic_id and staff.auth_user_id=(select auth.uid())
    and staff.is_active and staff.role='vet'
  where artifact.artifact_id=requested_artifact_id and artifact.artifact_type='client_explanation'
    and artifact.deleted_at is null for update of artifact;
  actor_staff_id := current_record.staff_id;
  if current_record.artifact_id is null then raise exception 'CLIENT_SUMMARY_ACCESS_DENIED'; end if;
  select source.content into source_content from public.ai_sources link
  join public.ai_artifacts source on source.clinic_id=link.clinic_id
    and source.artifact_id=case when link.source_record_id ~* '^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$'
      then link.source_record_id::uuid else null end
  where link.artifact_id=current_record.artifact_id and link.source_type='ai_artifact'
    and source.artifact_type='visit_summary' and source.status='approved' and source.deleted_at is null;
  if source_content is null then raise exception 'CLIENT_SUMMARY_APPROVED_SOURCE_REQUIRED'; end if;
  if exists (select 1 from public.ai_feature_flags where clinic_id=current_record.clinic_id
    and capability='client_explanation' and (not enabled or kill_switch)) then raise exception 'AI_FEATURE_DISABLED'; end if;

  if requested_action in ('release','revoke_release') then
    if current_record.status <> 'approved' then raise exception 'CLIENT_SUMMARY_NOT_APPROVED'; end if;
    if requested_action='release' and current_record.released_to_owner then raise exception 'CLIENT_SUMMARY_ALREADY_RELEASED'; end if;
    if requested_action='revoke_release' and not current_record.released_to_owner then raise exception 'CLIENT_SUMMARY_NOT_RELEASED'; end if;
    update public.ai_artifacts set released_to_owner=(requested_action='release'),
      released_at=case when requested_action='release' then now() else null end,updated_at=now()
    where public.ai_artifacts.artifact_id=current_record.artifact_id;
    insert into public.ai_approval_history(clinic_id,artifact_id,action,actor_user_id,actor_staff_id,previous_status,new_status,change_summary)
      values(current_record.clinic_id,current_record.artifact_id,case when requested_action='release' then 'released' else 'release_revoked' end,
        (select auth.uid()),actor_staff_id,'approved','approved',jsonb_build_object('owner_visibility',requested_action='release'));
    insert into public.ai_audit_events(clinic_id,actor_user_id,operation_id,capability,event_type,outcome,model_version,prompt_version,schema_version)
      values(current_record.clinic_id,(select auth.uid()),current_record.operation_id,'client_explanation','release_recorded','success',
        current_record.model_version,current_record.prompt_version,'2026-07-17.1');
    return query select current_record.artifact_id,'approved'::text,current_record.content,current_record.version_number,(requested_action='release');
    return;
  end if;

  if current_record.status not in ('draft','edited') then raise exception 'CLIENT_SUMMARY_NOT_EDITABLE'; end if;
  next_content := coalesce(requested_content,current_record.content);
  if requested_action in ('save','approve') and not private.myvet_is_valid_client_summary(next_content,source_content) then
    raise exception 'CLIENT_SUMMARY_FACT_MISMATCH'; end if;
  if requested_action='reject' and char_length(coalesce(requested_rejection_reason,''))<2 then
    raise exception 'CLIENT_SUMMARY_REJECTION_REQUIRED'; end if;
  perform pg_advisory_xact_lock(hashtextextended('client-summary:' || current_record.visit_id::text,0));
  next_status := case requested_action when 'save' then 'edited' when 'approve' then 'approved' else 'rejected' end;
  next_version := current_record.version_number+1;
  update public.ai_artifacts set status='superseded',updated_at=now() where public.ai_artifacts.artifact_id=current_record.artifact_id;
  insert into public.ai_artifacts(
    clinic_id,operation_id,owner_id,pet_id,visit_id,artifact_type,status,content,created_by,approved_by,approved_at,
    model_version,prompt_version,version_number,supersedes_artifact_id
  ) values (
    current_record.clinic_id,current_record.operation_id,current_record.owner_id,current_record.pet_id,current_record.visit_id,
    'client_explanation',next_status,next_content,(select auth.uid()),case when requested_action='approve' then actor_staff_id end,
    case when requested_action='approve' then now() end,current_record.model_version,current_record.prompt_version,next_version,current_record.artifact_id
  ) returning public.ai_artifacts.artifact_id into next_id;
  insert into public.ai_sources(clinic_id,artifact_id,source_type,source_record_id)
    select current_record.clinic_id,next_id,'ai_artifact',link.source_record_id from public.ai_sources link
    where link.artifact_id=current_record.artifact_id and link.source_type='ai_artifact';
  insert into public.ai_approval_history(clinic_id,artifact_id,action,actor_user_id,actor_staff_id,previous_status,new_status,change_summary)
    values(current_record.clinic_id,next_id,case requested_action when 'save' then 'edited' when 'approve' then 'approved' else 'rejected' end,
      (select auth.uid()),actor_staff_id,current_record.status,next_status,case when requested_action='reject'
        then jsonb_build_object('rejection_reason',left(requested_rejection_reason,500)) else jsonb_build_object('content_reviewed',true) end);
  return query select next_id,next_status,next_content,next_version,false;
end;
$$;

revoke all on function private.myvet_json_text_array_subset(jsonb,jsonb) from public,anon,authenticated,service_role;
revoke all on function private.myvet_json_text_array_valid(jsonb) from public,anon,authenticated,service_role;
revoke all on function private.myvet_is_valid_client_summary(jsonb,jsonb) from public,anon,authenticated,service_role;
revoke all on function public.myvet_create_client_summary_draft(uuid,uuid,jsonb,uuid,text,text,text,integer,integer,integer,boolean) from public,anon,authenticated;
revoke all on function public.myvet_transition_client_summary(uuid,text,jsonb,text) from public,anon;
grant execute on function public.myvet_create_client_summary_draft(uuid,uuid,jsonb,uuid,text,text,text,integer,integer,integer,boolean) to service_role;
grant execute on function public.myvet_transition_client_summary(uuid,text,jsonb,text) to authenticated,service_role;
