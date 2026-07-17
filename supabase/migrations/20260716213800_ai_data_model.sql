-- Stage 2 / 2 of 4: normalized data model for future AI capabilities.
-- No Stage 3 capability is implemented here. Raw prompts and responses are not
-- stored in operational/audit rows; sensitive generated content lives only in
-- ai_artifacts and is protected separately by RLS.

create table if not exists public.ai_operations (
  operation_id uuid primary key default gen_random_uuid(),
  clinic_id uuid not null references public.clinics(clinic_id) on delete restrict,
  capability text not null check (capability in (
    'vetbot', 'visit_summary', 'digitalcare_transcription', 'record_qa',
    'document_ocr', 'client_explanation', 'reminder_suggestion'
  )),
  actor_user_id uuid null references auth.users(id) on delete set null,
  actor_staff_id uuid null,
  owner_id text null,
  pet_id bigint null,
  visit_id bigint null,
  appointment_id bigint null,
  status text not null default 'queued' check (status in (
    'queued', 'running', 'succeeded', 'failed', 'cancelled', 'blocked'
  )),
  request_fingerprint text null check (request_fingerprint is null or char_length(request_fingerprint) between 32 and 128),
  idempotency_key text null check (idempotency_key is null or char_length(idempotency_key) between 8 and 200),
  provider text null check (provider is null or char_length(provider) <= 80),
  model_version text null check (model_version is null or char_length(model_version) <= 120),
  prompt_version text null check (prompt_version is null or char_length(prompt_version) <= 120),
  schema_version text null check (schema_version is null or char_length(schema_version) <= 120),
  latency_ms integer null check (latency_ms is null or latency_ms >= 0),
  input_tokens integer null check (input_tokens is null or input_tokens >= 0),
  output_tokens integer null check (output_tokens is null or output_tokens >= 0),
  error_code text null check (error_code is null or error_code ~ '^[A-Z0-9_]{1,80}$'),
  started_at timestamptz null,
  completed_at timestamptz null,
  retention_until timestamptz null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint ai_operations_actor_staff_fkey
    foreign key (clinic_id, actor_staff_id)
    references public.staff(clinic_id, staff_id) on delete restrict,
  constraint ai_operations_owner_fkey
    foreign key (clinic_id, owner_id)
    references public.owners(clinic_id, owner_id) on delete restrict,
  constraint ai_operations_pet_fkey
    foreign key (clinic_id, pet_id)
    references public.patients(clinic_id, pet_id) on delete restrict,
  constraint ai_operations_visit_fkey
    foreign key (clinic_id, visit_id)
    references public.medical_visits(clinic_id, visit_id) on delete restrict,
  constraint ai_operations_appointment_fkey
    foreign key (clinic_id, appointment_id)
    references public.appointments(clinic_id, appointment_id) on delete restrict,
  constraint ai_operations_time_order check (completed_at is null or started_at is null or completed_at >= started_at),
  unique (clinic_id, operation_id)
);

create unique index if not exists ai_operations_idempotency_key_idx
  on public.ai_operations (clinic_id, capability, idempotency_key)
  where idempotency_key is not null;
create index if not exists ai_operations_clinic_status_created_idx
  on public.ai_operations (clinic_id, status, created_at desc);
create index if not exists ai_operations_actor_created_idx
  on public.ai_operations (actor_user_id, created_at desc)
  where actor_user_id is not null;
create index if not exists ai_operations_pet_created_idx
  on public.ai_operations (clinic_id, pet_id, created_at desc)
  where pet_id is not null;
create index if not exists ai_operations_actor_staff_idx
  on public.ai_operations (clinic_id, actor_staff_id) where actor_staff_id is not null;
create index if not exists ai_operations_owner_idx
  on public.ai_operations (clinic_id, owner_id) where owner_id is not null;
create index if not exists ai_operations_visit_idx
  on public.ai_operations (clinic_id, visit_id) where visit_id is not null;
create index if not exists ai_operations_appointment_idx
  on public.ai_operations (clinic_id, appointment_id) where appointment_id is not null;

