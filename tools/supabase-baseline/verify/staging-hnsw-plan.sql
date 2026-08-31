\set ON_ERROR_STOP on

begin;

insert into public.clinics (clinic_id, slug, display_name)
values (
  'aa000000-0000-4000-8000-000000000001',
  'staging-hnsw-plan',
  'Synthetic HNSW verification clinic'
);

insert into public.ai_document_chunks (
  chunk_id,
  clinic_id,
  chunk_index,
  content,
  content_hash,
  status,
  approval_status
)
select
  gen_random_uuid(),
  'aa000000-0000-4000-8000-000000000001'::uuid,
  item_number,
  'Synthetic vector source ' || item_number,
  encode(extensions.digest('staging-hnsw-' || item_number, 'sha256'), 'hex'),
  'ready',
  'approved'
from generate_series(1, 5000) as item_number;

insert into public.ai_document_embeddings (
  clinic_id,
  chunk_id,
  provider,
  model_version,
  dimensions,
  embedding_hash,
  status,
  embedding,
  embedding_version
)
select
  chunk.clinic_id,
  chunk.chunk_id,
  'synthetic-provider',
  'synthetic-model',
  768,
  encode(extensions.digest('staging-hnsw-embedding-' || chunk.chunk_index, 'sha256'), 'hex'),
  'ready',
  array_fill(((chunk.chunk_index % 10) + 1)::real / 10, array[768])::extensions.vector,
  'synthetic-v1'
from public.ai_document_chunks as chunk
where chunk.clinic_id = 'aa000000-0000-4000-8000-000000000001';

analyze public.ai_document_embeddings;

-- Do not disable sequential scans here. The acceptance gate must demonstrate
-- that PostgreSQL naturally chooses the HNSW index at a representative table
-- size, not merely that the index can be forced.

do $$
declare
  plan json;
begin
  execute $query$
    explain (format json)
    select embedding_id
    from public.ai_document_embeddings
    order by embedding OPERATOR(extensions.<=>)
      array_fill(0.1::real, array[768])::extensions.vector
    limit 6
  $query$
  into plan;

  if plan::text not like '%ai_document_embeddings_hnsw_idx%' then
    raise exception 'HNSW_INDEX_NOT_USED: %', plan::text;
  end if;
end;
$$;

rollback;

do $$
begin
  if exists (
    select 1 from public.clinics where slug = 'staging-hnsw-plan'
  ) then
    raise exception 'STAGING_HNSW_CLEANUP_FAILED';
  end if;
end;
$$;

select 'staging_hnsw_plan_passed' as result;
