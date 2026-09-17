-- Read-only catalog audit. Run only on the explicitly selected Local/Preview target.
-- This is a drift check, not proof of authorization behavior or a Production approval.
do $audit$
declare failures jsonb;
begin
with expected(signature, service_execute) as (
  values
    ('private.myvet_current_clinic_id()', true),
    ('private.myvet_is_clinic_staff(uuid, text[])', true),
    ('private.myvet_owner_owns_pet(uuid, bigint)', true),
    ('private.myvet_user_has_clinic_access(uuid)', true),
    ('public.claim_owner_profile()', true),
    ('public.myvet_accept_clinic_invitation(text, text, text, text, text)', false),
    ('public.myvet_available_slots(date, date)', true),
    ('public.myvet_booked_slots(timestamp with time zone, timestamp with time zone)', true),
    ('public.myvet_conversation_owned(text)', true),
    ('public.myvet_create_clinic(text, text)', false),
    ('public.myvet_create_clinic_invitation(uuid, text, text, text, text, timestamp with time zone)', false),
    ('public.myvet_current_owner_id()', true),
    ('public.myvet_delete_patient(bigint)', true),
    ('public.myvet_execute_vetbot_action_v2(uuid)', true),
    ('public.myvet_execute_vetbot_inventory_create(uuid)', true),
    ('public.myvet_is_active_staff()', true),
    ('public.myvet_manage_privacy_request(uuid, text, text)', true),
    ('public.myvet_owner_book_appointment(bigint, timestamp with time zone, timestamp with time zone, text, text, text)', true),
    ('public.myvet_owner_cancel_appointment(bigint)', false),
    ('public.myvet_owner_matches(text)', true),
    ('public.myvet_owner_reschedule_appointment(bigint, timestamp with time zone, timestamp with time zone)', false),
    ('public.myvet_owner_settle_demo_payment(bigint)', true),
    ('public.myvet_pet_owned(text)', true),
    ('public.myvet_revoke_clinic_invitation(uuid)', false),
    ('public.myvet_save_medical_entry(uuid, jsonb)', false),
    ('public.myvet_set_active_clinic(uuid)', false),
    ('public.myvet_slot_is_bookable(timestamp with time zone, timestamp with time zone, bigint)', true),
    ('public.myvet_staff_book_appointment(bigint, timestamp with time zone, timestamp with time zone, text, text, text, text, text, text, text)', false),
    ('public.myvet_staff_cancel_appointment(bigint)', false),
    ('public.myvet_staff_reschedule_appointment(bigint, timestamp with time zone, timestamp with time zone)', false),
    ('public.myvet_staff_settle_payment(bigint, text, numeric)', true),
    ('public.myvet_staff_update_appointment(bigint, timestamp with time zone, timestamp with time zone, text, text, text, text, text, text, text)', false),
    ('public.myvet_submit_privacy_request(text, text)', true),
    ('public.myvet_transition_client_summary(uuid, text, jsonb, text)', true),
    ('public.myvet_transition_follow_up_suggestion(uuid, text, jsonb, text, boolean)', true),
    ('public.myvet_transition_visit_summary(uuid, text, jsonb, text)', true)
), actual as (
  select p.oid, n.nspname || '.' || p.proname || '(' || oidvectortypes(p.proargtypes) || ')' as signature,
    p.proconfig, has_function_privilege('authenticated',p.oid,'execute') as authenticated_execute,
    has_function_privilege('anon',p.oid,'execute') as anonymous_execute,
    has_function_privilege('service_role',p.oid,'execute') as service_execute
  from pg_proc p join pg_namespace n on n.oid=p.pronamespace
  where n.nspname in ('public','private','myvet_private') and p.prosecdef
), findings as (
  select coalesce(e.signature,a.signature) as signature,
    case when a.anonymous_execute then 'ANONYMOUS_GRANT'
      when e.signature is null then 'UNEXPECTED_AUTHENTICATED_GRANT'
      when a.signature is null then 'MISSING_FUNCTION'
      when not a.authenticated_execute then 'MISSING_AUTHENTICATED_GRANT'
      when a.anonymous_execute then 'ANONYMOUS_GRANT'
      when a.service_execute is distinct from e.service_execute then 'SERVICE_GRANT_DRIFT'
      when not coalesce(a.proconfig @> array['search_path=""'],false) then 'SEARCH_PATH_DRIFT'
      else 'PASS' end as result
  from expected e full join (select * from actual where authenticated_execute or anonymous_execute or signature in (select signature from expected)) a using(signature)
)
select jsonb_agg(jsonb_build_object('signature',signature,'result',result) order by signature)
into failures from findings where result <> 'PASS';
if failures is not null then
  raise exception 'DEFINER_GRANTS_AUDIT_FAILED: %', failures;
end if;
raise notice 'DEFINER_GRANTS_AUDIT_PASS: 36 expected signatures; no unexpected authenticated or anonymous definer grants';
end;
$audit$;