create table if not exists public.ai_audit_events (
  audit_event_id bigint generated always as identity primary key,
  clinic_id uuid not null references public.clinics(clinic_id) on delete restrict,
  actor_user_id uuid null references auth.users(id) on delete set null,
  operation_id uuid null,
  capability text not null check (char_length(capability) between 1 and 80),
  event_type text not null check (event_type in (
    'request_received', 'provider_completed', 'provider_failed', 'output_rejected',
    'draft_created', 'approval_recorded', 'release_recorded', 'access_denied',
    'rate_limited', 'feature_disabled'
  )),
  outcome text not null check (outcome in ('success', 'failed', 'blocked')),
  provider text null check (provider is null or char_length(provider) <= 80),
  model_version text null check (model_version is null or char_length(model_version) <= 120),
  prompt_version text null check (prompt_version is null or char_length(prompt_version) <= 120),
  schema_version text null check (schema_version is null or char_length(schema_version) <= 120),
  latency_ms integer null check (latency_ms is null or latency_ms >= 0),
  input_tokens integer null check (input_tokens is null or input_tokens >= 0),
  output_tokens integer null check (output_tokens is null or output_tokens >= 0),
  error_code text null check (error_code is null or error_code ~ '^[A-Z0-9_]{1,80}$'),
  created_at timestamptz not null default now(),
  constraint ai_audit_events_operation_fkey
    foreign key (clinic_id, operation_id)
    references public.ai_operations(clinic_id, operation_id) on delete set null (operation_id)
);

create index if not exists ai_audit_events_clinic_created_idx
  on public.ai_audit_events (clinic_id, created_at desc);
create index if not exists ai_audit_events_operation_idx
  on public.ai_audit_events (operation_id, created_at)
  where operation_id is not null;

create table if not exists public.ai_documents (
  document_id uuid primary key default gen_random_uuid(),
  clinic_id uuid not null references public.clinics(clinic_id) on delete restrict,
  owner_id text null,
  pet_id bigint null,
  visit_id bigint null,
  appointment_id bigint null,
  document_kind text not null check (document_kind in (
    'medical_document', 'vaccination_label', 'recording', 'transcript_source', 'other'
  )),
  bucket_id text not null check (bucket_id in ('ai-medical-documents', 'ai-recordings')),
  object_path text not null check (char_length(object_path) between 10 and 1024 and object_path !~ '(^|/)\.\.(/|$)'),
  mime_type text not null check (char_length(mime_type) between 3 and 160),
  size_bytes bigint not null check (size_bytes between 1 and 52428800),
  checksum_sha256 text null check (checksum_sha256 is null or checksum_sha256 ~ '^[a-f0-9]{64}$'),
  status text not null default 'pending' check (status in (
    'pending', 'ready', 'failed', 'quarantined', 'deleted'
  )),
  uploaded_by uuid null references auth.users(id) on delete set null,
  released_to_owner boolean not null default false,
  released_at timestamptz null,
  retention_until timestamptz null,
  deleted_at timestamptz null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint ai_documents_owner_fkey
    foreign key (clinic_id, owner_id)
    references public.owners(clinic_id, owner_id) on delete restrict,
  constraint ai_documents_pet_fkey
    foreign key (clinic_id, pet_id)
    references public.patients(clinic_id, pet_id) on delete restrict,
  constraint ai_documents_visit_fkey
    foreign key (clinic_id, visit_id)
    references public.medical_visits(clinic_id, visit_id) on delete restrict,
  constraint ai_documents_appointment_fkey
    foreign key (clinic_id, appointment_id)
    references public.appointments(clinic_id, appointment_id) on delete restrict,
  constraint ai_documents_release_state check (
    (not released_to_owner and released_at is null)
    or (released_to_owner and released_at is not null and status = 'ready' and document_kind <> 'recording')
  ),
  constraint ai_documents_deleted_state check ((status = 'deleted') = (deleted_at is not null)),
  unique (bucket_id, object_path),
  unique (clinic_id, document_id)
);

create index if not exists ai_documents_clinic_pet_created_idx
  on public.ai_documents (clinic_id, pet_id, created_at desc)
  where pet_id is not null and deleted_at is null;
create index if not exists ai_documents_retention_idx
  on public.ai_documents (retention_until)
  where retention_until is not null and deleted_at is null;
create index if not exists ai_documents_owner_idx
  on public.ai_documents (clinic_id, owner_id) where owner_id is not null;
