-- Immediate, non-destructive Stage 5 rollback.
update public.ai_feature_flags
set enabled = false, kill_switch = true, updated_at = now()
where capability in ('rag_index', 'record_qa');

-- Environment kill switches must also be set to false:
-- AI_RAG_INDEX_ENABLED=false
-- AI_RAG_QA_ENABLED=false
