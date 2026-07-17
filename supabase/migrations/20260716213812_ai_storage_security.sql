-- Stage 2 / 4 of 4: private Storage buckets and tenant-aware object policies.
-- Existing object names remain valid. New AI buckets require:
--   <clinic_uuid>/<pet_id>/<category>/<opaque-file-name>

insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
values
  (
    'ai-medical-documents', 'ai-medical-documents', false, 15728640,
    array['application/pdf','image/jpeg','image/png','image/webp']::text[]
  ),
  (
    'ai-recordings', 'ai-recordings', false, 52428800,
    array['audio/mpeg','audio/mp4','audio/ogg','audio/wav','audio/webm','video/mp4','video/webm']::text[]
  )
on conflict (id) do update
set public = false,
    file_size_limit = excluded.file_size_limit,
    allowed_mime_types = excluded.allowed_mime_types;

update storage.buckets
set public = false,
    file_size_limit = case
      when id = 'documents' then 15728640
      when id = 'chat-attachments' then 10485760
      else file_size_limit
    end,
    allowed_mime_types = case
      when id = 'documents' then array[
        'application/pdf','image/jpeg','image/png','image/webp','text/html','text/plain'
      ]::text[]
      when id = 'chat-attachments' then array[
        'application/pdf','image/jpeg','image/png','image/webp','text/plain',
        'application/msword',
        'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
        'application/octet-stream'
      ]::text[]
      else allowed_mime_types
    end
where id in ('documents', 'chat-attachments');

create or replace function private.myvet_storage_path_clinic_id(object_name text)
returns uuid
language plpgsql
immutable
set search_path = ''
as $$
begin
  return nullif((storage.foldername(object_name))[1], '')::uuid;
exception when invalid_text_representation or array_subscript_error then
  return null;
end;
$$;

create or replace function private.myvet_storage_path_pet_id(object_name text)
returns bigint
language plpgsql
immutable
set search_path = ''
as $$
begin
  return nullif((storage.foldername(object_name))[2], '')::bigint;
exception when invalid_text_representation or array_subscript_error then
  return null;
end;
$$;

revoke all on function private.myvet_storage_path_clinic_id(text) from public, anon;
revoke all on function private.myvet_storage_path_pet_id(text) from public, anon;
grant execute on function private.myvet_storage_path_clinic_id(text) to authenticated, service_role;
grant execute on function private.myvet_storage_path_pet_id(text) to authenticated, service_role;

-- Remove every anonymous/PUBLIC and prototype/demo policy from Storage. These
-- policies were proven unsafe in the live metadata audit. Replacements are
-- created below before this migration commits.
do $$
declare
  policy_row record;
begin
  for policy_row in
    select schemaname, tablename, policyname
    from pg_policies
    where schemaname = 'storage'
      and tablename = 'objects'
      and (
        'anon' = any(roles)
        or 'public' = any(roles)
        or policyname ilike '%demo%'
        or policyname ilike 'allow anon%'
      )
  loop
    execute format(
      'drop policy if exists %I on %I.%I',
      policy_row.policyname,
      policy_row.schemaname,
      policy_row.tablename
    );
  end loop;
end $$;

drop policy if exists myvet_active_staff_storage on storage.objects;

-- Existing medical documents: reads/updates/deletes must be linked to a
-- database document in the same clinic, or be an object uploaded by this user
-- but not yet linked. INSERT is limited to active clinical staff and upsert is
-- still protected by the UPDATE rule.
drop policy if exists myvet_staff_documents_select on storage.objects;
create policy myvet_staff_documents_select
on storage.objects for select to authenticated
using (
  bucket_id = 'documents'
  and (
    owner = (select auth.uid())
    or exists (
      select 1 from public.documents as document
      where document.file_path = storage.objects.name
        and private.myvet_is_clinic_staff(
          document.clinic_id,
          array['clinic_admin','vet','nurse']::text[]
        )
    )
  )
);

drop policy if exists myvet_staff_documents_insert on storage.objects;
create policy myvet_staff_documents_insert
on storage.objects for insert to authenticated
with check (
  bucket_id = 'documents'
  and private.myvet_is_clinic_staff(
    private.myvet_current_clinic_id(),
    array['clinic_admin','vet','nurse']::text[]
  )
);

drop policy if exists myvet_staff_documents_update on storage.objects;
create policy myvet_staff_documents_update
on storage.objects for update to authenticated
using (
  bucket_id = 'documents'
  and (
    owner = (select auth.uid())
    or exists (
      select 1 from public.documents as document
      where document.file_path = storage.objects.name
        and private.myvet_is_clinic_staff(
          document.clinic_id,
          array['clinic_admin','vet','nurse']::text[]
        )
    )
  )
)
with check (bucket_id = 'documents');

drop policy if exists myvet_staff_documents_delete on storage.objects;
create policy myvet_staff_documents_delete
on storage.objects for delete to authenticated
using (
  bucket_id = 'documents'
  and (
    owner = (select auth.uid())
    or exists (
      select 1 from public.documents as document
      where document.file_path = storage.objects.name
        and private.myvet_is_clinic_staff(
          document.clinic_id,
          array['clinic_admin','vet','nurse']::text[]
        )
    )
  )
);

-- Existing chat attachments use the linked conversation as the tenant source.
drop policy if exists myvet_staff_chat_select on storage.objects;
create policy myvet_staff_chat_select
on storage.objects for select to authenticated
using (
  bucket_id = 'chat-attachments'
  and (
    owner = (select auth.uid())
    or exists (
      select 1
      from public.message_attachments as attachment
      join public.conversations as conversation
        on conversation.conversation_id = attachment.conversation_id
       and conversation.clinic_id = attachment.clinic_id
      where attachment.file_path = storage.objects.name
        and private.myvet_is_clinic_staff(conversation.clinic_id, null)
    )
  )
);

