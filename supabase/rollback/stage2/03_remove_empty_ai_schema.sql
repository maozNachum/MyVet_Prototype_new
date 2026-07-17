-- Optional pre-production/Preview rollback only. It refuses to run if Stage 2
-- contains business data. Tenant/RLS hardening is deliberately retained.
begin;

do $$
begin
  if exists (select 1 from public.ai_operations limit 1)
    or exists (select 1 from public.ai_audit_events limit 1)
    or exists (select 1 from public.ai_documents limit 1)
    or exists (select 1 from public.ai_document_chunks limit 1)
    or exists (select 1 from public.ai_document_embeddings limit 1)
    or exists (select 1 from public.ai_artifacts limit 1)
    or exists (select 1 from public.ai_sources limit 1)
    or exists (select 1 from public.ai_approval_history limit 1)
    or exists (select 1 from public.ai_consent_records limit 1)
    or exists (select 1 from public.ai_feature_flags limit 1)
    or exists (select 1 from public.ai_rate_limit_windows limit 1) then
    raise exception 'AI_SCHEMA_NOT_EMPTY';
  end if;

  if exists (
    select 1
    from public.vetbot_audit_logs
    where request_id is not null
       or prompt_version is not null
       or schema_version is not null
       or latency_ms is not null
       or input_tokens is not null
       or output_tokens is not null
  ) then
    raise exception 'VETBOT_STAGE2_AUDIT_METADATA_NOT_EMPTY';
  end if;
end $$;

drop table public.ai_sources;
drop table public.ai_approval_history;
drop table public.ai_document_embeddings;
drop table public.ai_document_chunks;
drop table public.ai_artifacts;
drop table public.ai_documents;
drop table public.ai_audit_events;
drop table public.ai_rate_limit_windows;
drop table public.ai_consent_records;
drop table public.ai_feature_flags;
drop table public.ai_operations;

drop function if exists private.myvet_validate_ai_source();
drop function if exists private.myvet_validate_ai_approval();
drop function if exists private.myvet_validate_ai_scope();
drop function if exists private.myvet_validate_approval_event();
drop function if exists private.myvet_prevent_history_mutation();

drop index if exists public.vetbot_audit_clinic_created_idx;
alter table public.vetbot_audit_logs
  drop constraint if exists vetbot_audit_latency_nonnegative,
  drop constraint if exists vetbot_audit_input_tokens_nonnegative,
  drop constraint if exists vetbot_audit_output_tokens_nonnegative,
  drop column if exists request_id,
  drop column if exists prompt_version,
  drop column if exists schema_version,
  drop column if exists latency_ms,
  drop column if exists input_tokens,
  drop column if exists output_tokens;

commit;
