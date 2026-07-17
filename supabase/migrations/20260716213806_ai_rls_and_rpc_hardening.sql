-- Stage 2 / 3 of 4: RLS, least-privilege grants, RPC hardening and
-- compatibility policies. No AI capability is enabled by this migration.

create or replace function public.myvet_is_active_staff()
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select (select auth.uid()) is not null
    and exists (
      select 1 from public.staff
      where auth_user_id = (select auth.uid())
        and is_active = true
    );
$$;

create or replace function public.myvet_current_owner_id()
returns text
language sql
stable
security definer
set search_path = ''
as $$
  select owner_id
  from public.owners
  where auth_user_id = (select auth.uid())
  limit 1;
$$;

create or replace function public.myvet_owner_matches(candidate_owner_id text)
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select candidate_owner_id is not null
    and exists (
      select 1 from public.owners
      where owner_id = candidate_owner_id
        and auth_user_id = (select auth.uid())
    );
$$;

create or replace function public.myvet_pet_owned(candidate_pet_id text)
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select candidate_pet_id is not null
    and exists (
      select 1
      from public.patients as pet
      join public.owners as owner
        on owner.owner_id = pet.owner_id
       and owner.clinic_id = pet.clinic_id
      where pet.pet_id::text = candidate_pet_id
        and owner.auth_user_id = (select auth.uid())
    );
$$;

create or replace function public.myvet_conversation_owned(candidate_conversation_id text)
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select candidate_conversation_id is not null
    and exists (
      select 1
      from public.conversations as conversation
      join public.owners as owner
        on owner.owner_id = conversation.owner_id
       and owner.clinic_id = conversation.clinic_id
      where conversation.conversation_id::text = candidate_conversation_id
        and owner.auth_user_id = (select auth.uid())
    );
$$;

create or replace function public.claim_owner_profile()
returns text
language plpgsql
security definer
set search_path = ''
as $$
declare
  claimed_owner_id text;
  verified_email text := lower(coalesce((select auth.jwt()) ->> 'email', ''));
begin
  if (select auth.uid()) is null or verified_email = '' then
    raise exception 'AUTH_REQUIRED';
  end if;

  update public.owners
  set auth_user_id = (select auth.uid())
  where owner_id = (
    select candidate.owner_id
    from public.owners as candidate
    where candidate.auth_user_id is null
      and lower(candidate.email) = verified_email
    order by candidate.owner_id
    limit 1
  )
  returning owner_id into claimed_owner_id;

  return claimed_owner_id;
end;
$$;

-- The Stage 1 action orchestrator intentionally does not accept clinic_id from
-- the browser. Derive it from the verified actor before the generic tenant
-- guard runs, including after a second clinic is introduced.
create or replace function private.myvet_assign_vetbot_actor_clinic()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
declare
  actor_clinics uuid[];
begin
  select array_agg(distinct membership.clinic_id)
  into actor_clinics
  from (
    select clinic_id from public.staff
    where auth_user_id = new.actor_id and is_active = true
    union
    select clinic_id from public.owners
    where auth_user_id = new.actor_id
  ) as membership;

  if coalesce(cardinality(actor_clinics), 0) = 0 then
    raise exception 'ACTOR_TENANT_NOT_FOUND';
  end if;

  if new.clinic_id is null then
    if cardinality(actor_clinics) <> 1 then
      raise exception 'ACTOR_TENANT_AMBIGUOUS';
    end if;
    new.clinic_id := actor_clinics[1];
  elsif not (new.clinic_id = any(actor_clinics)) then
    raise exception 'ACTOR_TENANT_MISMATCH';
  end if;

  return new;
end;
$$;

drop trigger if exists a_myvet_assign_vetbot_actor_clinic on public.vetbot_action_requests;
create trigger a_myvet_assign_vetbot_actor_clinic
before insert on public.vetbot_action_requests
for each row execute function private.myvet_assign_vetbot_actor_clinic();

-- Existing tables keep their original single-column foreign keys for backward
-- compatibility. This defense-in-depth trigger adds the missing tenant part to
-- every legacy relationship without renaming or dropping those constraints.
create or replace function private.myvet_validate_legacy_tenant_scope()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
declare
  row_data jsonb := case when tg_op = 'DELETE' then to_jsonb(old) else to_jsonb(new) end;
  target_clinic_id uuid := nullif(row_data ->> 'clinic_id', '')::uuid;
  target_owner_id text := coalesce(
    nullif(row_data ->> 'owner_id', ''), nullif(row_data ->> 'related_owner_id', ''),
    nullif(row_data ->> 'sender_owner_id', '')
  );
  target_pet_id bigint := coalesce(
    nullif(row_data ->> 'pet_id', '')::bigint,
    nullif(row_data ->> 'related_pet_id', '')::bigint
  );
  target_visit_id bigint := coalesce(
    nullif(row_data ->> 'visit_id', '')::bigint,
    nullif(row_data ->> 'related_visit_id', '')::bigint
  );
  target_appointment_id bigint := coalesce(
    nullif(row_data ->> 'appointment_id', '')::bigint,
    nullif(row_data ->> 'related_appointment_id', '')::bigint
  );
  target_staff_id uuid := coalesce(
    nullif(row_data ->> 'assigned_staff_id', '')::uuid,
    nullif(row_data ->> 'ordered_by', '')::uuid,
    nullif(row_data ->> 'prescribed_by', '')::uuid,
    nullif(row_data ->> 'sender_staff_id', '')::uuid,
    nullif(row_data ->> 'staff_id', '')::uuid
  );
  target_payment_id bigint := coalesce(
    nullif(row_data ->> 'payment_id', '')::bigint,
    nullif(row_data ->> 'related_payment_id', '')::bigint
  );
  target_conversation_id bigint := nullif(row_data ->> 'conversation_id', '')::bigint;
  target_message_id bigint := nullif(row_data ->> 'message_id', '')::bigint;
  target_lab_order_id bigint := coalesce(
    nullif(row_data ->> 'lab_order_id', '')::bigint,
    nullif(row_data ->> 'related_lab_order_id', '')::bigint
  );
