\set ON_ERROR_STOP on

begin;

insert into auth.users (id, aud, role, email, created_at, updated_at)
values
  ('20000000-0000-4000-8000-000000000003', 'authenticated', 'authenticated', 'f022-vet@example.invalid', now(), now()),
  ('20000000-0000-4000-8000-000000000004', 'authenticated', 'authenticated', 'f022-nurse@example.invalid', now(), now()),
  ('20000000-0000-4000-8000-000000000005', 'authenticated', 'authenticated', 'f022-admin-b@example.invalid', now(), now()),
  ('20000000-0000-4000-8000-000000000006', 'authenticated', 'authenticated', 'f022-owner@example.invalid', now(), now());

insert into public.clinics (clinic_id, slug, display_name)
values
  ('20000000-0000-4000-8000-000000000001', 'f022-clinic-a', 'F-022 Clinic A'),
  ('20000000-0000-4000-8000-000000000002', 'f022-clinic-b', 'F-022 Clinic B');

insert into public.staff (clinic_id, auth_user_id, role, is_active, name)
values
  ('20000000-0000-4000-8000-000000000001', '20000000-0000-4000-8000-000000000003', 'vet', true, 'F-022 Vet A'),
  ('20000000-0000-4000-8000-000000000001', '20000000-0000-4000-8000-000000000004', 'nurse', true, 'F-022 Nurse A'),
  ('20000000-0000-4000-8000-000000000002', '20000000-0000-4000-8000-000000000005', 'clinic_admin', true, 'F-022 Admin B');

insert into public.owners (owner_id, auth_user_id, email, clinic_id)
values (
  'F022-OWNER-A',
  '20000000-0000-4000-8000-000000000006',
  'f022-owner@example.invalid',
  '20000000-0000-4000-8000-000000000001'
);

insert into public.patients (pet_id, pet_name, weight, owner_id, clinic_id)
values (
  922001,
  'F-022 Pet',
  1,
  'F022-OWNER-A',
  '20000000-0000-4000-8000-000000000001'
);

insert into storage.objects (id, bucket_id, name, owner, owner_id)
values
  (
    '20000000-0000-4000-8000-000000000011',
    'documents',
    'f022/unlinked-document.txt',
    '20000000-0000-4000-8000-000000000003',
    '20000000-0000-4000-8000-000000000003'
  ),
  (
    '20000000-0000-4000-8000-000000000012',
    'documents',
    'f022/linked-document.txt',
    '20000000-0000-4000-8000-000000000003',
    '20000000-0000-4000-8000-000000000003'
  ),
  (
    '20000000-0000-4000-8000-000000000013',
    'chat-attachments',
    'f022/unlinked-chat.txt',
    '20000000-0000-4000-8000-000000000003',
    '20000000-0000-4000-8000-000000000003'
  );

insert into public.documents (
  owner_id,
  pet_id,
  file_name,
  file_path,
  mime_type,
  file_size,
  category,
  uploaded_by,
  uploaded_by_role,
  clinic_id
)
values (
  'F022-OWNER-A',
  922001,
  'linked-document.txt',
  'f022/linked-document.txt',
  'text/plain',
  32,
  'other',
  '20000000-0000-4000-8000-000000000003',
  'staff',
  '20000000-0000-4000-8000-000000000001'
);

-- Supabase protects direct object-table deletion so clients must use the
-- Storage API. Disable only that statement trigger inside this transaction to
-- exercise the DELETE RLS policy itself; ROLLBACK restores the trigger.
set local role supabase_storage_admin;
alter table storage.objects disable trigger protect_objects_delete;
reset role;

select set_config('request.jwt.claim.sub', '20000000-0000-4000-8000-000000000003', true);
select set_config('request.jwt.claim.role', 'authenticated', true);
select set_config('request.jwt.claims', '{"sub":"20000000-0000-4000-8000-000000000003","role":"authenticated","aal":"aal2"}', true);
set local role authenticated;

do $$
declare
  visible_count integer;