create index if not exists ai_documents_visit_idx
  on public.ai_documents (clinic_id, visit_id) where visit_id is not null;
create index if not exists ai_documents_appointment_idx
  on public.ai_documents (clinic_id, appointment_id) where appointment_id is not null;

create table if not exists public.ai_document_chunks (
  chunk_id uuid primary key default gen_random_uuid(),
  clinic_id uuid not null references public.clinics(clinic_id) on delete restrict,
  document_id uuid not null,
  chunk_index integer not null check (chunk_index >= 0),
  content text not null check (char_length(content) between 1 and 12000),
  content_hash text not null check (content_hash ~ '^[a-f0-9]{64}$'),
  token_count integer null check (token_count is null or token_count >= 0),
  status text not null default 'pending' check (status in ('pending', 'ready', 'failed', 'superseded')),
  approval_status text not null default 'internal' check (approval_status in ('internal', 'approved', 'released')),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint ai_document_chunks_document_fkey
    foreign key (clinic_id, document_id)
    references public.ai_documents(clinic_id, document_id) on delete cascade,
  unique (document_id, chunk_index),
  unique (clinic_id, chunk_id),
  constraint ai_document_chunks_release_check check (approval_status <> 'released' or status = 'ready')
);

create index if not exists ai_document_chunks_clinic_document_idx
  on public.ai_document_chunks (clinic_id, document_id, chunk_index);

-- Registry only. The pgvector payload and similarity RPC are deliberately
-- deferred until Stage 5 selects one embedding model and dimension. This avoids
-- an irreversible/incorrect vector typmod now while preserving lifecycle data.
create table if not exists public.ai_document_embeddings (
  embedding_id uuid primary key default gen_random_uuid(),
  clinic_id uuid not null references public.clinics(clinic_id) on delete restrict,
  chunk_id uuid not null,
  provider text not null check (char_length(provider) between 1 and 80),
  model_version text not null check (char_length(model_version) between 1 and 120),
  dimensions integer not null check (dimensions between 1 and 4096),
  embedding_hash text not null check (embedding_hash ~ '^[a-f0-9]{64}$'),
  status text not null default 'pending' check (status in ('pending', 'failed', 'superseded')),
  error_code text null check (error_code is null or error_code ~ '^[A-Z0-9_]{1,80}$'),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint ai_document_embeddings_chunk_fkey
    foreign key (clinic_id, chunk_id)
    references public.ai_document_chunks(clinic_id, chunk_id) on delete cascade,
  unique (chunk_id, model_version, embedding_hash)
);

create index if not exists ai_document_embeddings_clinic_status_idx
  on public.ai_document_embeddings (clinic_id, status, created_at desc);
create index if not exists ai_document_embeddings_chunk_idx
  on public.ai_document_embeddings (clinic_id, chunk_id);

create table if not exists public.ai_artifacts (
  artifact_id uuid primary key default gen_random_uuid(),
  clinic_id uuid not null references public.clinics(clinic_id) on delete restrict,
  operation_id uuid not null,
  owner_id text null,
  pet_id bigint null,
  visit_id bigint null,
  appointment_id bigint null,
  artifact_type text not null check (artifact_type in (
    'visit_summary', 'transcript', 'document_extraction', 'client_explanation',
    'reminder_suggestion', 'structured_response'
  )),
  status text not null default 'generating' check (status in (
    'generating', 'draft', 'edited', 'approved', 'rejected', 'failed', 'superseded'
  )),
  content jsonb not null default '{}'::jsonb check (jsonb_typeof(content) = 'object'),
  created_by uuid null references auth.users(id) on delete set null,
  approved_by uuid null,
  approved_at timestamptz null,
  released_to_owner boolean not null default false,
  released_at timestamptz null,
  model_version text null check (model_version is null or char_length(model_version) <= 120),
  prompt_version text null check (prompt_version is null or char_length(prompt_version) <= 120),
  version_number integer not null default 1 check (version_number >= 1),
  supersedes_artifact_id uuid null,
  retention_until timestamptz null,
  deleted_at timestamptz null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint ai_artifacts_owner_fkey
    foreign key (clinic_id, owner_id)
    references public.owners(clinic_id, owner_id) on delete restrict,
  constraint ai_artifacts_operation_fkey
    foreign key (clinic_id, operation_id)
    references public.ai_operations(clinic_id, operation_id) on delete restrict,
  constraint ai_artifacts_pet_fkey
    foreign key (clinic_id, pet_id)
    references public.patients(clinic_id, pet_id) on delete restrict,
  constraint ai_artifacts_visit_fkey
    foreign key (clinic_id, visit_id)
    references public.medical_visits(clinic_id, visit_id) on delete restrict,
  constraint ai_artifacts_appointment_fkey
    foreign key (clinic_id, appointment_id)
    references public.appointments(clinic_id, appointment_id) on delete restrict,
  constraint ai_artifacts_approved_by_fkey
    foreign key (clinic_id, approved_by)
    references public.staff(clinic_id, staff_id) on delete restrict,
  constraint ai_artifacts_supersedes_fkey
    foreign key (clinic_id, supersedes_artifact_id)
    references public.ai_artifacts(clinic_id, artifact_id) on delete restrict,
  constraint ai_artifacts_approval_state check (
    (status = 'approved' and approved_by is not null and approved_at is not null)
    or (status <> 'approved' and approved_at is null)
  ),
  constraint ai_artifacts_release_state check (
    (not released_to_owner and released_at is null)
    or (
      released_to_owner and released_at is not null and status = 'approved'
      and artifact_type not in ('transcript', 'document_extraction')
    )
  ),
  unique (clinic_id, artifact_id)
);

