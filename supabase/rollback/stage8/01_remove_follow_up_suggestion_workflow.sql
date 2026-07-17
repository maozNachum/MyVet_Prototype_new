-- Non-destructive Stage 8 rollback. Disable the flags first.
revoke all on function public.myvet_transition_follow_up_suggestion(uuid,text,jsonb,text,boolean) from public,anon,authenticated,service_role;
revoke all on function public.myvet_create_follow_up_suggestion_draft(uuid,text,text,jsonb,uuid,text,text,text,integer,integer,integer,boolean) from public,anon,authenticated,service_role;
drop function if exists public.myvet_transition_follow_up_suggestion(uuid,text,jsonb,text,boolean);
drop function if exists public.myvet_create_follow_up_suggestion_draft(uuid,text,text,jsonb,uuid,text,text,text,integer,integer,integer,boolean);
drop index if exists public.reminders_source_duplicate_lookup_idx;
drop policy if exists reminders_follow_up_owner_select on public.reminders;
drop policy if exists reminders_follow_up_staff_select on public.reminders;
-- Existing reminders and suggestion artifacts are intentionally retained.
