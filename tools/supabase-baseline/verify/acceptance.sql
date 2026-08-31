\set ON_ERROR_STOP on

do $$
declare
  missing_tables text[];
  missing_realtime text[];
  public_bucket_count integer;
  sensitive_without_rls integer;
  hnsw_count integer;
  storage_policy_count integer;
  anonymous_definer_count integer;
  unconditional_policy_count integer;
begin
  select array_agg(required.name order by required.name)
  into missing_tables
  from (values
    ('appointments'), ('owners'), ('patients'), ('staff'),
    ('medical_visits'), ('vaccinations'), ('inventory'),
    ('payments'), ('documents'), ('conversations'), ('messages'),
    ('ai_operations'), ('ai_artifacts'), ('ai_document_chunks'),
    ('ai_document_embeddings')
  ) as required(name)
  where to_regclass('public.' || required.name) is null;

  if missing_tables is not null then
    raise exception 'Missing required public tables: %', missing_tables;
  end if;

  select count(*)
  into sensitive_without_rls
  from pg_class c
  join pg_namespace n on n.oid = c.relnamespace
  where n.nspname = 'public'
    and c.relkind in ('r', 'p')
    and not c.relrowsecurity;

  if sensitive_without_rls <> 0 then
    raise exception '% public tables do not have RLS enabled', sensitive_without_rls;
  end if;

  select count(*) into anonymous_definer_count
  from pg_proc p
  join pg_namespace n on n.oid = p.pronamespace
  where n.nspname in ('public','private','myvet_private')
    and p.prosecdef
    and has_function_privilege('anon', p.oid, 'execute');

  if anonymous_definer_count <> 0 then
    raise exception '% SECURITY DEFINER functions are executable by anon', anonymous_definer_count;
  end if;

  select count(*) into unconditional_policy_count
  from pg_policies
  where schemaname in ('public','storage')
    and (coalesce(qual, '') = 'true' or coalesce(with_check, '') = 'true');

  if unconditional_policy_count <> 0 then
    raise exception '% unconditional RLS policies were found', unconditional_policy_count;
  end if;

  select count(*) into public_bucket_count
  from storage.buckets
  where id in ('documents','chat-attachments','ai-medical-documents','ai-recordings')
    and public;

  if public_bucket_count <> 0 then
    raise exception 'A sensitive Storage bucket is public';
  end if;

  if (select count(*) from storage.buckets where id in (
    'documents','chat-attachments','ai-medical-documents','ai-recordings'
  )) <> 4 then
    raise exception 'Not all four verified Storage buckets exist';
  end if;

  select count(*) into storage_policy_count
  from pg_policies
  where schemaname = 'storage'
    and tablename = 'objects';

  if storage_policy_count <> 14 then
    raise exception 'Expected 14 verified Storage object policies, found %', storage_policy_count;
  end if;

  select array_agg(required.name order by required.name)
  into missing_realtime
  from (values
    ('appointments'), ('conversations'), ('hospitalizations'), ('inventory'),
    ('lab_orders'), ('messages'), ('owners'), ('patients'), ('payments'),
    ('vaccinations')
  ) as required(name)
  where not exists (
    select 1 from pg_publication_tables p
    where p.pubname = 'supabase_realtime'
      and p.schemaname = 'public'
      and p.tablename = required.name
  );

  if missing_realtime is not null then
    raise exception 'Missing Realtime publication members: %', missing_realtime;
  end if;

  select count(*) into hnsw_count
  from pg_indexes
  where schemaname = 'public'
    and indexname = 'ai_document_embeddings_hnsw_idx'
    and indexdef ilike '% using hnsw %'
    and indexdef ilike '%embedding%'
    and indexdef ilike '%vector_cosine_ops%';

  if hnsw_count <> 1 then
    raise exception 'The expected embeddings HNSW index or vector_cosine_ops configuration is missing';
  end if;

  if exists (
    select 1
    from pg_proc p
    join pg_namespace n on n.oid = p.pronamespace
    where n.nspname in ('public','private','myvet_private')
      and p.prosecdef
      and not exists (
        select 1
        from unnest(coalesce(p.proconfig, array[]::text[])) as setting(value)
        where setting.value like 'search_path=%'
      )
  ) then
    raise exception 'A SECURITY DEFINER function lacks an explicit search_path';
  end if;
end;
$$;

select
  (select count(*) from pg_tables where schemaname = 'public') as public_tables,
  (select count(*) from pg_policies where schemaname = 'public') as public_policies,
  (select count(*) from pg_policies where schemaname = 'storage' and tablename = 'objects') as storage_policies,
  (select count(*) from pg_indexes where schemaname = 'public' and indexdef ilike '% using hnsw %') as hnsw_indexes,
  (select count(*) from storage.buckets where not public) as private_buckets;
