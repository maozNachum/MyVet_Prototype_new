-- Stage 5 / 2 of 2: tenant-filtered source collection, vector storage/search
-- and metadata-only audit RPCs. All RPCs are service-role only; the Edge
-- Function derives the caller from the verified JWT and never accepts role or
-- tenant filters from the browser.

create or replace function public.myvet_rag_status(
  requested_actor_user_id uuid,
  requested_pet_id bigint
)
returns table(
  clinic_id uuid,
  actor_kind text,
  actor_role text,
  can_index boolean,
  can_query boolean,
  indexed_chunks bigint
)
language plpgsql
security definer
set search_path = ''
as $$
declare
  target_clinic_id uuid;
  target_role text;
  target_owner_id text;
  index_enabled boolean := false;
  query_enabled boolean := false;
begin
  if requested_actor_user_id is null or requested_pet_id is null then
    raise exception 'RAG_ACCESS_DENIED';
  end if;

  select staff.clinic_id, staff.role
  into target_clinic_id, target_role
  from public.staff as staff
  join public.patients as pet on pet.clinic_id = staff.clinic_id
  where staff.auth_user_id = requested_actor_user_id and staff.is_active = true
    and staff.role in ('clinic_admin', 'vet', 'nurse')
    and pet.pet_id = requested_pet_id
  limit 1;

  if target_clinic_id is null then
    select owner.clinic_id, owner.owner_id
    into target_clinic_id, target_owner_id
    from public.owners as owner
    join public.patients as pet
      on pet.clinic_id = owner.clinic_id and pet.owner_id = owner.owner_id
    where owner.auth_user_id = requested_actor_user_id and pet.pet_id = requested_pet_id
    limit 1;
    target_role := case when target_clinic_id is null then null else 'owner' end;
  end if;

  if target_clinic_id is null then raise exception 'RAG_ACCESS_DENIED'; end if;

  select coalesce(bool_or(flag.enabled and not flag.kill_switch) filter (where flag.capability = 'rag_index'), false),
         coalesce(bool_or(flag.enabled and not flag.kill_switch) filter (where flag.capability = 'record_qa'), false)
  into index_enabled, query_enabled
  from public.ai_feature_flags as flag
  where flag.clinic_id = target_clinic_id and flag.capability in ('rag_index', 'record_qa');

  return query
  select target_clinic_id,
    case when target_role = 'owner' then 'owner' else 'staff' end,
    target_role,
    target_role <> 'owner' and index_enabled,
    query_enabled,
    count(*)
  from public.ai_document_chunks as chunk
  where chunk.clinic_id = target_clinic_id and chunk.pet_id = requested_pet_id
    and chunk.status = 'ready' and chunk.source_type is not null
    and (target_role <> 'owner' or (
      chunk.approval_status = 'released' and chunk.release_to_client = true
      and chunk.owner_id = target_owner_id
    ));
end;
$$;

create or replace function public.myvet_rag_collect_sources(
  requested_actor_user_id uuid,
  requested_pet_id bigint
)
returns table(
  clinic_id uuid,
  owner_id text,
  pet_id bigint,
  source_type text,
  source_record_id text,
  source_date date,
  source_title text,
  source_content text,
  release_to_client boolean
)
language plpgsql
security definer
set search_path = ''
as $$
declare
  target_clinic_id uuid;
  target_owner_id text;
