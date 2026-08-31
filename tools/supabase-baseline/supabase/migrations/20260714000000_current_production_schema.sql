create extension if not exists vector with schema extensions;
set check_function_bodies = false;
create schema if not exists private;
create schema if not exists myvet_private;
create or replace function private.myvet_current_clinic_id()
returns uuid
language plpgsql
stable
security definer
set search_path = ''
as $$
declare
  resolved_clinic_id uuid;
begin
  if (select auth.uid()) is not null then
    select (array_agg(distinct membership.clinic_id))[1]
    into resolved_clinic_id
    from (
      select staff.clinic_id
      from public.staff as staff
      where staff.auth_user_id = (select auth.uid()) and staff.is_active = true
      union
      select owner.clinic_id
      from public.owners as owner
      where owner.auth_user_id = (select auth.uid())
    ) as membership
    having count(distinct membership.clinic_id) = 1;
  end if;

  if resolved_clinic_id is null
    and (select count(*) from public.clinics where is_active = true) = 1 then
    select clinic_id into resolved_clinic_id
    from public.clinics
    where is_active = true
    limit 1;
  end if;

  return resolved_clinic_id;
end;
$$;
create or replace function private.myvet_is_clinic_staff(
  target_clinic_id uuid,
  allowed_roles text[] default null
)
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select (select auth.uid()) is not null
    and target_clinic_id is not null
    and exists (
      select 1
      from public.staff as staff
      where staff.auth_user_id = (select auth.uid())
        and staff.clinic_id = target_clinic_id
        and staff.is_active = true
        and (allowed_roles is null or staff.role = any(allowed_roles))
    );
$$;
create or replace function private.myvet_user_has_clinic_access(target_clinic_id uuid)
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select target_clinic_id is not null
    and (select auth.uid()) is not null
    and (
      exists (
        select 1 from public.staff as staff
        where staff.auth_user_id = (select auth.uid())
          and staff.clinic_id = target_clinic_id
          and staff.is_active = true
      )
      or exists (
        select 1 from public.owners as owner
        where owner.auth_user_id = (select auth.uid())
          and owner.clinic_id = target_clinic_id
      )
    );
$$;
create or replace function private.myvet_owner_owns_pet(
  target_clinic_id uuid,
  target_pet_id bigint
)
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select (select auth.uid()) is not null
    and exists (
      select 1
      from public.patients as pet
      join public.owners as owner
        on owner.owner_id = pet.owner_id
       and owner.clinic_id = pet.clinic_id
      where pet.clinic_id = target_clinic_id
        and pet.pet_id = target_pet_id
        and owner.auth_user_id = (select auth.uid())
    );
$$;
create or replace function private.myvet_set_updated_at()
returns trigger
language plpgsql
set search_path = ''
as $$
begin
  new.updated_at := now();
  return new;
end;
$$;
create or replace function private.myvet_validate_ai_scope()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
declare
  row_data jsonb := to_jsonb(new);
  target_clinic_id uuid := (row_data ->> 'clinic_id')::uuid;
  target_owner_id text := nullif(row_data ->> 'owner_id', '');
  target_pet_id bigint := nullif(row_data ->> 'pet_id', '')::bigint;
  target_visit_id bigint := nullif(row_data ->> 'visit_id', '')::bigint;
  target_appointment_id bigint := nullif(row_data ->> 'appointment_id', '')::bigint;
  linked_owner_id text;
  linked_pet_id bigint;
begin
  if target_clinic_id is null then
    raise exception 'AI_SCOPE_CLINIC_REQUIRED';
  end if;

  if target_pet_id is not null then
    select owner_id into linked_owner_id
    from public.patients
    where clinic_id = target_clinic_id and pet_id = target_pet_id;
    if not found then raise exception 'AI_SCOPE_PET_MISMATCH'; end if;
    if target_owner_id is not null and target_owner_id <> linked_owner_id then
      raise exception 'AI_SCOPE_OWNER_MISMATCH';
    end if;
  end if;

  if target_visit_id is not null then
    select pet_id into linked_pet_id
    from public.medical_visits
    where clinic_id = target_clinic_id and visit_id = target_visit_id;
    if not found then raise exception 'AI_SCOPE_VISIT_MISMATCH'; end if;
    if target_pet_id is not null and linked_pet_id is distinct from target_pet_id then
      raise exception 'AI_SCOPE_VISIT_PET_MISMATCH';
    end if;
  end if;

  if target_appointment_id is not null then
    select pet_id into linked_pet_id
    from public.appointments
    where clinic_id = target_clinic_id and appointment_id = target_appointment_id;
    if not found then raise exception 'AI_SCOPE_APPOINTMENT_MISMATCH'; end if;
    if target_pet_id is not null and linked_pet_id is distinct from target_pet_id then
      raise exception 'AI_SCOPE_APPOINTMENT_PET_MISMATCH';
    end if;
  end if;

  return new;
end;
$$;
create or replace function private.myvet_validate_ai_approval()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
  if new.status = 'approved' then
    if not exists (
      select 1 from public.staff
      where clinic_id = new.clinic_id
        and staff_id = new.approved_by
        and is_active = true
        and role = 'vet'
    ) then
      raise exception 'AI_APPROVAL_REQUIRES_VETERINARIAN';
    end if;
  end if;
  return new;
end;
$$;
create or replace function private.myvet_validate_ai_source()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
  if new.source_type = 'medical_visit' and not exists (
    select 1 from public.medical_visits
    where clinic_id = new.clinic_id and visit_id::text = new.source_record_id
  ) then
    raise exception 'AI_SOURCE_VISIT_MISMATCH';
  elsif new.source_type = 'appointment' and not exists (
    select 1 from public.appointments
    where clinic_id = new.clinic_id and appointment_id::text = new.source_record_id
  ) then
    raise exception 'AI_SOURCE_APPOINTMENT_MISMATCH';
  elsif new.source_type = 'digitalcare' and not exists (
    select 1 from public.conversations
    where clinic_id = new.clinic_id and conversation_id::text = new.source_record_id
  ) then
    raise exception 'AI_SOURCE_CONVERSATION_MISMATCH';
  elsif new.source_type = 'document'
    and (new.document_id is null or new.source_record_id <> new.document_id::text) then
    raise exception 'AI_SOURCE_DOCUMENT_MISMATCH';
  elsif new.source_type = 'document_chunk'
    and (new.chunk_id is null or new.source_record_id <> new.chunk_id::text) then
    raise exception 'AI_SOURCE_CHUNK_MISMATCH';
  end if;

  return new;
end;
$$;
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
create or replace function private.myvet_is_valid_visit_summary(candidate jsonb)
returns boolean
language plpgsql
immutable
set search_path = ''
as $$
declare
  field_name text;
  item jsonb;
  list_fields text[] := array[
    'symptoms', 'relevant_history', 'examination_findings', 'tests', 'treatments',
    'medications', 'follow_up', 'warnings', 'unresolved_items'
  ];
  allowed_fields text[] := array[
    'chief_complaint', 'symptoms', 'relevant_history', 'examination_findings',
    'tests', 'clinical_assessment', 'treatments', 'medications', 'follow_up',
    'warnings', 'unresolved_items', 'source_references'
  ];
begin
  if jsonb_typeof(candidate) <> 'object'
    or (select count(*) from jsonb_object_keys(candidate)) <> cardinality(allowed_fields)
    or exists (select 1 from jsonb_object_keys(candidate) as key where not (key = any(allowed_fields))) then
    return false;
  end if;

  if jsonb_typeof(candidate -> 'chief_complaint') <> 'string'
    or char_length(candidate ->> 'chief_complaint') > 2000
    or jsonb_typeof(candidate -> 'clinical_assessment') <> 'string'
    or char_length(candidate ->> 'clinical_assessment') > 4000 then
    return false;
  end if;

  foreach field_name in array list_fields loop
    if jsonb_typeof(candidate -> field_name) <> 'array'
      or jsonb_array_length(candidate -> field_name) > 20 then
      return false;
    end if;
    for item in select value from jsonb_array_elements(candidate -> field_name) loop
      if jsonb_typeof(item) <> 'string' or char_length(item #>> '{}') > 700 then
        return false;
      end if;
    end loop;
  end loop;

  if jsonb_typeof(candidate -> 'source_references') <> 'array'
    or jsonb_array_length(candidate -> 'source_references') > 6
    or exists (
      select 1 from jsonb_array_elements_text(candidate -> 'source_references') as source(value)
      where source.value not in (
        'medical_visit', 'physical_exam', 'medical_problems',
        'differential_diagnoses', 'prescriptions', 'lab_orders'
      )
    ) then
    return false;
  end if;

  return true;
exception when others then
  return false;
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
  trusted_database_session boolean := pg_has_role(session_user, 'postgres', 'member');
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
    if jwt_role = 'service_role' or trusted_database_session then
      if tg_op = 'DELETE' then return old; end if;
      return new;
    end if;
    raise exception 'AUTH_REQUIRED';
  end if;

  -- Compatibility for the existing verified-email claim flow. The claim RPC
  -- still performs the verified email match; this exception only lets its
  -- tenant-preserving update pass the generic write guard.
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
create or replace function private.myvet_is_valid_visit_summary(candidate jsonb)
returns boolean
language plpgsql
immutable
set search_path = ''
as $$
declare
  field_name text;
  item jsonb;
  list_fields text[] := array[
    'symptoms', 'relevant_history', 'examination_findings', 'tests', 'treatments',
    'medications', 'follow_up', 'warnings', 'unresolved_items'
  ];
  allowed_fields text[] := array[
    'chief_complaint', 'symptoms', 'relevant_history', 'examination_findings',
    'tests', 'clinical_assessment', 'treatments', 'medications', 'follow_up',
    'warnings', 'unresolved_items', 'source_references'
  ];
begin
  if jsonb_typeof(candidate) <> 'object'
    or (select count(*) from jsonb_object_keys(candidate)) <> cardinality(allowed_fields)
    or exists (select 1 from jsonb_object_keys(candidate) as key where not (key = any(allowed_fields))) then
    return false;
  end if;
  if jsonb_typeof(candidate -> 'chief_complaint') <> 'string'
    or char_length(candidate ->> 'chief_complaint') > 2000
    or jsonb_typeof(candidate -> 'clinical_assessment') <> 'string'
    or char_length(candidate ->> 'clinical_assessment') > 4000 then return false; end if;
  foreach field_name in array list_fields loop
    if jsonb_typeof(candidate -> field_name) <> 'array'
      or jsonb_array_length(candidate -> field_name) > 20 then return false; end if;
    for item in select value from jsonb_array_elements(candidate -> field_name) loop
      if jsonb_typeof(item) <> 'string' or char_length(item #>> '{}') > 700 then return false; end if;
    end loop;
  end loop;
  if jsonb_typeof(candidate -> 'source_references') <> 'array'
    or jsonb_array_length(candidate -> 'source_references') > 6
    or exists (
      select 1 from jsonb_array_elements_text(candidate -> 'source_references') as source(value)
      where source.value not in (
        'medical_visit', 'physical_exam', 'medical_problems',
        'differential_diagnoses', 'prescriptions', 'lab_orders',
        'digitalcare_transcript'
      )
    ) then return false; end if;
  return true;
exception when others then return false;
end;
$$;
create or replace function private.myvet_carry_digitalcare_summary_provenance()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
  if new.artifact_type = 'visit_summary' and new.supersedes_artifact_id is not null then
    insert into public.ai_sources(
      clinic_id, artifact_id, source_type, source_record_id,
      document_id, chunk_id, source_hash, released_to_owner
    )
    select source.clinic_id, new.artifact_id, source.source_type,
      source.source_record_id, source.document_id, source.chunk_id,
      source.source_hash, false
    from public.ai_sources as source
    where source.clinic_id = new.clinic_id
      and source.artifact_id = new.supersedes_artifact_id
    on conflict do nothing;
  end if;

  if new.artifact_type = 'visit_summary' and new.status = 'approved'
    and new.visit_id is not null
    and exists (
      select 1 from public.video_sessions as session
      where session.clinic_id = new.clinic_id and session.visit_id = new.visit_id
        and session.transcript_artifact_id is not null
    ) then
    update public.medical_visits
    set entry_data = coalesce(entry_data, '{}'::jsonb)
      || jsonb_build_object(
        'aiContentApproved', true,
        'aiSummaryArtifactId', new.artifact_id::text,
        'aiApprovedAt', new.approved_at
      )
    where medical_visits.clinic_id = new.clinic_id
      and medical_visits.visit_id = new.visit_id;
  end if;
  return new;
end;
$$;
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
create or replace function private.myvet_json_text_array_subset(candidate jsonb, allowed jsonb)
returns boolean language sql immutable set search_path = '' as $$
  select jsonb_typeof(candidate) = 'array'
    and jsonb_array_length(candidate) <= 20
    and not exists (
      select 1 from jsonb_array_elements(candidate) item
      where jsonb_typeof(item) <> 'string'
        or char_length(item #>> '{}') > 700
        or not (allowed @> jsonb_build_array(item))
    );
$$;
create or replace function private.myvet_json_text_array_valid(candidate jsonb)
returns boolean language sql immutable set search_path = '' as $$
  select jsonb_typeof(candidate) = 'array' and jsonb_array_length(candidate) <= 20
    and not exists (select 1 from jsonb_array_elements(candidate) item
      where jsonb_typeof(item) <> 'string' or char_length(item #>> '{}') > 700);
$$;
create or replace function private.myvet_is_valid_client_summary(candidate jsonb, approved jsonb)
returns boolean language plpgsql immutable set search_path = '' as $$
declare
  allowed_fields text[] := array[
    'reason_for_visit','what_was_found','treatment_given','medications_and_instructions',
    'home_care','follow_up','warning_signs','next_steps'
  ];
begin
  if jsonb_typeof(candidate) <> 'object'
    or (select count(*) from jsonb_object_keys(candidate)) <> cardinality(allowed_fields)
    or exists (select 1 from jsonb_object_keys(candidate) key where not (key = any(allowed_fields)))
    or jsonb_typeof(candidate -> 'reason_for_visit') <> 'string'
    or char_length(candidate ->> 'reason_for_visit') > 2000 then return false; end if;

  return private.myvet_json_text_array_valid(candidate -> 'what_was_found')
    and private.myvet_json_text_array_subset(candidate -> 'treatment_given', coalesce(approved -> 'treatments','[]'::jsonb))
    and private.myvet_json_text_array_subset(candidate -> 'medications_and_instructions', coalesce(approved -> 'medications','[]'::jsonb))
    and private.myvet_json_text_array_subset(candidate -> 'home_care', coalesce(approved -> 'follow_up','[]'::jsonb))
    and private.myvet_json_text_array_subset(candidate -> 'follow_up', coalesce(approved -> 'follow_up','[]'::jsonb))
    and private.myvet_json_text_array_subset(candidate -> 'warning_signs', coalesce(approved -> 'warnings','[]'::jsonb))
    and private.myvet_json_text_array_subset(candidate -> 'next_steps', coalesce(approved -> 'unresolved_items','[]'::jsonb));
exception when others then return false;
end;
$$;
create or replace function private.myvet_is_valid_follow_up_suggestion(candidate jsonb)
returns boolean language plpgsql stable set search_path = '' as $$
declare
  allowed_fields text[] := array[
    'reminder_type','title','description','scheduled_at','target_type',
    'requires_manual_date','release_to_client','confidence'
  ];
begin
  return jsonb_typeof(candidate) = 'object'
    and (select count(*) from jsonb_object_keys(candidate)) = cardinality(allowed_fields)
    and not exists (select 1 from jsonb_object_keys(candidate) key where not (key = any(allowed_fields)))
    and candidate ->> 'reminder_type' in ('return_visit','future_vaccination','general_follow_up')
    and char_length(coalesce(candidate ->> 'title','')) between 2 and 120
    and char_length(coalesce(candidate ->> 'description','')) between 2 and 1200
    and candidate ->> 'target_type' in ('staff','owner')
    and jsonb_typeof(candidate -> 'requires_manual_date') = 'boolean'
    and jsonb_typeof(candidate -> 'release_to_client') = 'boolean'
    and candidate ->> 'confidence' in ('low','medium','high')
    and ((candidate ->> 'target_type' = 'owner') = (candidate ->> 'release_to_client')::boolean)
    and (
      ((candidate ->> 'requires_manual_date')::boolean and nullif(candidate ->> 'scheduled_at','') is null)
      or (not (candidate ->> 'requires_manual_date')::boolean
        and (candidate ->> 'scheduled_at') ~ '^\d{4}-\d{2}-\d{2}T'
        and (candidate ->> 'scheduled_at')::timestamptz > now() - interval '1 day')
    );
exception when others then return false;
end;
$$;
create or replace function private.myvet_seed_disabled_ai_feature_flags(target_clinic_id uuid)
returns void
language sql
security definer
set search_path = ''
as $$
  insert into public.ai_feature_flags (clinic_id, capability, enabled, kill_switch, configuration)
  select target_clinic_id, capability.name, false, false, '{}'::jsonb
  from (values
    ('visit_summary'::text),
    ('digitalcare_transcription'::text),
    ('digitalcare_recording'::text),
    ('digitalcare_summary'::text),
    ('rag_index'::text),
    ('record_qa'::text),
    ('document_ocr'::text),
    ('client_explanation'::text),
    ('reminder_suggestion'::text)
  ) as capability(name)
  on conflict (clinic_id, capability) do nothing;
$$;
create or replace function private.myvet_seed_disabled_ai_feature_flags_for_new_clinic()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
  perform private.myvet_seed_disabled_ai_feature_flags(new.clinic_id);
  return new;
end;
$$;
create or replace function private.myvet_protect_required_ai_feature_flags()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
  if old.capability in (
    'visit_summary','digitalcare_transcription','digitalcare_recording','digitalcare_summary',
    'rag_index','record_qa','document_ocr','client_explanation','reminder_suggestion'
  ) then
    raise exception 'AI_FEATURE_FLAG_DELETE_FORBIDDEN';
  end if;
  return old;
end;
$$;
create or replace function private.myvet_handle_owner_signup()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
declare
  requested_role text := lower(btrim(coalesce(new.raw_user_meta_data ->> 'role', '')));
  requested_owner_id text := btrim(coalesce(new.raw_user_meta_data ->> 'owner_id', ''));
  requested_full_name text := btrim(coalesce(new.raw_user_meta_data ->> 'full_name', ''));
  requested_phone text := regexp_replace(coalesce(new.raw_user_meta_data ->> 'phone', ''), '[^0-9]', '', 'g');
  requested_terms_version text := btrim(coalesce(new.raw_user_meta_data ->> 'terms_version', ''));
  requested_email text := lower(btrim(coalesce(new.email, '')));
  requested_first_name text;
  requested_last_name text;
  bootstrap_clinic_id uuid;
  existing_owner public.owners%rowtype;
begin
  if requested_role <> 'owner' then
    return new;
  end if;

  -- Existing clinic profiles may only be claimed after Supabase has verified
  -- control of the email address. Projects with email confirmation disabled
  -- populate email_confirmed_at during the initial insert.
  if new.email_confirmed_at is null then
    return new;
  end if;

  if requested_owner_id !~ '^[0-9]{9}$' then
    raise exception 'OWNER_SIGNUP_INVALID_ID';
  end if;
  if requested_full_name = '' then
    raise exception 'OWNER_SIGNUP_INVALID_NAME';
  end if;
  if requested_phone !~ '^05[0-9]{8}$' then
    raise exception 'OWNER_SIGNUP_INVALID_PHONE';
  end if;
  if requested_email = '' then
    raise exception 'OWNER_SIGNUP_INVALID_EMAIL';
  end if;
  if requested_terms_version <> 'myvet-owner-portal-v1' then
    raise exception 'OWNER_SIGNUP_TERMS_REQUIRED';
  end if;

  requested_first_name := split_part(requested_full_name, ' ', 1);
  requested_last_name := btrim(substr(requested_full_name, char_length(requested_first_name) + 1));

  select owner.*
  into existing_owner
  from public.owners as owner
  where owner.owner_id = requested_owner_id
  for update;

  if found then
    if existing_owner.auth_user_id is not null and existing_owner.auth_user_id <> new.id then
      raise exception 'OWNER_SIGNUP_ALREADY_CLAIMED';
    end if;
    if lower(btrim(coalesce(existing_owner.email, ''))) <> requested_email then
      raise exception 'OWNER_SIGNUP_EMAIL_MISMATCH';
    end if;
    update public.owners
    set auth_user_id = new.id,
        owner_first_name = requested_first_name,
        owner_last_name = requested_last_name,
        phone = requested_phone,
        terms_accepted_at = now(),
        terms_version = requested_terms_version
    where owner_id = requested_owner_id;
  else
    select clinic.clinic_id
    into strict bootstrap_clinic_id
    from public.clinics as clinic
    where clinic.slug = 'myvet-primary'
      and clinic.is_active = true;

    insert into public.owners (
      clinic_id,
      owner_id,
      auth_user_id,
      owner_first_name,
      owner_last_name,
      phone,
      email,
      terms_accepted_at,
      terms_version
    ) values (
      bootstrap_clinic_id,
      requested_owner_id,
      new.id,
      requested_first_name,
      requested_last_name,
      requested_phone,
      requested_email,
      now(),
      requested_terms_version
    );
  end if;

  -- Signup metadata is only a one-time transport into the protected profile.
  -- Remove identity, contact and role hints so they are not retained in JWT
  -- user_metadata and can never be mistaken for an authorization source.
  update auth.users
  set raw_user_meta_data = coalesce(raw_user_meta_data, '{}'::jsonb)
    - array['role', 'owner_id', 'full_name', 'phone', 'terms_version']
  where id = new.id;

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
  trusted_database_session boolean := pg_has_role(session_user, 'postgres', 'member');
  trusted_auth_owner_signup boolean :=
    session_user = 'supabase_auth_admin'
    and current_user = 'postgres'
    and tg_table_schema = 'public'
    and tg_table_name = 'owners'
    and tg_op in ('INSERT', 'UPDATE')
    and pg_trigger_depth() > 1;
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
    if jwt_role = 'service_role'
      or trusted_database_session
      or trusted_auth_owner_signup then
      if tg_op = 'DELETE' then return old; end if;
      return new;
    end if;
    raise exception 'AUTH_REQUIRED';
  end if;

  -- Compatibility for the existing verified-email claim flow. The claim RPC
  -- still performs the verified email match; this exception only lets its
  -- tenant-preserving update pass the generic write guard.
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
create or replace function myvet_private.delete_dependent_rows(
  p_parent_table regclass,
  p_parent_predicate text,
  p_visited_constraints oid[] default '{}'::oid[],
  p_visited_tables oid[] default '{}'::oid[]
)
returns void
language plpgsql
security definer
set search_path = ''
as $$
declare
  dependent record;
  child_predicate text;
begin
  for dependent in
    select
      constraint_row.oid as constraint_oid,
      constraint_row.conrelid as child_table_oid,
      format('%I.%I', child_namespace.nspname, child_table.relname) as child_table_name,
      format('%I.%I', parent_namespace.nspname, parent_table.relname) as parent_table_name,
      string_agg(format('%I', child_column.attname), ', ' order by key_columns.position) as child_columns,
      string_agg(format('%I', parent_column.attname), ', ' order by key_columns.position) as parent_columns
    from pg_catalog.pg_constraint as constraint_row
    join pg_catalog.pg_class as child_table
      on child_table.oid = constraint_row.conrelid
    join pg_catalog.pg_namespace as child_namespace
      on child_namespace.oid = child_table.relnamespace
    join pg_catalog.pg_class as parent_table
      on parent_table.oid = constraint_row.confrelid
    join pg_catalog.pg_namespace as parent_namespace
      on parent_namespace.oid = parent_table.relnamespace
    cross join lateral unnest(constraint_row.conkey, constraint_row.confkey)
      with ordinality as key_columns(child_attribute_number, parent_attribute_number, position)
    join pg_catalog.pg_attribute as child_column
      on child_column.attrelid = constraint_row.conrelid
     and child_column.attnum = key_columns.child_attribute_number
    join pg_catalog.pg_attribute as parent_column
      on parent_column.attrelid = constraint_row.confrelid
     and parent_column.attnum = key_columns.parent_attribute_number
    where constraint_row.contype = 'f'
      and constraint_row.confrelid = p_parent_table
    group by
      constraint_row.oid,
      constraint_row.conrelid,
      child_namespace.nspname,
      child_table.relname,
      parent_namespace.nspname,
      parent_table.relname
  loop
    if dependent.constraint_oid = any(p_visited_constraints)
      or dependent.child_table_oid = any(p_visited_tables) then
      continue;
    end if;

    child_predicate := format(
      '(%s) in (select %s from %s where %s)',
      dependent.child_columns,
      dependent.parent_columns,
      dependent.parent_table_name,
      p_parent_predicate
    );

    perform myvet_private.delete_dependent_rows(
      dependent.child_table_oid::regclass,
      child_predicate,
      array_append(p_visited_constraints, dependent.constraint_oid),
      array_append(p_visited_tables, dependent.child_table_oid)
    );

    execute format(
      'delete from %s where %s',
      dependent.child_table_name,
      child_predicate
    );
  end loop;
end;
$$;
--
-- PostgreSQL database dump
--


-- Dumped from database version 17.6
-- Dumped by pg_dump version 17.11

SET statement_timeout = 0;
SET lock_timeout = 0;
SET idle_in_transaction_session_timeout = 0;
SET transaction_timeout = 0;
SET client_encoding = 'UTF8';
SET standard_conforming_strings = on;
SELECT pg_catalog.set_config('search_path', '', false);
SET check_function_bodies = false;
SET xmloption = content;
SET client_min_messages = warning;
SET row_security = off;

--
-- Name: public; Type: SCHEMA; Schema: -; Owner: -
--

CREATE SCHEMA IF NOT EXISTS "public";


--
-- Name: SCHEMA "public"; Type: COMMENT; Schema: -; Owner: -
--

COMMENT ON SCHEMA "public" IS 'standard public schema';


--
-- Name: claim_owner_profile(); Type: FUNCTION; Schema: public; Owner: -
--

CREATE FUNCTION "public"."claim_owner_profile"() RETURNS "text"
    LANGUAGE "plpgsql" SECURITY DEFINER
    SET "search_path" TO ''
    AS $$
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


--
-- Name: FUNCTION "claim_owner_profile"(); Type: COMMENT; Schema: public; Owner: -
--

COMMENT ON FUNCTION "public"."claim_owner_profile"() IS 'Claims a single unlinked owner row using the verified JWT email; never accepts an email argument.';


--
-- Name: myvet_available_slots("date", "date"); Type: FUNCTION; Schema: public; Owner: -
--

CREATE FUNCTION "public"."myvet_available_slots"("range_start" "date", "range_end" "date") RETURNS TABLE("slot_start" timestamp with time zone, "slot_end" timestamp with time zone)
    LANGUAGE "sql" STABLE SECURITY DEFINER
    SET "search_path" TO ''
    AS $$
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


--
-- Name: FUNCTION "myvet_available_slots"("range_start" "date", "range_end" "date"); Type: COMMENT; Schema: public; Owner: -
--

COMMENT ON FUNCTION "public"."myvet_available_slots"("range_start" "date", "range_end" "date") IS 'Returns free clinic slots only; no patient or appointment details are exposed.';


--
-- Name: myvet_begin_digitalcare_capture("uuid", bigint, bigint, "text", boolean, boolean, boolean, "text", "text", bigint); Type: FUNCTION; Schema: public; Owner: -
--

CREATE FUNCTION "public"."myvet_begin_digitalcare_capture"("requested_actor_user_id" "uuid", "requested_video_session_id" bigint, "requested_appointment_id" bigint, "requested_notice_version" "text", "requested_transcription_consent" boolean, "requested_recording_consent" boolean, "requested_recording_enabled" boolean, "requested_object_path" "text", "requested_mime_type" "text", "requested_size_limit" bigint) RETURNS TABLE("clinic_id" "uuid", "pet_id" bigint, "owner_id" "text", "appointment_id" bigint, "video_session_id" bigint, "recording_document_id" "uuid", "object_path" "text", "recording_retention_until" timestamp with time zone)
    LANGUAGE "plpgsql" SECURITY DEFINER
    SET "search_path" TO ''
    AS $_$
declare
  target record;
  target_document_id uuid;
  retention_days integer;
  operation_id uuid;
begin
  if requested_actor_user_id is null or requested_video_session_id is null
    or requested_appointment_id is null or requested_transcription_consent is not true
    or char_length(coalesce(requested_notice_version, '')) not between 1 and 80 then
    raise exception 'DIGITALCARE_CONSENT_REQUIRED';
  end if;
  if requested_recording_enabled and requested_recording_consent is not true then
    raise exception 'DIGITALCARE_RECORDING_CONSENT_REQUIRED';
  end if;

  select session.clinic_id, session.session_id, session.appointment_id as linked_appointment_id,
    session.recording_document_id, session.transcription_status,
    session.owner_id, session.pet_id, appointment.appointment_id,
    appointment.appointment_mode, staff.staff_id, owner.auth_user_id as owner_auth_user_id
  into target
  from public.video_sessions as session
  join public.appointments as appointment
    on appointment.clinic_id = session.clinic_id
   and appointment.appointment_id = requested_appointment_id
   and appointment.pet_id = session.pet_id
  join public.patients as pet
    on pet.clinic_id = session.clinic_id and pet.pet_id = session.pet_id
   and pet.owner_id = session.owner_id
  join public.owners as owner
    on owner.clinic_id = session.clinic_id and owner.owner_id = session.owner_id
  join public.staff as staff
    on staff.clinic_id = session.clinic_id
   and staff.auth_user_id = requested_actor_user_id
   and staff.is_active = true and staff.role = 'vet'
  where session.session_id = requested_video_session_id
    and session.status in ('scheduled','active','completed');

  if target.clinic_id is null or lower(coalesce(target.appointment_mode, '')) <> 'video'
    or (target.linked_appointment_id is not null and target.linked_appointment_id <> requested_appointment_id) then
    raise exception 'DIGITALCARE_ACCESS_DENIED';
  end if;
  if not exists (
    select 1 from public.ai_feature_flags
    where ai_feature_flags.clinic_id = target.clinic_id
      and capability = 'digitalcare_transcription' and enabled and not kill_switch
  ) then raise exception 'AI_FEATURE_DISABLED'; end if;
  if requested_recording_enabled and not exists (
    select 1 from public.ai_feature_flags
    where ai_feature_flags.clinic_id = target.clinic_id
      and capability = 'digitalcare_recording' and enabled and not kill_switch
  ) then raise exception 'AI_FEATURE_DISABLED'; end if;

  perform pg_advisory_xact_lock(hashtextextended('digitalcare:' || requested_video_session_id::text, 0));
  if target.recording_document_id is not null
    and target.transcription_status in ('capturing','processing','ready') then
    return query select target.clinic_id, target.pet_id, target.owner_id,
      requested_appointment_id, requested_video_session_id, document.document_id,
      document.object_path, document.retention_until
    from public.ai_documents as document
    where document.clinic_id = target.clinic_id
      and document.document_id = target.recording_document_id
      and document.deleted_at is null;
    if found then return; end if;
  end if;
  update public.video_sessions set appointment_id = requested_appointment_id,
    transcription_status = 'capturing',
    recording_status = case when requested_recording_enabled then 'recording' else 'disabled' end,
    consent_notice_version = requested_notice_version, ai_updated_at = now()
  where session_id = requested_video_session_id;

  insert into public.ai_consent_records(
    clinic_id, owner_id, auth_user_id, purpose, notice_version, status, capture_source,
    granted_at, created_by, appointment_id, video_session_id
  ) values (
    target.clinic_id, target.owner_id, target.owner_auth_user_id, 'transcription', requested_notice_version,
    'granted', 'staff_assisted', now(), requested_actor_user_id,
    requested_appointment_id, requested_video_session_id
  ) on conflict do nothing;
  if requested_recording_enabled then
    insert into public.ai_consent_records(
      clinic_id, owner_id, auth_user_id, purpose, notice_version, status, capture_source,
      granted_at, created_by, appointment_id, video_session_id
    ) values (
      target.clinic_id, target.owner_id, target.owner_auth_user_id, 'recording', requested_notice_version,
      'granted', 'staff_assisted', now(), requested_actor_user_id,
      requested_appointment_id, requested_video_session_id
    ) on conflict do nothing;
  end if;

  if requested_object_path !~ ('^' || target.clinic_id::text || '/' || target.pet_id::text || '/digitalcare/[0-9]+/[0-9a-f-]+[.]webm$')
    or requested_mime_type not in ('audio/webm','audio/ogg','audio/mp4','audio/mpeg','audio/wav')
    or requested_size_limit not between 1 and 10485760 then
    raise exception 'DIGITALCARE_STORAGE_INPUT_INVALID';
  end if;
  if requested_recording_enabled then
    select greatest(1, least(30, coalesce((configuration ->> 'retention_days')::integer, 7)))
      into retention_days from public.ai_feature_flags
    where ai_feature_flags.clinic_id = target.clinic_id and ai_feature_flags.capability = 'digitalcare_recording';
  end if;
  insert into public.ai_documents(
    clinic_id, owner_id, pet_id, appointment_id, document_kind, bucket_id,
    object_path, mime_type, size_bytes, status, uploaded_by, retention_until
  ) values (
    target.clinic_id, target.owner_id, target.pet_id, requested_appointment_id,
    case when requested_recording_enabled then 'recording' else 'transcript_source' end,
    'ai-recordings', requested_object_path, requested_mime_type,
    requested_size_limit, 'pending', requested_actor_user_id,
    now() + make_interval(days => case when requested_recording_enabled then coalesce(retention_days, 7) else 1 end)
  ) returning document_id into target_document_id;
  update public.video_sessions set recording_document_id = target_document_id
    where session_id = requested_video_session_id;

  insert into public.ai_operations(
    clinic_id, capability, actor_user_id, actor_staff_id, owner_id, pet_id,
    appointment_id, status, idempotency_key, started_at
  ) values (
    target.clinic_id, case when requested_recording_enabled then 'digitalcare_recording' else 'digitalcare_transcription' end,
    requested_actor_user_id, target.staff_id, target.owner_id, target.pet_id,
    requested_appointment_id, 'running', 'digitalcare-capture:' || requested_video_session_id::text,
    now()
  ) returning public.ai_operations.operation_id into operation_id;
  insert into public.ai_audit_events(
    clinic_id, actor_user_id, operation_id, capability, event_type, outcome
  ) values
    (target.clinic_id, requested_actor_user_id, operation_id, 'digitalcare_transcription', 'consent_recorded', 'success'),
    (target.clinic_id, requested_actor_user_id, operation_id, 'digitalcare_transcription', 'capture_started', 'success');

  return query select target.clinic_id, target.pet_id, target.owner_id,
    requested_appointment_id, requested_video_session_id, target_document_id,
    requested_object_path,
    (select retention_until from public.ai_documents where document_id = target_document_id);
end;
$_$;


--
-- Name: FUNCTION "myvet_begin_digitalcare_capture"("requested_actor_user_id" "uuid", "requested_video_session_id" bigint, "requested_appointment_id" bigint, "requested_notice_version" "text", "requested_transcription_consent" boolean, "requested_recording_consent" boolean, "requested_recording_enabled" boolean, "requested_object_path" "text", "requested_mime_type" "text", "requested_size_limit" bigint); Type: COMMENT; Schema: public; Owner: -
--

COMMENT ON FUNCTION "public"."myvet_begin_digitalcare_capture"("requested_actor_user_id" "uuid", "requested_video_session_id" bigint, "requested_appointment_id" bigint, "requested_notice_version" "text", "requested_transcription_consent" boolean, "requested_recording_consent" boolean, "requested_recording_enabled" boolean, "requested_object_path" "text", "requested_mime_type" "text", "requested_size_limit" bigint) IS 'Stage 4 service-only gate: derives tenant/pet/owner from a verified video appointment and requires explicit consent.';


--
-- Name: myvet_booked_slots(timestamp with time zone, timestamp with time zone); Type: FUNCTION; Schema: public; Owner: -
--

CREATE FUNCTION "public"."myvet_booked_slots"("range_start" timestamp with time zone, "range_end" timestamp with time zone) RETURNS TABLE("slot_start" timestamp with time zone, "slot_end" timestamp with time zone)
    LANGUAGE "sql" STABLE SECURITY DEFINER
    SET "search_path" TO ''
    AS $$
  select appointment.start_time, appointment.end_time
  from public.appointments as appointment
  where (select auth.uid()) is not null
    and appointment.clinic_id = private.myvet_current_clinic_id()
    and appointment.start_time >= range_start
    and appointment.start_time <= range_end;
$$;


--
-- Name: FUNCTION "myvet_booked_slots"("range_start" timestamp with time zone, "range_end" timestamp with time zone); Type: COMMENT; Schema: public; Owner: -
--

COMMENT ON FUNCTION "public"."myvet_booked_slots"("range_start" timestamp with time zone, "range_end" timestamp with time zone) IS 'Returns occupied times only, without appointment, owner, pet or note data.';


--
-- Name: myvet_complete_digitalcare_transcript("uuid", bigint, "text", "text", "uuid", "text", "text", integer, integer, integer); Type: FUNCTION; Schema: public; Owner: -
--

CREATE FUNCTION "public"."myvet_complete_digitalcare_transcript"("requested_actor_user_id" "uuid", "requested_video_session_id" bigint, "requested_transcript" "text", "requested_language" "text", "requested_request_id" "uuid", "requested_provider" "text", "requested_model_version" "text", "requested_latency_ms" integer, "requested_input_tokens" integer, "requested_output_tokens" integer) RETURNS TABLE("artifact_id" "uuid", "status" "text", "content" "jsonb", "visit_id" bigint)
    LANGUAGE "plpgsql" SECURITY DEFINER
    SET "search_path" TO ''
    AS $$
declare
  target record;
  operation_id uuid;
  transcript_id uuid;
  transcript_content jsonb;
  retention_days integer;
  existing_id uuid;
begin
  if requested_actor_user_id is null or requested_request_id is null
    or char_length(trim(coalesce(requested_transcript, ''))) not between 1 and 300000
    or char_length(coalesce(requested_language, '')) not between 2 and 20 then
    raise exception 'DIGITALCARE_TRANSCRIPT_INVALID';
  end if;
  select session.*, staff.staff_id as actor_staff_id into target
  from public.video_sessions as session
  join public.staff as staff on staff.clinic_id = session.clinic_id
    and staff.auth_user_id = requested_actor_user_id and staff.is_active and staff.role = 'vet'
  where session.session_id = requested_video_session_id
    and session.appointment_id is not null
    and session.transcription_status in ('capturing','processing','ready');
  if target.clinic_id is null or not exists (
    select 1 from public.ai_consent_records
    where ai_consent_records.clinic_id = target.clinic_id and ai_consent_records.owner_id = target.owner_id
      and ai_consent_records.purpose = 'transcription' and ai_consent_records.status = 'granted'
      and ai_consent_records.appointment_id = target.appointment_id and ai_consent_records.video_session_id = target.session_id
  ) then raise exception 'DIGITALCARE_ACCESS_DENIED'; end if;

  perform pg_advisory_xact_lock(hashtextextended('digitalcare-transcript:' || requested_video_session_id::text, 0));
  select artifact.artifact_id into existing_id from public.ai_artifacts as artifact
    where artifact.clinic_id = target.clinic_id
      and artifact.artifact_id = target.transcript_artifact_id
      and artifact.artifact_type = 'transcript' and artifact.deleted_at is null limit 1;
  if existing_id is not null then
    return query select artifact.artifact_id, artifact.status, artifact.content, artifact.visit_id
      from public.ai_artifacts as artifact where artifact.artifact_id = existing_id;
    return;
  end if;

  select greatest(1, least(90, coalesce((configuration ->> 'retention_days')::integer, 30)))
    into retention_days from public.ai_feature_flags
    where ai_feature_flags.clinic_id = target.clinic_id and ai_feature_flags.capability = 'digitalcare_transcription';
  insert into public.ai_operations(
    clinic_id, capability, actor_user_id, actor_staff_id, owner_id, pet_id,
    appointment_id, status, idempotency_key, provider, model_version,
    schema_version, latency_ms, input_tokens, output_tokens, started_at, completed_at
  ) values (
    target.clinic_id, 'digitalcare_transcription', requested_actor_user_id,
    target.actor_staff_id, target.owner_id, target.pet_id, target.appointment_id,
    'succeeded', 'digitalcare-transcript:' || requested_request_id::text,
    left(requested_provider, 80), left(requested_model_version, 120),
    '2026-07-17.1', greatest(requested_latency_ms, 0),
    greatest(requested_input_tokens, 0), greatest(requested_output_tokens, 0), now(), now()
  ) returning public.ai_operations.operation_id into operation_id;
  transcript_content := jsonb_build_object(
    'text', trim(requested_transcript), 'language', requested_language,
    'automatic', true, 'approved', false
  );
  insert into public.ai_artifacts(
    clinic_id, operation_id, owner_id, pet_id, appointment_id, artifact_type,
    status, content, created_by, model_version, prompt_version, retention_until
  ) values (
    target.clinic_id, operation_id, target.owner_id, target.pet_id,
    target.appointment_id, 'transcript', 'draft', transcript_content,
    requested_actor_user_id, left(requested_model_version, 120),
    'digitalcare-transcription-2026-07-17.1',
    now() + make_interval(days => coalesce(retention_days, 30))
  ) returning public.ai_artifacts.artifact_id into transcript_id;
  insert into public.ai_sources(clinic_id, artifact_id, source_type, source_record_id, document_id)
  values (target.clinic_id, transcript_id, 'digitalcare',
    target.conversation_id::text, target.recording_document_id);
  update public.video_sessions set transcript_artifact_id = transcript_id,
    transcription_status = 'ready', recording_status = case when recording_document_id is null then recording_status else 'stored' end,
    ai_updated_at = now() where session_id = requested_video_session_id;
  insert into public.ai_audit_events(
    clinic_id, actor_user_id, operation_id, capability, event_type, outcome,
    provider, model_version, prompt_version, schema_version, latency_ms,
    input_tokens, output_tokens
  ) values (
    target.clinic_id, requested_actor_user_id, operation_id,
    'digitalcare_transcription', 'transcript_created', 'success',
    left(requested_provider, 80), left(requested_model_version, 120),
    'digitalcare-transcription-2026-07-17.1', '2026-07-17.1',
    greatest(requested_latency_ms, 0), greatest(requested_input_tokens, 0),
    greatest(requested_output_tokens, 0)
  );
  return query select transcript_id, 'draft'::text, transcript_content, null::bigint;
end;
$$;


--
-- Name: myvet_conversation_owned("text"); Type: FUNCTION; Schema: public; Owner: -
--

CREATE FUNCTION "public"."myvet_conversation_owned"("candidate_conversation_id" "text") RETURNS boolean
    LANGUAGE "sql" STABLE SECURITY DEFINER
    SET "search_path" TO ''
    AS $$
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


--
-- Name: myvet_create_client_summary_draft("uuid", "uuid", "jsonb", "uuid", "text", "text", "text", integer, integer, integer, boolean); Type: FUNCTION; Schema: public; Owner: -
--

CREATE FUNCTION "public"."myvet_create_client_summary_draft"("requested_actor_user_id" "uuid", "requested_approved_artifact_id" "uuid", "requested_content" "jsonb", "requested_request_id" "uuid", "requested_provider" "text", "requested_model_version" "text", "requested_prompt_version" "text", "requested_latency_ms" integer, "requested_input_tokens" integer, "requested_output_tokens" integer, "requested_generated_by_ai" boolean DEFAULT true) RETURNS TABLE("artifact_id" "uuid", "status" "text", "content" "jsonb", "version_number" integer, "released_to_owner" boolean)
    LANGUAGE "plpgsql" SECURITY DEFINER
    SET "search_path" TO ''
    AS $$
declare
  source_record record; actor_staff_id uuid; operation_id uuid; new_id uuid; next_version integer; existing record;
begin
  select source.*, staff.staff_id into source_record
  from public.ai_artifacts source
  join public.staff staff on staff.clinic_id = source.clinic_id
    and staff.auth_user_id = requested_actor_user_id and staff.is_active and staff.role = 'vet'
  where source.artifact_id = requested_approved_artifact_id
    and source.artifact_type = 'visit_summary' and source.status = 'approved'
    and source.deleted_at is null;
  actor_staff_id := source_record.staff_id;
  if source_record.artifact_id is null then raise exception 'CLIENT_SUMMARY_APPROVED_SOURCE_REQUIRED'; end if;
  if requested_request_id is null
    or not private.myvet_is_valid_client_summary(requested_content, source_record.content) then
    raise exception 'CLIENT_SUMMARY_INPUT_INVALID'; end if;
  if exists (select 1 from public.ai_feature_flags where clinic_id = source_record.clinic_id
    and capability = 'client_explanation' and (not enabled or kill_switch)) then
    raise exception 'AI_FEATURE_DISABLED'; end if;

  perform pg_advisory_xact_lock(hashtextextended('client-summary:' || source_record.visit_id::text,0));
  select artifact.* into existing from public.ai_artifacts artifact
  where artifact.clinic_id = source_record.clinic_id and artifact.visit_id = source_record.visit_id
    and artifact.artifact_type = 'client_explanation' and artifact.status in ('draft','edited')
    and artifact.deleted_at is null order by artifact.version_number desc limit 1;
  if existing.artifact_id is not null then
    return query select existing.artifact_id,existing.status,existing.content,existing.version_number,existing.released_to_owner;
    return;
  end if;

  insert into public.ai_operations(
    clinic_id,capability,actor_user_id,actor_staff_id,owner_id,pet_id,visit_id,status,
    idempotency_key,provider,model_version,prompt_version,schema_version,latency_ms,input_tokens,
    output_tokens,started_at,completed_at
  ) values (
    source_record.clinic_id,'client_explanation',requested_actor_user_id,actor_staff_id,
    source_record.owner_id,source_record.pet_id,source_record.visit_id,'succeeded',
    'client-summary:' || requested_request_id::text,left(requested_provider,80),left(requested_model_version,120),
    left(requested_prompt_version,120),'2026-07-17.1',greatest(requested_latency_ms,0),
    greatest(requested_input_tokens,0),greatest(requested_output_tokens,0),now(),now()
  ) on conflict (clinic_id,capability,idempotency_key) where idempotency_key is not null
  do update set updated_at = public.ai_operations.updated_at returning public.ai_operations.operation_id into operation_id;

  select coalesce(max(artifact.version_number),0)+1 into next_version from public.ai_artifacts artifact
  where artifact.clinic_id=source_record.clinic_id and artifact.visit_id=source_record.visit_id
    and artifact.artifact_type='client_explanation';
  insert into public.ai_artifacts(
    clinic_id,operation_id,owner_id,pet_id,visit_id,artifact_type,status,content,created_by,
    model_version,prompt_version,version_number
  ) values (
    source_record.clinic_id,operation_id,source_record.owner_id,source_record.pet_id,source_record.visit_id,
    'client_explanation','draft',requested_content,requested_actor_user_id,left(requested_model_version,120),
    left(requested_prompt_version,120),next_version
  ) returning public.ai_artifacts.artifact_id into new_id;
  insert into public.ai_sources(clinic_id,artifact_id,source_type,source_record_id)
    values(source_record.clinic_id,new_id,'ai_artifact',source_record.artifact_id::text);
  insert into public.ai_approval_history(clinic_id,artifact_id,action,actor_user_id,actor_staff_id,previous_status,new_status,change_summary)
    values(source_record.clinic_id,new_id,'submitted',requested_actor_user_id,actor_staff_id,null,'draft',
      jsonb_build_object('generated_by_ai',requested_generated_by_ai));
  insert into public.ai_audit_events(clinic_id,actor_user_id,operation_id,capability,event_type,outcome,provider,model_version,prompt_version,schema_version,latency_ms,input_tokens,output_tokens)
    values(source_record.clinic_id,requested_actor_user_id,operation_id,'client_explanation','draft_created','success',
      left(requested_provider,80),left(requested_model_version,120),left(requested_prompt_version,120),'2026-07-17.1',
      greatest(requested_latency_ms,0),greatest(requested_input_tokens,0),greatest(requested_output_tokens,0));
  return query select new_id,'draft'::text,requested_content,next_version,false;
end;
$$;


--
-- Name: myvet_create_follow_up_suggestion_draft("uuid", "text", "text", "jsonb", "uuid", "text", "text", "text", integer, integer, integer, boolean); Type: FUNCTION; Schema: public; Owner: -
--

CREATE FUNCTION "public"."myvet_create_follow_up_suggestion_draft"("requested_actor_user_id" "uuid", "requested_source_type" "text", "requested_source_id" "text", "requested_content" "jsonb", "requested_request_id" "uuid", "requested_provider" "text", "requested_model_version" "text", "requested_prompt_version" "text", "requested_latency_ms" integer, "requested_input_tokens" integer, "requested_output_tokens" integer, "requested_generated_by_ai" boolean DEFAULT true) RETURNS TABLE("artifact_id" "uuid", "status" "text", "content" "jsonb", "version_number" integer)
    LANGUAGE "plpgsql" SECURITY DEFINER
    SET "search_path" TO ''
    AS $_$
declare
  source_record record; actor_staff_id uuid; operation_id uuid; new_id uuid; next_version integer; existing record;
begin
  if requested_source_type = 'ai_artifact' then
    select source.clinic_id,source.owner_id,source.pet_id,source.visit_id,source.artifact_id::text as source_id,
      staff.staff_id into source_record
    from public.ai_artifacts source
    join public.staff staff on staff.clinic_id=source.clinic_id and staff.auth_user_id=requested_actor_user_id
      and staff.is_active and staff.role='vet'
    where source.artifact_id=case when requested_source_id ~* '^[0-9a-f-]{36}$' then requested_source_id::uuid else null end
      and source.artifact_type='visit_summary' and source.status='approved' and source.deleted_at is null;
  elsif requested_source_type = 'vaccination' then
    select vaccine.clinic_id,patient.owner_id,vaccine.pet_id,null::bigint as visit_id,
      vaccine.vaccination_id::text as source_id,staff.staff_id into source_record
    from public.vaccinations vaccine
    join public.patients patient on patient.clinic_id=vaccine.clinic_id and patient.pet_id=vaccine.pet_id
    join public.staff staff on staff.clinic_id=vaccine.clinic_id and staff.auth_user_id=requested_actor_user_id
      and staff.is_active and staff.role='vet'
    where vaccine.vaccination_id=case when requested_source_id ~* '^[0-9a-f-]{36}$' then requested_source_id::uuid else null end
      and vaccine.given_date is not null;
  else
    raise exception 'FOLLOW_UP_SOURCE_INVALID';
  end if;
  actor_staff_id := source_record.staff_id;
  if source_record.clinic_id is null then raise exception 'FOLLOW_UP_APPROVED_SOURCE_REQUIRED'; end if;
  if requested_request_id is null or not private.myvet_is_valid_follow_up_suggestion(requested_content) then
    raise exception 'FOLLOW_UP_INPUT_INVALID';
  end if;
  if exists (select 1 from public.ai_feature_flags where clinic_id=source_record.clinic_id
    and capability='reminder_suggestion' and (not enabled or kill_switch)) then raise exception 'AI_FEATURE_DISABLED'; end if;

  perform pg_advisory_xact_lock(hashtextextended('follow-up:' || requested_source_type || ':' || requested_source_id,0));
  select artifact.* into existing from public.ai_artifacts artifact
  join public.ai_sources link on link.clinic_id=artifact.clinic_id and link.artifact_id=artifact.artifact_id
  where link.source_type=requested_source_type and link.source_record_id=source_record.source_id
    and artifact.artifact_type='reminder_suggestion' and artifact.status in ('draft','edited')
    and artifact.content ->> 'reminder_type'=requested_content ->> 'reminder_type'
    and artifact.deleted_at is null order by artifact.version_number desc limit 1;
  if existing.artifact_id is not null then
    return query select existing.artifact_id,existing.status,existing.content,existing.version_number;
    return;
  end if;

  insert into public.ai_operations(
    clinic_id,capability,actor_user_id,actor_staff_id,owner_id,pet_id,visit_id,status,idempotency_key,
    provider,model_version,prompt_version,schema_version,latency_ms,input_tokens,output_tokens,started_at,completed_at
  ) values (
    source_record.clinic_id,'reminder_suggestion',requested_actor_user_id,actor_staff_id,source_record.owner_id,
    source_record.pet_id,source_record.visit_id,'succeeded','follow-up:' || requested_request_id::text,
    left(requested_provider,80),left(requested_model_version,120),left(requested_prompt_version,120),'2026-07-17.1',
    greatest(requested_latency_ms,0),greatest(requested_input_tokens,0),greatest(requested_output_tokens,0),now(),now()
  ) on conflict (clinic_id,capability,idempotency_key) where idempotency_key is not null
  do update set updated_at=public.ai_operations.updated_at returning public.ai_operations.operation_id into operation_id;

  select coalesce(max(artifact.version_number),0)+1 into next_version from public.ai_artifacts artifact
  where artifact.clinic_id=source_record.clinic_id and artifact.pet_id=source_record.pet_id
    and artifact.artifact_type='reminder_suggestion';
  insert into public.ai_artifacts(
    clinic_id,operation_id,owner_id,pet_id,visit_id,artifact_type,status,content,created_by,
    model_version,prompt_version,version_number
  ) values (
    source_record.clinic_id,operation_id,source_record.owner_id,source_record.pet_id,source_record.visit_id,
    'reminder_suggestion','draft',requested_content,requested_actor_user_id,left(requested_model_version,120),
    left(requested_prompt_version,120),next_version
  ) returning public.ai_artifacts.artifact_id into new_id;
  insert into public.ai_sources(clinic_id,artifact_id,source_type,source_record_id)
    values(source_record.clinic_id,new_id,requested_source_type,source_record.source_id);
  insert into public.ai_approval_history(clinic_id,artifact_id,action,actor_user_id,actor_staff_id,previous_status,new_status,change_summary)
    values(source_record.clinic_id,new_id,'submitted',requested_actor_user_id,actor_staff_id,null,'draft',
      jsonb_build_object('generated_by_ai',requested_generated_by_ai));
  insert into public.ai_audit_events(clinic_id,actor_user_id,operation_id,capability,event_type,outcome,provider,model_version,prompt_version,schema_version,latency_ms,input_tokens,output_tokens)
    values(source_record.clinic_id,requested_actor_user_id,operation_id,'reminder_suggestion','draft_created','success',
      left(requested_provider,80),left(requested_model_version,120),left(requested_prompt_version,120),'2026-07-17.1',
      greatest(requested_latency_ms,0),greatest(requested_input_tokens,0),greatest(requested_output_tokens,0));
  return query select new_id,'draft'::text,requested_content,next_version;
end;
$_$;


--
-- Name: myvet_create_visit_summary_draft("uuid", bigint, "jsonb", "uuid", "text", "text", "text", integer, integer, integer); Type: FUNCTION; Schema: public; Owner: -
--

CREATE FUNCTION "public"."myvet_create_visit_summary_draft"("requested_actor_user_id" "uuid", "requested_visit_id" bigint, "requested_content" "jsonb", "requested_request_id" "uuid", "requested_provider" "text", "requested_model_version" "text", "requested_prompt_version" "text", "requested_latency_ms" integer, "requested_input_tokens" integer, "requested_output_tokens" integer) RETURNS TABLE("artifact_id" "uuid", "status" "text", "content" "jsonb", "version_number" integer)
    LANGUAGE "plpgsql" SECURITY DEFINER
    SET "search_path" TO ''
    AS $$
declare
  target_clinic_id uuid;
  target_pet_id bigint;
  target_owner_id text;
  actor_staff_id uuid;
  new_operation_id uuid;
  new_artifact_id uuid;
  next_version integer;
  existing_record record;
begin
  if requested_actor_user_id is null or requested_visit_id is null
    or requested_request_id is null
    or not private.myvet_is_valid_visit_summary(requested_content) then
    raise exception 'VISIT_SUMMARY_INPUT_INVALID';
  end if;

  select visit.clinic_id, visit.pet_id, pet.owner_id, staff.staff_id
  into target_clinic_id, target_pet_id, target_owner_id, actor_staff_id
  from public.medical_visits as visit
  join public.patients as pet
    on pet.clinic_id = visit.clinic_id and pet.pet_id = visit.pet_id
  join public.staff as staff
    on staff.clinic_id = visit.clinic_id
   and staff.auth_user_id = requested_actor_user_id
   and staff.is_active = true
   and staff.role = 'vet'
  where visit.visit_id = requested_visit_id;

  if target_clinic_id is null then raise exception 'VISIT_SUMMARY_ACCESS_DENIED'; end if;
  if exists (
    select 1 from public.ai_feature_flags
    where clinic_id = target_clinic_id and capability = 'visit_summary'
      and (not enabled or kill_switch)
  ) then
    raise exception 'AI_FEATURE_DISABLED';
  end if;

  perform pg_advisory_xact_lock(hashtextextended('visit-summary:' || requested_visit_id::text, 0));

  select artifact.artifact_id, artifact.status, artifact.content, artifact.version_number
  into existing_record
  from public.ai_artifacts as artifact
  where artifact.clinic_id = target_clinic_id
    and artifact.visit_id = requested_visit_id
    and artifact.artifact_type = 'visit_summary'
    and artifact.status in ('generating', 'draft', 'edited')
    and artifact.deleted_at is null
  order by artifact.version_number desc
  limit 1;

  if existing_record.artifact_id is not null then
    return query select existing_record.artifact_id, existing_record.status,
      existing_record.content, existing_record.version_number;
    return;
  end if;

  insert into public.ai_operations(
    clinic_id, capability, actor_user_id, actor_staff_id, owner_id, pet_id, visit_id,
    status, idempotency_key, provider, model_version, prompt_version, schema_version,
    latency_ms, input_tokens, output_tokens, started_at, completed_at
  ) values (
    target_clinic_id, 'visit_summary', requested_actor_user_id, actor_staff_id,
    target_owner_id, target_pet_id, requested_visit_id, 'succeeded',
    'visit-summary:' || requested_request_id::text, left(requested_provider, 80),
    left(requested_model_version, 120), left(requested_prompt_version, 120),
    '2026-07-17.1', greatest(requested_latency_ms, 0),
    greatest(requested_input_tokens, 0), greatest(requested_output_tokens, 0), now(), now()
  )
  on conflict (clinic_id, capability, idempotency_key) where idempotency_key is not null
  do update set updated_at = public.ai_operations.updated_at
  returning operation_id into new_operation_id;

  select coalesce(max(artifact.version_number), 0) + 1 into next_version
  from public.ai_artifacts as artifact
  where artifact.clinic_id = target_clinic_id
    and artifact.visit_id = requested_visit_id
    and artifact.artifact_type = 'visit_summary';

  insert into public.ai_artifacts(
    clinic_id, operation_id, owner_id, pet_id, visit_id, artifact_type, status,
    content, created_by, model_version, prompt_version, version_number
  ) values (
    target_clinic_id, new_operation_id, target_owner_id, target_pet_id,
    requested_visit_id, 'visit_summary', 'draft', requested_content,
    requested_actor_user_id, left(requested_model_version, 120),
    left(requested_prompt_version, 120), next_version
  ) returning public.ai_artifacts.artifact_id into new_artifact_id;

  insert into public.ai_sources(
    clinic_id, artifact_id, source_type, source_record_id
  ) values (target_clinic_id, new_artifact_id, 'medical_visit', requested_visit_id::text);

  insert into public.ai_approval_history(
    clinic_id, artifact_id, action, actor_user_id, actor_staff_id,
    previous_status, new_status, change_summary
  ) values (
    target_clinic_id, new_artifact_id, 'submitted', requested_actor_user_id,
    actor_staff_id, null, 'draft', jsonb_build_object('generated_by_ai', true)
  );

  insert into public.ai_audit_events(
    clinic_id, actor_user_id, operation_id, capability, event_type, outcome,
    provider, model_version, prompt_version, schema_version, latency_ms,
    input_tokens, output_tokens
  ) values (
    target_clinic_id, requested_actor_user_id, new_operation_id, 'visit_summary',
    'draft_created', 'success', left(requested_provider, 80),
    left(requested_model_version, 120), left(requested_prompt_version, 120),
    '2026-07-17.1', greatest(requested_latency_ms, 0),
    greatest(requested_input_tokens, 0), greatest(requested_output_tokens, 0)
  );

  return query select new_artifact_id, 'draft'::text, requested_content, next_version;
end;
$$;


--
-- Name: myvet_current_owner_id(); Type: FUNCTION; Schema: public; Owner: -
--

CREATE FUNCTION "public"."myvet_current_owner_id"() RETURNS "text"
    LANGUAGE "sql" STABLE SECURITY DEFINER
    SET "search_path" TO ''
    AS $$
  select owner_id
  from public.owners
  where auth_user_id = (select auth.uid())
  limit 1;
$$;


--
-- Name: myvet_delete_patient(bigint); Type: FUNCTION; Schema: public; Owner: -
--

CREATE FUNCTION "public"."myvet_delete_patient"("p_pet_id" bigint) RETURNS "jsonb"
    LANGUAGE "plpgsql" SECURITY DEFINER
    SET "search_path" TO ''
    AS $$
declare
  target_clinic_id uuid;
  deleted_rows integer;
begin
  if auth.uid() is null then
    raise exception using errcode = '42501', message = 'Authentication is required';
  end if;

  select patient.clinic_id
    into target_clinic_id
  from public.patients as patient
  where patient.pet_id = p_pet_id
  for update;

  if target_clinic_id is null then
    raise exception using errcode = 'P0002', message = 'Patient was not found';
  end if;

  if not exists (
    select 1
    from public.staff as staff_member
    where staff_member.auth_user_id = auth.uid()
      and staff_member.clinic_id = target_clinic_id
      and staff_member.is_active = true
      and staff_member.role = 'clinic_admin'
  ) then
    raise exception using errcode = '42501', message = 'Only a clinic administrator may delete a patient';
  end if;

  perform pg_catalog.pg_advisory_xact_lock(
    pg_catalog.hashtextextended(target_clinic_id::text || ':' || p_pet_id::text, 0)
  );

  perform myvet_private.delete_dependent_rows(
    'public.patients'::regclass,
    format('clinic_id = %L and pet_id = %L', target_clinic_id, p_pet_id),
    '{}'::oid[],
    array['public.patients'::regclass::oid]
  );

  delete from public.patients
  where clinic_id = target_clinic_id
    and pet_id = p_pet_id;

  get diagnostics deleted_rows = row_count;

  if deleted_rows <> 1 then
    raise exception using errcode = 'P0002', message = 'Patient was not found';
  end if;

  return pg_catalog.jsonb_build_object(
    'deleted', true,
    'pet_id', p_pet_id
  );
end;
$$;


--
-- Name: FUNCTION "myvet_delete_patient"("p_pet_id" bigint); Type: COMMENT; Schema: public; Owner: -
--

COMMENT ON FUNCTION "public"."myvet_delete_patient"("p_pet_id" bigint) IS 'Atomically deletes one patient and dependent rows. Restricted to an active clinic administrator.';


--
-- Name: myvet_ensure_digitalcare_visit("uuid", bigint); Type: FUNCTION; Schema: public; Owner: -
--

CREATE FUNCTION "public"."myvet_ensure_digitalcare_visit"("requested_actor_user_id" "uuid", "requested_video_session_id" bigint) RETURNS bigint
    LANGUAGE "plpgsql" SECURITY DEFINER
    SET "search_path" TO ''
    AS $$
declare
  target record;
  target_visit_id bigint;
begin
  select session.*, coalesce(staff.full_name, staff.name, 'וטרינר') as staff_name,
    conversation.subject
  into target
  from public.video_sessions as session
  join public.staff as staff on staff.clinic_id = session.clinic_id
    and staff.auth_user_id = requested_actor_user_id and staff.is_active and staff.role = 'vet'
  left join public.conversations as conversation on conversation.clinic_id = session.clinic_id
    and conversation.conversation_id = session.conversation_id
  where session.session_id = requested_video_session_id and session.appointment_id is not null
    and session.transcription_status = 'ready';
  if target.clinic_id is null then raise exception 'DIGITALCARE_ACCESS_DENIED'; end if;
  if not exists (select 1 from public.ai_feature_flags where ai_feature_flags.clinic_id = target.clinic_id
    and ai_feature_flags.capability = 'digitalcare_summary' and ai_feature_flags.enabled and not ai_feature_flags.kill_switch) then
    raise exception 'AI_FEATURE_DISABLED';
  end if;
  perform pg_advisory_xact_lock(hashtextextended('digitalcare-visit:' || requested_video_session_id::text, 0));
  select medical_visits.visit_id into target_visit_id from public.medical_visits
    where medical_visits.clinic_id = target.clinic_id and medical_visits.appointment_id = target.appointment_id
    order by medical_visits.visit_id limit 1;
  if target_visit_id is null then
    insert into public.medical_visits(
      clinic_id, appointment_id, pet_id, visit_date, vet_name, reason,
      treatment, notes, attachments, visit_type, urgency_level,
      chief_complaint, follow_up_required, entry_data
    ) values (
      target.clinic_id, target.appointment_id, target.pet_id, coalesce(target.ended_at, now()),
      target.staff_name, coalesce(nullif(target.subject, ''), 'שיחת DigitalCare'),
      null, 'נוצרה רשומת ביקור ללא תוכן AI; טיוטת הסיכום ממתינה לאישור וטרינר.',
      '0', 'video_consultation', 'normal', coalesce(nullif(target.subject, ''), 'שיחת DigitalCare'),
      false, jsonb_build_object('entryType','video_consultation','source','digital-care',
        'videoSessionId',requested_video_session_id,'aiContentApproved',false)
    ) returning visit_id into target_visit_id;
  end if;
  update public.video_sessions set visit_id = target_visit_id, ai_updated_at = now()
    where session_id = requested_video_session_id;
  return target_visit_id;
end;
$$;


--
-- Name: FUNCTION "myvet_ensure_digitalcare_visit"("requested_actor_user_id" "uuid", "requested_video_session_id" bigint); Type: COMMENT; Schema: public; Owner: -
--

COMMENT ON FUNCTION "public"."myvet_ensure_digitalcare_visit"("requested_actor_user_id" "uuid", "requested_video_session_id" bigint) IS 'Creates only an empty DigitalCare visit shell. Generated clinical content remains in an AI draft until veterinarian approval.';


--
-- Name: myvet_execute_vetbot_action("uuid"); Type: FUNCTION; Schema: public; Owner: -
--

CREATE FUNCTION "public"."myvet_execute_vetbot_action"("requested_action_id" "uuid") RETURNS "jsonb"
    LANGUAGE "plpgsql" SECURITY DEFINER
    SET "search_path" TO ''
    AS $$
declare
  request_row public.vetbot_action_requests%rowtype;
  actor_current_role text;
  affected_count integer := 0;
  created_id bigint;
  action_result jsonb := '{}'::jsonb;
  pet_id_value bigint;
  appointment_id_value bigint;
  start_value timestamptz;
  end_value timestamptz;
begin
  if auth.uid() is null then
    raise exception 'AUTH_REQUIRED';
  end if;

  update public.vetbot_action_requests
  set status = 'expired'
  where action_request_id = requested_action_id
    and actor_id = auth.uid()
    and status = 'pending'
    and expires_at <= now();

  select * into request_row
  from public.vetbot_action_requests
  where action_request_id = requested_action_id
    and actor_id = auth.uid()
  for update;

  if not found then
    raise exception 'ACTION_NOT_FOUND';
  end if;
  if request_row.status <> 'pending' then
    raise exception 'ACTION_NOT_PENDING';
  end if;
  if request_row.expires_at <= now() then
    raise exception 'ACTION_EXPIRED';
  end if;

  select staff.role into actor_current_role
  from public.staff as staff
  where staff.auth_user_id = auth.uid()
    and staff.is_active = true
  limit 1;

  if actor_current_role is null and exists (
    select 1 from public.owners as owner_profile where owner_profile.auth_user_id = auth.uid()
  ) then
    actor_current_role := 'owner';
  end if;

  if actor_current_role is null or actor_current_role <> request_row.actor_role then
    raise exception 'ROLE_CHANGED_OR_NOT_ALLOWED';
  end if;

  begin
    case request_row.action_type
      when 'book_appointment' then
        pet_id_value := (request_row.payload ->> 'pet_id')::bigint;
        start_value := (request_row.payload ->> 'start_time')::timestamptz;
        end_value := (request_row.payload ->> 'end_time')::timestamptz;

        if actor_current_role = 'owner' and not public.myvet_pet_owned(pet_id_value::text) then
          raise exception 'PET_NOT_OWNED';
        elsif actor_current_role <> 'owner' and not public.myvet_is_active_staff() then
          raise exception 'STAFF_REQUIRED';
        end if;
        if not public.myvet_slot_is_bookable(start_value, end_value, null) then
          raise exception 'SLOT_NOT_AVAILABLE';
        end if;

        insert into public.appointments (
          pet_id, start_time, end_time, department, vet_name, room,
          appointment_type, appointment_mode, color, notes
        ) values (
          pet_id_value,
          start_value,
          end_value,
          left(coalesce(nullif(request_row.payload ->> 'department', ''), '׳›׳׳׳™'), 80),
          left(coalesce(nullif(request_row.payload ->> 'vet_name', ''), '׳˜׳¨׳ ׳©׳•׳‘׳¥'), 120),
          left(coalesce(nullif(request_row.payload ->> 'room', ''), case when request_row.payload ->> 'appointment_mode' = 'video' then '׳“׳™׳’׳™׳˜׳' else '׳˜׳¨׳ ׳©׳•׳‘׳¥' end), 80),
          left(request_row.payload ->> 'appointment_type', 120),
          case when request_row.payload ->> 'appointment_mode' = 'video' then 'video' else 'physical' end,
          case when request_row.payload ->> 'urgency' = 'urgent' then 'red' else 'blue' end,
          nullif(left(coalesce(request_row.payload ->> 'notes', ''), 1000), '')
        ) returning appointment_id into created_id;
        action_result := jsonb_build_object('appointment_id', created_id);

      when 'reschedule_appointment' then
        appointment_id_value := (request_row.payload ->> 'appointment_id')::bigint;
        start_value := (request_row.payload ->> 'start_time')::timestamptz;
        end_value := (request_row.payload ->> 'end_time')::timestamptz;

        select appointment.pet_id into pet_id_value
        from public.appointments as appointment
        where appointment.appointment_id = appointment_id_value;
        if pet_id_value is null then raise exception 'APPOINTMENT_NOT_FOUND'; end if;
        if actor_current_role = 'owner' and not public.myvet_pet_owned(pet_id_value::text) then
          raise exception 'APPOINTMENT_NOT_ALLOWED';
        elsif actor_current_role <> 'owner' and not public.myvet_is_active_staff() then
          raise exception 'STAFF_REQUIRED';
        end if;
        if not public.myvet_slot_is_bookable(start_value, end_value, appointment_id_value) then
          raise exception 'SLOT_NOT_AVAILABLE';
        end if;
        update public.appointments
        set start_time = start_value, end_time = end_value
        where appointment_id = appointment_id_value;
        get diagnostics affected_count = row_count;
        if affected_count <> 1 then raise exception 'APPOINTMENT_UPDATE_FAILED'; end if;
        action_result := jsonb_build_object('appointment_id', appointment_id_value);

      when 'cancel_appointment' then
        appointment_id_value := (request_row.payload ->> 'appointment_id')::bigint;
        select appointment.pet_id into pet_id_value
        from public.appointments as appointment
        where appointment.appointment_id = appointment_id_value;
        if pet_id_value is null then raise exception 'APPOINTMENT_NOT_FOUND'; end if;
        if actor_current_role = 'owner' and not public.myvet_pet_owned(pet_id_value::text) then
          raise exception 'APPOINTMENT_NOT_ALLOWED';
        elsif actor_current_role <> 'owner' and not public.myvet_is_active_staff() then
          raise exception 'STAFF_REQUIRED';
        end if;
        delete from public.appointments where appointment_id = appointment_id_value;
        get diagnostics affected_count = row_count;
        if affected_count <> 1 then raise exception 'APPOINTMENT_DELETE_FAILED'; end if;
        action_result := jsonb_build_object('appointment_id', appointment_id_value);

      when 'adjust_inventory' then
        if actor_current_role not in ('clinic_admin', 'vet', 'nurse', 'secretary') then
          raise exception 'STAFF_REQUIRED';
        end if;
        if (request_row.payload ->> 'new_quantity')::bigint < 0
          or (request_row.payload ->> 'new_quantity')::bigint > 1000000 then
          raise exception 'INVALID_QUANTITY';
        end if;
        update public.inventory
        set stock_quantity = (request_row.payload ->> 'new_quantity')::bigint
        where item_id = (request_row.payload ->> 'item_id')::bigint;
        get diagnostics affected_count = row_count;
        if affected_count <> 1 then raise exception 'INVENTORY_ITEM_NOT_FOUND'; end if;
        action_result := jsonb_build_object('item_id', (request_row.payload ->> 'item_id')::bigint, 'new_quantity', (request_row.payload ->> 'new_quantity')::bigint);

      when 'archive_conversation' then
        if actor_current_role = 'owner' then raise exception 'STAFF_REQUIRED'; end if;
        update public.conversations
        set status = 'closed', closed_at = now(), updated_at = now()
        where conversation_id = (request_row.payload ->> 'conversation_id')::bigint;
        get diagnostics affected_count = row_count;
        if affected_count <> 1 then raise exception 'CONVERSATION_NOT_FOUND'; end if;
        action_result := jsonb_build_object('conversation_id', (request_row.payload ->> 'conversation_id')::bigint);

      when 'restore_conversation' then
        if actor_current_role = 'owner' then raise exception 'STAFF_REQUIRED'; end if;
        update public.conversations
        set status = 'waiting_staff', closed_at = null, updated_at = now()
        where conversation_id = (request_row.payload ->> 'conversation_id')::bigint;
        get diagnostics affected_count = row_count;
        if affected_count <> 1 then raise exception 'CONVERSATION_NOT_FOUND'; end if;
        action_result := jsonb_build_object('conversation_id', (request_row.payload ->> 'conversation_id')::bigint);

      when 'set_conversation_priority' then
        if actor_current_role = 'owner' then raise exception 'STAFF_REQUIRED'; end if;
        if request_row.payload ->> 'priority' not in ('normal', 'urgent') then
          raise exception 'INVALID_PRIORITY';
        end if;
        update public.conversations
        set priority = request_row.payload ->> 'priority', updated_at = now()
        where conversation_id = (request_row.payload ->> 'conversation_id')::bigint;
        get diagnostics affected_count = row_count;
        if affected_count <> 1 then raise exception 'CONVERSATION_NOT_FOUND'; end if;
        action_result := jsonb_build_object('conversation_id', (request_row.payload ->> 'conversation_id')::bigint, 'priority', request_row.payload ->> 'priority');

      when 'set_lab_urgency' then
        if actor_current_role not in ('clinic_admin', 'vet', 'nurse') then
          raise exception 'MEDICAL_ROLE_REQUIRED';
        end if;
        update public.lab_orders
        set is_urgent = coalesce((request_row.payload ->> 'is_urgent')::boolean, false)
        where lab_order_id = (request_row.payload ->> 'lab_order_id')::bigint
          and coalesce(status, '') <> 'completed';
        get diagnostics affected_count = row_count;
        if affected_count <> 1 then raise exception 'OPEN_LAB_ORDER_NOT_FOUND'; end if;
        action_result := jsonb_build_object('lab_order_id', (request_row.payload ->> 'lab_order_id')::bigint);

      when 'block_booking_time' then
        if actor_current_role not in ('clinic_admin', 'secretary') then
          raise exception 'SCHEDULING_ROLE_REQUIRED';
        end if;
        insert into public.clinic_booking_blocks (
          block_date, is_all_day, starts_at, ends_at, reason, created_by
        ) values (
          (request_row.payload ->> 'block_date')::date,
          coalesce((request_row.payload ->> 'is_all_day')::boolean, false),
          case when coalesce((request_row.payload ->> 'is_all_day')::boolean, false) then null else (request_row.payload ->> 'starts_at')::time end,
          case when coalesce((request_row.payload ->> 'is_all_day')::boolean, false) then null else (request_row.payload ->> 'ends_at')::time end,
          nullif(left(coalesce(request_row.payload ->> 'reason', ''), 200), ''),
          auth.uid()
        ) returning block_id into created_id;
        action_result := jsonb_build_object('block_id', created_id);
      else
        raise exception 'ACTION_TYPE_NOT_ALLOWED';
    end case;

    update public.vetbot_action_requests
    set status = 'executed', result = action_result, confirmed_at = now(), executed_at = now(), error_code = null
    where action_request_id = requested_action_id;

    return jsonb_build_object('ok', true, 'action_type', request_row.action_type, 'result', action_result);
  exception when others then
    update public.vetbot_action_requests
    set status = 'failed', error_code = left(sqlerrm, 120), confirmed_at = now()
    where action_request_id = requested_action_id;
    return jsonb_build_object('ok', false, 'action_type', request_row.action_type, 'error_code', left(sqlerrm, 120));
  end;
end;
$$;


--
-- Name: FUNCTION "myvet_execute_vetbot_action"("requested_action_id" "uuid"); Type: COMMENT; Schema: public; Owner: -
--

COMMENT ON FUNCTION "public"."myvet_execute_vetbot_action"("requested_action_id" "uuid") IS 'Executes only a fixed allowlist of human-approved VetBot actions after authorization, expiry and current-state validation.';


--
-- Name: myvet_execute_vetbot_inventory_create("uuid"); Type: FUNCTION; Schema: public; Owner: -
--

CREATE FUNCTION "public"."myvet_execute_vetbot_inventory_create"("requested_action_id" "uuid") RETURNS "jsonb"
    LANGUAGE "plpgsql" SECURITY DEFINER
    SET "search_path" TO ''
    AS $$
declare
  request_row public.vetbot_action_requests%rowtype;
  actor_current_role text;
  created_id bigint;
  item_name_value text;
  category_value text;
  quantity_value bigint;
  threshold_value integer;
  price_value numeric;
begin
  if auth.uid() is null then
    raise exception 'AUTH_REQUIRED';
  end if;

  update public.vetbot_action_requests
  set status = 'expired'
  where action_request_id = requested_action_id
    and actor_id = auth.uid()
    and status = 'pending'
    and expires_at <= now();

  select * into request_row
  from public.vetbot_action_requests
  where action_request_id = requested_action_id
    and actor_id = auth.uid()
  for update;

  if not found then raise exception 'ACTION_NOT_FOUND'; end if;
  if request_row.status <> 'pending' then raise exception 'ACTION_NOT_PENDING'; end if;
  if request_row.expires_at <= now() then raise exception 'ACTION_EXPIRED'; end if;
  if request_row.action_type <> 'create_inventory_item' then raise exception 'ACTION_TYPE_NOT_ALLOWED'; end if;

  select staff.role into actor_current_role
  from public.staff as staff
  where staff.auth_user_id = auth.uid()
    and staff.is_active = true
  limit 1;

  if actor_current_role not in ('clinic_admin', 'vet', 'nurse', 'secretary') then
    raise exception 'STAFF_REQUIRED';
  end if;
  if actor_current_role <> request_row.actor_role then
    raise exception 'ROLE_CHANGED_OR_NOT_ALLOWED';
  end if;

  begin
    item_name_value := btrim(request_row.payload ->> 'item_name');
    category_value := request_row.payload ->> 'category';
    quantity_value := (request_row.payload ->> 'stock_quantity')::bigint;
    threshold_value := (request_row.payload ->> 'low_stock_threshold')::integer;
    price_value := round((request_row.payload ->> 'price')::numeric, 2);

    if item_name_value is null or length(item_name_value) < 2 or length(item_name_value) > 160 then
      raise exception 'INVALID_ITEM_NAME';
    end if;
    if category_value not in ('medication', 'equipment', 'consumable', 'other') then
      raise exception 'INVALID_CATEGORY';
    end if;
    if quantity_value < 0 or quantity_value > 1000000
      or threshold_value < 0 or threshold_value > 1000000
      or price_value < 0 or price_value > 1000000 then
      raise exception 'INVALID_INVENTORY_VALUES';
    end if;
    if exists (
      select 1
      from public.inventory as existing_item
      where lower(regexp_replace(btrim(existing_item.item_name), '\s+', ' ', 'g'))
        = lower(regexp_replace(item_name_value, '\s+', ' ', 'g'))
    ) then
      raise exception 'INVENTORY_ITEM_ALREADY_EXISTS';
    end if;

    insert into public.inventory (
      item_name, category, stock_quantity, low_stock_threshold, price
    ) values (
      item_name_value, category_value, quantity_value, threshold_value, price_value
    ) returning item_id into created_id;

    update public.vetbot_action_requests
    set status = 'executed',
        result = jsonb_build_object('item_id', created_id),
        confirmed_at = now(),
        executed_at = now(),
        error_code = null
    where action_request_id = requested_action_id;

    return jsonb_build_object(
      'ok', true,
      'action_type', request_row.action_type,
      'result', jsonb_build_object('item_id', created_id)
    );
  exception when others then
    update public.vetbot_action_requests
    set status = 'failed', error_code = left(sqlerrm, 120), confirmed_at = now()
    where action_request_id = requested_action_id;
    return jsonb_build_object(
      'ok', false,
      'action_type', request_row.action_type,
      'error_code', left(sqlerrm, 120)
    );
  end;
end;
$$;


--
-- Name: FUNCTION "myvet_execute_vetbot_inventory_create"("requested_action_id" "uuid"); Type: COMMENT; Schema: public; Owner: -
--

COMMENT ON FUNCTION "public"."myvet_execute_vetbot_inventory_create"("requested_action_id" "uuid") IS 'Creates one inventory item only after VetBot preview approval and a fresh staff-role check.';


--
-- Name: myvet_is_active_staff(); Type: FUNCTION; Schema: public; Owner: -
--

CREATE FUNCTION "public"."myvet_is_active_staff"() RETURNS boolean
    LANGUAGE "sql" STABLE SECURITY DEFINER
    SET "search_path" TO ''
    AS $$
  select (select auth.uid()) is not null
    and exists (
      select 1 from public.staff
      where auth_user_id = (select auth.uid())
        and is_active = true
    );
$$;


--
-- Name: myvet_link_digitalcare_summary_source("uuid", bigint, "uuid"); Type: FUNCTION; Schema: public; Owner: -
--

CREATE FUNCTION "public"."myvet_link_digitalcare_summary_source"("requested_actor_user_id" "uuid", "requested_video_session_id" bigint, "requested_summary_artifact_id" "uuid") RETURNS "void"
    LANGUAGE "plpgsql" SECURITY DEFINER
    SET "search_path" TO ''
    AS $$
declare target record;
begin
  select session.* into target
  from public.video_sessions as session
  join public.staff as staff on staff.clinic_id = session.clinic_id
    and staff.auth_user_id = requested_actor_user_id and staff.is_active and staff.role = 'vet'
  where session.session_id = requested_video_session_id;
  if target.clinic_id is null or target.transcript_artifact_id is null or target.visit_id is null
    or not exists (select 1 from public.ai_artifacts where ai_artifacts.artifact_id = requested_summary_artifact_id
      and ai_artifacts.clinic_id = target.clinic_id and ai_artifacts.visit_id = target.visit_id and ai_artifacts.artifact_type = 'visit_summary') then
    raise exception 'DIGITALCARE_ACCESS_DENIED';
  end if;
  insert into public.ai_sources(clinic_id, artifact_id, source_type, source_record_id)
  values (target.clinic_id, requested_summary_artifact_id, 'digitalcare',
    target.conversation_id::text)
  on conflict do nothing;
end;
$$;


--
-- Name: myvet_mark_digitalcare_failure("uuid", bigint, "text", "text"); Type: FUNCTION; Schema: public; Owner: -
--

CREATE FUNCTION "public"."myvet_mark_digitalcare_failure"("requested_actor_user_id" "uuid", "requested_video_session_id" bigint, "requested_stage" "text", "requested_error_code" "text") RETURNS "void"
    LANGUAGE "plpgsql" SECURITY DEFINER
    SET "search_path" TO ''
    AS $_$
declare target record;
begin
  if requested_stage not in ('recording','upload','transcription','summary') then return; end if;
  select session.* into target from public.video_sessions as session
  join public.staff as staff on staff.clinic_id = session.clinic_id
    and staff.auth_user_id = requested_actor_user_id and staff.is_active and staff.role = 'vet'
  where session.session_id = requested_video_session_id;
  if target.clinic_id is null then return; end if;
  update public.video_sessions set
    recording_status = case when requested_stage in ('recording','upload') then 'failed' else recording_status end,
    transcription_status = case when requested_stage in ('transcription','summary') then 'failed' else transcription_status end,
    ai_updated_at = now() where session_id = requested_video_session_id;
  insert into public.ai_audit_events(clinic_id, actor_user_id, capability, event_type, outcome, error_code)
  values (target.clinic_id, requested_actor_user_id,
    case when requested_stage in ('recording','upload') then 'digitalcare_recording'
      when requested_stage = 'summary' then 'digitalcare_summary' else 'digitalcare_transcription' end,
    'provider_failed', 'failed',
    case when requested_error_code ~ '^[A-Z0-9_]{1,80}$' then requested_error_code else 'DIGITALCARE_OPERATION_FAILED' end);
end;
$_$;


--
-- Name: myvet_owner_book_appointment(bigint, timestamp with time zone, timestamp with time zone, "text", "text", "text"); Type: FUNCTION; Schema: public; Owner: -
--

CREATE FUNCTION "public"."myvet_owner_book_appointment"("requested_pet_id" bigint, "requested_start" timestamp with time zone, "requested_end" timestamp with time zone, "requested_type" "text", "requested_mode" "text", "requested_notes" "text" DEFAULT NULL::"text") RETURNS bigint
    LANGUAGE "plpgsql" SECURITY DEFINER
    SET "search_path" TO ''
    AS $$
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


--
-- Name: FUNCTION "myvet_owner_book_appointment"("requested_pet_id" bigint, "requested_start" timestamp with time zone, "requested_end" timestamp with time zone, "requested_type" "text", "requested_mode" "text", "requested_notes" "text"); Type: COMMENT; Schema: public; Owner: -
--

COMMENT ON FUNCTION "public"."myvet_owner_book_appointment"("requested_pet_id" bigint, "requested_start" timestamp with time zone, "requested_end" timestamp with time zone, "requested_type" "text", "requested_mode" "text", "requested_notes" "text") IS 'Atomically validates ownership and clinic availability before owner booking.';


--
-- Name: myvet_owner_matches("text"); Type: FUNCTION; Schema: public; Owner: -
--

CREATE FUNCTION "public"."myvet_owner_matches"("candidate_owner_id" "text") RETURNS boolean
    LANGUAGE "sql" STABLE SECURITY DEFINER
    SET "search_path" TO ''
    AS $$
  select candidate_owner_id is not null
    and exists (
      select 1 from public.owners
      where owner_id = candidate_owner_id
        and auth_user_id = (select auth.uid())
    );
$$;


--
-- Name: myvet_owner_settle_demo_payment(bigint); Type: FUNCTION; Schema: public; Owner: -
--

CREATE FUNCTION "public"."myvet_owner_settle_demo_payment"("requested_payment_id" bigint) RETURNS "jsonb"
    LANGUAGE "plpgsql" SECURITY DEFINER
    SET "search_path" TO ''
    AS $$
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


--
-- Name: FUNCTION "myvet_owner_settle_demo_payment"("requested_payment_id" bigint); Type: COMMENT; Schema: public; Owner: -
--

COMMENT ON FUNCTION "public"."myvet_owner_settle_demo_payment"("requested_payment_id" bigint) IS 'Graduation-project payment simulation. Replace with a verified payment-provider webhook before production use.';


--
-- Name: myvet_pet_owned("text"); Type: FUNCTION; Schema: public; Owner: -
--

CREATE FUNCTION "public"."myvet_pet_owned"("candidate_pet_id" "text") RETURNS boolean
    LANGUAGE "sql" STABLE SECURITY DEFINER
    SET "search_path" TO ''
    AS $$
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


--
-- Name: myvet_rag_collect_sources("uuid", bigint); Type: FUNCTION; Schema: public; Owner: -
--

CREATE FUNCTION "public"."myvet_rag_collect_sources"("requested_actor_user_id" "uuid", "requested_pet_id" bigint) RETURNS TABLE("clinic_id" "uuid", "owner_id" "text", "pet_id" bigint, "source_type" "text", "source_record_id" "text", "source_date" "date", "source_title" "text", "source_content" "text", "release_to_client" boolean)
    LANGUAGE "plpgsql" SECURITY DEFINER
    SET "search_path" TO ''
    AS $$
declare
  target_clinic_id uuid;
  target_owner_id text;
begin
  select staff.clinic_id, pet.owner_id
  into target_clinic_id, target_owner_id
  from public.staff as staff
  join public.patients as pet on pet.clinic_id = staff.clinic_id
  where staff.auth_user_id = requested_actor_user_id and staff.is_active = true
    and staff.role in ('clinic_admin', 'vet', 'nurse') and pet.pet_id = requested_pet_id
  limit 1;
  if target_clinic_id is null then raise exception 'RAG_INDEX_ACCESS_DENIED'; end if;
  if not exists (
    select 1 from public.ai_feature_flags
    where ai_feature_flags.clinic_id = target_clinic_id
      and ai_feature_flags.capability = 'rag_index'
      and ai_feature_flags.enabled and not ai_feature_flags.kill_switch
  ) then raise exception 'AI_FEATURE_DISABLED'; end if;

  return query
  select visit.clinic_id, target_owner_id, visit.pet_id,
    'medical_visit'::text, visit.visit_id::text, visit.visit_date::date,
    coalesce(nullif(visit.reason, ''), 'ביקור רפואי')::text,
    concat_ws(E'\n',
      nullif('סיבת הביקור: ' || coalesce(visit.reason, ''), 'סיבת הביקור: '),
      nullif('תלונה עיקרית: ' || coalesce(visit.chief_complaint, ''), 'תלונה עיקרית: '),
      nullif('אבחנה: ' || coalesce(visit.final_diagnosis, visit.diagnosis, ''), 'אבחנה: '),
      nullif('טיפול: ' || coalesce(visit.treatment, ''), 'טיפול: '),
      nullif('הערות: ' || coalesce(visit.notes, ''), 'הערות: '),
      nullif('מעקב: ' || coalesce(visit.follow_up_notes, ''), 'מעקב: ')
    )::text,
    false
  from public.medical_visits as visit
  where visit.clinic_id = target_clinic_id and visit.pet_id = requested_pet_id

  union all
  select vaccination.clinic_id, target_owner_id, vaccination.pet_id,
    'vaccination', vaccination.vaccination_id::text, vaccination.given_date,
    coalesce(nullif(vaccination.vaccine_name, ''), 'חיסון'),
    concat_ws(E'\n',
      nullif('חיסון: ' || coalesce(vaccination.vaccine_name, ''), 'חיסון: '),
      nullif('סוג: ' || coalesce(vaccination.vaccine_type, ''), 'סוג: '),
      nullif('יצרן: ' || coalesce(vaccination.manufacturer, ''), 'יצרן: '),
      nullif('מועד הבא: ' || coalesce(vaccination.next_due_date::text, ''), 'מועד הבא: '),
      nullif('הערות: ' || coalesce(vaccination.notes, ''), 'הערות: ')
    ), false
  from public.vaccinations as vaccination
  where vaccination.clinic_id = target_clinic_id and vaccination.pet_id = requested_pet_id

  union all
  select lab.clinic_id, target_owner_id, lab.pet_id,
    'lab_result', lab.lab_order_id::text, coalesce(lab.completed_date::date, lab.test_date, lab.ordered_date::date),
    coalesce(nullif(lab.test_name, ''), 'בדיקת מעבדה'),
    concat_ws(E'\n',
      nullif('בדיקה: ' || coalesce(lab.test_name, ''), 'בדיקה: '),
      nullif('תוצאה: ' || coalesce(lab.results, lab.result_value, ''), 'תוצאה: '),
      nullif('טווח תקין: ' || coalesce(lab.normal_range, ''), 'טווח תקין: '),
      nullif('סטטוס תוצאה: ' || coalesce(lab.result_status, ''), 'סטטוס תוצאה: '),
      nullif('הערות: ' || coalesce(lab.notes, ''), 'הערות: ')
    ), false
  from public.lab_orders as lab
  where lab.clinic_id = target_clinic_id and lab.pet_id = requested_pet_id
    and lower(coalesce(lab.status, '')) in ('completed', 'complete', 'ready', 'done', 'הושלם')

  union all
  select document.clinic_id, target_owner_id, document.pet_id,
    'medical_document', document.document_id::text, document.uploaded_at::date,
    coalesce(nullif(document.file_name, ''), 'מסמך רפואי'),
    concat_ws(E'\n',
      nullif('שם מסמך: ' || coalesce(document.file_name, ''), 'שם מסמך: '),
      nullif('קטגוריה: ' || coalesce(document.category, ''), 'קטגוריה: '),
      nullif('הערות מאושרות: ' || coalesce(document.notes, ''), 'הערות מאושרות: ')
    ), false
  from public.documents as document
  where document.clinic_id = target_clinic_id and document.pet_id = requested_pet_id
    and (nullif(document.notes, '') is not null or nullif(document.file_name, '') is not null)

  union all
  select artifact.clinic_id, target_owner_id, artifact.pet_id,
    case when exists (
      select 1 from public.ai_sources as source
      where source.clinic_id = artifact.clinic_id and source.artifact_id = artifact.artifact_id
        and source.source_type = 'digitalcare'
    ) then 'digitalcare_summary' else 'approved_visit_summary' end,
    artifact.artifact_id::text, artifact.approved_at::date,
    case when exists (
      select 1 from public.ai_sources as source
      where source.clinic_id = artifact.clinic_id and source.artifact_id = artifact.artifact_id
        and source.source_type = 'digitalcare'
    ) then 'סיכום DigitalCare מאושר' else 'סיכום ביקור מאושר' end,
    artifact.content::text,
    artifact.released_to_owner
  from public.ai_artifacts as artifact
  where artifact.clinic_id = target_clinic_id and artifact.pet_id = requested_pet_id
    and artifact.artifact_type = 'visit_summary' and artifact.status = 'approved'
    and artifact.deleted_at is null;
end;
$$;


--
-- Name: myvet_rag_search("uuid", bigint, "extensions"."vector", "text", "text", "text", real, integer); Type: FUNCTION; Schema: public; Owner: -
--

CREATE FUNCTION "public"."myvet_rag_search"("requested_actor_user_id" "uuid", "requested_pet_id" bigint, "requested_query_embedding" "extensions"."vector", "requested_provider" "text", "requested_model" "text", "requested_embedding_version" "text", "requested_match_threshold" real DEFAULT 0.62, "requested_match_count" integer DEFAULT 6) RETURNS TABLE("chunk_id" "uuid", "source_type" "text", "source_record_id" "text", "source_date" "date", "source_title" "text", "content" "text", "similarity" real)
    LANGUAGE "plpgsql" SECURITY DEFINER
    SET "search_path" TO ''
    AS $$
declare
  target_clinic_id uuid;
  target_owner_id text;
  target_role text;
begin
  if requested_query_embedding is null or requested_match_threshold not between 0 and 1
    or requested_match_count not between 1 and 12 then raise exception 'RAG_INPUT_INVALID'; end if;
  select staff.clinic_id, staff.role into target_clinic_id, target_role
  from public.staff as staff join public.patients as pet on pet.clinic_id = staff.clinic_id
  where staff.auth_user_id = requested_actor_user_id and staff.is_active = true
    and staff.role in ('clinic_admin', 'vet', 'nurse') and pet.pet_id = requested_pet_id limit 1;
  if target_clinic_id is null then
    select owner.clinic_id, owner.owner_id into target_clinic_id, target_owner_id
    from public.owners as owner join public.patients as pet
      on pet.clinic_id = owner.clinic_id and pet.owner_id = owner.owner_id
    where owner.auth_user_id = requested_actor_user_id and pet.pet_id = requested_pet_id limit 1;
    target_role := case when target_clinic_id is null then null else 'owner' end;
  end if;
  if target_clinic_id is null then raise exception 'RAG_ACCESS_DENIED'; end if;
  if not exists (select 1 from public.ai_feature_flags
    where clinic_id = target_clinic_id and capability = 'record_qa'
      and enabled and not kill_switch) then raise exception 'AI_FEATURE_DISABLED'; end if;

  -- Permission and tenant filters are part of this vector query. There is no
  -- global candidate set and no post-search tenant filtering.
  return query
  select chunk.chunk_id, chunk.source_type, chunk.source_record_id,
    chunk.source_date, chunk.source_title, chunk.content,
    (1 - (embedding_row.embedding <=> requested_query_embedding))::real as similarity
  from public.ai_document_embeddings as embedding_row
  join public.ai_document_chunks as chunk
    on chunk.clinic_id = embedding_row.clinic_id and chunk.chunk_id = embedding_row.chunk_id
  where embedding_row.clinic_id = target_clinic_id
    and chunk.clinic_id = target_clinic_id and chunk.pet_id = requested_pet_id
    and chunk.status = 'ready' and embedding_row.status = 'ready'
    and chunk.approval_status in ('approved', 'released')
    and chunk.source_type in (
      'medical_visit', 'vaccination', 'lab_result', 'medical_document',
      'approved_visit_summary', 'digitalcare_summary', 'document_extraction'
    )
    and embedding_row.provider = requested_provider
    and embedding_row.model_version = requested_model
    and embedding_row.embedding_version = requested_embedding_version
    and (target_role <> 'owner' or (
      chunk.owner_id = target_owner_id and chunk.approval_status = 'released'
      and chunk.release_to_client = true
    ))
    and 1 - (embedding_row.embedding <=> requested_query_embedding) >= requested_match_threshold
  order by embedding_row.embedding <=> requested_query_embedding
  limit least(requested_match_count, 12);
end;
$$;


--
-- Name: FUNCTION "myvet_rag_search"("requested_actor_user_id" "uuid", "requested_pet_id" bigint, "requested_query_embedding" "extensions"."vector", "requested_provider" "text", "requested_model" "text", "requested_embedding_version" "text", "requested_match_threshold" real, "requested_match_count" integer); Type: COMMENT; Schema: public; Owner: -
--

COMMENT ON FUNCTION "public"."myvet_rag_search"("requested_actor_user_id" "uuid", "requested_pet_id" bigint, "requested_query_embedding" "extensions"."vector", "requested_provider" "text", "requested_model" "text", "requested_embedding_version" "text", "requested_match_threshold" real, "requested_match_count" integer) IS 'Service-only vector search with clinic, pet, role, approval and client-release filters inside the query.';


--
-- Name: myvet_rag_status("uuid", bigint); Type: FUNCTION; Schema: public; Owner: -
--

CREATE FUNCTION "public"."myvet_rag_status"("requested_actor_user_id" "uuid", "requested_pet_id" bigint) RETURNS TABLE("clinic_id" "uuid", "actor_kind" "text", "actor_role" "text", "can_index" boolean, "can_query" boolean, "indexed_chunks" bigint)
    LANGUAGE "plpgsql" SECURITY DEFINER
    SET "search_path" TO ''
    AS $$
declare
  target_clinic_id uuid;
  target_role text;
  target_owner_id text;
  index_enabled boolean := false;
  query_enabled boolean := false;
begin
  if requested_actor_user_id is null or requested_pet_id is null then
    raise exception 'RAG_ACCESS_DENIED';
  end if;

  select staff.clinic_id, staff.role
  into target_clinic_id, target_role
  from public.staff as staff
  join public.patients as pet on pet.clinic_id = staff.clinic_id
  where staff.auth_user_id = requested_actor_user_id and staff.is_active = true
    and staff.role in ('clinic_admin', 'vet', 'nurse')
    and pet.pet_id = requested_pet_id
  limit 1;

  if target_clinic_id is null then
    select owner.clinic_id, owner.owner_id
    into target_clinic_id, target_owner_id
    from public.owners as owner
    join public.patients as pet
      on pet.clinic_id = owner.clinic_id and pet.owner_id = owner.owner_id
    where owner.auth_user_id = requested_actor_user_id and pet.pet_id = requested_pet_id
    limit 1;
    target_role := case when target_clinic_id is null then null else 'owner' end;
  end if;

  if target_clinic_id is null then raise exception 'RAG_ACCESS_DENIED'; end if;

  select coalesce(bool_or(flag.enabled and not flag.kill_switch) filter (where flag.capability = 'rag_index'), false),
         coalesce(bool_or(flag.enabled and not flag.kill_switch) filter (where flag.capability = 'record_qa'), false)
  into index_enabled, query_enabled
  from public.ai_feature_flags as flag
  where flag.clinic_id = target_clinic_id and flag.capability in ('rag_index', 'record_qa');

  return query
  select target_clinic_id,
    case when target_role = 'owner' then 'owner' else 'staff' end,
    target_role,
    target_role <> 'owner' and index_enabled,
    query_enabled,
    count(*)
  from public.ai_document_chunks as chunk
  where chunk.clinic_id = target_clinic_id and chunk.pet_id = requested_pet_id
    and chunk.status = 'ready' and chunk.source_type is not null
    and (target_role <> 'owner' or (
      chunk.approval_status = 'released' and chunk.release_to_client = true
      and chunk.owner_id = target_owner_id
    ));
end;
$$;


--
-- Name: myvet_record_rag_event("uuid", bigint, "uuid", "text", "text", "text", "text", "text", integer, integer, integer, "text"); Type: FUNCTION; Schema: public; Owner: -
--

CREATE FUNCTION "public"."myvet_record_rag_event"("requested_actor_user_id" "uuid", "requested_pet_id" bigint, "requested_request_id" "uuid", "requested_event_type" "text", "requested_outcome" "text", "requested_provider" "text" DEFAULT NULL::"text", "requested_model" "text" DEFAULT NULL::"text", "requested_prompt_version" "text" DEFAULT NULL::"text", "requested_latency_ms" integer DEFAULT NULL::integer, "requested_input_tokens" integer DEFAULT NULL::integer, "requested_output_tokens" integer DEFAULT NULL::integer, "requested_error_code" "text" DEFAULT NULL::"text") RETURNS "void"
    LANGUAGE "plpgsql" SECURITY DEFINER
    SET "search_path" TO ''
    AS $_$
declare
  target_clinic_id uuid;
  target_owner_id text;
  target_staff_id uuid;
  new_operation_id uuid;
begin
  if requested_event_type not in (
    'request_received', 'provider_completed', 'provider_failed', 'output_rejected',
    'access_denied', 'rate_limited', 'feature_disabled', 'index_started',
    'index_completed', 'index_failed', 'rag_query_completed', 'rag_no_results',
    'suspicious_request'
  ) or requested_outcome not in ('success', 'failed', 'blocked') then return; end if;
  select staff.clinic_id, staff.staff_id into target_clinic_id, target_staff_id
  from public.staff as staff join public.patients as pet on pet.clinic_id = staff.clinic_id
  where staff.auth_user_id = requested_actor_user_id and staff.is_active = true
    and staff.role in ('clinic_admin','vet','nurse') and pet.pet_id = requested_pet_id limit 1;
  if target_clinic_id is null then
    select owner.clinic_id, owner.owner_id into target_clinic_id, target_owner_id
    from public.owners as owner join public.patients as pet
      on pet.clinic_id = owner.clinic_id and pet.owner_id = owner.owner_id
    where owner.auth_user_id = requested_actor_user_id and pet.pet_id = requested_pet_id limit 1;
  end if;
  if target_clinic_id is null then return; end if;
  insert into public.ai_operations(
    clinic_id, capability, actor_user_id, actor_staff_id, owner_id, pet_id,
    status, idempotency_key, provider, model_version, prompt_version,
    latency_ms, input_tokens, output_tokens, error_code, started_at, completed_at
  ) values (
    target_clinic_id, case when requested_event_type like 'index_%' then 'rag_index' else 'record_qa' end,
    requested_actor_user_id, target_staff_id, target_owner_id, requested_pet_id,
    case when requested_outcome = 'success' then 'succeeded' else 'failed' end,
    'rag:' || requested_request_id::text || ':' || requested_event_type,
    left(requested_provider,80), left(requested_model,120), left(requested_prompt_version,120),
    greatest(requested_latency_ms,0), greatest(requested_input_tokens,0), greatest(requested_output_tokens,0),
    case when requested_error_code ~ '^[A-Z0-9_]{1,80}$' then requested_error_code else null end,
    now(), now()
  ) on conflict (clinic_id, capability, idempotency_key) where idempotency_key is not null
  do update set updated_at = public.ai_operations.updated_at
  returning operation_id into new_operation_id;
  insert into public.ai_audit_events(
    clinic_id, actor_user_id, operation_id, capability, event_type, outcome,
    provider, model_version, prompt_version, latency_ms, input_tokens,
    output_tokens, error_code
  ) values (
    target_clinic_id, requested_actor_user_id, new_operation_id,
    case when requested_event_type like 'index_%' then 'rag_index' else 'record_qa' end,
    requested_event_type, requested_outcome, left(requested_provider,80),
    left(requested_model,120), left(requested_prompt_version,120),
    greatest(requested_latency_ms,0), greatest(requested_input_tokens,0),
    greatest(requested_output_tokens,0),
    case when requested_error_code ~ '^[A-Z0-9_]{1,80}$' then requested_error_code else null end
  );
end;
$_$;


--
-- Name: myvet_record_visit_summary_failure("uuid", bigint, "uuid", "text", "text", "text", "text", integer); Type: FUNCTION; Schema: public; Owner: -
--

CREATE FUNCTION "public"."myvet_record_visit_summary_failure"("requested_actor_user_id" "uuid", "requested_visit_id" bigint, "requested_request_id" "uuid", "requested_provider" "text", "requested_model_version" "text", "requested_prompt_version" "text", "requested_error_code" "text", "requested_latency_ms" integer) RETURNS "void"
    LANGUAGE "plpgsql" SECURITY DEFINER
    SET "search_path" TO ''
    AS $_$
declare
  target_clinic_id uuid;
  target_pet_id bigint;
  target_owner_id text;
  actor_staff_id uuid;
  failed_operation_id uuid;
begin
  select visit.clinic_id, visit.pet_id, pet.owner_id, staff.staff_id
  into target_clinic_id, target_pet_id, target_owner_id, actor_staff_id
  from public.medical_visits as visit
  join public.patients as pet on pet.clinic_id = visit.clinic_id and pet.pet_id = visit.pet_id
  join public.staff as staff on staff.clinic_id = visit.clinic_id
    and staff.auth_user_id = requested_actor_user_id and staff.is_active and staff.role = 'vet'
  where visit.visit_id = requested_visit_id;
  if target_clinic_id is null then return; end if;

  insert into public.ai_operations(
    clinic_id, capability, actor_user_id, actor_staff_id, owner_id, pet_id, visit_id,
    status, idempotency_key, provider, model_version, prompt_version, schema_version,
    latency_ms, error_code, started_at, completed_at
  ) values (
    target_clinic_id, 'visit_summary', requested_actor_user_id, actor_staff_id,
    target_owner_id, target_pet_id, requested_visit_id, 'failed',
    'visit-summary:' || requested_request_id::text, left(requested_provider, 80),
    left(requested_model_version, 120), left(requested_prompt_version, 120),
    '2026-07-17.1', greatest(requested_latency_ms, 0),
    case when requested_error_code ~ '^[A-Z0-9_]{1,80}$' then requested_error_code else 'AI_PROVIDER_UNAVAILABLE' end,
    now(), now()
  )
  on conflict (clinic_id, capability, idempotency_key) where idempotency_key is not null
  do nothing returning operation_id into failed_operation_id;

  if failed_operation_id is not null then
    insert into public.ai_audit_events(
      clinic_id, actor_user_id, operation_id, capability, event_type, outcome,
      provider, model_version, prompt_version, schema_version, latency_ms, error_code
    ) values (
      target_clinic_id, requested_actor_user_id, failed_operation_id, 'visit_summary',
      'provider_failed', 'failed', left(requested_provider, 80),
      left(requested_model_version, 120), left(requested_prompt_version, 120),
      '2026-07-17.1', greatest(requested_latency_ms, 0),
      case when requested_error_code ~ '^[A-Z0-9_]{1,80}$' then requested_error_code else 'AI_PROVIDER_UNAVAILABLE' end
    );
  end if;
end;
$_$;


--
-- Name: myvet_replace_rag_source("uuid", bigint, "text", "text", "text", "text", "text", "text", "jsonb"); Type: FUNCTION; Schema: public; Owner: -
--

CREATE FUNCTION "public"."myvet_replace_rag_source"("requested_actor_user_id" "uuid", "requested_pet_id" bigint, "requested_source_type" "text", "requested_source_record_id" "text", "requested_source_fingerprint" "text", "requested_provider" "text", "requested_model" "text", "requested_embedding_version" "text", "requested_chunks" "jsonb") RETURNS TABLE("changed" boolean, "stored_chunks" integer)
    LANGUAGE "plpgsql" SECURITY DEFINER
    SET "search_path" TO ''
    AS $_$
declare
  source_row record;
  item jsonb;
  new_chunk_id uuid;
  item_count integer;
  matching_count integer;
begin
  select * into source_row
  from public.myvet_rag_collect_sources(requested_actor_user_id, requested_pet_id) as source
  where source.source_type = requested_source_type
    and source.source_record_id = requested_source_record_id
  limit 1;
  if source_row.clinic_id is null then raise exception 'RAG_SOURCE_ACCESS_DENIED'; end if;
  if requested_source_fingerprint !~ '^[a-f0-9]{64}$'
    or requested_source_fingerprint <> encode(sha256(convert_to(source_row.source_content, 'UTF8')), 'hex')
    or requested_provider !~ '^[a-z0-9._-]{1,80}$'
    or char_length(requested_model) not between 1 and 120
    or char_length(requested_embedding_version) not between 1 and 80
    or jsonb_typeof(requested_chunks) <> 'array' then
    raise exception 'RAG_INPUT_INVALID';
  end if;
  item_count := jsonb_array_length(requested_chunks);
  if item_count < 1 or item_count > 24 then raise exception 'RAG_INPUT_INVALID'; end if;
  if exists (
    select 1 from jsonb_array_elements(requested_chunks) as chunk(value)
    where jsonb_typeof(chunk.value) <> 'object'
      or (chunk.value ->> 'chunk_index') !~ '^[0-9]{1,2}$'
      or (chunk.value ->> 'content_hash') !~ '^[a-f0-9]{64}$'
      or chunk.value ->> 'content_hash' <>
        encode(sha256(convert_to(chunk.value ->> 'content', 'UTF8')), 'hex')
      or (chunk.value ->> 'embedding_hash') !~ '^[a-f0-9]{64}$'
      or char_length(chunk.value ->> 'content') not between 1 and 12000
      or jsonb_typeof(chunk.value -> 'embedding') <> 'array'
      or jsonb_array_length(chunk.value -> 'embedding') <> 768
  ) then raise exception 'RAG_INPUT_INVALID'; end if;
  if exists (
    select 1
    from jsonb_array_elements(requested_chunks) as chunk(value)
    group by (chunk.value ->> 'chunk_index')
    having count(*) > 1
  ) then raise exception 'RAG_INPUT_INVALID'; end if;

  perform pg_advisory_xact_lock(hashtextextended(
    'rag:' || source_row.clinic_id::text || ':' || requested_pet_id::text || ':'
    || requested_source_type || ':' || requested_source_record_id, 0
  ));

  select count(*) into matching_count
  from public.ai_document_chunks as chunk
  join public.ai_document_embeddings as embedding_row
    on embedding_row.clinic_id = chunk.clinic_id and embedding_row.chunk_id = chunk.chunk_id
  join jsonb_array_elements(requested_chunks) as requested(value)
    on (requested.value ->> 'chunk_index')::integer = chunk.chunk_index
   and requested.value ->> 'content_hash' = chunk.content_hash
   and requested.value ->> 'embedding_hash' = embedding_row.embedding_hash
  where chunk.clinic_id = source_row.clinic_id and chunk.pet_id = requested_pet_id
    and chunk.source_type = requested_source_type
    and chunk.source_record_id = requested_source_record_id
    and chunk.status = 'ready' and embedding_row.status = 'ready'
    and embedding_row.provider = requested_provider
    and embedding_row.model_version = requested_model
    and embedding_row.embedding_version = requested_embedding_version;
  if matching_count = item_count and not exists (
    select 1 from public.ai_document_chunks as chunk
    where chunk.clinic_id = source_row.clinic_id and chunk.pet_id = requested_pet_id
      and chunk.source_type = requested_source_type
      and chunk.source_record_id = requested_source_record_id and chunk.status = 'ready'
      and not exists (
        select 1 from jsonb_array_elements(requested_chunks) as requested(value)
        where (requested.value ->> 'chunk_index')::integer = chunk.chunk_index
          and requested.value ->> 'content_hash' = chunk.content_hash
      )
  ) then return query select false, item_count; return; end if;

  update public.ai_document_embeddings as embedding_row
  set status = 'superseded', updated_at = now()
  from public.ai_document_chunks as chunk
  where chunk.clinic_id = source_row.clinic_id and chunk.pet_id = requested_pet_id
    and chunk.source_type = requested_source_type
    and chunk.source_record_id = requested_source_record_id
    and embedding_row.clinic_id = chunk.clinic_id and embedding_row.chunk_id = chunk.chunk_id
    and embedding_row.status in ('pending', 'ready');
  update public.ai_document_chunks set status = 'superseded', updated_at = now(), release_to_client = false
  where clinic_id = source_row.clinic_id and pet_id = requested_pet_id
    and source_type = requested_source_type and source_record_id = requested_source_record_id
    and status in ('pending', 'ready');

  for item in select value from jsonb_array_elements(requested_chunks) loop
    insert into public.ai_document_chunks(
      clinic_id, owner_id, pet_id, source_type, source_record_id, source_date,
      source_title, chunk_index, content, content_hash, token_count, status,
      approval_status, release_to_client, indexed_at
    ) values (
      source_row.clinic_id, source_row.owner_id, requested_pet_id,
      requested_source_type, requested_source_record_id, source_row.source_date,
      left(source_row.source_title, 240), (item ->> 'chunk_index')::integer,
      item ->> 'content', item ->> 'content_hash',
      greatest(1, ceil(char_length(item ->> 'content') / 4.0)::integer), 'ready',
      case when source_row.release_to_client then 'released' else 'approved' end,
      source_row.release_to_client, now()
    ) returning chunk_id into new_chunk_id;
    insert into public.ai_document_embeddings(
      clinic_id, chunk_id, provider, model_version, embedding_version,
      dimensions, embedding_hash, embedding, status
    ) values (
      source_row.clinic_id, new_chunk_id, requested_provider, requested_model,
      requested_embedding_version, 768, item ->> 'embedding_hash',
      ((item -> 'embedding')::text)::extensions.vector, 'ready'
    );
  end loop;
  return query select true, item_count;
end;
$_$;


--
-- Name: myvet_slot_is_bookable(timestamp with time zone, timestamp with time zone, bigint); Type: FUNCTION; Schema: public; Owner: -
--

CREATE FUNCTION "public"."myvet_slot_is_bookable"("candidate_start" timestamp with time zone, "candidate_end" timestamp with time zone, "excluded_appointment_id" bigint DEFAULT NULL::bigint) RETURNS boolean
    LANGUAGE "sql" STABLE SECURITY DEFINER
    SET "search_path" TO ''
    AS $$
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


--
-- Name: myvet_staff_settle_payment(bigint, "text", numeric); Type: FUNCTION; Schema: public; Owner: -
--

CREATE FUNCTION "public"."myvet_staff_settle_payment"("requested_payment_id" bigint, "requested_method" "text", "tendered_amount" numeric DEFAULT NULL::numeric) RETURNS "jsonb"
    LANGUAGE "plpgsql" SECURITY DEFINER
    SET "search_path" TO ''
    AS $$
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


--
-- Name: myvet_transition_client_summary("uuid", "text", "jsonb", "text"); Type: FUNCTION; Schema: public; Owner: -
--

CREATE FUNCTION "public"."myvet_transition_client_summary"("requested_artifact_id" "uuid", "requested_action" "text", "requested_content" "jsonb" DEFAULT NULL::"jsonb", "requested_rejection_reason" "text" DEFAULT NULL::"text") RETURNS TABLE("artifact_id" "uuid", "status" "text", "content" "jsonb", "version_number" integer, "released_to_owner" boolean)
    LANGUAGE "plpgsql" SECURITY DEFINER
    SET "search_path" TO ''
    AS $_$
declare
  current_record record; source_content jsonb; actor_staff_id uuid; next_status text; next_id uuid; next_version integer; next_content jsonb;
begin
  if (select auth.uid()) is null or requested_action not in ('save','approve','reject','release','revoke_release') then
    raise exception 'CLIENT_SUMMARY_ACTION_INVALID'; end if;
  select artifact.*,staff.staff_id into current_record from public.ai_artifacts artifact
  join public.staff staff on staff.clinic_id=artifact.clinic_id and staff.auth_user_id=(select auth.uid())
    and staff.is_active and staff.role='vet'
  where artifact.artifact_id=requested_artifact_id and artifact.artifact_type='client_explanation'
    and artifact.deleted_at is null for update of artifact;
  actor_staff_id := current_record.staff_id;
  if current_record.artifact_id is null then raise exception 'CLIENT_SUMMARY_ACCESS_DENIED'; end if;
  select source.content into source_content from public.ai_sources link
  join public.ai_artifacts source on source.clinic_id=link.clinic_id
    and source.artifact_id=case when link.source_record_id ~* '^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$'
      then link.source_record_id::uuid else null end
  where link.artifact_id=current_record.artifact_id and link.source_type='ai_artifact'
    and source.artifact_type='visit_summary' and source.status='approved' and source.deleted_at is null;
  if source_content is null then raise exception 'CLIENT_SUMMARY_APPROVED_SOURCE_REQUIRED'; end if;
  if exists (select 1 from public.ai_feature_flags where clinic_id=current_record.clinic_id
    and capability='client_explanation' and (not enabled or kill_switch)) then raise exception 'AI_FEATURE_DISABLED'; end if;

  if requested_action in ('release','revoke_release') then
    if current_record.status <> 'approved' then raise exception 'CLIENT_SUMMARY_NOT_APPROVED'; end if;
    if requested_action='release' and current_record.released_to_owner then raise exception 'CLIENT_SUMMARY_ALREADY_RELEASED'; end if;
    if requested_action='revoke_release' and not current_record.released_to_owner then raise exception 'CLIENT_SUMMARY_NOT_RELEASED'; end if;
    update public.ai_artifacts set released_to_owner=(requested_action='release'),
      released_at=case when requested_action='release' then now() else null end,updated_at=now()
    where public.ai_artifacts.artifact_id=current_record.artifact_id;
    insert into public.ai_approval_history(clinic_id,artifact_id,action,actor_user_id,actor_staff_id,previous_status,new_status,change_summary)
      values(current_record.clinic_id,current_record.artifact_id,case when requested_action='release' then 'released' else 'release_revoked' end,
        (select auth.uid()),actor_staff_id,'approved','approved',jsonb_build_object('owner_visibility',requested_action='release'));
    insert into public.ai_audit_events(clinic_id,actor_user_id,operation_id,capability,event_type,outcome,model_version,prompt_version,schema_version)
      values(current_record.clinic_id,(select auth.uid()),current_record.operation_id,'client_explanation','release_recorded','success',
        current_record.model_version,current_record.prompt_version,'2026-07-17.1');
    return query select current_record.artifact_id,'approved'::text,current_record.content,current_record.version_number,(requested_action='release');
    return;
  end if;

  if current_record.status not in ('draft','edited') then raise exception 'CLIENT_SUMMARY_NOT_EDITABLE'; end if;
  next_content := coalesce(requested_content,current_record.content);
  if requested_action in ('save','approve') and not private.myvet_is_valid_client_summary(next_content,source_content) then
    raise exception 'CLIENT_SUMMARY_FACT_MISMATCH'; end if;
  if requested_action='reject' and char_length(coalesce(requested_rejection_reason,''))<2 then
    raise exception 'CLIENT_SUMMARY_REJECTION_REQUIRED'; end if;
  perform pg_advisory_xact_lock(hashtextextended('client-summary:' || current_record.visit_id::text,0));
  next_status := case requested_action when 'save' then 'edited' when 'approve' then 'approved' else 'rejected' end;
  next_version := current_record.version_number+1;
  update public.ai_artifacts set status='superseded',updated_at=now() where public.ai_artifacts.artifact_id=current_record.artifact_id;
  insert into public.ai_artifacts(
    clinic_id,operation_id,owner_id,pet_id,visit_id,artifact_type,status,content,created_by,approved_by,approved_at,
    model_version,prompt_version,version_number,supersedes_artifact_id
  ) values (
    current_record.clinic_id,current_record.operation_id,current_record.owner_id,current_record.pet_id,current_record.visit_id,
    'client_explanation',next_status,next_content,(select auth.uid()),case when requested_action='approve' then actor_staff_id end,
    case when requested_action='approve' then now() end,current_record.model_version,current_record.prompt_version,next_version,current_record.artifact_id
  ) returning public.ai_artifacts.artifact_id into next_id;
  insert into public.ai_sources(clinic_id,artifact_id,source_type,source_record_id)
    select current_record.clinic_id,next_id,'ai_artifact',link.source_record_id from public.ai_sources link
    where link.artifact_id=current_record.artifact_id and link.source_type='ai_artifact';
  insert into public.ai_approval_history(clinic_id,artifact_id,action,actor_user_id,actor_staff_id,previous_status,new_status,change_summary)
    values(current_record.clinic_id,next_id,case requested_action when 'save' then 'edited' when 'approve' then 'approved' else 'rejected' end,
      (select auth.uid()),actor_staff_id,current_record.status,next_status,case when requested_action='reject'
        then jsonb_build_object('rejection_reason',left(requested_rejection_reason,500)) else jsonb_build_object('content_reviewed',true) end);
  return query select next_id,next_status,next_content,next_version,false;
end;
$_$;


--
-- Name: myvet_transition_follow_up_suggestion("uuid", "text", "jsonb", "text", boolean); Type: FUNCTION; Schema: public; Owner: -
--

CREATE FUNCTION "public"."myvet_transition_follow_up_suggestion"("requested_artifact_id" "uuid", "requested_action" "text", "requested_content" "jsonb" DEFAULT NULL::"jsonb", "requested_rejection_reason" "text" DEFAULT NULL::"text", "requested_duplicate_confirmed" boolean DEFAULT false) RETURNS TABLE("artifact_id" "uuid", "status" "text", "content" "jsonb", "version_number" integer, "reminder_id" bigint, "possible_duplicate" boolean)
    LANGUAGE "plpgsql" SECURITY DEFINER
    SET "search_path" TO ''
    AS $_$
declare
  current_record record; actor_staff_id uuid; next_status text; next_id uuid; next_version integer; next_content jsonb;
  source_record record; existing_reminder_id bigint; created_reminder_id bigint;
begin
  if (select auth.uid()) is null or requested_action not in ('save','approve','reject') then raise exception 'FOLLOW_UP_ACTION_INVALID'; end if;
  select artifact.*,staff.staff_id into current_record from public.ai_artifacts artifact
  join public.staff staff on staff.clinic_id=artifact.clinic_id and staff.auth_user_id=(select auth.uid())
    and staff.is_active and staff.role='vet'
  where artifact.artifact_id=requested_artifact_id and artifact.artifact_type='reminder_suggestion'
    and artifact.status in ('draft','edited') and artifact.deleted_at is null for update of artifact;
  actor_staff_id := current_record.staff_id;
  if current_record.artifact_id is null then raise exception 'FOLLOW_UP_ACCESS_DENIED'; end if;
  select link.source_type,link.source_record_id into source_record from public.ai_sources link
    where link.artifact_id=current_record.artifact_id and link.source_type in ('ai_artifact','vaccination') limit 1;
  if source_record.source_record_id is null then raise exception 'FOLLOW_UP_APPROVED_SOURCE_REQUIRED'; end if;
  if source_record.source_type='ai_artifact' and not exists (
    select 1 from public.ai_artifacts source where source.clinic_id=current_record.clinic_id
      and source.artifact_id=case when source_record.source_record_id ~* '^[0-9a-f-]{36}$' then source_record.source_record_id::uuid else null end
      and source.artifact_type='visit_summary' and source.status='approved' and source.deleted_at is null
  ) then raise exception 'FOLLOW_UP_APPROVED_SOURCE_REQUIRED'; end if;
  if source_record.source_type='vaccination' and not exists (
    select 1 from public.vaccinations vaccine where vaccine.clinic_id=current_record.clinic_id
      and vaccine.pet_id=current_record.pet_id
      and vaccine.vaccination_id=case when source_record.source_record_id ~* '^[0-9a-f-]{36}$' then source_record.source_record_id::uuid else null end
      and vaccine.given_date is not null
  ) then raise exception 'FOLLOW_UP_APPROVED_SOURCE_REQUIRED'; end if;
  if exists (select 1 from public.ai_feature_flags where clinic_id=current_record.clinic_id
    and capability='reminder_suggestion' and (not enabled or kill_switch)) then raise exception 'AI_FEATURE_DISABLED'; end if;
  next_content := coalesce(requested_content,current_record.content);
  if requested_action in ('save','approve') and not private.myvet_is_valid_follow_up_suggestion(next_content) then
    raise exception 'FOLLOW_UP_INPUT_INVALID';
  end if;
  if requested_action='approve' and ((next_content ->> 'requires_manual_date')::boolean
    or nullif(next_content ->> 'scheduled_at','') is null) then raise exception 'FOLLOW_UP_DATE_REQUIRED'; end if;
  if requested_action='reject' and char_length(coalesce(requested_rejection_reason,''))<2 then raise exception 'FOLLOW_UP_REJECTION_REQUIRED'; end if;
  perform pg_advisory_xact_lock(hashtextextended('follow-up-approve:' || current_record.pet_id::text,0));

  if requested_action='approve' then
    select reminder.reminder_id into existing_reminder_id from public.reminders reminder
    where reminder.clinic_id=current_record.clinic_id and reminder.pet_id=current_record.pet_id
      and coalesce(reminder.source_type,'')=source_record.source_type
      and coalesce(reminder.source_id,'')=source_record.source_record_id
      and coalesce(reminder.reminder_type,'')=next_content ->> 'reminder_type'
      and reminder.due_at=(next_content ->> 'scheduled_at')::timestamptz
      and coalesce(reminder.status,'open') not in ('cancelled','deleted')
    order by reminder.reminder_id desc limit 1;
    if existing_reminder_id is not null and not requested_duplicate_confirmed then
      return query select current_record.artifact_id,'duplicate'::text,next_content,current_record.version_number,existing_reminder_id,true;
      return;
    end if;
  end if;

  next_status := case requested_action when 'save' then 'edited' when 'approve' then 'approved' else 'rejected' end;
  next_version := current_record.version_number+1;
  update public.ai_artifacts set status='superseded',updated_at=now() where public.ai_artifacts.artifact_id=current_record.artifact_id;
  insert into public.ai_artifacts(
    clinic_id,operation_id,owner_id,pet_id,visit_id,artifact_type,status,content,created_by,approved_by,approved_at,
    model_version,prompt_version,version_number,supersedes_artifact_id
  ) values (
    current_record.clinic_id,current_record.operation_id,current_record.owner_id,current_record.pet_id,current_record.visit_id,
    'reminder_suggestion',next_status,next_content,(select auth.uid()),case when requested_action='approve' then actor_staff_id end,
    case when requested_action='approve' then now() end,current_record.model_version,current_record.prompt_version,
    next_version,current_record.artifact_id
  ) returning public.ai_artifacts.artifact_id into next_id;
  insert into public.ai_sources(clinic_id,artifact_id,source_type,source_record_id)
    values(current_record.clinic_id,next_id,source_record.source_type,source_record.source_record_id);

  if requested_action='approve' then
    insert into public.reminders(
      clinic_id,owner_id,pet_id,visit_id,title,message,reminder_type,due_at,status,action_url,is_read,
      source_type,source_id,metadata
    ) values (
      current_record.clinic_id,case when (next_content ->> 'release_to_client')::boolean then current_record.owner_id else null end,
      current_record.pet_id,current_record.visit_id,next_content ->> 'title',next_content ->> 'description',
      next_content ->> 'reminder_type',(next_content ->> 'scheduled_at')::timestamptz,'open',
      case when (next_content ->> 'release_to_client')::boolean then '/portal?view=notifications' else null end,
      false,source_record.source_type,source_record.source_record_id,
      jsonb_build_object('target_type',next_content ->> 'target_type','release_to_client',(next_content ->> 'release_to_client')::boolean,
        'confidence',next_content ->> 'confidence','suggestion_artifact_id',next_id)
    ) returning public.reminders.reminder_id into created_reminder_id;
  end if;
  insert into public.ai_approval_history(clinic_id,artifact_id,action,actor_user_id,actor_staff_id,previous_status,new_status,change_summary)
    values(current_record.clinic_id,next_id,case requested_action when 'save' then 'edited' when 'approve' then 'approved' else 'rejected' end,
      (select auth.uid()),actor_staff_id,current_record.status,next_status,case when requested_action='reject'
        then jsonb_build_object('rejection_reason',left(requested_rejection_reason,500))
        else jsonb_build_object('reminder_created',created_reminder_id is not null) end);
  insert into public.ai_audit_events(clinic_id,actor_user_id,operation_id,capability,event_type,outcome,model_version,prompt_version,schema_version)
    values(current_record.clinic_id,(select auth.uid()),current_record.operation_id,'reminder_suggestion',
      'approval_recorded','success',
      current_record.model_version,current_record.prompt_version,'2026-07-17.1');
  return query select next_id,next_status,next_content,next_version,created_reminder_id,false;
end;
$_$;


--
-- Name: myvet_transition_visit_summary("uuid", "text", "jsonb", "text"); Type: FUNCTION; Schema: public; Owner: -
--

CREATE FUNCTION "public"."myvet_transition_visit_summary"("requested_artifact_id" "uuid", "requested_action" "text", "requested_content" "jsonb" DEFAULT NULL::"jsonb", "requested_rejection_reason" "text" DEFAULT NULL::"text") RETURNS TABLE("artifact_id" "uuid", "status" "text", "content" "jsonb", "version_number" integer)
    LANGUAGE "plpgsql" SECURITY DEFINER
    SET "search_path" TO ''
    AS $$
declare
  current_record record;
  actor_staff_id uuid;
  next_status text;
  next_action text;
  next_artifact_id uuid;
  next_version integer;
  next_content jsonb;
begin
  if (select auth.uid()) is null or requested_action not in ('save', 'approve', 'reject') then
    raise exception 'VISIT_SUMMARY_ACTION_INVALID';
  end if;

  select artifact.* into current_record
  from public.ai_artifacts as artifact
  join public.staff as staff on staff.clinic_id = artifact.clinic_id
    and staff.auth_user_id = (select auth.uid()) and staff.is_active and staff.role = 'vet'
  where artifact.artifact_id = requested_artifact_id
    and artifact.artifact_type = 'visit_summary'
    and artifact.deleted_at is null
  for update of artifact;

  if current_record.artifact_id is null then raise exception 'VISIT_SUMMARY_ACCESS_DENIED'; end if;
  select staff.staff_id into actor_staff_id
  from public.staff as staff
  where staff.clinic_id = current_record.clinic_id
    and staff.auth_user_id = (select auth.uid())
    and staff.is_active and staff.role = 'vet';
  if current_record.status not in ('draft', 'edited') then raise exception 'VISIT_SUMMARY_NOT_EDITABLE'; end if;
  if exists (
    select 1 from public.ai_artifacts as newer
    where newer.clinic_id = current_record.clinic_id
      and newer.visit_id = current_record.visit_id
      and newer.artifact_type = 'visit_summary'
      and newer.version_number > current_record.version_number
      and newer.deleted_at is null
  ) then raise exception 'VISIT_SUMMARY_VERSION_CONFLICT'; end if;
  if exists (
    select 1 from public.ai_feature_flags
    where clinic_id = current_record.clinic_id and capability = 'visit_summary'
      and (not enabled or kill_switch)
  ) then raise exception 'AI_FEATURE_DISABLED'; end if;

  perform pg_advisory_xact_lock(hashtextextended('visit-summary:' || current_record.visit_id::text, 0));
  next_content := coalesce(requested_content, current_record.content);
  if requested_action in ('save', 'approve') and not private.myvet_is_valid_visit_summary(next_content) then
    raise exception 'VISIT_SUMMARY_INPUT_INVALID';
  end if;
  if requested_action = 'reject' and char_length(coalesce(requested_rejection_reason, '')) > 500 then
    raise exception 'VISIT_SUMMARY_REJECTION_TOO_LONG';
  end if;

  next_status := case requested_action when 'save' then 'edited' when 'approve' then 'approved' else 'rejected' end;
  next_action := case requested_action when 'save' then 'edited' when 'approve' then 'approved' else 'rejected' end;
  next_version := current_record.version_number + 1;

  update public.ai_artifacts set status = 'superseded', updated_at = now()
  where public.ai_artifacts.artifact_id = current_record.artifact_id;

  insert into public.ai_artifacts(
    clinic_id, operation_id, owner_id, pet_id, visit_id, appointment_id,
    artifact_type, status, content, created_by, approved_by, approved_at,
    model_version, prompt_version, version_number, supersedes_artifact_id
  ) values (
    current_record.clinic_id, current_record.operation_id, current_record.owner_id,
    current_record.pet_id, current_record.visit_id, current_record.appointment_id,
    'visit_summary', next_status, next_content, (select auth.uid()),
    case when requested_action = 'approve' then actor_staff_id else null end,
    case when requested_action = 'approve' then now() else null end,
    current_record.model_version, current_record.prompt_version, next_version,
    current_record.artifact_id
  ) returning public.ai_artifacts.artifact_id into next_artifact_id;

  insert into public.ai_approval_history(
    clinic_id, artifact_id, action, actor_user_id, actor_staff_id,
    previous_status, new_status, change_summary
  ) values (
    current_record.clinic_id, next_artifact_id, next_action, (select auth.uid()),
    actor_staff_id, current_record.status, next_status,
    case when requested_action = 'reject'
      then jsonb_build_object('rejection_reason', left(coalesce(requested_rejection_reason, ''), 500))
      else jsonb_build_object('content_reviewed', true)
    end
  );

  insert into public.ai_audit_events(
    clinic_id, actor_user_id, operation_id, capability, event_type, outcome,
    model_version, prompt_version, schema_version
  ) values (
    current_record.clinic_id, (select auth.uid()), current_record.operation_id,
    'visit_summary', 'approval_recorded', 'success', current_record.model_version,
    current_record.prompt_version, '2026-07-17.1'
  );

  return query select next_artifact_id, next_status, next_content, next_version;
end;
$$;


--
-- Name: FUNCTION "myvet_transition_visit_summary"("requested_artifact_id" "uuid", "requested_action" "text", "requested_content" "jsonb", "requested_rejection_reason" "text"); Type: COMMENT; Schema: public; Owner: -
--

COMMENT ON FUNCTION "public"."myvet_transition_visit_summary"("requested_artifact_id" "uuid", "requested_action" "text", "requested_content" "jsonb", "requested_rejection_reason" "text") IS 'Stage 3: creates immutable reviewed versions. Approval is veterinarian-only and never occurs during AI generation.';


--
-- Name: set_updated_at(); Type: FUNCTION; Schema: public; Owner: -
--

CREATE FUNCTION "public"."set_updated_at"() RETURNS "trigger"
    LANGUAGE "plpgsql"
    AS $$
begin
  new.updated_at = now();
  return new;
end;
$$;


SET default_tablespace = '';

SET default_table_access_method = "heap";

--
-- Name: ai_approval_history; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE "public"."ai_approval_history" (
    "approval_event_id" "uuid" DEFAULT "gen_random_uuid"() NOT NULL,
    "clinic_id" "uuid" NOT NULL,
    "artifact_id" "uuid" NOT NULL,
    "action" "text" NOT NULL,
    "actor_user_id" "uuid",
    "actor_staff_id" "uuid",
    "previous_status" "text",
    "new_status" "text",
    "change_summary" "jsonb" DEFAULT '{}'::"jsonb" NOT NULL,
    "created_at" timestamp with time zone DEFAULT "now"() NOT NULL,
    CONSTRAINT "ai_approval_history_action_check" CHECK (("action" = ANY (ARRAY['submitted'::"text", 'edited'::"text", 'approved'::"text", 'rejected'::"text", 'superseded'::"text", 'released'::"text", 'release_revoked'::"text"]))),
    CONSTRAINT "ai_approval_history_change_summary_check" CHECK (("jsonb_typeof"("change_summary") = 'object'::"text")),
    CONSTRAINT "ai_approval_history_new_status_check" CHECK ((("new_status" IS NULL) OR ("new_status" = ANY (ARRAY['generating'::"text", 'draft'::"text", 'edited'::"text", 'approved'::"text", 'rejected'::"text", 'failed'::"text", 'superseded'::"text"])))),
    CONSTRAINT "ai_approval_history_previous_status_check" CHECK ((("previous_status" IS NULL) OR ("previous_status" = ANY (ARRAY['generating'::"text", 'draft'::"text", 'edited'::"text", 'approved'::"text", 'rejected'::"text", 'failed'::"text", 'superseded'::"text"]))))
);

ALTER TABLE ONLY "public"."ai_approval_history" FORCE ROW LEVEL SECURITY;


--
-- Name: ai_artifacts; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE "public"."ai_artifacts" (
    "artifact_id" "uuid" DEFAULT "gen_random_uuid"() NOT NULL,
    "clinic_id" "uuid" NOT NULL,
    "operation_id" "uuid" NOT NULL,
    "owner_id" "text",
    "pet_id" bigint,
    "visit_id" bigint,
    "appointment_id" bigint,
    "artifact_type" "text" NOT NULL,
    "status" "text" DEFAULT 'generating'::"text" NOT NULL,
    "content" "jsonb" DEFAULT '{}'::"jsonb" NOT NULL,
    "created_by" "uuid",
    "approved_by" "uuid",
    "approved_at" timestamp with time zone,
    "released_to_owner" boolean DEFAULT false NOT NULL,
    "released_at" timestamp with time zone,
    "model_version" "text",
    "prompt_version" "text",
    "version_number" integer DEFAULT 1 NOT NULL,
    "supersedes_artifact_id" "uuid",
    "retention_until" timestamp with time zone,
    "deleted_at" timestamp with time zone,
    "created_at" timestamp with time zone DEFAULT "now"() NOT NULL,
    "updated_at" timestamp with time zone DEFAULT "now"() NOT NULL,
    CONSTRAINT "ai_artifacts_approval_state" CHECK (((("status" = 'approved'::"text") AND ("approved_by" IS NOT NULL) AND ("approved_at" IS NOT NULL)) OR (("status" <> 'approved'::"text") AND ("approved_at" IS NULL)))),
    CONSTRAINT "ai_artifacts_artifact_type_check" CHECK (("artifact_type" = ANY (ARRAY['visit_summary'::"text", 'transcript'::"text", 'document_extraction'::"text", 'client_explanation'::"text", 'reminder_suggestion'::"text", 'structured_response'::"text"]))),
    CONSTRAINT "ai_artifacts_content_check" CHECK (("jsonb_typeof"("content") = 'object'::"text")),
    CONSTRAINT "ai_artifacts_model_version_check" CHECK ((("model_version" IS NULL) OR ("char_length"("model_version") <= 120))),
    CONSTRAINT "ai_artifacts_prompt_version_check" CHECK ((("prompt_version" IS NULL) OR ("char_length"("prompt_version") <= 120))),
    CONSTRAINT "ai_artifacts_release_state" CHECK ((((NOT "released_to_owner") AND ("released_at" IS NULL)) OR ("released_to_owner" AND ("released_at" IS NOT NULL) AND ("status" = 'approved'::"text") AND ("artifact_type" <> ALL (ARRAY['transcript'::"text", 'document_extraction'::"text"]))))),
    CONSTRAINT "ai_artifacts_status_check" CHECK (("status" = ANY (ARRAY['generating'::"text", 'draft'::"text", 'edited'::"text", 'approved'::"text", 'rejected'::"text", 'failed'::"text", 'superseded'::"text"]))),
    CONSTRAINT "ai_artifacts_version_number_check" CHECK (("version_number" >= 1))
);

ALTER TABLE ONLY "public"."ai_artifacts" FORCE ROW LEVEL SECURITY;


--
-- Name: TABLE "ai_artifacts"; Type: COMMENT; Schema: public; Owner: -
--

COMMENT ON TABLE "public"."ai_artifacts" IS 'Sensitive AI drafts and approved artifacts; direct browser writes are intentionally not granted in Stage 2.';


--
-- Name: ai_audit_events; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE "public"."ai_audit_events" (
    "audit_event_id" bigint NOT NULL,
    "clinic_id" "uuid" NOT NULL,
    "actor_user_id" "uuid",
    "operation_id" "uuid",
    "capability" "text" NOT NULL,
    "event_type" "text" NOT NULL,
    "outcome" "text" NOT NULL,
    "provider" "text",
    "model_version" "text",
    "prompt_version" "text",
    "schema_version" "text",
    "latency_ms" integer,
    "input_tokens" integer,
    "output_tokens" integer,
    "error_code" "text",
    "created_at" timestamp with time zone DEFAULT "now"() NOT NULL,
    CONSTRAINT "ai_audit_events_capability_check" CHECK ((("char_length"("capability") >= 1) AND ("char_length"("capability") <= 80))),
    CONSTRAINT "ai_audit_events_error_code_check" CHECK ((("error_code" IS NULL) OR ("error_code" ~ '^[A-Z0-9_]{1,80}$'::"text"))),
    CONSTRAINT "ai_audit_events_event_type_check" CHECK (("event_type" = ANY (ARRAY['request_received'::"text", 'provider_completed'::"text", 'provider_failed'::"text", 'output_rejected'::"text", 'draft_created'::"text", 'approval_recorded'::"text", 'release_recorded'::"text", 'access_denied'::"text", 'rate_limited'::"text", 'feature_disabled'::"text", 'consent_recorded'::"text", 'capture_started'::"text", 'capture_stopped'::"text", 'transcript_created'::"text", 'file_accessed'::"text", 'retention_deleted'::"text", 'index_started'::"text", 'index_completed'::"text", 'index_failed'::"text", 'rag_query_completed'::"text", 'rag_no_results'::"text", 'suspicious_request'::"text"]))),
    CONSTRAINT "ai_audit_events_input_tokens_check" CHECK ((("input_tokens" IS NULL) OR ("input_tokens" >= 0))),
    CONSTRAINT "ai_audit_events_latency_ms_check" CHECK ((("latency_ms" IS NULL) OR ("latency_ms" >= 0))),
    CONSTRAINT "ai_audit_events_model_version_check" CHECK ((("model_version" IS NULL) OR ("char_length"("model_version") <= 120))),
    CONSTRAINT "ai_audit_events_outcome_check" CHECK (("outcome" = ANY (ARRAY['success'::"text", 'failed'::"text", 'blocked'::"text"]))),
    CONSTRAINT "ai_audit_events_output_tokens_check" CHECK ((("output_tokens" IS NULL) OR ("output_tokens" >= 0))),
    CONSTRAINT "ai_audit_events_prompt_version_check" CHECK ((("prompt_version" IS NULL) OR ("char_length"("prompt_version") <= 120))),
    CONSTRAINT "ai_audit_events_provider_check" CHECK ((("provider" IS NULL) OR ("char_length"("provider") <= 80))),
    CONSTRAINT "ai_audit_events_schema_version_check" CHECK ((("schema_version" IS NULL) OR ("char_length"("schema_version") <= 120)))
);

ALTER TABLE ONLY "public"."ai_audit_events" FORCE ROW LEVEL SECURITY;


--
-- Name: TABLE "ai_audit_events"; Type: COMMENT; Schema: public; Owner: -
--

COMMENT ON TABLE "public"."ai_audit_events" IS 'Generic metadata-only AI audit. Prompts, responses, medical text, transcripts and signed URLs are prohibited.';


--
-- Name: ai_audit_events_audit_event_id_seq; Type: SEQUENCE; Schema: public; Owner: -
--

ALTER TABLE "public"."ai_audit_events" ALTER COLUMN "audit_event_id" ADD GENERATED ALWAYS AS IDENTITY (
    SEQUENCE NAME "public"."ai_audit_events_audit_event_id_seq"
    START WITH 1
    INCREMENT BY 1
    NO MINVALUE
    NO MAXVALUE
    CACHE 1
);


--
-- Name: ai_consent_records; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE "public"."ai_consent_records" (
    "consent_id" "uuid" DEFAULT "gen_random_uuid"() NOT NULL,
    "clinic_id" "uuid" NOT NULL,
    "owner_id" "text" NOT NULL,
    "auth_user_id" "uuid",
    "purpose" "text" NOT NULL,
    "notice_version" "text" NOT NULL,
    "status" "text" NOT NULL,
    "capture_source" "text" NOT NULL,
    "granted_at" timestamp with time zone,
    "withdrawn_at" timestamp with time zone,
    "created_by" "uuid",
    "created_at" timestamp with time zone DEFAULT "now"() NOT NULL,
    "updated_at" timestamp with time zone DEFAULT "now"() NOT NULL,
    "appointment_id" bigint,
    "video_session_id" bigint,
    CONSTRAINT "ai_consent_records_capture_source_check" CHECK (("capture_source" = ANY (ARRAY['owner_portal'::"text", 'staff_assisted'::"text", 'written'::"text", 'system_migration'::"text"]))),
    CONSTRAINT "ai_consent_records_notice_version_check" CHECK ((("char_length"("notice_version") >= 1) AND ("char_length"("notice_version") <= 80))),
    CONSTRAINT "ai_consent_records_purpose_check" CHECK (("purpose" = ANY (ARRAY['ai_processing'::"text", 'recording'::"text", 'transcription'::"text", 'document_ocr'::"text", 'client_explanation'::"text"]))),
    CONSTRAINT "ai_consent_records_status_check" CHECK (("status" = ANY (ARRAY['granted'::"text", 'withdrawn'::"text", 'expired'::"text", 'revoked'::"text"]))),
    CONSTRAINT "ai_consent_records_status_time" CHECK (((("status" = 'granted'::"text") AND ("granted_at" IS NOT NULL) AND ("withdrawn_at" IS NULL)) OR (("status" <> 'granted'::"text") AND ("withdrawn_at" IS NOT NULL))))
);

ALTER TABLE ONLY "public"."ai_consent_records" FORCE ROW LEVEL SECURITY;


--
-- Name: ai_document_chunks; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE "public"."ai_document_chunks" (
    "chunk_id" "uuid" DEFAULT "gen_random_uuid"() NOT NULL,
    "clinic_id" "uuid" NOT NULL,
    "document_id" "uuid",
    "chunk_index" integer NOT NULL,
    "content" "text" NOT NULL,
    "content_hash" "text" NOT NULL,
    "token_count" integer,
    "status" "text" DEFAULT 'pending'::"text" NOT NULL,
    "approval_status" "text" DEFAULT 'internal'::"text" NOT NULL,
    "created_at" timestamp with time zone DEFAULT "now"() NOT NULL,
    "updated_at" timestamp with time zone DEFAULT "now"() NOT NULL,
    "owner_id" "text",
    "pet_id" bigint,
    "source_type" "text",
    "source_record_id" "text",
    "source_date" "date",
    "source_title" "text",
    "release_to_client" boolean DEFAULT false NOT NULL,
    "indexed_at" timestamp with time zone,
    CONSTRAINT "ai_document_chunks_approval_status_check" CHECK (("approval_status" = ANY (ARRAY['internal'::"text", 'approved'::"text", 'released'::"text"]))),
    CONSTRAINT "ai_document_chunks_chunk_index_check" CHECK (("chunk_index" >= 0)),
    CONSTRAINT "ai_document_chunks_client_release_check" CHECK (((NOT "release_to_client") OR (("approval_status" = 'released'::"text") AND ("status" = 'ready'::"text")))),
    CONSTRAINT "ai_document_chunks_content_check" CHECK ((("char_length"("content") >= 1) AND ("char_length"("content") <= 12000))),
    CONSTRAINT "ai_document_chunks_content_hash_check" CHECK (("content_hash" ~ '^[a-f0-9]{64}$'::"text")),
    CONSTRAINT "ai_document_chunks_rag_scope_check" CHECK ((("source_type" IS NULL) OR (("pet_id" IS NOT NULL) AND ("owner_id" IS NOT NULL)))),
    CONSTRAINT "ai_document_chunks_release_check" CHECK ((("approval_status" <> 'released'::"text") OR ("status" = 'ready'::"text"))),
    CONSTRAINT "ai_document_chunks_source_identity_check" CHECK (((("source_type" IS NULL) AND ("source_record_id" IS NULL)) OR (("source_type" IS NOT NULL) AND ("source_record_id" IS NOT NULL) AND (("char_length"("source_record_id") >= 1) AND ("char_length"("source_record_id") <= 160))))),
    CONSTRAINT "ai_document_chunks_source_title_check" CHECK ((("source_title" IS NULL) OR (("char_length"("source_title") >= 1) AND ("char_length"("source_title") <= 240)))),
    CONSTRAINT "ai_document_chunks_source_type_check" CHECK ((("source_type" IS NULL) OR ("source_type" = ANY (ARRAY['medical_visit'::"text", 'vaccination'::"text", 'lab_result'::"text", 'medical_document'::"text", 'approved_visit_summary'::"text", 'digitalcare_summary'::"text", 'document_extraction'::"text"])))),
    CONSTRAINT "ai_document_chunks_status_check" CHECK (("status" = ANY (ARRAY['pending'::"text", 'ready'::"text", 'failed'::"text", 'superseded'::"text"]))),
    CONSTRAINT "ai_document_chunks_token_count_check" CHECK ((("token_count" IS NULL) OR ("token_count" >= 0)))
);

ALTER TABLE ONLY "public"."ai_document_chunks" FORCE ROW LEVEL SECURITY;


--
-- Name: COLUMN "ai_document_chunks"."release_to_client"; Type: COMMENT; Schema: public; Owner: -
--

COMMENT ON COLUMN "public"."ai_document_chunks"."release_to_client" IS 'Explicit release gate for owner RAG. Approval alone is not sufficient.';


--
-- Name: ai_document_embeddings; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE "public"."ai_document_embeddings" (
    "embedding_id" "uuid" DEFAULT "gen_random_uuid"() NOT NULL,
    "clinic_id" "uuid" NOT NULL,
    "chunk_id" "uuid" NOT NULL,
    "provider" "text" NOT NULL,
    "model_version" "text" NOT NULL,
    "dimensions" integer NOT NULL,
    "embedding_hash" "text" NOT NULL,
    "status" "text" DEFAULT 'pending'::"text" NOT NULL,
    "error_code" "text",
    "created_at" timestamp with time zone DEFAULT "now"() NOT NULL,
    "updated_at" timestamp with time zone DEFAULT "now"() NOT NULL,
    "embedding" "extensions"."vector"(768),
    "embedding_version" "text",
    CONSTRAINT "ai_document_embeddings_dimensions_check" CHECK ((("dimensions" >= 1) AND ("dimensions" <= 4096))),
    CONSTRAINT "ai_document_embeddings_embedding_hash_check" CHECK (("embedding_hash" ~ '^[a-f0-9]{64}$'::"text")),
    CONSTRAINT "ai_document_embeddings_error_code_check" CHECK ((("error_code" IS NULL) OR ("error_code" ~ '^[A-Z0-9_]{1,80}$'::"text"))),
    CONSTRAINT "ai_document_embeddings_model_version_check" CHECK ((("char_length"("model_version") >= 1) AND ("char_length"("model_version") <= 120))),
    CONSTRAINT "ai_document_embeddings_provider_check" CHECK ((("char_length"("provider") >= 1) AND ("char_length"("provider") <= 80))),
    CONSTRAINT "ai_document_embeddings_ready_check" CHECK ((("status" <> 'ready'::"text") OR (("embedding" IS NOT NULL) AND ("dimensions" = 768) AND ("embedding_version" IS NOT NULL)))),
    CONSTRAINT "ai_document_embeddings_status_check" CHECK (("status" = ANY (ARRAY['pending'::"text", 'ready'::"text", 'failed'::"text", 'superseded'::"text"]))),
    CONSTRAINT "ai_document_embeddings_version_check" CHECK ((("embedding_version" IS NULL) OR (("char_length"("embedding_version") >= 1) AND ("char_length"("embedding_version") <= 80))))
);

ALTER TABLE ONLY "public"."ai_document_embeddings" FORCE ROW LEVEL SECURITY;


--
-- Name: TABLE "ai_document_embeddings"; Type: COMMENT; Schema: public; Owner: -
--

COMMENT ON TABLE "public"."ai_document_embeddings" IS 'Embedding lifecycle registry only. Vector payload/search is deferred until Stage 5 chooses a fixed model and dimension.';


--
-- Name: COLUMN "ai_document_embeddings"."embedding"; Type: COMMENT; Schema: public; Owner: -
--

COMMENT ON COLUMN "public"."ai_document_embeddings"."embedding" IS 'Stage 5 fixed-dimension (768) vector. Model/provider changes require re-indexing.';


--
-- Name: ai_documents; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE "public"."ai_documents" (
    "document_id" "uuid" DEFAULT "gen_random_uuid"() NOT NULL,
    "clinic_id" "uuid" NOT NULL,
    "owner_id" "text",
    "pet_id" bigint,
    "visit_id" bigint,
    "appointment_id" bigint,
    "document_kind" "text" NOT NULL,
    "bucket_id" "text" NOT NULL,
    "object_path" "text" NOT NULL,
    "mime_type" "text" NOT NULL,
    "size_bytes" bigint NOT NULL,
    "checksum_sha256" "text",
    "status" "text" DEFAULT 'pending'::"text" NOT NULL,
    "uploaded_by" "uuid",
    "released_to_owner" boolean DEFAULT false NOT NULL,
    "released_at" timestamp with time zone,
    "retention_until" timestamp with time zone,
    "deleted_at" timestamp with time zone,
    "created_at" timestamp with time zone DEFAULT "now"() NOT NULL,
    "updated_at" timestamp with time zone DEFAULT "now"() NOT NULL,
    CONSTRAINT "ai_documents_bucket_id_check" CHECK (("bucket_id" = ANY (ARRAY['ai-medical-documents'::"text", 'ai-recordings'::"text"]))),
    CONSTRAINT "ai_documents_checksum_sha256_check" CHECK ((("checksum_sha256" IS NULL) OR ("checksum_sha256" ~ '^[a-f0-9]{64}$'::"text"))),
    CONSTRAINT "ai_documents_deleted_state" CHECK ((("status" = 'deleted'::"text") = ("deleted_at" IS NOT NULL))),
    CONSTRAINT "ai_documents_document_kind_check" CHECK (("document_kind" = ANY (ARRAY['medical_document'::"text", 'vaccination_label'::"text", 'recording'::"text", 'transcript_source'::"text", 'other'::"text"]))),
    CONSTRAINT "ai_documents_mime_type_check" CHECK ((("char_length"("mime_type") >= 3) AND ("char_length"("mime_type") <= 160))),
    CONSTRAINT "ai_documents_object_path_check" CHECK (((("char_length"("object_path") >= 10) AND ("char_length"("object_path") <= 1024)) AND ("object_path" !~ '(^|/)\.\.(/|$)'::"text"))),
    CONSTRAINT "ai_documents_release_state" CHECK ((((NOT "released_to_owner") AND ("released_at" IS NULL)) OR ("released_to_owner" AND ("released_at" IS NOT NULL) AND ("status" = 'ready'::"text") AND ("document_kind" <> 'recording'::"text")))),
    CONSTRAINT "ai_documents_size_bytes_check" CHECK ((("size_bytes" >= 1) AND ("size_bytes" <= 52428800))),
    CONSTRAINT "ai_documents_status_check" CHECK (("status" = ANY (ARRAY['pending'::"text", 'ready'::"text", 'failed'::"text", 'quarantined'::"text", 'deleted'::"text"])))
);

ALTER TABLE ONLY "public"."ai_documents" FORCE ROW LEVEL SECURITY;


--
-- Name: ai_feature_flags; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE "public"."ai_feature_flags" (
    "clinic_id" "uuid" NOT NULL,
    "capability" "text" NOT NULL,
    "enabled" boolean DEFAULT false NOT NULL,
    "kill_switch" boolean DEFAULT false NOT NULL,
    "configuration" "jsonb" DEFAULT '{}'::"jsonb" NOT NULL,
    "updated_by" "uuid",
    "created_at" timestamp with time zone DEFAULT "now"() NOT NULL,
    "updated_at" timestamp with time zone DEFAULT "now"() NOT NULL,
    CONSTRAINT "ai_feature_flags_capability_check" CHECK (("capability" = ANY (ARRAY['vetbot'::"text", 'vetbot_actions'::"text", 'appointment_actions'::"text", 'visit_summary'::"text", 'digitalcare_transcription'::"text", 'digitalcare_recording'::"text", 'digitalcare_summary'::"text", 'record_qa'::"text", 'rag_index'::"text", 'document_ocr'::"text", 'client_explanation'::"text", 'reminder_suggestion'::"text"]))),
    CONSTRAINT "ai_feature_flags_configuration_check" CHECK (("jsonb_typeof"("configuration") = 'object'::"text")),
    CONSTRAINT "ai_feature_flags_kill_switch" CHECK (((NOT "kill_switch") OR (NOT "enabled")))
);

ALTER TABLE ONLY "public"."ai_feature_flags" FORCE ROW LEVEL SECURITY;


--
-- Name: ai_operations; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE "public"."ai_operations" (
    "operation_id" "uuid" DEFAULT "gen_random_uuid"() NOT NULL,
    "clinic_id" "uuid" NOT NULL,
    "capability" "text" NOT NULL,
    "actor_user_id" "uuid",
    "actor_staff_id" "uuid",
    "owner_id" "text",
    "pet_id" bigint,
    "visit_id" bigint,
    "appointment_id" bigint,
    "status" "text" DEFAULT 'queued'::"text" NOT NULL,
    "request_fingerprint" "text",
    "idempotency_key" "text",
    "provider" "text",
    "model_version" "text",
    "prompt_version" "text",
    "schema_version" "text",
    "latency_ms" integer,
    "input_tokens" integer,
    "output_tokens" integer,
    "error_code" "text",
    "started_at" timestamp with time zone,
    "completed_at" timestamp with time zone,
    "retention_until" timestamp with time zone,
    "created_at" timestamp with time zone DEFAULT "now"() NOT NULL,
    "updated_at" timestamp with time zone DEFAULT "now"() NOT NULL,
    CONSTRAINT "ai_operations_capability_check" CHECK (("capability" = ANY (ARRAY['vetbot'::"text", 'visit_summary'::"text", 'digitalcare_transcription'::"text", 'digitalcare_recording'::"text", 'digitalcare_summary'::"text", 'record_qa'::"text", 'rag_index'::"text", 'document_ocr'::"text", 'client_explanation'::"text", 'reminder_suggestion'::"text"]))),
    CONSTRAINT "ai_operations_error_code_check" CHECK ((("error_code" IS NULL) OR ("error_code" ~ '^[A-Z0-9_]{1,80}$'::"text"))),
    CONSTRAINT "ai_operations_idempotency_key_check" CHECK ((("idempotency_key" IS NULL) OR (("char_length"("idempotency_key") >= 8) AND ("char_length"("idempotency_key") <= 200)))),
    CONSTRAINT "ai_operations_input_tokens_check" CHECK ((("input_tokens" IS NULL) OR ("input_tokens" >= 0))),
    CONSTRAINT "ai_operations_latency_ms_check" CHECK ((("latency_ms" IS NULL) OR ("latency_ms" >= 0))),
    CONSTRAINT "ai_operations_model_version_check" CHECK ((("model_version" IS NULL) OR ("char_length"("model_version") <= 120))),
    CONSTRAINT "ai_operations_output_tokens_check" CHECK ((("output_tokens" IS NULL) OR ("output_tokens" >= 0))),
    CONSTRAINT "ai_operations_prompt_version_check" CHECK ((("prompt_version" IS NULL) OR ("char_length"("prompt_version") <= 120))),
    CONSTRAINT "ai_operations_provider_check" CHECK ((("provider" IS NULL) OR ("char_length"("provider") <= 80))),
    CONSTRAINT "ai_operations_request_fingerprint_check" CHECK ((("request_fingerprint" IS NULL) OR (("char_length"("request_fingerprint") >= 32) AND ("char_length"("request_fingerprint") <= 128)))),
    CONSTRAINT "ai_operations_schema_version_check" CHECK ((("schema_version" IS NULL) OR ("char_length"("schema_version") <= 120))),
    CONSTRAINT "ai_operations_status_check" CHECK (("status" = ANY (ARRAY['queued'::"text", 'running'::"text", 'succeeded'::"text", 'failed'::"text", 'cancelled'::"text", 'blocked'::"text"]))),
    CONSTRAINT "ai_operations_time_order" CHECK ((("completed_at" IS NULL) OR ("started_at" IS NULL) OR ("completed_at" >= "started_at")))
);

ALTER TABLE ONLY "public"."ai_operations" FORCE ROW LEVEL SECURITY;


--
-- Name: TABLE "ai_operations"; Type: COMMENT; Schema: public; Owner: -
--

COMMENT ON TABLE "public"."ai_operations" IS 'Metadata-only AI request lifecycle. Never store prompts, responses, medical text, tokens or secrets here.';


--
-- Name: ai_rate_limit_windows; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE "public"."ai_rate_limit_windows" (
    "rate_limit_id" bigint NOT NULL,
    "clinic_id" "uuid" NOT NULL,
    "actor_user_id" "uuid" NOT NULL,
    "capability" "text" NOT NULL,
    "window_started_at" timestamp with time zone NOT NULL,
    "request_count" integer DEFAULT 1 NOT NULL,
    "expires_at" timestamp with time zone NOT NULL,
    "created_at" timestamp with time zone DEFAULT "now"() NOT NULL,
    "updated_at" timestamp with time zone DEFAULT "now"() NOT NULL,
    CONSTRAINT "ai_rate_limit_window_order" CHECK (("expires_at" > "window_started_at")),
    CONSTRAINT "ai_rate_limit_windows_capability_check" CHECK ((("char_length"("capability") >= 1) AND ("char_length"("capability") <= 80))),
    CONSTRAINT "ai_rate_limit_windows_request_count_check" CHECK ((("request_count" >= 0) AND ("request_count" <= 100000)))
);

ALTER TABLE ONLY "public"."ai_rate_limit_windows" FORCE ROW LEVEL SECURITY;


--
-- Name: TABLE "ai_rate_limit_windows"; Type: COMMENT; Schema: public; Owner: -
--

COMMENT ON TABLE "public"."ai_rate_limit_windows" IS 'Durable rate-limit state reserved for server-side integration; no browser privileges.';


--
-- Name: ai_rate_limit_windows_rate_limit_id_seq; Type: SEQUENCE; Schema: public; Owner: -
--

ALTER TABLE "public"."ai_rate_limit_windows" ALTER COLUMN "rate_limit_id" ADD GENERATED ALWAYS AS IDENTITY (
    SEQUENCE NAME "public"."ai_rate_limit_windows_rate_limit_id_seq"
    START WITH 1
    INCREMENT BY 1
    NO MINVALUE
    NO MAXVALUE
    CACHE 1
);


--
-- Name: ai_sources; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE "public"."ai_sources" (
    "source_id" "uuid" DEFAULT "gen_random_uuid"() NOT NULL,
    "clinic_id" "uuid" NOT NULL,
    "artifact_id" "uuid" NOT NULL,
    "source_type" "text" NOT NULL,
    "source_record_id" "text" NOT NULL,
    "document_id" "uuid",
    "chunk_id" "uuid",
    "source_hash" "text",
    "released_to_owner" boolean DEFAULT false NOT NULL,
    "created_at" timestamp with time zone DEFAULT "now"() NOT NULL,
    CONSTRAINT "ai_sources_source_hash_check" CHECK ((("source_hash" IS NULL) OR ("source_hash" ~ '^[a-f0-9]{64}$'::"text"))),
    CONSTRAINT "ai_sources_source_record_id_check" CHECK ((("char_length"("source_record_id") >= 1) AND ("char_length"("source_record_id") <= 160))),
    CONSTRAINT "ai_sources_source_type_check" CHECK (("source_type" = ANY (ARRAY['medical_visit'::"text", 'appointment'::"text", 'document'::"text", 'document_chunk'::"text", 'digitalcare'::"text", 'manual_note'::"text", 'ai_artifact'::"text", 'vaccination'::"text"])))
);

ALTER TABLE ONLY "public"."ai_sources" FORCE ROW LEVEL SECURITY;


--
-- Name: appointments; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE "public"."appointments" (
    "appointment_id" bigint NOT NULL,
    "pet_id" bigint,
    "start_time" timestamp with time zone,
    "end_time" timestamp with time zone,
    "department" "text",
    "vet_name" "text",
    "room" "text",
    "appointment_type" "text",
    "color" "text",
    "notes" "text",
    "appointment_mode" "text" DEFAULT 'physical'::"text" NOT NULL,
    "clinic_id" "uuid" DEFAULT "private"."myvet_current_clinic_id"() NOT NULL,
    CONSTRAINT "appointments_appointment_mode_check" CHECK (("appointment_mode" = ANY (ARRAY['physical'::"text", 'video'::"text"])))
);


--
-- Name: appointments_appointment_id_seq; Type: SEQUENCE; Schema: public; Owner: -
--

ALTER TABLE "public"."appointments" ALTER COLUMN "appointment_id" ADD GENERATED ALWAYS AS IDENTITY (
    SEQUENCE NAME "public"."appointments_appointment_id_seq"
    START WITH 1
    INCREMENT BY 1
    NO MINVALUE
    NO MAXVALUE
    CACHE 1
);


--
-- Name: clinic_booking_blocks; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE "public"."clinic_booking_blocks" (
    "block_id" bigint NOT NULL,
    "block_date" "date" NOT NULL,
    "is_all_day" boolean DEFAULT false NOT NULL,
    "starts_at" time without time zone,
    "ends_at" time without time zone,
    "reason" "text",
    "created_at" timestamp with time zone DEFAULT "now"() NOT NULL,
    "created_by" "uuid",
    "clinic_id" "uuid" DEFAULT "private"."myvet_current_clinic_id"() NOT NULL,
    CONSTRAINT "clinic_booking_blocks_reason_check" CHECK (("char_length"("reason") <= 200)),
    CONSTRAINT "clinic_booking_blocks_valid_window" CHECK ((("is_all_day" AND ("starts_at" IS NULL) AND ("ends_at" IS NULL)) OR ((NOT "is_all_day") AND ("starts_at" IS NOT NULL) AND ("ends_at" IS NOT NULL) AND ("ends_at" > "starts_at"))))
);


--
-- Name: TABLE "clinic_booking_blocks"; Type: COMMENT; Schema: public; Owner: -
--

COMMENT ON TABLE "public"."clinic_booking_blocks" IS 'Staff-managed all-day or partial booking closures.';


--
-- Name: clinic_booking_blocks_block_id_seq; Type: SEQUENCE; Schema: public; Owner: -
--

ALTER TABLE "public"."clinic_booking_blocks" ALTER COLUMN "block_id" ADD GENERATED ALWAYS AS IDENTITY (
    SEQUENCE NAME "public"."clinic_booking_blocks_block_id_seq"
    START WITH 1
    INCREMENT BY 1
    NO MINVALUE
    NO MAXVALUE
    CACHE 1
);


--
-- Name: clinic_booking_hours; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE "public"."clinic_booking_hours" (
    "weekday" smallint NOT NULL,
    "is_open" boolean DEFAULT true NOT NULL,
    "opens_at" time without time zone NOT NULL,
    "closes_at" time without time zone NOT NULL,
    "slot_minutes" smallint DEFAULT 30 NOT NULL,
    "max_bookings" smallint NOT NULL,
    "updated_at" timestamp with time zone DEFAULT "now"() NOT NULL,
    "updated_by" "uuid",
    "clinic_id" "uuid" DEFAULT "private"."myvet_current_clinic_id"() NOT NULL,
    CONSTRAINT "clinic_booking_hours_max_bookings_check" CHECK ((("max_bookings" >= 0) AND ("max_bookings" <= 200))),
    CONSTRAINT "clinic_booking_hours_slot_minutes_check" CHECK ((("slot_minutes" >= 10) AND ("slot_minutes" <= 240))),
    CONSTRAINT "clinic_booking_hours_valid_window" CHECK ((("is_open" AND ("closes_at" > "opens_at") AND ("max_bookings" > 0)) OR ((NOT "is_open") AND ("max_bookings" = 0)))),
    CONSTRAINT "clinic_booking_hours_weekday_check" CHECK ((("weekday" >= 0) AND ("weekday" <= 6)))
);


--
-- Name: TABLE "clinic_booking_hours"; Type: COMMENT; Schema: public; Owner: -
--

COMMENT ON TABLE "public"."clinic_booking_hours" IS 'Staff-managed weekly owner booking hours and daily capacity.';


--
-- Name: clinics; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE "public"."clinics" (
    "clinic_id" "uuid" DEFAULT "gen_random_uuid"() NOT NULL,
    "slug" "text" NOT NULL,
    "display_name" "text" NOT NULL,
    "is_active" boolean DEFAULT true NOT NULL,
    "created_at" timestamp with time zone DEFAULT "now"() NOT NULL,
    "updated_at" timestamp with time zone DEFAULT "now"() NOT NULL,
    CONSTRAINT "clinics_display_name_check" CHECK ((("char_length"("display_name") >= 1) AND ("char_length"("display_name") <= 120))),
    CONSTRAINT "clinics_slug_check" CHECK (("slug" ~ '^[a-z0-9]+(?:-[a-z0-9]+)*$'::"text"))
);


--
-- Name: TABLE "clinics"; Type: COMMENT; Schema: public; Owner: -
--

COMMENT ON TABLE "public"."clinics" IS 'MyVet tenant registry. Browser-supplied clinic_id is never an authorization source.';


--
-- Name: conversations; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE "public"."conversations" (
    "conversation_id" bigint NOT NULL,
    "owner_id" "text" NOT NULL,
    "pet_id" bigint,
    "assigned_staff_id" "uuid",
    "subject" "text" DEFAULT 'פנייה כללית'::"text" NOT NULL,
    "status" "text" DEFAULT 'open'::"text" NOT NULL,
    "priority" "text" DEFAULT 'normal'::"text" NOT NULL,
    "last_message_at" timestamp with time zone,
    "created_at" timestamp with time zone DEFAULT "now"() NOT NULL,
    "updated_at" timestamp with time zone DEFAULT "now"() NOT NULL,
    "closed_at" timestamp with time zone,
    "clinic_id" "uuid" DEFAULT "private"."myvet_current_clinic_id"() NOT NULL,
    CONSTRAINT "conversations_priority_check" CHECK (("priority" = ANY (ARRAY['low'::"text", 'normal'::"text", 'high'::"text", 'urgent'::"text"]))),
    CONSTRAINT "conversations_status_check" CHECK (("status" = ANY (ARRAY['open'::"text", 'waiting_owner'::"text", 'waiting_staff'::"text", 'closed'::"text"])))
);


--
-- Name: conversations_conversation_id_seq; Type: SEQUENCE; Schema: public; Owner: -
--

ALTER TABLE "public"."conversations" ALTER COLUMN "conversation_id" ADD GENERATED BY DEFAULT AS IDENTITY (
    SEQUENCE NAME "public"."conversations_conversation_id_seq"
    START WITH 1
    INCREMENT BY 1
    NO MINVALUE
    NO MAXVALUE
    CACHE 1
);


--
-- Name: differential_diagnoses; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE "public"."differential_diagnoses" (
    "diagnosis_id" bigint NOT NULL,
    "visit_id" bigint,
    "pet_id" bigint NOT NULL,
    "diagnosis_text" "text" NOT NULL,
    "likelihood" "text" DEFAULT 'possible'::"text" NOT NULL,
    "notes" "text",
    "created_at" timestamp with time zone DEFAULT "now"() NOT NULL,
    "clinic_id" "uuid" DEFAULT "private"."myvet_current_clinic_id"() NOT NULL,
    CONSTRAINT "differential_diagnoses_likelihood_check" CHECK (("likelihood" = ANY (ARRAY['low'::"text", 'possible'::"text", 'likely'::"text"])))
);


--
-- Name: differential_diagnoses_diagnosis_id_seq; Type: SEQUENCE; Schema: public; Owner: -
--

ALTER TABLE "public"."differential_diagnoses" ALTER COLUMN "diagnosis_id" ADD GENERATED BY DEFAULT AS IDENTITY (
    SEQUENCE NAME "public"."differential_diagnoses_diagnosis_id_seq"
    START WITH 1
    INCREMENT BY 1
    NO MINVALUE
    NO MAXVALUE
    CACHE 1
);


--
-- Name: documents; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE "public"."documents" (
    "document_id" bigint NOT NULL,
    "owner_id" "text",
    "pet_id" bigint,
    "visit_id" bigint,
    "file_name" "text" NOT NULL,
    "file_path" "text" NOT NULL,
    "file_url" "text",
    "mime_type" "text",
    "file_size" bigint,
    "category" "text" DEFAULT 'other'::"text" NOT NULL,
    "uploaded_by" "uuid",
    "uploaded_by_role" "text" DEFAULT 'staff'::"text",
    "notes" "text",
    "uploaded_at" timestamp with time zone DEFAULT "now"() NOT NULL,
    "clinic_id" "uuid" DEFAULT "private"."myvet_current_clinic_id"() NOT NULL,
    CONSTRAINT "documents_category_check" CHECK (("category" = ANY (ARRAY['vaccination'::"text", 'lab'::"text", 'insurance'::"text", 'prescription'::"text", 'xray'::"text", 'invoice'::"text", 'medical_summary'::"text", 'other'::"text"]))),
    CONSTRAINT "documents_uploaded_by_role_check" CHECK (("uploaded_by_role" = ANY (ARRAY['staff'::"text", 'owner'::"text", 'system'::"text"])))
);


--
-- Name: documents_document_id_seq; Type: SEQUENCE; Schema: public; Owner: -
--

ALTER TABLE "public"."documents" ALTER COLUMN "document_id" ADD GENERATED BY DEFAULT AS IDENTITY (
    SEQUENCE NAME "public"."documents_document_id_seq"
    START WITH 1
    INCREMENT BY 1
    NO MINVALUE
    NO MAXVALUE
    CACHE 1
);


--
-- Name: hospitalizations; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE "public"."hospitalizations" (
    "hospitalization_id" bigint NOT NULL,
    "pet_id" bigint NOT NULL,
    "owner_id" "text",
    "visit_id" bigint,
    "department" "text" DEFAULT 'פנימית'::"text" NOT NULL,
    "cage_or_room" "text",
    "reason" "text" DEFAULT ''::"text" NOT NULL,
    "status" "text" DEFAULT 'active'::"text" NOT NULL,
    "severity" "text" DEFAULT 'normal'::"text" NOT NULL,
    "admitted_at" timestamp with time zone DEFAULT "now"() NOT NULL,
    "expected_discharge_at" timestamp with time zone,
    "discharged_at" timestamp with time zone,
    "vet_name" "text",
    "discharge_summary" "text",
    "notes" "text",
    "created_at" timestamp with time zone DEFAULT "now"() NOT NULL,
    "updated_at" timestamp with time zone DEFAULT "now"() NOT NULL,
    "clinic_id" "uuid" DEFAULT "private"."myvet_current_clinic_id"() NOT NULL,
    CONSTRAINT "hospitalizations_severity_check" CHECK (("severity" = ANY (ARRAY['normal'::"text", 'serious'::"text", 'critical'::"text"]))),
    CONSTRAINT "hospitalizations_status_check" CHECK (("status" = ANY (ARRAY['active'::"text", 'discharged'::"text", 'cancelled'::"text"])))
);


--
-- Name: hospitalizations_hospitalization_id_seq; Type: SEQUENCE; Schema: public; Owner: -
--

ALTER TABLE "public"."hospitalizations" ALTER COLUMN "hospitalization_id" ADD GENERATED BY DEFAULT AS IDENTITY (
    SEQUENCE NAME "public"."hospitalizations_hospitalization_id_seq"
    START WITH 1
    INCREMENT BY 1
    NO MINVALUE
    NO MAXVALUE
    CACHE 1
);


--
-- Name: insights; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE "public"."insights" (
    "insight_id" bigint NOT NULL,
    "title" "text" NOT NULL,
    "description" "text" NOT NULL,
    "category" "text" NOT NULL,
    "severity" "text" DEFAULT 'info'::"text" NOT NULL,
    "status" "text" DEFAULT 'open'::"text" NOT NULL,
    "impact" "text",
    "recommended_action" "text",
    "action_label" "text",
    "action_url" "text",
    "related_owner_id" "text",
    "related_pet_id" bigint,
    "related_payment_id" bigint,
    "related_lab_order_id" bigint,
    "related_appointment_id" bigint,
    "created_at" timestamp with time zone DEFAULT "now"() NOT NULL,
    "resolved_at" timestamp with time zone,
    "notes" "text",
    "clinic_id" "uuid" DEFAULT "private"."myvet_current_clinic_id"() NOT NULL,
    CONSTRAINT "insights_category_check" CHECK (("category" = ANY (ARRAY['payments'::"text", 'inventory'::"text", 'appointments'::"text", 'medical'::"text", 'labs'::"text", 'clients'::"text", 'general'::"text"]))),
    CONSTRAINT "insights_severity_check" CHECK (("severity" = ANY (ARRAY['critical'::"text", 'warning'::"text", 'info'::"text", 'success'::"text"]))),
    CONSTRAINT "insights_status_check" CHECK (("status" = ANY (ARRAY['open'::"text", 'in_progress'::"text", 'resolved'::"text", 'dismissed'::"text"])))
);


--
-- Name: insights_insight_id_seq; Type: SEQUENCE; Schema: public; Owner: -
--

ALTER TABLE "public"."insights" ALTER COLUMN "insight_id" ADD GENERATED BY DEFAULT AS IDENTITY (
    SEQUENCE NAME "public"."insights_insight_id_seq"
    START WITH 1
    INCREMENT BY 1
    NO MINVALUE
    NO MAXVALUE
    CACHE 1
);


--
-- Name: inventory; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE "public"."inventory" (
    "item_id" bigint NOT NULL,
    "item_name" "text",
    "category" "text",
    "stock_quantity" bigint,
    "price" numeric,
    "low_stock_threshold" integer DEFAULT 5 NOT NULL,
    "clinic_id" "uuid" DEFAULT "private"."myvet_current_clinic_id"() NOT NULL,
    CONSTRAINT "inventory_low_stock_threshold_nonnegative" CHECK (("low_stock_threshold" >= 0))
);


--
-- Name: inventory_item_id_seq; Type: SEQUENCE; Schema: public; Owner: -
--

ALTER TABLE "public"."inventory" ALTER COLUMN "item_id" ADD GENERATED ALWAYS AS IDENTITY (
    SEQUENCE NAME "public"."inventory_item_id_seq"
    START WITH 1
    INCREMENT BY 1
    NO MINVALUE
    NO MAXVALUE
    CACHE 1
);


--
-- Name: lab_orders; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE "public"."lab_orders" (
    "lab_order_id" bigint NOT NULL,
    "pet_id" bigint,
    "test_name" "text",
    "category" "text",
    "status" "text",
    "ordered_date" timestamp with time zone DEFAULT "now"(),
    "ordered_by" "uuid",
    "results" "text",
    "normal_range" "text",
    "result_value" "text",
    "result_status" "text",
    "completed_date" timestamp with time zone,
    "notes" "text",
    "is_urgent" boolean,
    "test_date" "date",
    "visit_id" bigint,
    "clinic_id" "uuid" DEFAULT "private"."myvet_current_clinic_id"() NOT NULL
);


--
-- Name: lab_orders_lab_order_id_seq; Type: SEQUENCE; Schema: public; Owner: -
--

ALTER TABLE "public"."lab_orders" ALTER COLUMN "lab_order_id" ADD GENERATED ALWAYS AS IDENTITY (
    SEQUENCE NAME "public"."lab_orders_lab_order_id_seq"
    START WITH 1
    INCREMENT BY 1
    NO MINVALUE
    NO MAXVALUE
    CACHE 1
);


--
-- Name: medical_problems; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE "public"."medical_problems" (
    "problem_id" bigint NOT NULL,
    "visit_id" bigint,
    "pet_id" bigint NOT NULL,
    "problem_text" "text" NOT NULL,
    "severity" "text" DEFAULT 'normal'::"text" NOT NULL,
    "status" "text" DEFAULT 'active'::"text" NOT NULL,
    "notes" "text",
    "created_at" timestamp with time zone DEFAULT "now"() NOT NULL,
    "clinic_id" "uuid" DEFAULT "private"."myvet_current_clinic_id"() NOT NULL,
    CONSTRAINT "medical_problems_severity_check" CHECK (("severity" = ANY (ARRAY['normal'::"text", 'serious'::"text", 'critical'::"text"]))),
    CONSTRAINT "medical_problems_status_check" CHECK (("status" = ANY (ARRAY['active'::"text", 'improved'::"text", 'resolved'::"text"])))
);


--
-- Name: medical_problems_problem_id_seq; Type: SEQUENCE; Schema: public; Owner: -
--

ALTER TABLE "public"."medical_problems" ALTER COLUMN "problem_id" ADD GENERATED BY DEFAULT AS IDENTITY (
    SEQUENCE NAME "public"."medical_problems_problem_id_seq"
    START WITH 1
    INCREMENT BY 1
    NO MINVALUE
    NO MAXVALUE
    CACHE 1
);


--
-- Name: medical_visits; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE "public"."medical_visits" (
    "visit_id" bigint NOT NULL,
    "appointment_id" bigint,
    "pet_id" bigint,
    "visit_date" timestamp with time zone DEFAULT "now"(),
    "vet_name" "text",
    "reason" "text",
    "diagnosis" "text",
    "treatment" "text",
    "notes" "text",
    "attachments" "text",
    "visit_type" "text",
    "urgency_level" "text" DEFAULT 'normal'::"text" NOT NULL,
    "chief_complaint" "text",
    "final_diagnosis" "text",
    "follow_up_required" boolean DEFAULT false NOT NULL,
    "follow_up_notes" "text",
    "entry_data" "jsonb",
    "clinic_id" "uuid" DEFAULT "private"."myvet_current_clinic_id"() NOT NULL,
    CONSTRAINT "medical_visits_urgency_level_check" CHECK (("urgency_level" = ANY (ARRAY['normal'::"text", 'serious'::"text", 'critical'::"text"]))),
    CONSTRAINT "medical_visits_visit_type_check" CHECK ((("visit_type" IS NULL) OR ("visit_type" = ANY (ARRAY['full_exam'::"text", 'vaccination'::"text", 'weight_check'::"text", 'prescription_only'::"text", 'lab'::"text", 'follow_up'::"text", 'note'::"text", 'hospitalization'::"text", 'hospitalization_discharge'::"text", 'video_consultation'::"text"]))))
);


--
-- Name: medical_visits_visit_id_seq; Type: SEQUENCE; Schema: public; Owner: -
--

ALTER TABLE "public"."medical_visits" ALTER COLUMN "visit_id" ADD GENERATED ALWAYS AS IDENTITY (
    SEQUENCE NAME "public"."medical_visits_visit_id_seq"
    START WITH 1
    INCREMENT BY 1
    NO MINVALUE
    NO MAXVALUE
    CACHE 1
);


--
-- Name: message_attachments; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE "public"."message_attachments" (
    "attachment_id" bigint NOT NULL,
    "message_id" bigint,
    "conversation_id" bigint NOT NULL,
    "owner_id" "text",
    "pet_id" bigint,
    "file_name" "text" NOT NULL,
    "file_path" "text" NOT NULL,
    "file_url" "text",
    "mime_type" "text",
    "file_size" bigint,
    "uploaded_by_type" "text" DEFAULT 'staff'::"text" NOT NULL,
    "uploaded_at" timestamp with time zone DEFAULT "now"() NOT NULL,
    "clinic_id" "uuid" DEFAULT "private"."myvet_current_clinic_id"() NOT NULL,
    CONSTRAINT "message_attachments_uploaded_by_type_check" CHECK (("uploaded_by_type" = ANY (ARRAY['owner'::"text", 'staff'::"text", 'system'::"text"])))
);


--
-- Name: message_attachments_attachment_id_seq; Type: SEQUENCE; Schema: public; Owner: -
--

ALTER TABLE "public"."message_attachments" ALTER COLUMN "attachment_id" ADD GENERATED BY DEFAULT AS IDENTITY (
    SEQUENCE NAME "public"."message_attachments_attachment_id_seq"
    START WITH 1
    INCREMENT BY 1
    NO MINVALUE
    NO MAXVALUE
    CACHE 1
);


--
-- Name: messages; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE "public"."messages" (
    "message_id" bigint NOT NULL,
    "conversation_id" bigint NOT NULL,
    "sender_type" "text" NOT NULL,
    "sender_owner_id" "text",
    "sender_staff_id" "uuid",
    "sender_name" "text",
    "message_text" "text",
    "message_type" "text" DEFAULT 'text'::"text" NOT NULL,
    "is_read_by_owner" boolean DEFAULT false NOT NULL,
    "is_read_by_staff" boolean DEFAULT false NOT NULL,
    "created_at" timestamp with time zone DEFAULT "now"() NOT NULL,
    "clinic_id" "uuid" DEFAULT "private"."myvet_current_clinic_id"() NOT NULL,
    CONSTRAINT "messages_message_type_check" CHECK (("message_type" = ANY (ARRAY['text'::"text", 'file'::"text", 'image'::"text", 'video_link'::"text", 'system'::"text"]))),
    CONSTRAINT "messages_sender_type_check" CHECK (("sender_type" = ANY (ARRAY['owner'::"text", 'staff'::"text", 'system'::"text"])))
);


--
-- Name: messages_message_id_seq; Type: SEQUENCE; Schema: public; Owner: -
--

ALTER TABLE "public"."messages" ALTER COLUMN "message_id" ADD GENERATED BY DEFAULT AS IDENTITY (
    SEQUENCE NAME "public"."messages_message_id_seq"
    START WITH 1
    INCREMENT BY 1
    NO MINVALUE
    NO MAXVALUE
    CACHE 1
);


--
-- Name: notifications; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE "public"."notifications" (
    "notification_id" bigint NOT NULL,
    "owner_id" "text",
    "pet_id" bigint,
    "title" "text" NOT NULL,
    "message" "text" NOT NULL,
    "type" "text" DEFAULT 'info'::"text" NOT NULL,
    "target" "text" DEFAULT 'owner'::"text" NOT NULL,
    "is_read" boolean DEFAULT false NOT NULL,
    "action_url" "text",
    "created_at" timestamp with time zone DEFAULT "now"() NOT NULL,
    "read_at" timestamp with time zone,
    "created_by_role" "text",
    "event_type" "text",
    "source_type" "text",
    "source_id" "text",
    "metadata" "jsonb" DEFAULT '{}'::"jsonb" NOT NULL,
    "clinic_id" "uuid" DEFAULT "private"."myvet_current_clinic_id"() NOT NULL,
    CONSTRAINT "notifications_target_check" CHECK (("target" = ANY (ARRAY['owner'::"text", 'staff'::"text", 'both'::"text"]))),
    CONSTRAINT "notifications_type_check" CHECK (("type" = ANY (ARRAY['info'::"text", 'warning'::"text", 'success'::"text", 'payment'::"text", 'appointment'::"text", 'medical'::"text", 'lab'::"text"])))
);


--
-- Name: notifications_notification_id_seq; Type: SEQUENCE; Schema: public; Owner: -
--

ALTER TABLE "public"."notifications" ALTER COLUMN "notification_id" ADD GENERATED BY DEFAULT AS IDENTITY (
    SEQUENCE NAME "public"."notifications_notification_id_seq"
    START WITH 1
    INCREMENT BY 1
    NO MINVALUE
    NO MAXVALUE
    CACHE 1
);


--
-- Name: owners; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE "public"."owners" (
    "owner_id" "text" NOT NULL,
    "created_at" timestamp with time zone DEFAULT "now"() NOT NULL,
    "owner_last_name" "text",
    "phone" "text",
    "email" "text",
    "address" "text",
    "owner_first_name" "text",
    "auth_user_id" "uuid",
    "terms_accepted_at" timestamp with time zone,
    "terms_version" "text",
    "clinic_id" "uuid" DEFAULT "private"."myvet_current_clinic_id"() NOT NULL
);


--
-- Name: TABLE "owners"; Type: COMMENT; Schema: public; Owner: -
--

COMMENT ON TABLE "public"."owners" IS 'בעלים';


--
-- Name: patients; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE "public"."patients" (
    "pet_id" bigint NOT NULL,
    "created_at" timestamp with time zone DEFAULT "now"() NOT NULL,
    "pet_name" "text",
    "species" "text",
    "breed" "text",
    "gender" "text",
    "birth_date" "date",
    "microchip" "text",
    "allergies" "text",
    "weight" numeric NOT NULL,
    "owner_id" "text" NOT NULL,
    "neutered_status" "text" DEFAULT 'unknown'::"text" NOT NULL,
    "clinic_id" "uuid" DEFAULT "private"."myvet_current_clinic_id"() NOT NULL,
    CONSTRAINT "patients_neutered_status_check" CHECK (("neutered_status" = ANY (ARRAY['unknown'::"text", 'yes'::"text", 'no'::"text"])))
);


--
-- Name: TABLE "patients"; Type: COMMENT; Schema: public; Owner: -
--

COMMENT ON TABLE "public"."patients" IS 'טבלת מטופלים';


--
-- Name: patients_id_pet_seq; Type: SEQUENCE; Schema: public; Owner: -
--

ALTER TABLE "public"."patients" ALTER COLUMN "pet_id" ADD GENERATED BY DEFAULT AS IDENTITY (
    SEQUENCE NAME "public"."patients_id_pet_seq"
    START WITH 1
    INCREMENT BY 1
    NO MINVALUE
    NO MAXVALUE
    CACHE 1
);


--
-- Name: payment_items; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE "public"."payment_items" (
    "payment_item_id" bigint NOT NULL,
    "payment_id" bigint NOT NULL,
    "visit_id" bigint,
    "item_type" "text" DEFAULT 'manual'::"text" NOT NULL,
    "item_name" "text" NOT NULL,
    "quantity" numeric(10,2) DEFAULT 1 NOT NULL,
    "unit_price" numeric(10,2) DEFAULT 0 NOT NULL,
    "discount" numeric(10,2) DEFAULT 0 NOT NULL,
    "total_price" numeric(10,2) DEFAULT 0 NOT NULL,
    "source_type" "text",
    "source_id" "text",
    "notes" "text",
    "created_at" timestamp with time zone DEFAULT "now"() NOT NULL,
    "clinic_id" "uuid" DEFAULT "private"."myvet_current_clinic_id"() NOT NULL,
    CONSTRAINT "payment_items_discount_check" CHECK (("discount" >= (0)::numeric)),
    CONSTRAINT "payment_items_quantity_check" CHECK (("quantity" > (0)::numeric)),
    CONSTRAINT "payment_items_total_price_check" CHECK (("total_price" >= (0)::numeric)),
    CONSTRAINT "payment_items_unit_price_check" CHECK (("unit_price" >= (0)::numeric))
);


--
-- Name: payment_items_payment_item_id_seq; Type: SEQUENCE; Schema: public; Owner: -
--

ALTER TABLE "public"."payment_items" ALTER COLUMN "payment_item_id" ADD GENERATED BY DEFAULT AS IDENTITY (
    SEQUENCE NAME "public"."payment_items_payment_item_id_seq"
    START WITH 1
    INCREMENT BY 1
    NO MINVALUE
    NO MAXVALUE
    CACHE 1
);


--
-- Name: payment_transactions; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE "public"."payment_transactions" (
    "transaction_id" bigint NOT NULL,
    "payment_id" bigint NOT NULL,
    "owner_id" "text" NOT NULL,
    "amount" numeric(12,2) NOT NULL,
    "payment_method" "text" NOT NULL,
    "tendered_amount" numeric(12,2),
    "change_amount" numeric(12,2) DEFAULT 0 NOT NULL,
    "source" "text" NOT NULL,
    "processed_by" "uuid" DEFAULT "auth"."uid"() NOT NULL,
    "created_at" timestamp with time zone DEFAULT "now"() NOT NULL,
    "clinic_id" "uuid" DEFAULT "private"."myvet_current_clinic_id"() NOT NULL,
    CONSTRAINT "payment_transactions_amount_check" CHECK (("amount" >= (0)::numeric)),
    CONSTRAINT "payment_transactions_change_amount_check" CHECK (("change_amount" >= (0)::numeric)),
    CONSTRAINT "payment_transactions_payment_method_check" CHECK (("payment_method" = ANY (ARRAY['cash'::"text", 'credit'::"text", 'bit'::"text", 'bank_transfer'::"text", 'other'::"text", 'portal_demo'::"text"]))),
    CONSTRAINT "payment_transactions_source_check" CHECK (("source" = ANY (ARRAY['owner_portal_demo'::"text", 'staff'::"text"]))),
    CONSTRAINT "payment_transactions_tendered_amount_check" CHECK ((("tendered_amount" IS NULL) OR ("tendered_amount" >= (0)::numeric)))
);


--
-- Name: payment_transactions_transaction_id_seq; Type: SEQUENCE; Schema: public; Owner: -
--

ALTER TABLE "public"."payment_transactions" ALTER COLUMN "transaction_id" ADD GENERATED BY DEFAULT AS IDENTITY (
    SEQUENCE NAME "public"."payment_transactions_transaction_id_seq"
    START WITH 1
    INCREMENT BY 1
    NO MINVALUE
    NO MAXVALUE
    CACHE 1
);


--
-- Name: payments; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE "public"."payments" (
    "payment_id" bigint NOT NULL,
    "owner_id" "text" NOT NULL,
    "pet_id" bigint,
    "visit_id" bigint,
    "appointment_id" bigint,
    "amount" numeric(10,2) NOT NULL,
    "status" "text" DEFAULT 'unpaid'::"text" NOT NULL,
    "payment_method" "text",
    "paid_at" timestamp with time zone,
    "due_date" "date",
    "notes" "text",
    "created_at" timestamp with time zone DEFAULT "now"() NOT NULL,
    "clinic_id" "uuid" DEFAULT "private"."myvet_current_clinic_id"() NOT NULL,
    CONSTRAINT "payments_amount_check" CHECK (("amount" >= (0)::numeric)),
    CONSTRAINT "payments_payment_method_check" CHECK (("payment_method" = ANY (ARRAY['cash'::"text", 'credit'::"text", 'bit'::"text", 'bank_transfer'::"text", 'other'::"text"]))),
    CONSTRAINT "payments_status_check" CHECK (("status" = ANY (ARRAY['unpaid'::"text", 'paid'::"text", 'partial'::"text", 'cancelled'::"text", 'refunded'::"text"])))
);


--
-- Name: payments_payment_id_seq; Type: SEQUENCE; Schema: public; Owner: -
--

ALTER TABLE "public"."payments" ALTER COLUMN "payment_id" ADD GENERATED BY DEFAULT AS IDENTITY (
    SEQUENCE NAME "public"."payments_payment_id_seq"
    START WITH 1
    INCREMENT BY 1
    NO MINVALUE
    NO MAXVALUE
    CACHE 1
);


--
-- Name: physical_exams; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE "public"."physical_exams" (
    "physical_exam_id" bigint NOT NULL,
    "visit_id" bigint,
    "pet_id" bigint NOT NULL,
    "exam_date" timestamp with time zone DEFAULT "now"() NOT NULL,
    "findings" "text" DEFAULT ''::"text" NOT NULL,
    "created_at" timestamp with time zone DEFAULT "now"() NOT NULL,
    "updated_at" timestamp with time zone DEFAULT "now"() NOT NULL,
    "clinic_id" "uuid" DEFAULT "private"."myvet_current_clinic_id"() NOT NULL
);


--
-- Name: physical_exams_physical_exam_id_seq; Type: SEQUENCE; Schema: public; Owner: -
--

ALTER TABLE "public"."physical_exams" ALTER COLUMN "physical_exam_id" ADD GENERATED BY DEFAULT AS IDENTITY (
    SEQUENCE NAME "public"."physical_exams_physical_exam_id_seq"
    START WITH 1
    INCREMENT BY 1
    NO MINVALUE
    NO MAXVALUE
    CACHE 1
);


--
-- Name: prescriptions; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE "public"."prescriptions" (
    "prescription_id" bigint NOT NULL,
    "visit_id" bigint,
    "pet_id" bigint,
    "medication" "text",
    "dosage" "text",
    "frequency" "text",
    "duration" "text",
    "start_date" "date",
    "prescribed_by" "uuid",
    "clinic_id" "uuid" DEFAULT "private"."myvet_current_clinic_id"() NOT NULL
);


--
-- Name: prescriptions_prescription_id_seq; Type: SEQUENCE; Schema: public; Owner: -
--

ALTER TABLE "public"."prescriptions" ALTER COLUMN "prescription_id" ADD GENERATED ALWAYS AS IDENTITY (
    SEQUENCE NAME "public"."prescriptions_prescription_id_seq"
    START WITH 1
    INCREMENT BY 1
    NO MINVALUE
    NO MAXVALUE
    CACHE 1
);


--
-- Name: reminders; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE "public"."reminders" (
    "reminder_id" bigint NOT NULL,
    "owner_id" "text",
    "pet_id" bigint,
    "appointment_id" bigint,
    "visit_id" bigint,
    "title" "text" NOT NULL,
    "message" "text",
    "reminder_type" "text" DEFAULT 'general'::"text" NOT NULL,
    "due_at" timestamp with time zone NOT NULL,
    "status" "text" DEFAULT 'open'::"text" NOT NULL,
    "created_at" timestamp with time zone DEFAULT "now"() NOT NULL,
    "completed_at" timestamp with time zone,
    "notes" "text",
    "action_url" "text",
    "is_read" boolean DEFAULT false NOT NULL,
    "read_at" timestamp with time zone,
    "source_type" "text",
    "source_id" "text",
    "metadata" "jsonb" DEFAULT '{}'::"jsonb" NOT NULL,
    "clinic_id" "uuid" DEFAULT "private"."myvet_current_clinic_id"() NOT NULL,
    CONSTRAINT "reminders_reminder_type_check" CHECK (("reminder_type" = ANY (ARRAY['vaccine'::"text", 'appointment'::"text", 'payment'::"text", 'follow_up'::"text", 'lab_result'::"text", 'medication'::"text", 'general'::"text"]))),
    CONSTRAINT "reminders_status_check" CHECK (("status" = ANY (ARRAY['open'::"text", 'sent'::"text", 'done'::"text", 'cancelled'::"text"])))
);


--
-- Name: reminders_reminder_id_seq; Type: SEQUENCE; Schema: public; Owner: -
--

ALTER TABLE "public"."reminders" ALTER COLUMN "reminder_id" ADD GENERATED BY DEFAULT AS IDENTITY (
    SEQUENCE NAME "public"."reminders_reminder_id_seq"
    START WITH 1
    INCREMENT BY 1
    NO MINVALUE
    NO MAXVALUE
    CACHE 1
);


--
-- Name: service_catalog; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE "public"."service_catalog" (
    "service_id" bigint NOT NULL,
    "service_code" "text" NOT NULL,
    "service_name" "text" NOT NULL,
    "category" "text" DEFAULT 'שירות כללי'::"text" NOT NULL,
    "default_price" numeric(10,2) DEFAULT 0 NOT NULL,
    "is_active" boolean DEFAULT true NOT NULL,
    "created_at" timestamp with time zone DEFAULT "now"() NOT NULL,
    "updated_at" timestamp with time zone DEFAULT "now"() NOT NULL,
    "clinic_id" "uuid" DEFAULT "private"."myvet_current_clinic_id"() NOT NULL,
    CONSTRAINT "service_catalog_default_price_check" CHECK (("default_price" >= (0)::numeric))
);


--
-- Name: service_catalog_service_id_seq; Type: SEQUENCE; Schema: public; Owner: -
--

ALTER TABLE "public"."service_catalog" ALTER COLUMN "service_id" ADD GENERATED BY DEFAULT AS IDENTITY (
    SEQUENCE NAME "public"."service_catalog_service_id_seq"
    START WITH 1
    INCREMENT BY 1
    NO MINVALUE
    NO MAXVALUE
    CACHE 1
);


--
-- Name: staff; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE "public"."staff" (
    "staff_id" "uuid" DEFAULT "gen_random_uuid"() NOT NULL,
    "name" "text",
    "role" "text",
    "license_no" "text",
    "certification_level" "text",
    "auth_user_id" "uuid",
    "email" "text",
    "full_name" "text",
    "is_active" boolean DEFAULT true NOT NULL,
    "created_at" timestamp with time zone DEFAULT "now"() NOT NULL,
    "clinic_id" "uuid" DEFAULT "private"."myvet_current_clinic_id"() NOT NULL,
    CONSTRAINT "staff_role_check" CHECK (("role" = ANY (ARRAY['clinic_admin'::"text", 'vet'::"text", 'nurse'::"text", 'secretary'::"text"])))
);


--
-- Name: vaccinations; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE "public"."vaccinations" (
    "vaccination_id" "uuid" DEFAULT "gen_random_uuid"() NOT NULL,
    "pet_id" bigint NOT NULL,
    "owner_id" "text",
    "visit_id" bigint,
    "vaccine_name" "text" NOT NULL,
    "vaccine_type" "text",
    "manufacturer" "text",
    "batch_number" "text",
    "barcode_value" "text",
    "given_date" "date" DEFAULT CURRENT_DATE NOT NULL,
    "next_due_date" "date",
    "expiry_date" "date",
    "administered_by" "text",
    "entry_method" "text" DEFAULT 'manual'::"text" NOT NULL,
    "sticker_image_path" "text",
    "sticker_image_url" "text",
    "notes" "text",
    "created_at" timestamp with time zone DEFAULT "now"() NOT NULL,
    "updated_at" timestamp with time zone DEFAULT "now"() NOT NULL,
    "clinic_id" "uuid" DEFAULT "private"."myvet_current_clinic_id"() NOT NULL,
    CONSTRAINT "vaccinations_entry_method_check" CHECK (("entry_method" = ANY (ARRAY['manual'::"text", 'barcode'::"text", 'photo'::"text"])))
);


--
-- Name: vetbot_action_requests; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE "public"."vetbot_action_requests" (
    "action_request_id" "uuid" DEFAULT "gen_random_uuid"() NOT NULL,
    "actor_id" "uuid" NOT NULL,
    "actor_role" "text" NOT NULL,
    "action_type" "text" NOT NULL,
    "payload" "jsonb" DEFAULT '{}'::"jsonb" NOT NULL,
    "preview" "jsonb" DEFAULT '{}'::"jsonb" NOT NULL,
    "status" "text" DEFAULT 'pending'::"text" NOT NULL,
    "result" "jsonb",
    "error_code" "text",
    "created_at" timestamp with time zone DEFAULT "now"() NOT NULL,
    "expires_at" timestamp with time zone DEFAULT ("now"() + '00:10:00'::interval) NOT NULL,
    "confirmed_at" timestamp with time zone,
    "executed_at" timestamp with time zone,
    "clinic_id" "uuid" DEFAULT "private"."myvet_current_clinic_id"() NOT NULL,
    CONSTRAINT "vetbot_action_requests_action_type_check" CHECK (("action_type" = ANY (ARRAY['book_appointment'::"text", 'reschedule_appointment'::"text", 'cancel_appointment'::"text", 'adjust_inventory'::"text", 'create_inventory_item'::"text", 'archive_conversation'::"text", 'restore_conversation'::"text", 'set_conversation_priority'::"text", 'set_lab_urgency'::"text", 'block_booking_time'::"text"]))),
    CONSTRAINT "vetbot_action_requests_actor_role_check" CHECK (("actor_role" = ANY (ARRAY['clinic_admin'::"text", 'vet'::"text", 'nurse'::"text", 'secretary'::"text", 'owner'::"text"]))),
    CONSTRAINT "vetbot_action_requests_status_check" CHECK (("status" = ANY (ARRAY['pending'::"text", 'executed'::"text", 'rejected'::"text", 'expired'::"text", 'failed'::"text"])))
);


--
-- Name: TABLE "vetbot_action_requests"; Type: COMMENT; Schema: public; Owner: -
--

COMMENT ON TABLE "public"."vetbot_action_requests" IS 'Short-lived, server-created VetBot action previews. Payloads are never sent back to the browser; execution requires the same authenticated actor and a fresh role check.';


--
-- Name: vetbot_audit_logs; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE "public"."vetbot_audit_logs" (
    "audit_id" bigint NOT NULL,
    "actor_id" "uuid" DEFAULT "auth"."uid"() NOT NULL,
    "actor_role" "text" NOT NULL,
    "mode" "text" NOT NULL,
    "tool_names" "text"[] DEFAULT '{}'::"text"[] NOT NULL,
    "redaction_categories" "text"[] DEFAULT '{}'::"text"[] NOT NULL,
    "redaction_count" integer DEFAULT 0 NOT NULL,
    "outcome" "text" NOT NULL,
    "provider" "text" DEFAULT 'gemini'::"text" NOT NULL,
    "model_name" "text",
    "notice_version" "text" NOT NULL,
    "error_code" "text",
    "created_at" timestamp with time zone DEFAULT "now"() NOT NULL,
    "clinic_id" "uuid" DEFAULT "private"."myvet_current_clinic_id"() NOT NULL,
    "request_id" "uuid",
    "prompt_version" "text",
    "schema_version" "text",
    "latency_ms" integer,
    "input_tokens" integer,
    "output_tokens" integer,
    CONSTRAINT "vetbot_audit_input_tokens_nonnegative" CHECK ((("input_tokens" IS NULL) OR ("input_tokens" >= 0))),
    CONSTRAINT "vetbot_audit_latency_nonnegative" CHECK ((("latency_ms" IS NULL) OR ("latency_ms" >= 0))),
    CONSTRAINT "vetbot_audit_logs_actor_role_check" CHECK (("actor_role" = ANY (ARRAY['clinic_admin'::"text", 'vet'::"text", 'nurse'::"text", 'secretary'::"text", 'owner'::"text"]))),
    CONSTRAINT "vetbot_audit_logs_mode_check" CHECK (("mode" = ANY (ARRAY['dashboard'::"text", 'schedule'::"text", 'digital-care'::"text", 'inventory'::"text", 'medical-record'::"text", 'clients'::"text", 'reports'::"text", 'portal'::"text"]))),
    CONSTRAINT "vetbot_audit_logs_outcome_check" CHECK (("outcome" = ANY (ARRAY['success'::"text", 'failed'::"text", 'blocked'::"text"]))),
    CONSTRAINT "vetbot_audit_logs_redaction_count_check" CHECK (("redaction_count" >= 0)),
    CONSTRAINT "vetbot_audit_output_tokens_nonnegative" CHECK ((("output_tokens" IS NULL) OR ("output_tokens" >= 0)))
);


--
-- Name: TABLE "vetbot_audit_logs"; Type: COMMENT; Schema: public; Owner: -
--

COMMENT ON TABLE "public"."vetbot_audit_logs" IS 'Metadata-only VetBot audit trail. Retain for at least 24 months when Regulation 10 applies; do not add prompt or response columns.';


--
-- Name: vetbot_audit_logs_audit_id_seq; Type: SEQUENCE; Schema: public; Owner: -
--

ALTER TABLE "public"."vetbot_audit_logs" ALTER COLUMN "audit_id" ADD GENERATED BY DEFAULT AS IDENTITY (
    SEQUENCE NAME "public"."vetbot_audit_logs_audit_id_seq"
    START WITH 1
    INCREMENT BY 1
    NO MINVALUE
    NO MAXVALUE
    CACHE 1
);


--
-- Name: vetbot_feedback; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE "public"."vetbot_feedback" (
    "feedback_id" bigint NOT NULL,
    "actor_id" "uuid" DEFAULT "auth"."uid"() NOT NULL,
    "mode" "text" NOT NULL,
    "helpful" boolean NOT NULL,
    "used_tools" "text"[] DEFAULT '{}'::"text"[] NOT NULL,
    "notice_version" "text" NOT NULL,
    "created_at" timestamp with time zone DEFAULT "now"() NOT NULL,
    "clinic_id" "uuid" DEFAULT "private"."myvet_current_clinic_id"() NOT NULL,
    CONSTRAINT "vetbot_feedback_mode_check" CHECK (("mode" = ANY (ARRAY['dashboard'::"text", 'schedule'::"text", 'digital-care'::"text", 'inventory'::"text", 'medical-record'::"text", 'clients'::"text", 'reports'::"text", 'portal'::"text"])))
);


--
-- Name: vetbot_feedback_feedback_id_seq; Type: SEQUENCE; Schema: public; Owner: -
--

ALTER TABLE "public"."vetbot_feedback" ALTER COLUMN "feedback_id" ADD GENERATED BY DEFAULT AS IDENTITY (
    SEQUENCE NAME "public"."vetbot_feedback_feedback_id_seq"
    START WITH 1
    INCREMENT BY 1
    NO MINVALUE
    NO MAXVALUE
    CACHE 1
);


--
-- Name: vetbot_knowledge; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE "public"."vetbot_knowledge" (
    "knowledge_id" bigint NOT NULL,
    "slug" "text" NOT NULL,
    "title" "text" NOT NULL,
    "content" "text" NOT NULL,
    "source_label" "text" DEFAULT 'נוהל מרפאה'::"text" NOT NULL,
    "is_active" boolean DEFAULT true NOT NULL,
    "created_by" "uuid" DEFAULT "auth"."uid"(),
    "created_at" timestamp with time zone DEFAULT "now"() NOT NULL,
    "updated_at" timestamp with time zone DEFAULT "now"() NOT NULL,
    "clinic_id" "uuid" DEFAULT "private"."myvet_current_clinic_id"() NOT NULL,
    CONSTRAINT "vetbot_knowledge_no_contact" CHECK ((("content" !~* '[A-Z0-9._%+-]+@[A-Z0-9.-]+\.[A-Z]{2,}'::"text") AND ("content" !~ '05[0-9][ -]?[0-9]{3}[ -]?[0-9]{4}'::"text")))
);


--
-- Name: TABLE "vetbot_knowledge"; Type: COMMENT; Schema: public; Owner: -
--

COMMENT ON TABLE "public"."vetbot_knowledge" IS 'Non-personal clinic knowledge only. Do not store owner, staff or patient identifiers.';


--
-- Name: vetbot_knowledge_knowledge_id_seq; Type: SEQUENCE; Schema: public; Owner: -
--

ALTER TABLE "public"."vetbot_knowledge" ALTER COLUMN "knowledge_id" ADD GENERATED BY DEFAULT AS IDENTITY (
    SEQUENCE NAME "public"."vetbot_knowledge_knowledge_id_seq"
    START WITH 1
    INCREMENT BY 1
    NO MINVALUE
    NO MAXVALUE
    CACHE 1
);


--
-- Name: video_sessions; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE "public"."video_sessions" (
    "session_id" bigint NOT NULL,
    "conversation_id" bigint,
    "owner_id" "text",
    "pet_id" bigint,
    "staff_id" "uuid",
    "meeting_url" "text",
    "status" "text" DEFAULT 'scheduled'::"text" NOT NULL,
    "scheduled_at" timestamp with time zone,
    "started_at" timestamp with time zone,
    "ended_at" timestamp with time zone,
    "notes" "text",
    "created_at" timestamp with time zone DEFAULT "now"() NOT NULL,
    "clinic_id" "uuid" DEFAULT "private"."myvet_current_clinic_id"() NOT NULL,
    "appointment_id" bigint,
    "visit_id" bigint,
    "transcription_status" "text" DEFAULT 'idle'::"text" NOT NULL,
    "recording_status" "text" DEFAULT 'disabled'::"text" NOT NULL,
    "recording_document_id" "uuid",
    "transcript_artifact_id" "uuid",
    "consent_notice_version" "text",
    "ai_updated_at" timestamp with time zone,
    CONSTRAINT "video_sessions_recording_status_check" CHECK (("recording_status" = ANY (ARRAY['disabled'::"text", 'consent_pending'::"text", 'recording'::"text", 'stored'::"text", 'failed'::"text", 'deleted'::"text"]))),
    CONSTRAINT "video_sessions_status_check" CHECK (("status" = ANY (ARRAY['scheduled'::"text", 'active'::"text", 'completed'::"text", 'cancelled'::"text"]))),
    CONSTRAINT "video_sessions_transcription_status_check" CHECK (("transcription_status" = ANY (ARRAY['idle'::"text", 'consent_pending'::"text", 'capturing'::"text", 'processing'::"text", 'ready'::"text", 'failed'::"text", 'deleted'::"text"])))
);


--
-- Name: video_sessions_session_id_seq; Type: SEQUENCE; Schema: public; Owner: -
--

ALTER TABLE "public"."video_sessions" ALTER COLUMN "session_id" ADD GENERATED BY DEFAULT AS IDENTITY (
    SEQUENCE NAME "public"."video_sessions_session_id_seq"
    START WITH 1
    INCREMENT BY 1
    NO MINVALUE
    NO MAXVALUE
    CACHE 1
);


--
-- Name: ai_approval_history ai_approval_history_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY "public"."ai_approval_history"
    ADD CONSTRAINT "ai_approval_history_pkey" PRIMARY KEY ("approval_event_id");


--
-- Name: ai_artifacts ai_artifacts_clinic_id_artifact_id_key; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY "public"."ai_artifacts"
    ADD CONSTRAINT "ai_artifacts_clinic_id_artifact_id_key" UNIQUE ("clinic_id", "artifact_id");


--
-- Name: ai_artifacts ai_artifacts_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY "public"."ai_artifacts"
    ADD CONSTRAINT "ai_artifacts_pkey" PRIMARY KEY ("artifact_id");


--
-- Name: ai_audit_events ai_audit_events_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY "public"."ai_audit_events"
    ADD CONSTRAINT "ai_audit_events_pkey" PRIMARY KEY ("audit_event_id");


--
-- Name: ai_consent_records ai_consent_records_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY "public"."ai_consent_records"
    ADD CONSTRAINT "ai_consent_records_pkey" PRIMARY KEY ("consent_id");


--
-- Name: ai_document_chunks ai_document_chunks_clinic_id_chunk_id_key; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY "public"."ai_document_chunks"
    ADD CONSTRAINT "ai_document_chunks_clinic_id_chunk_id_key" UNIQUE ("clinic_id", "chunk_id");


--
-- Name: ai_document_chunks ai_document_chunks_document_id_chunk_index_key; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY "public"."ai_document_chunks"
    ADD CONSTRAINT "ai_document_chunks_document_id_chunk_index_key" UNIQUE ("document_id", "chunk_index");


--
-- Name: ai_document_chunks ai_document_chunks_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY "public"."ai_document_chunks"
    ADD CONSTRAINT "ai_document_chunks_pkey" PRIMARY KEY ("chunk_id");


--
-- Name: ai_document_embeddings ai_document_embeddings_chunk_id_model_version_embedding_has_key; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY "public"."ai_document_embeddings"
    ADD CONSTRAINT "ai_document_embeddings_chunk_id_model_version_embedding_has_key" UNIQUE ("chunk_id", "model_version", "embedding_hash");


--
-- Name: ai_document_embeddings ai_document_embeddings_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY "public"."ai_document_embeddings"
    ADD CONSTRAINT "ai_document_embeddings_pkey" PRIMARY KEY ("embedding_id");


--
-- Name: ai_documents ai_documents_bucket_id_object_path_key; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY "public"."ai_documents"
    ADD CONSTRAINT "ai_documents_bucket_id_object_path_key" UNIQUE ("bucket_id", "object_path");


--
-- Name: ai_documents ai_documents_clinic_id_document_id_key; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY "public"."ai_documents"
    ADD CONSTRAINT "ai_documents_clinic_id_document_id_key" UNIQUE ("clinic_id", "document_id");


--
-- Name: ai_documents ai_documents_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY "public"."ai_documents"
    ADD CONSTRAINT "ai_documents_pkey" PRIMARY KEY ("document_id");


--
-- Name: ai_feature_flags ai_feature_flags_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY "public"."ai_feature_flags"
    ADD CONSTRAINT "ai_feature_flags_pkey" PRIMARY KEY ("clinic_id", "capability");


--
-- Name: ai_operations ai_operations_clinic_id_operation_id_key; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY "public"."ai_operations"
    ADD CONSTRAINT "ai_operations_clinic_id_operation_id_key" UNIQUE ("clinic_id", "operation_id");


--
-- Name: ai_operations ai_operations_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY "public"."ai_operations"
    ADD CONSTRAINT "ai_operations_pkey" PRIMARY KEY ("operation_id");


--
-- Name: ai_rate_limit_windows ai_rate_limit_windows_clinic_id_actor_user_id_capability_wi_key; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY "public"."ai_rate_limit_windows"
    ADD CONSTRAINT "ai_rate_limit_windows_clinic_id_actor_user_id_capability_wi_key" UNIQUE ("clinic_id", "actor_user_id", "capability", "window_started_at");


--
-- Name: ai_rate_limit_windows ai_rate_limit_windows_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY "public"."ai_rate_limit_windows"
    ADD CONSTRAINT "ai_rate_limit_windows_pkey" PRIMARY KEY ("rate_limit_id");


--
-- Name: ai_sources ai_sources_artifact_id_source_type_source_record_id_key; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY "public"."ai_sources"
    ADD CONSTRAINT "ai_sources_artifact_id_source_type_source_record_id_key" UNIQUE ("artifact_id", "source_type", "source_record_id");


--
-- Name: ai_sources ai_sources_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY "public"."ai_sources"
    ADD CONSTRAINT "ai_sources_pkey" PRIMARY KEY ("source_id");


--
-- Name: appointments appointments_clinic_appointment_key; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY "public"."appointments"
    ADD CONSTRAINT "appointments_clinic_appointment_key" UNIQUE ("clinic_id", "appointment_id");


--
-- Name: appointments appointments_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY "public"."appointments"
    ADD CONSTRAINT "appointments_pkey" PRIMARY KEY ("appointment_id");


--
-- Name: clinic_booking_blocks clinic_booking_blocks_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY "public"."clinic_booking_blocks"
    ADD CONSTRAINT "clinic_booking_blocks_pkey" PRIMARY KEY ("block_id");


--
-- Name: clinic_booking_hours clinic_booking_hours_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY "public"."clinic_booking_hours"
    ADD CONSTRAINT "clinic_booking_hours_pkey" PRIMARY KEY ("clinic_id", "weekday");


--
-- Name: clinics clinics_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY "public"."clinics"
    ADD CONSTRAINT "clinics_pkey" PRIMARY KEY ("clinic_id");


--
-- Name: clinics clinics_slug_key; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY "public"."clinics"
    ADD CONSTRAINT "clinics_slug_key" UNIQUE ("slug");


--
-- Name: conversations conversations_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY "public"."conversations"
    ADD CONSTRAINT "conversations_pkey" PRIMARY KEY ("conversation_id");


--
-- Name: differential_diagnoses differential_diagnoses_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY "public"."differential_diagnoses"
    ADD CONSTRAINT "differential_diagnoses_pkey" PRIMARY KEY ("diagnosis_id");


--
-- Name: documents documents_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY "public"."documents"
    ADD CONSTRAINT "documents_pkey" PRIMARY KEY ("document_id");


--
-- Name: hospitalizations hospitalizations_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY "public"."hospitalizations"
    ADD CONSTRAINT "hospitalizations_pkey" PRIMARY KEY ("hospitalization_id");


--
-- Name: insights insights_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY "public"."insights"
    ADD CONSTRAINT "insights_pkey" PRIMARY KEY ("insight_id");


--
-- Name: inventory inventory_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY "public"."inventory"
    ADD CONSTRAINT "inventory_pkey" PRIMARY KEY ("item_id");


--
-- Name: lab_orders lab_orders_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY "public"."lab_orders"
    ADD CONSTRAINT "lab_orders_pkey" PRIMARY KEY ("lab_order_id");


--
-- Name: medical_problems medical_problems_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY "public"."medical_problems"
    ADD CONSTRAINT "medical_problems_pkey" PRIMARY KEY ("problem_id");


--
-- Name: medical_visits medical_visits_clinic_visit_key; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY "public"."medical_visits"
    ADD CONSTRAINT "medical_visits_clinic_visit_key" UNIQUE ("clinic_id", "visit_id");


--
-- Name: medical_visits medical_visits_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY "public"."medical_visits"
    ADD CONSTRAINT "medical_visits_pkey" PRIMARY KEY ("visit_id");


--
-- Name: message_attachments message_attachments_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY "public"."message_attachments"
    ADD CONSTRAINT "message_attachments_pkey" PRIMARY KEY ("attachment_id");


--
-- Name: messages messages_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY "public"."messages"
    ADD CONSTRAINT "messages_pkey" PRIMARY KEY ("message_id");


--
-- Name: notifications notifications_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY "public"."notifications"
    ADD CONSTRAINT "notifications_pkey" PRIMARY KEY ("notification_id");


--
-- Name: owners owners_auth_user_id_key; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY "public"."owners"
    ADD CONSTRAINT "owners_auth_user_id_key" UNIQUE ("auth_user_id");


--
-- Name: owners owners_clinic_owner_key; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY "public"."owners"
    ADD CONSTRAINT "owners_clinic_owner_key" UNIQUE ("clinic_id", "owner_id");


--
-- Name: owners owners_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY "public"."owners"
    ADD CONSTRAINT "owners_pkey" PRIMARY KEY ("owner_id");


--
-- Name: patients patients_clinic_pet_key; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY "public"."patients"
    ADD CONSTRAINT "patients_clinic_pet_key" UNIQUE ("clinic_id", "pet_id");


--
-- Name: patients patients_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY "public"."patients"
    ADD CONSTRAINT "patients_pkey" PRIMARY KEY ("pet_id");


--
-- Name: payment_items payment_items_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY "public"."payment_items"
    ADD CONSTRAINT "payment_items_pkey" PRIMARY KEY ("payment_item_id");


--
-- Name: payment_transactions payment_transactions_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY "public"."payment_transactions"
    ADD CONSTRAINT "payment_transactions_pkey" PRIMARY KEY ("transaction_id");


--
-- Name: payments payments_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY "public"."payments"
    ADD CONSTRAINT "payments_pkey" PRIMARY KEY ("payment_id");


--
-- Name: physical_exams physical_exams_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY "public"."physical_exams"
    ADD CONSTRAINT "physical_exams_pkey" PRIMARY KEY ("physical_exam_id");


--
-- Name: prescriptions prescriptions_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY "public"."prescriptions"
    ADD CONSTRAINT "prescriptions_pkey" PRIMARY KEY ("prescription_id");


--
-- Name: reminders reminders_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY "public"."reminders"
    ADD CONSTRAINT "reminders_pkey" PRIMARY KEY ("reminder_id");


--
-- Name: service_catalog service_catalog_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY "public"."service_catalog"
    ADD CONSTRAINT "service_catalog_pkey" PRIMARY KEY ("service_id");


--
-- Name: service_catalog service_catalog_service_code_key; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY "public"."service_catalog"
    ADD CONSTRAINT "service_catalog_service_code_key" UNIQUE ("service_code");


--
-- Name: staff staff_clinic_staff_key; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY "public"."staff"
    ADD CONSTRAINT "staff_clinic_staff_key" UNIQUE ("clinic_id", "staff_id");


--
-- Name: staff staff_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY "public"."staff"
    ADD CONSTRAINT "staff_pkey" PRIMARY KEY ("staff_id");


--
-- Name: vaccinations vaccinations_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY "public"."vaccinations"
    ADD CONSTRAINT "vaccinations_pkey" PRIMARY KEY ("vaccination_id");


--
-- Name: vetbot_action_requests vetbot_action_requests_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY "public"."vetbot_action_requests"
    ADD CONSTRAINT "vetbot_action_requests_pkey" PRIMARY KEY ("action_request_id");


--
-- Name: vetbot_audit_logs vetbot_audit_logs_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY "public"."vetbot_audit_logs"
    ADD CONSTRAINT "vetbot_audit_logs_pkey" PRIMARY KEY ("audit_id");


--
-- Name: vetbot_feedback vetbot_feedback_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY "public"."vetbot_feedback"
    ADD CONSTRAINT "vetbot_feedback_pkey" PRIMARY KEY ("feedback_id");


--
-- Name: vetbot_knowledge vetbot_knowledge_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY "public"."vetbot_knowledge"
    ADD CONSTRAINT "vetbot_knowledge_pkey" PRIMARY KEY ("knowledge_id");


--
-- Name: vetbot_knowledge vetbot_knowledge_slug_key; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY "public"."vetbot_knowledge"
    ADD CONSTRAINT "vetbot_knowledge_slug_key" UNIQUE ("slug");


--
-- Name: video_sessions video_sessions_clinic_session_key; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY "public"."video_sessions"
    ADD CONSTRAINT "video_sessions_clinic_session_key" UNIQUE ("clinic_id", "session_id");


--
-- Name: video_sessions video_sessions_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY "public"."video_sessions"
    ADD CONSTRAINT "video_sessions_pkey" PRIMARY KEY ("session_id");


--
-- Name: ai_approval_history_actor_staff_idx; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX "ai_approval_history_actor_staff_idx" ON "public"."ai_approval_history" USING "btree" ("clinic_id", "actor_staff_id") WHERE ("actor_staff_id" IS NOT NULL);


--
-- Name: ai_approval_history_artifact_created_idx; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX "ai_approval_history_artifact_created_idx" ON "public"."ai_approval_history" USING "btree" ("clinic_id", "artifact_id", "created_at" DESC);


--
-- Name: ai_artifacts_appointment_idx; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX "ai_artifacts_appointment_idx" ON "public"."ai_artifacts" USING "btree" ("clinic_id", "appointment_id") WHERE ("appointment_id" IS NOT NULL);


--
-- Name: ai_artifacts_approved_by_idx; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX "ai_artifacts_approved_by_idx" ON "public"."ai_artifacts" USING "btree" ("clinic_id", "approved_by") WHERE ("approved_by" IS NOT NULL);


--
-- Name: ai_artifacts_clinic_pet_status_idx; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX "ai_artifacts_clinic_pet_status_idx" ON "public"."ai_artifacts" USING "btree" ("clinic_id", "pet_id", "status", "created_at" DESC) WHERE ("deleted_at" IS NULL);


--
-- Name: ai_artifacts_operation_idx; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX "ai_artifacts_operation_idx" ON "public"."ai_artifacts" USING "btree" ("clinic_id", "operation_id", "version_number" DESC);


--
-- Name: ai_artifacts_owner_idx; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX "ai_artifacts_owner_idx" ON "public"."ai_artifacts" USING "btree" ("clinic_id", "owner_id") WHERE ("owner_id" IS NOT NULL);


--
-- Name: ai_artifacts_retention_idx; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX "ai_artifacts_retention_idx" ON "public"."ai_artifacts" USING "btree" ("retention_until") WHERE (("retention_until" IS NOT NULL) AND ("deleted_at" IS NULL));


--
-- Name: ai_artifacts_supersedes_idx; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX "ai_artifacts_supersedes_idx" ON "public"."ai_artifacts" USING "btree" ("clinic_id", "supersedes_artifact_id") WHERE ("supersedes_artifact_id" IS NOT NULL);


--
-- Name: ai_artifacts_visit_idx; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX "ai_artifacts_visit_idx" ON "public"."ai_artifacts" USING "btree" ("clinic_id", "visit_id") WHERE ("visit_id" IS NOT NULL);


--
-- Name: ai_audit_events_clinic_created_idx; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX "ai_audit_events_clinic_created_idx" ON "public"."ai_audit_events" USING "btree" ("clinic_id", "created_at" DESC);


--
-- Name: ai_audit_events_operation_idx; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX "ai_audit_events_operation_idx" ON "public"."ai_audit_events" USING "btree" ("operation_id", "created_at") WHERE ("operation_id" IS NOT NULL);


--
-- Name: ai_consent_records_one_active_context_idx; Type: INDEX; Schema: public; Owner: -
--

CREATE UNIQUE INDEX "ai_consent_records_one_active_context_idx" ON "public"."ai_consent_records" USING "btree" ("clinic_id", "owner_id", "purpose", COALESCE("appointment_id", (0)::bigint), COALESCE("video_session_id", (0)::bigint)) WHERE ("status" = 'granted'::"text");


--
-- Name: ai_consent_records_owner_created_idx; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX "ai_consent_records_owner_created_idx" ON "public"."ai_consent_records" USING "btree" ("clinic_id", "owner_id", "created_at" DESC);


--
-- Name: ai_consent_records_session_idx; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX "ai_consent_records_session_idx" ON "public"."ai_consent_records" USING "btree" ("clinic_id", "video_session_id", "purpose", "created_at" DESC) WHERE ("video_session_id" IS NOT NULL);


--
-- Name: ai_document_chunks_active_source_idx; Type: INDEX; Schema: public; Owner: -
--

CREATE UNIQUE INDEX "ai_document_chunks_active_source_idx" ON "public"."ai_document_chunks" USING "btree" ("clinic_id", "pet_id", "source_type", "source_record_id", "chunk_index") WHERE (("source_type" IS NOT NULL) AND ("status" = ANY (ARRAY['pending'::"text", 'ready'::"text"])));


--
-- Name: ai_document_chunks_clinic_document_idx; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX "ai_document_chunks_clinic_document_idx" ON "public"."ai_document_chunks" USING "btree" ("clinic_id", "document_id", "chunk_index");


--
-- Name: ai_document_chunks_rag_scope_idx; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX "ai_document_chunks_rag_scope_idx" ON "public"."ai_document_chunks" USING "btree" ("clinic_id", "pet_id", "approval_status", "release_to_client", "source_type", "source_date" DESC) WHERE (("status" = 'ready'::"text") AND ("source_type" IS NOT NULL));


--
-- Name: ai_document_embeddings_chunk_idx; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX "ai_document_embeddings_chunk_idx" ON "public"."ai_document_embeddings" USING "btree" ("clinic_id", "chunk_id");


--
-- Name: ai_document_embeddings_clinic_status_idx; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX "ai_document_embeddings_clinic_status_idx" ON "public"."ai_document_embeddings" USING "btree" ("clinic_id", "status", "created_at" DESC);


--
-- Name: ai_document_embeddings_hnsw_idx; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX "ai_document_embeddings_hnsw_idx" ON "public"."ai_document_embeddings" USING "hnsw" ("embedding" "extensions"."vector_cosine_ops") WITH ("m"='16', "ef_construction"='64');


--
-- Name: ai_document_embeddings_rag_filter_idx; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX "ai_document_embeddings_rag_filter_idx" ON "public"."ai_document_embeddings" USING "btree" ("clinic_id", "provider", "model_version", "embedding_version", "status", "chunk_id");


--
-- Name: ai_documents_appointment_idx; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX "ai_documents_appointment_idx" ON "public"."ai_documents" USING "btree" ("clinic_id", "appointment_id") WHERE ("appointment_id" IS NOT NULL);


--
-- Name: ai_documents_clinic_pet_created_idx; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX "ai_documents_clinic_pet_created_idx" ON "public"."ai_documents" USING "btree" ("clinic_id", "pet_id", "created_at" DESC) WHERE (("pet_id" IS NOT NULL) AND ("deleted_at" IS NULL));


--
-- Name: ai_documents_owner_idx; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX "ai_documents_owner_idx" ON "public"."ai_documents" USING "btree" ("clinic_id", "owner_id") WHERE ("owner_id" IS NOT NULL);


--
-- Name: ai_documents_retention_idx; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX "ai_documents_retention_idx" ON "public"."ai_documents" USING "btree" ("retention_until") WHERE (("retention_until" IS NOT NULL) AND ("deleted_at" IS NULL));


--
-- Name: ai_documents_visit_idx; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX "ai_documents_visit_idx" ON "public"."ai_documents" USING "btree" ("clinic_id", "visit_id") WHERE ("visit_id" IS NOT NULL);


--
-- Name: ai_operations_actor_created_idx; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX "ai_operations_actor_created_idx" ON "public"."ai_operations" USING "btree" ("actor_user_id", "created_at" DESC) WHERE ("actor_user_id" IS NOT NULL);


--
-- Name: ai_operations_actor_staff_idx; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX "ai_operations_actor_staff_idx" ON "public"."ai_operations" USING "btree" ("clinic_id", "actor_staff_id") WHERE ("actor_staff_id" IS NOT NULL);


--
-- Name: ai_operations_appointment_idx; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX "ai_operations_appointment_idx" ON "public"."ai_operations" USING "btree" ("clinic_id", "appointment_id") WHERE ("appointment_id" IS NOT NULL);


--
-- Name: ai_operations_clinic_status_created_idx; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX "ai_operations_clinic_status_created_idx" ON "public"."ai_operations" USING "btree" ("clinic_id", "status", "created_at" DESC);


--
-- Name: ai_operations_idempotency_key_idx; Type: INDEX; Schema: public; Owner: -
--

CREATE UNIQUE INDEX "ai_operations_idempotency_key_idx" ON "public"."ai_operations" USING "btree" ("clinic_id", "capability", "idempotency_key") WHERE ("idempotency_key" IS NOT NULL);


--
-- Name: ai_operations_owner_idx; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX "ai_operations_owner_idx" ON "public"."ai_operations" USING "btree" ("clinic_id", "owner_id") WHERE ("owner_id" IS NOT NULL);


--
-- Name: ai_operations_pet_created_idx; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX "ai_operations_pet_created_idx" ON "public"."ai_operations" USING "btree" ("clinic_id", "pet_id", "created_at" DESC) WHERE ("pet_id" IS NOT NULL);


--
-- Name: ai_operations_visit_idx; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX "ai_operations_visit_idx" ON "public"."ai_operations" USING "btree" ("clinic_id", "visit_id") WHERE ("visit_id" IS NOT NULL);


--
-- Name: ai_rate_limit_windows_expiry_idx; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX "ai_rate_limit_windows_expiry_idx" ON "public"."ai_rate_limit_windows" USING "btree" ("expires_at");


--
-- Name: ai_sources_chunk_idx; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX "ai_sources_chunk_idx" ON "public"."ai_sources" USING "btree" ("clinic_id", "chunk_id") WHERE ("chunk_id" IS NOT NULL);


--
-- Name: ai_sources_clinic_artifact_idx; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX "ai_sources_clinic_artifact_idx" ON "public"."ai_sources" USING "btree" ("clinic_id", "artifact_id");


--
-- Name: ai_sources_document_idx; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX "ai_sources_document_idx" ON "public"."ai_sources" USING "btree" ("clinic_id", "document_id") WHERE ("document_id" IS NOT NULL);


--
-- Name: appointments_clinic_id_idx; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX "appointments_clinic_id_idx" ON "public"."appointments" USING "btree" ("clinic_id");


--
-- Name: clinic_booking_blocks_clinic_id_idx; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX "clinic_booking_blocks_clinic_id_idx" ON "public"."clinic_booking_blocks" USING "btree" ("clinic_id");


--
-- Name: clinic_booking_blocks_date_idx; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX "clinic_booking_blocks_date_idx" ON "public"."clinic_booking_blocks" USING "btree" ("block_date");


--
-- Name: clinic_booking_hours_clinic_id_idx; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX "clinic_booking_hours_clinic_id_idx" ON "public"."clinic_booking_hours" USING "btree" ("clinic_id");


--
-- Name: conversations_clinic_id_idx; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX "conversations_clinic_id_idx" ON "public"."conversations" USING "btree" ("clinic_id");


--
-- Name: differential_diagnoses_clinic_id_idx; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX "differential_diagnoses_clinic_id_idx" ON "public"."differential_diagnoses" USING "btree" ("clinic_id");


--
-- Name: documents_clinic_id_idx; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX "documents_clinic_id_idx" ON "public"."documents" USING "btree" ("clinic_id");


--
-- Name: hospitalizations_clinic_id_idx; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX "hospitalizations_clinic_id_idx" ON "public"."hospitalizations" USING "btree" ("clinic_id");


--
-- Name: idx_conversations_last_message_at; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX "idx_conversations_last_message_at" ON "public"."conversations" USING "btree" ("last_message_at");


--
-- Name: idx_conversations_owner_id; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX "idx_conversations_owner_id" ON "public"."conversations" USING "btree" ("owner_id");


--
-- Name: idx_conversations_pet_id; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX "idx_conversations_pet_id" ON "public"."conversations" USING "btree" ("pet_id");


--
-- Name: idx_conversations_status; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX "idx_conversations_status" ON "public"."conversations" USING "btree" ("status");


--
-- Name: idx_differential_diagnoses_pet_id; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX "idx_differential_diagnoses_pet_id" ON "public"."differential_diagnoses" USING "btree" ("pet_id");


--
-- Name: idx_differential_diagnoses_visit_id; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX "idx_differential_diagnoses_visit_id" ON "public"."differential_diagnoses" USING "btree" ("visit_id");


--
-- Name: idx_documents_owner_id; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX "idx_documents_owner_id" ON "public"."documents" USING "btree" ("owner_id");


--
-- Name: idx_documents_pet_id; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX "idx_documents_pet_id" ON "public"."documents" USING "btree" ("pet_id");


--
-- Name: idx_documents_visit_id; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX "idx_documents_visit_id" ON "public"."documents" USING "btree" ("visit_id");


--
-- Name: idx_hospitalizations_admitted_at; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX "idx_hospitalizations_admitted_at" ON "public"."hospitalizations" USING "btree" ("admitted_at");


--
-- Name: idx_hospitalizations_department; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX "idx_hospitalizations_department" ON "public"."hospitalizations" USING "btree" ("department");


--
-- Name: idx_hospitalizations_owner_id; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX "idx_hospitalizations_owner_id" ON "public"."hospitalizations" USING "btree" ("owner_id");


--
-- Name: idx_hospitalizations_pet_id; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX "idx_hospitalizations_pet_id" ON "public"."hospitalizations" USING "btree" ("pet_id");


--
-- Name: idx_hospitalizations_status; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX "idx_hospitalizations_status" ON "public"."hospitalizations" USING "btree" ("status");


--
-- Name: idx_hospitalizations_visit_id; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX "idx_hospitalizations_visit_id" ON "public"."hospitalizations" USING "btree" ("visit_id");


--
-- Name: idx_insights_category; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX "idx_insights_category" ON "public"."insights" USING "btree" ("category");


--
-- Name: idx_insights_created_at; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX "idx_insights_created_at" ON "public"."insights" USING "btree" ("created_at");


--
-- Name: idx_insights_owner_id; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX "idx_insights_owner_id" ON "public"."insights" USING "btree" ("related_owner_id");


--
-- Name: idx_insights_pet_id; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX "idx_insights_pet_id" ON "public"."insights" USING "btree" ("related_pet_id");


--
-- Name: idx_insights_severity; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX "idx_insights_severity" ON "public"."insights" USING "btree" ("severity");


--
-- Name: idx_insights_status; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX "idx_insights_status" ON "public"."insights" USING "btree" ("status");


--
-- Name: idx_lab_orders_test_date; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX "idx_lab_orders_test_date" ON "public"."lab_orders" USING "btree" ("test_date");


--
-- Name: idx_lab_orders_visit_id; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX "idx_lab_orders_visit_id" ON "public"."lab_orders" USING "btree" ("visit_id");


--
-- Name: idx_medical_problems_pet_id; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX "idx_medical_problems_pet_id" ON "public"."medical_problems" USING "btree" ("pet_id");


--
-- Name: idx_medical_problems_severity; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX "idx_medical_problems_severity" ON "public"."medical_problems" USING "btree" ("severity");


--
-- Name: idx_medical_problems_visit_id; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX "idx_medical_problems_visit_id" ON "public"."medical_problems" USING "btree" ("visit_id");


--
-- Name: idx_medical_visits_entry_data; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX "idx_medical_visits_entry_data" ON "public"."medical_visits" USING "gin" ("entry_data");


--
-- Name: idx_medical_visits_urgency_level; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX "idx_medical_visits_urgency_level" ON "public"."medical_visits" USING "btree" ("urgency_level");


--
-- Name: idx_message_attachments_conversation_id; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX "idx_message_attachments_conversation_id" ON "public"."message_attachments" USING "btree" ("conversation_id");


--
-- Name: idx_message_attachments_message_id; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX "idx_message_attachments_message_id" ON "public"."message_attachments" USING "btree" ("message_id");


--
-- Name: idx_messages_conversation_id; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX "idx_messages_conversation_id" ON "public"."messages" USING "btree" ("conversation_id");


--
-- Name: idx_messages_created_at; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX "idx_messages_created_at" ON "public"."messages" USING "btree" ("created_at");


--
-- Name: idx_messages_sender_type; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX "idx_messages_sender_type" ON "public"."messages" USING "btree" ("sender_type");


--
-- Name: idx_myvet_notifications_event_source; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX "idx_myvet_notifications_event_source" ON "public"."notifications" USING "btree" ("event_type", "source_type", "source_id");


--
-- Name: idx_myvet_notifications_owner_target_created; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX "idx_myvet_notifications_owner_target_created" ON "public"."notifications" USING "btree" ("owner_id", "target", "created_at" DESC);


--
-- Name: idx_myvet_notifications_owner_unread; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX "idx_myvet_notifications_owner_unread" ON "public"."notifications" USING "btree" ("owner_id", "is_read") WHERE ("is_read" = false);


--
-- Name: idx_myvet_reminders_owner_status_due; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX "idx_myvet_reminders_owner_status_due" ON "public"."reminders" USING "btree" ("owner_id", "status", "due_at");


--
-- Name: idx_notifications_is_read; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX "idx_notifications_is_read" ON "public"."notifications" USING "btree" ("is_read");


--
-- Name: idx_notifications_owner_id; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX "idx_notifications_owner_id" ON "public"."notifications" USING "btree" ("owner_id");


--
-- Name: idx_notifications_pet_id; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX "idx_notifications_pet_id" ON "public"."notifications" USING "btree" ("pet_id");


--
-- Name: idx_payment_items_created_at; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX "idx_payment_items_created_at" ON "public"."payment_items" USING "btree" ("created_at");


--
-- Name: idx_payment_items_source_inventory; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX "idx_payment_items_source_inventory" ON "public"."payment_items" USING "btree" ("source_type", "source_id");


--
-- Name: idx_payments_owner_id; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX "idx_payments_owner_id" ON "public"."payments" USING "btree" ("owner_id");


--
-- Name: idx_payments_pet_id; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX "idx_payments_pet_id" ON "public"."payments" USING "btree" ("pet_id");


--
-- Name: idx_payments_status; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX "idx_payments_status" ON "public"."payments" USING "btree" ("status");


--
-- Name: idx_physical_exams_pet_id; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX "idx_physical_exams_pet_id" ON "public"."physical_exams" USING "btree" ("pet_id");


--
-- Name: idx_physical_exams_visit_id; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX "idx_physical_exams_visit_id" ON "public"."physical_exams" USING "btree" ("visit_id");


--
-- Name: idx_reminders_due_at; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX "idx_reminders_due_at" ON "public"."reminders" USING "btree" ("due_at");


--
-- Name: idx_reminders_owner_id; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX "idx_reminders_owner_id" ON "public"."reminders" USING "btree" ("owner_id");


--
-- Name: idx_reminders_pet_id; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX "idx_reminders_pet_id" ON "public"."reminders" USING "btree" ("pet_id");


--
-- Name: idx_reminders_status; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX "idx_reminders_status" ON "public"."reminders" USING "btree" ("status");


--
-- Name: idx_staff_role; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX "idx_staff_role" ON "public"."staff" USING "btree" ("role");


--
-- Name: idx_vaccinations_next_due; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX "idx_vaccinations_next_due" ON "public"."vaccinations" USING "btree" ("next_due_date");


--
-- Name: idx_vaccinations_owner; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX "idx_vaccinations_owner" ON "public"."vaccinations" USING "btree" ("owner_id");


--
-- Name: idx_vaccinations_pet_given_date; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX "idx_vaccinations_pet_given_date" ON "public"."vaccinations" USING "btree" ("pet_id", "given_date" DESC);


--
-- Name: idx_video_sessions_conversation_id; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX "idx_video_sessions_conversation_id" ON "public"."video_sessions" USING "btree" ("conversation_id");


--
-- Name: idx_video_sessions_owner_id; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX "idx_video_sessions_owner_id" ON "public"."video_sessions" USING "btree" ("owner_id");


--
-- Name: idx_video_sessions_status; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX "idx_video_sessions_status" ON "public"."video_sessions" USING "btree" ("status");


--
-- Name: insights_clinic_id_idx; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX "insights_clinic_id_idx" ON "public"."insights" USING "btree" ("clinic_id");


--
-- Name: inventory_clinic_id_idx; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX "inventory_clinic_id_idx" ON "public"."inventory" USING "btree" ("clinic_id");


--
-- Name: lab_orders_clinic_id_idx; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX "lab_orders_clinic_id_idx" ON "public"."lab_orders" USING "btree" ("clinic_id");


--
-- Name: medical_problems_clinic_id_idx; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX "medical_problems_clinic_id_idx" ON "public"."medical_problems" USING "btree" ("clinic_id");


--
-- Name: medical_visits_clinic_id_idx; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX "medical_visits_clinic_id_idx" ON "public"."medical_visits" USING "btree" ("clinic_id");


--
-- Name: message_attachments_clinic_id_idx; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX "message_attachments_clinic_id_idx" ON "public"."message_attachments" USING "btree" ("clinic_id");


--
-- Name: messages_clinic_id_idx; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX "messages_clinic_id_idx" ON "public"."messages" USING "btree" ("clinic_id");


--
-- Name: notifications_clinic_id_idx; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX "notifications_clinic_id_idx" ON "public"."notifications" USING "btree" ("clinic_id");


--
-- Name: owners_auth_user_id_unique; Type: INDEX; Schema: public; Owner: -
--

CREATE UNIQUE INDEX "owners_auth_user_id_unique" ON "public"."owners" USING "btree" ("auth_user_id") WHERE ("auth_user_id" IS NOT NULL);


--
-- Name: owners_clinic_id_idx; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX "owners_clinic_id_idx" ON "public"."owners" USING "btree" ("clinic_id");


--
-- Name: patients_clinic_id_idx; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX "patients_clinic_id_idx" ON "public"."patients" USING "btree" ("clinic_id");


--
-- Name: payment_items_clinic_id_idx; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX "payment_items_clinic_id_idx" ON "public"."payment_items" USING "btree" ("clinic_id");


--
-- Name: payment_transactions_clinic_id_idx; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX "payment_transactions_clinic_id_idx" ON "public"."payment_transactions" USING "btree" ("clinic_id");


--
-- Name: payment_transactions_owner_created_idx; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX "payment_transactions_owner_created_idx" ON "public"."payment_transactions" USING "btree" ("owner_id", "created_at" DESC);


--
-- Name: payment_transactions_payment_created_idx; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX "payment_transactions_payment_created_idx" ON "public"."payment_transactions" USING "btree" ("payment_id", "created_at" DESC);


--
-- Name: payments_clinic_id_idx; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX "payments_clinic_id_idx" ON "public"."payments" USING "btree" ("clinic_id");


--
-- Name: physical_exams_clinic_id_idx; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX "physical_exams_clinic_id_idx" ON "public"."physical_exams" USING "btree" ("clinic_id");


--
-- Name: prescriptions_clinic_id_idx; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX "prescriptions_clinic_id_idx" ON "public"."prescriptions" USING "btree" ("clinic_id");


--
-- Name: reminders_clinic_id_idx; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX "reminders_clinic_id_idx" ON "public"."reminders" USING "btree" ("clinic_id");


--
-- Name: reminders_source_duplicate_lookup_idx; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX "reminders_source_duplicate_lookup_idx" ON "public"."reminders" USING "btree" ("clinic_id", "pet_id", "source_type", "source_id", "reminder_type", "due_at");


--
-- Name: service_catalog_clinic_id_idx; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX "service_catalog_clinic_id_idx" ON "public"."service_catalog" USING "btree" ("clinic_id");


--
-- Name: staff_auth_user_id_unique; Type: INDEX; Schema: public; Owner: -
--

CREATE UNIQUE INDEX "staff_auth_user_id_unique" ON "public"."staff" USING "btree" ("auth_user_id") WHERE ("auth_user_id" IS NOT NULL);


--
-- Name: staff_auth_user_id_unique_all; Type: INDEX; Schema: public; Owner: -
--

CREATE UNIQUE INDEX "staff_auth_user_id_unique_all" ON "public"."staff" USING "btree" ("auth_user_id");


--
-- Name: staff_clinic_id_idx; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX "staff_clinic_id_idx" ON "public"."staff" USING "btree" ("clinic_id");


--
-- Name: vaccinations_clinic_id_idx; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX "vaccinations_clinic_id_idx" ON "public"."vaccinations" USING "btree" ("clinic_id");


--
-- Name: vetbot_action_requests_actor_created_idx; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX "vetbot_action_requests_actor_created_idx" ON "public"."vetbot_action_requests" USING "btree" ("actor_id", "created_at" DESC);


--
-- Name: vetbot_action_requests_clinic_id_idx; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX "vetbot_action_requests_clinic_id_idx" ON "public"."vetbot_action_requests" USING "btree" ("clinic_id");


--
-- Name: vetbot_action_requests_pending_expiry_idx; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX "vetbot_action_requests_pending_expiry_idx" ON "public"."vetbot_action_requests" USING "btree" ("expires_at") WHERE ("status" = 'pending'::"text");


--
-- Name: vetbot_audit_actor_created_idx; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX "vetbot_audit_actor_created_idx" ON "public"."vetbot_audit_logs" USING "btree" ("actor_id", "created_at" DESC);


--
-- Name: vetbot_audit_clinic_created_idx; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX "vetbot_audit_clinic_created_idx" ON "public"."vetbot_audit_logs" USING "btree" ("clinic_id", "created_at" DESC);


--
-- Name: vetbot_audit_created_idx; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX "vetbot_audit_created_idx" ON "public"."vetbot_audit_logs" USING "btree" ("created_at" DESC);


--
-- Name: vetbot_audit_logs_clinic_id_idx; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX "vetbot_audit_logs_clinic_id_idx" ON "public"."vetbot_audit_logs" USING "btree" ("clinic_id");


--
-- Name: vetbot_feedback_clinic_id_idx; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX "vetbot_feedback_clinic_id_idx" ON "public"."vetbot_feedback" USING "btree" ("clinic_id");


--
-- Name: vetbot_feedback_created_idx; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX "vetbot_feedback_created_idx" ON "public"."vetbot_feedback" USING "btree" ("created_at" DESC);


--
-- Name: vetbot_knowledge_clinic_id_idx; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX "vetbot_knowledge_clinic_id_idx" ON "public"."vetbot_knowledge" USING "btree" ("clinic_id");


--
-- Name: video_sessions_appointment_idx; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX "video_sessions_appointment_idx" ON "public"."video_sessions" USING "btree" ("clinic_id", "appointment_id") WHERE ("appointment_id" IS NOT NULL);


--
-- Name: video_sessions_clinic_id_idx; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX "video_sessions_clinic_id_idx" ON "public"."video_sessions" USING "btree" ("clinic_id");


--
-- Name: video_sessions_transcription_status_idx; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX "video_sessions_transcription_status_idx" ON "public"."video_sessions" USING "btree" ("clinic_id", "transcription_status", "ai_updated_at" DESC);


--
-- Name: vetbot_action_requests a_myvet_assign_vetbot_actor_clinic; Type: TRIGGER; Schema: public; Owner: -
--

CREATE TRIGGER "a_myvet_assign_vetbot_actor_clinic" BEFORE INSERT ON "public"."vetbot_action_requests" FOR EACH ROW EXECUTE FUNCTION "private"."myvet_assign_vetbot_actor_clinic"();


--
-- Name: appointments b_myvet_validate_tenant_scope; Type: TRIGGER; Schema: public; Owner: -
--

CREATE TRIGGER "b_myvet_validate_tenant_scope" BEFORE INSERT OR UPDATE ON "public"."appointments" FOR EACH ROW EXECUTE FUNCTION "private"."myvet_validate_legacy_tenant_scope"();


--
-- Name: clinic_booking_blocks b_myvet_validate_tenant_scope; Type: TRIGGER; Schema: public; Owner: -
--

CREATE TRIGGER "b_myvet_validate_tenant_scope" BEFORE INSERT OR UPDATE ON "public"."clinic_booking_blocks" FOR EACH ROW EXECUTE FUNCTION "private"."myvet_validate_legacy_tenant_scope"();


--
-- Name: clinic_booking_hours b_myvet_validate_tenant_scope; Type: TRIGGER; Schema: public; Owner: -
--

CREATE TRIGGER "b_myvet_validate_tenant_scope" BEFORE INSERT OR UPDATE ON "public"."clinic_booking_hours" FOR EACH ROW EXECUTE FUNCTION "private"."myvet_validate_legacy_tenant_scope"();


--
-- Name: conversations b_myvet_validate_tenant_scope; Type: TRIGGER; Schema: public; Owner: -
--

CREATE TRIGGER "b_myvet_validate_tenant_scope" BEFORE INSERT OR UPDATE ON "public"."conversations" FOR EACH ROW EXECUTE FUNCTION "private"."myvet_validate_legacy_tenant_scope"();


--
-- Name: differential_diagnoses b_myvet_validate_tenant_scope; Type: TRIGGER; Schema: public; Owner: -
--

CREATE TRIGGER "b_myvet_validate_tenant_scope" BEFORE INSERT OR UPDATE ON "public"."differential_diagnoses" FOR EACH ROW EXECUTE FUNCTION "private"."myvet_validate_legacy_tenant_scope"();


--
-- Name: documents b_myvet_validate_tenant_scope; Type: TRIGGER; Schema: public; Owner: -
--

CREATE TRIGGER "b_myvet_validate_tenant_scope" BEFORE INSERT OR UPDATE ON "public"."documents" FOR EACH ROW EXECUTE FUNCTION "private"."myvet_validate_legacy_tenant_scope"();


--
-- Name: hospitalizations b_myvet_validate_tenant_scope; Type: TRIGGER; Schema: public; Owner: -
--

CREATE TRIGGER "b_myvet_validate_tenant_scope" BEFORE INSERT OR UPDATE ON "public"."hospitalizations" FOR EACH ROW EXECUTE FUNCTION "private"."myvet_validate_legacy_tenant_scope"();


--
-- Name: insights b_myvet_validate_tenant_scope; Type: TRIGGER; Schema: public; Owner: -
--

CREATE TRIGGER "b_myvet_validate_tenant_scope" BEFORE INSERT OR UPDATE ON "public"."insights" FOR EACH ROW EXECUTE FUNCTION "private"."myvet_validate_legacy_tenant_scope"();


--
-- Name: inventory b_myvet_validate_tenant_scope; Type: TRIGGER; Schema: public; Owner: -
--

CREATE TRIGGER "b_myvet_validate_tenant_scope" BEFORE INSERT OR UPDATE ON "public"."inventory" FOR EACH ROW EXECUTE FUNCTION "private"."myvet_validate_legacy_tenant_scope"();


--
-- Name: lab_orders b_myvet_validate_tenant_scope; Type: TRIGGER; Schema: public; Owner: -
--

CREATE TRIGGER "b_myvet_validate_tenant_scope" BEFORE INSERT OR UPDATE ON "public"."lab_orders" FOR EACH ROW EXECUTE FUNCTION "private"."myvet_validate_legacy_tenant_scope"();


--
-- Name: medical_problems b_myvet_validate_tenant_scope; Type: TRIGGER; Schema: public; Owner: -
--

CREATE TRIGGER "b_myvet_validate_tenant_scope" BEFORE INSERT OR UPDATE ON "public"."medical_problems" FOR EACH ROW EXECUTE FUNCTION "private"."myvet_validate_legacy_tenant_scope"();


--
-- Name: medical_visits b_myvet_validate_tenant_scope; Type: TRIGGER; Schema: public; Owner: -
--

CREATE TRIGGER "b_myvet_validate_tenant_scope" BEFORE INSERT OR UPDATE ON "public"."medical_visits" FOR EACH ROW EXECUTE FUNCTION "private"."myvet_validate_legacy_tenant_scope"();


--
-- Name: message_attachments b_myvet_validate_tenant_scope; Type: TRIGGER; Schema: public; Owner: -
--

CREATE TRIGGER "b_myvet_validate_tenant_scope" BEFORE INSERT OR UPDATE ON "public"."message_attachments" FOR EACH ROW EXECUTE FUNCTION "private"."myvet_validate_legacy_tenant_scope"();


--
-- Name: messages b_myvet_validate_tenant_scope; Type: TRIGGER; Schema: public; Owner: -
--

CREATE TRIGGER "b_myvet_validate_tenant_scope" BEFORE INSERT OR UPDATE ON "public"."messages" FOR EACH ROW EXECUTE FUNCTION "private"."myvet_validate_legacy_tenant_scope"();


--
-- Name: notifications b_myvet_validate_tenant_scope; Type: TRIGGER; Schema: public; Owner: -
--

CREATE TRIGGER "b_myvet_validate_tenant_scope" BEFORE INSERT OR UPDATE ON "public"."notifications" FOR EACH ROW EXECUTE FUNCTION "private"."myvet_validate_legacy_tenant_scope"();


--
-- Name: owners b_myvet_validate_tenant_scope; Type: TRIGGER; Schema: public; Owner: -
--

CREATE TRIGGER "b_myvet_validate_tenant_scope" BEFORE INSERT OR UPDATE ON "public"."owners" FOR EACH ROW EXECUTE FUNCTION "private"."myvet_validate_legacy_tenant_scope"();


--
-- Name: patients b_myvet_validate_tenant_scope; Type: TRIGGER; Schema: public; Owner: -
--

CREATE TRIGGER "b_myvet_validate_tenant_scope" BEFORE INSERT OR UPDATE ON "public"."patients" FOR EACH ROW EXECUTE FUNCTION "private"."myvet_validate_legacy_tenant_scope"();


--
-- Name: payment_items b_myvet_validate_tenant_scope; Type: TRIGGER; Schema: public; Owner: -
--

CREATE TRIGGER "b_myvet_validate_tenant_scope" BEFORE INSERT OR UPDATE ON "public"."payment_items" FOR EACH ROW EXECUTE FUNCTION "private"."myvet_validate_legacy_tenant_scope"();


--
-- Name: payment_transactions b_myvet_validate_tenant_scope; Type: TRIGGER; Schema: public; Owner: -
--

CREATE TRIGGER "b_myvet_validate_tenant_scope" BEFORE INSERT OR UPDATE ON "public"."payment_transactions" FOR EACH ROW EXECUTE FUNCTION "private"."myvet_validate_legacy_tenant_scope"();


--
-- Name: payments b_myvet_validate_tenant_scope; Type: TRIGGER; Schema: public; Owner: -
--

CREATE TRIGGER "b_myvet_validate_tenant_scope" BEFORE INSERT OR UPDATE ON "public"."payments" FOR EACH ROW EXECUTE FUNCTION "private"."myvet_validate_legacy_tenant_scope"();


--
-- Name: physical_exams b_myvet_validate_tenant_scope; Type: TRIGGER; Schema: public; Owner: -
--

CREATE TRIGGER "b_myvet_validate_tenant_scope" BEFORE INSERT OR UPDATE ON "public"."physical_exams" FOR EACH ROW EXECUTE FUNCTION "private"."myvet_validate_legacy_tenant_scope"();


--
-- Name: prescriptions b_myvet_validate_tenant_scope; Type: TRIGGER; Schema: public; Owner: -
--

CREATE TRIGGER "b_myvet_validate_tenant_scope" BEFORE INSERT OR UPDATE ON "public"."prescriptions" FOR EACH ROW EXECUTE FUNCTION "private"."myvet_validate_legacy_tenant_scope"();


--
-- Name: reminders b_myvet_validate_tenant_scope; Type: TRIGGER; Schema: public; Owner: -
--

CREATE TRIGGER "b_myvet_validate_tenant_scope" BEFORE INSERT OR UPDATE ON "public"."reminders" FOR EACH ROW EXECUTE FUNCTION "private"."myvet_validate_legacy_tenant_scope"();


--
-- Name: service_catalog b_myvet_validate_tenant_scope; Type: TRIGGER; Schema: public; Owner: -
--

CREATE TRIGGER "b_myvet_validate_tenant_scope" BEFORE INSERT OR UPDATE ON "public"."service_catalog" FOR EACH ROW EXECUTE FUNCTION "private"."myvet_validate_legacy_tenant_scope"();


--
-- Name: staff b_myvet_validate_tenant_scope; Type: TRIGGER; Schema: public; Owner: -
--

CREATE TRIGGER "b_myvet_validate_tenant_scope" BEFORE INSERT OR UPDATE ON "public"."staff" FOR EACH ROW EXECUTE FUNCTION "private"."myvet_validate_legacy_tenant_scope"();


--
-- Name: vaccinations b_myvet_validate_tenant_scope; Type: TRIGGER; Schema: public; Owner: -
--

CREATE TRIGGER "b_myvet_validate_tenant_scope" BEFORE INSERT OR UPDATE ON "public"."vaccinations" FOR EACH ROW EXECUTE FUNCTION "private"."myvet_validate_legacy_tenant_scope"();


--
-- Name: vetbot_action_requests b_myvet_validate_tenant_scope; Type: TRIGGER; Schema: public; Owner: -
--

CREATE TRIGGER "b_myvet_validate_tenant_scope" BEFORE INSERT OR UPDATE ON "public"."vetbot_action_requests" FOR EACH ROW EXECUTE FUNCTION "private"."myvet_validate_legacy_tenant_scope"();


--
-- Name: vetbot_audit_logs b_myvet_validate_tenant_scope; Type: TRIGGER; Schema: public; Owner: -
--

CREATE TRIGGER "b_myvet_validate_tenant_scope" BEFORE INSERT OR UPDATE ON "public"."vetbot_audit_logs" FOR EACH ROW EXECUTE FUNCTION "private"."myvet_validate_legacy_tenant_scope"();


--
-- Name: vetbot_feedback b_myvet_validate_tenant_scope; Type: TRIGGER; Schema: public; Owner: -
--

CREATE TRIGGER "b_myvet_validate_tenant_scope" BEFORE INSERT OR UPDATE ON "public"."vetbot_feedback" FOR EACH ROW EXECUTE FUNCTION "private"."myvet_validate_legacy_tenant_scope"();


--
-- Name: vetbot_knowledge b_myvet_validate_tenant_scope; Type: TRIGGER; Schema: public; Owner: -
--

CREATE TRIGGER "b_myvet_validate_tenant_scope" BEFORE INSERT OR UPDATE ON "public"."vetbot_knowledge" FOR EACH ROW EXECUTE FUNCTION "private"."myvet_validate_legacy_tenant_scope"();


--
-- Name: video_sessions b_myvet_validate_tenant_scope; Type: TRIGGER; Schema: public; Owner: -
--

CREATE TRIGGER "b_myvet_validate_tenant_scope" BEFORE INSERT OR UPDATE ON "public"."video_sessions" FOR EACH ROW EXECUTE FUNCTION "private"."myvet_validate_legacy_tenant_scope"();


--
-- Name: ai_audit_events myvet_ai_audit_immutable; Type: TRIGGER; Schema: public; Owner: -
--

CREATE TRIGGER "myvet_ai_audit_immutable" BEFORE DELETE OR UPDATE ON "public"."ai_audit_events" FOR EACH ROW EXECUTE FUNCTION "private"."myvet_prevent_history_mutation"();


--
-- Name: ai_approval_history myvet_approval_history_immutable; Type: TRIGGER; Schema: public; Owner: -
--

CREATE TRIGGER "myvet_approval_history_immutable" BEFORE DELETE OR UPDATE ON "public"."ai_approval_history" FOR EACH ROW EXECUTE FUNCTION "private"."myvet_prevent_history_mutation"();


--
-- Name: ai_approval_history myvet_approval_history_validate; Type: TRIGGER; Schema: public; Owner: -
--

CREATE TRIGGER "myvet_approval_history_validate" BEFORE INSERT ON "public"."ai_approval_history" FOR EACH ROW EXECUTE FUNCTION "private"."myvet_validate_approval_event"();


--
-- Name: ai_artifacts myvet_digitalcare_summary_provenance; Type: TRIGGER; Schema: public; Owner: -
--

CREATE TRIGGER "myvet_digitalcare_summary_provenance" AFTER INSERT ON "public"."ai_artifacts" FOR EACH ROW EXECUTE FUNCTION "private"."myvet_carry_digitalcare_summary_provenance"();


--
-- Name: ai_feature_flags myvet_protect_required_ai_flags_before_delete; Type: TRIGGER; Schema: public; Owner: -
--

CREATE TRIGGER "myvet_protect_required_ai_flags_before_delete" BEFORE DELETE ON "public"."ai_feature_flags" FOR EACH ROW EXECUTE FUNCTION "private"."myvet_protect_required_ai_feature_flags"();


--
-- Name: ai_artifacts myvet_rag_invalidate_artifact; Type: TRIGGER; Schema: public; Owner: -
--

CREATE TRIGGER "myvet_rag_invalidate_artifact" AFTER DELETE OR UPDATE ON "public"."ai_artifacts" FOR EACH ROW EXECUTE FUNCTION "private"."myvet_invalidate_rag_artifact"();


--
-- Name: documents myvet_rag_invalidate_document; Type: TRIGGER; Schema: public; Owner: -
--

CREATE TRIGGER "myvet_rag_invalidate_document" AFTER DELETE OR UPDATE ON "public"."documents" FOR EACH ROW EXECUTE FUNCTION "private"."myvet_invalidate_rag_source"('medical_document', 'document_id');


--
-- Name: lab_orders myvet_rag_invalidate_lab; Type: TRIGGER; Schema: public; Owner: -
--

CREATE TRIGGER "myvet_rag_invalidate_lab" AFTER DELETE OR UPDATE ON "public"."lab_orders" FOR EACH ROW EXECUTE FUNCTION "private"."myvet_invalidate_rag_source"('lab_result', 'lab_order_id');


--
-- Name: medical_visits myvet_rag_invalidate_medical_visit; Type: TRIGGER; Schema: public; Owner: -
--

CREATE TRIGGER "myvet_rag_invalidate_medical_visit" AFTER DELETE OR UPDATE ON "public"."medical_visits" FOR EACH ROW EXECUTE FUNCTION "private"."myvet_invalidate_rag_source"('medical_visit', 'visit_id');


--
-- Name: vaccinations myvet_rag_invalidate_vaccination; Type: TRIGGER; Schema: public; Owner: -
--

CREATE TRIGGER "myvet_rag_invalidate_vaccination" AFTER DELETE OR UPDATE ON "public"."vaccinations" FOR EACH ROW EXECUTE FUNCTION "private"."myvet_invalidate_rag_source"('vaccination', 'vaccination_id');


--
-- Name: clinics myvet_seed_disabled_ai_flags_after_clinic_insert; Type: TRIGGER; Schema: public; Owner: -
--

CREATE TRIGGER "myvet_seed_disabled_ai_flags_after_clinic_insert" AFTER INSERT ON "public"."clinics" FOR EACH ROW EXECUTE FUNCTION "private"."myvet_seed_disabled_ai_feature_flags_for_new_clinic"();


--
-- Name: ai_artifacts myvet_set_updated_at; Type: TRIGGER; Schema: public; Owner: -
--

CREATE TRIGGER "myvet_set_updated_at" BEFORE UPDATE ON "public"."ai_artifacts" FOR EACH ROW EXECUTE FUNCTION "private"."myvet_set_updated_at"();


--
-- Name: ai_consent_records myvet_set_updated_at; Type: TRIGGER; Schema: public; Owner: -
--

CREATE TRIGGER "myvet_set_updated_at" BEFORE UPDATE ON "public"."ai_consent_records" FOR EACH ROW EXECUTE FUNCTION "private"."myvet_set_updated_at"();


--
-- Name: ai_document_chunks myvet_set_updated_at; Type: TRIGGER; Schema: public; Owner: -
--

CREATE TRIGGER "myvet_set_updated_at" BEFORE UPDATE ON "public"."ai_document_chunks" FOR EACH ROW EXECUTE FUNCTION "private"."myvet_set_updated_at"();


--
-- Name: ai_document_embeddings myvet_set_updated_at; Type: TRIGGER; Schema: public; Owner: -
--

CREATE TRIGGER "myvet_set_updated_at" BEFORE UPDATE ON "public"."ai_document_embeddings" FOR EACH ROW EXECUTE FUNCTION "private"."myvet_set_updated_at"();


--
-- Name: ai_documents myvet_set_updated_at; Type: TRIGGER; Schema: public; Owner: -
--

CREATE TRIGGER "myvet_set_updated_at" BEFORE UPDATE ON "public"."ai_documents" FOR EACH ROW EXECUTE FUNCTION "private"."myvet_set_updated_at"();


--
-- Name: ai_feature_flags myvet_set_updated_at; Type: TRIGGER; Schema: public; Owner: -
--

CREATE TRIGGER "myvet_set_updated_at" BEFORE UPDATE ON "public"."ai_feature_flags" FOR EACH ROW EXECUTE FUNCTION "private"."myvet_set_updated_at"();


--
-- Name: ai_operations myvet_set_updated_at; Type: TRIGGER; Schema: public; Owner: -
--

CREATE TRIGGER "myvet_set_updated_at" BEFORE UPDATE ON "public"."ai_operations" FOR EACH ROW EXECUTE FUNCTION "private"."myvet_set_updated_at"();


--
-- Name: ai_rate_limit_windows myvet_set_updated_at; Type: TRIGGER; Schema: public; Owner: -
--

CREATE TRIGGER "myvet_set_updated_at" BEFORE UPDATE ON "public"."ai_rate_limit_windows" FOR EACH ROW EXECUTE FUNCTION "private"."myvet_set_updated_at"();


--
-- Name: clinics myvet_set_updated_at; Type: TRIGGER; Schema: public; Owner: -
--

CREATE TRIGGER "myvet_set_updated_at" BEFORE UPDATE ON "public"."clinics" FOR EACH ROW EXECUTE FUNCTION "private"."myvet_set_updated_at"();


--
-- Name: ai_approval_history myvet_tenant_write_guard; Type: TRIGGER; Schema: public; Owner: -
--

CREATE TRIGGER "myvet_tenant_write_guard" BEFORE INSERT OR DELETE OR UPDATE ON "public"."ai_approval_history" FOR EACH ROW EXECUTE FUNCTION "private"."myvet_enforce_tenant_write"();


--
-- Name: ai_artifacts myvet_tenant_write_guard; Type: TRIGGER; Schema: public; Owner: -
--

CREATE TRIGGER "myvet_tenant_write_guard" BEFORE INSERT OR DELETE OR UPDATE ON "public"."ai_artifacts" FOR EACH ROW EXECUTE FUNCTION "private"."myvet_enforce_tenant_write"();


--
-- Name: ai_audit_events myvet_tenant_write_guard; Type: TRIGGER; Schema: public; Owner: -
--

CREATE TRIGGER "myvet_tenant_write_guard" BEFORE INSERT OR DELETE OR UPDATE ON "public"."ai_audit_events" FOR EACH ROW EXECUTE FUNCTION "private"."myvet_enforce_tenant_write"();


--
-- Name: ai_consent_records myvet_tenant_write_guard; Type: TRIGGER; Schema: public; Owner: -
--

CREATE TRIGGER "myvet_tenant_write_guard" BEFORE INSERT OR DELETE OR UPDATE ON "public"."ai_consent_records" FOR EACH ROW EXECUTE FUNCTION "private"."myvet_enforce_tenant_write"();


--
-- Name: ai_document_chunks myvet_tenant_write_guard; Type: TRIGGER; Schema: public; Owner: -
--

CREATE TRIGGER "myvet_tenant_write_guard" BEFORE INSERT OR DELETE OR UPDATE ON "public"."ai_document_chunks" FOR EACH ROW EXECUTE FUNCTION "private"."myvet_enforce_tenant_write"();


--
-- Name: ai_document_embeddings myvet_tenant_write_guard; Type: TRIGGER; Schema: public; Owner: -
--

CREATE TRIGGER "myvet_tenant_write_guard" BEFORE INSERT OR DELETE OR UPDATE ON "public"."ai_document_embeddings" FOR EACH ROW EXECUTE FUNCTION "private"."myvet_enforce_tenant_write"();


--
-- Name: ai_documents myvet_tenant_write_guard; Type: TRIGGER; Schema: public; Owner: -
--

CREATE TRIGGER "myvet_tenant_write_guard" BEFORE INSERT OR DELETE OR UPDATE ON "public"."ai_documents" FOR EACH ROW EXECUTE FUNCTION "private"."myvet_enforce_tenant_write"();


--
-- Name: ai_feature_flags myvet_tenant_write_guard; Type: TRIGGER; Schema: public; Owner: -
--

CREATE TRIGGER "myvet_tenant_write_guard" BEFORE INSERT OR DELETE OR UPDATE ON "public"."ai_feature_flags" FOR EACH ROW EXECUTE FUNCTION "private"."myvet_enforce_tenant_write"();


--
-- Name: ai_operations myvet_tenant_write_guard; Type: TRIGGER; Schema: public; Owner: -
--

CREATE TRIGGER "myvet_tenant_write_guard" BEFORE INSERT OR DELETE OR UPDATE ON "public"."ai_operations" FOR EACH ROW EXECUTE FUNCTION "private"."myvet_enforce_tenant_write"();


--
-- Name: ai_rate_limit_windows myvet_tenant_write_guard; Type: TRIGGER; Schema: public; Owner: -
--

CREATE TRIGGER "myvet_tenant_write_guard" BEFORE INSERT OR DELETE OR UPDATE ON "public"."ai_rate_limit_windows" FOR EACH ROW EXECUTE FUNCTION "private"."myvet_enforce_tenant_write"();


--
-- Name: ai_sources myvet_tenant_write_guard; Type: TRIGGER; Schema: public; Owner: -
--

CREATE TRIGGER "myvet_tenant_write_guard" BEFORE INSERT OR DELETE OR UPDATE ON "public"."ai_sources" FOR EACH ROW EXECUTE FUNCTION "private"."myvet_enforce_tenant_write"();


--
-- Name: appointments myvet_tenant_write_guard; Type: TRIGGER; Schema: public; Owner: -
--

CREATE TRIGGER "myvet_tenant_write_guard" BEFORE INSERT OR DELETE OR UPDATE ON "public"."appointments" FOR EACH ROW EXECUTE FUNCTION "private"."myvet_enforce_tenant_write"();


--
-- Name: clinic_booking_blocks myvet_tenant_write_guard; Type: TRIGGER; Schema: public; Owner: -
--

CREATE TRIGGER "myvet_tenant_write_guard" BEFORE INSERT OR DELETE OR UPDATE ON "public"."clinic_booking_blocks" FOR EACH ROW EXECUTE FUNCTION "private"."myvet_enforce_tenant_write"();


--
-- Name: clinic_booking_hours myvet_tenant_write_guard; Type: TRIGGER; Schema: public; Owner: -
--

CREATE TRIGGER "myvet_tenant_write_guard" BEFORE INSERT OR DELETE OR UPDATE ON "public"."clinic_booking_hours" FOR EACH ROW EXECUTE FUNCTION "private"."myvet_enforce_tenant_write"();


--
-- Name: conversations myvet_tenant_write_guard; Type: TRIGGER; Schema: public; Owner: -
--

CREATE TRIGGER "myvet_tenant_write_guard" BEFORE INSERT OR DELETE OR UPDATE ON "public"."conversations" FOR EACH ROW EXECUTE FUNCTION "private"."myvet_enforce_tenant_write"();


--
-- Name: differential_diagnoses myvet_tenant_write_guard; Type: TRIGGER; Schema: public; Owner: -
--

CREATE TRIGGER "myvet_tenant_write_guard" BEFORE INSERT OR DELETE OR UPDATE ON "public"."differential_diagnoses" FOR EACH ROW EXECUTE FUNCTION "private"."myvet_enforce_tenant_write"();


--
-- Name: documents myvet_tenant_write_guard; Type: TRIGGER; Schema: public; Owner: -
--

CREATE TRIGGER "myvet_tenant_write_guard" BEFORE INSERT OR DELETE OR UPDATE ON "public"."documents" FOR EACH ROW EXECUTE FUNCTION "private"."myvet_enforce_tenant_write"();


--
-- Name: hospitalizations myvet_tenant_write_guard; Type: TRIGGER; Schema: public; Owner: -
--

CREATE TRIGGER "myvet_tenant_write_guard" BEFORE INSERT OR DELETE OR UPDATE ON "public"."hospitalizations" FOR EACH ROW EXECUTE FUNCTION "private"."myvet_enforce_tenant_write"();


--
-- Name: insights myvet_tenant_write_guard; Type: TRIGGER; Schema: public; Owner: -
--

CREATE TRIGGER "myvet_tenant_write_guard" BEFORE INSERT OR DELETE OR UPDATE ON "public"."insights" FOR EACH ROW EXECUTE FUNCTION "private"."myvet_enforce_tenant_write"();


--
-- Name: inventory myvet_tenant_write_guard; Type: TRIGGER; Schema: public; Owner: -
--

CREATE TRIGGER "myvet_tenant_write_guard" BEFORE INSERT OR DELETE OR UPDATE ON "public"."inventory" FOR EACH ROW EXECUTE FUNCTION "private"."myvet_enforce_tenant_write"();


--
-- Name: lab_orders myvet_tenant_write_guard; Type: TRIGGER; Schema: public; Owner: -
--

CREATE TRIGGER "myvet_tenant_write_guard" BEFORE INSERT OR DELETE OR UPDATE ON "public"."lab_orders" FOR EACH ROW EXECUTE FUNCTION "private"."myvet_enforce_tenant_write"();


--
-- Name: medical_problems myvet_tenant_write_guard; Type: TRIGGER; Schema: public; Owner: -
--

CREATE TRIGGER "myvet_tenant_write_guard" BEFORE INSERT OR DELETE OR UPDATE ON "public"."medical_problems" FOR EACH ROW EXECUTE FUNCTION "private"."myvet_enforce_tenant_write"();


--
-- Name: medical_visits myvet_tenant_write_guard; Type: TRIGGER; Schema: public; Owner: -
--

CREATE TRIGGER "myvet_tenant_write_guard" BEFORE INSERT OR DELETE OR UPDATE ON "public"."medical_visits" FOR EACH ROW EXECUTE FUNCTION "private"."myvet_enforce_tenant_write"();


--
-- Name: message_attachments myvet_tenant_write_guard; Type: TRIGGER; Schema: public; Owner: -
--

CREATE TRIGGER "myvet_tenant_write_guard" BEFORE INSERT OR DELETE OR UPDATE ON "public"."message_attachments" FOR EACH ROW EXECUTE FUNCTION "private"."myvet_enforce_tenant_write"();


--
-- Name: messages myvet_tenant_write_guard; Type: TRIGGER; Schema: public; Owner: -
--

CREATE TRIGGER "myvet_tenant_write_guard" BEFORE INSERT OR DELETE OR UPDATE ON "public"."messages" FOR EACH ROW EXECUTE FUNCTION "private"."myvet_enforce_tenant_write"();


--
-- Name: notifications myvet_tenant_write_guard; Type: TRIGGER; Schema: public; Owner: -
--

CREATE TRIGGER "myvet_tenant_write_guard" BEFORE INSERT OR DELETE OR UPDATE ON "public"."notifications" FOR EACH ROW EXECUTE FUNCTION "private"."myvet_enforce_tenant_write"();


--
-- Name: owners myvet_tenant_write_guard; Type: TRIGGER; Schema: public; Owner: -
--

CREATE TRIGGER "myvet_tenant_write_guard" BEFORE INSERT OR DELETE OR UPDATE ON "public"."owners" FOR EACH ROW EXECUTE FUNCTION "private"."myvet_enforce_tenant_write"();


--
-- Name: patients myvet_tenant_write_guard; Type: TRIGGER; Schema: public; Owner: -
--

CREATE TRIGGER "myvet_tenant_write_guard" BEFORE INSERT OR DELETE OR UPDATE ON "public"."patients" FOR EACH ROW EXECUTE FUNCTION "private"."myvet_enforce_tenant_write"();


--
-- Name: payment_items myvet_tenant_write_guard; Type: TRIGGER; Schema: public; Owner: -
--

CREATE TRIGGER "myvet_tenant_write_guard" BEFORE INSERT OR DELETE OR UPDATE ON "public"."payment_items" FOR EACH ROW EXECUTE FUNCTION "private"."myvet_enforce_tenant_write"();


--
-- Name: payment_transactions myvet_tenant_write_guard; Type: TRIGGER; Schema: public; Owner: -
--

CREATE TRIGGER "myvet_tenant_write_guard" BEFORE INSERT OR DELETE OR UPDATE ON "public"."payment_transactions" FOR EACH ROW EXECUTE FUNCTION "private"."myvet_enforce_tenant_write"();


--
-- Name: payments myvet_tenant_write_guard; Type: TRIGGER; Schema: public; Owner: -
--

CREATE TRIGGER "myvet_tenant_write_guard" BEFORE INSERT OR DELETE OR UPDATE ON "public"."payments" FOR EACH ROW EXECUTE FUNCTION "private"."myvet_enforce_tenant_write"();


--
-- Name: physical_exams myvet_tenant_write_guard; Type: TRIGGER; Schema: public; Owner: -
--

CREATE TRIGGER "myvet_tenant_write_guard" BEFORE INSERT OR DELETE OR UPDATE ON "public"."physical_exams" FOR EACH ROW EXECUTE FUNCTION "private"."myvet_enforce_tenant_write"();


--
-- Name: prescriptions myvet_tenant_write_guard; Type: TRIGGER; Schema: public; Owner: -
--

CREATE TRIGGER "myvet_tenant_write_guard" BEFORE INSERT OR DELETE OR UPDATE ON "public"."prescriptions" FOR EACH ROW EXECUTE FUNCTION "private"."myvet_enforce_tenant_write"();


--
-- Name: reminders myvet_tenant_write_guard; Type: TRIGGER; Schema: public; Owner: -
--

CREATE TRIGGER "myvet_tenant_write_guard" BEFORE INSERT OR DELETE OR UPDATE ON "public"."reminders" FOR EACH ROW EXECUTE FUNCTION "private"."myvet_enforce_tenant_write"();


--
-- Name: service_catalog myvet_tenant_write_guard; Type: TRIGGER; Schema: public; Owner: -
--

CREATE TRIGGER "myvet_tenant_write_guard" BEFORE INSERT OR DELETE OR UPDATE ON "public"."service_catalog" FOR EACH ROW EXECUTE FUNCTION "private"."myvet_enforce_tenant_write"();


--
-- Name: staff myvet_tenant_write_guard; Type: TRIGGER; Schema: public; Owner: -
--

CREATE TRIGGER "myvet_tenant_write_guard" BEFORE INSERT OR DELETE OR UPDATE ON "public"."staff" FOR EACH ROW EXECUTE FUNCTION "private"."myvet_enforce_tenant_write"();


--
-- Name: vaccinations myvet_tenant_write_guard; Type: TRIGGER; Schema: public; Owner: -
--

CREATE TRIGGER "myvet_tenant_write_guard" BEFORE INSERT OR DELETE OR UPDATE ON "public"."vaccinations" FOR EACH ROW EXECUTE FUNCTION "private"."myvet_enforce_tenant_write"();


--
-- Name: vetbot_action_requests myvet_tenant_write_guard; Type: TRIGGER; Schema: public; Owner: -
--

CREATE TRIGGER "myvet_tenant_write_guard" BEFORE INSERT OR DELETE OR UPDATE ON "public"."vetbot_action_requests" FOR EACH ROW EXECUTE FUNCTION "private"."myvet_enforce_tenant_write"();


--
-- Name: vetbot_audit_logs myvet_tenant_write_guard; Type: TRIGGER; Schema: public; Owner: -
--

CREATE TRIGGER "myvet_tenant_write_guard" BEFORE INSERT OR DELETE OR UPDATE ON "public"."vetbot_audit_logs" FOR EACH ROW EXECUTE FUNCTION "private"."myvet_enforce_tenant_write"();


--
-- Name: vetbot_feedback myvet_tenant_write_guard; Type: TRIGGER; Schema: public; Owner: -
--

CREATE TRIGGER "myvet_tenant_write_guard" BEFORE INSERT OR DELETE OR UPDATE ON "public"."vetbot_feedback" FOR EACH ROW EXECUTE FUNCTION "private"."myvet_enforce_tenant_write"();


--
-- Name: vetbot_knowledge myvet_tenant_write_guard; Type: TRIGGER; Schema: public; Owner: -
--

CREATE TRIGGER "myvet_tenant_write_guard" BEFORE INSERT OR DELETE OR UPDATE ON "public"."vetbot_knowledge" FOR EACH ROW EXECUTE FUNCTION "private"."myvet_enforce_tenant_write"();


--
-- Name: video_sessions myvet_tenant_write_guard; Type: TRIGGER; Schema: public; Owner: -
--

CREATE TRIGGER "myvet_tenant_write_guard" BEFORE INSERT OR DELETE OR UPDATE ON "public"."video_sessions" FOR EACH ROW EXECUTE FUNCTION "private"."myvet_enforce_tenant_write"();


--
-- Name: ai_artifacts myvet_validate_ai_approval; Type: TRIGGER; Schema: public; Owner: -
--

CREATE TRIGGER "myvet_validate_ai_approval" BEFORE INSERT OR UPDATE ON "public"."ai_artifacts" FOR EACH ROW EXECUTE FUNCTION "private"."myvet_validate_ai_approval"();


--
-- Name: ai_artifacts myvet_validate_ai_scope; Type: TRIGGER; Schema: public; Owner: -
--

CREATE TRIGGER "myvet_validate_ai_scope" BEFORE INSERT OR UPDATE ON "public"."ai_artifacts" FOR EACH ROW EXECUTE FUNCTION "private"."myvet_validate_ai_scope"();


--
-- Name: ai_documents myvet_validate_ai_scope; Type: TRIGGER; Schema: public; Owner: -
--

CREATE TRIGGER "myvet_validate_ai_scope" BEFORE INSERT OR UPDATE ON "public"."ai_documents" FOR EACH ROW EXECUTE FUNCTION "private"."myvet_validate_ai_scope"();


--
-- Name: ai_operations myvet_validate_ai_scope; Type: TRIGGER; Schema: public; Owner: -
--

CREATE TRIGGER "myvet_validate_ai_scope" BEFORE INSERT OR UPDATE ON "public"."ai_operations" FOR EACH ROW EXECUTE FUNCTION "private"."myvet_validate_ai_scope"();


--
-- Name: ai_sources myvet_validate_ai_source; Type: TRIGGER; Schema: public; Owner: -
--

CREATE TRIGGER "myvet_validate_ai_source" BEFORE INSERT OR UPDATE ON "public"."ai_sources" FOR EACH ROW EXECUTE FUNCTION "private"."myvet_validate_ai_source"();


--
-- Name: service_catalog set_service_catalog_updated_at; Type: TRIGGER; Schema: public; Owner: -
--

CREATE TRIGGER "set_service_catalog_updated_at" BEFORE UPDATE ON "public"."service_catalog" FOR EACH ROW EXECUTE FUNCTION "public"."set_updated_at"();


--
-- Name: ai_approval_history ai_approval_history_actor_user_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY "public"."ai_approval_history"
    ADD CONSTRAINT "ai_approval_history_actor_user_id_fkey" FOREIGN KEY ("actor_user_id") REFERENCES "auth"."users"("id") ON DELETE SET NULL;


--
-- Name: ai_approval_history ai_approval_history_artifact_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY "public"."ai_approval_history"
    ADD CONSTRAINT "ai_approval_history_artifact_fkey" FOREIGN KEY ("clinic_id", "artifact_id") REFERENCES "public"."ai_artifacts"("clinic_id", "artifact_id") ON DELETE RESTRICT;


--
-- Name: ai_approval_history ai_approval_history_clinic_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY "public"."ai_approval_history"
    ADD CONSTRAINT "ai_approval_history_clinic_id_fkey" FOREIGN KEY ("clinic_id") REFERENCES "public"."clinics"("clinic_id") ON DELETE RESTRICT;


--
-- Name: ai_approval_history ai_approval_history_staff_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY "public"."ai_approval_history"
    ADD CONSTRAINT "ai_approval_history_staff_fkey" FOREIGN KEY ("clinic_id", "actor_staff_id") REFERENCES "public"."staff"("clinic_id", "staff_id") ON DELETE RESTRICT;


--
-- Name: ai_artifacts ai_artifacts_appointment_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY "public"."ai_artifacts"
    ADD CONSTRAINT "ai_artifacts_appointment_fkey" FOREIGN KEY ("clinic_id", "appointment_id") REFERENCES "public"."appointments"("clinic_id", "appointment_id") ON DELETE RESTRICT;


--
-- Name: ai_artifacts ai_artifacts_approved_by_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY "public"."ai_artifacts"
    ADD CONSTRAINT "ai_artifacts_approved_by_fkey" FOREIGN KEY ("clinic_id", "approved_by") REFERENCES "public"."staff"("clinic_id", "staff_id") ON DELETE RESTRICT;


--
-- Name: ai_artifacts ai_artifacts_clinic_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY "public"."ai_artifacts"
    ADD CONSTRAINT "ai_artifacts_clinic_id_fkey" FOREIGN KEY ("clinic_id") REFERENCES "public"."clinics"("clinic_id") ON DELETE RESTRICT;


--
-- Name: ai_artifacts ai_artifacts_created_by_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY "public"."ai_artifacts"
    ADD CONSTRAINT "ai_artifacts_created_by_fkey" FOREIGN KEY ("created_by") REFERENCES "auth"."users"("id") ON DELETE SET NULL;


--
-- Name: ai_artifacts ai_artifacts_operation_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY "public"."ai_artifacts"
    ADD CONSTRAINT "ai_artifacts_operation_fkey" FOREIGN KEY ("clinic_id", "operation_id") REFERENCES "public"."ai_operations"("clinic_id", "operation_id") ON DELETE RESTRICT;


--
-- Name: ai_artifacts ai_artifacts_owner_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY "public"."ai_artifacts"
    ADD CONSTRAINT "ai_artifacts_owner_fkey" FOREIGN KEY ("clinic_id", "owner_id") REFERENCES "public"."owners"("clinic_id", "owner_id") ON DELETE RESTRICT;


--
-- Name: ai_artifacts ai_artifacts_pet_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY "public"."ai_artifacts"
    ADD CONSTRAINT "ai_artifacts_pet_fkey" FOREIGN KEY ("clinic_id", "pet_id") REFERENCES "public"."patients"("clinic_id", "pet_id") ON DELETE RESTRICT;


--
-- Name: ai_artifacts ai_artifacts_supersedes_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY "public"."ai_artifacts"
    ADD CONSTRAINT "ai_artifacts_supersedes_fkey" FOREIGN KEY ("clinic_id", "supersedes_artifact_id") REFERENCES "public"."ai_artifacts"("clinic_id", "artifact_id") ON DELETE RESTRICT;


--
-- Name: ai_artifacts ai_artifacts_visit_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY "public"."ai_artifacts"
    ADD CONSTRAINT "ai_artifacts_visit_fkey" FOREIGN KEY ("clinic_id", "visit_id") REFERENCES "public"."medical_visits"("clinic_id", "visit_id") ON DELETE RESTRICT;


--
-- Name: ai_audit_events ai_audit_events_actor_user_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY "public"."ai_audit_events"
    ADD CONSTRAINT "ai_audit_events_actor_user_id_fkey" FOREIGN KEY ("actor_user_id") REFERENCES "auth"."users"("id") ON DELETE SET NULL;


--
-- Name: ai_audit_events ai_audit_events_clinic_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY "public"."ai_audit_events"
    ADD CONSTRAINT "ai_audit_events_clinic_id_fkey" FOREIGN KEY ("clinic_id") REFERENCES "public"."clinics"("clinic_id") ON DELETE RESTRICT;


--
-- Name: ai_audit_events ai_audit_events_operation_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY "public"."ai_audit_events"
    ADD CONSTRAINT "ai_audit_events_operation_fkey" FOREIGN KEY ("clinic_id", "operation_id") REFERENCES "public"."ai_operations"("clinic_id", "operation_id") ON DELETE SET NULL ("operation_id");


--
-- Name: ai_consent_records ai_consent_records_appointment_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY "public"."ai_consent_records"
    ADD CONSTRAINT "ai_consent_records_appointment_fkey" FOREIGN KEY ("clinic_id", "appointment_id") REFERENCES "public"."appointments"("clinic_id", "appointment_id") ON DELETE RESTRICT;


--
-- Name: ai_consent_records ai_consent_records_auth_user_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY "public"."ai_consent_records"
    ADD CONSTRAINT "ai_consent_records_auth_user_id_fkey" FOREIGN KEY ("auth_user_id") REFERENCES "auth"."users"("id") ON DELETE SET NULL;


--
-- Name: ai_consent_records ai_consent_records_clinic_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY "public"."ai_consent_records"
    ADD CONSTRAINT "ai_consent_records_clinic_id_fkey" FOREIGN KEY ("clinic_id") REFERENCES "public"."clinics"("clinic_id") ON DELETE RESTRICT;


--
-- Name: ai_consent_records ai_consent_records_created_by_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY "public"."ai_consent_records"
    ADD CONSTRAINT "ai_consent_records_created_by_fkey" FOREIGN KEY ("created_by") REFERENCES "auth"."users"("id") ON DELETE SET NULL;


--
-- Name: ai_consent_records ai_consent_records_owner_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY "public"."ai_consent_records"
    ADD CONSTRAINT "ai_consent_records_owner_fkey" FOREIGN KEY ("clinic_id", "owner_id") REFERENCES "public"."owners"("clinic_id", "owner_id") ON DELETE RESTRICT;


--
-- Name: ai_consent_records ai_consent_records_video_session_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY "public"."ai_consent_records"
    ADD CONSTRAINT "ai_consent_records_video_session_fkey" FOREIGN KEY ("clinic_id", "video_session_id") REFERENCES "public"."video_sessions"("clinic_id", "session_id") ON DELETE RESTRICT;


--
-- Name: ai_document_chunks ai_document_chunks_clinic_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY "public"."ai_document_chunks"
    ADD CONSTRAINT "ai_document_chunks_clinic_id_fkey" FOREIGN KEY ("clinic_id") REFERENCES "public"."clinics"("clinic_id") ON DELETE RESTRICT;


--
-- Name: ai_document_chunks ai_document_chunks_document_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY "public"."ai_document_chunks"
    ADD CONSTRAINT "ai_document_chunks_document_fkey" FOREIGN KEY ("clinic_id", "document_id") REFERENCES "public"."ai_documents"("clinic_id", "document_id") ON DELETE CASCADE;


--
-- Name: ai_document_chunks ai_document_chunks_owner_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY "public"."ai_document_chunks"
    ADD CONSTRAINT "ai_document_chunks_owner_fkey" FOREIGN KEY ("clinic_id", "owner_id") REFERENCES "public"."owners"("clinic_id", "owner_id") ON DELETE RESTRICT;


--
-- Name: ai_document_chunks ai_document_chunks_pet_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY "public"."ai_document_chunks"
    ADD CONSTRAINT "ai_document_chunks_pet_fkey" FOREIGN KEY ("clinic_id", "pet_id") REFERENCES "public"."patients"("clinic_id", "pet_id") ON DELETE CASCADE;


--
-- Name: ai_document_embeddings ai_document_embeddings_chunk_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY "public"."ai_document_embeddings"
    ADD CONSTRAINT "ai_document_embeddings_chunk_fkey" FOREIGN KEY ("clinic_id", "chunk_id") REFERENCES "public"."ai_document_chunks"("clinic_id", "chunk_id") ON DELETE CASCADE;


--
-- Name: ai_document_embeddings ai_document_embeddings_clinic_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY "public"."ai_document_embeddings"
    ADD CONSTRAINT "ai_document_embeddings_clinic_id_fkey" FOREIGN KEY ("clinic_id") REFERENCES "public"."clinics"("clinic_id") ON DELETE RESTRICT;


--
-- Name: ai_documents ai_documents_appointment_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY "public"."ai_documents"
    ADD CONSTRAINT "ai_documents_appointment_fkey" FOREIGN KEY ("clinic_id", "appointment_id") REFERENCES "public"."appointments"("clinic_id", "appointment_id") ON DELETE RESTRICT;


--
-- Name: ai_documents ai_documents_clinic_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY "public"."ai_documents"
    ADD CONSTRAINT "ai_documents_clinic_id_fkey" FOREIGN KEY ("clinic_id") REFERENCES "public"."clinics"("clinic_id") ON DELETE RESTRICT;


--
-- Name: ai_documents ai_documents_owner_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY "public"."ai_documents"
    ADD CONSTRAINT "ai_documents_owner_fkey" FOREIGN KEY ("clinic_id", "owner_id") REFERENCES "public"."owners"("clinic_id", "owner_id") ON DELETE RESTRICT;


--
-- Name: ai_documents ai_documents_pet_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY "public"."ai_documents"
    ADD CONSTRAINT "ai_documents_pet_fkey" FOREIGN KEY ("clinic_id", "pet_id") REFERENCES "public"."patients"("clinic_id", "pet_id") ON DELETE RESTRICT;


--
-- Name: ai_documents ai_documents_uploaded_by_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY "public"."ai_documents"
    ADD CONSTRAINT "ai_documents_uploaded_by_fkey" FOREIGN KEY ("uploaded_by") REFERENCES "auth"."users"("id") ON DELETE SET NULL;


--
-- Name: ai_documents ai_documents_visit_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY "public"."ai_documents"
    ADD CONSTRAINT "ai_documents_visit_fkey" FOREIGN KEY ("clinic_id", "visit_id") REFERENCES "public"."medical_visits"("clinic_id", "visit_id") ON DELETE RESTRICT;


--
-- Name: ai_feature_flags ai_feature_flags_clinic_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY "public"."ai_feature_flags"
    ADD CONSTRAINT "ai_feature_flags_clinic_id_fkey" FOREIGN KEY ("clinic_id") REFERENCES "public"."clinics"("clinic_id") ON DELETE CASCADE;


--
-- Name: ai_feature_flags ai_feature_flags_updated_by_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY "public"."ai_feature_flags"
    ADD CONSTRAINT "ai_feature_flags_updated_by_fkey" FOREIGN KEY ("updated_by") REFERENCES "auth"."users"("id") ON DELETE SET NULL;


--
-- Name: ai_operations ai_operations_actor_staff_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY "public"."ai_operations"
    ADD CONSTRAINT "ai_operations_actor_staff_fkey" FOREIGN KEY ("clinic_id", "actor_staff_id") REFERENCES "public"."staff"("clinic_id", "staff_id") ON DELETE RESTRICT;


--
-- Name: ai_operations ai_operations_actor_user_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY "public"."ai_operations"
    ADD CONSTRAINT "ai_operations_actor_user_id_fkey" FOREIGN KEY ("actor_user_id") REFERENCES "auth"."users"("id") ON DELETE SET NULL;


--
-- Name: ai_operations ai_operations_appointment_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY "public"."ai_operations"
    ADD CONSTRAINT "ai_operations_appointment_fkey" FOREIGN KEY ("clinic_id", "appointment_id") REFERENCES "public"."appointments"("clinic_id", "appointment_id") ON DELETE RESTRICT;


--
-- Name: ai_operations ai_operations_clinic_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY "public"."ai_operations"
    ADD CONSTRAINT "ai_operations_clinic_id_fkey" FOREIGN KEY ("clinic_id") REFERENCES "public"."clinics"("clinic_id") ON DELETE RESTRICT;


--
-- Name: ai_operations ai_operations_owner_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY "public"."ai_operations"
    ADD CONSTRAINT "ai_operations_owner_fkey" FOREIGN KEY ("clinic_id", "owner_id") REFERENCES "public"."owners"("clinic_id", "owner_id") ON DELETE RESTRICT;


--
-- Name: ai_operations ai_operations_pet_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY "public"."ai_operations"
    ADD CONSTRAINT "ai_operations_pet_fkey" FOREIGN KEY ("clinic_id", "pet_id") REFERENCES "public"."patients"("clinic_id", "pet_id") ON DELETE RESTRICT;


--
-- Name: ai_operations ai_operations_visit_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY "public"."ai_operations"
    ADD CONSTRAINT "ai_operations_visit_fkey" FOREIGN KEY ("clinic_id", "visit_id") REFERENCES "public"."medical_visits"("clinic_id", "visit_id") ON DELETE RESTRICT;


--
-- Name: ai_rate_limit_windows ai_rate_limit_windows_actor_user_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY "public"."ai_rate_limit_windows"
    ADD CONSTRAINT "ai_rate_limit_windows_actor_user_id_fkey" FOREIGN KEY ("actor_user_id") REFERENCES "auth"."users"("id") ON DELETE CASCADE;


--
-- Name: ai_rate_limit_windows ai_rate_limit_windows_clinic_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY "public"."ai_rate_limit_windows"
    ADD CONSTRAINT "ai_rate_limit_windows_clinic_id_fkey" FOREIGN KEY ("clinic_id") REFERENCES "public"."clinics"("clinic_id") ON DELETE CASCADE;


--
-- Name: ai_sources ai_sources_artifact_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY "public"."ai_sources"
    ADD CONSTRAINT "ai_sources_artifact_fkey" FOREIGN KEY ("clinic_id", "artifact_id") REFERENCES "public"."ai_artifacts"("clinic_id", "artifact_id") ON DELETE CASCADE;


--
-- Name: ai_sources ai_sources_chunk_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY "public"."ai_sources"
    ADD CONSTRAINT "ai_sources_chunk_fkey" FOREIGN KEY ("clinic_id", "chunk_id") REFERENCES "public"."ai_document_chunks"("clinic_id", "chunk_id") ON DELETE RESTRICT;


--
-- Name: ai_sources ai_sources_clinic_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY "public"."ai_sources"
    ADD CONSTRAINT "ai_sources_clinic_id_fkey" FOREIGN KEY ("clinic_id") REFERENCES "public"."clinics"("clinic_id") ON DELETE RESTRICT;


--
-- Name: ai_sources ai_sources_document_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY "public"."ai_sources"
    ADD CONSTRAINT "ai_sources_document_fkey" FOREIGN KEY ("clinic_id", "document_id") REFERENCES "public"."ai_documents"("clinic_id", "document_id") ON DELETE RESTRICT;


--
-- Name: appointments appointments_clinic_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY "public"."appointments"
    ADD CONSTRAINT "appointments_clinic_id_fkey" FOREIGN KEY ("clinic_id") REFERENCES "public"."clinics"("clinic_id") ON UPDATE RESTRICT ON DELETE RESTRICT;


--
-- Name: appointments appointments_pet_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY "public"."appointments"
    ADD CONSTRAINT "appointments_pet_id_fkey" FOREIGN KEY ("pet_id") REFERENCES "public"."patients"("pet_id");


--
-- Name: clinic_booking_blocks clinic_booking_blocks_clinic_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY "public"."clinic_booking_blocks"
    ADD CONSTRAINT "clinic_booking_blocks_clinic_id_fkey" FOREIGN KEY ("clinic_id") REFERENCES "public"."clinics"("clinic_id") ON UPDATE RESTRICT ON DELETE RESTRICT;


--
-- Name: clinic_booking_blocks clinic_booking_blocks_created_by_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY "public"."clinic_booking_blocks"
    ADD CONSTRAINT "clinic_booking_blocks_created_by_fkey" FOREIGN KEY ("created_by") REFERENCES "auth"."users"("id");


--
-- Name: clinic_booking_hours clinic_booking_hours_clinic_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY "public"."clinic_booking_hours"
    ADD CONSTRAINT "clinic_booking_hours_clinic_id_fkey" FOREIGN KEY ("clinic_id") REFERENCES "public"."clinics"("clinic_id") ON UPDATE RESTRICT ON DELETE RESTRICT;


--
-- Name: clinic_booking_hours clinic_booking_hours_updated_by_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY "public"."clinic_booking_hours"
    ADD CONSTRAINT "clinic_booking_hours_updated_by_fkey" FOREIGN KEY ("updated_by") REFERENCES "auth"."users"("id");


--
-- Name: conversations conversations_assigned_staff_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY "public"."conversations"
    ADD CONSTRAINT "conversations_assigned_staff_id_fkey" FOREIGN KEY ("assigned_staff_id") REFERENCES "public"."staff"("staff_id") ON UPDATE CASCADE ON DELETE SET NULL;


--
-- Name: conversations conversations_clinic_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY "public"."conversations"
    ADD CONSTRAINT "conversations_clinic_id_fkey" FOREIGN KEY ("clinic_id") REFERENCES "public"."clinics"("clinic_id") ON UPDATE RESTRICT ON DELETE RESTRICT;


--
-- Name: conversations conversations_owner_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY "public"."conversations"
    ADD CONSTRAINT "conversations_owner_id_fkey" FOREIGN KEY ("owner_id") REFERENCES "public"."owners"("owner_id") ON UPDATE CASCADE ON DELETE CASCADE;


--
-- Name: conversations conversations_pet_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY "public"."conversations"
    ADD CONSTRAINT "conversations_pet_id_fkey" FOREIGN KEY ("pet_id") REFERENCES "public"."patients"("pet_id") ON UPDATE CASCADE ON DELETE SET NULL;


--
-- Name: differential_diagnoses differential_diagnoses_clinic_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY "public"."differential_diagnoses"
    ADD CONSTRAINT "differential_diagnoses_clinic_id_fkey" FOREIGN KEY ("clinic_id") REFERENCES "public"."clinics"("clinic_id") ON UPDATE RESTRICT ON DELETE RESTRICT;


--
-- Name: differential_diagnoses differential_diagnoses_pet_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY "public"."differential_diagnoses"
    ADD CONSTRAINT "differential_diagnoses_pet_id_fkey" FOREIGN KEY ("pet_id") REFERENCES "public"."patients"("pet_id") ON UPDATE CASCADE ON DELETE CASCADE;


--
-- Name: differential_diagnoses differential_diagnoses_visit_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY "public"."differential_diagnoses"
    ADD CONSTRAINT "differential_diagnoses_visit_id_fkey" FOREIGN KEY ("visit_id") REFERENCES "public"."medical_visits"("visit_id") ON UPDATE CASCADE ON DELETE CASCADE;


--
-- Name: documents documents_clinic_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY "public"."documents"
    ADD CONSTRAINT "documents_clinic_id_fkey" FOREIGN KEY ("clinic_id") REFERENCES "public"."clinics"("clinic_id") ON UPDATE RESTRICT ON DELETE RESTRICT;


--
-- Name: documents documents_owner_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY "public"."documents"
    ADD CONSTRAINT "documents_owner_id_fkey" FOREIGN KEY ("owner_id") REFERENCES "public"."owners"("owner_id") ON UPDATE CASCADE ON DELETE SET NULL;


--
-- Name: documents documents_pet_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY "public"."documents"
    ADD CONSTRAINT "documents_pet_id_fkey" FOREIGN KEY ("pet_id") REFERENCES "public"."patients"("pet_id") ON UPDATE CASCADE ON DELETE SET NULL;


--
-- Name: documents documents_visit_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY "public"."documents"
    ADD CONSTRAINT "documents_visit_id_fkey" FOREIGN KEY ("visit_id") REFERENCES "public"."medical_visits"("visit_id") ON UPDATE CASCADE ON DELETE SET NULL;


--
-- Name: hospitalizations hospitalizations_clinic_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY "public"."hospitalizations"
    ADD CONSTRAINT "hospitalizations_clinic_id_fkey" FOREIGN KEY ("clinic_id") REFERENCES "public"."clinics"("clinic_id") ON UPDATE RESTRICT ON DELETE RESTRICT;


--
-- Name: hospitalizations hospitalizations_owner_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY "public"."hospitalizations"
    ADD CONSTRAINT "hospitalizations_owner_id_fkey" FOREIGN KEY ("owner_id") REFERENCES "public"."owners"("owner_id") ON UPDATE CASCADE ON DELETE SET NULL;


--
-- Name: hospitalizations hospitalizations_pet_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY "public"."hospitalizations"
    ADD CONSTRAINT "hospitalizations_pet_id_fkey" FOREIGN KEY ("pet_id") REFERENCES "public"."patients"("pet_id") ON UPDATE CASCADE ON DELETE CASCADE;


--
-- Name: hospitalizations hospitalizations_visit_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY "public"."hospitalizations"
    ADD CONSTRAINT "hospitalizations_visit_id_fkey" FOREIGN KEY ("visit_id") REFERENCES "public"."medical_visits"("visit_id") ON UPDATE CASCADE ON DELETE SET NULL;


--
-- Name: insights insights_clinic_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY "public"."insights"
    ADD CONSTRAINT "insights_clinic_id_fkey" FOREIGN KEY ("clinic_id") REFERENCES "public"."clinics"("clinic_id") ON UPDATE RESTRICT ON DELETE RESTRICT;


--
-- Name: insights insights_related_appointment_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY "public"."insights"
    ADD CONSTRAINT "insights_related_appointment_id_fkey" FOREIGN KEY ("related_appointment_id") REFERENCES "public"."appointments"("appointment_id") ON UPDATE CASCADE ON DELETE SET NULL;


--
-- Name: insights insights_related_lab_order_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY "public"."insights"
    ADD CONSTRAINT "insights_related_lab_order_id_fkey" FOREIGN KEY ("related_lab_order_id") REFERENCES "public"."lab_orders"("lab_order_id") ON UPDATE CASCADE ON DELETE SET NULL;


--
-- Name: insights insights_related_owner_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY "public"."insights"
    ADD CONSTRAINT "insights_related_owner_id_fkey" FOREIGN KEY ("related_owner_id") REFERENCES "public"."owners"("owner_id") ON UPDATE CASCADE ON DELETE SET NULL;


--
-- Name: insights insights_related_payment_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY "public"."insights"
    ADD CONSTRAINT "insights_related_payment_id_fkey" FOREIGN KEY ("related_payment_id") REFERENCES "public"."payments"("payment_id") ON UPDATE CASCADE ON DELETE SET NULL;


--
-- Name: insights insights_related_pet_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY "public"."insights"
    ADD CONSTRAINT "insights_related_pet_id_fkey" FOREIGN KEY ("related_pet_id") REFERENCES "public"."patients"("pet_id") ON UPDATE CASCADE ON DELETE SET NULL;


--
-- Name: inventory inventory_clinic_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY "public"."inventory"
    ADD CONSTRAINT "inventory_clinic_id_fkey" FOREIGN KEY ("clinic_id") REFERENCES "public"."clinics"("clinic_id") ON UPDATE RESTRICT ON DELETE RESTRICT;


--
-- Name: lab_orders lab_orders_clinic_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY "public"."lab_orders"
    ADD CONSTRAINT "lab_orders_clinic_id_fkey" FOREIGN KEY ("clinic_id") REFERENCES "public"."clinics"("clinic_id") ON UPDATE RESTRICT ON DELETE RESTRICT;


--
-- Name: lab_orders lab_orders_ordered_by_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY "public"."lab_orders"
    ADD CONSTRAINT "lab_orders_ordered_by_fkey" FOREIGN KEY ("ordered_by") REFERENCES "public"."staff"("staff_id");


--
-- Name: lab_orders lab_orders_pet_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY "public"."lab_orders"
    ADD CONSTRAINT "lab_orders_pet_id_fkey" FOREIGN KEY ("pet_id") REFERENCES "public"."patients"("pet_id");


--
-- Name: lab_orders lab_orders_visit_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY "public"."lab_orders"
    ADD CONSTRAINT "lab_orders_visit_id_fkey" FOREIGN KEY ("visit_id") REFERENCES "public"."medical_visits"("visit_id") ON UPDATE CASCADE ON DELETE SET NULL;


--
-- Name: medical_problems medical_problems_clinic_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY "public"."medical_problems"
    ADD CONSTRAINT "medical_problems_clinic_id_fkey" FOREIGN KEY ("clinic_id") REFERENCES "public"."clinics"("clinic_id") ON UPDATE RESTRICT ON DELETE RESTRICT;


--
-- Name: medical_problems medical_problems_pet_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY "public"."medical_problems"
    ADD CONSTRAINT "medical_problems_pet_id_fkey" FOREIGN KEY ("pet_id") REFERENCES "public"."patients"("pet_id") ON UPDATE CASCADE ON DELETE CASCADE;


--
-- Name: medical_problems medical_problems_visit_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY "public"."medical_problems"
    ADD CONSTRAINT "medical_problems_visit_id_fkey" FOREIGN KEY ("visit_id") REFERENCES "public"."medical_visits"("visit_id") ON UPDATE CASCADE ON DELETE CASCADE;


--
-- Name: medical_visits medical_visits_appointment_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY "public"."medical_visits"
    ADD CONSTRAINT "medical_visits_appointment_id_fkey" FOREIGN KEY ("appointment_id") REFERENCES "public"."appointments"("appointment_id");


--
-- Name: medical_visits medical_visits_clinic_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY "public"."medical_visits"
    ADD CONSTRAINT "medical_visits_clinic_id_fkey" FOREIGN KEY ("clinic_id") REFERENCES "public"."clinics"("clinic_id") ON UPDATE RESTRICT ON DELETE RESTRICT;


--
-- Name: medical_visits medical_visits_pet_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY "public"."medical_visits"
    ADD CONSTRAINT "medical_visits_pet_id_fkey" FOREIGN KEY ("pet_id") REFERENCES "public"."patients"("pet_id");


--
-- Name: message_attachments message_attachments_clinic_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY "public"."message_attachments"
    ADD CONSTRAINT "message_attachments_clinic_id_fkey" FOREIGN KEY ("clinic_id") REFERENCES "public"."clinics"("clinic_id") ON UPDATE RESTRICT ON DELETE RESTRICT;


--
-- Name: message_attachments message_attachments_conversation_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY "public"."message_attachments"
    ADD CONSTRAINT "message_attachments_conversation_id_fkey" FOREIGN KEY ("conversation_id") REFERENCES "public"."conversations"("conversation_id") ON UPDATE CASCADE ON DELETE CASCADE;


--
-- Name: message_attachments message_attachments_message_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY "public"."message_attachments"
    ADD CONSTRAINT "message_attachments_message_id_fkey" FOREIGN KEY ("message_id") REFERENCES "public"."messages"("message_id") ON UPDATE CASCADE ON DELETE CASCADE;


--
-- Name: message_attachments message_attachments_owner_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY "public"."message_attachments"
    ADD CONSTRAINT "message_attachments_owner_id_fkey" FOREIGN KEY ("owner_id") REFERENCES "public"."owners"("owner_id") ON UPDATE CASCADE ON DELETE SET NULL;


--
-- Name: message_attachments message_attachments_pet_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY "public"."message_attachments"
    ADD CONSTRAINT "message_attachments_pet_id_fkey" FOREIGN KEY ("pet_id") REFERENCES "public"."patients"("pet_id") ON UPDATE CASCADE ON DELETE SET NULL;


--
-- Name: messages messages_clinic_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY "public"."messages"
    ADD CONSTRAINT "messages_clinic_id_fkey" FOREIGN KEY ("clinic_id") REFERENCES "public"."clinics"("clinic_id") ON UPDATE RESTRICT ON DELETE RESTRICT;


--
-- Name: messages messages_conversation_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY "public"."messages"
    ADD CONSTRAINT "messages_conversation_id_fkey" FOREIGN KEY ("conversation_id") REFERENCES "public"."conversations"("conversation_id") ON UPDATE CASCADE ON DELETE CASCADE;


--
-- Name: messages messages_sender_owner_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY "public"."messages"
    ADD CONSTRAINT "messages_sender_owner_id_fkey" FOREIGN KEY ("sender_owner_id") REFERENCES "public"."owners"("owner_id") ON UPDATE CASCADE ON DELETE SET NULL;


--
-- Name: messages messages_sender_staff_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY "public"."messages"
    ADD CONSTRAINT "messages_sender_staff_id_fkey" FOREIGN KEY ("sender_staff_id") REFERENCES "public"."staff"("staff_id") ON UPDATE CASCADE ON DELETE SET NULL;


--
-- Name: notifications notifications_clinic_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY "public"."notifications"
    ADD CONSTRAINT "notifications_clinic_id_fkey" FOREIGN KEY ("clinic_id") REFERENCES "public"."clinics"("clinic_id") ON UPDATE RESTRICT ON DELETE RESTRICT;


--
-- Name: notifications notifications_owner_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY "public"."notifications"
    ADD CONSTRAINT "notifications_owner_id_fkey" FOREIGN KEY ("owner_id") REFERENCES "public"."owners"("owner_id") ON UPDATE CASCADE ON DELETE CASCADE;


--
-- Name: notifications notifications_pet_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY "public"."notifications"
    ADD CONSTRAINT "notifications_pet_id_fkey" FOREIGN KEY ("pet_id") REFERENCES "public"."patients"("pet_id") ON UPDATE CASCADE ON DELETE CASCADE;


--
-- Name: owners owners_clinic_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY "public"."owners"
    ADD CONSTRAINT "owners_clinic_id_fkey" FOREIGN KEY ("clinic_id") REFERENCES "public"."clinics"("clinic_id") ON UPDATE RESTRICT ON DELETE RESTRICT;


--
-- Name: patients patients_clinic_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY "public"."patients"
    ADD CONSTRAINT "patients_clinic_id_fkey" FOREIGN KEY ("clinic_id") REFERENCES "public"."clinics"("clinic_id") ON UPDATE RESTRICT ON DELETE RESTRICT;


--
-- Name: patients patients_clinic_owner_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY "public"."patients"
    ADD CONSTRAINT "patients_clinic_owner_fkey" FOREIGN KEY ("clinic_id", "owner_id") REFERENCES "public"."owners"("clinic_id", "owner_id") ON UPDATE RESTRICT ON DELETE RESTRICT;


--
-- Name: patients patients_owner_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY "public"."patients"
    ADD CONSTRAINT "patients_owner_id_fkey" FOREIGN KEY ("owner_id") REFERENCES "public"."owners"("owner_id");


--
-- Name: payment_items payment_items_clinic_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY "public"."payment_items"
    ADD CONSTRAINT "payment_items_clinic_id_fkey" FOREIGN KEY ("clinic_id") REFERENCES "public"."clinics"("clinic_id") ON UPDATE RESTRICT ON DELETE RESTRICT;


--
-- Name: payment_items payment_items_payment_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY "public"."payment_items"
    ADD CONSTRAINT "payment_items_payment_id_fkey" FOREIGN KEY ("payment_id") REFERENCES "public"."payments"("payment_id") ON DELETE CASCADE;


--
-- Name: payment_transactions payment_transactions_clinic_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY "public"."payment_transactions"
    ADD CONSTRAINT "payment_transactions_clinic_id_fkey" FOREIGN KEY ("clinic_id") REFERENCES "public"."clinics"("clinic_id") ON UPDATE RESTRICT ON DELETE RESTRICT;


--
-- Name: payment_transactions payment_transactions_owner_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY "public"."payment_transactions"
    ADD CONSTRAINT "payment_transactions_owner_id_fkey" FOREIGN KEY ("owner_id") REFERENCES "public"."owners"("owner_id") ON DELETE RESTRICT;


--
-- Name: payment_transactions payment_transactions_payment_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY "public"."payment_transactions"
    ADD CONSTRAINT "payment_transactions_payment_id_fkey" FOREIGN KEY ("payment_id") REFERENCES "public"."payments"("payment_id") ON DELETE RESTRICT;


--
-- Name: payments payments_appointment_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY "public"."payments"
    ADD CONSTRAINT "payments_appointment_id_fkey" FOREIGN KEY ("appointment_id") REFERENCES "public"."appointments"("appointment_id") ON UPDATE CASCADE ON DELETE SET NULL;


--
-- Name: payments payments_clinic_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY "public"."payments"
    ADD CONSTRAINT "payments_clinic_id_fkey" FOREIGN KEY ("clinic_id") REFERENCES "public"."clinics"("clinic_id") ON UPDATE RESTRICT ON DELETE RESTRICT;


--
-- Name: payments payments_owner_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY "public"."payments"
    ADD CONSTRAINT "payments_owner_id_fkey" FOREIGN KEY ("owner_id") REFERENCES "public"."owners"("owner_id") ON UPDATE CASCADE ON DELETE RESTRICT;


--
-- Name: payments payments_pet_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY "public"."payments"
    ADD CONSTRAINT "payments_pet_id_fkey" FOREIGN KEY ("pet_id") REFERENCES "public"."patients"("pet_id") ON UPDATE CASCADE ON DELETE SET NULL;


--
-- Name: payments payments_visit_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY "public"."payments"
    ADD CONSTRAINT "payments_visit_id_fkey" FOREIGN KEY ("visit_id") REFERENCES "public"."medical_visits"("visit_id") ON UPDATE CASCADE ON DELETE SET NULL;


--
-- Name: physical_exams physical_exams_clinic_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY "public"."physical_exams"
    ADD CONSTRAINT "physical_exams_clinic_id_fkey" FOREIGN KEY ("clinic_id") REFERENCES "public"."clinics"("clinic_id") ON UPDATE RESTRICT ON DELETE RESTRICT;


--
-- Name: physical_exams physical_exams_pet_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY "public"."physical_exams"
    ADD CONSTRAINT "physical_exams_pet_id_fkey" FOREIGN KEY ("pet_id") REFERENCES "public"."patients"("pet_id") ON UPDATE CASCADE ON DELETE CASCADE;


--
-- Name: physical_exams physical_exams_visit_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY "public"."physical_exams"
    ADD CONSTRAINT "physical_exams_visit_id_fkey" FOREIGN KEY ("visit_id") REFERENCES "public"."medical_visits"("visit_id") ON UPDATE CASCADE ON DELETE CASCADE;


--
-- Name: prescriptions prescriptions_clinic_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY "public"."prescriptions"
    ADD CONSTRAINT "prescriptions_clinic_id_fkey" FOREIGN KEY ("clinic_id") REFERENCES "public"."clinics"("clinic_id") ON UPDATE RESTRICT ON DELETE RESTRICT;


--
-- Name: prescriptions prescriptions_pet_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY "public"."prescriptions"
    ADD CONSTRAINT "prescriptions_pet_id_fkey" FOREIGN KEY ("pet_id") REFERENCES "public"."patients"("pet_id");


--
-- Name: prescriptions prescriptions_prescribed_by_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY "public"."prescriptions"
    ADD CONSTRAINT "prescriptions_prescribed_by_fkey" FOREIGN KEY ("prescribed_by") REFERENCES "public"."staff"("staff_id");


--
-- Name: prescriptions prescriptions_visit_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY "public"."prescriptions"
    ADD CONSTRAINT "prescriptions_visit_id_fkey" FOREIGN KEY ("visit_id") REFERENCES "public"."medical_visits"("visit_id");


--
-- Name: reminders reminders_appointment_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY "public"."reminders"
    ADD CONSTRAINT "reminders_appointment_id_fkey" FOREIGN KEY ("appointment_id") REFERENCES "public"."appointments"("appointment_id") ON UPDATE CASCADE ON DELETE SET NULL;


--
-- Name: reminders reminders_clinic_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY "public"."reminders"
    ADD CONSTRAINT "reminders_clinic_id_fkey" FOREIGN KEY ("clinic_id") REFERENCES "public"."clinics"("clinic_id") ON UPDATE RESTRICT ON DELETE RESTRICT;


--
-- Name: reminders reminders_owner_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY "public"."reminders"
    ADD CONSTRAINT "reminders_owner_id_fkey" FOREIGN KEY ("owner_id") REFERENCES "public"."owners"("owner_id") ON UPDATE CASCADE ON DELETE CASCADE;


--
-- Name: reminders reminders_pet_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY "public"."reminders"
    ADD CONSTRAINT "reminders_pet_id_fkey" FOREIGN KEY ("pet_id") REFERENCES "public"."patients"("pet_id") ON UPDATE CASCADE ON DELETE CASCADE;


--
-- Name: reminders reminders_visit_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY "public"."reminders"
    ADD CONSTRAINT "reminders_visit_id_fkey" FOREIGN KEY ("visit_id") REFERENCES "public"."medical_visits"("visit_id") ON UPDATE CASCADE ON DELETE SET NULL;


--
-- Name: service_catalog service_catalog_clinic_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY "public"."service_catalog"
    ADD CONSTRAINT "service_catalog_clinic_id_fkey" FOREIGN KEY ("clinic_id") REFERENCES "public"."clinics"("clinic_id") ON UPDATE RESTRICT ON DELETE RESTRICT;


--
-- Name: staff staff_auth_user_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY "public"."staff"
    ADD CONSTRAINT "staff_auth_user_id_fkey" FOREIGN KEY ("auth_user_id") REFERENCES "auth"."users"("id") ON DELETE SET NULL;


--
-- Name: staff staff_clinic_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY "public"."staff"
    ADD CONSTRAINT "staff_clinic_id_fkey" FOREIGN KEY ("clinic_id") REFERENCES "public"."clinics"("clinic_id") ON UPDATE RESTRICT ON DELETE RESTRICT;


--
-- Name: vaccinations vaccinations_clinic_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY "public"."vaccinations"
    ADD CONSTRAINT "vaccinations_clinic_id_fkey" FOREIGN KEY ("clinic_id") REFERENCES "public"."clinics"("clinic_id") ON UPDATE RESTRICT ON DELETE RESTRICT;


--
-- Name: vaccinations vaccinations_owner_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY "public"."vaccinations"
    ADD CONSTRAINT "vaccinations_owner_id_fkey" FOREIGN KEY ("owner_id") REFERENCES "public"."owners"("owner_id") ON DELETE SET NULL;


--
-- Name: vaccinations vaccinations_pet_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY "public"."vaccinations"
    ADD CONSTRAINT "vaccinations_pet_id_fkey" FOREIGN KEY ("pet_id") REFERENCES "public"."patients"("pet_id") ON DELETE CASCADE;


--
-- Name: vetbot_action_requests vetbot_action_requests_actor_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY "public"."vetbot_action_requests"
    ADD CONSTRAINT "vetbot_action_requests_actor_id_fkey" FOREIGN KEY ("actor_id") REFERENCES "auth"."users"("id") ON DELETE CASCADE;


--
-- Name: vetbot_action_requests vetbot_action_requests_clinic_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY "public"."vetbot_action_requests"
    ADD CONSTRAINT "vetbot_action_requests_clinic_id_fkey" FOREIGN KEY ("clinic_id") REFERENCES "public"."clinics"("clinic_id") ON UPDATE RESTRICT ON DELETE RESTRICT;


--
-- Name: vetbot_audit_logs vetbot_audit_logs_clinic_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY "public"."vetbot_audit_logs"
    ADD CONSTRAINT "vetbot_audit_logs_clinic_id_fkey" FOREIGN KEY ("clinic_id") REFERENCES "public"."clinics"("clinic_id") ON UPDATE RESTRICT ON DELETE RESTRICT;


--
-- Name: vetbot_feedback vetbot_feedback_clinic_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY "public"."vetbot_feedback"
    ADD CONSTRAINT "vetbot_feedback_clinic_id_fkey" FOREIGN KEY ("clinic_id") REFERENCES "public"."clinics"("clinic_id") ON UPDATE RESTRICT ON DELETE RESTRICT;


--
-- Name: vetbot_knowledge vetbot_knowledge_clinic_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY "public"."vetbot_knowledge"
    ADD CONSTRAINT "vetbot_knowledge_clinic_id_fkey" FOREIGN KEY ("clinic_id") REFERENCES "public"."clinics"("clinic_id") ON UPDATE RESTRICT ON DELETE RESTRICT;


--
-- Name: video_sessions video_sessions_appointment_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY "public"."video_sessions"
    ADD CONSTRAINT "video_sessions_appointment_fkey" FOREIGN KEY ("clinic_id", "appointment_id") REFERENCES "public"."appointments"("clinic_id", "appointment_id") ON DELETE RESTRICT;


--
-- Name: video_sessions video_sessions_clinic_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY "public"."video_sessions"
    ADD CONSTRAINT "video_sessions_clinic_id_fkey" FOREIGN KEY ("clinic_id") REFERENCES "public"."clinics"("clinic_id") ON UPDATE RESTRICT ON DELETE RESTRICT;


--
-- Name: video_sessions video_sessions_conversation_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY "public"."video_sessions"
    ADD CONSTRAINT "video_sessions_conversation_id_fkey" FOREIGN KEY ("conversation_id") REFERENCES "public"."conversations"("conversation_id") ON UPDATE CASCADE ON DELETE CASCADE;


--
-- Name: video_sessions video_sessions_owner_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY "public"."video_sessions"
    ADD CONSTRAINT "video_sessions_owner_id_fkey" FOREIGN KEY ("owner_id") REFERENCES "public"."owners"("owner_id") ON UPDATE CASCADE ON DELETE SET NULL;


--
-- Name: video_sessions video_sessions_pet_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY "public"."video_sessions"
    ADD CONSTRAINT "video_sessions_pet_id_fkey" FOREIGN KEY ("pet_id") REFERENCES "public"."patients"("pet_id") ON UPDATE CASCADE ON DELETE SET NULL;


--
-- Name: video_sessions video_sessions_recording_document_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY "public"."video_sessions"
    ADD CONSTRAINT "video_sessions_recording_document_fkey" FOREIGN KEY ("clinic_id", "recording_document_id") REFERENCES "public"."ai_documents"("clinic_id", "document_id") ON DELETE RESTRICT;


--
-- Name: video_sessions video_sessions_staff_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY "public"."video_sessions"
    ADD CONSTRAINT "video_sessions_staff_id_fkey" FOREIGN KEY ("staff_id") REFERENCES "public"."staff"("staff_id") ON UPDATE CASCADE ON DELETE SET NULL;


--
-- Name: video_sessions video_sessions_transcript_artifact_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY "public"."video_sessions"
    ADD CONSTRAINT "video_sessions_transcript_artifact_fkey" FOREIGN KEY ("clinic_id", "transcript_artifact_id") REFERENCES "public"."ai_artifacts"("clinic_id", "artifact_id") ON DELETE RESTRICT;


--
-- Name: video_sessions video_sessions_visit_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY "public"."video_sessions"
    ADD CONSTRAINT "video_sessions_visit_fkey" FOREIGN KEY ("clinic_id", "visit_id") REFERENCES "public"."medical_visits"("clinic_id", "visit_id") ON DELETE RESTRICT;


--
-- Name: ai_approval_history ai_approval_clinical_select; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY "ai_approval_clinical_select" ON "public"."ai_approval_history" FOR SELECT TO "authenticated" USING (( SELECT "private"."myvet_is_clinic_staff"("ai_approval_history"."clinic_id", ARRAY['clinic_admin'::"text", 'vet'::"text"]) AS "myvet_is_clinic_staff"));


--
-- Name: ai_approval_history; Type: ROW SECURITY; Schema: public; Owner: -
--

ALTER TABLE "public"."ai_approval_history" ENABLE ROW LEVEL SECURITY;

--
-- Name: ai_artifacts; Type: ROW SECURITY; Schema: public; Owner: -
--

ALTER TABLE "public"."ai_artifacts" ENABLE ROW LEVEL SECURITY;

--
-- Name: ai_artifacts ai_artifacts_clinical_select; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY "ai_artifacts_clinical_select" ON "public"."ai_artifacts" FOR SELECT TO "authenticated" USING (( SELECT "private"."myvet_is_clinic_staff"("ai_artifacts"."clinic_id", ARRAY['clinic_admin'::"text", 'vet'::"text"]) AS "myvet_is_clinic_staff"));


--
-- Name: ai_artifacts ai_artifacts_owner_released_select; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY "ai_artifacts_owner_released_select" ON "public"."ai_artifacts" FOR SELECT TO "authenticated" USING ((("status" = 'approved'::"text") AND ("released_to_owner" = true) AND ("artifact_type" <> ALL (ARRAY['transcript'::"text", 'document_extraction'::"text"])) AND ("pet_id" IS NOT NULL) AND ( SELECT "private"."myvet_owner_owns_pet"("ai_artifacts"."clinic_id", "ai_artifacts"."pet_id") AS "myvet_owner_owns_pet")));


--
-- Name: ai_audit_events ai_audit_admin_select; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY "ai_audit_admin_select" ON "public"."ai_audit_events" FOR SELECT TO "authenticated" USING (( SELECT "private"."myvet_is_clinic_staff"("ai_audit_events"."clinic_id", ARRAY['clinic_admin'::"text"]) AS "myvet_is_clinic_staff"));


--
-- Name: ai_audit_events; Type: ROW SECURITY; Schema: public; Owner: -
--

ALTER TABLE "public"."ai_audit_events" ENABLE ROW LEVEL SECURITY;

--
-- Name: ai_consent_records ai_consent_clinical_select; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY "ai_consent_clinical_select" ON "public"."ai_consent_records" FOR SELECT TO "authenticated" USING (( SELECT "private"."myvet_is_clinic_staff"("ai_consent_records"."clinic_id", ARRAY['clinic_admin'::"text", 'vet'::"text"]) AS "myvet_is_clinic_staff"));


--
-- Name: ai_consent_records ai_consent_owner_select; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY "ai_consent_owner_select" ON "public"."ai_consent_records" FOR SELECT TO "authenticated" USING ((("owner_id" = ( SELECT "public"."myvet_current_owner_id"() AS "myvet_current_owner_id")) AND ("auth_user_id" = ( SELECT "auth"."uid"() AS "uid"))));


--
-- Name: ai_consent_records; Type: ROW SECURITY; Schema: public; Owner: -
--

ALTER TABLE "public"."ai_consent_records" ENABLE ROW LEVEL SECURITY;

--
-- Name: ai_document_chunks; Type: ROW SECURITY; Schema: public; Owner: -
--

ALTER TABLE "public"."ai_document_chunks" ENABLE ROW LEVEL SECURITY;

--
-- Name: ai_document_embeddings; Type: ROW SECURITY; Schema: public; Owner: -
--

ALTER TABLE "public"."ai_document_embeddings" ENABLE ROW LEVEL SECURITY;

--
-- Name: ai_documents; Type: ROW SECURITY; Schema: public; Owner: -
--

ALTER TABLE "public"."ai_documents" ENABLE ROW LEVEL SECURITY;

--
-- Name: ai_documents ai_documents_clinical_select; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY "ai_documents_clinical_select" ON "public"."ai_documents" FOR SELECT TO "authenticated" USING (( SELECT "private"."myvet_is_clinic_staff"("ai_documents"."clinic_id", ARRAY['clinic_admin'::"text", 'vet'::"text"]) AS "myvet_is_clinic_staff"));


--
-- Name: ai_feature_flags; Type: ROW SECURITY; Schema: public; Owner: -
--

ALTER TABLE "public"."ai_feature_flags" ENABLE ROW LEVEL SECURITY;

--
-- Name: ai_feature_flags ai_feature_flags_admin_select; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY "ai_feature_flags_admin_select" ON "public"."ai_feature_flags" FOR SELECT TO "authenticated" USING (( SELECT "private"."myvet_is_clinic_staff"("ai_feature_flags"."clinic_id", ARRAY['clinic_admin'::"text"]) AS "myvet_is_clinic_staff"));


--
-- Name: ai_operations; Type: ROW SECURITY; Schema: public; Owner: -
--

ALTER TABLE "public"."ai_operations" ENABLE ROW LEVEL SECURITY;

--
-- Name: ai_operations ai_operations_clinical_select; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY "ai_operations_clinical_select" ON "public"."ai_operations" FOR SELECT TO "authenticated" USING (( SELECT "private"."myvet_is_clinic_staff"("ai_operations"."clinic_id", ARRAY['clinic_admin'::"text", 'vet'::"text"]) AS "myvet_is_clinic_staff"));


--
-- Name: ai_rate_limit_windows; Type: ROW SECURITY; Schema: public; Owner: -
--

ALTER TABLE "public"."ai_rate_limit_windows" ENABLE ROW LEVEL SECURITY;

--
-- Name: ai_sources; Type: ROW SECURITY; Schema: public; Owner: -
--

ALTER TABLE "public"."ai_sources" ENABLE ROW LEVEL SECURITY;

--
-- Name: ai_sources ai_sources_clinical_select; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY "ai_sources_clinical_select" ON "public"."ai_sources" FOR SELECT TO "authenticated" USING (( SELECT "private"."myvet_is_clinic_staff"("ai_sources"."clinic_id", ARRAY['clinic_admin'::"text", 'vet'::"text"]) AS "myvet_is_clinic_staff"));


--
-- Name: appointments; Type: ROW SECURITY; Schema: public; Owner: -
--

ALTER TABLE "public"."appointments" ENABLE ROW LEVEL SECURITY;

--
-- Name: clinic_booking_blocks; Type: ROW SECURITY; Schema: public; Owner: -
--

ALTER TABLE "public"."clinic_booking_blocks" ENABLE ROW LEVEL SECURITY;

--
-- Name: clinic_booking_hours; Type: ROW SECURITY; Schema: public; Owner: -
--

ALTER TABLE "public"."clinic_booking_hours" ENABLE ROW LEVEL SECURITY;

--
-- Name: clinics; Type: ROW SECURITY; Schema: public; Owner: -
--

ALTER TABLE "public"."clinics" ENABLE ROW LEVEL SECURITY;

--
-- Name: conversations; Type: ROW SECURITY; Schema: public; Owner: -
--

ALTER TABLE "public"."conversations" ENABLE ROW LEVEL SECURITY;

--
-- Name: differential_diagnoses; Type: ROW SECURITY; Schema: public; Owner: -
--

ALTER TABLE "public"."differential_diagnoses" ENABLE ROW LEVEL SECURITY;

--
-- Name: documents; Type: ROW SECURITY; Schema: public; Owner: -
--

ALTER TABLE "public"."documents" ENABLE ROW LEVEL SECURITY;

--
-- Name: hospitalizations; Type: ROW SECURITY; Schema: public; Owner: -
--

ALTER TABLE "public"."hospitalizations" ENABLE ROW LEVEL SECURITY;

--
-- Name: insights; Type: ROW SECURITY; Schema: public; Owner: -
--

ALTER TABLE "public"."insights" ENABLE ROW LEVEL SECURITY;

--
-- Name: inventory; Type: ROW SECURITY; Schema: public; Owner: -
--

ALTER TABLE "public"."inventory" ENABLE ROW LEVEL SECURITY;

--
-- Name: lab_orders; Type: ROW SECURITY; Schema: public; Owner: -
--

ALTER TABLE "public"."lab_orders" ENABLE ROW LEVEL SECURITY;

--
-- Name: medical_problems; Type: ROW SECURITY; Schema: public; Owner: -
--

ALTER TABLE "public"."medical_problems" ENABLE ROW LEVEL SECURITY;

--
-- Name: medical_visits; Type: ROW SECURITY; Schema: public; Owner: -
--

ALTER TABLE "public"."medical_visits" ENABLE ROW LEVEL SECURITY;

--
-- Name: message_attachments; Type: ROW SECURITY; Schema: public; Owner: -
--

ALTER TABLE "public"."message_attachments" ENABLE ROW LEVEL SECURITY;

--
-- Name: messages; Type: ROW SECURITY; Schema: public; Owner: -
--

ALTER TABLE "public"."messages" ENABLE ROW LEVEL SECURITY;

--
-- Name: appointments myvet_active_staff_all; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY "myvet_active_staff_all" ON "public"."appointments" TO "authenticated" USING (( SELECT "private"."myvet_is_clinic_staff"("appointments"."clinic_id", NULL::"text"[]) AS "myvet_is_clinic_staff")) WITH CHECK (( SELECT "private"."myvet_is_clinic_staff"("appointments"."clinic_id", NULL::"text"[]) AS "myvet_is_clinic_staff"));


--
-- Name: clinic_booking_blocks myvet_active_staff_all; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY "myvet_active_staff_all" ON "public"."clinic_booking_blocks" TO "authenticated" USING (( SELECT "private"."myvet_is_clinic_staff"("clinic_booking_blocks"."clinic_id", NULL::"text"[]) AS "myvet_is_clinic_staff")) WITH CHECK (( SELECT "private"."myvet_is_clinic_staff"("clinic_booking_blocks"."clinic_id", NULL::"text"[]) AS "myvet_is_clinic_staff"));


--
-- Name: clinic_booking_hours myvet_active_staff_all; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY "myvet_active_staff_all" ON "public"."clinic_booking_hours" TO "authenticated" USING (( SELECT "private"."myvet_is_clinic_staff"("clinic_booking_hours"."clinic_id", NULL::"text"[]) AS "myvet_is_clinic_staff")) WITH CHECK (( SELECT "private"."myvet_is_clinic_staff"("clinic_booking_hours"."clinic_id", NULL::"text"[]) AS "myvet_is_clinic_staff"));


--
-- Name: conversations myvet_active_staff_all; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY "myvet_active_staff_all" ON "public"."conversations" TO "authenticated" USING (( SELECT "private"."myvet_is_clinic_staff"("conversations"."clinic_id", NULL::"text"[]) AS "myvet_is_clinic_staff")) WITH CHECK (( SELECT "private"."myvet_is_clinic_staff"("conversations"."clinic_id", NULL::"text"[]) AS "myvet_is_clinic_staff"));


--
-- Name: differential_diagnoses myvet_active_staff_all; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY "myvet_active_staff_all" ON "public"."differential_diagnoses" TO "authenticated" USING (( SELECT "private"."myvet_is_clinic_staff"("differential_diagnoses"."clinic_id", ARRAY['clinic_admin'::"text", 'vet'::"text", 'nurse'::"text"]) AS "myvet_is_clinic_staff")) WITH CHECK (( SELECT "private"."myvet_is_clinic_staff"("differential_diagnoses"."clinic_id", ARRAY['clinic_admin'::"text", 'vet'::"text", 'nurse'::"text"]) AS "myvet_is_clinic_staff"));


--
-- Name: documents myvet_active_staff_all; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY "myvet_active_staff_all" ON "public"."documents" TO "authenticated" USING (( SELECT "private"."myvet_is_clinic_staff"("documents"."clinic_id", ARRAY['clinic_admin'::"text", 'vet'::"text", 'nurse'::"text"]) AS "myvet_is_clinic_staff")) WITH CHECK (( SELECT "private"."myvet_is_clinic_staff"("documents"."clinic_id", ARRAY['clinic_admin'::"text", 'vet'::"text", 'nurse'::"text"]) AS "myvet_is_clinic_staff"));


--
-- Name: hospitalizations myvet_active_staff_all; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY "myvet_active_staff_all" ON "public"."hospitalizations" TO "authenticated" USING (( SELECT "private"."myvet_is_clinic_staff"("hospitalizations"."clinic_id", ARRAY['clinic_admin'::"text", 'vet'::"text", 'nurse'::"text"]) AS "myvet_is_clinic_staff")) WITH CHECK (( SELECT "private"."myvet_is_clinic_staff"("hospitalizations"."clinic_id", ARRAY['clinic_admin'::"text", 'vet'::"text", 'nurse'::"text"]) AS "myvet_is_clinic_staff"));


--
-- Name: inventory myvet_active_staff_all; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY "myvet_active_staff_all" ON "public"."inventory" TO "authenticated" USING (( SELECT "private"."myvet_is_clinic_staff"("inventory"."clinic_id", NULL::"text"[]) AS "myvet_is_clinic_staff")) WITH CHECK (( SELECT "private"."myvet_is_clinic_staff"("inventory"."clinic_id", NULL::"text"[]) AS "myvet_is_clinic_staff"));


--
-- Name: lab_orders myvet_active_staff_all; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY "myvet_active_staff_all" ON "public"."lab_orders" TO "authenticated" USING (( SELECT "private"."myvet_is_clinic_staff"("lab_orders"."clinic_id", ARRAY['clinic_admin'::"text", 'vet'::"text", 'nurse'::"text"]) AS "myvet_is_clinic_staff")) WITH CHECK (( SELECT "private"."myvet_is_clinic_staff"("lab_orders"."clinic_id", ARRAY['clinic_admin'::"text", 'vet'::"text", 'nurse'::"text"]) AS "myvet_is_clinic_staff"));


--
-- Name: medical_problems myvet_active_staff_all; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY "myvet_active_staff_all" ON "public"."medical_problems" TO "authenticated" USING (( SELECT "private"."myvet_is_clinic_staff"("medical_problems"."clinic_id", ARRAY['clinic_admin'::"text", 'vet'::"text", 'nurse'::"text"]) AS "myvet_is_clinic_staff")) WITH CHECK (( SELECT "private"."myvet_is_clinic_staff"("medical_problems"."clinic_id", ARRAY['clinic_admin'::"text", 'vet'::"text", 'nurse'::"text"]) AS "myvet_is_clinic_staff"));


--
-- Name: medical_visits myvet_active_staff_all; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY "myvet_active_staff_all" ON "public"."medical_visits" TO "authenticated" USING (( SELECT "private"."myvet_is_clinic_staff"("medical_visits"."clinic_id", ARRAY['clinic_admin'::"text", 'vet'::"text", 'nurse'::"text"]) AS "myvet_is_clinic_staff")) WITH CHECK (( SELECT "private"."myvet_is_clinic_staff"("medical_visits"."clinic_id", ARRAY['clinic_admin'::"text", 'vet'::"text", 'nurse'::"text"]) AS "myvet_is_clinic_staff"));


--
-- Name: message_attachments myvet_active_staff_all; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY "myvet_active_staff_all" ON "public"."message_attachments" TO "authenticated" USING (( SELECT "private"."myvet_is_clinic_staff"("message_attachments"."clinic_id", NULL::"text"[]) AS "myvet_is_clinic_staff")) WITH CHECK (( SELECT "private"."myvet_is_clinic_staff"("message_attachments"."clinic_id", NULL::"text"[]) AS "myvet_is_clinic_staff"));


--
-- Name: messages myvet_active_staff_all; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY "myvet_active_staff_all" ON "public"."messages" TO "authenticated" USING (( SELECT "private"."myvet_is_clinic_staff"("messages"."clinic_id", NULL::"text"[]) AS "myvet_is_clinic_staff")) WITH CHECK (( SELECT "private"."myvet_is_clinic_staff"("messages"."clinic_id", NULL::"text"[]) AS "myvet_is_clinic_staff"));


--
-- Name: notifications myvet_active_staff_all; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY "myvet_active_staff_all" ON "public"."notifications" TO "authenticated" USING (( SELECT "private"."myvet_is_clinic_staff"("notifications"."clinic_id", NULL::"text"[]) AS "myvet_is_clinic_staff")) WITH CHECK (( SELECT "private"."myvet_is_clinic_staff"("notifications"."clinic_id", NULL::"text"[]) AS "myvet_is_clinic_staff"));


--
-- Name: owners myvet_active_staff_all; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY "myvet_active_staff_all" ON "public"."owners" TO "authenticated" USING (( SELECT "private"."myvet_is_clinic_staff"("owners"."clinic_id", NULL::"text"[]) AS "myvet_is_clinic_staff")) WITH CHECK (( SELECT "private"."myvet_is_clinic_staff"("owners"."clinic_id", NULL::"text"[]) AS "myvet_is_clinic_staff"));


--
-- Name: patients myvet_active_staff_all; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY "myvet_active_staff_all" ON "public"."patients" TO "authenticated" USING (( SELECT "private"."myvet_is_clinic_staff"("patients"."clinic_id", NULL::"text"[]) AS "myvet_is_clinic_staff")) WITH CHECK (( SELECT "private"."myvet_is_clinic_staff"("patients"."clinic_id", NULL::"text"[]) AS "myvet_is_clinic_staff"));


--
-- Name: payment_items myvet_active_staff_all; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY "myvet_active_staff_all" ON "public"."payment_items" TO "authenticated" USING (( SELECT "private"."myvet_is_clinic_staff"("payment_items"."clinic_id", ARRAY['clinic_admin'::"text", 'vet'::"text", 'secretary'::"text"]) AS "myvet_is_clinic_staff")) WITH CHECK (( SELECT "private"."myvet_is_clinic_staff"("payment_items"."clinic_id", ARRAY['clinic_admin'::"text", 'vet'::"text", 'secretary'::"text"]) AS "myvet_is_clinic_staff"));


--
-- Name: payments myvet_active_staff_all; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY "myvet_active_staff_all" ON "public"."payments" TO "authenticated" USING (( SELECT "private"."myvet_is_clinic_staff"("payments"."clinic_id", ARRAY['clinic_admin'::"text", 'vet'::"text", 'secretary'::"text"]) AS "myvet_is_clinic_staff")) WITH CHECK (( SELECT "private"."myvet_is_clinic_staff"("payments"."clinic_id", ARRAY['clinic_admin'::"text", 'vet'::"text", 'secretary'::"text"]) AS "myvet_is_clinic_staff"));


--
-- Name: physical_exams myvet_active_staff_all; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY "myvet_active_staff_all" ON "public"."physical_exams" TO "authenticated" USING (( SELECT "private"."myvet_is_clinic_staff"("physical_exams"."clinic_id", ARRAY['clinic_admin'::"text", 'vet'::"text", 'nurse'::"text"]) AS "myvet_is_clinic_staff")) WITH CHECK (( SELECT "private"."myvet_is_clinic_staff"("physical_exams"."clinic_id", ARRAY['clinic_admin'::"text", 'vet'::"text", 'nurse'::"text"]) AS "myvet_is_clinic_staff"));


--
-- Name: prescriptions myvet_active_staff_all; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY "myvet_active_staff_all" ON "public"."prescriptions" TO "authenticated" USING (( SELECT "private"."myvet_is_clinic_staff"("prescriptions"."clinic_id", ARRAY['clinic_admin'::"text", 'vet'::"text", 'nurse'::"text"]) AS "myvet_is_clinic_staff")) WITH CHECK (( SELECT "private"."myvet_is_clinic_staff"("prescriptions"."clinic_id", ARRAY['clinic_admin'::"text", 'vet'::"text", 'nurse'::"text"]) AS "myvet_is_clinic_staff"));


--
-- Name: reminders myvet_active_staff_all; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY "myvet_active_staff_all" ON "public"."reminders" TO "authenticated" USING (( SELECT "private"."myvet_is_clinic_staff"("reminders"."clinic_id", NULL::"text"[]) AS "myvet_is_clinic_staff")) WITH CHECK (( SELECT "private"."myvet_is_clinic_staff"("reminders"."clinic_id", NULL::"text"[]) AS "myvet_is_clinic_staff"));


--
-- Name: service_catalog myvet_active_staff_all; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY "myvet_active_staff_all" ON "public"."service_catalog" TO "authenticated" USING (( SELECT "private"."myvet_is_clinic_staff"("service_catalog"."clinic_id", NULL::"text"[]) AS "myvet_is_clinic_staff")) WITH CHECK (( SELECT "private"."myvet_is_clinic_staff"("service_catalog"."clinic_id", NULL::"text"[]) AS "myvet_is_clinic_staff"));


--
-- Name: vaccinations myvet_active_staff_all; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY "myvet_active_staff_all" ON "public"."vaccinations" TO "authenticated" USING (( SELECT "private"."myvet_is_clinic_staff"("vaccinations"."clinic_id", ARRAY['clinic_admin'::"text", 'vet'::"text", 'nurse'::"text"]) AS "myvet_is_clinic_staff")) WITH CHECK (( SELECT "private"."myvet_is_clinic_staff"("vaccinations"."clinic_id", ARRAY['clinic_admin'::"text", 'vet'::"text", 'nurse'::"text"]) AS "myvet_is_clinic_staff"));


--
-- Name: video_sessions myvet_active_staff_all; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY "myvet_active_staff_all" ON "public"."video_sessions" TO "authenticated" USING (( SELECT "private"."myvet_is_clinic_staff"("video_sessions"."clinic_id", NULL::"text"[]) AS "myvet_is_clinic_staff")) WITH CHECK (( SELECT "private"."myvet_is_clinic_staff"("video_sessions"."clinic_id", NULL::"text"[]) AS "myvet_is_clinic_staff"));


--
-- Name: clinics myvet_clinics_select_member; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY "myvet_clinics_select_member" ON "public"."clinics" FOR SELECT TO "authenticated" USING (( SELECT "private"."myvet_user_has_clinic_access"("clinics"."clinic_id") AS "myvet_user_has_clinic_access"));


--
-- Name: insights myvet_insights_staff_all; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY "myvet_insights_staff_all" ON "public"."insights" TO "authenticated" USING (( SELECT "private"."myvet_is_clinic_staff"("insights"."clinic_id", ARRAY['clinic_admin'::"text", 'vet'::"text", 'secretary'::"text"]) AS "myvet_is_clinic_staff")) WITH CHECK (( SELECT "private"."myvet_is_clinic_staff"("insights"."clinic_id", ARRAY['clinic_admin'::"text", 'vet'::"text", 'secretary'::"text"]) AS "myvet_is_clinic_staff"));


--
-- Name: appointments myvet_owner_appointments_delete; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY "myvet_owner_appointments_delete" ON "public"."appointments" FOR DELETE TO "authenticated" USING ("public"."myvet_pet_owned"(("pet_id")::"text"));


--
-- Name: appointments myvet_owner_appointments_update; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY "myvet_owner_appointments_update" ON "public"."appointments" FOR UPDATE TO "authenticated" USING ("public"."myvet_pet_owned"(("pet_id")::"text")) WITH CHECK (("public"."myvet_pet_owned"(("pet_id")::"text") AND "public"."myvet_slot_is_bookable"("start_time", "end_time", "appointment_id")));


--
-- Name: message_attachments myvet_owner_attachments_delete; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY "myvet_owner_attachments_delete" ON "public"."message_attachments" FOR DELETE TO "authenticated" USING ("public"."myvet_conversation_owned"(("conversation_id")::"text"));


--
-- Name: message_attachments myvet_owner_attachments_insert; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY "myvet_owner_attachments_insert" ON "public"."message_attachments" FOR INSERT TO "authenticated" WITH CHECK ("public"."myvet_conversation_owned"(("conversation_id")::"text"));


--
-- Name: conversations myvet_owner_conversations_delete; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY "myvet_owner_conversations_delete" ON "public"."conversations" FOR DELETE TO "authenticated" USING ("public"."myvet_owner_matches"("owner_id"));


--
-- Name: conversations myvet_owner_conversations_insert; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY "myvet_owner_conversations_insert" ON "public"."conversations" FOR INSERT TO "authenticated" WITH CHECK ("public"."myvet_owner_matches"("owner_id"));


--
-- Name: conversations myvet_owner_conversations_update; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY "myvet_owner_conversations_update" ON "public"."conversations" FOR UPDATE TO "authenticated" USING ("public"."myvet_owner_matches"("owner_id")) WITH CHECK ("public"."myvet_owner_matches"("owner_id"));


--
-- Name: owners myvet_owner_insert_own; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY "myvet_owner_insert_own" ON "public"."owners" FOR INSERT TO "authenticated" WITH CHECK ((("auth_user_id" = ( SELECT "auth"."uid"() AS "uid")) AND ("clinic_id" = ( SELECT "private"."myvet_current_clinic_id"() AS "myvet_current_clinic_id"))));


--
-- Name: messages myvet_owner_messages_delete; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY "myvet_owner_messages_delete" ON "public"."messages" FOR DELETE TO "authenticated" USING (("public"."myvet_conversation_owned"(("conversation_id")::"text") AND ("sender_type" = 'owner'::"text") AND "public"."myvet_owner_matches"("sender_owner_id")));


--
-- Name: messages myvet_owner_messages_insert; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY "myvet_owner_messages_insert" ON "public"."messages" FOR INSERT TO "authenticated" WITH CHECK (("public"."myvet_conversation_owned"(("conversation_id")::"text") AND ("sender_type" = 'owner'::"text") AND "public"."myvet_owner_matches"("sender_owner_id")));


--
-- Name: appointments myvet_owner_select_own; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY "myvet_owner_select_own" ON "public"."appointments" FOR SELECT TO "authenticated" USING ("public"."myvet_pet_owned"(("pet_id")::"text"));


--
-- Name: conversations myvet_owner_select_own; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY "myvet_owner_select_own" ON "public"."conversations" FOR SELECT TO "authenticated" USING ("public"."myvet_owner_matches"("owner_id"));


--
-- Name: differential_diagnoses myvet_owner_select_own; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY "myvet_owner_select_own" ON "public"."differential_diagnoses" FOR SELECT TO "authenticated" USING ("public"."myvet_pet_owned"(("pet_id")::"text"));


--
-- Name: documents myvet_owner_select_own; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY "myvet_owner_select_own" ON "public"."documents" FOR SELECT TO "authenticated" USING ("public"."myvet_pet_owned"(("pet_id")::"text"));


--
-- Name: hospitalizations myvet_owner_select_own; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY "myvet_owner_select_own" ON "public"."hospitalizations" FOR SELECT TO "authenticated" USING ("public"."myvet_pet_owned"(("pet_id")::"text"));


--
-- Name: lab_orders myvet_owner_select_own; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY "myvet_owner_select_own" ON "public"."lab_orders" FOR SELECT TO "authenticated" USING ("public"."myvet_pet_owned"(("pet_id")::"text"));


--
-- Name: medical_problems myvet_owner_select_own; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY "myvet_owner_select_own" ON "public"."medical_problems" FOR SELECT TO "authenticated" USING ("public"."myvet_pet_owned"(("pet_id")::"text"));


--
-- Name: medical_visits myvet_owner_select_own; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY "myvet_owner_select_own" ON "public"."medical_visits" FOR SELECT TO "authenticated" USING ("public"."myvet_pet_owned"(("pet_id")::"text"));


--
-- Name: message_attachments myvet_owner_select_own; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY "myvet_owner_select_own" ON "public"."message_attachments" FOR SELECT TO "authenticated" USING ("public"."myvet_conversation_owned"(("conversation_id")::"text"));


--
-- Name: messages myvet_owner_select_own; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY "myvet_owner_select_own" ON "public"."messages" FOR SELECT TO "authenticated" USING ("public"."myvet_conversation_owned"(("conversation_id")::"text"));


--
-- Name: notifications myvet_owner_select_own; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY "myvet_owner_select_own" ON "public"."notifications" FOR SELECT TO "authenticated" USING ("public"."myvet_owner_matches"("owner_id"));


--
-- Name: owners myvet_owner_select_own; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY "myvet_owner_select_own" ON "public"."owners" FOR SELECT TO "authenticated" USING ((("auth_user_id" = ( SELECT "auth"."uid"() AS "uid")) AND ( SELECT "private"."myvet_user_has_clinic_access"("owners"."clinic_id") AS "myvet_user_has_clinic_access")));


--
-- Name: patients myvet_owner_select_own; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY "myvet_owner_select_own" ON "public"."patients" FOR SELECT TO "authenticated" USING (( SELECT "private"."myvet_owner_owns_pet"("patients"."clinic_id", "patients"."pet_id") AS "myvet_owner_owns_pet"));


--
-- Name: payments myvet_owner_select_own; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY "myvet_owner_select_own" ON "public"."payments" FOR SELECT TO "authenticated" USING ("public"."myvet_owner_matches"("owner_id"));


--
-- Name: physical_exams myvet_owner_select_own; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY "myvet_owner_select_own" ON "public"."physical_exams" FOR SELECT TO "authenticated" USING ("public"."myvet_pet_owned"(("pet_id")::"text"));


--
-- Name: prescriptions myvet_owner_select_own; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY "myvet_owner_select_own" ON "public"."prescriptions" FOR SELECT TO "authenticated" USING ("public"."myvet_pet_owned"(("pet_id")::"text"));


--
-- Name: reminders myvet_owner_select_own; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY "myvet_owner_select_own" ON "public"."reminders" FOR SELECT TO "authenticated" USING ("public"."myvet_owner_matches"("owner_id"));


--
-- Name: vaccinations myvet_owner_select_own; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY "myvet_owner_select_own" ON "public"."vaccinations" FOR SELECT TO "authenticated" USING ("public"."myvet_pet_owned"(("pet_id")::"text"));


--
-- Name: video_sessions myvet_owner_select_own; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY "myvet_owner_select_own" ON "public"."video_sessions" FOR SELECT TO "authenticated" USING ("public"."myvet_owner_matches"("owner_id"));


--
-- Name: owners myvet_owner_update_own; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY "myvet_owner_update_own" ON "public"."owners" FOR UPDATE TO "authenticated" USING ((("auth_user_id" = ( SELECT "auth"."uid"() AS "uid")) AND ( SELECT "private"."myvet_user_has_clinic_access"("owners"."clinic_id") AS "myvet_user_has_clinic_access"))) WITH CHECK ((("auth_user_id" = ( SELECT "auth"."uid"() AS "uid")) AND ( SELECT "private"."myvet_user_has_clinic_access"("owners"."clinic_id") AS "myvet_user_has_clinic_access")));


--
-- Name: video_sessions myvet_owner_video_insert; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY "myvet_owner_video_insert" ON "public"."video_sessions" FOR INSERT TO "authenticated" WITH CHECK (("public"."myvet_owner_matches"("owner_id") AND "public"."myvet_conversation_owned"(("conversation_id")::"text")));


--
-- Name: payment_transactions myvet_payment_transactions_owner_select; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY "myvet_payment_transactions_owner_select" ON "public"."payment_transactions" FOR SELECT TO "authenticated" USING (( SELECT "public"."myvet_owner_matches"("payment_transactions"."owner_id") AS "myvet_owner_matches"));


--
-- Name: payment_transactions myvet_payment_transactions_staff_select; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY "myvet_payment_transactions_staff_select" ON "public"."payment_transactions" FOR SELECT TO "authenticated" USING (( SELECT "private"."myvet_is_clinic_staff"("payment_transactions"."clinic_id", ARRAY['clinic_admin'::"text", 'vet'::"text", 'secretary'::"text"]) AS "myvet_is_clinic_staff"));


--
-- Name: staff myvet_staff_admin_manage; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY "myvet_staff_admin_manage" ON "public"."staff" TO "authenticated" USING (( SELECT "private"."myvet_is_clinic_staff"("staff"."clinic_id", ARRAY['clinic_admin'::"text"]) AS "myvet_is_clinic_staff")) WITH CHECK (( SELECT "private"."myvet_is_clinic_staff"("staff"."clinic_id", ARRAY['clinic_admin'::"text"]) AS "myvet_is_clinic_staff"));


--
-- Name: staff myvet_staff_select_same_clinic; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY "myvet_staff_select_same_clinic" ON "public"."staff" FOR SELECT TO "authenticated" USING (( SELECT "private"."myvet_is_clinic_staff"("staff"."clinic_id", NULL::"text"[]) AS "myvet_is_clinic_staff"));


--
-- Name: vetbot_action_requests myvet_vetbot_action_select_own; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY "myvet_vetbot_action_select_own" ON "public"."vetbot_action_requests" FOR SELECT TO "authenticated" USING ((("actor_id" = ( SELECT "auth"."uid"() AS "uid")) AND ( SELECT "private"."myvet_user_has_clinic_access"("vetbot_action_requests"."clinic_id") AS "myvet_user_has_clinic_access")));


--
-- Name: notifications; Type: ROW SECURITY; Schema: public; Owner: -
--

ALTER TABLE "public"."notifications" ENABLE ROW LEVEL SECURITY;

--
-- Name: owners; Type: ROW SECURITY; Schema: public; Owner: -
--

ALTER TABLE "public"."owners" ENABLE ROW LEVEL SECURITY;

--
-- Name: patients; Type: ROW SECURITY; Schema: public; Owner: -
--

ALTER TABLE "public"."patients" ENABLE ROW LEVEL SECURITY;

--
-- Name: payment_items; Type: ROW SECURITY; Schema: public; Owner: -
--

ALTER TABLE "public"."payment_items" ENABLE ROW LEVEL SECURITY;

--
-- Name: payment_transactions; Type: ROW SECURITY; Schema: public; Owner: -
--

ALTER TABLE "public"."payment_transactions" ENABLE ROW LEVEL SECURITY;

--
-- Name: payments; Type: ROW SECURITY; Schema: public; Owner: -
--

ALTER TABLE "public"."payments" ENABLE ROW LEVEL SECURITY;

--
-- Name: physical_exams; Type: ROW SECURITY; Schema: public; Owner: -
--

ALTER TABLE "public"."physical_exams" ENABLE ROW LEVEL SECURITY;

--
-- Name: prescriptions; Type: ROW SECURITY; Schema: public; Owner: -
--

ALTER TABLE "public"."prescriptions" ENABLE ROW LEVEL SECURITY;

--
-- Name: reminders; Type: ROW SECURITY; Schema: public; Owner: -
--

ALTER TABLE "public"."reminders" ENABLE ROW LEVEL SECURITY;

--
-- Name: reminders reminders_follow_up_owner_select; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY "reminders_follow_up_owner_select" ON "public"."reminders" FOR SELECT TO "authenticated" USING ((("owner_id" IS NOT NULL) AND "private"."myvet_owner_owns_pet"("clinic_id", "pet_id")));


--
-- Name: reminders reminders_follow_up_staff_select; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY "reminders_follow_up_staff_select" ON "public"."reminders" FOR SELECT TO "authenticated" USING ("private"."myvet_is_clinic_staff"("clinic_id"));


--
-- Name: service_catalog; Type: ROW SECURITY; Schema: public; Owner: -
--

ALTER TABLE "public"."service_catalog" ENABLE ROW LEVEL SECURITY;

--
-- Name: staff; Type: ROW SECURITY; Schema: public; Owner: -
--

ALTER TABLE "public"."staff" ENABLE ROW LEVEL SECURITY;

--
-- Name: vaccinations; Type: ROW SECURITY; Schema: public; Owner: -
--

ALTER TABLE "public"."vaccinations" ENABLE ROW LEVEL SECURITY;

--
-- Name: vetbot_audit_logs vetbot audit admin read; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY "vetbot audit admin read" ON "public"."vetbot_audit_logs" FOR SELECT TO "authenticated" USING (( SELECT "private"."myvet_is_clinic_staff"("vetbot_audit_logs"."clinic_id", ARRAY['clinic_admin'::"text"]) AS "myvet_is_clinic_staff"));


--
-- Name: vetbot_audit_logs vetbot audit insert own; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY "vetbot audit insert own" ON "public"."vetbot_audit_logs" FOR INSERT TO "authenticated" WITH CHECK ((("actor_id" = ( SELECT "auth"."uid"() AS "uid")) AND ( SELECT "private"."myvet_user_has_clinic_access"("vetbot_audit_logs"."clinic_id") AS "myvet_user_has_clinic_access")));


--
-- Name: vetbot_feedback vetbot feedback admin read; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY "vetbot feedback admin read" ON "public"."vetbot_feedback" FOR SELECT TO "authenticated" USING (( SELECT "private"."myvet_is_clinic_staff"("vetbot_feedback"."clinic_id", ARRAY['clinic_admin'::"text"]) AS "myvet_is_clinic_staff"));


--
-- Name: vetbot_feedback vetbot feedback insert own; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY "vetbot feedback insert own" ON "public"."vetbot_feedback" FOR INSERT TO "authenticated" WITH CHECK ((("actor_id" = ( SELECT "auth"."uid"() AS "uid")) AND ( SELECT "private"."myvet_user_has_clinic_access"("vetbot_feedback"."clinic_id") AS "myvet_user_has_clinic_access")));


--
-- Name: vetbot_knowledge vetbot knowledge admin manage; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY "vetbot knowledge admin manage" ON "public"."vetbot_knowledge" TO "authenticated" USING (( SELECT "private"."myvet_is_clinic_staff"("vetbot_knowledge"."clinic_id", ARRAY['clinic_admin'::"text"]) AS "myvet_is_clinic_staff")) WITH CHECK (( SELECT "private"."myvet_is_clinic_staff"("vetbot_knowledge"."clinic_id", ARRAY['clinic_admin'::"text"]) AS "myvet_is_clinic_staff"));


--
-- Name: vetbot_knowledge vetbot knowledge staff read; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY "vetbot knowledge staff read" ON "public"."vetbot_knowledge" FOR SELECT TO "authenticated" USING (( SELECT "private"."myvet_is_clinic_staff"("vetbot_knowledge"."clinic_id", NULL::"text"[]) AS "myvet_is_clinic_staff"));


--
-- Name: vetbot_action_requests; Type: ROW SECURITY; Schema: public; Owner: -
--

ALTER TABLE "public"."vetbot_action_requests" ENABLE ROW LEVEL SECURITY;

--
-- Name: vetbot_audit_logs; Type: ROW SECURITY; Schema: public; Owner: -
--

ALTER TABLE "public"."vetbot_audit_logs" ENABLE ROW LEVEL SECURITY;

--
-- Name: vetbot_feedback; Type: ROW SECURITY; Schema: public; Owner: -
--

ALTER TABLE "public"."vetbot_feedback" ENABLE ROW LEVEL SECURITY;

--
-- Name: vetbot_knowledge; Type: ROW SECURITY; Schema: public; Owner: -
--

ALTER TABLE "public"."vetbot_knowledge" ENABLE ROW LEVEL SECURITY;

--
-- Name: video_sessions; Type: ROW SECURITY; Schema: public; Owner: -
--

ALTER TABLE "public"."video_sessions" ENABLE ROW LEVEL SECURITY;

--
-- Name: SCHEMA "public"; Type: ACL; Schema: -; Owner: -
--

GRANT USAGE ON SCHEMA "public" TO "postgres";
GRANT USAGE ON SCHEMA "public" TO "anon";
GRANT USAGE ON SCHEMA "public" TO "authenticated";
GRANT USAGE ON SCHEMA "public" TO "service_role";


--
-- Name: FUNCTION "claim_owner_profile"(); Type: ACL; Schema: public; Owner: -
--

REVOKE ALL ON FUNCTION "public"."claim_owner_profile"() FROM PUBLIC;
GRANT ALL ON FUNCTION "public"."claim_owner_profile"() TO "authenticated";
GRANT ALL ON FUNCTION "public"."claim_owner_profile"() TO "service_role";


--
-- Name: FUNCTION "myvet_available_slots"("range_start" "date", "range_end" "date"); Type: ACL; Schema: public; Owner: -
--

REVOKE ALL ON FUNCTION "public"."myvet_available_slots"("range_start" "date", "range_end" "date") FROM PUBLIC;
GRANT ALL ON FUNCTION "public"."myvet_available_slots"("range_start" "date", "range_end" "date") TO "authenticated";
GRANT ALL ON FUNCTION "public"."myvet_available_slots"("range_start" "date", "range_end" "date") TO "service_role";


--
-- Name: FUNCTION "myvet_begin_digitalcare_capture"("requested_actor_user_id" "uuid", "requested_video_session_id" bigint, "requested_appointment_id" bigint, "requested_notice_version" "text", "requested_transcription_consent" boolean, "requested_recording_consent" boolean, "requested_recording_enabled" boolean, "requested_object_path" "text", "requested_mime_type" "text", "requested_size_limit" bigint); Type: ACL; Schema: public; Owner: -
--

REVOKE ALL ON FUNCTION "public"."myvet_begin_digitalcare_capture"("requested_actor_user_id" "uuid", "requested_video_session_id" bigint, "requested_appointment_id" bigint, "requested_notice_version" "text", "requested_transcription_consent" boolean, "requested_recording_consent" boolean, "requested_recording_enabled" boolean, "requested_object_path" "text", "requested_mime_type" "text", "requested_size_limit" bigint) FROM PUBLIC;
GRANT ALL ON FUNCTION "public"."myvet_begin_digitalcare_capture"("requested_actor_user_id" "uuid", "requested_video_session_id" bigint, "requested_appointment_id" bigint, "requested_notice_version" "text", "requested_transcription_consent" boolean, "requested_recording_consent" boolean, "requested_recording_enabled" boolean, "requested_object_path" "text", "requested_mime_type" "text", "requested_size_limit" bigint) TO "service_role";


--
-- Name: FUNCTION "myvet_booked_slots"("range_start" timestamp with time zone, "range_end" timestamp with time zone); Type: ACL; Schema: public; Owner: -
--

REVOKE ALL ON FUNCTION "public"."myvet_booked_slots"("range_start" timestamp with time zone, "range_end" timestamp with time zone) FROM PUBLIC;
GRANT ALL ON FUNCTION "public"."myvet_booked_slots"("range_start" timestamp with time zone, "range_end" timestamp with time zone) TO "authenticated";
GRANT ALL ON FUNCTION "public"."myvet_booked_slots"("range_start" timestamp with time zone, "range_end" timestamp with time zone) TO "service_role";


--
-- Name: FUNCTION "myvet_complete_digitalcare_transcript"("requested_actor_user_id" "uuid", "requested_video_session_id" bigint, "requested_transcript" "text", "requested_language" "text", "requested_request_id" "uuid", "requested_provider" "text", "requested_model_version" "text", "requested_latency_ms" integer, "requested_input_tokens" integer, "requested_output_tokens" integer); Type: ACL; Schema: public; Owner: -
--

REVOKE ALL ON FUNCTION "public"."myvet_complete_digitalcare_transcript"("requested_actor_user_id" "uuid", "requested_video_session_id" bigint, "requested_transcript" "text", "requested_language" "text", "requested_request_id" "uuid", "requested_provider" "text", "requested_model_version" "text", "requested_latency_ms" integer, "requested_input_tokens" integer, "requested_output_tokens" integer) FROM PUBLIC;
GRANT ALL ON FUNCTION "public"."myvet_complete_digitalcare_transcript"("requested_actor_user_id" "uuid", "requested_video_session_id" bigint, "requested_transcript" "text", "requested_language" "text", "requested_request_id" "uuid", "requested_provider" "text", "requested_model_version" "text", "requested_latency_ms" integer, "requested_input_tokens" integer, "requested_output_tokens" integer) TO "service_role";


--
-- Name: FUNCTION "myvet_conversation_owned"("candidate_conversation_id" "text"); Type: ACL; Schema: public; Owner: -
--

REVOKE ALL ON FUNCTION "public"."myvet_conversation_owned"("candidate_conversation_id" "text") FROM PUBLIC;
GRANT ALL ON FUNCTION "public"."myvet_conversation_owned"("candidate_conversation_id" "text") TO "authenticated";
GRANT ALL ON FUNCTION "public"."myvet_conversation_owned"("candidate_conversation_id" "text") TO "service_role";


--
-- Name: FUNCTION "myvet_create_client_summary_draft"("requested_actor_user_id" "uuid", "requested_approved_artifact_id" "uuid", "requested_content" "jsonb", "requested_request_id" "uuid", "requested_provider" "text", "requested_model_version" "text", "requested_prompt_version" "text", "requested_latency_ms" integer, "requested_input_tokens" integer, "requested_output_tokens" integer, "requested_generated_by_ai" boolean); Type: ACL; Schema: public; Owner: -
--

REVOKE ALL ON FUNCTION "public"."myvet_create_client_summary_draft"("requested_actor_user_id" "uuid", "requested_approved_artifact_id" "uuid", "requested_content" "jsonb", "requested_request_id" "uuid", "requested_provider" "text", "requested_model_version" "text", "requested_prompt_version" "text", "requested_latency_ms" integer, "requested_input_tokens" integer, "requested_output_tokens" integer, "requested_generated_by_ai" boolean) FROM PUBLIC;
GRANT ALL ON FUNCTION "public"."myvet_create_client_summary_draft"("requested_actor_user_id" "uuid", "requested_approved_artifact_id" "uuid", "requested_content" "jsonb", "requested_request_id" "uuid", "requested_provider" "text", "requested_model_version" "text", "requested_prompt_version" "text", "requested_latency_ms" integer, "requested_input_tokens" integer, "requested_output_tokens" integer, "requested_generated_by_ai" boolean) TO "service_role";


--
-- Name: FUNCTION "myvet_create_follow_up_suggestion_draft"("requested_actor_user_id" "uuid", "requested_source_type" "text", "requested_source_id" "text", "requested_content" "jsonb", "requested_request_id" "uuid", "requested_provider" "text", "requested_model_version" "text", "requested_prompt_version" "text", "requested_latency_ms" integer, "requested_input_tokens" integer, "requested_output_tokens" integer, "requested_generated_by_ai" boolean); Type: ACL; Schema: public; Owner: -
--

REVOKE ALL ON FUNCTION "public"."myvet_create_follow_up_suggestion_draft"("requested_actor_user_id" "uuid", "requested_source_type" "text", "requested_source_id" "text", "requested_content" "jsonb", "requested_request_id" "uuid", "requested_provider" "text", "requested_model_version" "text", "requested_prompt_version" "text", "requested_latency_ms" integer, "requested_input_tokens" integer, "requested_output_tokens" integer, "requested_generated_by_ai" boolean) FROM PUBLIC;
GRANT ALL ON FUNCTION "public"."myvet_create_follow_up_suggestion_draft"("requested_actor_user_id" "uuid", "requested_source_type" "text", "requested_source_id" "text", "requested_content" "jsonb", "requested_request_id" "uuid", "requested_provider" "text", "requested_model_version" "text", "requested_prompt_version" "text", "requested_latency_ms" integer, "requested_input_tokens" integer, "requested_output_tokens" integer, "requested_generated_by_ai" boolean) TO "service_role";


--
-- Name: FUNCTION "myvet_create_visit_summary_draft"("requested_actor_user_id" "uuid", "requested_visit_id" bigint, "requested_content" "jsonb", "requested_request_id" "uuid", "requested_provider" "text", "requested_model_version" "text", "requested_prompt_version" "text", "requested_latency_ms" integer, "requested_input_tokens" integer, "requested_output_tokens" integer); Type: ACL; Schema: public; Owner: -
--

REVOKE ALL ON FUNCTION "public"."myvet_create_visit_summary_draft"("requested_actor_user_id" "uuid", "requested_visit_id" bigint, "requested_content" "jsonb", "requested_request_id" "uuid", "requested_provider" "text", "requested_model_version" "text", "requested_prompt_version" "text", "requested_latency_ms" integer, "requested_input_tokens" integer, "requested_output_tokens" integer) FROM PUBLIC;
GRANT ALL ON FUNCTION "public"."myvet_create_visit_summary_draft"("requested_actor_user_id" "uuid", "requested_visit_id" bigint, "requested_content" "jsonb", "requested_request_id" "uuid", "requested_provider" "text", "requested_model_version" "text", "requested_prompt_version" "text", "requested_latency_ms" integer, "requested_input_tokens" integer, "requested_output_tokens" integer) TO "service_role";


--
-- Name: FUNCTION "myvet_current_owner_id"(); Type: ACL; Schema: public; Owner: -
--

REVOKE ALL ON FUNCTION "public"."myvet_current_owner_id"() FROM PUBLIC;
GRANT ALL ON FUNCTION "public"."myvet_current_owner_id"() TO "authenticated";
GRANT ALL ON FUNCTION "public"."myvet_current_owner_id"() TO "service_role";


--
-- Name: FUNCTION "myvet_delete_patient"("p_pet_id" bigint); Type: ACL; Schema: public; Owner: -
--

REVOKE ALL ON FUNCTION "public"."myvet_delete_patient"("p_pet_id" bigint) FROM PUBLIC;
GRANT ALL ON FUNCTION "public"."myvet_delete_patient"("p_pet_id" bigint) TO "authenticated";
GRANT ALL ON FUNCTION "public"."myvet_delete_patient"("p_pet_id" bigint) TO "service_role";


--
-- Name: FUNCTION "myvet_ensure_digitalcare_visit"("requested_actor_user_id" "uuid", "requested_video_session_id" bigint); Type: ACL; Schema: public; Owner: -
--

REVOKE ALL ON FUNCTION "public"."myvet_ensure_digitalcare_visit"("requested_actor_user_id" "uuid", "requested_video_session_id" bigint) FROM PUBLIC;
GRANT ALL ON FUNCTION "public"."myvet_ensure_digitalcare_visit"("requested_actor_user_id" "uuid", "requested_video_session_id" bigint) TO "service_role";


--
-- Name: FUNCTION "myvet_execute_vetbot_action"("requested_action_id" "uuid"); Type: ACL; Schema: public; Owner: -
--

REVOKE ALL ON FUNCTION "public"."myvet_execute_vetbot_action"("requested_action_id" "uuid") FROM PUBLIC;
GRANT ALL ON FUNCTION "public"."myvet_execute_vetbot_action"("requested_action_id" "uuid") TO "authenticated";
GRANT ALL ON FUNCTION "public"."myvet_execute_vetbot_action"("requested_action_id" "uuid") TO "service_role";


--
-- Name: FUNCTION "myvet_execute_vetbot_inventory_create"("requested_action_id" "uuid"); Type: ACL; Schema: public; Owner: -
--

REVOKE ALL ON FUNCTION "public"."myvet_execute_vetbot_inventory_create"("requested_action_id" "uuid") FROM PUBLIC;
GRANT ALL ON FUNCTION "public"."myvet_execute_vetbot_inventory_create"("requested_action_id" "uuid") TO "authenticated";
GRANT ALL ON FUNCTION "public"."myvet_execute_vetbot_inventory_create"("requested_action_id" "uuid") TO "service_role";


--
-- Name: FUNCTION "myvet_is_active_staff"(); Type: ACL; Schema: public; Owner: -
--

REVOKE ALL ON FUNCTION "public"."myvet_is_active_staff"() FROM PUBLIC;
GRANT ALL ON FUNCTION "public"."myvet_is_active_staff"() TO "authenticated";
GRANT ALL ON FUNCTION "public"."myvet_is_active_staff"() TO "service_role";


--
-- Name: FUNCTION "myvet_link_digitalcare_summary_source"("requested_actor_user_id" "uuid", "requested_video_session_id" bigint, "requested_summary_artifact_id" "uuid"); Type: ACL; Schema: public; Owner: -
--

REVOKE ALL ON FUNCTION "public"."myvet_link_digitalcare_summary_source"("requested_actor_user_id" "uuid", "requested_video_session_id" bigint, "requested_summary_artifact_id" "uuid") FROM PUBLIC;
GRANT ALL ON FUNCTION "public"."myvet_link_digitalcare_summary_source"("requested_actor_user_id" "uuid", "requested_video_session_id" bigint, "requested_summary_artifact_id" "uuid") TO "service_role";


--
-- Name: FUNCTION "myvet_mark_digitalcare_failure"("requested_actor_user_id" "uuid", "requested_video_session_id" bigint, "requested_stage" "text", "requested_error_code" "text"); Type: ACL; Schema: public; Owner: -
--

REVOKE ALL ON FUNCTION "public"."myvet_mark_digitalcare_failure"("requested_actor_user_id" "uuid", "requested_video_session_id" bigint, "requested_stage" "text", "requested_error_code" "text") FROM PUBLIC;
GRANT ALL ON FUNCTION "public"."myvet_mark_digitalcare_failure"("requested_actor_user_id" "uuid", "requested_video_session_id" bigint, "requested_stage" "text", "requested_error_code" "text") TO "service_role";


--
-- Name: FUNCTION "myvet_owner_book_appointment"("requested_pet_id" bigint, "requested_start" timestamp with time zone, "requested_end" timestamp with time zone, "requested_type" "text", "requested_mode" "text", "requested_notes" "text"); Type: ACL; Schema: public; Owner: -
--

REVOKE ALL ON FUNCTION "public"."myvet_owner_book_appointment"("requested_pet_id" bigint, "requested_start" timestamp with time zone, "requested_end" timestamp with time zone, "requested_type" "text", "requested_mode" "text", "requested_notes" "text") FROM PUBLIC;
GRANT ALL ON FUNCTION "public"."myvet_owner_book_appointment"("requested_pet_id" bigint, "requested_start" timestamp with time zone, "requested_end" timestamp with time zone, "requested_type" "text", "requested_mode" "text", "requested_notes" "text") TO "authenticated";
GRANT ALL ON FUNCTION "public"."myvet_owner_book_appointment"("requested_pet_id" bigint, "requested_start" timestamp with time zone, "requested_end" timestamp with time zone, "requested_type" "text", "requested_mode" "text", "requested_notes" "text") TO "service_role";


--
-- Name: FUNCTION "myvet_owner_matches"("candidate_owner_id" "text"); Type: ACL; Schema: public; Owner: -
--

REVOKE ALL ON FUNCTION "public"."myvet_owner_matches"("candidate_owner_id" "text") FROM PUBLIC;
GRANT ALL ON FUNCTION "public"."myvet_owner_matches"("candidate_owner_id" "text") TO "authenticated";
GRANT ALL ON FUNCTION "public"."myvet_owner_matches"("candidate_owner_id" "text") TO "service_role";


--
-- Name: FUNCTION "myvet_owner_settle_demo_payment"("requested_payment_id" bigint); Type: ACL; Schema: public; Owner: -
--

REVOKE ALL ON FUNCTION "public"."myvet_owner_settle_demo_payment"("requested_payment_id" bigint) FROM PUBLIC;
GRANT ALL ON FUNCTION "public"."myvet_owner_settle_demo_payment"("requested_payment_id" bigint) TO "authenticated";
GRANT ALL ON FUNCTION "public"."myvet_owner_settle_demo_payment"("requested_payment_id" bigint) TO "service_role";


--
-- Name: FUNCTION "myvet_pet_owned"("candidate_pet_id" "text"); Type: ACL; Schema: public; Owner: -
--

REVOKE ALL ON FUNCTION "public"."myvet_pet_owned"("candidate_pet_id" "text") FROM PUBLIC;
GRANT ALL ON FUNCTION "public"."myvet_pet_owned"("candidate_pet_id" "text") TO "authenticated";
GRANT ALL ON FUNCTION "public"."myvet_pet_owned"("candidate_pet_id" "text") TO "service_role";


--
-- Name: FUNCTION "myvet_rag_collect_sources"("requested_actor_user_id" "uuid", "requested_pet_id" bigint); Type: ACL; Schema: public; Owner: -
--

REVOKE ALL ON FUNCTION "public"."myvet_rag_collect_sources"("requested_actor_user_id" "uuid", "requested_pet_id" bigint) FROM PUBLIC;
GRANT ALL ON FUNCTION "public"."myvet_rag_collect_sources"("requested_actor_user_id" "uuid", "requested_pet_id" bigint) TO "service_role";


--
-- Name: FUNCTION "myvet_rag_search"("requested_actor_user_id" "uuid", "requested_pet_id" bigint, "requested_query_embedding" "extensions"."vector", "requested_provider" "text", "requested_model" "text", "requested_embedding_version" "text", "requested_match_threshold" real, "requested_match_count" integer); Type: ACL; Schema: public; Owner: -
--

REVOKE ALL ON FUNCTION "public"."myvet_rag_search"("requested_actor_user_id" "uuid", "requested_pet_id" bigint, "requested_query_embedding" "extensions"."vector", "requested_provider" "text", "requested_model" "text", "requested_embedding_version" "text", "requested_match_threshold" real, "requested_match_count" integer) FROM PUBLIC;
GRANT ALL ON FUNCTION "public"."myvet_rag_search"("requested_actor_user_id" "uuid", "requested_pet_id" bigint, "requested_query_embedding" "extensions"."vector", "requested_provider" "text", "requested_model" "text", "requested_embedding_version" "text", "requested_match_threshold" real, "requested_match_count" integer) TO "service_role";


--
-- Name: FUNCTION "myvet_rag_status"("requested_actor_user_id" "uuid", "requested_pet_id" bigint); Type: ACL; Schema: public; Owner: -
--

REVOKE ALL ON FUNCTION "public"."myvet_rag_status"("requested_actor_user_id" "uuid", "requested_pet_id" bigint) FROM PUBLIC;
GRANT ALL ON FUNCTION "public"."myvet_rag_status"("requested_actor_user_id" "uuid", "requested_pet_id" bigint) TO "service_role";


--
-- Name: FUNCTION "myvet_record_rag_event"("requested_actor_user_id" "uuid", "requested_pet_id" bigint, "requested_request_id" "uuid", "requested_event_type" "text", "requested_outcome" "text", "requested_provider" "text", "requested_model" "text", "requested_prompt_version" "text", "requested_latency_ms" integer, "requested_input_tokens" integer, "requested_output_tokens" integer, "requested_error_code" "text"); Type: ACL; Schema: public; Owner: -
--

REVOKE ALL ON FUNCTION "public"."myvet_record_rag_event"("requested_actor_user_id" "uuid", "requested_pet_id" bigint, "requested_request_id" "uuid", "requested_event_type" "text", "requested_outcome" "text", "requested_provider" "text", "requested_model" "text", "requested_prompt_version" "text", "requested_latency_ms" integer, "requested_input_tokens" integer, "requested_output_tokens" integer, "requested_error_code" "text") FROM PUBLIC;
GRANT ALL ON FUNCTION "public"."myvet_record_rag_event"("requested_actor_user_id" "uuid", "requested_pet_id" bigint, "requested_request_id" "uuid", "requested_event_type" "text", "requested_outcome" "text", "requested_provider" "text", "requested_model" "text", "requested_prompt_version" "text", "requested_latency_ms" integer, "requested_input_tokens" integer, "requested_output_tokens" integer, "requested_error_code" "text") TO "service_role";


--
-- Name: FUNCTION "myvet_record_visit_summary_failure"("requested_actor_user_id" "uuid", "requested_visit_id" bigint, "requested_request_id" "uuid", "requested_provider" "text", "requested_model_version" "text", "requested_prompt_version" "text", "requested_error_code" "text", "requested_latency_ms" integer); Type: ACL; Schema: public; Owner: -
--

REVOKE ALL ON FUNCTION "public"."myvet_record_visit_summary_failure"("requested_actor_user_id" "uuid", "requested_visit_id" bigint, "requested_request_id" "uuid", "requested_provider" "text", "requested_model_version" "text", "requested_prompt_version" "text", "requested_error_code" "text", "requested_latency_ms" integer) FROM PUBLIC;
GRANT ALL ON FUNCTION "public"."myvet_record_visit_summary_failure"("requested_actor_user_id" "uuid", "requested_visit_id" bigint, "requested_request_id" "uuid", "requested_provider" "text", "requested_model_version" "text", "requested_prompt_version" "text", "requested_error_code" "text", "requested_latency_ms" integer) TO "service_role";


--
-- Name: FUNCTION "myvet_replace_rag_source"("requested_actor_user_id" "uuid", "requested_pet_id" bigint, "requested_source_type" "text", "requested_source_record_id" "text", "requested_source_fingerprint" "text", "requested_provider" "text", "requested_model" "text", "requested_embedding_version" "text", "requested_chunks" "jsonb"); Type: ACL; Schema: public; Owner: -
--

REVOKE ALL ON FUNCTION "public"."myvet_replace_rag_source"("requested_actor_user_id" "uuid", "requested_pet_id" bigint, "requested_source_type" "text", "requested_source_record_id" "text", "requested_source_fingerprint" "text", "requested_provider" "text", "requested_model" "text", "requested_embedding_version" "text", "requested_chunks" "jsonb") FROM PUBLIC;
GRANT ALL ON FUNCTION "public"."myvet_replace_rag_source"("requested_actor_user_id" "uuid", "requested_pet_id" bigint, "requested_source_type" "text", "requested_source_record_id" "text", "requested_source_fingerprint" "text", "requested_provider" "text", "requested_model" "text", "requested_embedding_version" "text", "requested_chunks" "jsonb") TO "service_role";


--
-- Name: FUNCTION "myvet_slot_is_bookable"("candidate_start" timestamp with time zone, "candidate_end" timestamp with time zone, "excluded_appointment_id" bigint); Type: ACL; Schema: public; Owner: -
--

REVOKE ALL ON FUNCTION "public"."myvet_slot_is_bookable"("candidate_start" timestamp with time zone, "candidate_end" timestamp with time zone, "excluded_appointment_id" bigint) FROM PUBLIC;
GRANT ALL ON FUNCTION "public"."myvet_slot_is_bookable"("candidate_start" timestamp with time zone, "candidate_end" timestamp with time zone, "excluded_appointment_id" bigint) TO "authenticated";
GRANT ALL ON FUNCTION "public"."myvet_slot_is_bookable"("candidate_start" timestamp with time zone, "candidate_end" timestamp with time zone, "excluded_appointment_id" bigint) TO "service_role";


--
-- Name: FUNCTION "myvet_staff_settle_payment"("requested_payment_id" bigint, "requested_method" "text", "tendered_amount" numeric); Type: ACL; Schema: public; Owner: -
--

REVOKE ALL ON FUNCTION "public"."myvet_staff_settle_payment"("requested_payment_id" bigint, "requested_method" "text", "tendered_amount" numeric) FROM PUBLIC;
GRANT ALL ON FUNCTION "public"."myvet_staff_settle_payment"("requested_payment_id" bigint, "requested_method" "text", "tendered_amount" numeric) TO "authenticated";
GRANT ALL ON FUNCTION "public"."myvet_staff_settle_payment"("requested_payment_id" bigint, "requested_method" "text", "tendered_amount" numeric) TO "service_role";


--
-- Name: FUNCTION "myvet_transition_client_summary"("requested_artifact_id" "uuid", "requested_action" "text", "requested_content" "jsonb", "requested_rejection_reason" "text"); Type: ACL; Schema: public; Owner: -
--

REVOKE ALL ON FUNCTION "public"."myvet_transition_client_summary"("requested_artifact_id" "uuid", "requested_action" "text", "requested_content" "jsonb", "requested_rejection_reason" "text") FROM PUBLIC;
GRANT ALL ON FUNCTION "public"."myvet_transition_client_summary"("requested_artifact_id" "uuid", "requested_action" "text", "requested_content" "jsonb", "requested_rejection_reason" "text") TO "authenticated";
GRANT ALL ON FUNCTION "public"."myvet_transition_client_summary"("requested_artifact_id" "uuid", "requested_action" "text", "requested_content" "jsonb", "requested_rejection_reason" "text") TO "service_role";


--
-- Name: FUNCTION "myvet_transition_follow_up_suggestion"("requested_artifact_id" "uuid", "requested_action" "text", "requested_content" "jsonb", "requested_rejection_reason" "text", "requested_duplicate_confirmed" boolean); Type: ACL; Schema: public; Owner: -
--

REVOKE ALL ON FUNCTION "public"."myvet_transition_follow_up_suggestion"("requested_artifact_id" "uuid", "requested_action" "text", "requested_content" "jsonb", "requested_rejection_reason" "text", "requested_duplicate_confirmed" boolean) FROM PUBLIC;
GRANT ALL ON FUNCTION "public"."myvet_transition_follow_up_suggestion"("requested_artifact_id" "uuid", "requested_action" "text", "requested_content" "jsonb", "requested_rejection_reason" "text", "requested_duplicate_confirmed" boolean) TO "authenticated";
GRANT ALL ON FUNCTION "public"."myvet_transition_follow_up_suggestion"("requested_artifact_id" "uuid", "requested_action" "text", "requested_content" "jsonb", "requested_rejection_reason" "text", "requested_duplicate_confirmed" boolean) TO "service_role";


--
-- Name: FUNCTION "myvet_transition_visit_summary"("requested_artifact_id" "uuid", "requested_action" "text", "requested_content" "jsonb", "requested_rejection_reason" "text"); Type: ACL; Schema: public; Owner: -
--

REVOKE ALL ON FUNCTION "public"."myvet_transition_visit_summary"("requested_artifact_id" "uuid", "requested_action" "text", "requested_content" "jsonb", "requested_rejection_reason" "text") FROM PUBLIC;
GRANT ALL ON FUNCTION "public"."myvet_transition_visit_summary"("requested_artifact_id" "uuid", "requested_action" "text", "requested_content" "jsonb", "requested_rejection_reason" "text") TO "authenticated";
GRANT ALL ON FUNCTION "public"."myvet_transition_visit_summary"("requested_artifact_id" "uuid", "requested_action" "text", "requested_content" "jsonb", "requested_rejection_reason" "text") TO "service_role";


--
-- Name: FUNCTION "set_updated_at"(); Type: ACL; Schema: public; Owner: -
--

GRANT ALL ON FUNCTION "public"."set_updated_at"() TO "anon";
GRANT ALL ON FUNCTION "public"."set_updated_at"() TO "authenticated";
GRANT ALL ON FUNCTION "public"."set_updated_at"() TO "service_role";


--
-- Name: TABLE "ai_approval_history"; Type: ACL; Schema: public; Owner: -
--

GRANT ALL ON TABLE "public"."ai_approval_history" TO "service_role";
GRANT SELECT ON TABLE "public"."ai_approval_history" TO "authenticated";


--
-- Name: TABLE "ai_artifacts"; Type: ACL; Schema: public; Owner: -
--

GRANT ALL ON TABLE "public"."ai_artifacts" TO "service_role";
GRANT SELECT ON TABLE "public"."ai_artifacts" TO "authenticated";


--
-- Name: TABLE "ai_audit_events"; Type: ACL; Schema: public; Owner: -
--

GRANT ALL ON TABLE "public"."ai_audit_events" TO "service_role";
GRANT SELECT ON TABLE "public"."ai_audit_events" TO "authenticated";


--
-- Name: SEQUENCE "ai_audit_events_audit_event_id_seq"; Type: ACL; Schema: public; Owner: -
--

GRANT ALL ON SEQUENCE "public"."ai_audit_events_audit_event_id_seq" TO "authenticated";
GRANT ALL ON SEQUENCE "public"."ai_audit_events_audit_event_id_seq" TO "service_role";


--
-- Name: TABLE "ai_consent_records"; Type: ACL; Schema: public; Owner: -
--

GRANT ALL ON TABLE "public"."ai_consent_records" TO "service_role";
GRANT SELECT ON TABLE "public"."ai_consent_records" TO "authenticated";


--
-- Name: TABLE "ai_document_chunks"; Type: ACL; Schema: public; Owner: -
--

GRANT ALL ON TABLE "public"."ai_document_chunks" TO "service_role";


--
-- Name: TABLE "ai_document_embeddings"; Type: ACL; Schema: public; Owner: -
--

GRANT ALL ON TABLE "public"."ai_document_embeddings" TO "service_role";


--
-- Name: TABLE "ai_documents"; Type: ACL; Schema: public; Owner: -
--

GRANT ALL ON TABLE "public"."ai_documents" TO "service_role";
GRANT SELECT ON TABLE "public"."ai_documents" TO "authenticated";


--
-- Name: TABLE "ai_feature_flags"; Type: ACL; Schema: public; Owner: -
--

GRANT ALL ON TABLE "public"."ai_feature_flags" TO "service_role";
GRANT SELECT ON TABLE "public"."ai_feature_flags" TO "authenticated";


--
-- Name: TABLE "ai_operations"; Type: ACL; Schema: public; Owner: -
--

GRANT ALL ON TABLE "public"."ai_operations" TO "service_role";
GRANT SELECT ON TABLE "public"."ai_operations" TO "authenticated";


--
-- Name: TABLE "ai_rate_limit_windows"; Type: ACL; Schema: public; Owner: -
--

GRANT ALL ON TABLE "public"."ai_rate_limit_windows" TO "service_role";


--
-- Name: SEQUENCE "ai_rate_limit_windows_rate_limit_id_seq"; Type: ACL; Schema: public; Owner: -
--

GRANT ALL ON SEQUENCE "public"."ai_rate_limit_windows_rate_limit_id_seq" TO "authenticated";
GRANT ALL ON SEQUENCE "public"."ai_rate_limit_windows_rate_limit_id_seq" TO "service_role";


--
-- Name: TABLE "ai_sources"; Type: ACL; Schema: public; Owner: -
--

GRANT ALL ON TABLE "public"."ai_sources" TO "service_role";
GRANT SELECT ON TABLE "public"."ai_sources" TO "authenticated";


--
-- Name: TABLE "appointments"; Type: ACL; Schema: public; Owner: -
--

GRANT SELECT,INSERT,DELETE,MAINTAIN,UPDATE ON TABLE "public"."appointments" TO "authenticated";
GRANT ALL ON TABLE "public"."appointments" TO "service_role";


--
-- Name: SEQUENCE "appointments_appointment_id_seq"; Type: ACL; Schema: public; Owner: -
--

GRANT ALL ON SEQUENCE "public"."appointments_appointment_id_seq" TO "authenticated";
GRANT ALL ON SEQUENCE "public"."appointments_appointment_id_seq" TO "service_role";


--
-- Name: TABLE "clinic_booking_blocks"; Type: ACL; Schema: public; Owner: -
--

GRANT SELECT,INSERT,DELETE,MAINTAIN,UPDATE ON TABLE "public"."clinic_booking_blocks" TO "authenticated";
GRANT ALL ON TABLE "public"."clinic_booking_blocks" TO "service_role";


--
-- Name: SEQUENCE "clinic_booking_blocks_block_id_seq"; Type: ACL; Schema: public; Owner: -
--

GRANT ALL ON SEQUENCE "public"."clinic_booking_blocks_block_id_seq" TO "authenticated";
GRANT ALL ON SEQUENCE "public"."clinic_booking_blocks_block_id_seq" TO "service_role";


--
-- Name: TABLE "clinic_booking_hours"; Type: ACL; Schema: public; Owner: -
--

GRANT SELECT,INSERT,DELETE,MAINTAIN,UPDATE ON TABLE "public"."clinic_booking_hours" TO "authenticated";
GRANT ALL ON TABLE "public"."clinic_booking_hours" TO "service_role";


--
-- Name: TABLE "clinics"; Type: ACL; Schema: public; Owner: -
--

GRANT SELECT,INSERT,DELETE,MAINTAIN,UPDATE ON TABLE "public"."clinics" TO "authenticated";
GRANT ALL ON TABLE "public"."clinics" TO "service_role";


--
-- Name: TABLE "conversations"; Type: ACL; Schema: public; Owner: -
--

GRANT SELECT,INSERT,DELETE,MAINTAIN,UPDATE ON TABLE "public"."conversations" TO "authenticated";
GRANT ALL ON TABLE "public"."conversations" TO "service_role";


--
-- Name: SEQUENCE "conversations_conversation_id_seq"; Type: ACL; Schema: public; Owner: -
--

GRANT ALL ON SEQUENCE "public"."conversations_conversation_id_seq" TO "authenticated";
GRANT ALL ON SEQUENCE "public"."conversations_conversation_id_seq" TO "service_role";


--
-- Name: TABLE "differential_diagnoses"; Type: ACL; Schema: public; Owner: -
--

GRANT SELECT,INSERT,DELETE,MAINTAIN,UPDATE ON TABLE "public"."differential_diagnoses" TO "authenticated";
GRANT ALL ON TABLE "public"."differential_diagnoses" TO "service_role";


--
-- Name: SEQUENCE "differential_diagnoses_diagnosis_id_seq"; Type: ACL; Schema: public; Owner: -
--

GRANT ALL ON SEQUENCE "public"."differential_diagnoses_diagnosis_id_seq" TO "authenticated";
GRANT ALL ON SEQUENCE "public"."differential_diagnoses_diagnosis_id_seq" TO "service_role";


--
-- Name: TABLE "documents"; Type: ACL; Schema: public; Owner: -
--

GRANT SELECT,INSERT,DELETE,MAINTAIN,UPDATE ON TABLE "public"."documents" TO "authenticated";
GRANT ALL ON TABLE "public"."documents" TO "service_role";


--
-- Name: SEQUENCE "documents_document_id_seq"; Type: ACL; Schema: public; Owner: -
--

GRANT ALL ON SEQUENCE "public"."documents_document_id_seq" TO "authenticated";
GRANT ALL ON SEQUENCE "public"."documents_document_id_seq" TO "service_role";


--
-- Name: TABLE "hospitalizations"; Type: ACL; Schema: public; Owner: -
--

GRANT SELECT,INSERT,DELETE,MAINTAIN,UPDATE ON TABLE "public"."hospitalizations" TO "authenticated";
GRANT ALL ON TABLE "public"."hospitalizations" TO "service_role";


--
-- Name: SEQUENCE "hospitalizations_hospitalization_id_seq"; Type: ACL; Schema: public; Owner: -
--

GRANT ALL ON SEQUENCE "public"."hospitalizations_hospitalization_id_seq" TO "authenticated";
GRANT ALL ON SEQUENCE "public"."hospitalizations_hospitalization_id_seq" TO "service_role";


--
-- Name: TABLE "insights"; Type: ACL; Schema: public; Owner: -
--

GRANT SELECT,INSERT,DELETE,MAINTAIN,UPDATE ON TABLE "public"."insights" TO "authenticated";
GRANT ALL ON TABLE "public"."insights" TO "service_role";


--
-- Name: SEQUENCE "insights_insight_id_seq"; Type: ACL; Schema: public; Owner: -
--

GRANT ALL ON SEQUENCE "public"."insights_insight_id_seq" TO "authenticated";
GRANT ALL ON SEQUENCE "public"."insights_insight_id_seq" TO "service_role";


--
-- Name: TABLE "inventory"; Type: ACL; Schema: public; Owner: -
--

GRANT SELECT,INSERT,DELETE,MAINTAIN,UPDATE ON TABLE "public"."inventory" TO "authenticated";
GRANT ALL ON TABLE "public"."inventory" TO "service_role";


--
-- Name: SEQUENCE "inventory_item_id_seq"; Type: ACL; Schema: public; Owner: -
--

GRANT ALL ON SEQUENCE "public"."inventory_item_id_seq" TO "authenticated";
GRANT ALL ON SEQUENCE "public"."inventory_item_id_seq" TO "service_role";


--
-- Name: TABLE "lab_orders"; Type: ACL; Schema: public; Owner: -
--

GRANT SELECT,INSERT,DELETE,MAINTAIN,UPDATE ON TABLE "public"."lab_orders" TO "authenticated";
GRANT ALL ON TABLE "public"."lab_orders" TO "service_role";


--
-- Name: SEQUENCE "lab_orders_lab_order_id_seq"; Type: ACL; Schema: public; Owner: -
--

GRANT ALL ON SEQUENCE "public"."lab_orders_lab_order_id_seq" TO "authenticated";
GRANT ALL ON SEQUENCE "public"."lab_orders_lab_order_id_seq" TO "service_role";


--
-- Name: TABLE "medical_problems"; Type: ACL; Schema: public; Owner: -
--

GRANT SELECT,INSERT,DELETE,MAINTAIN,UPDATE ON TABLE "public"."medical_problems" TO "authenticated";
GRANT ALL ON TABLE "public"."medical_problems" TO "service_role";


--
-- Name: SEQUENCE "medical_problems_problem_id_seq"; Type: ACL; Schema: public; Owner: -
--

GRANT ALL ON SEQUENCE "public"."medical_problems_problem_id_seq" TO "authenticated";
GRANT ALL ON SEQUENCE "public"."medical_problems_problem_id_seq" TO "service_role";


--
-- Name: TABLE "medical_visits"; Type: ACL; Schema: public; Owner: -
--

GRANT SELECT,INSERT,DELETE,MAINTAIN,UPDATE ON TABLE "public"."medical_visits" TO "authenticated";
GRANT ALL ON TABLE "public"."medical_visits" TO "service_role";


--
-- Name: SEQUENCE "medical_visits_visit_id_seq"; Type: ACL; Schema: public; Owner: -
--

GRANT ALL ON SEQUENCE "public"."medical_visits_visit_id_seq" TO "authenticated";
GRANT ALL ON SEQUENCE "public"."medical_visits_visit_id_seq" TO "service_role";


--
-- Name: TABLE "message_attachments"; Type: ACL; Schema: public; Owner: -
--

GRANT SELECT,INSERT,DELETE,MAINTAIN,UPDATE ON TABLE "public"."message_attachments" TO "authenticated";
GRANT ALL ON TABLE "public"."message_attachments" TO "service_role";


--
-- Name: SEQUENCE "message_attachments_attachment_id_seq"; Type: ACL; Schema: public; Owner: -
--

GRANT ALL ON SEQUENCE "public"."message_attachments_attachment_id_seq" TO "authenticated";
GRANT ALL ON SEQUENCE "public"."message_attachments_attachment_id_seq" TO "service_role";


--
-- Name: TABLE "messages"; Type: ACL; Schema: public; Owner: -
--

GRANT SELECT,INSERT,DELETE,MAINTAIN,UPDATE ON TABLE "public"."messages" TO "authenticated";
GRANT ALL ON TABLE "public"."messages" TO "service_role";


--
-- Name: SEQUENCE "messages_message_id_seq"; Type: ACL; Schema: public; Owner: -
--

GRANT ALL ON SEQUENCE "public"."messages_message_id_seq" TO "authenticated";
GRANT ALL ON SEQUENCE "public"."messages_message_id_seq" TO "service_role";


--
-- Name: TABLE "notifications"; Type: ACL; Schema: public; Owner: -
--

GRANT SELECT,INSERT,DELETE,MAINTAIN,UPDATE ON TABLE "public"."notifications" TO "authenticated";
GRANT ALL ON TABLE "public"."notifications" TO "service_role";


--
-- Name: SEQUENCE "notifications_notification_id_seq"; Type: ACL; Schema: public; Owner: -
--

GRANT ALL ON SEQUENCE "public"."notifications_notification_id_seq" TO "authenticated";
GRANT ALL ON SEQUENCE "public"."notifications_notification_id_seq" TO "service_role";


--
-- Name: TABLE "owners"; Type: ACL; Schema: public; Owner: -
--

GRANT SELECT,INSERT,DELETE,MAINTAIN,UPDATE ON TABLE "public"."owners" TO "authenticated";
GRANT ALL ON TABLE "public"."owners" TO "service_role";


--
-- Name: TABLE "patients"; Type: ACL; Schema: public; Owner: -
--

GRANT SELECT,INSERT,DELETE,MAINTAIN,UPDATE ON TABLE "public"."patients" TO "authenticated";
GRANT ALL ON TABLE "public"."patients" TO "service_role";


--
-- Name: SEQUENCE "patients_id_pet_seq"; Type: ACL; Schema: public; Owner: -
--

GRANT ALL ON SEQUENCE "public"."patients_id_pet_seq" TO "authenticated";
GRANT ALL ON SEQUENCE "public"."patients_id_pet_seq" TO "service_role";


--
-- Name: TABLE "payment_items"; Type: ACL; Schema: public; Owner: -
--

GRANT SELECT,INSERT,DELETE,MAINTAIN,UPDATE ON TABLE "public"."payment_items" TO "authenticated";
GRANT ALL ON TABLE "public"."payment_items" TO "service_role";


--
-- Name: SEQUENCE "payment_items_payment_item_id_seq"; Type: ACL; Schema: public; Owner: -
--

GRANT ALL ON SEQUENCE "public"."payment_items_payment_item_id_seq" TO "authenticated";
GRANT ALL ON SEQUENCE "public"."payment_items_payment_item_id_seq" TO "service_role";


--
-- Name: TABLE "payment_transactions"; Type: ACL; Schema: public; Owner: -
--

GRANT SELECT,MAINTAIN ON TABLE "public"."payment_transactions" TO "authenticated";
GRANT ALL ON TABLE "public"."payment_transactions" TO "service_role";


--
-- Name: SEQUENCE "payment_transactions_transaction_id_seq"; Type: ACL; Schema: public; Owner: -
--

GRANT ALL ON SEQUENCE "public"."payment_transactions_transaction_id_seq" TO "authenticated";
GRANT ALL ON SEQUENCE "public"."payment_transactions_transaction_id_seq" TO "service_role";


--
-- Name: TABLE "payments"; Type: ACL; Schema: public; Owner: -
--

GRANT SELECT,INSERT,DELETE,MAINTAIN,UPDATE ON TABLE "public"."payments" TO "authenticated";
GRANT ALL ON TABLE "public"."payments" TO "service_role";


--
-- Name: SEQUENCE "payments_payment_id_seq"; Type: ACL; Schema: public; Owner: -
--

GRANT ALL ON SEQUENCE "public"."payments_payment_id_seq" TO "authenticated";
GRANT ALL ON SEQUENCE "public"."payments_payment_id_seq" TO "service_role";


--
-- Name: TABLE "physical_exams"; Type: ACL; Schema: public; Owner: -
--

GRANT SELECT,INSERT,DELETE,MAINTAIN,UPDATE ON TABLE "public"."physical_exams" TO "authenticated";
GRANT ALL ON TABLE "public"."physical_exams" TO "service_role";


--
-- Name: SEQUENCE "physical_exams_physical_exam_id_seq"; Type: ACL; Schema: public; Owner: -
--

GRANT ALL ON SEQUENCE "public"."physical_exams_physical_exam_id_seq" TO "authenticated";
GRANT ALL ON SEQUENCE "public"."physical_exams_physical_exam_id_seq" TO "service_role";


--
-- Name: TABLE "prescriptions"; Type: ACL; Schema: public; Owner: -
--

GRANT SELECT,INSERT,DELETE,MAINTAIN,UPDATE ON TABLE "public"."prescriptions" TO "authenticated";
GRANT ALL ON TABLE "public"."prescriptions" TO "service_role";


--
-- Name: SEQUENCE "prescriptions_prescription_id_seq"; Type: ACL; Schema: public; Owner: -
--

GRANT ALL ON SEQUENCE "public"."prescriptions_prescription_id_seq" TO "authenticated";
GRANT ALL ON SEQUENCE "public"."prescriptions_prescription_id_seq" TO "service_role";


--
-- Name: TABLE "reminders"; Type: ACL; Schema: public; Owner: -
--

GRANT SELECT,INSERT,DELETE,MAINTAIN,UPDATE ON TABLE "public"."reminders" TO "authenticated";
GRANT ALL ON TABLE "public"."reminders" TO "service_role";


--
-- Name: SEQUENCE "reminders_reminder_id_seq"; Type: ACL; Schema: public; Owner: -
--

GRANT ALL ON SEQUENCE "public"."reminders_reminder_id_seq" TO "authenticated";
GRANT ALL ON SEQUENCE "public"."reminders_reminder_id_seq" TO "service_role";


--
-- Name: TABLE "service_catalog"; Type: ACL; Schema: public; Owner: -
--

GRANT SELECT,INSERT,DELETE,MAINTAIN,UPDATE ON TABLE "public"."service_catalog" TO "authenticated";
GRANT ALL ON TABLE "public"."service_catalog" TO "service_role";


--
-- Name: SEQUENCE "service_catalog_service_id_seq"; Type: ACL; Schema: public; Owner: -
--

GRANT ALL ON SEQUENCE "public"."service_catalog_service_id_seq" TO "authenticated";
GRANT ALL ON SEQUENCE "public"."service_catalog_service_id_seq" TO "service_role";


--
-- Name: TABLE "staff"; Type: ACL; Schema: public; Owner: -
--

GRANT SELECT,INSERT,DELETE,MAINTAIN,UPDATE ON TABLE "public"."staff" TO "authenticated";
GRANT ALL ON TABLE "public"."staff" TO "service_role";


--
-- Name: TABLE "vaccinations"; Type: ACL; Schema: public; Owner: -
--

GRANT SELECT,INSERT,DELETE,MAINTAIN,UPDATE ON TABLE "public"."vaccinations" TO "authenticated";
GRANT ALL ON TABLE "public"."vaccinations" TO "service_role";


--
-- Name: TABLE "vetbot_action_requests"; Type: ACL; Schema: public; Owner: -
--

GRANT SELECT,MAINTAIN ON TABLE "public"."vetbot_action_requests" TO "authenticated";
GRANT ALL ON TABLE "public"."vetbot_action_requests" TO "service_role";


--
-- Name: TABLE "vetbot_audit_logs"; Type: ACL; Schema: public; Owner: -
--

GRANT SELECT,INSERT,DELETE,MAINTAIN,UPDATE ON TABLE "public"."vetbot_audit_logs" TO "authenticated";
GRANT ALL ON TABLE "public"."vetbot_audit_logs" TO "service_role";


--
-- Name: SEQUENCE "vetbot_audit_logs_audit_id_seq"; Type: ACL; Schema: public; Owner: -
--

GRANT ALL ON SEQUENCE "public"."vetbot_audit_logs_audit_id_seq" TO "authenticated";
GRANT ALL ON SEQUENCE "public"."vetbot_audit_logs_audit_id_seq" TO "service_role";


--
-- Name: TABLE "vetbot_feedback"; Type: ACL; Schema: public; Owner: -
--

GRANT SELECT,INSERT,DELETE,MAINTAIN,UPDATE ON TABLE "public"."vetbot_feedback" TO "authenticated";
GRANT ALL ON TABLE "public"."vetbot_feedback" TO "service_role";


--
-- Name: SEQUENCE "vetbot_feedback_feedback_id_seq"; Type: ACL; Schema: public; Owner: -
--

GRANT ALL ON SEQUENCE "public"."vetbot_feedback_feedback_id_seq" TO "authenticated";
GRANT ALL ON SEQUENCE "public"."vetbot_feedback_feedback_id_seq" TO "service_role";


--
-- Name: TABLE "vetbot_knowledge"; Type: ACL; Schema: public; Owner: -
--

GRANT SELECT,INSERT,DELETE,MAINTAIN,UPDATE ON TABLE "public"."vetbot_knowledge" TO "authenticated";
GRANT ALL ON TABLE "public"."vetbot_knowledge" TO "service_role";


--
-- Name: SEQUENCE "vetbot_knowledge_knowledge_id_seq"; Type: ACL; Schema: public; Owner: -
--

GRANT ALL ON SEQUENCE "public"."vetbot_knowledge_knowledge_id_seq" TO "authenticated";
GRANT ALL ON SEQUENCE "public"."vetbot_knowledge_knowledge_id_seq" TO "service_role";


--
-- Name: TABLE "video_sessions"; Type: ACL; Schema: public; Owner: -
--

GRANT SELECT,INSERT,DELETE,MAINTAIN,UPDATE ON TABLE "public"."video_sessions" TO "authenticated";
GRANT ALL ON TABLE "public"."video_sessions" TO "service_role";


--
-- Name: SEQUENCE "video_sessions_session_id_seq"; Type: ACL; Schema: public; Owner: -
--

GRANT ALL ON SEQUENCE "public"."video_sessions_session_id_seq" TO "authenticated";
GRANT ALL ON SEQUENCE "public"."video_sessions_session_id_seq" TO "service_role";


--
-- Name: DEFAULT PRIVILEGES FOR SEQUENCES; Type: DEFAULT ACL; Schema: public; Owner: -
--



--
-- Name: DEFAULT PRIVILEGES FOR SEQUENCES; Type: DEFAULT ACL; Schema: public; Owner: -
--



--
-- Name: DEFAULT PRIVILEGES FOR FUNCTIONS; Type: DEFAULT ACL; Schema: public; Owner: -
--



--
-- Name: DEFAULT PRIVILEGES FOR FUNCTIONS; Type: DEFAULT ACL; Schema: public; Owner: -
--



--
-- Name: DEFAULT PRIVILEGES FOR TABLES; Type: DEFAULT ACL; Schema: public; Owner: -
--



--
-- Name: DEFAULT PRIVILEGES FOR TABLES; Type: DEFAULT ACL; Schema: public; Owner: -
--



--
-- PostgreSQL database dump complete
--


