-- Critical confidentiality hardening for the existing MyVet schema.
-- The public anon key must never expose clinic, owner, medical or billing rows.

create or replace function public.myvet_is_active_staff()
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select exists (
    select 1
    from public.staff
    where auth_user_id = auth.uid()
      and is_active = true
  );
$$;

create or replace function public.myvet_current_owner_id()
returns text
language sql
stable
security definer
set search_path = public
as $$
  select owner_id::text
  from public.owners
  where auth_user_id = auth.uid()
  limit 1;
$$;

create or replace function public.myvet_owner_matches(candidate_owner_id text)
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select candidate_owner_id is not null
    and candidate_owner_id = public.myvet_current_owner_id();
$$;

create or replace function public.myvet_pet_owned(candidate_pet_id text)
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select exists (
    select 1
    from public.patients
    where pet_id::text = candidate_pet_id
      and public.myvet_owner_matches(owner_id::text)
  );
$$;

create or replace function public.myvet_conversation_owned(candidate_conversation_id text)
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select exists (
    select 1
    from public.conversations
    where conversation_id::text = candidate_conversation_id
      and public.myvet_owner_matches(owner_id::text)
  );
$$;

revoke all on function public.myvet_is_active_staff() from public;
revoke all on function public.myvet_current_owner_id() from public;
revoke all on function public.myvet_owner_matches(text) from public;
revoke all on function public.myvet_pet_owned(text) from public;
revoke all on function public.myvet_conversation_owned(text) from public;
grant execute on function public.myvet_is_active_staff() to authenticated, service_role;
grant execute on function public.myvet_current_owner_id() to authenticated, service_role;
grant execute on function public.myvet_owner_matches(text) to authenticated, service_role;
grant execute on function public.myvet_pet_owned(text) to authenticated, service_role;
grant execute on function public.myvet_conversation_owned(text) to authenticated, service_role;

do $$
declare
  table_name text;
  protected_tables text[] := array[
    'staff', 'owners', 'patients', 'appointments', 'payments', 'payment_items',
    'medical_visits', 'physical_exams', 'medical_problems', 'differential_diagnoses',
    'prescriptions', 'lab_orders', 'documents', 'hospitalizations', 'conversations',
    'messages', 'message_attachments', 'video_sessions', 'notifications', 'reminders',
    'vaccinations', 'inventory', 'service_catalog'
  ];
begin
  foreach table_name in array protected_tables loop
    if to_regclass(format('public.%I', table_name)) is not null then
      execute format('alter table public.%I enable row level security', table_name);
      execute format('revoke all privileges on table public.%I from anon', table_name);
      execute format('drop policy if exists "myvet_active_staff_all" on public.%I', table_name);
      execute format(
        'create policy "myvet_active_staff_all" on public.%I for all to authenticated using (public.myvet_is_active_staff()) with check (public.myvet_is_active_staff())',
        table_name
      );
    end if;
  end loop;
end $$;

-- Owners may only see or update their own profile. New profiles must be bound
-- to the currently authenticated account.
drop policy if exists "myvet_owner_select_own" on public.owners;
create policy "myvet_owner_select_own" on public.owners for select to authenticated
  using (auth_user_id = auth.uid());
drop policy if exists "myvet_owner_update_own" on public.owners;
create policy "myvet_owner_update_own" on public.owners for update to authenticated
  using (auth_user_id = auth.uid()) with check (auth_user_id = auth.uid());
drop policy if exists "myvet_owner_insert_own" on public.owners;
create policy "myvet_owner_insert_own" on public.owners for insert to authenticated
  with check (auth_user_id = auth.uid());