begin
  select staff.clinic_id, pet.owner_id
  into target_clinic_id, target_owner_id
  from public.staff as staff
  join public.patients as pet on pet.clinic_id = staff.clinic_id
  where staff.auth_user_id = requested_actor_user_id and staff.is_active = true
    and staff.role in ('clinic_admin', 'vet', 'nurse') and pet.pet_id = requested_pet_id
  limit 1;
  if target_clinic_id is null then raise exception 'RAG_INDEX_ACCESS_DENIED'; end if;
  if not exists (
    select 1 from public.ai_feature_flags
    where ai_feature_flags.clinic_id = target_clinic_id
      and ai_feature_flags.capability = 'rag_index'
      and ai_feature_flags.enabled and not ai_feature_flags.kill_switch
  ) then raise exception 'AI_FEATURE_DISABLED'; end if;

  return query
  select visit.clinic_id, target_owner_id, visit.pet_id,
    'medical_visit'::text, visit.visit_id::text, visit.visit_date::date,
    coalesce(nullif(visit.reason, ''), 'ביקור רפואי')::text,
    concat_ws(E'\n',
      nullif('סיבת הביקור: ' || coalesce(visit.reason, ''), 'סיבת הביקור: '),
      nullif('תלונה עיקרית: ' || coalesce(visit.chief_complaint, ''), 'תלונה עיקרית: '),
      nullif('אבחנה: ' || coalesce(visit.final_diagnosis, visit.diagnosis, ''), 'אבחנה: '),
      nullif('טיפול: ' || coalesce(visit.treatment, ''), 'טיפול: '),
      nullif('הערות: ' || coalesce(visit.notes, ''), 'הערות: '),
      nullif('מעקב: ' || coalesce(visit.follow_up_notes, ''), 'מעקב: ')
    )::text,
    false
  from public.medical_visits as visit
  where visit.clinic_id = target_clinic_id and visit.pet_id = requested_pet_id

  union all
  select vaccination.clinic_id, target_owner_id, vaccination.pet_id,
    'vaccination', vaccination.vaccination_id::text, vaccination.given_date,
    coalesce(nullif(vaccination.vaccine_name, ''), 'חיסון'),
    concat_ws(E'\n',
      nullif('חיסון: ' || coalesce(vaccination.vaccine_name, ''), 'חיסון: '),
      nullif('סוג: ' || coalesce(vaccination.vaccine_type, ''), 'סוג: '),
      nullif('יצרן: ' || coalesce(vaccination.manufacturer, ''), 'יצרן: '),
      nullif('מועד הבא: ' || coalesce(vaccination.next_due_date::text, ''), 'מועד הבא: '),
      nullif('הערות: ' || coalesce(vaccination.notes, ''), 'הערות: ')
    ), false
  from public.vaccinations as vaccination
  where vaccination.clinic_id = target_clinic_id and vaccination.pet_id = requested_pet_id

  union all
  select lab.clinic_id, target_owner_id, lab.pet_id,
    'lab_result', lab.lab_order_id::text, coalesce(lab.completed_date::date, lab.test_date, lab.ordered_date::date),
    coalesce(nullif(lab.test_name, ''), 'בדיקת מעבדה'),
    concat_ws(E'\n',
      nullif('בדיקה: ' || coalesce(lab.test_name, ''), 'בדיקה: '),
      nullif('תוצאה: ' || coalesce(lab.results, lab.result_value, ''), 'תוצאה: '),
      nullif('טווח תקין: ' || coalesce(lab.normal_range, ''), 'טווח תקין: '),
      nullif('סטטוס תוצאה: ' || coalesce(lab.result_status, ''), 'סטטוס תוצאה: '),
      nullif('הערות: ' || coalesce(lab.notes, ''), 'הערות: ')
    ), false
  from public.lab_orders as lab
  where lab.clinic_id = target_clinic_id and lab.pet_id = requested_pet_id
    and lower(coalesce(lab.status, '')) in ('completed', 'complete', 'ready', 'done', 'הושלם')

  union all
  select document.clinic_id, target_owner_id, document.pet_id,
    'medical_document', document.document_id::text, document.uploaded_at::date,
    coalesce(nullif(document.file_name, ''), 'מסמך רפואי'),
    concat_ws(E'\n',
      nullif('שם מסמך: ' || coalesce(document.file_name, ''), 'שם מסמך: '),
      nullif('קטגוריה: ' || coalesce(document.category, ''), 'קטגוריה: '),
      nullif('הערות מאושרות: ' || coalesce(document.notes, ''), 'הערות מאושרות: ')
    ), false
  from public.documents as document
  where document.clinic_id = target_clinic_id and document.pet_id = requested_pet_id
    and (nullif(document.notes, '') is not null or nullif(document.file_name, '') is not null)

  union all
  select artifact.clinic_id, target_owner_id, artifact.pet_id,
    case when exists (
      select 1 from public.ai_sources as source
      where source.clinic_id = artifact.clinic_id and source.artifact_id = artifact.artifact_id
        and source.source_type = 'digitalcare'
    ) then 'digitalcare_summary' else 'approved_visit_summary' end,
    artifact.artifact_id::text, artifact.approved_at::date,
    case when exists (
      select 1 from public.ai_sources as source
      where source.clinic_id = artifact.clinic_id and source.artifact_id = artifact.artifact_id
        and source.source_type = 'digitalcare'
    ) then 'סיכום DigitalCare מאושר' else 'סיכום ביקור מאושר' end,
    artifact.content::text,
    artifact.released_to_owner
  from public.ai_artifacts as artifact
  where artifact.clinic_id = target_clinic_id and artifact.pet_id = requested_pet_id
    and artifact.artifact_type = 'visit_summary' and artifact.status = 'approved'
    and artifact.deleted_at is null;
