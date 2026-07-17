-- Production-safe Stage 4 rollback. This stops every new Stage 4 operation
-- immediately while preserving protected records for legal/clinical handling.
update public.ai_feature_flags
set enabled = false, kill_switch = true, updated_at = now()
where capability in (
  'digitalcare_transcription', 'digitalcare_recording', 'digitalcare_summary'
);

revoke all on function public.myvet_begin_digitalcare_capture(uuid,bigint,bigint,text,boolean,boolean,boolean,text,text,bigint) from service_role;
revoke all on function public.myvet_complete_digitalcare_transcript(uuid,bigint,text,text,uuid,text,text,integer,integer,integer) from service_role;
revoke all on function public.myvet_ensure_digitalcare_visit(uuid,bigint) from service_role;
revoke all on function public.myvet_link_digitalcare_summary_source(uuid,bigint,uuid) from service_role;
revoke all on function public.myvet_mark_digitalcare_failure(uuid,bigint,text,text) from service_role;

