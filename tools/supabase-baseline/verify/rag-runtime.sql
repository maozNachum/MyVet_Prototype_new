\set ON_ERROR_STOP on

begin;

insert into auth.users (id)
values ('11111111-1111-4111-8111-111111111111');

insert into public.clinics (clinic_id, slug, display_name)
values ('aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa', 'baseline-a', 'Synthetic clinic A');

insert into public.staff (
  staff_id, clinic_id, auth_user_id, full_name, role, is_active
) values (
  '22222222-2222-4222-8222-222222222222',
  'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa',
  '11111111-1111-4111-8111-111111111111',
  'Synthetic veterinarian',
  'vet',
  true
);

insert into public.owners (
  owner_id, clinic_id, owner_first_name, owner_last_name
) values (
  'SYNTHETIC-OWNER-A',
  'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa',
  'Synthetic',
  'Owner'
);

insert into public.patients (
  pet_id, clinic_id, owner_id, pet_name, weight
) values (
  900001,
  'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa',
  'SYNTHETIC-OWNER-A',
  'Synthetic pet',
  10
);

update public.ai_feature_flags
set enabled = true, kill_switch = false
where clinic_id = 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa'
  and capability = 'record_qa';

insert into public.ai_document_chunks (
  chunk_id, clinic_id, chunk_index, content, content_hash, status,
  approval_status, owner_id, pet_id, source_type, source_record_id,
  source_date, source_title, release_to_client
) values (
  '33333333-3333-4333-8333-333333333333',
  'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa',
  0,
  'Synthetic approved medical source for vector runtime verification.',
  repeat('a', 64),
  'ready',
  'approved',
  'SYNTHETIC-OWNER-A',
  900001,
  'medical_visit',
  'synthetic-visit-a',
  date '2026-01-01',
  'Synthetic visit',
  false
);

insert into public.ai_document_embeddings (
  embedding_id, clinic_id, chunk_id, provider, model_version, dimensions,
  embedding_hash, status, embedding, embedding_version
) values (
  '44444444-4444-4444-8444-444444444444',
  'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa',
  '33333333-3333-4333-8333-333333333333',
  'synthetic-provider',
  'synthetic-model',
  768,
  repeat('b', 64),
  'ready',
  array_fill(0.1::real, array[768])::extensions.vector,
  'synthetic-v1'
);

do $$
declare
  result_count integer;
begin
  select count(*) into result_count
  from public.myvet_rag_search(
    '11111111-1111-4111-8111-111111111111',
    900001,
    array_fill(0.1::real, array[768])::extensions.vector,
    'synthetic-provider',
    'synthetic-model',
    'synthetic-v1',
    0.62,
    6
  );

  if result_count <> 1 then
    raise exception 'Expected one authorized RAG result, got %', result_count;
  end if;
end;
$$;

rollback;

do $$
begin
  if exists (select 1 from public.clinics where slug = 'baseline-a')
    or exists (
      select 1
      from public.ai_document_chunks
      where source_record_id = 'synthetic-visit-a'
    ) then
    raise exception 'Synthetic RAG verification data remained after rollback';
  end if;
end;
$$;

select
  (select count(*) from public.clinics where slug = 'baseline-a') as remaining_clinics,
  (select count(*) from public.ai_document_chunks where source_record_id = 'synthetic-visit-a') as remaining_chunks;