end;
$$;

create or replace function public.myvet_replace_rag_source(
  requested_actor_user_id uuid,
  requested_pet_id bigint,
  requested_source_type text,
  requested_source_record_id text,
  requested_source_fingerprint text,
  requested_provider text,
  requested_model text,
  requested_embedding_version text,
  requested_chunks jsonb
)
returns table(changed boolean, stored_chunks integer)
language plpgsql
security definer
set search_path = ''
as $$
declare
  source_row record;
  item jsonb;
  new_chunk_id uuid;
  item_count integer;
  matching_count integer;
begin
  select * into source_row
  from public.myvet_rag_collect_sources(requested_actor_user_id, requested_pet_id) as source
  where source.source_type = requested_source_type
    and source.source_record_id = requested_source_record_id
  limit 1;
  if source_row.clinic_id is null then raise exception 'RAG_SOURCE_ACCESS_DENIED'; end if;
  if requested_source_fingerprint !~ '^[a-f0-9]{64}$'
    or requested_source_fingerprint <> encode(sha256(convert_to(source_row.source_content, 'UTF8')), 'hex')
    or requested_provider !~ '^[a-z0-9._-]{1,80}$'
    or char_length(requested_model) not between 1 and 120
    or char_length(requested_embedding_version) not between 1 and 80
    or jsonb_typeof(requested_chunks) <> 'array' then
    raise exception 'RAG_INPUT_INVALID';
  end if;
  item_count := jsonb_array_length(requested_chunks);
  if item_count < 1 or item_count > 24 then raise exception 'RAG_INPUT_INVALID'; end if;
  if exists (
    select 1 from jsonb_array_elements(requested_chunks) as chunk(value)
    where jsonb_typeof(chunk.value) <> 'object'
      or (chunk.value ->> 'chunk_index') !~ '^[0-9]{1,2}$'
      or (chunk.value ->> 'content_hash') !~ '^[a-f0-9]{64}$'
      or chunk.value ->> 'content_hash' <>
        encode(sha256(convert_to(chunk.value ->> 'content', 'UTF8')), 'hex')
      or (chunk.value ->> 'embedding_hash') !~ '^[a-f0-9]{64}$'
      or char_length(chunk.value ->> 'content') not between 1 and 12000
      or jsonb_typeof(chunk.value -> 'embedding') <> 'array'
      or jsonb_array_length(chunk.value -> 'embedding') <> 768
  ) then raise exception 'RAG_INPUT_INVALID'; end if;
  if exists (
    select 1
    from jsonb_array_elements(requested_chunks) as chunk(value)
    group by (chunk.value ->> 'chunk_index')
    having count(*) > 1
  ) then raise exception 'RAG_INPUT_INVALID'; end if;

  perform pg_advisory_xact_lock(hashtextextended(
    'rag:' || source_row.clinic_id::text || ':' || requested_pet_id::text || ':'
    || requested_source_type || ':' || requested_source_record_id, 0
  ));

  select count(*) into matching_count
  from public.ai_document_chunks as chunk
  join public.ai_document_embeddings as embedding_row
    on embedding_row.clinic_id = chunk.clinic_id and embedding_row.chunk_id = chunk.chunk_id
  join jsonb_array_elements(requested_chunks) as requested(value)
    on (requested.value ->> 'chunk_index')::integer = chunk.chunk_index
   and requested.value ->> 'content_hash' = chunk.content_hash
   and requested.value ->> 'embedding_hash' = embedding_row.embedding_hash
  where chunk.clinic_id = source_row.clinic_id and chunk.pet_id = requested_pet_id
    and chunk.source_type = requested_source_type
    and chunk.source_record_id = requested_source_record_id
    and chunk.status = 'ready' and embedding_row.status = 'ready'
    and embedding_row.provider = requested_provider
    and embedding_row.model_version = requested_model
    and embedding_row.embedding_version = requested_embedding_version;
  if matching_count = item_count and not exists (
    select 1 from public.ai_document_chunks as chunk
    where chunk.clinic_id = source_row.clinic_id and chunk.pet_id = requested_pet_id
      and chunk.source_type = requested_source_type
      and chunk.source_record_id = requested_source_record_id and chunk.status = 'ready'
      and not exists (
        select 1 from jsonb_array_elements(requested_chunks) as requested(value)
        where (requested.value ->> 'chunk_index')::integer = chunk.chunk_index
          and requested.value ->> 'content_hash' = chunk.content_hash
      )
  ) then return query select false, item_count; return; end if;

  update public.ai_document_embeddings as embedding_row
  set status = 'superseded', updated_at = now()
  from public.ai_document_chunks as chunk
  where chunk.clinic_id = source_row.clinic_id and chunk.pet_id = requested_pet_id
    and chunk.source_type = requested_source_type
    and chunk.source_record_id = requested_source_record_id
    and embedding_row.clinic_id = chunk.clinic_id and embedding_row.chunk_id = chunk.chunk_id
    and embedding_row.status in ('pending', 'ready');
  update public.ai_document_chunks set status = 'superseded', updated_at = now(), release_to_client = false
  where clinic_id = source_row.clinic_id and pet_id = requested_pet_id
    and source_type = requested_source_type and source_record_id = requested_source_record_id
    and status in ('pending', 'ready');

  for item in select value from jsonb_array_elements(requested_chunks) loop
    insert into public.ai_document_chunks(
      clinic_id, owner_id, pet_id, source_type, source_record_id, source_date,
      source_title, chunk_index, content, content_hash, token_count, status,
      approval_status, release_to_client, indexed_at
    ) values (
      source_row.clinic_id, source_row.owner_id, requested_pet_id,
      requested_source_type, requested_source_record_id, source_row.source_date,
      left(source_row.source_title, 240), (item ->> 'chunk_index')::integer,
      item ->> 'content', item ->> 'content_hash',
      greatest(1, ceil(char_length(item ->> 'content') / 4.0)::integer), 'ready',
      case when source_row.release_to_client then 'released' else 'approved' end,
      source_row.release_to_client, now()
    ) returning chunk_id into new_chunk_id;
    insert into public.ai_document_embeddings(
      clinic_id, chunk_id, provider, model_version, embedding_version,
      dimensions, embedding_hash, embedding, status
    ) values (
      source_row.clinic_id, new_chunk_id, requested_provider, requested_model,
      requested_embedding_version, 768, item ->> 'embedding_hash',
      ((item -> 'embedding')::text)::extensions.vector, 'ready'
    );
  end loop;
  return query select true, item_count;