do $$
declare
  policy_spec text;
  table_name text;
  predicate text;
  owner_select_policies text[] := array[
    'patients|public.myvet_owner_matches(owner_id::text)',
    'appointments|public.myvet_pet_owned(pet_id::text)',
    'payments|public.myvet_owner_matches(owner_id::text)',
    'medical_visits|public.myvet_pet_owned(pet_id::text)',
    'physical_exams|public.myvet_pet_owned(pet_id::text)',
    'medical_problems|public.myvet_pet_owned(pet_id::text)',
    'differential_diagnoses|public.myvet_pet_owned(pet_id::text)',
    'prescriptions|public.myvet_pet_owned(pet_id::text)',
    'lab_orders|public.myvet_pet_owned(pet_id::text)',
    'documents|public.myvet_pet_owned(pet_id::text)',
    'hospitalizations|public.myvet_pet_owned(pet_id::text)',
    'conversations|public.myvet_owner_matches(owner_id::text)',
    'messages|public.myvet_conversation_owned(conversation_id::text)',
    'message_attachments|public.myvet_conversation_owned(conversation_id::text)',
    'video_sessions|public.myvet_owner_matches(owner_id::text)',
    'notifications|public.myvet_owner_matches(owner_id::text)',
    'reminders|public.myvet_owner_matches(owner_id::text)',
    'vaccinations|public.myvet_pet_owned(pet_id::text)'
  ];
begin
  foreach policy_spec in array owner_select_policies loop
    table_name := split_part(policy_spec, '|', 1);
    predicate := split_part(policy_spec, '|', 2);
    if to_regclass(format('public.%I', table_name)) is not null then
      execute format('drop policy if exists "myvet_owner_select_own" on public.%I', table_name);
      execute format(
        'create policy "myvet_owner_select_own" on public.%I for select to authenticated using (%s)',
        table_name,
        predicate
      );
    end if;
  end loop;
end $$;

-- Owner mutations are limited to rows that already belong to their account.
drop policy if exists "myvet_owner_appointments_insert" on public.appointments;
create policy "myvet_owner_appointments_insert" on public.appointments for insert to authenticated
  with check (public.myvet_pet_owned(pet_id::text));
drop policy if exists "myvet_owner_appointments_update" on public.appointments;
create policy "myvet_owner_appointments_update" on public.appointments for update to authenticated
  using (public.myvet_pet_owned(pet_id::text)) with check (public.myvet_pet_owned(pet_id::text));
drop policy if exists "myvet_owner_appointments_delete" on public.appointments;
create policy "myvet_owner_appointments_delete" on public.appointments for delete to authenticated
  using (public.myvet_pet_owned(pet_id::text));

drop policy if exists "myvet_owner_conversations_insert" on public.conversations;
create policy "myvet_owner_conversations_insert" on public.conversations for insert to authenticated
  with check (public.myvet_owner_matches(owner_id::text));
drop policy if exists "myvet_owner_conversations_update" on public.conversations;
create policy "myvet_owner_conversations_update" on public.conversations for update to authenticated
  using (public.myvet_owner_matches(owner_id::text)) with check (public.myvet_owner_matches(owner_id::text));
drop policy if exists "myvet_owner_conversations_delete" on public.conversations;
create policy "myvet_owner_conversations_delete" on public.conversations for delete to authenticated
  using (public.myvet_owner_matches(owner_id::text));

drop policy if exists "myvet_owner_messages_insert" on public.messages;
create policy "myvet_owner_messages_insert" on public.messages for insert to authenticated
  with check (
    public.myvet_conversation_owned(conversation_id::text)
    and sender_type = 'owner'
    and public.myvet_owner_matches(sender_owner_id::text)
  );
drop policy if exists "myvet_owner_messages_delete" on public.messages;
create policy "myvet_owner_messages_delete" on public.messages for delete to authenticated
  using (
    public.myvet_conversation_owned(conversation_id::text)
    and sender_type = 'owner'
    and public.myvet_owner_matches(sender_owner_id::text)
  );

drop policy if exists "myvet_owner_attachments_insert" on public.message_attachments;
create policy "myvet_owner_attachments_insert" on public.message_attachments for insert to authenticated
  with check (public.myvet_conversation_owned(conversation_id::text));
drop policy if exists "myvet_owner_attachments_delete" on public.message_attachments;
create policy "myvet_owner_attachments_delete" on public.message_attachments for delete to authenticated
  using (public.myvet_conversation_owned(conversation_id::text));