create index if not exists ai_artifacts_clinic_pet_status_idx
  on public.ai_artifacts (clinic_id, pet_id, status, created_at desc)
  where deleted_at is null;
create index if not exists ai_artifacts_operation_idx
  on public.ai_artifacts (clinic_id, operation_id, version_number desc);
create index if not exists ai_artifacts_retention_idx
  on public.ai_artifacts (retention_until)
  where retention_until is not null and deleted_at is null;
create index if not exists ai_artifacts_owner_idx
  on public.ai_artifacts (clinic_id, owner_id) where owner_id is not null;
create index if not exists ai_artifacts_visit_idx
  on public.ai_artifacts (clinic_id, visit_id) where visit_id is not null;
create index if not exists ai_artifacts_appointment_idx
  on public.ai_artifacts (clinic_id, appointment_id) where appointment_id is not null;
create index if not exists ai_artifacts_approved_by_idx
  on public.ai_artifacts (clinic_id, approved_by) where approved_by is not null;
create index if not exists ai_artifacts_supersedes_idx
  on public.ai_artifacts (clinic_id, supersedes_artifact_id) where supersedes_artifact_id is not null;

create table if not exists public.ai_sources (
  source_id uuid primary key default gen_random_uuid(),
  clinic_id uuid not null references public.clinics(clinic_id) on delete restrict,
  artifact_id uuid not null,
  source_type text not null check (source_type in (
    'medical_visit', 'appointment', 'document', 'document_chunk', 'digitalcare', 'manual_note'
  )),
  source_record_id text not null check (char_length(source_record_id) between 1 and 160),
  document_id uuid null,
  chunk_id uuid null,
  source_hash text null check (source_hash is null or source_hash ~ '^[a-f0-9]{64}$'),
  released_to_owner boolean not null default false,
  created_at timestamptz not null default now(),
  constraint ai_sources_artifact_fkey
    foreign key (clinic_id, artifact_id)
    references public.ai_artifacts(clinic_id, artifact_id) on delete cascade,
  constraint ai_sources_document_fkey
    foreign key (clinic_id, document_id)
    references public.ai_documents(clinic_id, document_id) on delete restrict,
  constraint ai_sources_chunk_fkey
    foreign key (clinic_id, chunk_id)
    references public.ai_document_chunks(clinic_id, chunk_id) on delete restrict,
  unique (artifact_id, source_type, source_record_id)
);

create index if not exists ai_sources_clinic_artifact_idx
  on public.ai_sources (clinic_id, artifact_id);
create index if not exists ai_sources_document_idx
  on public.ai_sources (clinic_id, document_id) where document_id is not null;
create index if not exists ai_sources_chunk_idx
  on public.ai_sources (clinic_id, chunk_id) where chunk_id is not null;

