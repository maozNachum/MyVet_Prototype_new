-- Stage 5 / 1 of 2: secure medical-record RAG storage and lifecycle.
-- The embedding dimension is intentionally fixed. Changing it requires a
-- separate re-index migration; mixed dimensions are never searched together.

create schema if not exists extensions;
create extension if not exists vector with schema extensions;

alter table public.ai_document_chunks
  alter column document_id drop not null,
  add column if not exists owner_id text null,
  add column if not exists pet_id bigint null,
  add column if not exists source_type text null,
  add column if not exists source_record_id text null,
  add column if not exists source_date date null,
  add column if not exists source_title text null,
  add column if not exists release_to_client boolean not null default false,
  add column if not exists indexed_at timestamptz null;

alter table public.ai_document_chunks
  add constraint ai_document_chunks_owner_fkey
    foreign key (clinic_id, owner_id) references public.owners(clinic_id, owner_id) on delete restrict,
  add constraint ai_document_chunks_pet_fkey
    foreign key (clinic_id, pet_id) references public.patients(clinic_id, pet_id) on delete cascade,
  add constraint ai_document_chunks_source_type_check check (
    source_type is null or source_type in (
      'medical_visit', 'vaccination', 'lab_result', 'medical_document',
      'approved_visit_summary', 'digitalcare_summary', 'document_extraction'
    )
  ),
  add constraint ai_document_chunks_source_identity_check check (
    (source_type is null and source_record_id is null)
    or (source_type is not null and source_record_id is not null
      and char_length(source_record_id) between 1 and 160)
  ),
  add constraint ai_document_chunks_source_title_check check (
    source_title is null or char_length(source_title) between 1 and 240
  ),
  add constraint ai_document_chunks_rag_scope_check check (
    source_type is null or (pet_id is not null and owner_id is not null)
  ),
  add constraint ai_document_chunks_client_release_check check (
    not release_to_client or (approval_status = 'released' and status = 'ready')
  );

create unique index if not exists ai_document_chunks_active_source_idx
  on public.ai_document_chunks (clinic_id, pet_id, source_type, source_record_id, chunk_index)
  where source_type is not null and status in ('pending', 'ready');
create index if not exists ai_document_chunks_rag_scope_idx
  on public.ai_document_chunks (
    clinic_id, pet_id, approval_status, release_to_client, source_type, source_date desc
  ) where status = 'ready' and source_type is not null;

alter table public.ai_document_embeddings
  add column if not exists embedding extensions.vector(768) null,
  add column if not exists embedding_version text null;

alter table public.ai_document_embeddings drop constraint if exists ai_document_embeddings_status_check;
alter table public.ai_document_embeddings add constraint ai_document_embeddings_status_check
  check (status in ('pending', 'ready', 'failed', 'superseded'));
alter table public.ai_document_embeddings add constraint ai_document_embeddings_version_check
  check (embedding_version is null or char_length(embedding_version) between 1 and 80);
alter table public.ai_document_embeddings add constraint ai_document_embeddings_ready_check
  check (
    status <> 'ready'
    or (embedding is not null and dimensions = 768 and embedding_version is not null)
  );

create index if not exists ai_document_embeddings_rag_filter_idx
  on public.ai_document_embeddings (
    clinic_id, provider, model_version, embedding_version, status, chunk_id
  );
create index if not exists ai_document_embeddings_hnsw_idx
  on public.ai_document_embeddings using hnsw (embedding extensions.vector_cosine_ops)
  with (m = 16, ef_construction = 64);

alter table public.ai_operations drop constraint if exists ai_operations_capability_check;
alter table public.ai_operations add constraint ai_operations_capability_check check (capability in (
  'vetbot', 'visit_summary', 'digitalcare_transcription', 'digitalcare_recording',
  'digitalcare_summary', 'record_qa', 'rag_index', 'document_ocr',
  'client_explanation', 'reminder_suggestion'
));

alter table public.ai_feature_flags drop constraint if exists ai_feature_flags_capability_check;
alter table public.ai_feature_flags add constraint ai_feature_flags_capability_check check (capability in (
  'vetbot', 'vetbot_actions', 'appointment_actions', 'visit_summary',
  'digitalcare_transcription', 'digitalcare_recording', 'digitalcare_summary',
  'record_qa', 'rag_index', 'document_ocr', 'client_explanation', 'reminder_suggestion'
));

alter table public.ai_audit_events drop constraint if exists ai_audit_events_event_type_check;
alter table public.ai_audit_events add constraint ai_audit_events_event_type_check check (event_type in (
  'request_received', 'provider_completed', 'provider_failed', 'output_rejected',
  'draft_created', 'approval_recorded', 'release_recorded', 'access_denied',
  'rate_limited', 'feature_disabled', 'consent_recorded', 'capture_started',
  'capture_stopped', 'transcript_created', 'file_accessed', 'retention_deleted',
  'index_started', 'index_completed', 'index_failed', 'rag_query_completed',
  'rag_no_results', 'suspicious_request'
));

insert into public.ai_feature_flags (clinic_id, capability, enabled, kill_switch, configuration)
select clinic.clinic_id, capability.name, false, false, capability.configuration
from public.clinics as clinic
cross join (values
  ('rag_index'::text, '{"embedding_dimensions":768,"max_chunks_per_source":24}'::jsonb),
  ('record_qa'::text, '{"max_results":6,"minimum_similarity":0.62}'::jsonb)
) as capability(name, configuration)
on conflict (clinic_id, capability) do nothing;