drop policy if exists "myvet_owner_video_insert" on public.video_sessions;
create policy "myvet_owner_video_insert" on public.video_sessions for insert to authenticated
  with check (
    public.myvet_owner_matches(owner_id::text)
    and public.myvet_conversation_owned(conversation_id::text)
  );

-- Link an unclaimed owner profile only when its email is verified by Supabase Auth.
create or replace function public.claim_owner_profile()
returns text
language plpgsql
security definer
set search_path = public
as $$
declare
  claimed_owner_id text;
  verified_email text := lower(coalesce(auth.jwt() ->> 'email', ''));
begin
  if auth.uid() is null or verified_email = '' then
    raise exception 'AUTH_REQUIRED';
  end if;

  update public.owners
  set auth_user_id = auth.uid()
  where owner_id = (
    select candidate.owner_id
    from public.owners as candidate
    where candidate.auth_user_id is null
      and lower(candidate.email) = verified_email
    order by candidate.owner_id
    limit 1
  )
  returning owner_id::text into claimed_owner_id;

  return claimed_owner_id;
end;
$$;
revoke all on function public.claim_owner_profile() from public;
grant execute on function public.claim_owner_profile() to authenticated;

-- Owners need anonymous-free availability information, not access to other
-- clients' appointment rows or notes.
create or replace function public.myvet_booked_slots(range_start timestamptz, range_end timestamptz)
returns table(slot_start timestamptz, slot_end timestamptz)
language sql
stable
security definer
set search_path = public
as $$
  select appointment.start_time, appointment.end_time
  from public.appointments as appointment
  where auth.uid() is not null
    and appointment.start_time >= range_start
    and appointment.start_time <= range_end;
$$;
revoke all on function public.myvet_booked_slots(timestamptz, timestamptz) from public;
grant execute on function public.myvet_booked_slots(timestamptz, timestamptz) to authenticated;

comment on function public.claim_owner_profile() is 'Claims a single unlinked owner row using the verified JWT email; never accepts an email argument.';
comment on function public.myvet_booked_slots(timestamptz, timestamptz) is 'Returns occupied times only, without appointment, owner, pet or note data.';

-- Medical and chat files must be private. Access is checked when creating a
-- signed URL; durable public URLs are not used by the application.
update storage.buckets
set public = false
where id in ('documents', 'chat-attachments');

drop policy if exists "myvet_active_staff_storage" on storage.objects;
create policy "myvet_active_staff_storage" on storage.objects for all to authenticated
  using (
    bucket_id in ('documents', 'chat-attachments')
    and public.myvet_is_active_staff()
  )
  with check (
    bucket_id in ('documents', 'chat-attachments')
    and public.myvet_is_active_staff()
  );

drop policy if exists "myvet_owner_documents_select" on storage.objects;
create policy "myvet_owner_documents_select" on storage.objects for select to authenticated
  using (
    bucket_id = 'documents'
    and exists (
      select 1
      from public.documents as document
      where document.file_path = storage.objects.name
        and public.myvet_pet_owned(document.pet_id::text)
    )
  );

drop policy if exists "myvet_owner_chat_select" on storage.objects;
create policy "myvet_owner_chat_select" on storage.objects for select to authenticated
  using (
    bucket_id = 'chat-attachments'
    and exists (
      select 1
      from public.message_attachments as attachment
      where attachment.file_path = storage.objects.name
        and public.myvet_conversation_owned(attachment.conversation_id::text)
    )
  );

drop policy if exists "myvet_owner_chat_insert" on storage.objects;
create policy "myvet_owner_chat_insert" on storage.objects for insert to authenticated
  with check (
    bucket_id = 'chat-attachments'
    and (storage.foldername(name))[1] = public.myvet_current_owner_id()
    and public.myvet_conversation_owned((storage.foldername(name))[2])
  );

drop policy if exists "myvet_owner_chat_delete" on storage.objects;
create policy "myvet_owner_chat_delete" on storage.objects for delete to authenticated
  using (
    bucket_id = 'chat-attachments'
    and (storage.foldername(name))[1] = public.myvet_current_owner_id()
    and public.myvet_conversation_owned((storage.foldername(name))[2])
  );