begin
  if target_clinic_id is null then raise exception 'TENANT_REQUIRED'; end if;

  if target_owner_id is not null and tg_table_name <> 'owners'
    and not exists (select 1 from public.owners where clinic_id = target_clinic_id and owner_id = target_owner_id) then
    raise exception 'OWNER_TENANT_MISMATCH';
  end if;
  if target_pet_id is not null and tg_table_name <> 'patients'
    and not exists (select 1 from public.patients where clinic_id = target_clinic_id and pet_id = target_pet_id) then
    raise exception 'PET_TENANT_MISMATCH';
  end if;
  if target_visit_id is not null and tg_table_name <> 'medical_visits'
    and not exists (select 1 from public.medical_visits where clinic_id = target_clinic_id and visit_id = target_visit_id) then
    raise exception 'VISIT_TENANT_MISMATCH';
  end if;
  if target_appointment_id is not null and tg_table_name <> 'appointments'
    and not exists (select 1 from public.appointments where clinic_id = target_clinic_id and appointment_id = target_appointment_id) then
    raise exception 'APPOINTMENT_TENANT_MISMATCH';
  end if;
  if target_staff_id is not null and tg_table_name <> 'staff'
    and not exists (select 1 from public.staff where clinic_id = target_clinic_id and staff_id = target_staff_id) then
    raise exception 'STAFF_TENANT_MISMATCH';
  end if;
  if target_payment_id is not null and tg_table_name <> 'payments'
    and not exists (select 1 from public.payments where clinic_id = target_clinic_id and payment_id = target_payment_id) then
    raise exception 'PAYMENT_TENANT_MISMATCH';
  end if;
  if target_conversation_id is not null and tg_table_name <> 'conversations'
    and not exists (select 1 from public.conversations where clinic_id = target_clinic_id and conversation_id = target_conversation_id) then
    raise exception 'CONVERSATION_TENANT_MISMATCH';
  end if;
  if target_message_id is not null and tg_table_name <> 'messages'
    and not exists (select 1 from public.messages where clinic_id = target_clinic_id and message_id = target_message_id) then
    raise exception 'MESSAGE_TENANT_MISMATCH';
  end if;
  if target_lab_order_id is not null and tg_table_name <> 'lab_orders'
    and not exists (select 1 from public.lab_orders where clinic_id = target_clinic_id and lab_order_id = target_lab_order_id) then
    raise exception 'LAB_ORDER_TENANT_MISMATCH';
  end if;

  if target_owner_id is not null and target_pet_id is not null and tg_table_name <> 'patients'
    and not exists (
      select 1 from public.patients
      where clinic_id = target_clinic_id and pet_id = target_pet_id and owner_id = target_owner_id
    ) then
    raise exception 'OWNER_PET_SCOPE_MISMATCH';
  end if;
  if target_visit_id is not null and target_pet_id is not null and tg_table_name <> 'medical_visits'
    and not exists (
      select 1 from public.medical_visits
      where clinic_id = target_clinic_id and visit_id = target_visit_id and pet_id = target_pet_id
    ) then
    raise exception 'VISIT_PET_SCOPE_MISMATCH';
  end if;
  if target_appointment_id is not null and target_pet_id is not null and tg_table_name <> 'appointments'
    and not exists (
      select 1 from public.appointments
      where clinic_id = target_clinic_id and appointment_id = target_appointment_id and pet_id = target_pet_id
    ) then
    raise exception 'APPOINTMENT_PET_SCOPE_MISMATCH';
  end if;
  if target_conversation_id is not null and target_owner_id is not null and tg_table_name <> 'conversations'
    and not exists (
      select 1 from public.conversations
      where clinic_id = target_clinic_id and conversation_id = target_conversation_id and owner_id = target_owner_id
    ) then
    raise exception 'CONVERSATION_OWNER_SCOPE_MISMATCH';
  end if;

  if tg_op = 'DELETE' then return old; end if;
  return new;
end;
$$;

create or replace function private.myvet_enforce_tenant_write()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
declare
  old_data jsonb := case when tg_op = 'INSERT' then '{}'::jsonb else to_jsonb(old) end;
  new_data jsonb := case when tg_op = 'DELETE' then '{}'::jsonb else to_jsonb(new) end;
  target_clinic_id uuid := coalesce(
    nullif(new_data ->> 'clinic_id', '')::uuid,
    nullif(old_data ->> 'clinic_id', '')::uuid
  );
  jwt_role text := coalesce(
    nullif(current_setting('request.jwt.claim.role', true), ''),
    nullif(current_setting('request.jwt.claims', true), '')::jsonb ->> 'role',
    ''
  );