drop policy if exists myvet_staff_chat_insert on storage.objects;
create policy myvet_staff_chat_insert
on storage.objects for insert to authenticated
with check (
  bucket_id = 'chat-attachments'
  and private.myvet_is_clinic_staff(private.myvet_current_clinic_id(), null)
);

drop policy if exists myvet_staff_chat_update on storage.objects;
create policy myvet_staff_chat_update
on storage.objects for update to authenticated
using (
  bucket_id = 'chat-attachments'
  and (
    owner = (select auth.uid())
    or exists (
      select 1
      from public.message_attachments as attachment
      join public.conversations as conversation
        on conversation.conversation_id = attachment.conversation_id
       and conversation.clinic_id = attachment.clinic_id
      where attachment.file_path = storage.objects.name
        and private.myvet_is_clinic_staff(conversation.clinic_id, null)
    )
  )
)
with check (bucket_id = 'chat-attachments');

drop policy if exists myvet_staff_chat_delete on storage.objects;
create policy myvet_staff_chat_delete
on storage.objects for delete to authenticated
using (
  bucket_id = 'chat-attachments'
  and (
    owner = (select auth.uid())
    or exists (
      select 1
      from public.message_attachments as attachment
      join public.conversations as conversation
        on conversation.conversation_id = attachment.conversation_id
       and conversation.clinic_id = attachment.clinic_id
      where attachment.file_path = storage.objects.name
        and private.myvet_is_clinic_staff(conversation.clinic_id, null)
    )
  )
);

-- Owner access remains limited to linked rows that existing RLS says they own.
drop policy if exists myvet_owner_documents_select on storage.objects;
create policy myvet_owner_documents_select
on storage.objects for select to authenticated
using (
  bucket_id = 'documents'
  and exists (
    select 1 from public.documents as document
    where document.file_path = storage.objects.name
      and private.myvet_owner_owns_pet(document.clinic_id, document.pet_id)
  )
);

drop policy if exists myvet_owner_chat_select on storage.objects;
create policy myvet_owner_chat_select
on storage.objects for select to authenticated
using (
  bucket_id = 'chat-attachments'
  and exists (
    select 1 from public.message_attachments as attachment
    where attachment.file_path = storage.objects.name
      and public.myvet_conversation_owned(attachment.conversation_id::text)
  )
);

drop policy if exists myvet_owner_chat_insert on storage.objects;
create policy myvet_owner_chat_insert
on storage.objects for insert to authenticated
with check (
  bucket_id = 'chat-attachments'
  and (storage.foldername(name))[1] = public.myvet_current_owner_id()
  and public.myvet_conversation_owned((storage.foldername(name))[2])
);

drop policy if exists myvet_owner_chat_delete on storage.objects;
create policy myvet_owner_chat_delete
on storage.objects for delete to authenticated
using (
  bucket_id = 'chat-attachments'
  and (storage.foldername(name))[1] = public.myvet_current_owner_id()
  and public.myvet_conversation_owned((storage.foldername(name))[2])
);

-- Future AI buckets require both a valid tenant prefix and a pet belonging to
-- that tenant. Owners receive no direct Storage policy; a future server flow
-- may issue a short-lived signed URL only after an approved release check.
drop policy if exists myvet_ai_medical_staff_all on storage.objects;
create policy myvet_ai_medical_staff_all
on storage.objects for all to authenticated
using (
  bucket_id = 'ai-medical-documents'
  and private.myvet_is_clinic_staff(
    private.myvet_storage_path_clinic_id(name),
    array['clinic_admin','vet','nurse']::text[]
  )
  and exists (
    select 1 from public.patients as pet
    where pet.clinic_id = private.myvet_storage_path_clinic_id(name)
      and pet.pet_id = private.myvet_storage_path_pet_id(name)
  )
)
with check (
  bucket_id = 'ai-medical-documents'
  and private.myvet_is_clinic_staff(
    private.myvet_storage_path_clinic_id(name),
    array['clinic_admin','vet','nurse']::text[]
  )
  and exists (
    select 1 from public.patients as pet
    where pet.clinic_id = private.myvet_storage_path_clinic_id(name)
      and pet.pet_id = private.myvet_storage_path_pet_id(name)
  )
  and array_length(storage.foldername(name), 1) >= 3
);

drop policy if exists myvet_ai_recordings_clinical_all on storage.objects;
create policy myvet_ai_recordings_clinical_all
on storage.objects for all to authenticated
using (
  bucket_id = 'ai-recordings'
  and private.myvet_is_clinic_staff(
    private.myvet_storage_path_clinic_id(name),
    array['clinic_admin','vet']::text[]
  )
  and exists (
    select 1 from public.patients as pet
    where pet.clinic_id = private.myvet_storage_path_clinic_id(name)
      and pet.pet_id = private.myvet_storage_path_pet_id(name)
  )
)
with check (
  bucket_id = 'ai-recordings'
  and private.myvet_is_clinic_staff(
    private.myvet_storage_path_clinic_id(name),
    array['clinic_admin','vet']::text[]
  )
  and exists (
    select 1 from public.patients as pet
    where pet.clinic_id = private.myvet_storage_path_clinic_id(name)
      and pet.pet_id = private.myvet_storage_path_pet_id(name)
  )
  and array_length(storage.foldername(name), 1) >= 3
);

comment on function private.myvet_storage_path_clinic_id(text) is
  'Safely parses the tenant prefix from an AI Storage object path; invalid paths resolve to NULL and fail closed.';