-- RAG content is returned only through the permission-filtered service RPC.
-- Browser sessions do not receive raw chunks or vector payloads directly.
revoke all privileges on table public.ai_document_embeddings from anon, authenticated;
revoke all privileges on table public.ai_document_chunks from anon, authenticated;
grant all privileges on table public.ai_document_chunks, public.ai_document_embeddings to service_role;
drop policy if exists ai_chunks_clinical_select on public.ai_document_chunks;

alter table public.ai_document_chunks enable row level security;
alter table public.ai_document_chunks force row level security;
alter table public.ai_document_embeddings enable row level security;
alter table public.ai_document_embeddings force row level security;

-- Source changes immediately invalidate stale vectors. Re-indexing is an
-- explicit server operation so database triggers never call external AI.
create or replace function private.myvet_invalidate_rag_source()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
declare
  row_data jsonb := case when tg_op = 'DELETE' then to_jsonb(old) else to_jsonb(new) end;
  target_clinic_id uuid;
  target_pet_id bigint;
  target_source_id text;
  target_source_type text := tg_argv[0];
begin
  target_clinic_id := nullif(row_data ->> 'clinic_id', '')::uuid;
  target_pet_id := nullif(row_data ->> 'pet_id', '')::bigint;
  target_source_id := row_data ->> tg_argv[1];

  if target_clinic_id is null or target_pet_id is null or target_source_id is null then
    return null;
  end if;

  update public.ai_document_embeddings as embedding_row
  set status = 'superseded', updated_at = now()
  from public.ai_document_chunks as chunk
  where chunk.clinic_id = target_clinic_id
    and chunk.pet_id = target_pet_id
    and chunk.source_type = target_source_type
    and chunk.source_record_id = target_source_id
    and embedding_row.clinic_id = chunk.clinic_id
    and embedding_row.chunk_id = chunk.chunk_id
    and embedding_row.status in ('pending', 'ready');

  update public.ai_document_chunks
  set status = 'superseded', updated_at = now(), release_to_client = false
  where clinic_id = target_clinic_id and pet_id = target_pet_id
    and source_type = target_source_type and source_record_id = target_source_id
    and status in ('pending', 'ready');

  return null;
end;
$$;

drop trigger if exists myvet_rag_invalidate_medical_visit on public.medical_visits;
create trigger myvet_rag_invalidate_medical_visit
after update or delete on public.medical_visits for each row
execute function private.myvet_invalidate_rag_source('medical_visit', 'visit_id');

drop trigger if exists myvet_rag_invalidate_vaccination on public.vaccinations;
create trigger myvet_rag_invalidate_vaccination
after update or delete on public.vaccinations for each row
execute function private.myvet_invalidate_rag_source('vaccination', 'vaccination_id');

drop trigger if exists myvet_rag_invalidate_lab on public.lab_orders;
create trigger myvet_rag_invalidate_lab
after update or delete on public.lab_orders for each row
execute function private.myvet_invalidate_rag_source('lab_result', 'lab_order_id');

drop trigger if exists myvet_rag_invalidate_document on public.documents;
create trigger myvet_rag_invalidate_document
after update or delete on public.documents for each row
execute function private.myvet_invalidate_rag_source('medical_document', 'document_id');

create or replace function private.myvet_invalidate_rag_artifact()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
declare
  row_data jsonb := case when tg_op = 'DELETE' then to_jsonb(old) else to_jsonb(new) end;
  source_kind text;
begin
  source_kind := case
    when row_data ->> 'artifact_type' = 'document_extraction' then 'document_extraction'
    when row_data ->> 'artifact_type' = 'visit_summary' then
      case when exists (
        select 1 from public.ai_sources
        where clinic_id = (row_data ->> 'clinic_id')::uuid
          and artifact_id = (row_data ->> 'artifact_id')::uuid
          and source_type = 'digitalcare'
      ) then 'digitalcare_summary' else 'approved_visit_summary' end
    else null
  end;
  if source_kind is null then return null; end if;
  update public.ai_document_embeddings as embedding_row
  set status = 'superseded', updated_at = now()
  from public.ai_document_chunks as chunk
  where chunk.clinic_id = (row_data ->> 'clinic_id')::uuid
    and chunk.source_type = source_kind
    and chunk.source_record_id = row_data ->> 'artifact_id'
    and embedding_row.clinic_id = chunk.clinic_id
    and embedding_row.chunk_id = chunk.chunk_id
    and embedding_row.status in ('pending', 'ready');
  update public.ai_document_chunks set status = 'superseded', updated_at = now(), release_to_client = false
  where clinic_id = (row_data ->> 'clinic_id')::uuid and source_type = source_kind
    and source_record_id = row_data ->> 'artifact_id' and status in ('pending', 'ready');
  return null;
end;
$$;

drop trigger if exists myvet_rag_invalidate_artifact on public.ai_artifacts;
create trigger myvet_rag_invalidate_artifact
after update or delete on public.ai_artifacts for each row
execute function private.myvet_invalidate_rag_artifact();

revoke all on function private.myvet_invalidate_rag_source() from public, anon, authenticated;
revoke all on function private.myvet_invalidate_rag_artifact() from public, anon, authenticated;

comment on column public.ai_document_embeddings.embedding is
  'Stage 5 fixed-dimension (768) vector. Model/provider changes require re-indexing.';
comment on column public.ai_document_chunks.release_to_client is
  'Explicit release gate for owner RAG. Approval alone is not sufficient.';
