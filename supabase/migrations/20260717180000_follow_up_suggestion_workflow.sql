-- Stage 8: AI suggests follow-ups; only an authenticated veterinarian approval
-- creates a row in the existing public.reminders table.

alter table public.ai_sources drop constraint if exists ai_sources_source_type_check;
alter table public.ai_sources add constraint ai_sources_source_type_check check (source_type in (
  'medical_visit', 'appointment', 'document', 'document_chunk', 'digitalcare',
  'manual_note', 'ai_artifact', 'vaccination'
));

create index if not exists reminders_source_duplicate_lookup_idx
  on public.reminders(clinic_id,pet_id,source_type,source_id,reminder_type,due_at);

-- Keep approved reminders inside the existing reminder surface. The draft AI
-- artifact remains hidden by its own RLS; an owner can only read the final row
-- for a pet that is verified as theirs by the database.
drop policy if exists reminders_follow_up_staff_select on public.reminders;
create policy reminders_follow_up_staff_select on public.reminders
  for select to authenticated
  using (private.myvet_is_clinic_staff(clinic_id));

drop policy if exists reminders_follow_up_owner_select on public.reminders;
create policy reminders_follow_up_owner_select on public.reminders
  for select to authenticated
  using (
    owner_id is not null
    and private.myvet_owner_owns_pet(clinic_id, pet_id)
  );

create or replace function private.myvet_is_valid_follow_up_suggestion(candidate jsonb)
returns boolean language plpgsql stable set search_path = '' as $$
declare
  allowed_fields text[] := array[
    'reminder_type','title','description','scheduled_at','target_type',
    'requires_manual_date','release_to_client','confidence'
  ];
begin
  return jsonb_typeof(candidate) = 'object'
    and (select count(*) from jsonb_object_keys(candidate)) = cardinality(allowed_fields)
    and not exists (select 1 from jsonb_object_keys(candidate) key where not (key = any(allowed_fields)))
    and candidate ->> 'reminder_type' in ('return_visit','future_vaccination','general_follow_up')
    and char_length(coalesce(candidate ->> 'title','')) between 2 and 120
    and char_length(coalesce(candidate ->> 'description','')) between 2 and 1200
    and candidate ->> 'target_type' in ('staff','owner')
    and jsonb_typeof(candidate -> 'requires_manual_date') = 'boolean'
    and jsonb_typeof(candidate -> 'release_to_client') = 'boolean'
    and candidate ->> 'confidence' in ('low','medium','high')
    and ((candidate ->> 'target_type' = 'owner') = (candidate ->> 'release_to_client')::boolean)
    and (
      ((candidate ->> 'requires_manual_date')::boolean and nullif(candidate ->> 'scheduled_at','') is null)
      or (not (candidate ->> 'requires_manual_date')::boolean
        and (candidate ->> 'scheduled_at') ~ '^\d{4}-\d{2}-\d{2}T'
        and (candidate ->> 'scheduled_at')::timestamptz > now() - interval '1 day')
    );
exception when others then return false;
end;
$$;

