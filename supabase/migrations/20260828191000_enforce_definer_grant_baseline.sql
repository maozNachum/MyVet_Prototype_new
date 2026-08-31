-- Normalize SECURITY DEFINER privileges after a clean-room or logical restore.
-- PostgreSQL grants EXECUTE to PUBLIC by default, so start closed and restore
-- only the repository's verified role allowlist.
do $$
declare
  function_row record;
  expected_name text;
  auth_and_service text[] := array[
    'claim_owner_profile',
    'myvet_available_slots',
    'myvet_booked_slots',
    'myvet_conversation_owned',
    'myvet_current_owner_id',
    'myvet_delete_patient',
    'myvet_execute_vetbot_action_v2',
    'myvet_execute_vetbot_inventory_create',
    'myvet_is_active_staff',
    'myvet_owner_book_appointment',
    'myvet_owner_matches',
    'myvet_owner_settle_demo_payment',
    'myvet_pet_owned',
    'myvet_slot_is_bookable',
    'myvet_staff_settle_payment',
    'myvet_transition_client_summary',
    'myvet_transition_follow_up_suggestion',
    'myvet_transition_visit_summary'
  ];
  auth_only text[] := array[
    'myvet_owner_cancel_appointment',
    'myvet_owner_reschedule_appointment',
    'myvet_save_medical_entry',
    'myvet_staff_book_appointment',
    'myvet_staff_cancel_appointment',
    'myvet_staff_reschedule_appointment',
    'myvet_staff_update_appointment'
  ];
  service_only text[] := array[
    'myvet_begin_digitalcare_capture',
    'myvet_complete_digitalcare_transcript',
    'myvet_create_client_summary_draft',
    'myvet_create_follow_up_suggestion_draft',
    'myvet_create_visit_summary_draft',
    'myvet_ensure_digitalcare_visit',
    'myvet_link_digitalcare_summary_source',
    'myvet_mark_digitalcare_failure',
    'myvet_rag_collect_sources',
    'myvet_rag_search',
    'myvet_rag_status',
    'myvet_record_rag_event',
    'myvet_record_visit_summary_failure',
    'myvet_replace_rag_source'
  ];
  private_auth_and_service text[] := array[
    'myvet_current_clinic_id',
    'myvet_is_clinic_staff',
    'myvet_owner_owns_pet',
    'myvet_user_has_clinic_access'
  ];
begin
  for function_row in
    select p.oid::regprocedure as function_identity
    from pg_proc p
    join pg_namespace n on n.oid = p.pronamespace
    where n.nspname in ('public', 'private', 'myvet_private')
      and p.prosecdef
  loop
    execute format(
      'revoke all on function %s from public, anon, authenticated, service_role',
      function_row.function_identity
    );
  end loop;

  foreach expected_name in array auth_and_service || auth_only || service_only
  loop
    if not exists (
      select 1
      from pg_proc p
      join pg_namespace n on n.oid = p.pronamespace
      where n.nspname = 'public'
        and p.proname = expected_name
        and p.prosecdef
    ) then
      raise exception 'Missing allowlisted public function: %', expected_name;
    end if;
  end loop;

  foreach expected_name in array private_auth_and_service
  loop
    if not exists (
      select 1
      from pg_proc p
      join pg_namespace n on n.oid = p.pronamespace
      where n.nspname = 'private'
        and p.proname = expected_name
        and p.prosecdef
    ) then
      raise exception 'Missing allowlisted private function: %', expected_name;
    end if;
  end loop;

  for function_row in
    select p.oid::regprocedure as function_identity
    from pg_proc p
    join pg_namespace n on n.oid = p.pronamespace
    where n.nspname = 'public'
      and p.proname = any(auth_and_service)
  loop
    execute format(
      'grant execute on function %s to authenticated, service_role',
      function_row.function_identity
    );
  end loop;

  for function_row in
    select p.oid::regprocedure as function_identity
    from pg_proc p
    join pg_namespace n on n.oid = p.pronamespace
    where n.nspname = 'public'
      and p.proname = any(auth_only)
  loop
    execute format(
      'grant execute on function %s to authenticated',
      function_row.function_identity
    );
  end loop;

  for function_row in
    select p.oid::regprocedure as function_identity
    from pg_proc p
    join pg_namespace n on n.oid = p.pronamespace
    where n.nspname = 'public'
      and p.proname = any(service_only)
  loop
    execute format(
      'grant execute on function %s to service_role',
      function_row.function_identity
    );
  end loop;

  for function_row in
    select p.oid::regprocedure as function_identity
    from pg_proc p
    join pg_namespace n on n.oid = p.pronamespace
    where n.nspname = 'private'
      and p.proname = any(private_auth_and_service)
  loop
    execute format(
      'grant execute on function %s to authenticated, service_role',
      function_row.function_identity
    );
  end loop;
end;
$$;