create table if not exists public.ai_approval_history (
  approval_event_id uuid primary key default gen_random_uuid(),
  clinic_id uuid not null references public.clinics(clinic_id) on delete restrict,
  artifact_id uuid not null,
  action text not null check (action in (
    'submitted', 'edited', 'approved', 'rejected', 'superseded', 'released', 'release_revoked'
  )),
  actor_user_id uuid null references auth.users(id) on delete set null,
  actor_staff_id uuid null,
  previous_status text null,
  new_status text null,
  change_summary jsonb not null default '{}'::jsonb check (jsonb_typeof(change_summary) = 'object'),
  created_at timestamptz not null default now(),
  constraint ai_approval_history_artifact_fkey
    foreign key (clinic_id, artifact_id)
    references public.ai_artifacts(clinic_id, artifact_id) on delete restrict,
  constraint ai_approval_history_staff_fkey
    foreign key (clinic_id, actor_staff_id)
    references public.staff(clinic_id, staff_id) on delete restrict,
  constraint ai_approval_history_previous_status_check check (
    previous_status is null or previous_status in ('generating','draft','edited','approved','rejected','failed','superseded')
  ),
  constraint ai_approval_history_new_status_check check (
    new_status is null or new_status in ('generating','draft','edited','approved','rejected','failed','superseded')
  )
);

create index if not exists ai_approval_history_artifact_created_idx
  on public.ai_approval_history (clinic_id, artifact_id, created_at desc);
create index if not exists ai_approval_history_actor_staff_idx
  on public.ai_approval_history (clinic_id, actor_staff_id) where actor_staff_id is not null;

create table if not exists public.ai_consent_records (
  consent_id uuid primary key default gen_random_uuid(),
  clinic_id uuid not null references public.clinics(clinic_id) on delete restrict,
  owner_id text not null,
  auth_user_id uuid null references auth.users(id) on delete set null,
  purpose text not null check (purpose in (
    'ai_processing', 'recording', 'transcription', 'document_ocr', 'client_explanation'
  )),
  notice_version text not null check (char_length(notice_version) between 1 and 80),
  status text not null check (status in ('granted', 'withdrawn', 'expired', 'revoked')),
  capture_source text not null check (capture_source in ('owner_portal', 'staff_assisted', 'written', 'system_migration')),
  granted_at timestamptz null,
  withdrawn_at timestamptz null,
  created_by uuid null references auth.users(id) on delete set null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint ai_consent_records_owner_fkey
    foreign key (clinic_id, owner_id)
    references public.owners(clinic_id, owner_id) on delete restrict,
  constraint ai_consent_records_status_time check (
    (status = 'granted' and granted_at is not null and withdrawn_at is null)
    or (status <> 'granted' and withdrawn_at is not null)
  )
);

create unique index if not exists ai_consent_records_one_active_idx
  on public.ai_consent_records (clinic_id, owner_id, purpose)
  where status = 'granted';
create index if not exists ai_consent_records_owner_created_idx
  on public.ai_consent_records (clinic_id, owner_id, created_at desc);

create table if not exists public.ai_feature_flags (
  clinic_id uuid not null references public.clinics(clinic_id) on delete cascade,
  capability text not null check (capability in (
    'vetbot', 'vetbot_actions', 'appointment_actions', 'visit_summary',
    'digitalcare_transcription', 'record_qa', 'document_ocr',
    'client_explanation', 'reminder_suggestion'
  )),
  enabled boolean not null default false,
  kill_switch boolean not null default false,
  configuration jsonb not null default '{}'::jsonb check (jsonb_typeof(configuration) = 'object'),
  updated_by uuid null references auth.users(id) on delete set null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  primary key (clinic_id, capability),
  constraint ai_feature_flags_kill_switch check (not kill_switch or not enabled)
);

create table if not exists public.ai_rate_limit_windows (
  rate_limit_id bigint generated always as identity primary key,
  clinic_id uuid not null references public.clinics(clinic_id) on delete cascade,
  actor_user_id uuid not null references auth.users(id) on delete cascade,
  capability text not null check (char_length(capability) between 1 and 80),
  window_started_at timestamptz not null,
  request_count integer not null default 1 check (request_count between 0 and 100000),
  expires_at timestamptz not null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (clinic_id, actor_user_id, capability, window_started_at),
  constraint ai_rate_limit_window_order check (expires_at > window_started_at)
);