create or replace function public.myvet_create_follow_up_suggestion_draft(
  requested_actor_user_id uuid,
  requested_source_type text,
  requested_source_id text,
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
returns table(artifact_id uuid,status text,content jsonb,version_number integer)
language plpgsql security definer set search_path = '' as $$
declare
  source_record record; actor_staff_id uuid; operation_id uuid; new_id uuid; next_version integer; existing record;
begin
  if requested_source_type = 'ai_artifact' then
    select source.clinic_id,source.owner_id,source.pet_id,source.visit_id,source.artifact_id::text as source_id,
      staff.staff_id into source_record
    from public.ai_artifacts source
    join public.staff staff on staff.clinic_id=source.clinic_id and staff.auth_user_id=requested_actor_user_id
      and staff.is_active and staff.role='vet'
    where source.artifact_id=case when requested_source_id ~* '^[0-9a-f-]{36}$' then requested_source_id::uuid else null end
      and source.artifact_type='visit_summary' and source.status='approved' and source.deleted_at is null;
  elsif requested_source_type = 'vaccination' then
    select vaccine.clinic_id,patient.owner_id,vaccine.pet_id,null::bigint as visit_id,
      vaccine.vaccination_id::text as source_id,staff.staff_id into source_record
    from public.vaccinations vaccine
    join public.patients patient on patient.clinic_id=vaccine.clinic_id and patient.pet_id=vaccine.pet_id
    join public.staff staff on staff.clinic_id=vaccine.clinic_id and staff.auth_user_id=requested_actor_user_id
      and staff.is_active and staff.role='vet'
    where vaccine.vaccination_id=case when requested_source_id ~* '^[0-9a-f-]{36}$' then requested_source_id::uuid else null end
      and vaccine.given_date is not null;
  else
    raise exception 'FOLLOW_UP_SOURCE_INVALID';
  end if;
  actor_staff_id := source_record.staff_id;
  if source_record.clinic_id is null then raise exception 'FOLLOW_UP_APPROVED_SOURCE_REQUIRED'; end if;
  if requested_request_id is null or not private.myvet_is_valid_follow_up_suggestion(requested_content) then
    raise exception 'FOLLOW_UP_INPUT_INVALID';
  end if;
  if exists (select 1 from public.ai_feature_flags where clinic_id=source_record.clinic_id
    and capability='reminder_suggestion' and (not enabled or kill_switch)) then raise exception 'AI_FEATURE_DISABLED'; end if;

  perform pg_advisory_xact_lock(hashtextextended('follow-up:' || requested_source_type || ':' || requested_source_id,0));
  select artifact.* into existing from public.ai_artifacts artifact
  join public.ai_sources link on link.clinic_id=artifact.clinic_id and link.artifact_id=artifact.artifact_id
  where link.source_type=requested_source_type and link.source_record_id=source_record.source_id
    and artifact.artifact_type='reminder_suggestion' and artifact.status in ('draft','edited')
    and artifact.content ->> 'reminder_type'=requested_content ->> 'reminder_type'
    and artifact.deleted_at is null order by artifact.version_number desc limit 1;
  if existing.artifact_id is not null then
    return query select existing.artifact_id,existing.status,existing.content,existing.version_number;
    return;
  end if;

  insert into public.ai_operations(
    clinic_id,capability,actor_user_id,actor_staff_id,owner_id,pet_id,visit_id,status,idempotency_key,
    provider,model_version,prompt_version,schema_version,latency_ms,input_tokens,output_tokens,started_at,completed_at
  ) values (
    source_record.clinic_id,'reminder_suggestion',requested_actor_user_id,actor_staff_id,source_record.owner_id,
    source_record.pet_id,source_record.visit_id,'succeeded','follow-up:' || requested_request_id::text,
    left(requested_provider,80),left(requested_model_version,120),left(requested_prompt_version,120),'2026-07-17.1',
    greatest(requested_latency_ms,0),greatest(requested_input_tokens,0),greatest(requested_output_tokens,0),now(),now()
  ) on conflict (clinic_id,capability,idempotency_key) where idempotency_key is not null
  do update set updated_at=public.ai_operations.updated_at returning public.ai_operations.operation_id into operation_id;

  select coalesce(max(artifact.version_number),0)+1 into next_version from public.ai_artifacts artifact
  where artifact.clinic_id=source_record.clinic_id and artifact.pet_id=source_record.pet_id
    and artifact.artifact_type='reminder_suggestion';
  insert into public.ai_artifacts(
    clinic_id,operation_id,owner_id,pet_id,visit_id,artifact_type,status,content,created_by,
    model_version,prompt_version,version_number
  ) values (
    source_record.clinic_id,operation_id,source_record.owner_id,source_record.pet_id,source_record.visit_id,
    'reminder_suggestion','draft',requested_content,requested_actor_user_id,left(requested_model_version,120),
    left(requested_prompt_version,120),next_version
  ) returning public.ai_artifacts.artifact_id into new_id;
  insert into public.ai_sources(clinic_id,artifact_id,source_type,source_record_id)
    values(source_record.clinic_id,new_id,requested_source_type,source_record.source_id);
  insert into public.ai_approval_history(clinic_id,artifact_id,action,actor_user_id,actor_staff_id,previous_status,new_status,change_summary)
    values(source_record.clinic_id,new_id,'submitted',requested_actor_user_id,actor_staff_id,null,'draft',
      jsonb_build_object('generated_by_ai',requested_generated_by_ai));
  insert into public.ai_audit_events(clinic_id,actor_user_id,operation_id,capability,event_type,outcome,provider,model_version,prompt_version,schema_version,latency_ms,input_tokens,output_tokens)
    values(source_record.clinic_id,requested_actor_user_id,operation_id,'reminder_suggestion','draft_created','success',
      left(requested_provider,80),left(requested_model_version,120),left(requested_prompt_version,120),'2026-07-17.1',
      greatest(requested_latency_ms,0),greatest(requested_input_tokens,0),greatest(requested_output_tokens,0));
  return query select new_id,'draft'::text,requested_content,next_version;
end;
$$;

create or replace function public.myvet_transition_follow_up_suggestion(
  requested_artifact_id uuid,
  requested_action text,
  requested_content jsonb default null,
  requested_rejection_reason text default null,
  requested_duplicate_confirmed boolean default false
)
returns table(artifact_id uuid,status text,content jsonb,version_number integer,reminder_id bigint,possible_duplicate boolean)
language plpgsql security definer set search_path = '' as $$
declare
  current_record record; actor_staff_id uuid; next_status text; next_id uuid; next_version integer; next_content jsonb;
  source_record record; existing_reminder_id bigint; created_reminder_id bigint;
begin
  if (select auth.uid()) is null or requested_action not in ('save','approve','reject') then raise exception 'FOLLOW_UP_ACTION_INVALID'; end if;
  select artifact.*,staff.staff_id into current_record from public.ai_artifacts artifact
  join public.staff staff on staff.clinic_id=artifact.clinic_id and staff.auth_user_id=(select auth.uid())
    and staff.is_active and staff.role='vet'
  where artifact.artifact_id=requested_artifact_id and artifact.artifact_type='reminder_suggestion'
    and artifact.status in ('draft','edited') and artifact.deleted_at is null for update of artifact;
  actor_staff_id := current_record.staff_id;
  if current_record.artifact_id is null then raise exception 'FOLLOW_UP_ACCESS_DENIED'; end if;
  select link.source_type,link.source_record_id into source_record from public.ai_sources link
    where link.artifact_id=current_record.artifact_id and link.source_type in ('ai_artifact','vaccination') limit 1;
  if source_record.source_record_id is null then raise exception 'FOLLOW_UP_APPROVED_SOURCE_REQUIRED'; end if;
  if source_record.source_type='ai_artifact' and not exists (
    select 1 from public.ai_artifacts source where source.clinic_id=current_record.clinic_id
      and source.artifact_id=case when source_record.source_record_id ~* '^[0-9a-f-]{36}$' then source_record.source_record_id::uuid else null end
      and source.artifact_type='visit_summary' and source.status='approved' and source.deleted_at is null
  ) then raise exception 'FOLLOW_UP_APPROVED_SOURCE_REQUIRED'; end if;
  if source_record.source_type='vaccination' and not exists (
    select 1 from public.vaccinations vaccine where vaccine.clinic_id=current_record.clinic_id
      and vaccine.pet_id=current_record.pet_id
      and vaccine.vaccination_id=case when source_record.source_record_id ~* '^[0-9a-f-]{36}$' then source_record.source_record_id::uuid else null end
      and vaccine.given_date is not null
  ) then raise exception 'FOLLOW_UP_APPROVED_SOURCE_REQUIRED'; end if;
  if exists (select 1 from public.ai_feature_flags where clinic_id=current_record.clinic_id
    and capability='reminder_suggestion' and (not enabled or kill_switch)) then raise exception 'AI_FEATURE_DISABLED'; end if;
  next_content := coalesce(requested_content,current_record.content);
  if requested_action in ('save','approve') and not private.myvet_is_valid_follow_up_suggestion(next_content) then
    raise exception 'FOLLOW_UP_INPUT_INVALID';
  end if;
  if requested_action='approve' and ((next_content ->> 'requires_manual_date')::boolean
    or nullif(next_content ->> 'scheduled_at','') is null) then raise exception 'FOLLOW_UP_DATE_REQUIRED'; end if;
  if requested_action='reject' and char_length(coalesce(requested_rejection_reason,''))<2 then raise exception 'FOLLOW_UP_REJECTION_REQUIRED'; end if;
  perform pg_advisory_xact_lock(hashtextextended('follow-up-approve:' || current_record.pet_id::text,0));

  if requested_action='approve' then
    select reminder.reminder_id into existing_reminder_id from public.reminders reminder
    where reminder.clinic_id=current_record.clinic_id and reminder.pet_id=current_record.pet_id
      and coalesce(reminder.source_type,'')=source_record.source_type
      and coalesce(reminder.source_id,'')=source_record.source_record_id
      and coalesce(reminder.reminder_type,'')=next_content ->> 'reminder_type'
      and reminder.due_at=(next_content ->> 'scheduled_at')::timestamptz
      and coalesce(reminder.status,'open') not in ('cancelled','deleted')
    order by reminder.reminder_id desc limit 1;
    if existing_reminder_id is not null and not requested_duplicate_confirmed then
      return query select current_record.artifact_id,'duplicate'::text,next_content,current_record.version_number,existing_reminder_id,true;
      return;
    end if;
  end if;

  next_status := case requested_action when 'save' then 'edited' when 'approve' then 'approved' else 'rejected' end;
  next_version := current_record.version_number+1;
  update public.ai_artifacts set status='superseded',updated_at=now() where public.ai_artifacts.artifact_id=current_record.artifact_id;
  insert into public.ai_artifacts(
    clinic_id,operation_id,owner_id,pet_id,visit_id,artifact_type,status,content,created_by,approved_by,approved_at,
    model_version,prompt_version,version_number,supersedes_artifact_id
  ) values (
    current_record.clinic_id,current_record.operation_id,current_record.owner_id,current_record.pet_id,current_record.visit_id,
    'reminder_suggestion',next_status,next_content,(select auth.uid()),case when requested_action='approve' then actor_staff_id end,
    case when requested_action='approve' then now() end,current_record.model_version,current_record.prompt_version,
    next_version,current_record.artifact_id
  ) returning public.ai_artifacts.artifact_id into next_id;
  insert into public.ai_sources(clinic_id,artifact_id,source_type,source_record_id)
    values(current_record.clinic_id,next_id,source_record.source_type,source_record.source_record_id);

  if requested_action='approve' then
    insert into public.reminders(
      clinic_id,owner_id,pet_id,visit_id,title,message,reminder_type,due_at,status,action_url,is_read,
      source_type,source_id,metadata
    ) values (
      current_record.clinic_id,case when (next_content ->> 'release_to_client')::boolean then current_record.owner_id else null end,
      current_record.pet_id,current_record.visit_id,next_content ->> 'title',next_content ->> 'description',
      next_content ->> 'reminder_type',(next_content ->> 'scheduled_at')::timestamptz,'open',
      case when (next_content ->> 'release_to_client')::boolean then '/portal?view=notifications' else null end,
      false,source_record.source_type,source_record.source_record_id,
      jsonb_build_object('target_type',next_content ->> 'target_type','release_to_client',(next_content ->> 'release_to_client')::boolean,
        'confidence',next_content ->> 'confidence','suggestion_artifact_id',next_id)
    ) returning public.reminders.reminder_id into created_reminder_id;
  end if;
  insert into public.ai_approval_history(clinic_id,artifact_id,action,actor_user_id,actor_staff_id,previous_status,new_status,change_summary)
    values(current_record.clinic_id,next_id,case requested_action when 'save' then 'edited' when 'approve' then 'approved' else 'rejected' end,
      (select auth.uid()),actor_staff_id,current_record.status,next_status,case when requested_action='reject'
        then jsonb_build_object('rejection_reason',left(requested_rejection_reason,500))
        else jsonb_build_object('reminder_created',created_reminder_id is not null) end);
  insert into public.ai_audit_events(clinic_id,actor_user_id,operation_id,capability,event_type,outcome,model_version,prompt_version,schema_version)
    values(current_record.clinic_id,(select auth.uid()),current_record.operation_id,'reminder_suggestion',
      'approval_recorded','success',
      current_record.model_version,current_record.prompt_version,'2026-07-17.1');
  return query select next_id,next_status,next_content,next_version,created_reminder_id,false;
end;
$$;

revoke all on function private.myvet_is_valid_follow_up_suggestion(jsonb) from public,anon,authenticated,service_role;
revoke all on function public.myvet_create_follow_up_suggestion_draft(uuid,text,text,jsonb,uuid,text,text,text,integer,integer,integer,boolean) from public,anon,authenticated;
revoke all on function public.myvet_transition_follow_up_suggestion(uuid,text,jsonb,text,boolean) from public,anon;
grant execute on function public.myvet_create_follow_up_suggestion_draft(uuid,text,text,jsonb,uuid,text,text,text,integer,integer,integer,boolean) to service_role;
grant execute on function public.myvet_transition_follow_up_suggestion(uuid,text,jsonb,text,boolean) to authenticated,service_role;