end;
$$;

create or replace function public.myvet_rag_search(
  requested_actor_user_id uuid,
  requested_pet_id bigint,
  requested_query_embedding extensions.vector(768),
  requested_provider text,
  requested_model text,
  requested_embedding_version text,
  requested_match_threshold real default 0.62,
  requested_match_count integer default 6
)
returns table(
  chunk_id uuid,
  source_type text,
  source_record_id text,
  source_date date,
  source_title text,
  content text,
  similarity real
)
language plpgsql
security definer
set search_path = ''
as $$
declare
  target_clinic_id uuid;
  target_owner_id text;
  target_role text;
begin
  if requested_query_embedding is null or requested_match_threshold not between 0 and 1
    or requested_match_count not between 1 and 12 then raise exception 'RAG_INPUT_INVALID'; end if;
  select staff.clinic_id, staff.role into target_clinic_id, target_role
  from public.staff as staff join public.patients as pet on pet.clinic_id = staff.clinic_id
  where staff.auth_user_id = requested_actor_user_id and staff.is_active = true
    and staff.role in ('clinic_admin', 'vet', 'nurse') and pet.pet_id = requested_pet_id limit 1;
  if target_clinic_id is null then
    select owner.clinic_id, owner.owner_id into target_clinic_id, target_owner_id
    from public.owners as owner join public.patients as pet
      on pet.clinic_id = owner.clinic_id and pet.owner_id = owner.owner_id
    where owner.auth_user_id = requested_actor_user_id and pet.pet_id = requested_pet_id limit 1;
    target_role := case when target_clinic_id is null then null else 'owner' end;
  end if;
  if target_clinic_id is null then raise exception 'RAG_ACCESS_DENIED'; end if;
  if not exists (select 1 from public.ai_feature_flags
    where clinic_id = target_clinic_id and capability = 'record_qa'
      and enabled and not kill_switch) then raise exception 'AI_FEATURE_DISABLED'; end if;

  -- Permission and tenant filters are part of this vector query. There is no
  -- global candidate set and no post-search tenant filtering.
  return query
  select chunk.chunk_id, chunk.source_type, chunk.source_record_id,
    chunk.source_date, chunk.source_title, chunk.content,
    (1 - (embedding_row.embedding <=> requested_query_embedding))::real as similarity
  from public.ai_document_embeddings as embedding_row
  join public.ai_document_chunks as chunk
    on chunk.clinic_id = embedding_row.clinic_id and chunk.chunk_id = embedding_row.chunk_id
  where embedding_row.clinic_id = target_clinic_id
    and chunk.clinic_id = target_clinic_id and chunk.pet_id = requested_pet_id
    and chunk.status = 'ready' and embedding_row.status = 'ready'
    and chunk.approval_status in ('approved', 'released')
    and chunk.source_type in (
      'medical_visit', 'vaccination', 'lab_result', 'medical_document',
      'approved_visit_summary', 'digitalcare_summary', 'document_extraction'
    )
    and embedding_row.provider = requested_provider
    and embedding_row.model_version = requested_model
    and embedding_row.embedding_version = requested_embedding_version
    and (target_role <> 'owner' or (
      chunk.owner_id = target_owner_id and chunk.approval_status = 'released'
      and chunk.release_to_client = true
    ))
    and 1 - (embedding_row.embedding <=> requested_query_embedding) >= requested_match_threshold
  order by embedding_row.embedding <=> requested_query_embedding
  limit least(requested_match_count, 12);
