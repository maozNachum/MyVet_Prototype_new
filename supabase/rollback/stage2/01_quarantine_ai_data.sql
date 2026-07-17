-- Safe Stage 2 rollback: quarantine future AI structures without weakening
-- tenant isolation or restoring anonymous prototype policies.
begin;

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
    if to_regclass(format('public.%I', target_table)) is not null then
      execute format('revoke all privileges on table public.%I from anon, authenticated', target_table);
    end if;
  end loop;
end $$;

update public.ai_feature_flags
set enabled = false,
    kill_switch = true,
    updated_at = now()
where enabled or not kill_switch;

commit;