begin
  if target_clinic_id is null then
    raise exception 'TENANT_REQUIRED';
  end if;

  if tg_op = 'UPDATE'
    and nullif(old_data ->> 'clinic_id', '')::uuid
        is distinct from nullif(new_data ->> 'clinic_id', '')::uuid then
    raise exception 'TENANT_CHANGE_FORBIDDEN';
  end if;

  if (select auth.uid()) is null then
    if jwt_role = 'service_role' or session_user in ('postgres', 'supabase_admin') then
      if tg_op = 'DELETE' then return old; end if;
      return new;
    end if;
    raise exception 'AUTH_REQUIRED';
  end if;

  -- Compatibility for the existing verified-email claim flow. The function
  -- above still performs the email match; this exception only lets its update
  -- pass the generic tenant guard.
  if tg_table_schema = 'public' and tg_table_name = 'owners' and tg_op = 'UPDATE'
    and nullif(old_data ->> 'auth_user_id', '') is null
    and nullif(new_data ->> 'auth_user_id', '')::uuid = (select auth.uid())
    and nullif(old_data ->> 'clinic_id', '')::uuid = target_clinic_id then
    return new;
  end if;

  if tg_table_schema = 'public' and tg_table_name = 'owners' and tg_op = 'INSERT'
    and nullif(new_data ->> 'auth_user_id', '')::uuid = (select auth.uid())
    and target_clinic_id = private.myvet_current_clinic_id() then
    return new;
  end if;

  if not private.myvet_user_has_clinic_access(target_clinic_id) then
    raise exception 'TENANT_ACCESS_DENIED';
  end if;

  if tg_op = 'DELETE' then return old; end if;
  return new;
end;
$$;

create or replace function private.myvet_prevent_history_mutation()
returns trigger
language plpgsql
set search_path = ''
as $$
begin
  raise exception 'IMMUTABLE_HISTORY';
end;
$$;

create or replace function private.myvet_validate_approval_event()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
  if new.action in ('approved', 'released') then
    if not exists (
      select 1 from public.staff
      where clinic_id = new.clinic_id
        and staff_id = new.actor_staff_id
        and auth_user_id = new.actor_user_id
        and is_active = true
        and role = 'vet'
    ) then
      raise exception 'AI_APPROVAL_REQUIRES_VETERINARIAN';
    end if;
  end if;
  return new;
end;
$$;

do $$
declare
  target_table text;
  tenant_tables text[] := array[
    'staff', 'owners', 'patients', 'appointments', 'payments', 'payment_items',
    'payment_transactions', 'medical_visits', 'physical_exams', 'medical_problems',
    'differential_diagnoses', 'prescriptions', 'vaccinations', 'documents',
    'lab_orders', 'hospitalizations', 'conversations', 'messages',
    'message_attachments', 'video_sessions', 'notifications', 'reminders',
    'inventory', 'service_catalog', 'clinic_booking_hours', 'clinic_booking_blocks',
    'insights', 'vetbot_action_requests', 'vetbot_audit_logs', 'vetbot_feedback',
    'vetbot_knowledge', 'ai_operations', 'ai_audit_events', 'ai_documents',
    'ai_document_chunks', 'ai_document_embeddings', 'ai_artifacts', 'ai_sources',
    'ai_approval_history', 'ai_consent_records', 'ai_feature_flags',
    'ai_rate_limit_windows'
  ];
begin
  foreach target_table in array tenant_tables loop
    if to_regclass(format('public.%I', target_table)) is not null then
      execute format('drop trigger if exists b_myvet_validate_tenant_scope on public.%I', target_table);
      if left(target_table, 3) <> 'ai_' then
        execute format(
          'create trigger b_myvet_validate_tenant_scope before insert or update on public.%I for each row execute function private.myvet_validate_legacy_tenant_scope()',
          target_table
        );
      end if;
      execute format('drop trigger if exists myvet_tenant_write_guard on public.%I', target_table);
      execute format(
        'create trigger myvet_tenant_write_guard before insert or update or delete on public.%I for each row execute function private.myvet_enforce_tenant_write()',
        target_table
      );
    end if;
  end loop;
end $$;

drop trigger if exists myvet_approval_history_validate on public.ai_approval_history;
create trigger myvet_approval_history_validate
before insert on public.ai_approval_history
for each row execute function private.myvet_validate_approval_event();

drop trigger if exists myvet_approval_history_immutable on public.ai_approval_history;
create trigger myvet_approval_history_immutable
before update or delete on public.ai_approval_history
for each row execute function private.myvet_prevent_history_mutation();

drop trigger if exists myvet_ai_audit_immutable on public.ai_audit_events;
create trigger myvet_ai_audit_immutable
before update or delete on public.ai_audit_events
for each row execute function private.myvet_prevent_history_mutation();

