-- Structural rollback. Run only after 01_disable_medical_record_rag.sql and
-- only when Stage 5 has no indexed content. This script refuses data loss.
do $$
begin
  if exists (select 1 from public.ai_document_chunks where source_type is not null) then
    raise exception 'STAGE5_ROLLBACK_BLOCKED_INDEXED_DATA_EXISTS';
  end if;
end $$;

drop trigger if exists myvet_rag_invalidate_medical_visit on public.medical_visits;
drop trigger if exists myvet_rag_invalidate_vaccination on public.vaccinations;
drop trigger if exists myvet_rag_invalidate_lab on public.lab_orders;
drop trigger if exists myvet_rag_invalidate_document on public.documents;
drop trigger if exists myvet_rag_invalidate_artifact on public.ai_artifacts;

drop function if exists public.myvet_rag_status(uuid,bigint);
drop function if exists public.myvet_rag_collect_sources(uuid,bigint);
drop function if exists public.myvet_replace_rag_source(uuid,bigint,text,text,text,text,text,text,jsonb);
drop function if exists public.myvet_rag_search(uuid,bigint,extensions.vector,text,text,text,real,integer);
drop function if exists public.myvet_record_rag_event(uuid,bigint,uuid,text,text,text,text,text,integer,integer,integer,text);
drop function if exists private.myvet_invalidate_rag_source();
drop function if exists private.myvet_invalidate_rag_artifact();

drop index if exists public.ai_document_embeddings_hnsw_idx;
drop index if exists public.ai_document_embeddings_rag_filter_idx;
drop index if exists public.ai_document_chunks_rag_scope_idx;
drop index if exists public.ai_document_chunks_active_source_idx;

alter table public.ai_document_embeddings
  drop constraint if exists ai_document_embeddings_ready_check,
  drop constraint if exists ai_document_embeddings_version_check,
  drop constraint if exists ai_document_embeddings_status_check,
  drop column if exists embedding,
  drop column if exists embedding_version;
alter table public.ai_document_embeddings add constraint ai_document_embeddings_status_check
  check (status in ('pending', 'failed', 'superseded'));

alter table public.ai_document_chunks
  drop constraint if exists ai_document_chunks_client_release_check,
  drop constraint if exists ai_document_chunks_rag_scope_check,
  drop constraint if exists ai_document_chunks_source_title_check,
  drop constraint if exists ai_document_chunks_source_identity_check,
  drop constraint if exists ai_document_chunks_source_type_check,
  drop constraint if exists ai_document_chunks_pet_fkey,
  drop constraint if exists ai_document_chunks_owner_fkey,
  drop column if exists indexed_at,
  drop column if exists release_to_client,
  drop column if exists source_title,
  drop column if exists source_date,
  drop column if exists source_record_id,
  drop column if exists source_type,
  drop column if exists pet_id,
  drop column if exists owner_id;
alter table public.ai_document_chunks alter column document_id set not null;

delete from public.ai_feature_flags where capability = 'rag_index';

alter table public.ai_operations drop constraint if exists ai_operations_capability_check;
alter table public.ai_operations add constraint ai_operations_capability_check check (capability in (
  'vetbot', 'visit_summary', 'digitalcare_transcription', 'digitalcare_recording',
  'digitalcare_summary', 'record_qa', 'document_ocr', 'client_explanation',
  'reminder_suggestion'
));
alter table public.ai_feature_flags drop constraint if exists ai_feature_flags_capability_check;
alter table public.ai_feature_flags add constraint ai_feature_flags_capability_check check (capability in (
  'vetbot', 'vetbot_actions', 'appointment_actions', 'visit_summary',
  'digitalcare_transcription', 'digitalcare_recording', 'digitalcare_summary',
  'record_qa', 'document_ocr', 'client_explanation', 'reminder_suggestion'
));
alter table public.ai_audit_events drop constraint if exists ai_audit_events_event_type_check;
alter table public.ai_audit_events add constraint ai_audit_events_event_type_check check (event_type in (
  'request_received', 'provider_completed', 'provider_failed', 'output_rejected',
  'draft_created', 'approval_recorded', 'release_recorded', 'access_denied',
  'rate_limited', 'feature_disabled', 'consent_recorded', 'capture_started',
  'capture_stopped', 'transcript_created', 'file_accessed', 'retention_deleted'
));

grant select on table public.ai_document_chunks to authenticated;
drop policy if exists ai_chunks_clinical_select on public.ai_document_chunks;
create policy ai_chunks_clinical_select on public.ai_document_chunks for select to authenticated
using ((select private.myvet_is_clinic_staff(clinic_id, array['clinic_admin','vet']::text[])));