create index if not exists ai_rate_limit_windows_expiry_idx
  on public.ai_rate_limit_windows (expires_at);

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

do $$
declare
  target_table text;
  updated_tables text[] := array[
    'clinics', 'ai_operations', 'ai_documents', 'ai_document_chunks', 'ai_document_embeddings',
    'ai_artifacts', 'ai_consent_records', 'ai_feature_flags', 'ai_rate_limit_windows'
  ];
  scoped_tables text[] := array['ai_operations', 'ai_documents', 'ai_artifacts'];
begin
  foreach target_table in array updated_tables loop
    execute format('drop trigger if exists myvet_set_updated_at on public.%I', target_table);
    execute format(
      'create trigger myvet_set_updated_at before update on public.%I for each row execute function private.myvet_set_updated_at()',
      target_table
    );
  end loop;

  foreach target_table in array scoped_tables loop
    execute format('drop trigger if exists myvet_validate_ai_scope on public.%I', target_table);
    execute format(
      'create trigger myvet_validate_ai_scope before insert or update on public.%I for each row execute function private.myvet_validate_ai_scope()',
      target_table
    );
  end loop;
end $$;

drop trigger if exists myvet_validate_ai_approval on public.ai_artifacts;
create trigger myvet_validate_ai_approval
before insert or update on public.ai_artifacts
for each row execute function private.myvet_validate_ai_approval();

drop trigger if exists myvet_validate_ai_source on public.ai_sources;
create trigger myvet_validate_ai_source
before insert or update on public.ai_sources
for each row execute function private.myvet_validate_ai_source();

do $$
declare
  target_table text;
  ai_tables text[] := array[
    'ai_operations', 'ai_audit_events', 'ai_documents', 'ai_document_chunks', 'ai_document_embeddings',
    'ai_artifacts', 'ai_sources', 'ai_approval_history', 'ai_consent_records',
    'ai_feature_flags', 'ai_rate_limit_windows'
  ];
begin
  foreach target_table in array ai_tables loop
    execute format('alter table public.%I enable row level security', target_table);
  end loop;
end $$;

comment on table public.ai_operations is
  'Metadata-only AI request lifecycle. Never store prompts, responses, medical text, tokens or secrets here.';
comment on table public.ai_artifacts is
  'Sensitive AI drafts and approved artifacts; direct browser writes are intentionally not granted in Stage 2.';
comment on table public.ai_document_embeddings is
  'Embedding lifecycle registry only. Vector payload/search is deferred until Stage 5 chooses a fixed model and dimension.';
comment on table public.ai_rate_limit_windows is
  'Durable rate-limit state reserved for server-side integration; no browser privileges.';

alter table public.vetbot_audit_logs add column if not exists request_id uuid;
alter table public.vetbot_audit_logs add column if not exists prompt_version text;
alter table public.vetbot_audit_logs add column if not exists schema_version text;
alter table public.vetbot_audit_logs add column if not exists latency_ms integer;
alter table public.vetbot_audit_logs add column if not exists input_tokens integer;
alter table public.vetbot_audit_logs add column if not exists output_tokens integer;

do $$
begin
  if not exists (select 1 from pg_constraint where conname = 'vetbot_audit_latency_nonnegative') then
    alter table public.vetbot_audit_logs
      add constraint vetbot_audit_latency_nonnegative check (latency_ms is null or latency_ms >= 0);
  end if;
  if not exists (select 1 from pg_constraint where conname = 'vetbot_audit_input_tokens_nonnegative') then
    alter table public.vetbot_audit_logs
      add constraint vetbot_audit_input_tokens_nonnegative check (input_tokens is null or input_tokens >= 0);
  end if;
  if not exists (select 1 from pg_constraint where conname = 'vetbot_audit_output_tokens_nonnegative') then
    alter table public.vetbot_audit_logs
      add constraint vetbot_audit_output_tokens_nonnegative check (output_tokens is null or output_tokens >= 0);
  end if;
end $$;

create index if not exists vetbot_audit_clinic_created_idx
  on public.vetbot_audit_logs (clinic_id, created_at desc);

comment on table public.ai_audit_events is
  'Generic metadata-only AI audit. Prompts, responses, medical text, transcripts and signed URLs are prohibited.';
