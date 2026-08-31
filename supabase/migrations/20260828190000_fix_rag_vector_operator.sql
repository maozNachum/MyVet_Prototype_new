-- Fix pgvector operator lookup while keeping the SECURITY DEFINER search_path locked.
-- No table or data changes are performed.

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
    or requested_match_count not between 1 and 12 then
    raise exception 'RAG_INPUT_INVALID';
  end if;

  select staff.clinic_id, staff.role into target_clinic_id, target_role
  from public.staff as staff
  join public.patients as pet on pet.clinic_id = staff.clinic_id
  where staff.auth_user_id = requested_actor_user_id
    and staff.is_active = true
    and staff.role in ('clinic_admin', 'vet', 'nurse')
    and pet.pet_id = requested_pet_id
  limit 1;

  if target_clinic_id is null then
    select owner.clinic_id, owner.owner_id into target_clinic_id, target_owner_id
    from public.owners as owner
    join public.patients as pet
      on pet.clinic_id = owner.clinic_id
     and pet.owner_id = owner.owner_id
    where owner.auth_user_id = requested_actor_user_id
      and pet.pet_id = requested_pet_id
    limit 1;
    target_role := case when target_clinic_id is null then null else 'owner' end;
  end if;

  if target_clinic_id is null then
    raise exception 'RAG_ACCESS_DENIED';
  end if;

  if not exists (
    select 1
    from public.ai_feature_flags
    where clinic_id = target_clinic_id
      and capability = 'record_qa'
      and enabled
      and not kill_switch
  ) then
    raise exception 'AI_FEATURE_DISABLED';
  end if;

  return query
  select
    chunk.chunk_id,
    chunk.source_type,
    chunk.source_record_id,
    chunk.source_date,
    chunk.source_title,
    chunk.content,
    (
      1 - (
        embedding_row.embedding
        operator(extensions.<=>)
        requested_query_embedding
      )
    )::real as similarity
  from public.ai_document_embeddings as embedding_row
  join public.ai_document_chunks as chunk
    on chunk.clinic_id = embedding_row.clinic_id
   and chunk.chunk_id = embedding_row.chunk_id
  where embedding_row.clinic_id = target_clinic_id
    and chunk.clinic_id = target_clinic_id
    and chunk.pet_id = requested_pet_id
    and chunk.status = 'ready'
    and embedding_row.status = 'ready'
    and chunk.approval_status in ('approved', 'released')
    and chunk.source_type in (
      'medical_visit',
      'vaccination',
      'lab_result',
      'medical_document',
      'approved_visit_summary',
      'digitalcare_summary',
      'document_extraction'
    )
    and embedding_row.provider = requested_provider
    and embedding_row.model_version = requested_model
    and embedding_row.embedding_version = requested_embedding_version
    and (
      target_role <> 'owner'
      or (
        chunk.owner_id = target_owner_id
        and chunk.approval_status = 'released'
        and chunk.release_to_client = true
      )
    )
    and 1 - (
      embedding_row.embedding
      operator(extensions.<=>)
      requested_query_embedding
    ) >= requested_match_threshold
  order by
    embedding_row.embedding
    operator(extensions.<=>)
    requested_query_embedding
  limit least(requested_match_count, 12);
end;
$$;

comment on function public.myvet_rag_search(
  uuid, bigint, extensions.vector, text, text, text, real, integer
) is
  'Service-only vector search with clinic, pet, role, approval and client-release filters inside the query.';