-- Remove every legacy policy that applies to anon/PUBLIC, plus policies whose
-- USING or WITH CHECK expression is unconditionally true. PostgreSQL combines
-- permissive policies with OR, so one broad authenticated policy would bypass
-- every tenant predicate created below. Replacement policies are installed in
-- this same migration; no business rows are removed.
do $$
declare
  policy_row record;
begin
  for policy_row in
    select schemaname, tablename, policyname
    from pg_policies
    where schemaname = 'public'
      and (
        'anon' = any(roles)
        or 'public' = any(roles)
        or regexp_replace(coalesce(qual, ''), '[[:space:]()]', '', 'g') = 'true'
        or regexp_replace(coalesce(with_check, ''), '[[:space:]()]', '', 'g') = 'true'
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

-- Authenticated prototype policies are permissive (policies are ORed), so a
-- legacy global-staff policy would otherwise bypass the new tenant policy.
-- Remove only policies proven to depend on that global helper; role-aware
-- tenant replacements are created below in the same transaction.
do $$
declare
  policy_row record;
begin
  for policy_row in
    select schemaname, tablename, policyname
    from pg_policies
    where schemaname = 'public'
      and (
        coalesce(qual, '') ilike '%myvet_is_active_staff%'
        or coalesce(with_check, '') ilike '%myvet_is_active_staff%'
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

do $$
declare
  table_row record;
begin
  for table_row in
    select tablename from pg_tables where schemaname = 'public'
  loop
    execute format('alter table public.%I enable row level security', table_row.tablename);
    execute format('revoke all privileges on table public.%I from anon', table_row.tablename);
    execute format('revoke truncate, references, trigger on table public.%I from authenticated', table_row.tablename);
  end loop;
end $$;

revoke all privileges on all sequences in schema public from anon;

drop policy if exists myvet_clinics_select_member on public.clinics;
create policy myvet_clinics_select_member
on public.clinics for select to authenticated
using ((select private.myvet_user_has_clinic_access(clinic_id)));

-- Staff directory: any active member can read colleagues in the same clinic;
-- only clinic_admin can create or modify staff memberships.
drop policy if exists myvet_active_staff_all on public.staff;
drop policy if exists myvet_staff_select_same_clinic on public.staff;
create policy myvet_staff_select_same_clinic
on public.staff for select to authenticated
using ((select private.myvet_is_clinic_staff(clinic_id, null)));
drop policy if exists myvet_staff_admin_manage on public.staff;
create policy myvet_staff_admin_manage
on public.staff for all to authenticated
using ((select private.myvet_is_clinic_staff(clinic_id, array['clinic_admin']::text[])))
with check ((select private.myvet_is_clinic_staff(clinic_id, array['clinic_admin']::text[])));

-- Operational data required by all four existing staff roles.
do $$
declare
  target_table text;
  operational_tables text[] := array[
    'owners', 'patients', 'appointments', 'conversations', 'messages',
    'message_attachments', 'video_sessions', 'notifications', 'reminders',
    'inventory', 'service_catalog', 'clinic_booking_hours', 'clinic_booking_blocks'
  ];
begin
  foreach target_table in array operational_tables loop
    execute format('drop policy if exists myvet_active_staff_all on public.%I', target_table);
    execute format(
      'create policy myvet_active_staff_all on public.%I for all to authenticated using ((select private.myvet_is_clinic_staff(clinic_id, null))) with check ((select private.myvet_is_clinic_staff(clinic_id, null)))',
      target_table
    );
  end loop;
end $$;

-- Medical writes are not available to secretary. Existing admin/vet/nurse
-- flows remain compatible.
do $$
declare
  target_table text;
  medical_tables text[] := array[
    'medical_visits', 'physical_exams', 'medical_problems',
    'differential_diagnoses', 'prescriptions', 'lab_orders', 'documents',
    'hospitalizations', 'vaccinations'
  ];
begin
  foreach target_table in array medical_tables loop
    execute format('drop policy if exists myvet_active_staff_all on public.%I', target_table);
    execute format(
      'create policy myvet_active_staff_all on public.%I for all to authenticated using ((select private.myvet_is_clinic_staff(clinic_id, array[''clinic_admin'',''vet'',''nurse'']::text[]))) with check ((select private.myvet_is_clinic_staff(clinic_id, array[''clinic_admin'',''vet'',''nurse'']::text[])))',
      target_table
    );
  end loop;
end $$;

-- Payment processing is operational for the front desk, while nurse does not
-- gain financial access.
do $$
declare
  target_table text;
  financial_tables text[] := array['payments', 'payment_items'];
begin
  foreach target_table in array financial_tables loop
    execute format('drop policy if exists myvet_active_staff_all on public.%I', target_table);
    execute format(
      'create policy myvet_active_staff_all on public.%I for all to authenticated using ((select private.myvet_is_clinic_staff(clinic_id, array[''clinic_admin'',''vet'',''secretary'']::text[]))) with check ((select private.myvet_is_clinic_staff(clinic_id, array[''clinic_admin'',''vet'',''secretary'']::text[])))',
      target_table
    );
  end loop;
end $$;

drop policy if exists myvet_payment_transactions_staff_select on public.payment_transactions;
create policy myvet_payment_transactions_staff_select
on public.payment_transactions for select to authenticated
using ((select private.myvet_is_clinic_staff(clinic_id, array['clinic_admin','vet','secretary']::text[])));

drop policy if exists myvet_insights_staff_all on public.insights;
drop policy if exists myvet_active_staff_all on public.insights;
create policy myvet_insights_staff_all
on public.insights for all to authenticated
using ((select private.myvet_is_clinic_staff(clinic_id, array['clinic_admin','vet','secretary']::text[])))
with check ((select private.myvet_is_clinic_staff(clinic_id, array['clinic_admin','vet','secretary']::text[])));

-- Owner compatibility policies now include tenant-aware helpers.
drop policy if exists myvet_owner_select_own on public.owners;
create policy myvet_owner_select_own on public.owners for select to authenticated
using (auth_user_id = (select auth.uid()) and (select private.myvet_user_has_clinic_access(clinic_id)));
drop policy if exists myvet_owner_update_own on public.owners;
create policy myvet_owner_update_own on public.owners for update to authenticated
using (auth_user_id = (select auth.uid()) and (select private.myvet_user_has_clinic_access(clinic_id)))
with check (auth_user_id = (select auth.uid()) and (select private.myvet_user_has_clinic_access(clinic_id)));
drop policy if exists myvet_owner_insert_own on public.owners;
create policy myvet_owner_insert_own on public.owners for insert to authenticated
with check (auth_user_id = (select auth.uid()) and clinic_id = (select private.myvet_current_clinic_id()));

drop policy if exists myvet_owner_select_own on public.patients;
create policy myvet_owner_select_own on public.patients for select to authenticated
using ((select private.myvet_owner_owns_pet(clinic_id, pet_id)));

-- Existing VetBot tables remain compatible, but are now tenant-scoped.
drop policy if exists myvet_vetbot_action_select_own on public.vetbot_action_requests;
create policy myvet_vetbot_action_select_own
on public.vetbot_action_requests for select to authenticated
using (actor_id = (select auth.uid()) and (select private.myvet_user_has_clinic_access(clinic_id)));

drop policy if exists "vetbot audit insert own" on public.vetbot_audit_logs;
create policy "vetbot audit insert own"
on public.vetbot_audit_logs for insert to authenticated
with check (actor_id = (select auth.uid()) and (select private.myvet_user_has_clinic_access(clinic_id)));
drop policy if exists "vetbot audit admin read" on public.vetbot_audit_logs;
create policy "vetbot audit admin read"
on public.vetbot_audit_logs for select to authenticated
using ((select private.myvet_is_clinic_staff(clinic_id, array['clinic_admin']::text[])));

drop policy if exists "vetbot feedback insert own" on public.vetbot_feedback;
create policy "vetbot feedback insert own"
on public.vetbot_feedback for insert to authenticated
with check (actor_id = (select auth.uid()) and (select private.myvet_user_has_clinic_access(clinic_id)));
drop policy if exists "vetbot feedback admin read" on public.vetbot_feedback;
create policy "vetbot feedback admin read"
on public.vetbot_feedback for select to authenticated
using ((select private.myvet_is_clinic_staff(clinic_id, array['clinic_admin']::text[])));

drop policy if exists "vetbot knowledge staff read" on public.vetbot_knowledge;
create policy "vetbot knowledge staff read"
on public.vetbot_knowledge for select to authenticated
using ((select private.myvet_is_clinic_staff(clinic_id, null)));
drop policy if exists "vetbot knowledge admin manage" on public.vetbot_knowledge;
create policy "vetbot knowledge admin manage"
on public.vetbot_knowledge for all to authenticated
using ((select private.myvet_is_clinic_staff(clinic_id, array['clinic_admin']::text[])))
with check ((select private.myvet_is_clinic_staff(clinic_id, array['clinic_admin']::text[])));

-- New AI tables are not writable from the browser in Stage 2. Future writes
-- must go through validated server/RPC flows introduced with each capability.
do $$
declare
  target_table text;
  ai_tables text[] := array[
    'ai_operations', 'ai_audit_events', 'ai_documents', 'ai_document_chunks',
    'ai_document_embeddings', 'ai_artifacts', 'ai_sources',
    'ai_approval_history', 'ai_consent_records', 'ai_feature_flags',
    'ai_rate_limit_windows'
  ];
begin
  foreach target_table in array ai_tables loop
    execute format('revoke all privileges on table public.%I from anon, authenticated', target_table);
    execute format('grant all privileges on table public.%I to service_role', target_table);
    execute format('alter table public.%I force row level security', target_table);
  end loop;
end $$;

grant usage, select on sequence public.ai_audit_events_audit_event_id_seq,
  public.ai_rate_limit_windows_rate_limit_id_seq to service_role;

grant select on table public.ai_operations, public.ai_audit_events,
  public.ai_documents, public.ai_document_chunks, public.ai_artifacts,
  public.ai_sources, public.ai_approval_history, public.ai_consent_records,
  public.ai_feature_flags to authenticated;

drop policy if exists ai_operations_clinical_select on public.ai_operations;
create policy ai_operations_clinical_select on public.ai_operations for select to authenticated
using ((select private.myvet_is_clinic_staff(clinic_id, array['clinic_admin','vet']::text[])));

drop policy if exists ai_audit_admin_select on public.ai_audit_events;
create policy ai_audit_admin_select on public.ai_audit_events for select to authenticated
using ((select private.myvet_is_clinic_staff(clinic_id, array['clinic_admin']::text[])));

drop policy if exists ai_documents_clinical_select on public.ai_documents;
create policy ai_documents_clinical_select on public.ai_documents for select to authenticated
using ((select private.myvet_is_clinic_staff(clinic_id, array['clinic_admin','vet']::text[])));

drop policy if exists ai_chunks_clinical_select on public.ai_document_chunks;
create policy ai_chunks_clinical_select on public.ai_document_chunks for select to authenticated
using ((select private.myvet_is_clinic_staff(clinic_id, array['clinic_admin','vet']::text[])));

drop policy if exists ai_artifacts_clinical_select on public.ai_artifacts;
create policy ai_artifacts_clinical_select on public.ai_artifacts for select to authenticated
using ((select private.myvet_is_clinic_staff(clinic_id, array['clinic_admin','vet']::text[])));
drop policy if exists ai_artifacts_owner_released_select on public.ai_artifacts;
create policy ai_artifacts_owner_released_select on public.ai_artifacts for select to authenticated
using (
  status = 'approved'
  and released_to_owner = true
  and artifact_type not in ('transcript', 'document_extraction')
  and pet_id is not null
  and (select private.myvet_owner_owns_pet(clinic_id, pet_id))
);

drop policy if exists ai_sources_clinical_select on public.ai_sources;
create policy ai_sources_clinical_select on public.ai_sources for select to authenticated
using ((select private.myvet_is_clinic_staff(clinic_id, array['clinic_admin','vet']::text[])));
drop policy if exists ai_sources_owner_released_select on public.ai_sources;
-- Source record identifiers remain internal. A future server endpoint may
-- expose a redacted citation label after validating the released artifact.

drop policy if exists ai_approval_clinical_select on public.ai_approval_history;
create policy ai_approval_clinical_select on public.ai_approval_history for select to authenticated
using ((select private.myvet_is_clinic_staff(clinic_id, array['clinic_admin','vet']::text[])));

drop policy if exists ai_consent_clinical_select on public.ai_consent_records;
create policy ai_consent_clinical_select on public.ai_consent_records for select to authenticated
using ((select private.myvet_is_clinic_staff(clinic_id, array['clinic_admin','vet']::text[])));
drop policy if exists ai_consent_owner_select on public.ai_consent_records;
create policy ai_consent_owner_select on public.ai_consent_records for select to authenticated
using (owner_id = (select public.myvet_current_owner_id()) and auth_user_id = (select auth.uid()));

drop policy if exists ai_feature_flags_admin_select on public.ai_feature_flags;
create policy ai_feature_flags_admin_select on public.ai_feature_flags for select to authenticated
using ((select private.myvet_is_clinic_staff(clinic_id, array['clinic_admin']::text[])));

-- Rebuild booking functions so every availability check is scoped before it
-- checks occupied slots. No client can pass a clinic identifier.
create or replace function public.myvet_slot_is_bookable(
  candidate_start timestamptz,
  candidate_end timestamptz,
  excluded_appointment_id bigint default null
)
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  with current_clinic as (
    select private.myvet_current_clinic_id() as clinic_id
  ), local_slot as (
    select
      candidate_start at time zone 'Asia/Jerusalem' as starts_local,
      candidate_end at time zone 'Asia/Jerusalem' as ends_local
  ), schedule as (
    select hours.*
    from current_clinic
    cross join local_slot
    join public.clinic_booking_hours as hours
      on hours.clinic_id = current_clinic.clinic_id
     and hours.weekday = extract(dow from local_slot.starts_local)::smallint
  )
  select
    (select auth.uid()) is not null
    and schedule.clinic_id is not null
    and candidate_end > candidate_start
    and local_slot.starts_local::date = local_slot.ends_local::date
    and schedule.is_open
    and local_slot.starts_local::time >= schedule.opens_at
    and local_slot.ends_local::time <= schedule.closes_at
    and not exists (
      select 1 from public.clinic_booking_blocks as block
      where block.clinic_id = schedule.clinic_id
        and block.block_date = local_slot.starts_local::date
        and (
          block.is_all_day
          or (local_slot.starts_local::time < block.ends_at and block.starts_at < local_slot.ends_local::time)
        )
    )
    and not exists (
      select 1 from public.appointments as appointment
      where appointment.clinic_id = schedule.clinic_id
        and appointment.start_time < candidate_end
        and coalesce(appointment.end_time, appointment.start_time + interval '30 minutes') > candidate_start
        and (excluded_appointment_id is null or appointment.appointment_id <> excluded_appointment_id)
    )
    and (
      select count(*) from public.appointments as appointment
      where appointment.clinic_id = schedule.clinic_id
        and (appointment.start_time at time zone 'Asia/Jerusalem')::date = local_slot.starts_local::date
        and (excluded_appointment_id is null or appointment.appointment_id <> excluded_appointment_id)
    ) < schedule.max_bookings
  from local_slot
  join schedule on true;
$$;

create or replace function public.myvet_available_slots(range_start date, range_end date)
returns table(slot_start timestamptz, slot_end timestamptz)
language sql
stable
security definer
set search_path = ''
as $$
  select
    (day_date + hours.opens_at + make_interval(mins => generated.slot_index * hours.slot_minutes)) at time zone 'Asia/Jerusalem',
    (day_date + hours.opens_at + make_interval(mins => (generated.slot_index + 1) * hours.slot_minutes)) at time zone 'Asia/Jerusalem'
  from generate_series(range_start, range_end, interval '1 day') as series(day_value)
  cross join lateral (select series.day_value::date as day_date) as day
  join public.clinic_booking_hours as hours
    on hours.clinic_id = private.myvet_current_clinic_id()
   and hours.weekday = extract(dow from day.day_date)::smallint
  cross join lateral generate_series(
    0,
    greatest(0, floor(extract(epoch from (hours.closes_at - hours.opens_at)) / 60 / hours.slot_minutes)::integer - 1)
  ) as generated(slot_index)
  where (select auth.uid()) is not null
    and range_end >= range_start
    and range_end - range_start <= 31
    and hours.is_open
    and public.myvet_slot_is_bookable(
      (day.day_date + hours.opens_at + make_interval(mins => generated.slot_index * hours.slot_minutes)) at time zone 'Asia/Jerusalem',
      (day.day_date + hours.opens_at + make_interval(mins => (generated.slot_index + 1) * hours.slot_minutes)) at time zone 'Asia/Jerusalem',
      null
    )
  order by 1;
$$;

create or replace function public.myvet_booked_slots(range_start timestamptz, range_end timestamptz)
returns table(slot_start timestamptz, slot_end timestamptz)
language sql
stable
security definer
set search_path = ''
as $$
  select appointment.start_time, appointment.end_time
  from public.appointments as appointment
  where (select auth.uid()) is not null
    and appointment.clinic_id = private.myvet_current_clinic_id()
    and appointment.start_time >= range_start
    and appointment.start_time <= range_end;
$$;

create or replace function public.myvet_owner_book_appointment(
  requested_pet_id bigint,
  requested_start timestamptz,
  requested_end timestamptz,
  requested_type text,
  requested_mode text,
  requested_notes text default null
)
returns bigint
language plpgsql
security definer
set search_path = ''
as $$
declare
  created_id bigint;
  target_clinic_id uuid;
begin
  select pet.clinic_id into target_clinic_id
  from public.patients as pet
  join public.owners as owner
    on owner.owner_id = pet.owner_id and owner.clinic_id = pet.clinic_id
  where pet.pet_id = requested_pet_id
    and owner.auth_user_id = (select auth.uid());

  if target_clinic_id is null then raise exception 'BOOKING_NOT_AUTHORIZED'; end if;
  if requested_mode not in ('physical', 'video') then raise exception 'INVALID_APPOINTMENT_MODE'; end if;
  if char_length(coalesce(requested_type, '')) < 1 or char_length(requested_type) > 120 then
    raise exception 'INVALID_APPOINTMENT_TYPE';
  end if;
  if char_length(coalesce(requested_notes, '')) > 1500 then raise exception 'NOTES_TOO_LONG'; end if;

  perform pg_advisory_xact_lock(hashtextextended(target_clinic_id::text || ':' || requested_start::text, 0));
  if not public.myvet_slot_is_bookable(requested_start, requested_end, null) then
    raise exception 'SLOT_NOT_AVAILABLE';
  end if;

  insert into public.appointments (
    clinic_id, pet_id, start_time, end_time, department, vet_name, room,
    appointment_type, appointment_mode, color, notes
  ) values (
    target_clinic_id, requested_pet_id, requested_start, requested_end, 'כללי',
    'טרם שובץ', case when requested_mode = 'video' then 'דיגיטל' else 'טרם שובץ' end,
    requested_type, requested_mode, 'blue', nullif(requested_notes, '')
  ) returning appointment_id into created_id;

  return created_id;
end;
$$;

create or replace function public.myvet_owner_settle_demo_payment(requested_payment_id bigint)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  target_payment public.payments%rowtype;
  settled_at timestamptz := now();
begin
  if (select auth.uid()) is null then raise exception 'AUTH_REQUIRED'; end if;

  select * into target_payment
  from public.payments
  where payment_id = requested_payment_id
  for update;

  if not found or not public.myvet_owner_matches(target_payment.owner_id) then
    raise exception 'PAYMENT_NOT_FOUND';
  end if;

  if target_payment.status = 'paid' then
    return jsonb_build_object(
      'payment_id', target_payment.payment_id,
      'status', target_payment.status,
      'amount', target_payment.amount,
      'already_paid', true
    );
  end if;
  if target_payment.status not in ('unpaid', 'partial') then raise exception 'PAYMENT_NOT_OPEN'; end if;

  update public.payments
  set status = 'paid', payment_method = 'portal_demo', paid_at = settled_at
  where payment_id = target_payment.payment_id;

  insert into public.payment_transactions (
    clinic_id, payment_id, owner_id, amount, payment_method, tendered_amount,
    change_amount, source, processed_by, created_at
  ) values (
    target_payment.clinic_id, target_payment.payment_id, target_payment.owner_id,
    target_payment.amount, 'portal_demo', target_payment.amount, 0,
    'owner_portal_demo', (select auth.uid()), settled_at
  );

  return jsonb_build_object(
    'payment_id', target_payment.payment_id,
    'status', 'paid',
    'amount', target_payment.amount,
    'paid_at', settled_at,
    'already_paid', false
  );
end;
$$;

create or replace function public.myvet_staff_settle_payment(
  requested_payment_id bigint,
  requested_method text,
  tendered_amount numeric default null
)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  target_payment public.payments%rowtype;
  normalized_method text := lower(trim(coalesce(requested_method, '')));
  calculated_change numeric(12, 2) := 0;
  settled_at timestamptz := now();
begin
  if (select auth.uid()) is null then raise exception 'STAFF_REQUIRED'; end if;
  if normalized_method not in ('cash', 'credit', 'bit', 'bank_transfer', 'other') then
    raise exception 'INVALID_PAYMENT_METHOD';
  end if;

  select * into target_payment
  from public.payments
  where payment_id = requested_payment_id
  for update;

  if not found or not private.myvet_is_clinic_staff(
    target_payment.clinic_id,
    array['clinic_admin','vet','secretary']::text[]
  ) then
    raise exception 'PAYMENT_NOT_FOUND';
  end if;

  if target_payment.status = 'paid' then raise exception 'PAYMENT_ALREADY_PAID'; end if;
  if target_payment.status not in ('unpaid', 'partial') then raise exception 'PAYMENT_NOT_OPEN'; end if;

  if normalized_method = 'cash' then
    if tendered_amount is null or tendered_amount < target_payment.amount then
      raise exception 'INSUFFICIENT_CASH';
    end if;
    calculated_change := tendered_amount - target_payment.amount;
  end if;

  update public.payments
  set status = 'paid', payment_method = normalized_method, paid_at = settled_at
  where payment_id = target_payment.payment_id;

  insert into public.payment_transactions (
    clinic_id, payment_id, owner_id, amount, payment_method, tendered_amount,
    change_amount, source, processed_by, created_at
  ) values (
    target_payment.clinic_id, target_payment.payment_id, target_payment.owner_id,
    target_payment.amount, normalized_method,
    case when normalized_method = 'cash' then tendered_amount else null end,
    calculated_change, 'staff', (select auth.uid()), settled_at
  );

  return jsonb_build_object(
    'payment_id', target_payment.payment_id,
    'status', 'paid',
    'amount', target_payment.amount,
    'payment_method', normalized_method,
    'change_amount', calculated_change,
    'paid_at', settled_at
  );
end;
$$;

-- Public-schema RPCs are kept only for backward compatibility. Every function
-- has explicit authentication in its body and explicit EXECUTE grants.
do $$
declare
  function_row record;
begin
  for function_row in
    select p.oid::regprocedure as signature
    from pg_proc as p
    join pg_namespace as n on n.oid = p.pronamespace
    where n.nspname = 'public'
      and (p.proname like 'myvet_%' or p.proname = 'claim_owner_profile')
  loop
    execute format('revoke all on function %s from public, anon', function_row.signature);
  end loop;
end $$;

grant execute on function public.myvet_is_active_staff() to authenticated, service_role;
grant execute on function public.myvet_current_owner_id() to authenticated, service_role;
grant execute on function public.myvet_owner_matches(text) to authenticated, service_role;
grant execute on function public.myvet_pet_owned(text) to authenticated, service_role;
grant execute on function public.myvet_conversation_owned(text) to authenticated, service_role;
grant execute on function public.claim_owner_profile() to authenticated;
grant execute on function public.myvet_slot_is_bookable(timestamptz, timestamptz, bigint) to authenticated, service_role;
grant execute on function public.myvet_available_slots(date, date) to authenticated;
grant execute on function public.myvet_booked_slots(timestamptz, timestamptz) to authenticated;
grant execute on function public.myvet_owner_book_appointment(bigint, timestamptz, timestamptz, text, text, text) to authenticated;
grant execute on function public.myvet_owner_settle_demo_payment(bigint) to authenticated, service_role;
grant execute on function public.myvet_staff_settle_payment(bigint, text, numeric) to authenticated, service_role;
grant execute on function public.myvet_execute_vetbot_action(uuid) to authenticated, service_role;

-- New helper/trigger functions are never callable by API roles directly.
revoke all on function private.myvet_enforce_tenant_write() from public, anon, authenticated, service_role;
revoke all on function private.myvet_validate_legacy_tenant_scope() from public, anon, authenticated, service_role;
revoke all on function private.myvet_prevent_history_mutation() from public, anon, authenticated, service_role;
revoke all on function private.myvet_validate_approval_event() from public, anon, authenticated, service_role;
revoke all on function private.myvet_validate_ai_scope() from public, anon, authenticated, service_role;
revoke all on function private.myvet_validate_ai_approval() from public, anon, authenticated, service_role;
revoke all on function private.myvet_validate_ai_source() from public, anon, authenticated, service_role;
revoke all on function private.myvet_set_updated_at() from public, anon, authenticated, service_role;
revoke all on function private.myvet_assign_vetbot_actor_clinic() from public, anon, authenticated, service_role;

comment on function private.myvet_enforce_tenant_write() is
  'Defense-in-depth tenant guard for authenticated writes, including SECURITY DEFINER RPC writes.';