end;
$$;

create or replace function public.myvet_record_rag_event(
  requested_actor_user_id uuid,
  requested_pet_id bigint,
  requested_request_id uuid,
  requested_event_type text,
  requested_outcome text,
  requested_provider text default null,
  requested_model text default null,
  requested_prompt_version text default null,
  requested_latency_ms integer default null,
  requested_input_tokens integer default null,
  requested_output_tokens integer default null,
  requested_error_code text default null
)
returns void
language plpgsql
security definer
set search_path = ''
as $$
declare
  target_clinic_id uuid;
  target_owner_id text;
  target_staff_id uuid;
  new_operation_id uuid;
begin
  if requested_event_type not in (
    'request_received', 'provider_completed', 'provider_failed', 'output_rejected',
    'access_denied', 'rate_limited', 'feature_disabled', 'index_started',
    'index_completed', 'index_failed', 'rag_query_completed', 'rag_no_results',
    'suspicious_request'
  ) or requested_outcome not in ('success', 'failed', 'blocked') then return; end if;
  select staff.clinic_id, staff.staff_id into target_clinic_id, target_staff_id
  from public.staff as staff join public.patients as pet on pet.clinic_id = staff.clinic_id
  where staff.auth_user_id = requested_actor_user_id and staff.is_active = true
    and staff.role in ('clinic_admin','vet','nurse') and pet.pet_id = requested_pet_id limit 1;
  if target_clinic_id is null then
    select owner.clinic_id, owner.owner_id into target_clinic_id, target_owner_id
    from public.owners as owner join public.patients as pet
      on pet.clinic_id = owner.clinic_id and pet.owner_id = owner.owner_id
    where owner.auth_user_id = requested_actor_user_id and pet.pet_id = requested_pet_id limit 1;
  end if;
  if target_clinic_id is null then return; end if;
  insert into public.ai_operations(
    clinic_id, capability, actor_user_id, actor_staff_id, owner_id, pet_id,
    status, idempotency_key, provider, model_version, prompt_version,
    latency_ms, input_tokens, output_tokens, error_code, started_at, completed_at
  ) values (
    target_clinic_id, case when requested_event_type like 'index_%' then 'rag_index' else 'record_qa' end,
    requested_actor_user_id, target_staff_id, target_owner_id, requested_pet_id,
    case when requested_outcome = 'success' then 'succeeded' else 'failed' end,
    'rag:' || requested_request_id::text || ':' || requested_event_type,
    left(requested_provider,80), left(requested_model,120), left(requested_prompt_version,120),
    greatest(requested_latency_ms,0), greatest(requested_input_tokens,0), greatest(requested_output_tokens,0),
    case when requested_error_code ~ '^[A-Z0-9_]{1,80}$' then requested_error_code else null end,
    now(), now()
  ) on conflict (clinic_id, capability, idempotency_key) where idempotency_key is not null
  do update set updated_at = public.ai_operations.updated_at
  returning operation_id into new_operation_id;
  insert into public.ai_audit_events(
    clinic_id, actor_user_id, operation_id, capability, event_type, outcome,
    provider, model_version, prompt_version, latency_ms, input_tokens,
    output_tokens, error_code
  ) values (
    target_clinic_id, requested_actor_user_id, new_operation_id,
    case when requested_event_type like 'index_%' then 'rag_index' else 'record_qa' end,
    requested_event_type, requested_outcome, left(requested_provider,80),
    left(requested_model,120), left(requested_prompt_version,120),
    greatest(requested_latency_ms,0), greatest(requested_input_tokens,0),
    greatest(requested_output_tokens,0),
    case when requested_error_code ~ '^[A-Z0-9_]{1,80}$' then requested_error_code else null end
  );