begin
  select count(*) into visible_count
  from storage.objects
  where id in (
    '20000000-0000-4000-8000-000000000011',
    '20000000-0000-4000-8000-000000000012',
    '20000000-0000-4000-8000-000000000013'
  );

  if visible_count <> 3 then
    raise exception 'Active uploader expected 3 Storage objects, found %', visible_count;
  end if;
end;
$$;

reset role;
update public.staff
set is_active = false
where auth_user_id = '20000000-0000-4000-8000-000000000003';

select set_config('request.jwt.claim.sub', '20000000-0000-4000-8000-000000000003', true);
select set_config('request.jwt.claim.role', 'authenticated', true);
select set_config('request.jwt.claims', '{"sub":"20000000-0000-4000-8000-000000000003","role":"authenticated","aal":"aal2"}', true);
set local role authenticated;

do $$
declare
  affected_count integer;
begin
  if exists (
    select 1 from storage.objects
    where id in (
      '20000000-0000-4000-8000-000000000011',
      '20000000-0000-4000-8000-000000000012',
      '20000000-0000-4000-8000-000000000013'
    )
  ) then
    raise exception 'Inactive staff retained SELECT access to owned Storage objects';
  end if;

  update storage.objects
  set metadata = '{"blocked":true}'::jsonb
  where id = '20000000-0000-4000-8000-000000000011';
  get diagnostics affected_count = row_count;
  if affected_count <> 0 then
    raise exception 'Inactive staff retained UPDATE access to an owned Storage object';
  end if;

  delete from storage.objects
  where id = '20000000-0000-4000-8000-000000000013';
  get diagnostics affected_count = row_count;
  if affected_count <> 0 then
    raise exception 'Inactive staff retained DELETE access to an owned Storage object';
  end if;

  begin
    insert into storage.objects (bucket_id, name, owner, owner_id)
    values (
      'documents',
      'f022/blocked-new-document.txt',
      '20000000-0000-4000-8000-000000000003',
      '20000000-0000-4000-8000-000000000003'
    );
    raise exception 'Inactive staff retained INSERT access to Storage';
  exception
    when insufficient_privilege then null;
  end;
end;
$$;

reset role;
select set_config('request.jwt.claim.sub', '20000000-0000-4000-8000-000000000004', true);
select set_config('request.jwt.claim.role', 'authenticated', true);
select set_config('request.jwt.claims', '{"sub":"20000000-0000-4000-8000-000000000004","role":"authenticated","aal":"aal1"}', true);
set local role authenticated;

do $$
begin
  if (select count(*) from storage.objects where name = 'f022/linked-document.txt') <> 1 then
    raise exception 'Active same-clinic nurse lost access to the linked document';
  end if;

  if exists (select 1 from storage.objects where name = 'f022/unlinked-document.txt') then
    raise exception 'Same-clinic nurse gained access to an unlinked object';
  end if;
end;
$$;

reset role;
select set_config('request.jwt.claim.sub', '20000000-0000-4000-8000-000000000005', true);
select set_config('request.jwt.claim.role', 'authenticated', true);
select set_config('request.jwt.claims', '{"sub":"20000000-0000-4000-8000-000000000005","role":"authenticated","aal":"aal2"}', true);
set local role authenticated;

do $$
begin
  if exists (select 1 from storage.objects where name = 'f022/linked-document.txt') then
    raise exception 'Cross-clinic staff gained access to a linked document';
  end if;
end;
$$;

reset role;
select set_config('request.jwt.claim.sub', '20000000-0000-4000-8000-000000000006', true);
select set_config('request.jwt.claim.role', 'authenticated', true);
select set_config('request.jwt.claims', '{"sub":"20000000-0000-4000-8000-000000000006","role":"authenticated","aal":"aal1"}', true);
set local role authenticated;

do $$
begin
  if (select count(*) from storage.objects where name = 'f022/linked-document.txt') <> 1 then
    raise exception 'Authorized owner lost access to the linked document';
  end if;
end;
$$;

reset role;
rollback;
