-- Safe Stage 9 rollback/quarantine. Keep the fail-closed seeding and deletion
-- protection in place; disable capabilities without deleting medical data,
-- artifacts, reminders, chunks or embeddings.
update public.ai_feature_flags
set enabled = false,
    kill_switch = false,
    updated_at = now()
where capability in (
  'visit_summary','digitalcare_transcription','digitalcare_recording','digitalcare_summary',
  'rag_index','record_qa','document_ocr','client_explanation','reminder_suggestion'
);
