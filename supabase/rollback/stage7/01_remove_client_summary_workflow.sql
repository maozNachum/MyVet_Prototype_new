-- Non-destructive Stage 7 rollback. Disable flags first. Existing artifacts remain retained.
revoke all on function public.myvet_transition_client_summary(uuid,text,jsonb,text) from public,anon,authenticated;
revoke all on function public.myvet_create_client_summary_draft(uuid,uuid,jsonb,uuid,text,text,text,integer,integer,integer,boolean) from public,anon,authenticated,service_role;
drop function if exists public.myvet_transition_client_summary(uuid,text,jsonb,text);
drop function if exists public.myvet_create_client_summary_draft(uuid,uuid,jsonb,uuid,text,text,text,integer,integer,integer,boolean);
-- Private validators and the ai_artifact source type are intentionally retained
-- so rollback never invalidates or deletes historical medical artifacts.
