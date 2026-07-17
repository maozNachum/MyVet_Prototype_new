-- Stage 3 rollback: disable generation first, then remove only Stage 3 RPCs.
-- Existing protected artifacts and approval history are retained.
begin;

update public.ai_feature_flags
set enabled = false, kill_switch = true, updated_at = now()
where capability = 'visit_summary' and (enabled or not kill_switch);

revoke all on function public.myvet_transition_visit_summary(uuid,text,jsonb,text) from public, anon, authenticated, service_role;
revoke all on function public.myvet_create_visit_summary_draft(uuid,bigint,jsonb,uuid,text,text,text,integer,integer,integer) from public, anon, authenticated, service_role;
revoke all on function public.myvet_record_visit_summary_failure(uuid,bigint,uuid,text,text,text,text,integer) from public, anon, authenticated, service_role;

drop function public.myvet_transition_visit_summary(uuid,text,jsonb,text);
drop function public.myvet_create_visit_summary_draft(uuid,bigint,jsonb,uuid,text,text,text,integer,integer,integer);
drop function public.myvet_record_visit_summary_failure(uuid,bigint,uuid,text,text,text,text,integer);
drop function private.myvet_is_valid_visit_summary(jsonb);

commit;