end;
$$;

revoke all on function public.myvet_rag_status(uuid,bigint) from public, anon, authenticated;
revoke all on function public.myvet_rag_collect_sources(uuid,bigint) from public, anon, authenticated;
revoke all on function public.myvet_replace_rag_source(uuid,bigint,text,text,text,text,text,text,jsonb) from public, anon, authenticated;
revoke all on function public.myvet_rag_search(uuid,bigint,extensions.vector, text,text,text,real,integer) from public, anon, authenticated;
revoke all on function public.myvet_record_rag_event(uuid,bigint,uuid,text,text,text,text,text,integer,integer,integer,text) from public, anon, authenticated;
grant execute on function public.myvet_rag_status(uuid,bigint) to service_role;
grant execute on function public.myvet_rag_collect_sources(uuid,bigint) to service_role;
grant execute on function public.myvet_replace_rag_source(uuid,bigint,text,text,text,text,text,text,jsonb) to service_role;
grant execute on function public.myvet_rag_search(uuid,bigint,extensions.vector,text,text,text,real,integer) to service_role;
grant execute on function public.myvet_record_rag_event(uuid,bigint,uuid,text,text,text,text,text,integer,integer,integer,text) to service_role;

comment on function public.myvet_rag_search(uuid,bigint,extensions.vector,text,text,text,real,integer) is
  'Service-only vector search with clinic, pet, role, approval and client-release filters inside the query.';
