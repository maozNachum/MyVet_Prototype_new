-- F-022: technical object ownership must never outlive an active staff
-- membership. Linked records continue to use their tenant-aware staff checks,
-- and owner-portal access remains governed by the separate owner policies.

drop policy if exists myvet_staff_documents_select on storage.objects;
create policy myvet_staff_documents_select
on storage.objects for select to authenticated
using (
  bucket_id = 'documents'
  and (
    (
      owner = (select auth.uid())
      and (select public.myvet_is_active_staff())
    )
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

drop policy if exists myvet_staff_documents_update on storage.objects;
create policy myvet_staff_documents_update
on storage.objects for update to authenticated
using (
  bucket_id = 'documents'
  and (
    (
      owner = (select auth.uid())
      and (select public.myvet_is_active_staff())
    )
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
with check (
  bucket_id = 'documents'
  and (select public.myvet_is_active_staff())
);

drop policy if exists myvet_staff_documents_delete on storage.objects;
create policy myvet_staff_documents_delete
on storage.objects for delete to authenticated
using (
  bucket_id = 'documents'
  and (
    (
      owner = (select auth.uid())
      and (select public.myvet_is_active_staff())
    )
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

drop policy if exists myvet_staff_chat_select on storage.objects;
create policy myvet_staff_chat_select
on storage.objects for select to authenticated
using (
  bucket_id = 'chat-attachments'
  and (
    (
      owner = (select auth.uid())
      and (select public.myvet_is_active_staff())
    )
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

drop policy if exists myvet_staff_chat_update on storage.objects;
create policy myvet_staff_chat_update
on storage.objects for update to authenticated
using (
  bucket_id = 'chat-attachments'
  and (
    (
      owner = (select auth.uid())
      and (select public.myvet_is_active_staff())
    )
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
with check (
  bucket_id = 'chat-attachments'
  and (select public.myvet_is_active_staff())
);

drop policy if exists myvet_staff_chat_delete on storage.objects;
create policy myvet_staff_chat_delete
on storage.objects for delete to authenticated
using (
  bucket_id = 'chat-attachments'
  and (
    (
      owner = (select auth.uid())
      and (select public.myvet_is_active_staff())
    )
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
